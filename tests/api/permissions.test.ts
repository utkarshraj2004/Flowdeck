import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, joinWorkspace, loggedIn, seedBoard, startServer, stopServer, type TestServer } from './helpers.js';

let s: TestServer;
beforeAll(async () => {
  s = await startServer();
});
afterAll(async () => stopServer(s));

describe('workspace isolation (two users, no shared workspace)', () => {
  it('hides every board resource from a user outside the workspace, with 404 rather than 403', async () => {
    const a = await loggedIn(s, 'iso_a');
    const b = await loggedIn(s, 'iso_b');
    const { boardId, lists } = await seedBoard(a);
    const card = (await a.post(`/lists/${lists[0].id}/cards`, { name: 'Secret roadmap item' })).body.card;
    const fd = new FormData();
    fd.append('file', new Blob(['top secret']), 'secret.txt');
    const att = (await a.req('POST', `/cards/${card.id}/attachments`, fd)).body.attachment;

    for (const path of [`/boards/${boardId}`, `/boards/${boardId}/events?sinceSeq=0`, `/boards/${boardId}/export`, `/boards/${boardId}/activity`, `/cards/${card.id}`, `/attachments/${att.id}/download`]) {
      const r = await b.get(path);
      expect(r.status, path).toBe(404);
    }
    expect((await b.post(`/lists/${lists[0].id}/cards`, { name: 'x' })).status).toBe(404);
    expect((await b.patch(`/cards/${card.id}`, { name: 'hacked' })).status).toBe(404);
    expect((await b.post(`/cards/${card.id}/comments`, { body: 'hi' })).status).toBe(404);
    // Read back: nothing changed.
    expect((await a.get(`/cards/${card.id}`)).body.card.name).toBe('Secret roadmap item');
    expect((await b.get('/search?q=Secret')).body.cards).toHaveLength(0);
    expect((await b.get('/me/home')).body.boards).toHaveLength(0);

    // WebSocket subscription is refused too.
    const ws = await b.ws();
    ws.send({ type: 'subscribe', board: boardId, sinceSeq: 0 });
    await ws.wait((m) => m.type === 'board.access_revoked' && m.board === boardId);
    await a.patch(`/cards/${card.id}`, { name: 'Renamed' });
    await new Promise((r) => setTimeout(r, 300));
    expect(ws.events(boardId)).toHaveLength(0);
    ws.close();
  });

  it('keeps private boards private from workspace members but visible to workspace admins', async () => {
    const a = await loggedIn(s, 'priv_a');
    const b = await loggedIn(s, 'priv_b');
    const { workspaceId, boardId } = await seedBoard(a, { visibility: 'private' });
    await joinWorkspace(a, b, workspaceId);
    expect((await b.get(`/boards/${boardId}`)).status).toBe(404);
    await a.patch(`/workspaces/${workspaceId}/members/${b.user.id}`, { role: 'admin' });
    const r = await b.get(`/boards/${boardId}`);
    expect(r.status).toBe(200);
    expect(r.body.access.role).toBe('admin');
  });
});

