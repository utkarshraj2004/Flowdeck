import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';
import { hash } from '@node-rs/argon2';
import { E2E_DB_URL } from './env.js';

export const PASSWORD = 'correct horse battery';
let pool: pg.Pool | null = null;
export const db = () => (pool ??= new pg.Pool({ connectionString: E2E_DB_URL, max: 2 }));

export const uniq = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`.toLowerCase().slice(0, 32);

/** Insert an activated user (test fixture; real users come from setup links or invitations). */
export async function createUser(username: string, fullName?: string) {
  const name = fullName ?? username.replace(/_.*/, '').replace(/^./, (c) => c.toUpperCase());
  const r = await db().query(
    `INSERT INTO users (email, username, full_name, initials, password_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [`${username}@example.test`, username, name, name.slice(0, 2).toUpperCase(), await hash(PASSWORD)],
  );
  return { id: r.rows[0].id as string, username, email: `${username}@example.test`, fullName: name };
}

export class Api {
  csrf = '';
  constructor(public request: APIRequestContext) {}
  async login(email: string) {
    const r = await this.request.post('/api/v1/auth/login', { data: { email, password: PASSWORD } });
    expect(r.status()).toBe(200);
    this.csrf = (await r.json()).csrfToken;
    return this;
  }
  async call(method: string, path: string, data?: unknown) {
    const r = await this.request.fetch(`/api/v1${path}`, { method, data, headers: { 'X-CSRF-Token': this.csrf } });
    const body = await r.json().catch(() => null);
    if (!r.ok()) throw new Error(`${method} ${path} → ${r.status()} ${JSON.stringify(body)}`);
    return body;
  }
}

/** Log a browser context in through the UI-independent API (sets the session cookie). */
export async function loginContext(context: BrowserContext, email: string) {
  return new Api(context.request).login(email);
}

export async function loginUi(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email or username').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
}

/** Workspace + board (default lists) for the API user; optionally add a member. */
export async function seedBoard(api: Api, name = 'E2E board') {
  const ws = await api.call('POST', '/workspaces', { name: `${name} team` });
  const board = await api.call('POST', '/boards', { workspaceId: ws.workspace.id, name });
  const snap = await api.call('GET', `/boards/${board.board.id}`);
  return { workspaceId: ws.workspace.id as string, board: board.board, lists: snap.lists as any[] };
}

export async function addToWorkspaceAndBoard(owner: Api, workspaceId: string, boardId: string, other: Api, userId: string, role = 'member') {
  const inv = await owner.call('POST', `/workspaces/${workspaceId}/invites`, { kind: 'link' });
  await other.call('POST', `/invites/${inv.invite.url.split('/invite/')[1]}/accept`);
  await owner.call('POST', `/boards/${boardId}/members`, { userId, role });
}

export const list = (page: Page, name: string) => page.locator('[data-list-id]').filter({ has: page.getByRole('heading', { name, exact: true }) });
export const cardTitles = (page: Page, listName: string) => list(page, listName).locator('.card-title').allInnerTexts();

/** Drag with real mouse steps (the board's drag sensor needs movement past a threshold). */
export async function dragTo(page: Page, from: ReturnType<Page['locator']>, to: ReturnType<Page['locator']>, offsetY = 0) {
  const a = (await from.boundingBox())!;
  const b = (await to.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 10, a.y + a.height / 2 + 10, { steps: 5 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2 + offsetY, { steps: 15 });
  await page.waitForTimeout(150);
  await page.mouse.up();
}
