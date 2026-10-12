import fs from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../server/src/db.js';
import { listMigrations, migrate } from '../../server/src/migrate.js';
import { createTestDatabase, dropTestDatabase, joinWorkspace, loggedIn, seedBoard, startServer, stopServer, type Client, type TestServer } from './helpers.js';

let s: TestServer;
let a: Client, b: Client;
let boardId: string, workspaceId: string, lists: any[];
beforeAll(async () => {
  s = await startServer();
  a = await loggedIn(s, 'up_a');
  b = await loggedIn(s, 'up_b');
  ({ boardId, workspaceId, lists } = await seedBoard(a));
  await joinWorkspace(a, b, workspaceId);
  await a.post(`/boards/${boardId}/members`, { userId: b.user.id });
});
afterAll(async () => stopServer(s));

const snap = async (c: Client = a) => (await c.get(`/boards/${boardId}`)).body;
const titles = async (listId: string) =>
  (await snap()).cards
    .filter((c: any) => c.listId === listId)
    .sort((x: any, y: any) => (x.position < y.position ? -1 : 1))
    .map((c: any) => c.name);

describe('labels: 30-colour palette and a stable order', () => {
  it('default labels come back in palette order on every load; new labels are appended', async () => {
    const first = (await snap()).labels.map((l: any) => l.color);
    expect(first).toEqual(['green', 'yellow', 'orange', 'red', 'purple', 'blue']);
    for (const color of ['sky_subtle', 'black_bold', 'lime']) expect((await a.post(`/boards/${boardId}/labels`, { name: color, color })).status).toBe(200);
    for (let i = 0; i < 3; i++) expect((await snap()).labels.map((l: any) => l.color)).toEqual([...first, 'sky_subtle', 'black_bold', 'lime']);
  });

  it('accepts all 30 colours and rejects unknown ones', async () => {
    const hues = ['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'black'];
    const label = (await a.post(`/boards/${boardId}/labels`, { name: 'Shade test', color: 'green' })).body.label;
    for (const h of hues) for (const c of [`${h}_subtle`, h, `${h}_bold`]) expect((await a.patch(`/labels/${label.id}`, { color: c })).status).toBe(200);
    expect((await a.patch(`/labels/${label.id}`, { color: 'teal_bold' })).status).toBe(422);
    const card = (await a.post(`/lists/${lists[0].id}/cards`, { name: 'Cover shade' })).body.card;
    expect((await a.patch(`/cards/${card.id}`, { cover: { color: 'purple_bold' } })).body.card.cover).toEqual({ color: 'purple_bold' });
  });
});

describe('migration 0002 on data created by 0001', () => {
  it('keeps existing rows, gives tied labels a palette order, and adds template flags with defaults', async () => {
    const name = await createTestDatabase();
    const u = new URL(process.env.TEST_DATABASE_URL || 'postgres://flowdeck:flowdeck@localhost:5432/postgres');
    u.pathname = `/${name}`;
    const db = createPool(u.toString());
    try {
      // Apply only 0001, as an older Flowdeck build would have.
      const [m1] = listMigrations();
      await db.query('CREATE TABLE schema_migrations (version int PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
      await db.query(fs.readFileSync(m1.file, 'utf8'));
      await db.query('INSERT INTO schema_migrations (version, name) VALUES (1, $1)', [m1.name]);
      const user = (await db.query(`INSERT INTO users (email, username, full_name, initials) VALUES ('old@example.test','old_user','Old User','OU') RETURNING id`)).rows[0];
      const ws = (await db.query(`INSERT INTO workspaces (name) VALUES ('Old team') RETURNING id`)).rows[0];
      const board = (await db.query(`INSERT INTO boards (workspace_id, short_id, name, created_by) VALUES ($1,'oldboard1','Old board',$2) RETURNING id`, [ws.id, user.id])).rows[0];
      const list = (await db.query(`INSERT INTO lists (board_id, name, position) VALUES ($1,'Old list','a0') RETURNING id`, [board.id])).rows[0];
      // Same transaction → same created_at, inserted in reverse palette order.
      await db.query(`INSERT INTO labels (board_id, name, color) VALUES ($1,'','blue'),($1,'','red'),($1,'Named','green'),($1,'No colour',NULL)`, [board.id]);
      await db.query(`INSERT INTO cards (board_id, list_id, number, name, position) VALUES ($1,$2,1,'Old card','a0')`, [board.id, list.id]);

      expect(await migrate(db)).toEqual(listMigrations().slice(1).map((m) => m.version));
      const labels = (await db.query('SELECT name, color, position FROM labels WHERE board_id = $1 ORDER BY position', [board.id])).rows;
      expect(labels.map((l) => l.color)).toEqual(['green', 'red', 'blue', null]);
      expect(labels.map((l) => l.position)).toEqual([0, 1, 2, 3]);
      const card = (await db.query('SELECT name, is_template FROM cards')).rows[0];
      expect(card).toEqual({ name: 'Old card', is_template: false });
      expect((await db.query('SELECT is_template FROM boards')).rows[0].is_template).toBe(false);
      // New labels after the migration go to the end.
      await db.query(`INSERT INTO labels (board_id, name, color) VALUES ($1,'Later','pink_bold')`, [board.id]);
      expect((await db.query(`SELECT position FROM labels WHERE name = 'Later'`)).rows[0].position).toBe(4);
    } finally {
      await db.end();
      await dropTestDatabase(name);
    }
  });
});

describe('templates', () => {
  it('a card can be marked as a template and copied into a new card', async () => {
    const t = (await a.post(`/lists/${lists[0].id}/cards`, { name: 'Bug report template' })).body.card;
    const cl = (await a.post(`/cards/${t.id}/checklists`, { name: 'Triage' })).body.checklist;
    await a.post(`/checklists/${cl.id}/items`, { name: 'Reproduce' });
    const r = await a.patch(`/cards/${t.id}`, { isTemplate: true });
    expect(r.status).toBe(200);
    expect(r.body.card.isTemplate).toBe(true);
    expect((await snap()).cards.find((c: any) => c.id === t.id).isTemplate).toBe(true);
    const copy = (await a.post(`/cards/${t.id}/copy`, { listId: lists[1].id, name: 'Login fails on Safari', keep: ['checklists', 'labels'] })).body.card;
    expect(copy.isTemplate).toBe(false);
    expect(copy.badges.checkItems).toBe(1);
  });

  it('only board admins can mark a board as a template', async () => {
    expect((await b.patch(`/boards/${boardId}`, { isTemplate: true })).status).toBe(403);
    const r = await a.patch(`/boards/${boardId}`, { isTemplate: true });
    expect(r.body.board.isTemplate).toBe(true);
    expect((await a.get('/me/home')).body.boards.find((x: any) => x.id === boardId).isTemplate).toBe(true);
    await a.patch(`/boards/${boardId}`, { isTemplate: false });
  });
});

describe('list sort', () => {
  it('sorts the open cards of a list once, by name or due date, and members see it live', async () => {
    const { lists: [l] } = await seedBoard(a, { visibility: 'workspace' }).then(async (x) => {
      await a.post(`/boards/${x.boardId}/members`, { userId: b.user.id });
      return x;
    });
    const day = 86_400_000;
    for (const [name, due] of [['banana', 3], ['Apple', null], ['cherry', 1]] as const)
      await a.post(`/lists/${l.id}/cards`, { name }).then((r) => due && a.patch(`/cards/${r.body.card.id}`, { dueAt: new Date(Date.now() + due * day).toISOString() }));
    const bl = async () =>
      (await b.get(`/boards/${l.boardId}`)).body.cards
        .filter((c: any) => c.listId === l.id)
        .sort((x: any, y: any) => (x.position < y.position ? -1 : 1))
        .map((c: any) => c.name);
    const ws = await b.ws();
    ws.send({ type: 'subscribe', board: l.boardId, sinceSeq: 0 });
    await ws.wait((m) => m.type === 'subscribed');
    expect((await a.post(`/lists/${l.id}/sort`, { by: 'name' })).status).toBe(200);
    expect(await bl()).toEqual(['Apple', 'banana', 'cherry']);
    const evt = await ws.wait((m) => m.event === 'list.cards_sorted');
    expect(evt.data.cards.map((c: any) => c.name)).toEqual(['Apple', 'banana', 'cherry']);
    await a.post(`/lists/${l.id}/sort`, { by: 'due' });
    expect(await bl()).toEqual(['cherry', 'banana', 'Apple']);
    expect((await a.post(`/lists/${l.id}/sort`, { by: 'colour' })).status).toBe(422);
    ws.close();
  });
});

describe('checklist item → card', () => {
  it('creates a card right below its card and removes the item; observers cannot', async () => {
    const parent = (await a.post(`/lists/${lists[2].id}/cards`, { name: 'Parent' })).body.card;
    await a.post(`/lists/${lists[2].id}/cards`, { name: 'Next' });
    const cl = (await a.post(`/cards/${parent.id}/checklists`, { name: 'Steps' })).body.checklist;
    const item = (await a.post(`/checklists/${cl.id}/items`, { name: 'Write the migration' })).body.item;
    await a.patch(`/boards/${boardId}/members/${b.user.id}`, { role: 'observer' });
    expect((await b.post(`/check-items/${item.id}/convert`)).status).toBe(403);
    await a.patch(`/boards/${boardId}/members/${b.user.id}`, { role: 'member' });
    const r = await a.post(`/check-items/${item.id}/convert`);
    expect(r.status).toBe(200);
    expect(r.body.card.name).toBe('Write the migration');
    expect(await titles(lists[2].id)).toEqual(['Parent', 'Write the migration', 'Next']);
    const detail = (await a.get(`/cards/${parent.id}`)).body.card;
    expect(detail.checklists[0].items).toEqual([]);
    expect((await a.post(`/check-items/${item.id}/convert`)).status).toBe(404);
  });
});

describe('notification settings and watched cards', () => {
  it('muted kinds are not delivered; access changes cannot be muted', async () => {
    const r = await b.patch('/me', { prefs: { mutedNotifications: ['commented', 'removed_from_board', 'nonsense'] } });
    expect(r.body.user.prefs.mutedNotifications).toEqual(['commented']);
    const card = (await a.post(`/lists/${lists[0].id}/cards`, { name: 'Mute me' })).body.card;
    await b.put(`/cards/${card.id}/watch`);
    const before = (await b.get('/notifications')).body.items.length;
    await a.post(`/cards/${card.id}/comments`, { body: 'quiet please' });
    await a.post(`/cards/${card.id}/comments`, { body: 'hello @up_b' }); // mentions are still on
    const kinds = (await b.get('/notifications')).body.items.slice(0, (await b.get('/notifications')).body.items.length - before).map((n: any) => n.kind);
    expect(kinds).toEqual(['mentioned']);
    await b.patch('/me', { prefs: { mutedNotifications: [] } });
  });

  it('the board snapshot lists the cards the user watches', async () => {
    const card = (await a.post(`/lists/${lists[0].id}/cards`, { name: 'Watch me' })).body.card;
    expect((await snap(b)).watchedCardIds).not.toContain(card.id);
    await b.put(`/cards/${card.id}/watch`);
    expect((await snap(b)).watchedCardIds).toContain(card.id);
    expect((await snap(a)).watchedCardIds).toContain(card.id); // creator auto-watches
  });
});
