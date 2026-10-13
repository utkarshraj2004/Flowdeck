import type { FastifyInstance } from 'fastify';
import { auth, type Ctx } from '../context.js';
import { many, one } from '../db.js';
import { invalid } from '../lib/errors.js';
import { isUuid } from '../lib/validate.js';

export async function notificationRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/notifications', async (req) => {
    const u = auth(req);
    const unreadOnly = (req.query as any).unread === 'true';
    const rows = await many(
      ctx.db,
      `SELECT n.*, a.username, a.full_name, a.initials, b.short_id AS board_short_id, b.name AS board_name, c.number AS card_number
         FROM notifications n LEFT JOIN users a ON a.id = n.actor_id LEFT JOIN boards b ON b.id = n.board_id LEFT JOIN cards c ON c.id = n.card_id
        WHERE n.user_id = $1 AND ($2 = false OR n.read_at IS NULL) ORDER BY n.created_at DESC LIMIT 100`,
      [u.id, unreadOnly],
    );
    const unread = await one(ctx.db, 'SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [u.id]);
    return {
      unread: unread.n,
      items: rows.map((n) => ({
        id: n.id,
        kind: n.kind,
        data: n.data,
        readAt: n.read_at,
        createdAt: n.created_at,
        boardId: n.board_id,
        cardId: n.card_id,
        board: n.board_id ? { shortId: n.board_short_id, name: n.board_name } : null,
        cardNumber: n.card_number,
        actor: n.actor_id ? { id: n.actor_id, username: n.username, fullName: n.full_name, initials: n.initials } : null,
      })),
    };
  });

  app.post('/notifications/read', async (req) => {
    const u = auth(req);
    const b = (req.body ?? {}) as { ids?: string[]; all?: boolean; read?: boolean; cardId?: string };
    const read = b.read !== false;
    let touched: { card_id: string | null }[] = [];
    if (b.all)
      touched = await many(ctx.db, `UPDATE notifications SET read_at = ${read ? 'now()' : 'NULL'} WHERE user_id = $1 AND read_at IS ${read ? '' : 'NOT '}NULL RETURNING card_id`, [u.id]);
    else if (typeof b.cardId === 'string') {
      // Opening a card marks its notifications read (clears the card's unread marker).
      if (!isUuid(b.cardId)) throw invalid('cardId must be a card id');
      touched = await many(ctx.db, 'UPDATE notifications SET read_at = now() WHERE user_id = $1 AND card_id = $2 AND read_at IS NULL RETURNING card_id', [u.id, b.cardId]);
    } else if (Array.isArray(b.ids))
      touched = await many(ctx.db, `UPDATE notifications SET read_at = ${read ? 'COALESCE(read_at, now())' : 'NULL'} WHERE user_id = $1 AND id = ANY($2::uuid[]) RETURNING card_id`, [
        u.id,
        b.ids.filter((x) => isUuid(x)).slice(0, 500),
      ]);
    else throw invalid('Pass ids, cardId or all');
    const unread = await one(ctx.db, 'SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL', [u.id]);
    // Tell every open tab which cards changed state, so unread markers stay in sync.
    const cardIds = [...new Set(touched.map((t) => t.card_id).filter((x): x is string => !!x))];
    const still = cardIds.length
      ? new Set((await many(ctx.db, 'SELECT DISTINCT card_id FROM notifications WHERE user_id = $1 AND card_id = ANY($2::uuid[]) AND read_at IS NULL', [u.id, cardIds])).map((r) => r.card_id))
      : new Set<string>();
    const cards = Object.fromEntries(cardIds.map((id) => [id, still.has(id)]));
    ctx.hub.sendToUser(u.id, { type: 'notifications.unread', unread: unread.n, cards, all: !!b.all && read });
    return { unread: unread.n, cards };
  });
}
