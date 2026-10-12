import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { joinWorkspace, loggedIn, seedBoard, startServer, stopServer, type Client, type TestServer } from './helpers.js';

let s: TestServer;
let a: Client, b: Client, c: Client;
let boardId: string, workspaceId: string, lists: any[], labels: any[];
beforeAll(async () => {
  s = await startServer();
  a = await loggedIn(s, 'ft_a');
  b = await loggedIn(s, 'ft_b');
  c = await loggedIn(s, 'ft_c');
  ({ boardId, workspaceId, lists } = await seedBoard(a));
  labels = (await a.get(`/boards/${boardId}`)).body.labels;
  await joinWorkspace(a, b, workspaceId);
  await joinWorkspace(a, c, workspaceId);
  await a.post(`/boards/${boardId}/members`, { userId: b.user.id });
});
afterAll(async () => stopServer(s));

const kinds = async (u: Client) => (await u.get('/notifications')).body.items.map((n: any) => n.kind);

describe('notifications follow the research trigger table, never notify the actor', () => {
  it('mention, added to card, and member/watcher events', async () => {
    const card = (await a.post(`/lists/${lists[0].id}/cards`, { name: 'Notify' })).body.card;
    await a.post(`/cards/${card.id}/comments`, { body: 'hello @ft_b and @ft_c' }); // ft_c is not a board member
    expect(await kinds(b)).toContain('mentioned');
    expect(await kinds(c)).not.toContain('mentioned');
    await a.put(`/cards/${card.id}/members/${b.user.id}`);
    expect(await kinds(b)).toContain('added_to_card');
    // b is now a card member: due change, attachment, completion notify b — not a (the actor).
    await a.patch(`/cards/${card.id}`, { dueAt: new Date(Date.now() + 3600e3).toISOString() });
    await a.patch(`/cards/${card.id}`, { dueComplete: true });
    await a.post(`/cards/${card.id}/attachments`, { url: 'https://example.com' });
    const bk = await kinds(b);
    expect(bk).toEqual(expect.arrayContaining(['due_changed', 'completed', 'attachment_added']));
    expect(await kinds(a)).not.toEqual(expect.arrayContaining(['due_changed'])); // a only has invite_accepted from setup
    expect((await kinds(a)).every((k: string) => k === 'invite_accepted')).toBe(true);
    // b comments: a (creator, auto-watching) is notified.
    await b.post(`/cards/${card.id}/comments`, { body: 'on it' });
    expect(await kinds(a)).toContain('commented');
    // Mark all read.
    expect((await b.post('/notifications/read', { all: true })).body.unread).toBe(0);
  });

  it('watching a list notifies about new cards; a list rename notifies nobody', async () => {
    await b.put(`/lists/${lists[1].id}/watch`);
    const before = (await b.get('/notifications')).body.items.length;
    await a.post(`/lists/${lists[1].id}/cards`, { name: 'Watched new card' });
    await a.patch(`/lists/${lists[1].id}`, { name: 'Doing now' });
    const items = (await b.get('/notifications')).body.items;
    expect(items.length).toBe(before + 1);
    expect(items[0]).toMatchObject({ kind: 'card_created', data: { cardName: 'Watched new card' } });
  });
});

describe('search', () => {
  it('supports text, phrases, negation and operators, scoped to visible boards', async () => {
    const mk = async (name: string, extra: (id: string) => Promise<unknown> = async () => undefined) => {
      const card = (await a.post(`/lists/${lists[0].id}/cards`, { name })).body.card;
      await extra(card.id);
      return card;
    };
    await mk('Invoice template', (id) => a.put(`/cards/${id}/labels/${labels[0].id}`));
    await mk('Invoice reminder email', (id) => a.put(`/cards/${id}/members/${b.user.id}`));
    await mk('Quarterly report', (id) => a.patch(`/cards/${id}`, { dueAt: new Date(Date.now() - 86400e3).toISOString() }));
    const archived = await mk('Invoice archived');
    await a.post(`/cards/${archived.id}/archive`);
    const q = async (query: string) => (await a.get(`/search?q=${encodeURIComponent(query)}`)).body.cards.map((x: any) => x.name).sort();
    expect(await q('invoice')).toEqual(['Invoice reminder email', 'Invoice template']);
    expect(await q('"reminder email"')).toEqual(['Invoice reminder email']);
    expect(await q('invoice -template')).toEqual(['Invoice reminder email']);
    expect(await q('invoice @ft_b')).toEqual(['Invoice reminder email']);
    expect(await q(`#${labels[0].color}`)).toEqual(['Invoice template']);
    expect(await q('due:overdue')).toEqual(['Quarterly report']);
    expect(await q('invoice is:archived')).toEqual(['Invoice archived']);
    expect(await q('board:roadmap list:"to do" quarterly')).toEqual(['Quarterly report']);
    const outsider = await loggedIn(s, 'ft_outsider');
    expect((await outsider.get('/search?q=invoice')).body.cards).toHaveLength(0);
  });
});

