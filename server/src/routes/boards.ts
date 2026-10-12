import type { FastifyInstance } from 'fastify';
import { auth, mutationId, type Ctx } from '../context.js';
import { many, one, type Queryable } from '../db.js';
import { conflict, forbidden, invalid, notFound } from '../lib/errors.js';
import { boardAccess, requireBoard, requireWorkspace, type BoardAccess } from '../lib/permissions.js';
import { runMutation } from '../lib/mutation.js';
import { boardJson, boardMembers, cardFronts, labelJson, listJson, userJson } from '../lib/serialize.js';
import { shortId } from '../lib/security.js';
import { BACKGROUNDS, DEFAULT_LABELS, LABEL_COLORS, LIMITS } from '../lib/constants.js';
import { eventsSince } from '../lib/boards.js';
import { fileKeys, removeFiles } from '../lib/files.js';
import { generateNKeysBetween } from '../lib/positions.js';
import * as v from '../lib/validate.js';

/** Accept a board UUID or its short id. */
export async function resolveBoardId(q: Queryable, idOrShort: string): Promise<string> {
  if (v.isUuid(idOrShort)) return idOrShort;
  if (!/^[A-Za-z0-9]{4,16}$/.test(idOrShort)) throw notFound('Board not found');
  const r = await one(q, 'SELECT id FROM boards WHERE short_id = $1', [idOrShort]);
  if (!r) throw notFound('Board not found');
  return r.id;
}

export const accessJson = (a: BoardAccess) => ({ role: a.role, boardRole: a.boardRole, workspaceRole: a.workspaceRole, can: a.can });

