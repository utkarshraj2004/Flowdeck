import type { FastifyInstance } from 'fastify';
import type { Ctx } from '../context.js';
import { eventsSince } from '../lib/boards.js';
import { boardAccess } from '../lib/permissions.js';
import { isUuid } from '../lib/validate.js';

/**
 * WebSocket endpoint (research 06 "Real-time contract"). Authenticated by the
 * session cookie; access is checked on subscribe and re-checked by the hub
 * whenever membership, roles or visibility change.
 */
export async function wsRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/ws', { websocket: true }, (socket, req) => {
    const origin = req.headers.origin;
    const host = req.headers.host;
    if (!req.user || (origin && host && new URL(origin).host !== host && origin !== ctx.config.baseUrl)) {
      socket.send(JSON.stringify({ type: 'error', code: req.user ? 'bad_origin' : 'unauthenticated' }));
      socket.close(4401, 'unauthenticated');
      return;
    }
    const user = req.user;
    const send = (msg: unknown) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(msg));
    };
    const client = ctx.hub.newClient(user.id, send, () => socket.close(1001, 'server shutting down'));
    let alive = true;
    socket.on('pong', () => (alive = true));
    const ping = setInterval(() => {
      if (!alive) return socket.terminate();
      alive = false;
      socket.ping();
    }, 25_000);

    socket.on('message', async (raw) => {
      let msg: any;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return send({ type: 'error', code: 'bad_message' });
      }
      try {
        if (msg.type === 'ping') return send({ type: 'pong' });
        if (msg.type === 'subscribe' && isUuid(msg.board)) {
          const access = await boardAccess(ctx.db, user.id, msg.board);
          if (!access) return send({ type: 'board.access_revoked', board: msg.board });
          // Subscribe first, then replay: the client orders and de-duplicates by seq.
          ctx.hub.subscribe(client, msg.board, access.role);
          const last = Number(access.board.last_seq);
          let replayed = 0;
          if (Number.isInteger(msg.sinceSeq) && msg.sinceSeq < last) {
            const r = await eventsSince(ctx.db, msg.board, msg.sinceSeq, last);
            if (r.resync) return send({ type: 'resync_required', board: msg.board, reason: 'gap_too_large' });
            for (const e of r.events) send(e);
            replayed = r.events.length;
          }
          return send({ type: 'subscribed', board: msg.board, seq: last, replayed, role: access.role, users: ctx.hub.presence(msg.board) });
        }
        if (msg.type === 'unsubscribe' && isUuid(msg.board)) return ctx.hub.unsubscribe(client, msg.board);
        if (msg.type === 'editing' && isUuid(msg.board) && isUuid(msg.cardId) && ['description', 'name'].includes(msg.field)) {
          if (!client.boards.has(msg.board)) return;
          ctx.hub.setEditing(msg.board, msg.cardId, msg.field, user.id, user.full_name, !!msg.active);
          return;
        }
        send({ type: 'error', code: 'unknown_message' });
      } catch (err) {
        req.log.error(err);
        send({ type: 'error', code: 'internal' });
      }
    });

    socket.on('close', () => {
      clearInterval(ping);
      ctx.hub.removeClient(client);
    });
  });
}
