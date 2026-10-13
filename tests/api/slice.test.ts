import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, createUser, joinWorkspace, startServer, stopServer, type TestServer } from './helpers.js';
import { createUserToken } from '../../server/src/lib/tokens.js';

let s: TestServer;
beforeAll(async () => {
  s = await startServer();
});
afterAll(async () => stopServer(s));

describe('vertical slice: setup → login → workspace → board → list → card → realtime → restart', () => {
  it('runs end to end across two users and an application restart', async () => {
    // J01: the first admin is created without a password and activates through a one-time link.
    const admin = await s.db.query(`INSERT INTO users (email, username, full_name, initials, is_system_admin) VALUES ('ada@example.test','pending_x','ada','?',true) RETURNING id`);
    const token = await createUserToken(s.db, admin.rows[0].id, 'setup');
    const a = new Client(s);
    expect((await a.get(`/setup/${token}`)).body.kind).toBe('setup');
    const short = await a.post(`/setup/${token}`, { fullName: 'Ada Admin', username: 'ada', password: 'short' });
    expect(short.status).toBe(422);
    const setup = await a.post(`/setup/${token}`, { fullName: 'Ada Admin', username: 'ada', password: 'correct horse battery' });
    expect(setup.status).toBe(200);
    a.csrf = setup.body.csrfToken;
    a.user = setup.body.user;
    expect((await a.post(`/setup/${token}`, { fullName: 'X', username: 'xx_x', password: 'correct horse battery' })).status).toBe(404); // single use

    // A default workspace exists with Ada as admin.
    const home = await a.get('/me/home');
    expect(home.body.workspaces).toHaveLength(1);
    expect(home.body.workspaces[0].role).toBe('admin');
    const workspaceId = home.body.workspaces[0].id;

    // Board with the default lists.
    const board = await a.post('/boards', { workspaceId, name: 'Launch plan' });
    expect(board.status).toBe(200);
    const boardId = board.body.board.id;
    const snap = (await a.get(`/boards/${board.body.board.shortId}`)).body;
    expect(snap.lists.map((l: any) => l.name)).toEqual(['To do', 'Doing', 'Done']);
    expect(snap.access.role).toBe('admin');

    // Second user joins via an invite link and subscribes over WebSocket.
    await createUser(s, 'bea');
    const b = await new Client(s).login('bea@example.test');
    await joinWorkspace(a, b, workspaceId);
    const bws = await b.ws();
    bws.send({ type: 'subscribe', board: boardId, sinceSeq: snap.seq });
    await bws.wait((m) => m.type === 'subscribed');

    const list = await a.post(`/boards/${boardId}/lists`, { name: 'Backlog' });
    const card = await a.post(`/lists/${list.body.list.id}/cards`, { name: 'Write announcement' });
    expect(card.status).toBe(200);
    const evt = await bws.wait((m) => m.type === 'event' && m.event === 'card.created');
    expect(evt.data.card.name).toBe('Write announcement');
    expect(evt.seq).toBe(card.body.event.seq);
    bws.close();

    // Restart the application (new process state, same database and files).
    s = await s.restart();
    const a2 = await new Client(s).login('ada@example.test');
    const after = (await a2.get(`/boards/${boardId}`)).body;
    expect(after.lists.map((l: any) => l.name)).toEqual(['To do', 'Doing', 'Done', 'Backlog']);
    expect(after.cards.map((c: any) => c.name)).toEqual(['Write announcement']);
    const b2 = await new Client(s).login('bea@example.test');
    expect((await b2.get(`/boards/${boardId}`)).body.cards[0].name).toBe('Write announcement');
  });
});
