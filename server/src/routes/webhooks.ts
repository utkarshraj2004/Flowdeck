import type { FastifyInstance } from 'fastify';
import { auth, type Ctx } from '../context.js';
import { many, one } from '../db.js';
import { invalid, notFound } from '../lib/errors.js';
import { requireBoard } from '../lib/permissions.js';
import { randomToken } from '../lib/security.js';
import { validateWebhookUrl } from '../lib/webhooks.js';
import * as v from '../lib/validate.js';
import { resolveBoardId } from './boards.js';

const MAX_WEBHOOKS_PER_BOARD = 10;

const webhookJson = (w: any, secret?: string) => ({
  id: w.id,
  boardId: w.board_id,
  url: w.url,
  events: w.events ?? [],
  enabled: w.enabled,
  createdAt: w.created_at,
  // The signing secret is only returned when it is created or rotated.
  ...(secret ? { secret } : {}),
  stats:
    w.pending !== undefined
      ? {
          pending: Number(w.pending),
          failed: Number(w.failed),
          lastDeliveredAt: w.last_delivered_at,
        }
      : undefined,
});

const deliveryJson = (d: any) => ({
  id: String(d.id),
  event: d.event,
  seq: d.seq === null ? null : Number(d.seq),
  status: d.status,
  attempts: d.attempts,
  nextAttemptAt: d.status === 'pending' ? d.next_attempt_at : null,
  lastStatus: d.last_status,
  lastError: d.last_error,
  createdAt: d.created_at,
  deliveredAt: d.delivered_at,
});

function parseEvents(raw: unknown): string[] | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw) || raw.length > 50 || raw.some((e) => typeof e !== 'string' || !/^[a-z_]+\.[a-z_]+$/.test(e)))
    throw invalid('events must be a list of event names such as card.created');
  return raw.length ? [...new Set(raw as string[])] : null;
}

/** Outgoing webhooks: board admins only (they can send board data to another system). */
export async function webhookRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  async function loadHook(userId: string, hookId: string) {
    if (!v.isUuid(hookId)) throw notFound('Webhook not found');
    const hook = await one(db, 'SELECT * FROM webhooks WHERE id = $1', [hookId]);
    if (!hook) throw notFound('Webhook not found');
    await requireBoard(db, userId, hook.board_id, 'admin');
    return hook;
  }

  app.get('/boards/:id/webhooks', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    await requireBoard(db, u.id, boardId, 'admin');
    const rows = await many(
      db,
      `SELECT w.*,
              (SELECT count(*) FROM webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'pending') AS pending,
              (SELECT count(*) FROM webhook_deliveries d WHERE d.webhook_id = w.id AND d.status = 'failed') AS failed,
              (SELECT max(delivered_at) FROM webhook_deliveries d WHERE d.webhook_id = w.id) AS last_delivered_at
         FROM webhooks w WHERE w.board_id = $1 ORDER BY w.created_at`,
      [boardId],
    );
    return {
      webhooks: rows.map((w) => webhookJson(w)),
      allowPrivate: ctx.config.webhookAllowPrivate,
    };
  });

  app.post('/boards/:id/webhooks', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    await requireBoard(db, u.id, boardId, 'admin');
    const b = v.body(req.body);
    const url = validateWebhookUrl(b.url);
    const events = parseEvents(b.events);
    const count = await one(db, 'SELECT count(*)::int AS n FROM webhooks WHERE board_id = $1', [boardId]);
    if (count.n >= MAX_WEBHOOKS_PER_BOARD) throw invalid(`A board can have at most ${MAX_WEBHOOKS_PER_BOARD} webhooks`, { code: 'limit_exceeded' });
    const secret = randomToken(32);
    const row = await one(db, 'INSERT INTO webhooks (board_id, url, secret, events, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *', [boardId, url, secret, events, u.id]);
    return { webhook: webhookJson(row, secret) };
  });

  app.patch('/webhooks/:hookId', async (req) => {
    const u = auth(req);
    const hook = await loadHook(u.id, (req.params as any).hookId);
    const b = v.body(req.body);
    const url = 'url' in b ? validateWebhookUrl(b.url) : hook.url;
    const events = 'events' in b ? parseEvents(b.events) : hook.events;
    const enabled = 'enabled' in b ? v.bool(b, 'enabled')! : hook.enabled;
    const secret = b.rotateSecret === true ? randomToken(32) : null;
    const row = await one(db, 'UPDATE webhooks SET url = $2, events = $3, enabled = $4, secret = COALESCE($5, secret), updated_at = now() WHERE id = $1 RETURNING *', [
      hook.id,
      url,
      events,
      enabled,
      secret,
    ]);
    return { webhook: webhookJson(row, secret ?? undefined) };
  });

  app.delete('/webhooks/:hookId', async (req) => {
    const u = auth(req);
    const hook = await loadHook(u.id, (req.params as any).hookId);
    await db.query('DELETE FROM webhooks WHERE id = $1', [hook.id]);
    return { ok: true };
  });

  app.get('/webhooks/:hookId/deliveries', async (req) => {
    const u = auth(req);
    const hook = await loadHook(u.id, (req.params as any).hookId);
    const rows = await many(db, 'SELECT * FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY id DESC LIMIT 50', [hook.id]);
    return { deliveries: rows.map(deliveryJson) };
  });

  // Send a "ping" now through the normal queue (shows up in the delivery log like any event).
  app.post('/webhooks/:hookId/ping', async (req) => {
    const u = auth(req);
    const hook = await loadHook(u.id, (req.params as any).hookId);
    const row = await one(db, `INSERT INTO webhook_deliveries (webhook_id, event, payload) VALUES ($1, 'webhook.ping', $2) RETURNING *`, [
      hook.id,
      {
        event: 'webhook.ping',
        board: { id: hook.board_id },
        seq: null,
        at: new Date().toISOString(),
        actor: { id: u.id },
        data: {},
      },
    ]);
    void ctx.worker.tick();
    return { delivery: deliveryJson(row) };
  });

  // Retry a failed delivery from the log.
  app.post('/webhooks/:hookId/deliveries/:deliveryId/retry', async (req) => {
    const u = auth(req);
    const hook = await loadHook(u.id, (req.params as any).hookId);
    const id = (req.params as any).deliveryId;
    if (!/^\d{1,18}$/.test(id)) throw notFound('Delivery not found');
    const row = await one(
      db,
      `UPDATE webhook_deliveries SET status = 'pending', attempts = 0, next_attempt_at = now() WHERE id = $1 AND webhook_id = $2 AND status = 'failed' RETURNING *`,
      [id, hook.id],
    );
    if (!row) throw notFound('Only failed deliveries can be retried');
    void ctx.worker.tick();
    return { delivery: deliveryJson(row) };
  });
}
