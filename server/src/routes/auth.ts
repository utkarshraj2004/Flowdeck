import type { FastifyInstance, FastifyReply } from 'fastify';
import { auth, SESSION_COOKIE, type Ctx } from '../context.js';
import { many, one, withTx, type Queryable } from '../db.js';
import { HttpError, invalid, notFound } from '../lib/errors.js';
import { hashPassword, randomToken, sha256, verifyPassword } from '../lib/security.js';
import * as v from '../lib/validate.js';
import { boardJson } from '../lib/serialize.js';
import { MUTABLE_NOTIFICATIONS } from '../lib/constants.js';
import { enqueueEmail, mailEnabled } from '../lib/mail.js';
import { createUserToken } from '../lib/tokens.js';

export const meJson = (u: any) => ({
  id: u.id,
  email: u.email,
  username: u.username,
  fullName: u.full_name,
  initials: u.initials,
  isSystemAdmin: u.is_system_admin,
  prefs: { colorBlind: false, shortcuts: true, ...(u.prefs ?? {}) },
});

export async function createSession(ctx: Ctx, reply: FastifyReply, userId: string, userAgent?: string) {
  const token = randomToken();
  const csrf = randomToken(24);
  await ctx.db.query(
    `INSERT INTO sessions (user_id, token_hash, csrf_token, user_agent, expires_at) VALUES ($1,$2,$3,$4, now() + make_interval(days => $5))`,
    [userId, sha256(token), csrf, (userAgent ?? '').slice(0, 300), ctx.config.sessionDays],
  );
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: ctx.config.cookieSecure,
    path: '/',
    maxAge: ctx.config.sessionDays * 86400,
  });
  return csrf;
}

