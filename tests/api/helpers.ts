import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import WebSocket from 'ws';
import { buildApp } from '../../server/src/app.js';
import { loadConfig, type Config } from '../../server/src/config.js';
import { createPool, type Db } from '../../server/src/db.js';
import { migrate } from '../../server/src/migrate.js';
import { hashPassword } from '../../server/src/lib/security.js';

/** Admin URL used to create throwaway databases (role needs CREATEDB). */
const ADMIN_URL = process.env.TEST_DATABASE_URL || 'postgres://flowdeck:flowdeck@localhost:5432/postgres';

export interface TestServer {
  url: string;
  db: Db;
  config: Config;
  dbName: string;
  dataDir: string;
  close: () => Promise<void>;
  /** Runs one background-worker pass (webhooks, due-soon rules, email). */
  tick: () => Promise<void>;
  restart: () => Promise<TestServer>;
}

export async function createTestDatabase(): Promise<string> {
  const name = `flowdeck_test_${crypto.randomBytes(5).toString('hex')}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  return name;
}

export async function dropTestDatabase(name: string) {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.end();
}

function urlFor(dbName: string) {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${dbName}`;
  return u.toString();
}

export async function startServer(opts: { dbName?: string; dataDir?: string; maxUploadBytes?: number; config?: Partial<Config> } = {}): Promise<TestServer> {
  const dbName = opts.dbName ?? (await createTestDatabase());
  const dataDir = opts.dataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'flowdeck-test-'));
  const databaseUrl = urlFor(dbName);
  const db = createPool(databaseUrl);
  await migrate(db);
  const config = loadConfig({ databaseUrl, dataDir, port: 0, host: '127.0.0.1', webDir: '/nonexistent', workerIntervalMs: 0, ...(opts.maxUploadBytes ? { maxUploadBytes: opts.maxUploadBytes } : {}), ...opts.config });
  const app = await buildApp(config, { db });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const addr = app.server.address() as { port: number };
  const url = `http://127.0.0.1:${addr.port}`;
  config.baseUrl = url;
  const server: TestServer = {
    url,
    db,
    config,
    dbName,
    dataDir,
    tick: () => app.ctx.worker.tick(),
    close: async () => {
      await app.close();
      await db.end();
    },
    restart: async () => {
      await app.close();
      await db.end();
      return startServer({ dbName, dataDir, config: opts.config });
    },
  };
  return server;
}

export async function stopServer(s: TestServer) {
  await s.close();
  await dropTestDatabase(s.dbName);
  fs.rmSync(s.dataDir, { recursive: true, force: true });
}

export class Client {
  cookie = '';
  csrf = '';
  user: any;
  constructor(public server: TestServer) {}

  async req(method: string, p: string, body?: unknown, headers: Record<string, string> = {}) {
    const h: Record<string, string> = { ...headers };
    if (this.cookie) h.cookie = this.cookie;
    if (this.csrf && method !== 'GET') h['x-csrf-token'] = this.csrf;
    let payload: any = undefined;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      h['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${this.server.url}/api/v1${p}`, { method, headers: h, body: payload });
    const set = res.headers.get('set-cookie');
    if (set) {
      const m = set.match(/fd_session=([^;]*)/);
      if (m) this.cookie = m[1] ? `fd_session=${m[1]}` : '';
    }
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, body: json, headers: res.headers };
  }
  get = (p: string) => this.req('GET', p);
  post = (p: string, b?: unknown) => this.req('POST', p, b ?? {});
  patch = (p: string, b?: unknown) => this.req('PATCH', p, b ?? {});
  put = (p: string, b?: unknown) => this.req('PUT', p, b ?? {});
  del = (p: string, b?: unknown) => this.req('DELETE', p, b);

  async login(email: string, password = 'correct horse battery') {
    const r = await this.post('/auth/login', { email, password });
    if (r.status !== 200) throw new Error(`login failed ${r.status} ${JSON.stringify(r.body)}`);
    this.csrf = r.body.csrfToken;
    this.user = r.body.user;
    return this;
  }

  ws(): Promise<WsClient> {
    return WsClient.connect(this.server.url.replace('http', 'ws') + '/api/v1/ws', this.cookie);
  }
}

export class WsClient {
  messages: any[] = [];
  private waiters: { pred: (m: any) => boolean; resolve: (m: any) => void }[] = [];
  constructor(public socket: WebSocket) {
    socket.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      this.messages.push(m);
      this.waiters = this.waiters.filter((w) => (w.pred(m) ? (w.resolve(m), false) : true));
    });
  }
  static connect(url: string, cookie: string): Promise<WsClient> {
    return new Promise((resolve, reject) => {
      const s = new WebSocket(url, { headers: { cookie } });
      const c = new WsClient(s);
      s.on('open', () => resolve(c));
      s.on('error', reject);
    });
  }
  send(m: unknown) {
    this.socket.send(JSON.stringify(m));
  }
  wait(pred: (m: any) => boolean, timeout = 3000): Promise<any> {
    const found = this.messages.find(pred);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting for ws message; got ${JSON.stringify(this.messages.slice(-5))}`)), timeout);
      this.waiters.push({ pred, resolve: (m) => (clearTimeout(t), resolve(m)) });
    });
  }
  events(board: string) {
    return this.messages.filter((m) => m.type === 'event' && m.board === board);
  }
  close() {
    this.socket.close();
  }
}

/** Create an activated user directly in the database. */
export async function createUser(s: TestServer, username: string, opts: { sysadmin?: boolean } = {}) {
  const hash = await hashPassword('correct horse battery');
  const r = await s.db.query(
    `INSERT INTO users (email, username, full_name, initials, password_hash, is_system_admin) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [`${username}@example.test`, username, username[0].toUpperCase() + username.slice(1), username.slice(0, 2).toUpperCase(), hash, !!opts.sysadmin],
  );
  return r.rows[0];
}

export async function loggedIn(s: TestServer, username: string, opts: { sysadmin?: boolean } = {}) {
  await createUser(s, username, opts);
  return new Client(s).login(`${username}@example.test`);
}

/** Admin user with a workspace + board; returns ids. */
export async function seedBoard(c: Client, opts: { visibility?: 'private' | 'workspace' } = {}) {
  const ws = await c.post('/workspaces', { name: `${c.user.username} team` });
  const board = await c.post('/boards', { workspaceId: ws.body.workspace.id, name: 'Roadmap', visibility: opts.visibility ?? 'workspace' });
  const snap = await c.get(`/boards/${board.body.board.id}`);
  return { workspaceId: ws.body.workspace.id as string, boardId: board.body.board.id as string, snap: snap.body, lists: snap.body.lists as any[] };
}

/** Invite + accept so `other` becomes a workspace member. */
export async function joinWorkspace(admin: Client, other: Client, workspaceId: string, role: 'member' | 'admin' = 'member') {
  const inv = await admin.post(`/workspaces/${workspaceId}/invites`, { kind: 'link', role });
  const token = inv.body.invite.url.split('/invite/')[1];
  const r = await other.post(`/invites/${token}/accept`);
  if (r.status !== 200) throw new Error(`accept failed ${JSON.stringify(r.body)}`);
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
