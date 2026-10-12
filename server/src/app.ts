import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import type { Config } from './config.js';
import { createPool, type Db } from './db.js';
import { Hub } from './lib/hub.js';
import { HttpError } from './lib/errors.js';
import { sha256, timingSafeEqualStr } from './lib/security.js';
import { SESSION_COOKIE, type Ctx } from './context.js';
import { LATEST_SCHEMA } from './migrate.js';
import { authRoutes } from './routes/auth.js';
import { workspaceRoutes } from './routes/workspaces.js';
import { boardRoutes } from './routes/boards.js';
import { listRoutes } from './routes/lists.js';
import { cardRoutes } from './routes/cards.js';
import { cardDetailRoutes } from './routes/card-details.js';
import { attachmentRoutes } from './routes/attachments.js';
import { searchRoutes } from './routes/search.js';
import { notificationRoutes } from './routes/notifications.js';
import { adminRoutes } from './routes/admin.js';
import { wsRoutes } from './routes/ws.js';

export const VERSION = '0.1.0';

const PUBLIC_UNSAFE = new Set(['/api/v1/auth/login']);

export async function buildApp(config: Config, opts: { db?: Db; logger?: boolean } = {}): Promise<FastifyInstance & { ctx: Ctx }> {
  const db = opts.db ?? createPool(config.databaseUrl);
  const hub = new Hub(db);
  const ctx: Ctx = { db, hub, config };
  fs.mkdirSync(config.uploadDir, { recursive: true });

  const app = Fastify({
    logger: opts.logger ?? false,
    trustProxy: config.trustProxy,
    bodyLimit: 1024 * 1024,
  }) as unknown as FastifyInstance & { ctx: Ctx };
  app.decorate('ctx', ctx);
  app.decorateRequest('user', null);

  await app.register(cookie);
  // preHandler so the login limiter can key on the submitted email (body is parsed by then).
  await app.register(rateLimit, { global: false, hook: 'preHandler' });
  await app.register(multipart, { limits: { fileSize: config.maxUploadBytes, files: 1, fields: 5 } });
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });

  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'DENY');
    if (!reply.getHeader('Content-Security-Policy'))
      reply.header(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      );
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    return payload;
  });

  // Session lookup + CSRF check for every API request.
  app.addHook('onRequest', async (req) => {
    if (!req.url.startsWith('/api/')) return;
    const token = req.cookies[SESSION_COOKIE];
    if (token) {
      const r = await db.query(
        `SELECT u.id, u.email, u.username, u.full_name, u.initials, u.is_system_admin, u.prefs,
                s.id AS session_id, s.csrf_token, s.last_seen_at
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = $1 AND s.expires_at > now() AND u.disabled_at IS NULL`,
        [sha256(token)],
      );
      const row = r.rows[0];
      if (row) {
        req.user = row;
        if (Date.now() - Date.parse(row.last_seen_at) > 60_000)
          await db.query('UPDATE sessions SET last_seen_at = now() WHERE id = $1', [row.session_id]);
      }
    }
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const pathOnly = req.url.split('?')[0];
    if (unsafe && req.user && !PUBLIC_UNSAFE.has(pathOnly)) {
      const header = req.headers['x-csrf-token'];
      if (typeof header !== 'string' || !timingSafeEqualStr(header, req.user.csrf_token))
        throw new HttpError(403, 'csrf_failed', 'Your session token is missing or stale. Reload the page and try again.');
    }
  });

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err.code === 'FST_REQ_FILE_TOO_LARGE' || err.code === 'FST_FILES_LIMIT') {
      const mb = Math.round(config.maxUploadBytes / 1024 / 1024);
      return reply.status(413).send({ error: { code: 'payload_too_large', message: `File is larger than ${mb} MB`, details: { maxBytes: config.maxUploadBytes } } });
    }
    if (err.statusCode === 429) {
      return reply.status(429).send({ error: { code: 'rate_limited', message: 'Too many attempts. Wait a minute and try again.', details: {} } });
    }
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.status(err.statusCode).send({ error: { code: 'bad_request', message: err.message, details: {} } });
    }
    if (err.code === '23505') {
      return reply.status(409).send({ error: { code: 'conflict', message: 'That value is already in use.', details: { constraint: err.constraint } } });
    }
    if (err.code === '23514') {
      return reply.status(422).send({ error: { code: 'validation_failed', message: 'A value is outside the allowed range.', details: { constraint: err.constraint } } });
    }
    req.log.error(err);
    return reply.status(500).send({ error: { code: 'internal', message: 'Something went wrong on the server.', details: {} } });
  });

  app.get('/healthz', async () => ({ ok: true }));
  app.get('/readyz', async (_req, reply) => {
    try {
      const r = await db.query('SELECT max(version) AS v FROM schema_migrations');
      fs.accessSync(config.uploadDir, fs.constants.W_OK);
      const schema = r.rows[0].v ?? 0;
      if (schema < LATEST_SCHEMA()) return reply.status(503).send({ ok: false, reason: 'migrations pending' });
      return { ok: true, version: VERSION, schema };
    } catch (e) {
      return reply.status(503).send({ ok: false, reason: (e as Error).message });
    }
  });

  await app.register(
    async (api) => {
      await authRoutes(api, ctx);
      await workspaceRoutes(api, ctx);
      await boardRoutes(api, ctx);
      await listRoutes(api, ctx);
      await cardRoutes(api, ctx);
      await cardDetailRoutes(api, ctx);
      await attachmentRoutes(api, ctx);
      await searchRoutes(api, ctx);
      await notificationRoutes(api, ctx);
      await adminRoutes(api, ctx);
      await wsRoutes(api, ctx);
    },
    { prefix: '/api/v1' },
  );

  app.all('/api/*', async () => {
    throw new HttpError(404, 'not_found', 'Unknown API endpoint');
  });

  // Serve the built web client (single-page app) when present.
  if (fs.existsSync(path.join(config.webDir, 'index.html'))) {
    await app.register(fastifyStatic, { root: config.webDir, wildcard: false, index: false });
    const indexHtml = fs.readFileSync(path.join(config.webDir, 'index.html'));
    app.get('/*', async (req, reply) => {
      const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
      const file = path.join(config.webDir, rel);
      if (rel && file.startsWith(config.webDir) && fs.existsSync(file) && fs.statSync(file).isFile()) {
        if (rel.startsWith('assets/')) reply.header('Cache-Control', 'public, max-age=31536000, immutable');
        return reply.sendFile(rel);
      }
      return reply.type('text/html').header('Cache-Control', 'no-cache').send(indexHtml);
    });
  }

  app.addHook('onClose', async () => {
    hub.stop();
    if (!opts.db) await db.end();
  });
  return app;
}
