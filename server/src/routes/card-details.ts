import type { FastifyInstance } from 'fastify';
import { auth, mutationId, type Ctx } from '../context.js';
import { many, one } from '../db.js';
import { conflict, forbidden, invalid, notFound } from '../lib/errors.js';
import { boardAccess, requireBoard } from '../lib/permissions.js';
import { runMutation } from '../lib/mutation.js';
import { keyFor, parsePlacement } from '../lib/positions.js';
import { cardAudience, emitCard, loadCard } from '../lib/cards.js';
import { LIMITS } from '../lib/constants.js';
import * as v from '../lib/validate.js';

export function extractMentions(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/(?:^|[^A-Za-z0-9_@])@([a-z0-9_]{3,32})\b/gi)) out.add(m[1].toLowerCase());
  return [...out];
}

export async function cardDetailRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  async function checklistCard(checklistId: string) {
    if (!v.isUuid(checklistId)) throw notFound('Checklist not found');
    const cl = await one(db, 'SELECT * FROM checklists WHERE id = $1', [checklistId]);
    if (!cl) throw notFound('Checklist not found');
    return { cl, card: await loadCard(db, cl.card_id) };
  }

  async function itemCard(itemId: string) {
    if (!v.isUuid(itemId)) throw notFound('Item not found');
    const it = await one(db, 'SELECT ci.*, cl.card_id FROM check_items ci JOIN checklists cl ON cl.id = ci.checklist_id WHERE ci.id = $1', [itemId]);
    if (!it) throw notFound('Item not found');
    return { it, card: await loadCard(db, it.card_id) };
  }

  // ---- Checklists ----
  app.post('/cards/:cardId/checklists', async (req) => {
    const u = auth(req);
    const card = await loadCard(db, (req.params as any).cardId);
    await requireBoard(db, u.id, card.board_id, 'edit');
    const name = v.str(v.body(req.body), 'name', { min: 1, max: 200, optional: true, label: 'Checklist title' }) ?? 'Checklist';
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(card.board_id);
      const n = await one(m.tx, 'SELECT count(*)::int AS n FROM checklists WHERE card_id = $1', [card.id]);
      if (n.n >= LIMITS.checklistsPerCard) throw invalid('This card has reached its checklist limit', { code: 'limit_exceeded' });
      const { position } = await keyFor(m.tx, { table: 'checklists', column: 'card_id', id: card.id, openOnly: false }, 'bottom');
      const cl = await one(m.tx, 'INSERT INTO checklists (card_id, name, position) VALUES ($1,$2,$3) RETURNING *', [card.id, name, position]);
      await emitCard(m, card, 'checklist.added', { checklistName: name });
      return { id: cl.id, name: cl.name, position: cl.position, items: [] };
    });
    return { checklist: data, event: events[0] };
  });

  app.patch('/checklists/:checklistId', async (req) => {
    const u = auth(req);
    const { cl, card } = await checklistCard((req.params as any).checklistId);
    await requireBoard(db, u.id, card.board_id, 'edit');
    const name = v.str(v.body(req.body), 'name', { min: 1, max: 200, label: 'Checklist title' })!;
    const { events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(card.board_id);
      await m.tx.query('UPDATE checklists SET name = $2 WHERE id = $1', [cl.id, name]);
      await emitCard(m, card, 'checklist.renamed', { checklistName: name, from: cl.name });
    });
    return { ok: true, event: events[0] };
  });

  app.delete('/checklists/:checklistId', async (req) => {
    const u = auth(req);
    const { cl, card } = await checklistCard((req.params as any).checklistId);
    await requireBoard(db, u.id, card.board_id, 'edit');
    const { events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(card.board_id);
      await m.tx.query('DELETE FROM checklists WHERE id = $1', [cl.id]);
      await emitCard(m, card, 'checklist.removed', { checklistName: cl.name });
    });
    return { ok: true, event: events[0] };
  });

  app.post('/checklists/:checklistId/items', async (req) => {
    const u = auth(req);
    const { cl, card } = await checklistCard((req.params as any).checklistId);
    await requireBoard(db, u.id, card.board_id, 'edit');
    const name = v.str(v.body(req.body), 'name', { min: 1, max: 1000, label: 'Item' })!;
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(card.board_id);
      const n = await one(m.tx, 'SELECT count(*)::int AS n FROM check_items WHERE checklist_id = $1', [cl.id]);
      if (n.n >= LIMITS.itemsPerChecklist) throw invalid('This checklist has reached its item limit', { code: 'limit_exceeded' });
      const { position } = await keyFor(m.tx, { table: 'check_items', column: 'checklist_id', id: cl.id, openOnly: false }, 'bottom');
      const it = await one(m.tx, 'INSERT INTO check_items (checklist_id, name, position) VALUES ($1,$2,$3) RETURNING *', [cl.id, name, position]);
      await emitCard(m, card, 'check_item.added', { itemName: name, checklistName: cl.name }, {}, true);
      return { id: it.id, name: it.name, position: it.position, checked: false };
    });
    return { item: data, event: events[0] };
  });

  app.patch('/check-items/:itemId', async (req) => {
    const u = auth(req);
    const { it, card } = await itemCard((req.params as any).itemId);
    await requireBoard(db, u.id, card.board_id, 'edit');
    const b = v.body(req.body);
    const name = v.str(b, 'name', { min: 1, max: 1000, optional: true, label: 'Item' });
    const checked = v.bool(b, 'checked');
    const targetChecklist = v.uuid(b, 'checklistId', true);
    const reorder = 'position' in b || targetChecklist;
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(card.board_id);
      let checklistId = it.checklist_id;
      let position = it.position;
      if (reorder) {
        checklistId = targetChecklist ?? it.checklist_id;
        const tcl = await one(m.tx, 'SELECT card_id FROM checklists WHERE id = $1', [checklistId]);
        if (!tcl || tcl.card_id !== card.id) throw invalid('Items can only move between checklists on the same card');
        position = (await keyFor(m.tx, { table: 'check_items', column: 'checklist_id', id: checklistId, openOnly: false }, parsePlacement(b.position ?? 'bottom'), it.id)).position;
      }
      const row = await one(
        m.tx,
        `UPDATE check_items SET name = COALESCE($2, name), checked_at = CASE WHEN $3::boolean IS NULL THEN checked_at WHEN $3 THEN COALESCE(checked_at, now()) ELSE NULL END,
                checklist_id = $4, position = $5 WHERE id = $1 RETURNING *`,
        [it.id, name ?? null, checked ?? null, checklistId, position],
      );
      const type = checked !== undefined && checked !== !!it.checked_at ? (checked ? 'check_item.checked' : 'check_item.unchecked') : name ? 'check_item.renamed' : 'check_item.moved';
      await emitCard(m, card, type, { itemName: row.name }, {}, type === 'check_item.moved' || type === 'check_item.renamed');
      return { id: row.id, name: row.name, position: row.position, checked: !!row.checked_at, checklistId: row.checklist_id };
    });
    return { item: data, event: events[0] };
  });

  app.delete('/check-items/:itemId', async (req) => {
    const u = auth(req);
    const { it, card } = await itemCard((req.params as any).itemId);
    await requireBoard(db, u.id, card.board_id, 'edit');
    const { events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(card.board_id);
      await m.tx.query('DELETE FROM check_items WHERE id = $1', [it.id]);
      await emitCard(m, card, 'check_item.deleted', { itemName: it.name }, {}, true);
    });
    return { ok: true, event: events[0] };
  });

  // Turn a checklist item into a card in the same list, right below its card; the item is removed.
  app.post('/check-items/:itemId/convert', async (req) => {
    const u = auth(req);
    const { it, card } = await itemCard((req.params as any).itemId);
    await requireBoard(db, u.id, card.board_id, 'edit');
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(card.board_id);
      const cur = await one(m.tx, 'SELECT c.*, l.name AS list_name, l.archived_at AS list_archived FROM cards c JOIN lists l ON l.id = c.list_id WHERE c.id = $1', [card.id]);
      // The card may have moved to another board between the permission check and the lock.
      if (!cur || cur.board_id !== card.board_id) throw conflict('stale', 'This card moved. Reload and try again.');
      if (cur.archived_at || cur.list_archived) throw conflict('card_archived', 'Restore the card (and its list) before converting items.');
      const still = await one(m.tx, 'SELECT name FROM check_items WHERE id = $1', [it.id]);
      if (!still) throw notFound('Item not found');
      const count = await one(m.tx, 'SELECT count(*)::int AS n FROM cards WHERE board_id = $1 AND archived_at IS NULL', [card.board_id]);
      if (count.n >= LIMITS.openCardsPerBoard) throw invalid(`This board has reached its limit of ${LIMITS.openCardsPerBoard} open cards`, { code: 'limit_exceeded' });
      const { position, rebalanced } = await keyFor(m.tx, { table: 'cards', column: 'list_id', id: cur.list_id, openOnly: true }, { afterId: card.id });
      const num = await one(m.tx, 'UPDATE boards SET next_card_number = next_card_number + 1 WHERE id = $1 RETURNING next_card_number - 1 AS n', [card.board_id]);
      const nc = await one(
        m.tx,
        'INSERT INTO cards (board_id, list_id, number, name, position, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [card.board_id, cur.list_id, num.n, still.name.slice(0, 512), position, u.id],
      );
      await m.watch(u.id, 'card', nc.id);
      await m.tx.query('DELETE FROM check_items WHERE id = $1', [it.id]);
      await emitCard(m, card, 'check_item.converted', { itemName: still.name, newCardNumber: nc.number });
      const evt = await emitCard(m, nc, 'card.created', { listName: cur.list_name, fromCard: cur.name }, { rebalanced });
      return evt.data.card;
    });
    return { card: data, event: events[0], events };
  });

  // ---- Comments ----
  app.post('/cards/:cardId/comments', async (req) => {
    const u = auth(req);
    const card = await loadCard(db, (req.params as any).cardId);
    await requireBoard(db, u.id, card.board_id, 'comment');
    const body = v.str(v.body(req.body), 'body', { min: 1, max: 16384, label: 'Comment' })!;
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(card.board_id);
      const c = await one(m.tx, 'INSERT INTO comments (card_id, author_id, body) VALUES ($1,$2,$3) RETURNING *', [card.id, u.id, body]);
      await m.watch(u.id, 'card', card.id);
      await emitCard(m, card, 'comment.added', { commentId: c.id, excerpt: body.slice(0, 200) }, { commentId: c.id });
      // @username mentions notify board members only (non-members are never notified, research J08.6a).
      const usernames = extractMentions(body);
      const mentioned = usernames.length
        ? await many(m.tx, 'SELECT u.id FROM users u JOIN board_members bm ON bm.user_id = u.id AND bm.board_id = $2 WHERE u.username = ANY($1)', [usernames, card.board_id])
        : [];
      const mentionedIds = mentioned.map((r) => r.id as string);
      await m.notify(mentionedIds, 'mentioned', { boardId: card.board_id, cardId: card.id, data: { cardName: card.name, excerpt: body.slice(0, 200) } });
      const audience = (await cardAudience(m.tx, card.id)).filter((id) => !mentionedIds.includes(id));
      await m.notify(audience, 'commented', { boardId: card.board_id, cardId: card.id, data: { cardName: card.name, excerpt: body.slice(0, 200) } });
      return { id: c.id, body: c.body, createdAt: c.created_at, editedAt: null, author: { id: u.id, username: u.username, fullName: u.full_name, initials: u.initials } };
    });
    return { comment: data, event: events[0] };
  });

  async function loadComment(id: string) {
    if (!v.isUuid(id)) throw notFound('Comment not found');
    const c = await one(db, 'SELECT * FROM comments WHERE id = $1', [id]);
    if (!c) throw notFound('Comment not found');
    return { c, card: await loadCard(db, c.card_id) };
  }

  // Only the author may edit a comment — for every role, admins included (research J08.6).
  app.patch('/comments/:commentId', async (req) => {
    const u = auth(req);
    const { c, card } = await loadComment((req.params as any).commentId);
    const access = await requireBoard(db, u.id, card.board_id, 'view');
    if (c.author_id !== u.id) throw forbidden('You can only edit your own comments.');
    if (!access.can.comment) throw forbidden('Commenting is not allowed for your role on this board.');
    const body = v.str(v.body(req.body), 'body', { min: 1, max: 16384, label: 'Comment' })!;
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(card.board_id);
      const row = await one(m.tx, 'UPDATE comments SET body = $2, edited_at = now() WHERE id = $1 RETURNING *', [c.id, body]);
      await emitCard(m, card, 'comment.edited', { commentId: c.id }, { commentId: c.id }, true);
      return { id: row.id, body: row.body, editedAt: row.edited_at };
    });
    return { comment: data, event: events[0] };
  });

  // Authors delete their own; board admins may delete non-admins' comments.
  app.delete('/comments/:commentId', async (req) => {
    const u = auth(req);
    const { c, card } = await loadComment((req.params as any).commentId);
    const access = await requireBoard(db, u.id, card.board_id, 'view');
    if (c.author_id !== u.id) {
      if (!access.can.admin) throw forbidden('You can only delete your own comments.');
      const authorAccess = c.author_id ? await boardAccess(db, c.author_id, card.board_id) : null;
      if (authorAccess?.role === 'admin') throw forbidden('Admins cannot delete another admin’s comment.');
    }
    const { events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(card.board_id);
      await m.tx.query('DELETE FROM comments WHERE id = $1', [c.id]);
      await emitCard(m, card, 'comment.deleted', { commentId: c.id }, { commentId: c.id });
    });
    return { ok: true, event: events[0] };
  });
}
