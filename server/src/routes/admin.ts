import type { FastifyInstance, FastifyRequest } from 'fastify';
import { auth, type Ctx } from '../context.js';
import { many, one, withTx } from '../db.js';
import { conflict, forbidden, invalid, notFound } from '../lib/errors.js';
import { createUserToken } from '../lib/tokens.js';
import { randomToken } from '../lib/security.js';
import * as v from '../lib/validate.js';
import { LATEST_SCHEMA } from '../migrate.js';

function sysadmin(req: FastifyRequest) {
  const u = auth(req);
  if (!u.is_system_admin) throw forbidden('Only system administrators can do this.');
  return u;
}

export async function adminRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db } = ctx;

  app.get('/admin/status', async (req) => {
    sysadmin(req);
    const { VERSION } = await import('../app.js');
    const counts = await one(
      db,
      `SELECT (SELECT count(*) FROM users)::int AS users, (SELECT count(*) FROM workspaces)::int AS workspaces, (SELECT count(*) FROM boards)::int AS boards,
              (SELECT count(*) FROM cards)::int AS cards, (SELECT COALESCE(sum(bytes), 0) FROM attachments)::bigint AS upload_bytes,
              (SELECT max(version) FROM schema_migrations)::int AS schema`,
    );
    return { version: VERSION, schema: counts.schema, latestSchema: LATEST_SCHEMA(), counts: { ...counts, upload_bytes: Number(counts.upload_bytes) }, maxUploadBytes: ctx.config.maxUploadBytes, baseUrl: ctx.config.baseUrl };
  });

  app.get('/admin/users', async (req) => {
    sysadmin(req);
    const rows = await many(
      db,
      `SELECT u.id, u.email, u.username, u.full_name, u.is_system_admin, u.disabled_at, u.created_at, u.password_hash IS NOT NULL AS active,
              (SELECT max(last_seen_at) FROM sessions s WHERE s.user_id = u.id) AS last_seen
         FROM users u ORDER BY u.created_at`,
    );
    return {
      users: rows.map((u) => ({ id: u.id, email: u.email, username: u.username, fullName: u.full_name, isSystemAdmin: u.is_system_admin, disabledAt: u.disabled_at, createdAt: u.created_at, lastSeen: u.last_seen, setupComplete: u.active })),
    };
  });

  app.post('/admin/users', async (req) => {
    const me = sysadmin(req);
    const b = v.body(req.body);
    const email = v.email(b);
    const isSystemAdmin = v.bool(b, 'isSystemAdmin') ?? false;
    if (await one(db, 'SELECT 1 FROM users WHERE lower(email) = lower($1)', [email])) throw conflict('email_taken', 'An account with this email already exists.');
    const token = await withTx(db, async (tx) => {
      const user = await one(
        tx,
        `INSERT INTO users (email, username, full_name, initials, is_system_admin) VALUES ($1, $2, $3, '?', $4) RETURNING id`,
        [email, `pending_${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, '')}`.slice(0, 32), email.split('@')[0].slice(0, 100) || 'New user', isSystemAdmin],
      );
      await tx.query(`INSERT INTO audit_log (actor_id, action, target) VALUES ($1,'user.created',$2)`, [me.id, user.id]);
      return createUserToken(tx, user.id, 'setup');
    });
    return { setupUrl: `${ctx.config.baseUrl}/setup/${token}`, expiresInHours: 24 };
  });

  app.patch('/admin/users/:userId', async (req) => {
    const me = sysadmin(req);
    const { userId } = req.params as { userId: string };
    if (!v.isUuid(userId)) throw notFound('User not found');
    const b = v.body(req.body);
    const disabled = v.bool(b, 'disabled');
    const isSystemAdmin = v.bool(b, 'isSystemAdmin');
    if (userId === me.id && (disabled === true || isSystemAdmin === false)) throw invalid('You cannot disable yourself or remove your own administrator role.');
    await withTx(db, async (tx) => {
      const user = await one(tx, 'SELECT * FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (!user) throw notFound('User not found');
      await tx.query(
        `UPDATE users SET disabled_at = CASE WHEN $2::boolean IS NULL THEN disabled_at WHEN $2 THEN COALESCE(disabled_at, now()) ELSE NULL END,
                          is_system_admin = COALESCE($3, is_system_admin), updated_at = now() WHERE id = $1`,
        [userId, disabled ?? null, isSystemAdmin ?? null],
      );
      if (disabled) await tx.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
      await tx.query(`INSERT INTO audit_log (actor_id, action, target, data) VALUES ($1,'user.updated',$2,$3)`, [me.id, userId, { disabled, isSystemAdmin }]);
    });
    if (disabled) await ctx.hub.recheckUserBoards(userId);
    return { ok: true };
  });

  app.post('/admin/users/:userId/reset-link', async (req) => {
    const me = sysadmin(req);
    const { userId } = req.params as { userId: string };
    if (!v.isUuid(userId)) throw notFound('User not found');
    const user = await one(db, 'SELECT id, password_hash FROM users WHERE id = $1', [userId]);
    if (!user) throw notFound('User not found');
    const kind = user.password_hash ? 'reset' : 'setup';
    const token = await createUserToken(db, userId, kind);
    await db.query(`INSERT INTO audit_log (actor_id, action, target) VALUES ($1,'user.reset_link',$2)`, [me.id, userId]);
    return { url: `${ctx.config.baseUrl}/setup/${token}`, kind, expiresInHours: kind === 'setup' ? 24 : 1 };
  });
}
