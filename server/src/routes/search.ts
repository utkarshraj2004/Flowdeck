import type { FastifyInstance } from 'fastify';
import { auth, type Ctx } from '../context.js';
import { many } from '../db.js';
import { parseQuery, termsToSql } from '../lib/search.js';
import { boardJson, cardFrontJson } from '../lib/serialize.js';
import { VISIBLE_BOARDS_SQL } from './auth.js';

export async function searchRoutes(app: FastifyInstance, ctx: Ctx) {
  app.get('/search', async (req) => {
    const u = auth(req);
    const q = String((req.query as any).q ?? '').slice(0, 500);
    const limit = Math.min(100, Math.max(1, Number.parseInt((req.query as any).limit ?? '50', 10) || 50));
    const terms = parseQuery(q);
    if (!terms.length) return { cards: [], boards: [], query: q };
    const params: unknown[] = [u.id];
    const { where, includeArchived } = termsToSql(terms, params, u.id);
    if (!includeArchived) where.push('c.archived_at IS NULL AND l.archived_at IS NULL');
    // Only boards this user can see (same rule as permissions.boardAccess).
    const rows = await many(
      ctx.db,
      `WITH vis AS (${VISIBLE_BOARDS_SQL})
       SELECT c.*, (c.description <> '') AS has_description, l.name AS list_name, b.name AS board_name, b.short_id AS board_short_id, b.background,
              COALESCE((SELECT array_agg(label_id) FROM card_labels WHERE card_id = c.id), '{}') AS label_ids,
              COALESCE((SELECT array_agg(user_id) FROM card_members WHERE card_id = c.id), '{}') AS member_ids,
              (SELECT count(*) FROM comments WHERE card_id = c.id)::int AS comment_count,
              (SELECT count(*) FROM attachments WHERE card_id = c.id)::int AS attachment_count,
              0 AS check_total, 0 AS check_done
         FROM cards c JOIN lists l ON l.id = c.list_id JOIN vis b ON b.id = c.board_id
        WHERE ${where.length ? where.join(' AND ') : 'true'}
        ORDER BY c.updated_at DESC LIMIT ${limit}`,
      params,
    );
    const text = terms.filter((t) => t.kind === 'text' && !t.negate).map((t) => t.value.toLowerCase());
    const boards = text.length
      ? await many(ctx.db, `${VISIBLE_BOARDS_SQL} AND b.closed_at IS NULL AND b.name ILIKE $2 ORDER BY b.name LIMIT 10`, [u.id, `%${text.join(' ')}%`])
      : [];
    return {
      query: q,
      terms,
      cards: rows.map((r) => ({ ...cardFrontJson(r), listName: r.list_name, board: { id: r.board_id, shortId: r.board_short_id, name: r.board_name, background: r.background } })),
      boards: boards.map((b) => boardJson(b)),
    };
  });
}
