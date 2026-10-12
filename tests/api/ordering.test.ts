import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, loggedIn, seedBoard, startServer, stopServer, type TestServer } from './helpers.js';

let s: TestServer;
let a: Client;
beforeAll(async () => {
  s = await startServer();
  a = await loggedIn(s, 'order_a');
});
afterAll(async () => stopServer(s));

const names = async (c: Client, boardId: string, listId: string) =>
  (await c.get(`/boards/${boardId}`)).body.cards
    .filter((x: any) => x.listId === listId)
    .sort((x: any, y: any) => (x.position < y.position ? -1 : x.position > y.position ? 1 : 0))
    .map((x: any) => x.name);

describe('card and list ordering', () => {
  it('places cards at top, after a sibling, and at the bottom, and keeps the order after reload and restart', async () => {
    const { boardId, lists } = await seedBoard(a);
    const L = lists[0].id;
    const ids: Record<string, string> = {};
    for (const n of ['B', 'D']) ids[n] = (await a.post(`/lists/${L}/cards`, { name: n })).body.card.id;
    ids.A = (await a.post(`/lists/${L}/cards`, { name: 'A', position: 'top' })).body.card.id;
    ids.C = (await a.post(`/lists/${L}/cards`, { name: 'C', position: { afterId: ids.B } })).body.card.id;
    ids.E = (await a.post(`/lists/${L}/cards`, { name: 'E' })).body.card.id;
    expect(await names(a, boardId, L)).toEqual(['A', 'B', 'C', 'D', 'E']);

    await a.post(`/cards/${ids.E}/move`, { listId: L, position: 'top' });
    await a.post(`/cards/${ids.A}/move`, { listId: L, position: { afterId: ids.C } });
    expect(await names(a, boardId, L)).toEqual(['E', 'B', 'C', 'A', 'D']);

    // Across lists.
    await a.post(`/cards/${ids.C}/move`, { listId: lists[1].id, position: 'bottom' });
    expect(await names(a, boardId, L)).toEqual(['E', 'B', 'A', 'D']);
    expect(await names(a, boardId, lists[1].id)).toEqual(['C']);

    s = await s.restart();
    a = await new Client(s).login('order_a@example.test');
    expect(await names(a, boardId, L)).toEqual(['E', 'B', 'A', 'D']);
  });

  it('matches a reference model over 150 random moves (no duplicate or out-of-order keys)', async () => {
    const { boardId, lists } = await seedBoard(a);
    const model: Record<string, string[]> = Object.fromEntries(lists.map((l: any) => [l.id, [] as string[]]));
    const nameOf: Record<string, string> = {};
    for (let i = 0; i < 12; i++) {
      const list = lists[i % 3].id;
      const c = (await a.post(`/lists/${list}/cards`, { name: `c${i}` })).body.card;
      model[list].push(c.id);
      nameOf[c.id] = c.name;
    }
    let seed = 42;
    const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
    const all = () => Object.values(model).flat();
    for (let i = 0; i < 150; i++) {
      const cardId = all()[rand(all().length)];
      const from = Object.keys(model).find((l) => model[l].includes(cardId))!;
      model[from] = model[from].filter((x) => x !== cardId);
      const to = lists[rand(3)].id;
      const idx = rand(model[to].length + 1);
      const afterId = idx === 0 ? null : model[to][idx - 1];
      model[to].splice(idx, 0, cardId);
      const r = await a.post(`/cards/${cardId}/move`, { listId: to, position: { afterId } });
      expect(r.status).toBe(200);
    }
    for (const l of lists) expect(await names(a, boardId, l.id)).toEqual(model[l.id].map((id) => nameOf[id]));
    const keys = (await a.get(`/boards/${boardId}`)).body.cards.map((c: any) => `${c.listId}:${c.position}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('survives many inserts at the same spot (key growth triggers a rebalance, order intact)', async () => {
    const { boardId, lists } = await seedBoard(a);
    const L = lists[0].id;
    const first = (await a.post(`/lists/${L}/cards`, { name: 'first' })).body.card.id;
    await a.post(`/lists/${L}/cards`, { name: 'last' });
    const expected = ['first'];
    for (let i = 0; i < 60; i++) {
      // Always insert right after "first": keys between two ever-closer neighbours.
      await a.post(`/lists/${L}/cards`, { name: `n${i}`, position: { afterId: first } });
      expected.splice(1, 0, `n${i}`);
    }
    expected.push('last');
    expect(await names(a, boardId, L)).toEqual(expected);
    const maxLen = Math.max(...(await a.get(`/boards/${boardId}`)).body.cards.map((c: any) => c.position.length));
    expect(maxLen).toBeLessThanOrEqual(48);
  });

  it('reorders lists and restores archived cards to their old position', async () => {
    const { boardId, lists } = await seedBoard(a);
    const [todo, doing, done] = lists.map((l: any) => l.id);
    await a.post(`/lists/${done}/move`, { position: 'top' });
    await a.post(`/lists/${todo}/move`, { position: { afterId: doing } });
    const order = (await a.get(`/boards/${boardId}`)).body.lists.map((l: any) => l.name);
    expect(order).toEqual(['Done', 'Doing', 'To do']);

    const ids = [];
    for (const n of ['x', 'y', 'z']) ids.push((await a.post(`/lists/${todo}/cards`, { name: n })).body.card.id);
    await a.post(`/cards/${ids[1]}/archive`);
    expect(await names(a, boardId, todo)).toEqual(['x', 'z']);
    await a.post(`/cards/${ids[1]}/restore`);
    expect(await names(a, boardId, todo)).toEqual(['x', 'y', 'z']);
  });

  it('concurrent moves of the same card converge (moves are not version-gated)', async () => {
    const { boardId, lists } = await seedBoard(a);
    const card = (await a.post(`/lists/${lists[0].id}/cards`, { name: 'contested' })).body.card;
    const [r1, r2] = await Promise.all([
      a.post(`/cards/${card.id}/move`, { listId: lists[1].id }),
      a.post(`/cards/${card.id}/move`, { listId: lists[2].id }),
    ]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    const last = r1.body.event.seq > r2.body.event.seq ? r1 : r2;
    const final = (await a.get(`/cards/${card.id}`)).body.card;
    expect(final.listId).toBe(last.body.card.listId);
  });
});