export async function boardRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  app.post('/boards', async (req) => {
    const u = auth(req);
    const b = v.body(req.body);
    const workspaceId = v.uuid(b, 'workspaceId')!;
    const { workspace } = await requireWorkspace(db, u.id, workspaceId, 'view');
    const name = v.str(b, 'name', { min: 1, max: 200, label: 'Board title' })!;
    const visibility = v.oneOf(b, 'visibility', ['private', 'workspace'] as const, true) ?? workspace.settings?.defaultBoardVisibility ?? 'workspace';
    const background = v.oneOf(b, 'background', BACKGROUNDS, true) ?? 'ocean';
    const defaultLists = v.bool(b, 'defaultLists') ?? true;
    const sourceBoardId = v.uuid(b, 'sourceBoardId', true);
    const keepCards = v.bool(b, 'keepCards') ?? false;
    if (sourceBoardId) await requireBoard(db, u.id, sourceBoardId, 'view');

    const { data } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      const tx = m.tx;
      const board = await one(
        tx,
        `INSERT INTO boards (workspace_id, short_id, name, visibility, background, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [workspaceId, shortId(), name, visibility, background, u.id],
      );
      await tx.query(`INSERT INTO board_members (board_id, user_id, role) VALUES ($1,$2,'admin')`, [board.id, u.id]);
      await m.watch(u.id, 'board', board.id);
      if (sourceBoardId) {
        const labelMap = new Map<string, string>();
        for (const l of await many(tx, 'SELECT * FROM labels WHERE board_id = $1 ORDER BY created_at', [sourceBoardId])) {
          const nl = await one(tx, 'INSERT INTO labels (board_id, name, color) VALUES ($1,$2,$3) RETURNING id', [board.id, l.name, l.color]);
          labelMap.set(l.id, nl.id);
        }
        const lists = await many(tx, 'SELECT * FROM lists WHERE board_id = $1 AND archived_at IS NULL ORDER BY position', [sourceBoardId]);
        for (const l of lists) {
          const nl = await one(tx, 'INSERT INTO lists (board_id, name, position) VALUES ($1,$2,$3) RETURNING id', [board.id, l.name, l.position]);
          if (!keepCards) continue;
          const cards = await many(tx, 'SELECT * FROM cards WHERE list_id = $1 AND archived_at IS NULL ORDER BY position', [l.id]);
          for (const c of cards) {
            const num = await one(tx, 'UPDATE boards SET next_card_number = next_card_number + 1 WHERE id = $1 RETURNING next_card_number - 1 AS n', [board.id]);
            const nc = await one(
              tx,
              `INSERT INTO cards (board_id, list_id, number, name, description, position, start_at, due_at, due_complete, cover, created_by)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
              [board.id, nl.id, num.n, c.name, c.description, c.position, c.start_at, c.due_at, c.due_complete, c.cover?.color ? c.cover : null, u.id],
            );
            for (const cl of await many(tx, 'SELECT label_id FROM card_labels WHERE card_id = $1', [c.id]))
              await tx.query('INSERT INTO card_labels (card_id, label_id) VALUES ($1,$2)', [nc.id, labelMap.get(cl.label_id)]);
            for (const ch of await many(tx, 'SELECT * FROM checklists WHERE card_id = $1', [c.id])) {
              const nch = await one(tx, 'INSERT INTO checklists (card_id, name, position) VALUES ($1,$2,$3) RETURNING id', [nc.id, ch.name, ch.position]);
              await tx.query(
                'INSERT INTO check_items (checklist_id, name, position) SELECT $2, name, position FROM check_items WHERE checklist_id = $1',
                [ch.id, nch.id],
              );
            }
          }
        }
      } else {
        for (const color of DEFAULT_LABELS) await tx.query('INSERT INTO labels (board_id, name, color) VALUES ($1, $2, $3)', [board.id, '', color]);
        if (defaultLists) {
          const keys = generateNKeysBetween(null, null, 3);
          const names = ['To do', 'Doing', 'Done'];
          for (let i = 0; i < 3; i++) await tx.query('INSERT INTO lists (board_id, name, position) VALUES ($1,$2,$3)', [board.id, names[i], keys[i]]);
        }
      }
      await m.emit(board.id, 'board.created', { summary: { name, copiedFrom: sourceBoardId ?? null }, data: {} });
      return one(tx, 'SELECT * FROM boards WHERE id = $1', [board.id]);
    });
    return { board: boardJson(data) };
  });

  async function snapshot(userId: string, access: BoardAccess) {
    const boardId = access.board.id;
    const [members, labels, lists, cards, ws, star, watch] = await Promise.all([
      boardMembers(db, boardId),
      many(db, 'SELECT * FROM labels WHERE board_id = $1 ORDER BY created_at, id', [boardId]),
      many(db, 'SELECT * FROM lists WHERE board_id = $1 AND archived_at IS NULL ORDER BY position, id', [boardId]),
      cardFronts(db, 'c.board_id = $1 AND c.archived_at IS NULL AND c.list_id IN (SELECT id FROM lists WHERE board_id = $1 AND archived_at IS NULL)', [boardId]),
      one(db, 'SELECT id, name FROM workspaces WHERE id = $1', [access.board.workspace_id]),
      one(db, 'SELECT 1 FROM board_stars WHERE board_id = $1 AND user_id = $2', [boardId, userId]),
      one(db, `SELECT 1 FROM subscriptions WHERE target_type = 'board' AND target_id = $1 AND user_id = $2`, [boardId, userId]),
    ]);
    // Re-read last_seq after the reads so the client never misses an event (it may get duplicates, which it ignores by seq).
    const fresh = await one(db, 'SELECT * FROM boards WHERE id = $1', [boardId]);
    const listWatches = await many(db, `SELECT target_id FROM subscriptions WHERE user_id = $1 AND target_type = 'list' AND target_id = ANY($2)`, [userId, lists.map((l) => l.id)]);
    return {
      board: { ...boardJson(fresh), starred: !!star, watching: !!watch },
      workspace: ws,
      access: accessJson(access),
      members,
      labels: labels.map(labelJson),
      lists: lists.map(listJson),
      cards,
      watchedListIds: listWatches.map((r) => r.target_id),
      seq: Number(fresh.last_seq),
    };
  }

  app.get('/boards/:id', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    const access = await requireBoard(db, u.id, boardId, 'view');
    return snapshot(u.id, access);
  });

  app.patch('/boards/:id', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    const b = v.body(req.body);
    const onlyBackground = Object.keys(b).every((k) => k === 'background');
    const access = await requireBoard(db, u.id, boardId, onlyBackground ? 'edit' : 'admin');
    const name = v.str(b, 'name', { min: 1, max: 200, optional: true, label: 'Board title' });
    const description = v.str(b, 'description', { max: 16384, optional: true, trim: false });
    const visibility = v.oneOf(b, 'visibility', ['private', 'workspace'] as const, true);
    const background = v.oneOf(b, 'background', BACKGROUNDS, true);
    const prefs: Record<string, unknown> = {};
    if (b.prefs && typeof b.prefs === 'object') {
      const p = b.prefs as Record<string, unknown>;
      if (p.comments !== undefined) prefs.comments = v.oneOf(p, 'comments', ['disabled', 'members', 'observers', 'workspace'] as const);
      if (p.invitations !== undefined) prefs.invitations = v.oneOf(p, 'invitations', ['admins', 'members'] as const);
      if (p.selfJoin !== undefined) prefs.selfJoin = v.bool(p, 'selfJoin');
      if (p.cardCovers !== undefined) prefs.cardCovers = v.bool(p, 'cardCovers');
    }
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(boardId);
      const row = await one(
        m.tx,
        `UPDATE boards SET name = COALESCE($2, name), description = COALESCE($3, description), visibility = COALESCE($4, visibility),
                background = COALESCE($5, background), prefs = prefs || $6::jsonb, updated_at = now() WHERE id = $1 RETURNING *`,
        [boardId, name ?? null, description ?? null, visibility ?? null, background ?? null, prefs],
      );
      const changed: string[] = [];
      if (name !== undefined && name !== access.board.name) changed.push('name');
      if (visibility && visibility !== access.board.visibility) changed.push('visibility');
      if (description !== undefined) changed.push('description');
      if (background) changed.push('background');
      if (Object.keys(prefs).length) changed.push('prefs');
      await m.emit(boardId, 'board.updated', { summary: { changed, name: row.name, from: access.board.name, visibility: row.visibility }, data: { board: boardJson(row) } });
      m.recheck.add(boardId);
      return row;
    });
    return { board: boardJson(data), event: events[0] };
  });

  for (const action of ['close', 'reopen'] as const) {
    app.post(`/boards/:id/${action}`, async (req) => {
      const u = auth(req);
      const boardId = await resolveBoardId(db, (req.params as any).id);
      await requireBoard(db, u.id, boardId, 'admin');
      const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
        await m.lock(boardId);
        const row = await one(m.tx, `UPDATE boards SET closed_at = ${action === 'close' ? 'now()' : 'NULL'}, updated_at = now() WHERE id = $1 RETURNING *`, [boardId]);
        await m.emit(boardId, action === 'close' ? 'board.closed' : 'board.reopened', { summary: { name: row.name }, data: { board: boardJson(row) } });
        m.recheck.add(boardId);
        return row;
      });
      return { board: boardJson(data), event: events[0] };
    });
  }

  app.delete('/boards/:id', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    const access = await requireBoard(db, u.id, boardId, 'admin');
    if (!access.board.closed_at) throw conflict('board_open', 'Close the board before deleting it.');
    const b = v.body(req.body);
    if (b.confirmName !== access.board.name) throw invalid('Type the board title exactly to confirm deletion', { field: 'confirmName' });
    const keys = await fileKeys(db, 'c.board_id = $1', [boardId]);
    await db.query('DELETE FROM boards WHERE id = $1', [boardId]);
    await db.query(`INSERT INTO audit_log (actor_id, action, target, data) VALUES ($1,'board.deleted',$2,$3)`, [u.id, boardId, { name: access.board.name }]);
    await removeFiles(ctx.config.uploadDir, keys);
    ctx.hub.sendToBoard(boardId, { type: 'board.deleted', board: boardId });
    await ctx.hub.recheckBoard(boardId);
    return { ok: true };
  });

  // ---- Members ----
  app.get('/boards/:id/members', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    await requireBoard(db, u.id, boardId, 'view');
    return { members: await boardMembers(db, boardId) };
  });

  // Candidates for adding: workspace members not yet on the board (plus an exact username/email match for guests).
  app.get('/boards/:id/member-candidates', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    const access = await requireBoard(db, u.id, boardId, 'invite');
    const q = String((req.query as any).q ?? '').trim().toLowerCase();
    const rows = await many(
      db,
      `SELECT u.id, u.username, u.full_name, u.initials FROM workspace_members wm JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = $1 AND u.disabled_at IS NULL AND NOT EXISTS (SELECT 1 FROM board_members bm WHERE bm.board_id = $2 AND bm.user_id = u.id)
          AND ($3 = '' OR u.username LIKE '%' || $3 || '%' OR lower(u.full_name) LIKE '%' || $3 || '%')
        ORDER BY u.full_name LIMIT 20`,
      [access.board.workspace_id, boardId, q],
    );
    let guest = null;
    if (q && access.can.admin) {
      guest = await one(
        db,
        `SELECT id, username, full_name, initials FROM users u WHERE (u.username = $1 OR lower(u.email) = $1) AND u.disabled_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = $2 AND wm.user_id = u.id)
          AND NOT EXISTS (SELECT 1 FROM board_members bm WHERE bm.board_id = $3 AND bm.user_id = u.id)`,
        [q, access.board.workspace_id, boardId],
      );
    }
    return { candidates: rows.map(userJson), guest: guest ? userJson(guest) : null };
  });

  app.post('/boards/:id/members', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    const access = await requireBoard(db, u.id, boardId, 'invite');
    const b = v.body(req.body);
    const userId = v.uuid(b, 'userId')!;
    const role = v.oneOf(b, 'role', ['admin', 'member', 'observer'] as const, true) ?? 'member';
    if (role === 'admin' && !access.can.admin) throw forbidden('Only board admins can add other admins.');
    const target = await one(db, 'SELECT * FROM users WHERE id = $1 AND disabled_at IS NULL', [userId]);
    if (!target) throw notFound('User not found');
    const inWs = await one(db, 'SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [access.board.workspace_id, userId]);
    if (!inWs && !access.can.admin) throw forbidden('Only board admins can add guests from outside the workspace.');
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(boardId);
      const exists = await one(m.tx, 'SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2', [boardId, userId]);
      if (exists) throw conflict('already_member', 'That person is already on this board.');
      await m.tx.query('INSERT INTO board_members (board_id, user_id, role) VALUES ($1,$2,$3)', [boardId, userId, role]);
      const members = await boardMembers(m.tx, boardId);
      await m.emit(boardId, 'board.member_added', { summary: { userId, userName: target.full_name, role }, data: { members, userId } });
      await m.notify([userId], 'added_to_board', { boardId, data: { boardName: access.board.name } });
      m.recheck.add(boardId);
      return members;
    });
    return { members: data, event: events[0] };
  });

  async function assertNotLastAdmin(tx: Queryable, boardId: string, userId: string, message: string) {
    const cur = await one(tx, 'SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2', [boardId, userId]);
    if (cur?.role !== 'admin') return cur;
    const n = await one(tx, `SELECT count(*)::int AS n FROM board_members WHERE board_id = $1 AND role = 'admin'`, [boardId]);
    if (n.n <= 1) throw conflict('last_admin', message);
    return cur;
  }

  app.patch('/boards/:id/members/:userId', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    const userId = (req.params as any).userId;
    if (!v.isUuid(userId)) throw notFound();
    await requireBoard(db, u.id, boardId, 'admin');
    const role = v.oneOf(v.body(req.body), 'role', ['admin', 'member', 'observer'] as const)!;
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(boardId);
      const cur = await one(m.tx, 'SELECT role FROM board_members WHERE board_id = $1 AND user_id = $2', [boardId, userId]);
      if (!cur) throw notFound('That person is not on this board');
      if (role !== 'admin') await assertNotLastAdmin(m.tx, boardId, userId, 'A board must keep at least one admin. Make someone else an admin first.');
      await m.tx.query('UPDATE board_members SET role = $3 WHERE board_id = $1 AND user_id = $2', [boardId, userId, role]);
      const members = await boardMembers(m.tx, boardId);
      await m.emit(boardId, 'board.member_role_changed', { summary: { userId, role, from: cur.role }, data: { members, userId, role } });
      if (cur.role !== role) await m.notify([userId], 'role_changed', { boardId, data: { role } });
      m.recheck.add(boardId);
      return members;
    });
    return { members: data, event: events[0] };
  });

  app.delete('/boards/:id/members/:userId', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    const userId = (req.params as any).userId;
    if (!v.isUuid(userId)) throw notFound();
    const self = userId === u.id;
    await requireBoard(db, u.id, boardId, self ? 'view' : 'admin');
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(boardId);
      const cur = await assertNotLastAdmin(
        m.tx,
        boardId,
        userId,
        self ? 'You are the last admin of this board. Make someone else an admin before leaving.' : 'A board must keep at least one admin.',
      );
      if (!cur) throw notFound('That person is not on this board');
      await m.tx.query('DELETE FROM board_members WHERE board_id = $1 AND user_id = $2', [boardId, userId]);
      const removedCards = await many(m.tx, 'DELETE FROM card_members cm USING cards c WHERE cm.card_id = c.id AND c.board_id = $1 AND cm.user_id = $2 RETURNING c.id', [boardId, userId]);
      const members = await boardMembers(m.tx, boardId);
      await m.emit(boardId, 'board.member_removed', { summary: { userId, self }, data: { members, userId, cardIds: removedCards.map((r) => r.id) } });
      if (!self) await m.notify([userId], 'removed_from_board', { boardId: null, data: { boardId } });
      m.recheck.add(boardId);
      return members;
    });
    return { members: data, event: events[0] };
  });

  app.post('/boards/:id/join', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    const access = await requireBoard(db, u.id, boardId, 'view');
    if (!access.can.join) throw forbidden('You cannot join this board yourself. Ask a board admin to add you.');
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(boardId);
      await m.tx.query(`INSERT INTO board_members (board_id, user_id, role) VALUES ($1,$2,'member') ON CONFLICT DO NOTHING`, [boardId, u.id]);
      const members = await boardMembers(m.tx, boardId);
      await m.emit(boardId, 'board.member_added', { summary: { userId: u.id, userName: u.full_name, role: 'member', joined: true }, data: { members, userId: u.id } });
      m.recheck.add(boardId);
      return members;
    });
    const fresh = await boardAccess(db, u.id, boardId);
    return { members: data, access: accessJson(fresh!), event: events[0] };
  });

  // ---- Labels ----
  app.post('/boards/:id/labels', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    await requireBoard(db, u.id, boardId, 'edit');
    const b = v.body(req.body);
    const name = v.str(b, 'name', { max: 100, optional: true }) ?? '';
    const color = b.color === null ? null : v.oneOf(b, 'color', LABEL_COLORS, true) ?? null;
    if (!name && !color) throw invalid('A label needs a name or a colour');
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(boardId);
      const n = await one(m.tx, 'SELECT count(*)::int AS n FROM labels WHERE board_id = $1', [boardId]);
      if (n.n >= LIMITS.labelsPerBoard) throw invalid('This board has reached its label limit', { code: 'limit_exceeded' });
      const label = await one(m.tx, 'INSERT INTO labels (board_id, name, color) VALUES ($1,$2,$3) RETURNING *', [boardId, name, color]);
      await m.emit(boardId, 'label.created', { summary: { name, color }, data: { label: labelJson(label) }, hidden: true });
      return labelJson(label);
    });
    return { label: data, event: events[0] };
  });

  app.patch('/labels/:labelId', async (req) => {
    const u = auth(req);
    const { labelId } = req.params as any;
    if (!v.isUuid(labelId)) throw notFound();
    const label = await one(db, 'SELECT * FROM labels WHERE id = $1', [labelId]);
    if (!label) throw notFound('Label not found');
    await requireBoard(db, u.id, label.board_id, 'edit');
    const b = v.body(req.body);
    const name = v.str(b, 'name', { max: 100, optional: true });
    const color = 'color' in b ? (b.color === null ? null : v.oneOf(b, 'color', LABEL_COLORS)) : label.color;
    const { data, events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(label.board_id);
      const row = await one(m.tx, 'UPDATE labels SET name = COALESCE($2, name), color = $3 WHERE id = $1 RETURNING *', [labelId, name ?? null, color]);
      if (!row.name && !row.color) throw invalid('A label needs a name or a colour');
      await m.emit(label.board_id, 'label.updated', { summary: { name: row.name }, data: { label: labelJson(row) }, hidden: true });
      return labelJson(row);
    });
    return { label: data, event: events[0] };
  });

  app.delete('/labels/:labelId', async (req) => {
    const u = auth(req);
    const { labelId } = req.params as any;
    if (!v.isUuid(labelId)) throw notFound();
    const label = await one(db, 'SELECT * FROM labels WHERE id = $1', [labelId]);
    if (!label) throw notFound('Label not found');
    await requireBoard(db, u.id, label.board_id, 'edit');
    const { events } = await runMutation(ctx, u.id, mutationId(req), async (m) => {
      await m.lock(label.board_id);
      await m.tx.query('DELETE FROM labels WHERE id = $1', [labelId]);
      await m.emit(label.board_id, 'label.deleted', { summary: { name: label.name, color: label.color }, data: { labelId } });
    });
    return { ok: true, event: events[0] };
  });

  // ---- Archive, activity, replay, export ----
  app.get('/boards/:id/archived', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    await requireBoard(db, u.id, boardId, 'view');
    const lists = await many(db, 'SELECT * FROM lists WHERE board_id = $1 AND archived_at IS NOT NULL ORDER BY archived_at DESC', [boardId]);
    const cards = await cardFronts(db, 'c.board_id = $1 AND c.archived_at IS NOT NULL', [boardId]);
    const listNames = Object.fromEntries((await many(db, 'SELECT id, name FROM lists WHERE board_id = $1', [boardId])).map((l) => [l.id, l.name]));
    return { lists: lists.map(listJson), cards: cards.map((c) => ({ ...c, listName: listNames[c.listId] })) };
  });

  app.get('/boards/:id/activity', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    await requireBoard(db, u.id, boardId, 'view');
    const q = req.query as any;
    const before = Number.parseInt(q.before ?? '', 10);
    const limit = Math.min(100, Math.max(1, Number.parseInt(q.limit ?? '50', 10) || 50));
    const commentsOnly = q.filter === 'comments';
    const rows = await many(
      db,
      `SELECT a.seq, a.type, a.card_id, a.list_id, a.summary, a.created_at, u.id AS uid, u.username, u.full_name, u.initials
         FROM activity a LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.board_id = $1 AND ($2::bigint IS NULL OR a.seq < $2) AND NOT COALESCE((a.summary->>'hidden')::boolean, false)
          AND ($4 = false OR a.type = 'comment.added')
        ORDER BY a.seq DESC LIMIT $3`,
      [boardId, Number.isFinite(before) ? before : null, limit, commentsOnly],
    );
    return { items: rows.map(activityJson), nextBefore: rows.length === limit ? rows[rows.length - 1].seq : null };
  });

  app.get('/boards/:id/events', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    const access = await requireBoard(db, u.id, boardId, 'view');
    const since = Number.parseInt((req.query as any).sinceSeq ?? '', 10);
    if (!Number.isFinite(since)) throw invalid('sinceSeq is required');
    const r = await eventsSince(db, boardId, since, Number(access.board.last_seq));
    return { ...r, seq: Number(access.board.last_seq) };
  });

  app.get('/boards/:id/export', async (req, reply) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    const access = await requireBoard(db, u.id, boardId, 'view');
    const cardIds = (await many(db, 'SELECT id FROM cards WHERE board_id = $1', [boardId])).map((r) => r.id);
    const out = {
      format: 'flowdeck-board-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      board: boardJson(access.board),
      members: await boardMembers(db, boardId),
      labels: (await many(db, 'SELECT * FROM labels WHERE board_id = $1 ORDER BY created_at, id', [boardId])).map(labelJson),
      lists: (await many(db, 'SELECT * FROM lists WHERE board_id = $1 ORDER BY position, id', [boardId])).map(listJson),
      cards: (await many(db, 'SELECT * FROM cards WHERE board_id = $1 ORDER BY list_id, position, id', [boardId])).map((c) => ({
        id: c.id, listId: c.list_id, number: c.number, name: c.name, description: c.description, position: c.position,
        startAt: c.start_at, dueAt: c.due_at, dueComplete: c.due_complete, cover: c.cover, archivedAt: c.archived_at, createdAt: c.created_at,
      })),
      cardLabels: await many(db, 'SELECT card_id AS "cardId", label_id AS "labelId" FROM card_labels WHERE card_id = ANY($1)', [cardIds]),
      cardMembers: await many(db, 'SELECT card_id AS "cardId", user_id AS "userId" FROM card_members WHERE card_id = ANY($1)', [cardIds]),
      checklists: await many(db, 'SELECT id, card_id AS "cardId", name, position FROM checklists WHERE card_id = ANY($1) ORDER BY position', [cardIds]),
      checkItems: await many(
        db,
        'SELECT ci.id, ci.checklist_id AS "checklistId", ci.name, ci.position, ci.checked_at AS "checkedAt" FROM check_items ci JOIN checklists cl ON cl.id = ci.checklist_id WHERE cl.card_id = ANY($1) ORDER BY ci.position',
        [cardIds],
      ),
      comments: await many(db, 'SELECT id, card_id AS "cardId", author_id AS "authorId", body, created_at AS "createdAt", edited_at AS "editedAt" FROM comments WHERE card_id = ANY($1) ORDER BY created_at', [cardIds]),
      attachments: await many(db, 'SELECT id, card_id AS "cardId", kind, name, url, mime_type AS "mimeType", bytes, sha256, created_at AS "createdAt" FROM attachments WHERE card_id = ANY($1)', [cardIds]),
      activity: await many(db, 'SELECT seq, type, actor_id AS "actorId", card_id AS "cardId", list_id AS "listId", summary, created_at AS "createdAt" FROM activity WHERE board_id = $1 ORDER BY seq', [boardId]),
    };
    const safeName = access.board.name.replace(/[^A-Za-z0-9._-]+/g, '-').slice(0, 60) || 'board';
    reply.header('Content-Disposition', `attachment; filename="flowdeck-${safeName}.json"`);
    return out;
  });

  // ---- Stars and watching ----
  app.put('/boards/:id/star', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    await requireBoard(db, u.id, boardId, 'view');
    await db.query('INSERT INTO board_stars (user_id, board_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [u.id, boardId]);
    return { starred: true };
  });
  app.delete('/boards/:id/star', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    await requireBoard(db, u.id, boardId, 'view');
    await db.query('DELETE FROM board_stars WHERE user_id = $1 AND board_id = $2', [u.id, boardId]);
    return { starred: false };
  });
  app.put('/boards/:id/watch', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    await requireBoard(db, u.id, boardId, 'view');
    await db.query(`INSERT INTO subscriptions (user_id, target_type, target_id) VALUES ($1,'board',$2) ON CONFLICT DO NOTHING`, [u.id, boardId]);
    return { watching: true };
  });
  app.delete('/boards/:id/watch', async (req) => {
    const u = auth(req);
    const boardId = await resolveBoardId(db, (req.params as any).id);
    await requireBoard(db, u.id, boardId, 'view');
    await db.query(`DELETE FROM subscriptions WHERE user_id = $1 AND target_type = 'board' AND target_id = $2`, [u.id, boardId]);
    return { watching: false };
  });
}

export const activityJson = (r: any) => ({
  seq: r.seq,
  type: r.type,
  cardId: r.card_id,
  listId: r.list_id,
  summary: r.summary,
  createdAt: r.created_at,
  actor: r.uid ? { id: r.uid, username: r.username, fullName: r.full_name, initials: r.initials } : null,
});
