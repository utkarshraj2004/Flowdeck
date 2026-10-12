import fs from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { auth, mutationId, type Ctx } from '../context.js';
import { many, one } from '../db.js';
import { conflict, forbidden, invalid, notFound } from '../lib/errors.js';
import { requireBoard } from '../lib/permissions.js';
import { runMutation } from '../lib/mutation.js';
import { cardFront, labelJson, userJson } from '../lib/serialize.js';
import { keyFor, parsePlacement } from '../lib/positions.js';
import { cardAudience, emitCard, loadCard } from '../lib/cards.js';
import { transferCardToBoard } from '../lib/transfer.js';
import { fileKeys, removeFiles, storagePath } from '../lib/files.js';
import { LABEL_COLORS, LIMITS } from '../lib/constants.js';
import { randomToken } from '../lib/security.js';
import * as v from '../lib/validate.js';
import { accessJson, activityJson, resolveBoardId } from './boards.js';

const GUARDED = ['name', 'description', 'startAt', 'dueAt'] as const;
const COLUMN: Record<string, string> = { name: 'name', description: 'description', startAt: 'start_at', dueAt: 'due_at' };

export async function cardDetail(ctx: Ctx, userId: string, cardId: string) {
  const { db } = ctx;
  const c = await loadCard(db, cardId);
  const access = await requireBoard(db, userId, c.board_id, 'view');
  const [front, list, checklists, items, comments, attachments, activity, watching] = await Promise.all([
    cardFront(db, cardId),
    one(db, 'SELECT id, name, archived_at FROM lists WHERE id = $1', [c.list_id]),
    many(db, 'SELECT * FROM checklists WHERE card_id = $1 ORDER BY position, id', [cardId]),
    many(db, 'SELECT ci.* FROM check_items ci JOIN checklists cl ON cl.id = ci.checklist_id WHERE cl.card_id = $1 ORDER BY ci.position, ci.id', [cardId]),
    many(db, 'SELECT cm.*, u.username, u.full_name, u.initials FROM comments cm LEFT JOIN users u ON u.id = cm.author_id WHERE cm.card_id = $1 ORDER BY cm.created_at DESC', [cardId]),
    many(db, 'SELECT a.*, u.full_name FROM attachments a LEFT JOIN users u ON u.id = a.uploader_id WHERE a.card_id = $1 ORDER BY a.created_at DESC', [cardId]),
    many(
      db,
      `SELECT a.seq, a.type, a.card_id, a.list_id, a.summary, a.created_at, u.id AS uid, u.username, u.full_name, u.initials
         FROM activity a LEFT JOIN users u ON u.id = a.actor_id WHERE a.board_id = $2 AND a.card_id = $1 AND NOT COALESCE((a.summary->>'hidden')::boolean, false)
        ORDER BY a.seq DESC LIMIT 100`,
      [cardId, c.board_id],
    ),
    one(db, `SELECT 1 FROM subscriptions WHERE target_type = 'card' AND target_id = $1 AND user_id = $2`, [cardId, userId]),
  ]);
  return {
    card: {
      ...front,
      description: c.description,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
      list: list && { id: list.id, name: list.name, archived: !!list.archived_at },
      board: { id: access.board.id, shortId: access.board.short_id, name: access.board.name, closedAt: access.board.closed_at },
      watching: !!watching,
      checklists: checklists.map((cl) => ({
        id: cl.id,
        name: cl.name,
        position: cl.position,
        items: items.filter((i) => i.checklist_id === cl.id).map((i) => ({ id: i.id, name: i.name, position: i.position, checked: !!i.checked_at })),
      })),
      comments: comments.map((cm) => ({
        id: cm.id,
        body: cm.body,
        createdAt: cm.created_at,
        editedAt: cm.edited_at,
        author: cm.author_id ? { id: cm.author_id, username: cm.username, fullName: cm.full_name, initials: cm.initials } : null,
      })),
      attachments: attachments.map(attachmentJson),
      activity: activity.map(activityJson),
    },
    access: accessJson(access),
  };
}

