import type { FastifyInstance } from 'fastify';
import { auth, type Ctx } from '../context.js';
import { many, one, withTx } from '../db.js';
import { conflict, forbidden, HttpError, invalid, notFound } from '../lib/errors.js';
import { requireWorkspace } from '../lib/permissions.js';
import { hashPassword, randomToken, sha256 } from '../lib/security.js';
import { boardJson, boardMembers, userJson } from '../lib/serialize.js';
import { fileKeys, removeFiles } from '../lib/files.js';
import * as v from '../lib/validate.js';
import { createSession, createWorkspace, meJson, VISIBLE_BOARDS_SQL } from './auth.js';
import { runMutation } from '../lib/mutation.js';

const inviteJson = (i: any, url?: string) => ({
  id: i.id,
  kind: i.kind,
  email: i.email,
  role: i.role,
  createdAt: i.created_at,
  expiresAt: i.expires_at,
  revokedAt: i.revoked_at,
  acceptedAt: i.accepted_at,
  useCount: i.use_count,
  ...(url ? { url } : {}),
});

export async function workspaceRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, hub } = ctx;

  async function workspaceBoardIds(workspaceId: string): Promise<string[]> {
    return (await many(db, 'SELECT id FROM boards WHERE workspace_id = $1', [workspaceId])).map((r) => r.id);
  }

  app.get('/workspaces', async (req) => {
    const u = auth(req);
    const rows = await many(
      db,
      `SELECT w.*, wm.role FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $1 ORDER BY w.name`,
      [u.id],
    );
    return { workspaces: rows.map((w) => ({ id: w.id, name: w.name, description: w.description, settings: w.settings, role: w.role })) };
  });

  app.post('/workspaces', async (req) => {
    const u = auth(req);
    const b = v.body(req.body);
    const name = v.str(b, 'name', { min: 1, max: 100, label: 'Workspace name' })!;
    const description = v.str(b, 'description', { max: 2000, optional: true }) ?? '';
    const ws = await withTx(db, async (tx) => {
      const ws = await createWorkspace(tx, u.id, name);
      await tx.query('UPDATE workspaces SET description = $2 WHERE id = $1', [ws.id, description]);
      return ws;
    });
    return { workspace: { id: ws.id, name: ws.name, description, settings: ws.settings, role: 'admin' } };
  });

  app.get('/workspaces/:id', async (req) => {
    const u = auth(req);
    const { id } = req.params as { id: string };
    if (!v.isUuid(id)) throw notFound('Workspace not found');
    const { workspace, role } = await requireWorkspace(db, u.id, id, 'view');
    const members = await many(
      db,
      `SELECT u.id, u.username, u.full_name, u.initials, wm.role, wm.joined_at FROM workspace_members wm JOIN users u ON u.id = wm.user_id
        WHERE wm.workspace_id = $1 ORDER BY u.full_name`,
      [id],
    );
    const guests = await many(
      db,
      `SELECT DISTINCT u.id, u.username, u.full_name, u.initials FROM board_members bm JOIN boards b ON b.id = bm.board_id JOIN users u ON u.id = bm.user_id
        WHERE b.workspace_id = $1 AND NOT EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = $1 AND wm.user_id = u.id)`,
      [id],
    );
    const boards = await many(db, `${VISIBLE_BOARDS_SQL} AND b.workspace_id = $2 ORDER BY b.name`, [u.id, id]);
    const canInvite = role === 'admin' || !!workspace.settings?.membersCanInvite;
    const invites = canInvite
      ? await many(db, `SELECT * FROM invites WHERE workspace_id = $1 AND revoked_at IS NULL AND accepted_at IS NULL AND (expires_at IS NULL OR expires_at > now()) ORDER BY created_at DESC`, [id])
      : [];
    return {
      workspace: { id: workspace.id, name: workspace.name, description: workspace.description, settings: workspace.settings, role },
      members: members.map((m) => ({ ...userJson(m), role: m.role, joinedAt: m.joined_at })),
      guests: guests.map(userJson),
      boards: boards.map((b) => ({ ...boardJson(b), role: b.ws_role === 'admin' ? 'admin' : b.board_role ?? 'viewer' })),
      invites: invites.map((i) => inviteJson(i)),
      canInvite,
    };
  });

  app.patch('/workspaces/:id', async (req) => {
    const u = auth(req);
    const { id } = req.params as { id: string };
    if (!v.isUuid(id)) throw notFound('Workspace not found');
    await requireWorkspace(db, u.id, id, 'admin');
    const b = v.body(req.body);
    const name = v.str(b, 'name', { min: 1, max: 100, optional: true, label: 'Workspace name' });
    const description = v.str(b, 'description', { max: 2000, optional: true });
    const settings: Record<string, unknown> = {};
    if (b.settings && typeof b.settings === 'object') {
      const s = b.settings as Record<string, unknown>;
      if (typeof s.membersCanInvite === 'boolean') settings.membersCanInvite = s.membersCanInvite;
      if (s.defaultBoardVisibility === 'private' || s.defaultBoardVisibility === 'workspace') settings.defaultBoardVisibility = s.defaultBoardVisibility;
    }
    const w = await one(
      db,
      `UPDATE workspaces SET name = COALESCE($2, name), description = COALESCE($3, description), settings = settings || $4::jsonb, updated_at = now() WHERE id = $1 RETURNING *`,
      [id, name ?? null, description ?? null, settings],
    );
    return { workspace: { id: w.id, name: w.name, description: w.description, settings: w.settings, role: 'admin' } };
  });

  app.delete('/workspaces/:id', async (req) => {
    const u = auth(req);
    const { id } = req.params as { id: string };
    if (!v.isUuid(id)) throw notFound('Workspace not found');
    const { workspace } = await requireWorkspace(db, u.id, id, 'admin');
    const b = v.body(req.body);
    if (b.confirmName !== workspace.name) throw invalid('Type the workspace name exactly to confirm deletion', { field: 'confirmName' });
    const boardIds = await workspaceBoardIds(id);
    const keys = await withTx(db, async (tx) => {
      const keys = await fileKeys(tx, 'c.board_id = ANY($1)', [boardIds]);
      await tx.query('DELETE FROM workspaces WHERE id = $1', [id]);
      await tx.query(`INSERT INTO audit_log (actor_id, action, target) VALUES ($1, 'workspace.deleted', $2)`, [u.id, id]);
      return keys;
    });
    await removeFiles(ctx.config.uploadDir, keys);
    for (const bid of boardIds) {
      hub.sendToBoard(bid, { type: 'board.access_revoked', board: bid });
      await hub.recheckBoard(bid);
    }
    return { ok: true };
  });

  app.get('/workspaces/:id/boards', async (req) => {
    const u = auth(req);
    const { id } = req.params as { id: string };
    if (!v.isUuid(id)) throw notFound('Workspace not found');
    await requireWorkspace(db, u.id, id, 'view');
    const filter = (req.query as any).filter ?? 'open';
    const cond = filter === 'closed' ? 'AND b.closed_at IS NOT NULL' : filter === 'all' ? '' : 'AND b.closed_at IS NULL';
    const rows = await many(db, `${VISIBLE_BOARDS_SQL} AND b.workspace_id = $2 ${cond} ORDER BY b.name`, [u.id, id]);
    return { boards: rows.map((b) => ({ ...boardJson(b), role: b.ws_role === 'admin' ? 'admin' : b.board_role ?? 'viewer' })) };
  });

  // Role change. The last admin cannot be demoted (409 last_admin).
  app.patch('/workspaces/:id/members/:userId', async (req) => {
    const u = auth(req);
    const { id, userId } = req.params as { id: string; userId: string };
    if (!v.isUuid(id) || !v.isUuid(userId)) throw notFound();
    await requireWorkspace(db, u.id, id, 'admin');
    const role = v.oneOf(v.body(req.body), 'role', ['admin', 'member'] as const)!;
    await withTx(db, async (tx) => {
      await tx.query('SELECT id FROM workspaces WHERE id = $1 FOR UPDATE', [id]);
      const cur = await one(tx, 'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [id, userId]);
      if (!cur) throw notFound('That person is not a member of this workspace');
      if (cur.role === 'admin' && role !== 'admin') {
        const n = await one(tx, `SELECT count(*)::int AS n FROM workspace_members WHERE workspace_id = $1 AND role = 'admin'`, [id]);
        if (n.n <= 1) throw conflict('last_admin', 'A workspace must keep at least one admin. Make someone else an admin first.');
      }
      await tx.query('UPDATE workspace_members SET role = $3 WHERE workspace_id = $1 AND user_id = $2', [id, userId, role]);
      await tx.query(`INSERT INTO audit_log (actor_id, action, target, data) VALUES ($1, 'workspace.role_changed', $2, $3)`, [u.id, id, { userId, role }]);
    });
    await hub.recheckBoards(await workspaceBoardIds(id));
    return { ok: true, role };
  });

  // Remove a member (admin) or leave (self). keepBoards=true keeps their board memberships (they become a guest).
  app.delete('/workspaces/:id/members/:userId', async (req) => {
    const u = auth(req);
    const { id, userId } = req.params as { id: string; userId: string };
    if (!v.isUuid(id) || !v.isUuid(userId)) throw notFound();
    const self = userId === u.id;
    const { role: actorRole } = await requireWorkspace(db, u.id, id, 'view');
    if (!self && actorRole !== 'admin') throw forbidden('Only workspace admins can remove members.');
    const keepBoards = (req.query as any).keepBoards === 'true';
    await runMutation(ctx, u.id, null, async (m) => {
      const tx = m.tx;
      await tx.query('SELECT id FROM workspaces WHERE id = $1 FOR UPDATE', [id]);
      const cur = await one(tx, 'SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [id, userId]);
      if (!cur) throw notFound('That person is not a member of this workspace');
      if (cur.role === 'admin') {
        const n = await one(tx, `SELECT count(*)::int AS n FROM workspace_members WHERE workspace_id = $1 AND role = 'admin'`, [id]);
        if (n.n <= 1)
          throw conflict('last_admin', self ? 'You are the last admin of this workspace. Make someone else an admin before leaving.' : 'A workspace must keep at least one admin.');
      }
      await tx.query('DELETE FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [id, userId]);
      if (!keepBoards) {
        const boards = await many(tx, `SELECT bm.board_id, bm.role FROM board_members bm JOIN boards b ON b.id = bm.board_id WHERE b.workspace_id = $1 AND bm.user_id = $2`, [id, userId]);
        for (const bm of boards) {
          await m.lock(bm.board_id);
          if (bm.role === 'admin') {
            const n = await one(tx, `SELECT count(*)::int AS n FROM board_members WHERE board_id = $1 AND role = 'admin'`, [bm.board_id]);
            if (n.n <= 1) {
              if (self) throw conflict('last_admin', 'You are the only admin of a board in this workspace. Make someone else its admin first.', { boardId: bm.board_id });
              // The removing workspace admin takes over the board so it never becomes adminless.
              await tx.query(
                `INSERT INTO board_members (board_id, user_id, role) VALUES ($1,$2,'admin') ON CONFLICT (board_id, user_id) DO UPDATE SET role = 'admin'`,
                [bm.board_id, u.id],
              );
            }
          }
          await tx.query('DELETE FROM board_members WHERE board_id = $1 AND user_id = $2', [bm.board_id, userId]);
          await tx.query('DELETE FROM card_members cm USING cards c WHERE cm.card_id = c.id AND c.board_id = $1 AND cm.user_id = $2', [bm.board_id, userId]);
          await m.emit(bm.board_id, 'board.member_removed', { summary: { userId }, data: { members: await boardMembers(tx, bm.board_id), userId } });
        }
      }
      await tx.query(`INSERT INTO audit_log (actor_id, action, target, data) VALUES ($1, $2, $3, $4)`, [u.id, self ? 'workspace.left' : 'workspace.member_removed', id, { userId, keepBoards }]);
      if (!self) {
        const ws = await one(tx, 'SELECT name FROM workspaces WHERE id = $1', [id]);
        await m.notify([userId], 'removed_from_workspace', { boardId: null, data: { workspaceName: ws.name, keepBoards } });
      }
    });
    await hub.recheckBoards(await workspaceBoardIds(id));
    return { ok: true };
  });

  // ---- Invitations ----
  app.get('/workspaces/:id/invites', async (req) => {
    const u = auth(req);
    const { id } = req.params as { id: string };
    if (!v.isUuid(id)) throw notFound('Workspace not found');
    await requireWorkspace(db, u.id, id, 'invite');
    const rows = await many(db, `SELECT * FROM invites WHERE workspace_id = $1 AND revoked_at IS NULL AND accepted_at IS NULL AND (expires_at IS NULL OR expires_at > now()) ORDER BY created_at DESC`, [id]);
    return { invites: rows.map((i) => inviteJson(i)) };
  });

  app.post('/workspaces/:id/invites', async (req) => {
    const u = auth(req);
    const { id } = req.params as { id: string };
    if (!v.isUuid(id)) throw notFound('Workspace not found');
    const { role: actorRole } = await requireWorkspace(db, u.id, id, 'invite');
    const b = v.body(req.body);
    const kind = v.oneOf(b, 'kind', ['link', 'email'] as const)!;
    const role = v.oneOf(b, 'role', ['admin', 'member'] as const, true) ?? 'member';
    if (role === 'admin' && actorRole !== 'admin') throw forbidden('Only workspace admins can invite other admins.');
    const email = kind === 'email' ? v.email(b) : null;
    if (email) {
      const existing = await one(db, `SELECT 1 FROM workspace_members wm JOIN users u ON u.id = wm.user_id WHERE wm.workspace_id = $1 AND lower(u.email) = lower($2)`, [id, email]);
      if (existing) throw conflict('already_member', 'That person is already a member of this workspace.');
    }
    const token = randomToken();
    const inv = await one(
      db,
      `INSERT INTO invites (workspace_id, kind, email, role, token_hash, created_by, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6, ${kind === 'email' ? "now() + interval '7 days'" : 'NULL'}) RETURNING *`,
      [id, kind, email, role, sha256(token), u.id],
    );
    // Read back so the response always reflects a stored invitation (never a silent no-op).
    const stored = await one(db, 'SELECT * FROM invites WHERE id = $1', [inv.id]);
    return { invite: inviteJson(stored, `${ctx.config.baseUrl}/invite/${token}`) };
  });

  app.delete('/invites/:inviteId', async (req) => {
    const u = auth(req);
    const { inviteId } = req.params as { inviteId: string };
    if (!v.isUuid(inviteId)) throw notFound();
    const inv = await one(db, 'SELECT * FROM invites WHERE id = $1', [inviteId]);
    if (!inv) throw notFound('Invitation not found');
    const { role } = await requireWorkspace(db, u.id, inv.workspace_id, 'invite');
    if (role !== 'admin' && inv.created_by !== u.id) throw forbidden('Only workspace admins can revoke other people’s invitations.');
    await db.query('UPDATE invites SET revoked_at = now() WHERE id = $1', [inviteId]);
    return { ok: true };
  });

  async function loadInvite(q: any, token: string, lock = false) {
    const inv = await one(
      q,
      `SELECT i.*, w.name AS workspace_name FROM invites i JOIN workspaces w ON w.id = i.workspace_id WHERE i.token_hash = $1 ${lock ? 'FOR UPDATE OF i' : ''}`,
      [sha256(token)],
    );
    if (!inv) return { inv: null, reason: 'This invite is no longer valid.' };
    if (inv.revoked_at) return { inv, reason: 'This invite is no longer valid. It was revoked.' };
    if (inv.accepted_at) return { inv, reason: 'This invite has already been used.' };
    if (inv.expires_at && Date.parse(inv.expires_at) < Date.now()) return { inv, reason: 'This invite has expired. Ask for a new one.' };
    return { inv, reason: null };
  }

  app.get('/invites/:token', async (req) => {
    const { token } = req.params as { token: string };
    const { inv, reason } = await loadInvite(db, token);
    if (!inv || reason) return { valid: false, reason };
    let alreadyMember = false;
    if (req.user) alreadyMember = !!(await one(db, 'SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [inv.workspace_id, req.user.id]));
    return { valid: true, workspace: { id: inv.workspace_id, name: inv.workspace_name }, kind: inv.kind, email: inv.email, role: inv.role, alreadyMember };
  });

  async function join(tx: any, inv: any, userId: string, email: string) {
    if (inv.kind === 'email' && inv.email.toLowerCase() !== email.toLowerCase())
      throw forbidden(`This invitation was sent to ${inv.email}. Log in with that account to accept it.`);
    await tx.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,$3)
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = CASE WHEN workspace_members.role = 'admin' THEN 'admin' ELSE EXCLUDED.role END`,
      [inv.workspace_id, userId, inv.role],
    );
    if (inv.kind === 'email') await tx.query('UPDATE invites SET accepted_at = now(), accepted_by = $2, use_count = use_count + 1 WHERE id = $1', [inv.id, userId]);
    else await tx.query('UPDATE invites SET use_count = use_count + 1 WHERE id = $1', [inv.id]);
  }

  app.post('/invites/:token/accept', async (req) => {
    const u = auth(req);
    const { token } = req.params as { token: string };
    let workspaceId = '';
    await runMutation(ctx, u.id, null, async (m) => {
      const { inv, reason } = await loadInvite(m.tx, token, true);
      if (!inv || reason) throw new HttpError(410, 'invite_invalid', reason ?? 'This invite is no longer valid.');
      await join(m.tx, inv, u.id, u.email);
      workspaceId = inv.workspace_id;
      if (inv.created_by) await m.notify([inv.created_by], 'invite_accepted', { boardId: null, data: { workspaceName: inv.workspace_name, userName: u.full_name } });
    });
    await hub.recheckBoards(await workspaceBoardIds(workspaceId));
    return { ok: true, workspaceId };
  });

  // Logged-out invitee creates an account and joins in one step.
  app.post('/invites/:token/signup', async (req, reply) => {
    if (req.user) throw conflict('already_logged_in', 'You are already logged in. Accept the invitation instead.');
    const { token } = req.params as { token: string };
    const b = v.body(req.body);
    const fullName = v.str(b, 'fullName', { min: 1, max: 100, label: 'Full name' })!;
    const username = v.username(b);
    const email = v.email(b);
    const pw = v.password(b);
    const pwHash = await hashPassword(pw);
    const user = await withTx(db, async (tx) => {
      const { inv, reason } = await loadInvite(tx, token, true);
      if (!inv || reason) throw new HttpError(410, 'invite_invalid', reason ?? 'This invite is no longer valid.');
      if (await one(tx, 'SELECT 1 FROM users WHERE lower(email) = lower($1)', [email]))
        throw invalid('An account with this email already exists. Log in, then open the invite link again.', { field: 'email' });
      if (await one(tx, 'SELECT 1 FROM users WHERE username = $1', [username])) throw invalid('That username is taken', { field: 'username' });
      const user = await one(
        tx,
        `INSERT INTO users (email, username, full_name, initials, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [email, username, fullName, v.initialsFor(fullName), pwHash],
      );
      await join(tx, inv, user.id, email);
      if (inv.created_by)
        await tx.query(`INSERT INTO notifications (user_id, kind, actor_id, data) VALUES ($1, 'invite_accepted', $2, $3)`, [
          inv.created_by,
          user.id,
          { workspaceName: inv.workspace_name, userName: fullName },
        ]);
      return user;
    });
    const csrfToken = await createSession(ctx, reply, user.id, req.headers['user-agent']);
    return { user: meJson(user), csrfToken };
  });
}