describe('board roles (server-enforced, every write read back)', () => {
  let a: Client, b: Client, boardId: string, workspaceId: string, lists: any[], card: any;
  beforeAll(async () => {
    a = await loggedIn(s, 'role_a');
    b = await loggedIn(s, 'role_b');
    ({ boardId, workspaceId, lists } = await seedBoard(a));
    card = (await a.post(`/lists/${lists[0].id}/cards`, { name: 'Card' })).body.card;
    await joinWorkspace(a, b, workspaceId);
  });

  it('workspace viewer can read but not write; can self-join, then edit', async () => {
    const snap = await b.get(`/boards/${boardId}`);
    expect(snap.body.access.role).toBe('viewer');
    expect(snap.body.access.can).toMatchObject({ edit: false, join: true });
    const denied = await b.patch(`/cards/${card.id}`, { name: 'viewer edit' });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('forbidden');
    expect(denied.body.error.message).toMatch(/view this board but not change it/);
    expect((await a.get(`/cards/${card.id}`)).body.card.name).toBe('Card');
    expect((await b.post(`/boards/${boardId}/join`)).status).toBe(200);
    expect((await b.patch(`/cards/${card.id}`, { name: 'member edit' })).status).toBe(200);
    expect((await a.get(`/cards/${card.id}`)).body.card.name).toBe('member edit');
  });

  it('members cannot change admin-only settings: 403 and state unchanged (no silent no-ops)', async () => {
    for (const body of [{ name: 'Renamed by member' }, { visibility: 'private' }, { prefs: { comments: 'disabled' } }, { prefs: { selfJoin: false } }]) {
      const r = await b.patch(`/boards/${boardId}`, body);
      expect(r.status, JSON.stringify(body)).toBe(403);
    }
    expect((await b.post(`/boards/${boardId}/close`)).status).toBe(403);
    expect((await b.patch(`/boards/${boardId}/members/${b.user.id}`, { role: 'admin' })).status).toBe(403);
    const board = (await a.get(`/boards/${boardId}`)).body.board;
    expect(board).toMatchObject({ name: 'Roadmap', visibility: 'workspace', closedAt: null });
    expect(board.prefs).toMatchObject({ comments: 'members', selfJoin: true });
    // Background is allowed for members (research 04).
    expect((await b.patch(`/boards/${boardId}`, { background: 'forest' })).status).toBe(200);
  });

  it('observers can view and comment (when allowed) but not move cards', async () => {
    await a.patch(`/boards/${boardId}/members/${b.user.id}`, { role: 'observer' });
    const moved = await b.post(`/cards/${card.id}/move`, { listId: lists[1].id });
    expect(moved.status).toBe(403);
    expect((await a.get(`/cards/${card.id}`)).body.card.listId).toBe(lists[0].id);
    expect((await b.post(`/cards/${card.id}/comments`, { body: 'observer says hi' })).status).toBe(403); // default: members only
    await a.patch(`/boards/${boardId}`, { prefs: { comments: 'observers' } });
    expect((await b.post(`/cards/${card.id}/comments`, { body: 'observer says hi' })).status).toBe(200);
    const upload = new FormData();
    upload.append('file', new Blob(['x']), 'x.txt');
    expect((await b.req('POST', `/cards/${card.id}/attachments`, upload)).status).toBe(403);
    await a.patch(`/boards/${boardId}/members/${b.user.id}`, { role: 'member' });
  });

  it('comments: only the author edits; admins delete non-admin comments; members cannot delete others’', async () => {
    const byA = (await a.post(`/cards/${card.id}/comments`, { body: 'from admin' })).body.comment;
    const byB = (await b.post(`/cards/${card.id}/comments`, { body: 'from member' })).body.comment;
    expect((await a.patch(`/comments/${byB.id}`, { body: 'admin rewrite' })).status).toBe(403);
    expect((await b.patch(`/comments/${byA.id}`, { body: 'member rewrite' })).status).toBe(403);
    expect((await b.del(`/comments/${byA.id}`)).status).toBe(403);
    expect((await b.patch(`/comments/${byB.id}`, { body: 'edited by me' })).status).toBe(200);
    expect((await a.del(`/comments/${byB.id}`)).status).toBe(200);
    const comments = (await a.get(`/cards/${card.id}`)).body.card.comments.map((c: any) => c.body);
    expect(comments).toContain('from admin');
    expect(comments).not.toContain('edited by me');
  });
});

describe('last-admin protection (Flowdeck blocks the leave Trello allows)', () => {
  it('board: the sole admin cannot leave, be demoted or removed', async () => {
    const a = await loggedIn(s, 'la_a');
    const b = await loggedIn(s, 'la_b');
    const { boardId, workspaceId } = await seedBoard(a);
    await joinWorkspace(a, b, workspaceId);
    await a.post(`/boards/${boardId}/members`, { userId: b.user.id, role: 'member' });
    const leave = await a.del(`/boards/${boardId}/members/${a.user.id}`);
    expect(leave.status).toBe(409);
    expect(leave.body.error.code).toBe('last_admin');
    expect(leave.body.error.message).toMatch(/last admin/);
    expect((await a.patch(`/boards/${boardId}/members/${a.user.id}`, { role: 'member' })).body.error.code).toBe('last_admin');
    const members = (await a.get(`/boards/${boardId}/members`)).body.members;
    expect(members.find((m: any) => m.id === a.user.id).role).toBe('admin');
    // With a second admin the leave succeeds.
    await a.patch(`/boards/${boardId}/members/${b.user.id}`, { role: 'admin' });
    expect((await a.del(`/boards/${boardId}/members/${a.user.id}`)).status).toBe(200);
  });

  it('workspace: the last admin cannot be demoted or leave', async () => {
    const a = await loggedIn(s, 'law_a');
    const { workspaceId } = await seedBoard(a);
    expect((await a.patch(`/workspaces/${workspaceId}/members/${a.user.id}`, { role: 'member' })).body.error.code).toBe('last_admin');
    expect((await a.del(`/workspaces/${workspaceId}/members/${a.user.id}?keepBoards=true`)).body.error.code).toBe('last_admin');
    expect((await a.get(`/workspaces/${workspaceId}`)).body.workspace.role).toBe('admin');
  });
});