/** Create a workspace with the user as admin (used at setup and sign-up). */
export async function createWorkspace(q: Queryable, userId: string, name: string) {
  const ws = await one(q, `INSERT INTO workspaces (name) VALUES ($1) RETURNING *`, [name.slice(0, 100)]);
  await q.query(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1,$2,'admin')`, [ws.id, userId]);
  return ws;
}

/** Boards a user can see, open or closed. */
export const VISIBLE_BOARDS_SQL = `
  SELECT b.*, (bs.user_id IS NOT NULL) AS starred, bm.role AS board_role, wm.role AS ws_role
    FROM boards b
    LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $1
    LEFT JOIN workspace_members wm ON wm.workspace_id = b.workspace_id AND wm.user_id = $1
    LEFT JOIN board_stars bs ON bs.board_id = b.id AND bs.user_id = $1
   WHERE bm.user_id IS NOT NULL OR wm.role = 'admin' OR (wm.role = 'member' AND b.visibility = 'workspace')`;

export async function authRoutes(app: FastifyInstance, ctx: Ctx) {
  app.post(
    '/auth/login',
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: 60_000,
          keyGenerator: (req: any) => `${req.ip}|${String(req.body?.email ?? '').toLowerCase()}`,
        },
      },
    },
    async (req, reply) => {
      const b = v.body(req.body);
      const ident = typeof b.email === 'string' ? b.email.trim() : '';
      const password = typeof b.password === 'string' ? b.password : '';
      const user = await one(ctx.db, `SELECT * FROM users WHERE (lower(email) = lower($1) OR username = lower($1)) AND disabled_at IS NULL`, [ident]);
      const ok = await verifyPassword(user?.password_hash ?? null, password);
      if (!user || !ok) throw new HttpError(401, 'invalid_credentials', 'Email or password is incorrect.');
      const csrfToken = await createSession(ctx, reply, user.id, req.headers['user-agent']);
      return { user: meJson(user), csrfToken };
    },
  );

  // What the sign-in page may offer (no account details).
  app.get('/auth/options', async () => ({ emailEnabled: mailEnabled(ctx.config) }));

  // Self-service password reset, only when email is configured. The answer never says whether the account exists.
  app.post(
    '/auth/forgot',
    { config: { rateLimit: { max: 5, timeWindow: 60_000, keyGenerator: (req: any) => req.ip } } },
    async (req) => {
      if (!mailEnabled(ctx.config)) throw new HttpError(404, 'email_disabled', 'Password reset by email is not available. Ask your Flowdeck administrator for a reset link.');
      const email = v.email(v.body(req.body));
      const user = await one(ctx.db, 'SELECT id, email, full_name, password_hash FROM users WHERE lower(email) = lower($1) AND disabled_at IS NULL', [email]);
      if (user?.password_hash) {
        const token = await createUserToken(ctx.db, user.id, 'reset');
        await enqueueEmail(ctx.db, ctx.config, {
          userId: user.id,
          to: user.email,
          kind: 'password_reset',
          subject: 'Reset your Flowdeck password',
          text: `Hi ${user.full_name},\n\nSomeone (hopefully you) asked to reset your Flowdeck password. This link works once, for one hour:\n\n${ctx.config.baseUrl}/setup/${token}\n\nIf you did not ask for this, ignore this email; your password stays the same.\n`,
        });
        void ctx.worker.tick();
      }
      return { ok: true, message: 'If an account uses that address, a reset link is on its way.' };
    },
  );

  app.post('/auth/logout', async (req, reply) => {
    if (req.user) await ctx.db.query('DELETE FROM sessions WHERE id = $1', [req.user.session_id]);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/me', async (req) => {
    const u = auth(req);
    return { user: meJson(u), csrfToken: u.csrf_token };
  });

  app.patch('/me', async (req) => {
    const u = auth(req);
    const b = v.body(req.body);
    const fullName = v.str(b, 'fullName', { min: 1, max: 100, optional: true, label: 'Full name' });
    const prefs = typeof b.prefs === 'object' && b.prefs ? (b.prefs as Record<string, unknown>) : undefined;
    const clean: Record<string, unknown> = {};
    if (prefs) {
      if (typeof prefs.colorBlind === 'boolean') clean.colorBlind = prefs.colorBlind;
      if (typeof prefs.shortcuts === 'boolean') clean.shortcuts = prefs.shortcuts;
      if (typeof prefs.labelNames === 'boolean') clean.labelNames = prefs.labelNames;
      if (typeof prefs.emailNotifications === 'boolean') clean.emailNotifications = prefs.emailNotifications;
      if (Array.isArray(prefs.mutedNotifications))
        clean.mutedNotifications = [...new Set(prefs.mutedNotifications.filter((k): k is string => (MUTABLE_NOTIFICATIONS as readonly unknown[]).includes(k)))];
    }
    const row = await one(
      ctx.db,
      `UPDATE users SET full_name = COALESCE($2, full_name), initials = COALESCE($3, initials), prefs = prefs || $4::jsonb, updated_at = now() WHERE id = $1 RETURNING *`,
      [u.id, fullName ?? null, fullName ? v.initialsFor(fullName) : null, clean],
    );
    return { user: meJson(row) };
  });

  app.post('/me/password', async (req) => {
    const u = auth(req);
    const b = v.body(req.body);
    const row = await one(ctx.db, 'SELECT password_hash FROM users WHERE id = $1', [u.id]);
    if (!(await verifyPassword(row.password_hash, String(b.currentPassword ?? ''))))
      throw invalid('Current password is incorrect', { field: 'currentPassword' });
    const pw = v.password(b, 'newPassword');
    await ctx.db.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [u.id, await hashPassword(pw)]);
    await ctx.db.query('DELETE FROM sessions WHERE user_id = $1 AND id <> $2', [u.id, u.session_id]);
    return { ok: true };
  });

  // Home: workspaces, boards and stars for the signed-in user.
  app.get('/me/home', async (req) => {
    const u = auth(req);
    const workspaces = await many(
      ctx.db,
      `SELECT w.id, w.name, w.description, w.settings, wm.role FROM workspaces w JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $1 ORDER BY w.name`,
      [u.id],
    );
    const boards = await many(ctx.db, `${VISIBLE_BOARDS_SQL} ORDER BY b.name`, [u.id]);
    // Guest boards: boards in workspaces the user is not a member of.
    const guestWs = await many(
      ctx.db,
      `SELECT DISTINCT w.id, w.name FROM workspaces w JOIN boards b ON b.workspace_id = w.id JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $1
        WHERE NOT EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = w.id AND wm.user_id = $1) ORDER BY w.name`,
      [u.id],
    );
    return {
      workspaces: workspaces.map((w) => ({ id: w.id, name: w.name, description: w.description, settings: w.settings, role: w.role })),
      guestWorkspaces: guestWs,
      boards: boards.map((b) => ({ ...boardJson(b), role: b.ws_role === 'admin' ? 'admin' : b.board_role ?? 'viewer' })),
    };
  });

  // One-time setup / reset links (created by the CLI or a system admin).
  app.get('/setup/:token', async (req) => {
    const { token } = req.params as { token: string };
    const row = await one(
      ctx.db,
      `SELECT t.kind, u.email, u.full_name, u.username, u.password_hash IS NOT NULL AS has_password FROM user_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now() AND u.disabled_at IS NULL`,
      [sha256(token)],
    );
    if (!row) throw notFound('This link is invalid or has expired. Ask your Flowdeck administrator for a new one.');
    return { kind: row.kind, email: row.email, fullName: row.has_password ? row.full_name : '', username: row.has_password ? row.username : '' };
  });

  app.post('/setup/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const b = v.body(req.body);
    const result = await withTx(ctx.db, async (tx) => {
      const t = await one(
        tx,
        `SELECT t.*, u.password_hash FROM user_tokens t JOIN users u ON u.id = t.user_id
          WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now() AND u.disabled_at IS NULL FOR UPDATE OF t`,
        [sha256(token)],
      );
      if (!t) throw notFound('This link is invalid or has expired. Ask your Flowdeck administrator for a new one.');
      const pw = v.password(b);
      if (t.kind === 'setup') {
        const fullName = v.str(b, 'fullName', { min: 1, max: 100, label: 'Full name' })!;
        const username = v.username(b);
        const clash = await one(tx, 'SELECT 1 FROM users WHERE username = $1 AND id <> $2', [username, t.user_id]);
        if (clash) throw invalid('That username is taken', { field: 'username' });
        await tx.query(
          `UPDATE users SET full_name = $2, username = $3, initials = $4, password_hash = $5, updated_at = now() WHERE id = $1`,
          [t.user_id, fullName, username, v.initialsFor(fullName), await hashPassword(pw)],
        );
        const hasWs = await one(tx, 'SELECT 1 FROM workspace_members WHERE user_id = $1', [t.user_id]);
        if (!hasWs) await createWorkspace(tx, t.user_id, `${fullName}'s workspace`);
      } else {
        await tx.query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [t.user_id, await hashPassword(pw)]);
        await tx.query('DELETE FROM sessions WHERE user_id = $1', [t.user_id]);
      }
      await tx.query('UPDATE user_tokens SET used_at = now() WHERE id = $1', [t.id]);
      return one(tx, 'SELECT * FROM users WHERE id = $1', [t.user_id]);
    });
    const csrfToken = await createSession(ctx, reply, result.id, req.headers['user-agent']);
    return { user: meJson(result), csrfToken };
  });
}