describe('moving and copying across boards', () => {
  it('cross-board move drops non-member assignees, maps labels by name+colour, keeps content', async () => {
    const card = (await a.post(`/lists/${lists[0].id}/cards`, { name: 'Traveller' })).body.card;
    await a.patch(`/labels/${labels[1].id}`, { name: 'Urgent' });
    await a.put(`/cards/${card.id}/labels/${labels[1].id}`);
    await a.put(`/cards/${card.id}/members/${b.user.id}`);
    await a.put(`/cards/${card.id}/members/${a.user.id}`);
    const cl = (await a.post(`/cards/${card.id}/checklists`, { name: 'Steps' })).body.checklist;
    await a.post(`/checklists/${cl.id}/items`, { name: 'one' });
    await a.post(`/cards/${card.id}/comments`, { body: 'keep me' });
    const other = (await a.post('/boards', { workspaceId, name: 'Other board', defaultLists: true })).body.board;
    const otherLists = (await a.get(`/boards/${other.id}`)).body.lists;
    const r = await a.post(`/cards/${card.id}/move`, { listId: otherLists[0].id });
    expect(r.status).toBe(200);
    const moved = (await a.get(`/cards/${card.id}`)).body.card;
    expect(moved.board.id).toBe(other.id);
    expect(moved.memberIds).toEqual([a.user.id]); // b is not on the other board
    const otherLabels = (await a.get(`/boards/${other.id}`)).body.labels;
    const urgent = otherLabels.filter((l: any) => l.name === 'Urgent');
    expect(urgent).toHaveLength(1);
    expect(moved.labelIds).toEqual([urgent[0].id]);
    expect(moved.checklists[0].items[0].name).toBe('one');
    expect(moved.comments[0].body).toBe('keep me');
    expect((await a.get(`/boards/${boardId}`)).body.cards.find((x: any) => x.id === card.id)).toBeUndefined();
    const activity = (await a.get(`/boards/${other.id}/activity`)).body.items.map((i: any) => i.type);
    expect(activity).toContain('card.moved_in');
  });

  it('copies a card with the chosen parts; copied checklist items start unchecked', async () => {
    const card = (await a.post(`/lists/${lists[0].id}/cards`, { name: 'Template card' })).body.card;
    await a.put(`/cards/${card.id}/labels/${labels[0].id}`);
    const cl = (await a.post(`/cards/${card.id}/checklists`, { name: 'List' })).body.checklist;
    const item = (await a.post(`/checklists/${cl.id}/items`, { name: 'done item' })).body.item;
    await a.patch(`/check-items/${item.id}`, { checked: true });
    await a.post(`/cards/${card.id}/comments`, { body: 'not copied' });
    const copy = (await a.post(`/cards/${card.id}/copy`, { listId: lists[2].id, name: 'Copy', keep: ['labels', 'checklists'] })).body.card;
    const detail = (await a.get(`/cards/${copy.id}`)).body.card;
    expect(detail.name).toBe('Copy');
    expect(detail.labelIds).toEqual([labels[0].id]);
    expect(detail.checklists[0].items[0]).toMatchObject({ name: 'done item', checked: false });
    expect(detail.comments).toHaveLength(0);
  });
});

describe('board lifecycle and export', () => {
  it('export contains every entity and the full activity log', async () => {
    const r = await a.get(`/boards/${boardId}/export`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-disposition')).toMatch(/attachment; filename="flowdeck-Roadmap.json"/);
    const e = r.body;
    expect(e.format).toBe('flowdeck-board-export');
    for (const k of ['board', 'members', 'labels', 'lists', 'cards', 'checklists', 'checkItems', 'comments', 'attachments', 'activity']) expect(e).toHaveProperty(k);
    expect(e.activity.length).toBeGreaterThan(20);
    expect(e.activity[0].seq).toBe(1);
  });

  it('closed boards are read-only; deletion needs a closed board and the typed name', async () => {
    const board = (await a.post('/boards', { workspaceId, name: 'Short lived' })).body.board;
    const list = (await a.get(`/boards/${board.id}`)).body.lists[0];
    expect((await a.del(`/boards/${board.id}`, { confirmName: 'Short lived' })).body.error.code).toBe('board_open');
    await a.post(`/boards/${board.id}/close`);
    const add = await a.post(`/lists/${list.id}/cards`, { name: 'x' });
    expect(add.status).toBe(403);
    expect(add.body.error.message).toMatch(/closed/);
    expect((await a.del(`/boards/${board.id}`, { confirmName: 'wrong' })).status).toBe(422);
    expect((await a.get(`/workspaces/${workspaceId}/boards?filter=closed`)).body.boards.map((x: any) => x.id)).toContain(board.id);
    expect((await a.del(`/boards/${board.id}`, { confirmName: 'Short lived' })).status).toBe(200);
    expect((await a.get(`/boards/${board.id}`)).status).toBe(404);
  });

  it('lists: copy, archive, restore, delete only after archive', async () => {
    const list = (await a.post(`/boards/${boardId}/lists`, { name: 'Scratch' })).body.list;
    await a.post(`/lists/${list.id}/cards`, { name: 'in scratch' });
    const copy = (await a.post(`/lists/${list.id}/copy`, { name: 'Scratch copy' })).body.list;
    const snap = (await a.get(`/boards/${boardId}`)).body;
    expect(snap.cards.filter((x: any) => x.listId === copy.id).map((x: any) => x.name)).toEqual(['in scratch']);
    expect((await a.del(`/lists/${list.id}`)).body.error.code).toBe('not_archived');
    await a.post(`/lists/${list.id}/archive`);
    expect((await a.get(`/boards/${boardId}/archived`)).body.lists.map((l: any) => l.id)).toContain(list.id);
    await a.post(`/lists/${list.id}/restore`);
    await a.post(`/lists/${list.id}/archive`);
    expect((await a.del(`/lists/${list.id}`)).status).toBe(200);
  });

  it('validates input with clear messages', async () => {
    const r = await a.post(`/lists/${lists[0].id}/cards`, { name: '   ' });
    expect(r.status).toBe(422);
    expect(r.body.error.message).toBe('Card title is required');
    const long = await a.post(`/lists/${lists[0].id}/cards`, { name: 'x'.repeat(513) });
    expect(long.body.error.message).toBe('Card title must be at most 512 characters');
    expect((await a.post('/boards', { workspaceId, name: '' })).body.error.message).toBe('Board title is required');
  });
});