describe('workspace membership and invitations', () => {
  it('remove-with-keep-boards turns a member into a guest; remove-and-boards revokes everything', async () => {
    const a = await loggedIn(s, 'rm_a');
    const b = await loggedIn(s, 'rm_b');
    const c = await loggedIn(s, 'rm_c');
    const { boardId, workspaceId } = await seedBoard(a, { visibility: 'private' });
    await joinWorkspace(a, b, workspaceId);
    await joinWorkspace(a, c, workspaceId);
    await a.post(`/boards/${boardId}/members`, { userId: b.user.id });
    await a.post(`/boards/${boardId}/members`, { userId: c.user.id });
    expect((await a.del(`/workspaces/${workspaceId}/members/${b.user.id}?keepBoards=true`)).status).toBe(200);
    expect((await b.get(`/workspaces/${workspaceId}`)).status).toBe(404);
    const asGuest = await b.get(`/boards/${boardId}`);
    expect(asGuest.status).toBe(200);
    expect(asGuest.body.members.find((m: any) => m.id === b.user.id).isGuest).toBe(true);
    expect((await b.get('/notifications')).body.items[0].kind).toBe('removed_from_workspace');
    expect((await a.del(`/workspaces/${workspaceId}/members/${c.user.id}?keepBoards=false`)).status).toBe(200);
    expect((await c.get(`/boards/${boardId}`)).status).toBe(404);
  });

  it('invitations: permission, email binding, revocation, and read-back of pending invites', async () => {
    const a = await loggedIn(s, 'inv_a');
    const b = await loggedIn(s, 'inv_b');
    const outsider = await loggedIn(s, 'inv_c');
    const { workspaceId } = await seedBoard(a);
    await joinWorkspace(a, b, workspaceId);
    const denied = await b.post(`/workspaces/${workspaceId}/invites`, { kind: 'link' });
    expect(denied.status).toBe(403);

    const emailInvite = (await a.post(`/workspaces/${workspaceId}/invites`, { kind: 'email', email: 'someone.else@example.test' })).body.invite;
    const pending = (await a.get(`/workspaces/${workspaceId}/invites`)).body.invites;
    expect(pending.map((i: any) => i.id)).toContain(emailInvite.id);
    const token = emailInvite.url.split('/invite/')[1];
    const wrong = await outsider.post(`/invites/${token}/accept`);
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.message).toMatch(/someone.else@example.test/);

    const link = (await a.post(`/workspaces/${workspaceId}/invites`, { kind: 'link' })).body.invite;
    await a.del(`/invites/${link.id}`);
    const linkToken = link.url.split('/invite/')[1];
    expect((await outsider.get(`/invites/${linkToken}`)).body).toMatchObject({ valid: false, reason: expect.stringMatching(/no longer valid/) });
    expect((await outsider.post(`/invites/${linkToken}/accept`)).status).toBe(410);

    // Logged-out sign-up through a fresh link.
    const link2 = (await a.post(`/workspaces/${workspaceId}/invites`, { kind: 'link' })).body.invite;
    const anon = new Client(s);
    const signup = await anon.post(`/invites/${link2.url.split('/invite/')[1]}/signup`, { fullName: 'New Person', username: 'new_person', email: 'new@example.test', password: 'correct horse battery' });
    expect(signup.status).toBe(200);
    const members = (await a.get(`/workspaces/${workspaceId}`)).body.members.map((m: any) => m.username);
    expect(members).toContain('new_person');
  });
});

describe('authentication hardening', () => {
  it('rejects unsafe requests without the CSRF token', async () => {
    const a = await loggedIn(s, 'csrf_a');
    const { workspaceId } = await seedBoard(a);
    const csrf = a.csrf;
    a.csrf = '';
    const r = await a.post('/boards', { workspaceId, name: 'Nope' });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('csrf_failed');
    a.csrf = csrf;
  });

  it('uses a generic login error, rate-limits, and invalidates sessions on logout', async () => {
    await loggedIn(s, 'login_a');
    const c = new Client(s);
    const wrong = await c.post('/auth/login', { email: 'login_a@example.test', password: 'wrong password!!' });
    expect(wrong.status).toBe(401);
    const unknown = await c.post('/auth/login', { email: 'nobody@example.test', password: 'wrong password!!' });
    expect(unknown.body.error.message).toBe(wrong.body.error.message);
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await c.post('/auth/login', { email: 'ratelimit@example.test', password: 'x' })).status);
    expect(statuses.slice(0, 5).every((x) => x === 401)).toBe(true);
    expect(statuses[5]).toBe(429);

    const d = await new Client(s).login('login_a@example.test');
    const cookie = d.cookie;
    await d.post('/auth/logout');
    d.cookie = cookie;
    expect((await d.get('/me')).status).toBe(401);
  });

  it('disabled users lose access immediately', async () => {
    const admin = await loggedIn(s, 'sys_admin', { sysadmin: true });
    const v = await loggedIn(s, 'victim');
    expect((await v.get('/me')).status).toBe(200);
    expect((await admin.patch(`/admin/users/${v.user.id}`, { disabled: true })).status).toBe(200);
    expect((await v.get('/me')).status).toBe(401);
    expect((await v.get('/admin/users')).status).toBe(401);
    const nonAdmin = await loggedIn(s, 'not_admin');
    expect((await nonAdmin.get('/admin/users')).status).toBe(403);
  });
});
