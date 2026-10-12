import type { FastifyInstance } from 'fastify';
import { auth, mutationId, type Ctx } from '../context.js';
import { many, one } from '../db.js';
import { conflict, invalid, notFound } from '../lib/errors.js';
import { requireBoard } from '../lib/permissions.js';
import { runMutation } from '../lib/mutation.js';
import { cardFront, cardFronts, listJson } from '../lib/serialize.js';
import { keyFor, parsePlacement } from '../lib/positions.js';
import { transferCardToBoard } from '../lib/transfer.js';
import { fileKeys, removeFiles } from '../lib/files.js';
import { LIMITS } from '../lib/constants.js';
import * as v from '../lib/validate.js';
import { resolveBoardId } from './boards.js';

export async function listRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  async function loadList(id: string) {
    if (!v.isUuid(id)) throw notFound('List not found');
    const l = await one(db, 'SELECT * FROM lists WHERE id = $1', [id]);
    if (!l) throw notFound('List not found');
    return l;
  }

  app.post('/boards/:id/lists', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    await requireBoard(db, u.id, boardId, 'edit');
    const b = v.body(req.body);
    const name = v.str(b, 'name', { min: 1, max: 200, label: 'List name' })!;
    const placement = parsePlacement(b.position ?? 'bottom');
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(boardId);
      const n = await one(m.tx, 'SELECT count(*)::int AS n FROM lists WHERE board_id = $1 AND archived_at IS NULL', [boardId]);
      if (n.n >= LIMITS.openListsPerBoard) throw invalid('This board has reached its list limit', { code: 'limit_exceeded' });
      const { position } = await keyFor(m.tx, { table: 'lists', column: 'board_id', id: boardId, openOnly: true }, placement);
      const list = await one(m.tx, 'INSERT INTO lists (board_id, name, position) VALUES ($1,$2,$3) RETURNING *', [boardId, name, position]);
      await m.emit(boardId, 'list.created', { listId: list.id, summary: { name }, data: { list: listJson(list) } });
      return listJson(list);
    });
    return { list: data, event: events[0] };
  });

  app.patch('/lists/:listId', async (req) => {
    const u = auth(req);
    const list = await loadList((req.params as any).listId);
    await requireBoard(db, u.id, list.board_id, 'edit');
    const name = v.str(v.body(req.body), 'name', { min: 1, max: 200, label: 'List name' })!;
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(list.board_id);
      const row = await one(m.tx, 'UPDATE lists SET name = $2, version = version + 1, updated_at = now() WHERE id = $1 RETURNING *', [list.id, name]);
      await m.emit(list.board_id, 'list.updated', { listId: list.id, summary: { name, from: list.name }, data: { list: listJson(row) } });
      return listJson(row);
    });
    return { list: data, event: events[0] };
  });

  // Reorder within the board, or move the list (with its cards) to another board.
  app.post('/lists/:listId/move', async (req) => {
    const u = auth(req);
    const list = await loadList((req.params as any).listId);
    await requireBoard(db, u.id, list.board_id, 'edit');
    const b = v.body(req.body);
    const targetBoardId = v.uuid(b, 'boardId', true) ?? list.board_id;
    const placement = parsePlacement(b.position ?? (b.afterId !== undefined ? { afterId: b.afterId } : 'bottom'));
    if (targetBoardId !== list.board_id) {
      const target = await requireBoard(db, u.id, targetBoardId, 'edit');
      if (target.board.closed_at) throw conflict('board_closed', 'The target board is closed.');
    }
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(list.board_id, targetBoardId);
      const cur = await one(m.tx, 'SELECT * FROM lists WHERE id = $1', [list.id]);
      if (!cur || cur.board_id !== list.board_id) throw conflict('stale', 'The list changed. Reload and try again.');
      const { position, rebalanced } = await keyFor(m.tx, { table: 'lists', column: 'board_id', id: targetBoardId, openOnly: true }, placement, list.id);
      const row = await one(m.tx, 'UPDATE lists SET board_id = $2, position = $3, version = version + 1, updated_at = now() WHERE id = $1 RETURNING *', [
        list.id,
        targetBoardId,
        position,
      ]);
      if (targetBoardId === list.board_id) {
        await m.emit(list.board_id, 'list.moved', { listId: list.id, summary: { name: row.name }, data: { list: listJson(row), rebalanced }, hidden: true });
        return listJson(row);
      }
      const cardIds = (await many(m.tx, 'SELECT id FROM cards WHERE list_id = $1', [list.id])).map((r) => r.id);
      const createdLabels = [];
      const dropped: Record<string, string[]> = {};
      for (const cid of cardIds) {
        const t = await transferCardToBoard(m, cid, list.board_id, targetBoardId);
        createdLabels.push(...t.createdLabels);
        if (t.droppedMemberIds.length) dropped[cid] = t.droppedMemberIds;
      }
      const target = await one(m.tx, 'SELECT name FROM boards WHERE id = $1', [targetBoardId]);
      const source = await one(m.tx, 'SELECT name FROM boards WHERE id = $1', [list.board_id]);
      await m.emit(list.board_id, 'list.moved_out', { listId: list.id, summary: { name: row.name, toBoard: target.name }, data: { listId: list.id } });
      const cards = await cardFronts(m.tx, 'c.list_id = $1 AND c.archived_at IS NULL', [list.id]);
      await m.emit(targetBoardId, 'list.moved_in', {
        listId: list.id,
        summary: { name: row.name, fromBoard: source.name, droppedMembers: dropped },
        data: { list: listJson(row), cards, labels: createdLabels, rebalanced },
      });
      return listJson(row);
    });
    return { list: data, event: events[events.length - 1] };
  });

  app.post('/lists/:listId/copy', async (req) => {
    const u = auth(req);
    const list = await loadList((req.params as any).listId);
    await requireBoard(db, u.id, list.board_id, 'edit');
    const name = v.str(v.body(req.body), 'name', { min: 1, max: 200, optional: true, label: 'List name' }) ?? list.name;
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(list.board_id);
      const { position } = await keyFor(m.tx, { table: 'lists', column: 'board_id', id: list.board_id, openOnly: true }, { afterId: list.id });
      const nl = await one(m.tx, 'INSERT INTO lists (board_id, name, position) VALUES ($1,$2,$3) RETURNING *', [list.board_id, name, position]);
      const cards = await many(m.tx, 'SELECT * FROM cards WHERE list_id = $1 AND archived_at IS NULL ORDER BY position', [list.id]);
      for (const c of cards) {
        const num = await one(m.tx, 'UPDATE boards SET next_card_number = next_card_number + 1 WHERE id = $1 RETURNING next_card_number - 1 AS n', [list.board_id]);
        const nc = await one(
          m.tx,
          `INSERT INTO cards (board_id, list_id, number, name, description, position, start_at, due_at, due_complete, cover, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [list.board_id, nl.id, num.n, c.name, c.description, c.position, c.start_at, c.due_at, c.due_complete, c.cover?.color ? c.cover : null, u.id],
        );
        await m.tx.query('INSERT INTO card_labels (card_id, label_id) SELECT $2, label_id FROM card_labels WHERE card_id = $1', [c.id, nc.id]);
        await m.tx.query('INSERT INTO card_members (card_id, user_id) SELECT $2, user_id FROM card_members WHERE card_id = $1', [c.id, nc.id]);
        for (const ch of await many(m.tx, 'SELECT * FROM checklists WHERE card_id = $1', [c.id])) {
          const nch = await one(m.tx, 'INSERT INTO checklists (card_id, name, position) VALUES ($1,$2,$3) RETURNING id', [nc.id, ch.name, ch.position]);
          await m.tx.query('INSERT INTO check_items (checklist_id, name, position) SELECT $2, name, position FROM check_items WHERE checklist_id = $1', [ch.id, nch.id]);
        }
      }
      const fronts = await cardFronts(m.tx, 'c.list_id = $1', [nl.id]);
      await m.emit(list.board_id, 'list.created', { listId: nl.id, summary: { name, copiedFrom: list.name }, data: { list: listJson(nl), cards: fronts } });
      return listJson(nl);
    });
    return { list: data, event: events[0] };
  });

  app.post('/lists/:listId/archive', async (req) => {
    const u = auth(req);
    const list = await loadList((req.params as any).listId);
    await requireBoard(db, u.id, list.board_id, 'edit');
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(list.board_id);
      const row = await one(m.tx, 'UPDATE lists SET archived_at = COALESCE(archived_at, now()), version = version + 1 WHERE id = $1 RETURNING *', [list.id]);
      await m.emit(list.board_id, 'list.archived', { listId: list.id, summary: { name: row.name }, data: { list: listJson(row) } });
      return listJson(row);
    });
    return { list: data, event: events[0] };
  });

  app.post('/lists/:listId/restore', async (req) => {
    const u = auth(req);
    const list = await loadList((req.params as any).listId);
    await requireBoard(db, u.id, list.board_id, 'edit');
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(list.board_id);
      const clash = await one(m.tx, 'SELECT 1 FROM lists WHERE board_id = $1 AND archived_at IS NULL AND position = $2 AND id <> $3', [list.board_id, list.position, list.id]);
      const position = clash ? (await keyFor(m.tx, { table: 'lists', column: 'board_id', id: list.board_id, openOnly: true }, 'bottom', list.id)).position : list.position;
      const row = await one(m.tx, 'UPDATE lists SET archived_at = NULL, position = $2, version = version + 1 WHERE id = $1 RETURNING *', [list.id, position]);
      const cards = await cardFronts(m.tx, 'c.list_id = $1 AND c.archived_at IS NULL', [list.id]);
      await m.emit(list.board_id, 'list.restored', { listId: list.id, summary: { name: row.name }, data: { list: listJson(row), cards } });
      return listJson(row);
    });
    return { list: data, event: events[0] };
  });

  app.delete('/lists/:listId', async (req) => {
    const u = auth(req);
    const list = await loadList((req.params as any).listId);
    await requireBoard(db, u.id, list.board_id, 'edit');
    if (!list.archived_at) throw conflict('not_archived', 'Archive the list before deleting it.');
    const keys = await fileKeys(db, 'c.list_id = $1', [list.id]);
    const { events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(list.board_id);
      const n = await one(m.tx, 'SELECT count(*)::int AS n FROM cards WHERE list_id = $1', [list.id]);
      await m.tx.query('DELETE FROM lists WHERE id = $1', [list.id]);
      await m.emit(list.board_id, 'list.deleted', { listId: list.id, summary: { name: list.name, cards: n.n }, data: { listId: list.id } });
    });
    await removeFiles(ctx.config.uploadDir, keys);
    return { ok: true, event: events[0] };
  });

  app.post('/lists/:listId/archive-all-cards', async (req) => {
    const u = auth(req);
    const list = await loadList((req.params as any).listId);
    await requireBoard(db, u.id, list.board_id, 'edit');
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(list.board_id);
      const rows = await many(m.tx, 'UPDATE cards SET archived_at = now(), version = version + 1 WHERE list_id = $1 AND archived_at IS NULL RETURNING id', [list.id]);
      await m.emit(list.board_id, 'list.cards_archived', { listId: list.id, summary: { name: list.name, count: rows.length }, data: { listId: list.id, cardIds: rows.map((r) => r.id) } });
      return rows.length;
    });
    return { archived: data, event: events[0] };
  });

  app.post('/lists/:listId/move-all-cards', async (req) => {
    const u = auth(req);
    const list = await loadList((req.params as any).listId);
    await requireBoard(db, u.id, list.board_id, 'edit');
    const targetId = v.uuid(v.body(req.body), 'listId')!;
    const target = await loadList(targetId);
    if (target.board_id !== list.board_id) throw invalid('Cards can only be moved to a list on the same board here');
    if (target.archived_at) throw conflict('list_archived', 'The target list is archived.');
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(list.board_id);
      const cards = await many(m.tx, 'SELECT id FROM cards WHERE list_id = $1 AND archived_at IS NULL ORDER BY position, id', [list.id]);
      for (const c of cards) {
        const { position } = await keyFor(m.tx, { table: 'cards', column: 'list_id', id: targetId, openOnly: true }, 'bottom', c.id);
        await m.tx.query('UPDATE cards SET list_id = $2, position = $3, version = version + 1, updated_at = now() WHERE id = $1', [c.id, targetId, position]);
      }
      const fronts = [];
      for (const c of cards) fronts.push(await cardFront(m.tx, c.id));
      await m.emit(list.board_id, 'list.cards_moved', { listId: list.id, summary: { from: list.name, to: target.name, count: cards.length }, data: { cards: fronts } });
      return cards.length;
    });
    return { moved: data, event: events[0] };
  });

  for (const method of ['put', 'delete'] as const) {
    app[method]('/lists/:listId/watch', async (req) => {
      const u = auth(req);
      const list = await loadList((req.params as any).listId);
      await requireBoard(db, u.id, list.board_id, 'view');
      if (method === 'put')
        await db.query(`INSERT INTO subscriptions (user_id, target_type, target_id) VALUES ($1,'list',$2) ON CONFLICT DO NOTHING`, [u.id, list.id]);
      else await db.query(`DELETE FROM subscriptions WHERE user_id = $1 AND target_type = 'list' AND target_id = $2`, [u.id, list.id]);
      return { watching: method === 'put' };
    });
  }
}