export const attachmentJson = (a: any) => ({
  id: a.id,
  cardId: a.card_id,
  kind: a.kind,
  name: a.name,
  url: a.kind === 'link' ? a.url : `/api/v1/attachments/${a.id}/download`,
  mimeType: a.mime_type,
  bytes: a.bytes === null ? null : Number(a.bytes),
  isImage: a.kind === 'file' && /^image\/(png|jpe?g|gif|webp)$/.test(a.mime_type ?? ''),
  uploader: a.uploader_id ? { id: a.uploader_id, fullName: a.full_name } : null,
  createdAt: a.created_at,
});

export async function cardRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  app.post('/lists/:listId/cards', async (req) => {
    const u = auth(req);
    const listId = (req.params as any).listId;
    if (!v.isUuid(listId)) throw notFound('List not found');
    const list = await one(db, 'SELECT * FROM lists WHERE id = $1', [listId]);
    if (!list) throw notFound('List not found');
    await requireBoard(db, u.id, list.board_id, 'edit');
    const b = v.body(req.body);
    const name = v.str(b, 'name', { min: 1, max: 512, label: 'Card title' })!;
    const placement = parsePlacement(b.position ?? 'bottom');
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(list.board_id);
      const cur = await one(m.tx, 'SELECT archived_at, board_id FROM lists WHERE id = $1', [listId]);
      if (!cur || cur.board_id !== list.board_id) throw notFound('List not found');
      if (cur.archived_at) throw conflict('list_archived', 'This list was archived. Restore it to add cards.');
      const count = await one(m.tx, 'SELECT count(*)::int AS n FROM cards WHERE board_id = $1 AND archived_at IS NULL', [list.board_id]);
      if (count.n >= LIMITS.openCardsPerBoard) throw invalid(`This board has reached its limit of ${LIMITS.openCardsPerBoard} open cards`, { code: 'limit_exceeded' });
      const { position, rebalanced } = await keyFor(m.tx, { table: 'cards', column: 'list_id', id: listId, openOnly: true }, placement);
      const num = await one(m.tx, 'UPDATE boards SET next_card_number = next_card_number + 1 WHERE id = $1 RETURNING next_card_number - 1 AS n', [list.board_id]);
      const card = await one(
        m.tx,
        'INSERT INTO cards (board_id, list_id, number, name, position, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [list.board_id, listId, num.n, name, position, u.id],
      );
      await m.watch(u.id, 'card', card.id);
      const evt = await emitCard(m, card, 'card.created', { listName: list.name }, { rebalanced });
      const watchers = await many(
        m.tx,
        `SELECT user_id FROM subscriptions WHERE (target_type = 'list' AND target_id = $1) OR (target_type = 'board' AND target_id = $2)`,
        [listId, list.board_id],
      );
      await m.notify(watchers.map((w) => w.user_id), 'card_created', { boardId: list.board_id, cardId: card.id, data: { cardName: name, listName: list.name } });
      return evt.data.card;
    });
    return { card: data, event: events[0] };
  });

  app.get('/cards/:cardId', async (req) => {
    const u = auth(req);
    return cardDetail(ctx, u.id, (req.params as any).cardId);
  });

  app.get('/boards/:id/cards/:number', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    await requireBoard(db, u.id, boardId, 'view');
    const n = Number.parseInt((req.params as any).number, 10);
    const row = await one(db, 'SELECT id FROM cards WHERE board_id = $1 AND number = $2', [boardId, Number.isFinite(n) ? n : -1]);
    if (!row) throw notFound('Card not found');
    return cardDetail(ctx, u.id, row.id);
  });

  /**
   * Edit card fields. For name/description/startAt/dueAt the client sends
   * `base` (the value it started editing from). If the stored value differs,
   * someone else saved first: 409 version_conflict with their value, so the
   * client can show the explicit conflict prompt instead of silently
   * overwriting (research 07, J07.9, J08.10).
   */
  app.patch('/cards/:cardId', async (req) => {
    const u = auth(req);
    const card = await loadCard(db, (req.params as any).cardId);
    await requireBoard(db, u.id, card.board_id, 'edit');
    const b = v.body(req.body);
    const base = (b.base && typeof b.base === 'object' ? b.base : {}) as Record<string, unknown>;
    const changes: Record<string, unknown> = {};
    if ('name' in b) changes.name = v.str(b, 'name', { min: 1, max: 512, label: 'Card title' });
    if ('description' in b) changes.description = v.str(b, 'description', { max: 16384, trim: false, label: 'Description' });
    if ('startAt' in b) changes.startAt = v.dateOrNull(b, 'startAt');
    if ('dueAt' in b) changes.dueAt = v.dateOrNull(b, 'dueAt');
    if ('dueComplete' in b) changes.dueComplete = v.bool(b, 'dueComplete');
    if ('isTemplate' in b) changes.isTemplate = v.bool(b, 'isTemplate');
    if ('cover' in b) {
      const c = b.cover as any;
      if (c === null) changes.cover = null;
      else if (c && typeof c === 'object' && typeof c.color === 'string' && (LABEL_COLORS as readonly string[]).includes(c.color)) changes.cover = { color: c.color };
      else if (c && typeof c === 'object' && v.isUuid(c.attachmentId)) {
        const att = await one(db, `SELECT 1 FROM attachments WHERE id = $1 AND card_id = $2 AND kind = 'file' AND mime_type ~ '^image/(png|jpe?g|gif|webp)$'`, [c.attachmentId, card.id]);
        if (!att) throw invalid('The cover must be an image attached to this card');
        changes.cover = { attachmentId: c.attachmentId };
      } else throw invalid('cover must be null, {color} or {attachmentId}');
    }
    if (!Object.keys(changes).length) throw invalid('Nothing to update');
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(card.board_id);
      const cur = await one(m.tx, 'SELECT * FROM cards WHERE id = $1', [card.id]);
      if (!cur) throw notFound('Card not found');
      const conflicts: string[] = [];
      for (const f of GUARDED) {
        if (!(f in changes) || !(f in base)) continue;
        const stored = cur[COLUMN[f]];
        const baseVal = base[f] === '' && f !== 'description' && f !== 'name' ? null : base[f];
        const norm = (x: unknown) => (x === null || x === undefined ? null : f.endsWith('At') ? new Date(String(x)).toISOString() : String(x));
        if (norm(stored) !== norm(baseVal) && norm(stored) !== norm(changes[f])) conflicts.push(f);
      }
      if (conflicts.length) {
        const last = await one(
          m.tx,
          `SELECT u.full_name FROM activity a JOIN users u ON u.id = a.actor_id WHERE a.card_id = $1 AND a.type = 'card.updated' ORDER BY a.seq DESC LIMIT 1`,
          [card.id],
        );
        throw conflict('version_conflict', `${last?.full_name ?? 'Someone'} changed this card while you were editing.`, {
          fields: conflicts,
          current: { name: cur.name, description: cur.description, startAt: cur.start_at, dueAt: cur.due_at, version: cur.version },
          updatedBy: last?.full_name ?? null,
        });
      }
      const sets: string[] = [];
      const params: unknown[] = [card.id];
      const colMap: Record<string, string> = { ...COLUMN, dueComplete: 'due_complete', cover: 'cover', isTemplate: 'is_template' };
      for (const [k, val] of Object.entries(changes)) {
        params.push(val);
        sets.push(`${colMap[k]} = $${params.length}`);
      }
      const row = await one(m.tx, `UPDATE cards SET ${sets.join(', ')}, version = version + 1, updated_at = now() WHERE id = $1 RETURNING *`, params);
      const changed = Object.keys(changes).filter((k) => JSON.stringify(cur[colMap[k]] ?? null) !== JSON.stringify(row[colMap[k]] ?? null));
      const summary: Record<string, unknown> = { changed };
      if (changed.includes('name')) Object.assign(summary, { from: cur.name, to: row.name });
      if (changed.includes('dueAt')) summary.dueAt = row.due_at;
      if (changed.includes('dueComplete')) summary.dueComplete = row.due_complete;
      const evt = await emitCard(m, row, 'card.updated', summary, { changed }, changed.length === 0 || (changed.length === 1 && changed[0] === 'cover'));
      const audience = await cardAudience(m.tx, card.id);
      if (changed.includes('dueAt') || changed.includes('startAt')) await m.notify(audience, 'due_changed', { boardId: card.board_id, cardId: card.id, data: { cardName: row.name, dueAt: row.due_at } });
      if (changed.includes('dueComplete') && row.due_complete) await m.notify(audience, 'completed', { boardId: card.board_id, cardId: card.id, data: { cardName: row.name } });
      return { ...(evt.data.card as object), description: row.description };
    });
    return { card: data, event: events[0] };
  });

  app.post('/cards/:cardId/move', async (req) => {
    const u = auth(req);
    const card = await loadCard(db, (req.params as any).cardId);
    await requireBoard(db, u.id, card.board_id, 'edit');
    const b = v.body(req.body);
    const listId = v.uuid(b, 'listId')!;
    const target = await one(db, 'SELECT * FROM lists WHERE id = $1', [listId]);
    if (!target) throw notFound('Target list not found');
    if (target.board_id !== card.board_id) {
      const t = await requireBoard(db, u.id, target.board_id, 'edit');
      if (t.board.closed_at) throw conflict('board_closed', 'The target board is closed.');
    }
    const placement = parsePlacement(b.position ?? 'bottom');
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(card.board_id, target.board_id);
      const cur = await one(m.tx, 'SELECT * FROM cards WHERE id = $1', [card.id]);
      if (!cur) throw notFound('Card not found');
      const tl = await one(m.tx, 'SELECT * FROM lists WHERE id = $1', [listId]);
      if (!tl || tl.board_id !== target.board_id) throw notFound('Target list not found');
      if (tl.archived_at) throw conflict('list_archived', 'The target list is archived.');
      // Moves are deliberately not version-gated: concurrent moves converge on the last one (research 07).
      const { position, rebalanced } = await keyFor(m.tx, { table: 'cards', column: 'list_id', id: listId, openOnly: true }, placement, card.id);
      const fromList = await one(m.tx, 'SELECT name FROM lists WHERE id = $1', [cur.list_id]);
      let transfer = null;
      if (tl.board_id !== cur.board_id) transfer = await transferCardToBoard(m, card.id, cur.board_id, tl.board_id);
      const row = await one(m.tx, 'UPDATE cards SET list_id = $2, position = $3, version = version + 1, updated_at = now() WHERE id = $1 RETURNING *', [card.id, listId, position]);
      const crossList = cur.list_id !== listId;
      let evt;
      if (transfer) {
        const toBoard = await one(m.tx, 'SELECT name FROM boards WHERE id = $1', [tl.board_id]);
        const fromBoard = await one(m.tx, 'SELECT name FROM boards WHERE id = $1', [cur.board_id]);
        await m.emit(cur.board_id, 'card.moved_out', { cardId: card.id, summary: { cardName: cur.name, toBoard: toBoard.name }, data: { cardId: card.id } });
        evt = await emitCard(m, row, 'card.moved_in', { fromBoard: fromBoard.name, toList: tl.name, droppedMembers: transfer.droppedMemberIds }, { labels: transfer.createdLabels, rebalanced });
      } else {
        evt = await emitCard(m, row, 'card.moved', { fromList: fromList?.name, toList: tl.name }, { rebalanced, fromListId: cur.list_id }, !crossList);
      }
      if (crossList) await m.notify(await cardAudience(m.tx, card.id), 'card_moved', { boardId: tl.board_id, cardId: card.id, data: { cardName: row.name, listName: tl.name } });
      return evt.data.card;
    });
    return { card: data, event: events[events.length - 1] };
  });

  app.post('/cards/:cardId/copy', async (req) => {
    const u = auth(req);
    const card = await loadCard(db, (req.params as any).cardId);
    await requireBoard(db, u.id, card.board_id, 'view');
    const b = v.body(req.body);
    const listId = v.uuid(b, 'listId')!;
    const target = await one(db, 'SELECT * FROM lists WHERE id = $1', [listId]);
    if (!target) throw notFound('Target list not found');
    await requireBoard(db, u.id, target.board_id, 'edit');
    const name = v.str(b, 'name', { min: 1, max: 512, optional: true, label: 'Card title' }) ?? card.name;
    const keep = new Set(Array.isArray(b.keep) ? (b.keep as string[]) : []);
    const placement = parsePlacement(b.position ?? 'bottom');
    const copiedFiles: [string, string][] = [];
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(target.board_id);
      if (target.archived_at) throw conflict('list_archived', 'The target list is archived.');
      const { position } = await keyFor(m.tx, { table: 'cards', column: 'list_id', id: listId, openOnly: true }, placement);
      const num = await one(m.tx, 'UPDATE boards SET next_card_number = next_card_number + 1 WHERE id = $1 RETURNING next_card_number - 1 AS n', [target.board_id]);
      const nc = await one(
        m.tx,
        `INSERT INTO cards (board_id, list_id, number, name, description, position, start_at, due_at, cover, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [target.board_id, listId, num.n, name, card.description, position, card.start_at, card.due_at, card.cover?.color ? card.cover : null, u.id],
      );
      const sameBoard = target.board_id === card.board_id;
      if (keep.has('labels')) {
        if (sameBoard) await m.tx.query('INSERT INTO card_labels (card_id, label_id) SELECT $2, label_id FROM card_labels WHERE card_id = $1', [card.id, nc.id]);
        else {
          for (const l of await many(m.tx, 'SELECT l.* FROM card_labels cl JOIN labels l ON l.id = cl.label_id WHERE cl.card_id = $1', [card.id])) {
            let t = await one(m.tx, 'SELECT id FROM labels WHERE board_id = $1 AND name = $2 AND color IS NOT DISTINCT FROM $3 LIMIT 1', [target.board_id, l.name, l.color]);
            if (!t) {
              t = await one(m.tx, 'INSERT INTO labels (board_id, name, color) VALUES ($1,$2,$3) RETURNING *', [target.board_id, l.name, l.color]);
              await m.emit(target.board_id, 'label.created', { data: { label: labelJson(t) }, hidden: true });
            }
            await m.tx.query('INSERT INTO card_labels (card_id, label_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [nc.id, t.id]);
          }
        }
      }
      if (keep.has('members'))
        await m.tx.query(
          `INSERT INTO card_members (card_id, user_id) SELECT $2, cm.user_id FROM card_members cm WHERE cm.card_id = $1
             AND EXISTS (SELECT 1 FROM board_members bm WHERE bm.board_id = $3 AND bm.user_id = cm.user_id)`,
          [card.id, nc.id, target.board_id],
        );
      if (keep.has('checklists'))
        for (const ch of await many(m.tx, 'SELECT * FROM checklists WHERE card_id = $1', [card.id])) {
          const nch = await one(m.tx, 'INSERT INTO checklists (card_id, name, position) VALUES ($1,$2,$3) RETURNING id', [nc.id, ch.name, ch.position]);
          // Copied checklist items start unchecked (matches the observed reference behaviour).
          await m.tx.query('INSERT INTO check_items (checklist_id, name, position) SELECT $2, name, position FROM check_items WHERE checklist_id = $1', [ch.id, nch.id]);
        }
      if (keep.has('comments'))
        await m.tx.query('INSERT INTO comments (card_id, author_id, body, created_at, edited_at) SELECT $2, author_id, body, created_at, edited_at FROM comments WHERE card_id = $1', [card.id, nc.id]);
      if (keep.has('attachments'))
        for (const a of await many(m.tx, 'SELECT * FROM attachments WHERE card_id = $1', [card.id])) {
          let key = a.storage_key;
          if (key) {
            const newKey = randomToken(24);
            copiedFiles.push([key, newKey]);
            key = newKey;
          }
          await m.tx.query(
            'INSERT INTO attachments (card_id, uploader_id, kind, name, url, storage_key, mime_type, bytes, sha256) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
            [nc.id, a.uploader_id, a.kind, a.name, a.url, key, a.mime_type, a.bytes, a.sha256],
          );
        }
      await m.watch(u.id, 'card', nc.id);
      for (const [from, to] of copiedFiles) {
        const dest = storagePath(ctx.config.uploadDir, to);
        await fs.mkdir(dest.slice(0, dest.lastIndexOf('/')), { recursive: true });
        await fs.copyFile(storagePath(ctx.config.uploadDir, from), dest);
      }
      const evt = await emitCard(m, nc, 'card.created', { copiedFrom: card.name, listName: target.name });
      return evt.data.card;
    }).catch(async (err) => {
      await removeFiles(ctx.config.uploadDir, copiedFiles.map(([, to]) => to));
      throw err;
    });
    return { card: data, event: events[events.length - 1] };
  });

  app.post('/cards/:cardId/archive', async (req) => {
    const u = auth(req);
    const card = await loadCard(db, (req.params as any).cardId);
    await requireBoard(db, u.id, card.board_id, 'edit');
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(card.board_id);
      const row = await one(m.tx, 'UPDATE cards SET archived_at = COALESCE(archived_at, now()), version = version + 1 WHERE id = $1 RETURNING *', [card.id]);
      const evt = await emitCard(m, row, 'card.archived');
      await m.notify(await cardAudience(m.tx, card.id), 'card_archived', { boardId: card.board_id, cardId: card.id, data: { cardName: row.name } });
      return evt.data.card;
    });
    return { card: data, event: events[0] };
  });

  app.post('/cards/:cardId/restore', async (req) => {
    const u = auth(req);
    const card = await loadCard(db, (req.params as any).cardId);
    await requireBoard(db, u.id, card.board_id, 'edit');
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(card.board_id);
      const list = await one(m.tx, 'SELECT archived_at FROM lists WHERE id = $1', [card.list_id]);
      if (list?.archived_at) throw conflict('list_archived', 'This card’s list is archived. Restore the list first, or move the card.');
      const clash = await one(m.tx, 'SELECT 1 FROM cards WHERE list_id = $1 AND archived_at IS NULL AND position = $2 AND id <> $3', [card.list_id, card.position, card.id]);
      const position = clash ? (await keyFor(m.tx, { table: 'cards', column: 'list_id', id: card.list_id, openOnly: true }, 'bottom', card.id)).position : card.position;
      const row = await one(m.tx, 'UPDATE cards SET archived_at = NULL, position = $2, version = version + 1 WHERE id = $1 RETURNING *', [card.id, position]);
      const evt = await emitCard(m, row, 'card.restored');
      return evt.data.card;
    });
    return { card: data, event: events[0] };
  });

  app.delete('/cards/:cardId', async (req) => {
    const u = auth(req);
    const card = await loadCard(db, (req.params as any).cardId);
    await requireBoard(db, u.id, card.board_id, 'edit');
    if (!card.archived_at) throw conflict('not_archived', 'Archive the card before deleting it.');
    const keys = await fileKeys(db, 'c.id = $1', [card.id]);
    const { events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(card.board_id);
      await m.tx.query('DELETE FROM cards WHERE id = $1', [card.id]);
      await m.emit(card.board_id, 'card.deleted', { cardId: card.id, summary: { cardName: card.name, cardNumber: card.number }, data: { cardId: card.id } });
    });
    await removeFiles(ctx.config.uploadDir, keys);
    return { ok: true, event: events[0] };
  });

  // ---- Labels and members on a card (set semantics: idempotent add/remove) ----
  for (const method of ['put', 'delete'] as const) {
    app[method]('/cards/:cardId/labels/:labelId', async (req) => {
      const u = auth(req);
      const card = await loadCard(db, (req.params as any).cardId);
      await requireBoard(db, u.id, card.board_id, 'edit');
      const labelId = (req.params as any).labelId;
      if (!v.isUuid(labelId)) throw notFound('Label not found');
      const label = await one(db, 'SELECT * FROM labels WHERE id = $1 AND board_id = $2', [labelId, card.board_id]);
      if (!label) throw notFound('Label not found on this board');
      const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
        await m.lock(card.board_id);
        const r =
          method === 'put'
            ? await m.tx.query('INSERT INTO card_labels (card_id, label_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [card.id, labelId])
            : await m.tx.query('DELETE FROM card_labels WHERE card_id = $1 AND label_id = $2', [card.id, labelId]);
        const evt = await emitCard(m, card, method === 'put' ? 'card.label_added' : 'card.label_removed', { labelName: label.name, labelColor: label.color }, {}, r.rowCount === 0);
        return evt.data.card;
      });
      return { card: data, event: events[0] };
    });

    app[method]('/cards/:cardId/members/:userId', async (req) => {
      const u = auth(req);
      const card = await loadCard(db, (req.params as any).cardId);
      await requireBoard(db, u.id, card.board_id, 'edit');
      const userId = (req.params as any).userId;
      if (!v.isUuid(userId)) throw notFound('User not found');
      const member = await one(db, 'SELECT u.* FROM board_members bm JOIN users u ON u.id = bm.user_id WHERE bm.board_id = $1 AND bm.user_id = $2', [card.board_id, userId]);
      if (method === 'put' && !member) throw invalid('Only board members can be assigned to a card.');
      const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
        await m.lock(card.board_id);
        const r =
          method === 'put'
            ? await m.tx.query('INSERT INTO card_members (card_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [card.id, userId])
            : await m.tx.query('DELETE FROM card_members WHERE card_id = $1 AND user_id = $2', [card.id, userId]);
        const evt = await emitCard(m, card, method === 'put' ? 'card.member_added' : 'card.member_removed', { userId, userName: member?.full_name }, {}, r.rowCount === 0);
        if (r.rowCount) {
          if (method === 'put') await m.watch(userId, 'card', card.id);
          await m.notify([userId], method === 'put' ? 'added_to_card' : 'removed_from_card', { boardId: card.board_id, cardId: card.id, data: { cardName: card.name } });
        }
        return evt.data.card;
      });
      return { card: data, event: events[0] };
    });

    app[method]('/cards/:cardId/watch', async (req) => {
      const u = auth(req);
      const card = await loadCard(db, (req.params as any).cardId);
      await requireBoard(db, u.id, card.board_id, 'view');
      if (method === 'put')
        await db.query(`INSERT INTO subscriptions (user_id, target_type, target_id) VALUES ($1,'card',$2) ON CONFLICT DO NOTHING`, [u.id, card.id]);
      else await db.query(`DELETE FROM subscriptions WHERE user_id = $1 AND target_type = 'card' AND target_id = $2`, [u.id, card.id]);
      return { watching: method === 'put' };
    });
  }

  // Mention autocomplete: board members only.
  app.get('/boards/:id/mentionable', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    await requireBoard(db, u.id, boardId, 'view');
    const rows = await many(db, 'SELECT u.id, u.username, u.full_name, u.initials FROM board_members bm JOIN users u ON u.id = bm.user_id WHERE bm.board_id = $1 ORDER BY u.username', [boardId]);
    return { users: rows.map(userJson) };
  });

  void forbidden;
}
