import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { joinWorkspace, loggedIn, seedBoard, startServer, stopServer, type Client, type TestServer } from './helpers.js';

let s: TestServer;
let a: Client, b: Client, lists: any[];
beforeAll(async () => {
  s = await startServer();
  a = await loggedIn(s, 'cf_a');
  b = await loggedIn(s, 'cf_b');
  const seeded = await seedBoard(a);
  lists = seeded.lists;
  await joinWorkspace(a, b, seeded.workspaceId);
  await a.post(`/boards/${seeded.boardId}/members`, { userId: b.user.id });
});
afterAll(async () => stopServer(s));

describe('conflicting edits are explicit, never silent', () => {
  it('the second description save gets 409 with the current text and who changed it', async () => {
    const card = (await a.post(`/lists/${lists[0].id}/cards`, { name: 'Spec' })).body.card;
    await a.patch(`/cards/${card.id}`, { description: 'v1', base: { description: '' } });
    // Both open the editor on "v1".
    const first = await a.patch(`/cards/${card.id}`, { description: 'A’s rewrite', base: { description: 'v1' } });
    expect(first.status).toBe(200);
    const second = await b.patch(`/cards/${card.id}`, { description: 'B’s rewrite', base: { description: 'v1' } });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('version_conflict');
    expect(second.body.error.details.fields).toEqual(['description']);
    expect(second.body.error.details.current.description).toBe('A’s rewrite');
    expect(second.body.error.details.updatedBy).toBe('Cf_a');
    expect((await a.get(`/cards/${card.id}`)).body.card.description).toBe('A’s rewrite'); // nothing overwritten
    // B chooses "keep mine" knowingly: base is now A's text.
    const keep = await b.patch(`/cards/${card.id}`, { description: 'B’s rewrite', base: { description: 'A’s rewrite' } });
    expect(keep.status).toBe(200);
  });

  it('title conflicts work the same way; identical concurrent values are not a conflict', async () => {
    const card = (await a.post(`/lists/${lists[0].id}/cards`, { name: 'Original' })).body.card;
    await a.patch(`/cards/${card.id}`, { name: 'Renamed by A', base: { name: 'Original' } });
    const r = await b.patch(`/cards/${card.id}`, { name: 'Renamed by B', base: { name: 'Original' } });
    expect(r.status).toBe(409);
    expect(r.body.error.details.current.name).toBe('Renamed by A');
    const same = await b.patch(`/cards/${card.id}`, { name: 'Renamed by A', base: { name: 'Original' } });
    expect(same.status).toBe(200);
  });

  it('unrelated changes (labels, checklist, move) do not cause false description conflicts', async () => {
    const card = (await a.post(`/lists/${lists[0].id}/cards`, { name: 'Busy card' })).body.card;
    const label = (await a.get(`/boards/${card.boardId}`)).body.labels[0];
    await a.put(`/cards/${card.id}/labels/${label.id}`);
    await a.post(`/cards/${card.id}/checklists`, { name: 'Todo' });
    await a.post(`/cards/${card.id}/move`, { listId: lists[1].id });
    const r = await b.patch(`/cards/${card.id}`, { description: 'fine', base: { description: '' } });
    expect(r.status).toBe(200);
  });

  it('editing a card that was deleted or archived fails clearly', async () => {
    const card = (await a.post(`/lists/${lists[0].id}/cards`, { name: 'Doomed' })).body.card;
    expect((await a.del(`/cards/${card.id}`)).body.error.code).toBe('not_archived');
    await a.post(`/cards/${card.id}/archive`);
    expect((await a.del(`/cards/${card.id}`)).status).toBe(200);
    const r = await b.patch(`/cards/${card.id}`, { description: 'too late', base: { description: '' } });
    expect(r.status).toBe(404);
    // Adding a card to an archived list is rejected, not silently accepted.
    const list = (await a.post(`/boards/${card.boardId}/lists`, { name: 'Temp' })).body.list;
    await a.post(`/lists/${list.id}/archive`);
    const add = await b.post(`/lists/${list.id}/cards`, { name: 'x' });
    expect(add.status).toBe(409);
    expect(add.body.error.code).toBe('list_archived');
  });
});
