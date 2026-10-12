import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { joinWorkspace, loggedIn, seedBoard, sleep, startServer, stopServer, type Client, type TestServer } from './helpers.js';

let s: TestServer;
let a: Client, b: Client;
let boardId: string, workspaceId: string, lists: any[], seq: number;
beforeAll(async () => {
  s = await startServer();
  a = await loggedIn(s, 'rt_a');
  b = await loggedIn(s, 'rt_b');
  const seeded = await seedBoard(a);
  ({ boardId, workspaceId, lists } = seeded);
  await joinWorkspace(a, b, workspaceId);
  await a.post(`/boards/${boardId}/members`, { userId: b.user.id });
  seq = (await a.get(`/boards/${boardId}`)).body.seq;
});
afterAll(async () => stopServer(s));

describe('real-time collaboration', () => {
  it('delivers changes to the other user quickly, with gap-free seq', async () => {
    const ws = await b.ws();
    ws.send({ type: 'subscribe', board: boardId, sinceSeq: seq });
    await ws.wait((m) => m.type === 'subscribed');
    const t0 = Date.now();
    const created = await a.post(`/lists/${lists[0].id}/cards`, { name: 'live' });
    const evt = await ws.wait((m) => m.type === 'event' && m.event === 'card.created');
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(evt.data.card.id).toBe(created.body.card.id);
    await a.patch(`/cards/${created.body.card.id}`, { name: 'live 2' });
    await a.post(`/cards/${created.body.card.id}/move`, { listId: lists[1].id });
    await ws.wait((m) => m.type === 'event' && m.event === 'card.moved');
    const seqs = ws.events(boardId).map((e) => e.seq);
    expect(seqs).toEqual(seqs.map((_, i) => seqs[0] + i));
    seq = seqs[seqs.length - 1];
    ws.close();
  });

  it('replays exactly the missed events, in order, after a reconnect', async () => {
    const ws1 = await b.ws();
    ws1.send({ type: 'subscribe', board: boardId, sinceSeq: seq });
    await ws1.wait((m) => m.type === 'subscribed');
    ws1.close(); // B goes offline
    for (let i = 0; i < 10; i++) await a.post(`/lists/${lists[0].id}/cards`, { name: `offline ${i}` });
    const ws2 = await b.ws();
    const t0 = Date.now();
    ws2.send({ type: 'subscribe', board: boardId, sinceSeq: seq });
    const sub = await ws2.wait((m) => m.type === 'subscribed');
    expect(Date.now() - t0).toBeLessThan(2000);
    const replay = ws2.events(boardId);
    expect(replay).toHaveLength(10);
    expect(sub.replayed).toBe(10);
    expect(replay.map((e) => e.seq)).toEqual(Array.from({ length: 10 }, (_, i) => seq + 1 + i));
    expect(replay.map((e) => e.data.card.name)).toEqual(Array.from({ length: 10 }, (_, i) => `offline ${i}`));
    seq = sub.seq;
    // The HTTP catch-up feed (polling fallback) returns the same events.
    const feed = (await b.get(`/boards/${boardId}/events?sinceSeq=${seq - 10}`)).body;
    expect(feed.events.map((e: any) => e.seq)).toEqual(replay.map((e) => e.seq));
    ws2.close();
  });

  it('asks for a full resync when the gap is beyond the replay window', async () => {
    const ws = await b.ws();
    ws.send({ type: 'subscribe', board: boardId, sinceSeq: -5 });
    await ws.wait((m) => m.type === 'resync_required');
    ws.close();
  });

  it('pushes role changes and access revocation to the affected user', async () => {
    const ws = await b.ws();
    const priv = (await a.post('/boards', { workspaceId, name: 'Private', visibility: 'private' })).body.board;
    await a.post(`/boards/${priv.id}/members`, { userId: b.user.id });
    ws.send({ type: 'subscribe', board: priv.id, sinceSeq: 0 });
    await ws.wait((m) => m.type === 'subscribed' && m.board === priv.id);
    const t0 = Date.now();
    await a.patch(`/boards/${priv.id}/members/${b.user.id}`, { role: 'observer' });
    const changed = await ws.wait((m) => m.type === 'board.member_role_changed' && m.board === priv.id);
    expect(changed.role).toBe('observer');
    expect(changed.can.edit).toBe(false);
    expect(Date.now() - t0).toBeLessThan(1000);
    await a.del(`/boards/${priv.id}/members/${b.user.id}`);
    await ws.wait((m) => m.type === 'board.access_revoked' && m.board === priv.id);
    const before = ws.events(priv.id).length;
    await a.post(`/boards/${priv.id}/lists`, { name: 'after removal' });
    await sleep(300);
    expect(ws.events(priv.id).length).toBe(before);
    // Making a workspace board private revokes workspace viewers' subscriptions.
    const pub = (await a.post('/boards', { workspaceId, name: 'Soon private' })).body.board;
    ws.send({ type: 'subscribe', board: pub.id, sinceSeq: 0 });
    await ws.wait((m) => m.type === 'subscribed' && m.board === pub.id);
    await a.patch(`/boards/${pub.id}`, { visibility: 'private' });
    await ws.wait((m) => m.type === 'board.access_revoked' && m.board === pub.id);
    ws.close();
  });

  it('broadcasts editing presence and expires it when the editor stops', async () => {
    const card = (await a.post(`/lists/${lists[0].id}/cards`, { name: 'presence' })).body.card;
    const wa = await a.ws();
    const wb = await b.ws();
    for (const w of [wa, wb]) {
      w.send({ type: 'subscribe', board: boardId });
      await w.wait((m) => m.type === 'subscribed');
    }
    wa.send({ type: 'editing', board: boardId, cardId: card.id, field: 'description', active: true });
    const on = await wb.wait((m) => m.type === 'editing' && m.cardId === card.id && m.users.length === 1);
    expect(on.users[0].name).toBe('Rt_a');
    wa.close(); // disconnect clears presence
    await wb.wait((m) => m.type === 'editing' && m.cardId === card.id && m.users.length === 0);
    wb.close();
  });

  it('delivers notifications live to the mentioned user', async () => {
    const card = (await a.post(`/lists/${lists[0].id}/cards`, { name: 'mention me' })).body.card;
    const wb = await b.ws();
    await sleep(50);
    await a.post(`/cards/${card.id}/comments`, { body: 'Can you check this @rt_b?' });
    const n = await wb.wait((m) => m.type === 'notification');
    expect(n.notification.kind).toBe('mentioned');
    expect(n.notification.actor.username).toBe('rt_a');
    wb.close();
  });
});
