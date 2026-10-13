import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, joinWorkspace, loggedIn, seedBoard, startServer, stopServer, type TestServer } from './helpers.js';
import { startSmtpSink } from './sinks.js';

describe('email is optional: without SMTP every flow still works and nothing is sent', () => {
  let s: TestServer;
  beforeAll(async () => {
    s = await startServer();
  });
  afterAll(async () => stopServer(s));

  it('reports email as off, refuses self-service reset clearly, and email invites still return a shareable link', async () => {
    const anon = new Client(s);
    expect((await anon.get('/auth/options')).body).toEqual({
      emailEnabled: false,
    });
    const forgot = await anon.post('/auth/forgot', {
      email: 'someone@example.test',
    });
    expect(forgot.status).toBe(404);
    expect(forgot.body.error.code).toBe('email_disabled');
    const admin = await loggedIn(s, 'noemail_admin', { sysadmin: true });
    const { workspaceId } = await seedBoard(admin);
    const inv = await admin.post(`/workspaces/${workspaceId}/invites`, {
      kind: 'email',
      email: 'new@example.test',
    });
    expect(inv.status).toBe(200);
    expect(inv.body.emailed).toBe(false);
    expect(inv.body.invite.url).toContain('/invite/');
    expect((await admin.get('/admin/status')).body.email.enabled).toBe(false);
    expect((await admin.post('/admin/email/test', {})).status).toBe(502);
  });
});

describe('with a configured SMTP server (local sink)', () => {
  let s: TestServer;
  let sink: Awaited<ReturnType<typeof startSmtpSink>>;
  beforeAll(async () => {
    sink = await startSmtpSink();
    s = await startServer({
      config: {
        smtpUrl: sink.url,
        mailFrom: 'Flowdeck <flowdeck@example.test>',
        emailDigestMinutes: 1,
      },
    });
  });
  afterAll(async () => {
    await stopServer(s);
    await sink.close();
  });

  it('forgot password: emails a one-time link that works, without revealing whether the account exists', async () => {
    await loggedIn(s, 'mail_user');
    const anon = new Client(s);
    expect((await anon.get('/auth/options')).body).toEqual({
      emailEnabled: true,
    });
    const unknown = await anon.post('/auth/forgot', {
      email: 'nobody@example.test',
    });
    const known = await anon.post('/auth/forgot', {
      email: 'mail_user@example.test',
    });
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual(unknown.body);
    await s.tick();
    expect(sink.messages.map((m) => m.to)).toEqual([['mail_user@example.test']]);
    const link = sink.text(sink.messages[0]).match(/\/setup\/([A-Za-z0-9_-]+)/)![1];
    expect((await anon.get(`/setup/${link}`)).body.kind).toBe('reset');
    const set = await anon.post(`/setup/${link}`, {
      password: 'a brand new passphrase',
    });
    expect(set.status).toBe(200);
    expect(
      (
        await new Client(s).post('/auth/login', {
          email: 'mail_user@example.test',
          password: 'a brand new passphrase',
        })
      ).status,
    ).toBe(200);
    expect((await anon.get(`/setup/${link}`)).status).toBe(404); // single use
  });

  it('email invitations are sent; the link in the email signs the person up into the workspace', async () => {
    sink.messages.length = 0;
    const admin = await loggedIn(s, 'mail_admin', { sysadmin: true });
    const { workspaceId } = await seedBoard(admin);
    const inv = await admin.post(`/workspaces/${workspaceId}/invites`, {
      kind: 'email',
      email: 'invitee@example.test',
    });
    expect(inv.body.emailed).toBe(true);
    await s.tick();
    expect(sink.messages).toHaveLength(1);
    expect(sink.messages[0].to).toEqual(['invitee@example.test']);
    const token = sink.text(sink.messages[0]).match(/\/invite\/([A-Za-z0-9_-]+)/)![1];
    expect(inv.body.invite.url).toContain(token);
    const invitee = new Client(s);
    const signup = await invitee.post(`/invites/${token}/signup`, {
      fullName: 'Invitee',
      username: 'invitee',
      email: 'invitee@example.test',
      password: 'correct horse battery',
    });
    expect(signup.status).toBe(200);
  });

  it('digest: opted-in users get unread notifications by email once; others get nothing', async () => {
    sink.messages.length = 0;
    const admin = await loggedIn(s, 'dg_admin');
    const optedIn = await loggedIn(s, 'dg_in');
    const optedOut = await loggedIn(s, 'dg_out');
    const { workspaceId, boardId, lists } = await seedBoard(admin);
    for (const c of [optedIn, optedOut]) {
      await joinWorkspace(admin, c, workspaceId);
      await admin.post(`/boards/${boardId}/members`, { userId: c.user.id });
    }
    expect((await optedIn.patch('/me', { prefs: { emailNotifications: true } })).body.user.prefs.emailNotifications).toBe(true);
    const card = (await admin.post(`/lists/${lists[0].id}/cards`, { name: 'Digest card' })).body.card;
    for (const c of [optedIn, optedOut]) await admin.put(`/cards/${card.id}/members/${c.user.id}`);
    await s.tick();
    expect(sink.messages).toHaveLength(0); // not before the digest delay
    await s.db.query(`UPDATE notifications SET created_at = now() - interval '5 minutes'`);
    await s.tick();
    expect(sink.messages.map((m) => m.to)).toEqual([['dg_in@example.test']]);
    const text = sink.text(sink.messages[0]);
    expect(text).toContain('Dg_admin added you to “Digest card”');
    expect(text).toContain(`/b/`);
    await s.tick();
    expect(sink.messages).toHaveLength(1); // each notification is emailed once
  });

  it('SMTP failures are retried and visible to the system admin', async () => {
    sink.messages.length = 0;
    sink.state.fail = true;
    const admin = await loggedIn(s, 'smtp_admin', { sysadmin: true });
    const test = await admin.post('/admin/email/test', {});
    expect(test.status).toBe(502);
    expect(test.body.error.message).toMatch(/Sending failed: .*451/);
    await new Client(s).post('/auth/forgot', {
      email: 'smtp_admin@example.test',
    });
    await s.tick();
    let st = (await admin.get('/admin/status')).body.email;
    expect(st).toMatchObject({ enabled: true, pending: 1 });
    for (let i = 0; i < 4; i++) {
      await s.db.query(`UPDATE email_outbox SET next_attempt_at = now() WHERE status = 'pending'`);
      await s.tick();
    }
    st = (await admin.get('/admin/status')).body.email;
    expect(st).toMatchObject({ pending: 0, failed: 1 });
    expect(st.lastError).toMatch(/451/);
    sink.state.fail = false;
    expect((await admin.post('/admin/email/test', {})).status).toBe(200);
    expect(sink.messages[0].to).toEqual(['smtp_admin@example.test']);
  });
});
