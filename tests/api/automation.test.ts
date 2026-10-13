import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { postSigned } from '../../server/src/lib/webhooks.js';
import { joinWorkspace, loggedIn, seedBoard, startServer, stopServer, type Client, type TestServer } from './helpers.js';
import { startReceiver } from './sinks.js';

let s: TestServer;
let admin: Client, member: Client, outsider: Client;
let boardId: string, workspaceId: string, lists: any[], labels: any[];
let receiver: Awaited<ReturnType<typeof startReceiver>>;

beforeAll(async () => {
  // Webhooks to 127.0.0.1 need the opt-in (private addresses are refused by default; tested below).
  s = await startServer({ config: { webhookAllowPrivate: true } });
  admin = await loggedIn(s, 'auto_admin');
  member = await loggedIn(s, 'auto_member');
  outsider = await loggedIn(s, 'auto_out');
  let snap: any;
  ({ boardId, workspaceId, lists, snap } = await seedBoard(admin, {
    visibility: 'private',
  }));
  labels = snap.labels;
  await joinWorkspace(admin, member, workspaceId);
  await admin.post(`/boards/${boardId}/members`, { userId: member.user.id });
  receiver = await startReceiver();
});
afterAll(async () => {
  await receiver.close();
  await stopServer(s);
});

const [TODO, DOING, DONE] = [0, 1, 2];
const card = async (c: Client, id: string) => (await c.get(`/cards/${id}`)).body.card;

describe('unread markers on cards (per user, persistent)', () => {
  it('a teammate’s comment marks the card unread for watchers only; opening it clears the marker everywhere', async () => {
    const c = (
      await admin.post(`/lists/${lists[TODO].id}/cards`, {
        name: 'Watched card',
      })
    ).body.card; // the creator watches it
    const ws = await admin.ws();
    expect((await member.post(`/cards/${c.id}/comments`, { body: 'Looks good' })).status).toBe(200);
    await ws.wait((m) => m.type === 'notification' && m.notification.cardId === c.id);
    expect((await admin.get(`/boards/${boardId}`)).body.unreadCardIds).toEqual([c.id]);
    expect((await member.get(`/boards/${boardId}`)).body.unreadCardIds).toEqual([]); // never the actor's own activity

    // Survives a server restart (stored per user, not in memory).
    s = await s.restart();
    admin.server = s;
    member.server = s;
    outsider.server = s;
    expect((await admin.get(`/boards/${boardId}`)).body.unreadCardIds).toEqual([c.id]);

    const ws2 = await admin.ws();
    const r = await admin.post('/notifications/read', { cardId: c.id });
    expect(r.status).toBe(200);
    expect(r.body.cards).toEqual({ [c.id]: false });
    const pushed = await ws2.wait((m) => m.type === 'notifications.unread');
    expect(pushed.cards).toEqual({ [c.id]: false });
    expect((await admin.get(`/boards/${boardId}`)).body.unreadCardIds).toEqual([]);
    expect((await admin.post('/notifications/read', { cardId: 'not-a-uuid' })).status).toBe(422);
    ws.close();
    ws2.close();
  });
});

describe('automation rules', () => {
  it('only board admins can manage rules; members can read them; outsiders get 404', async () => {
    const rule = {
      name: 'Done means done',
      trigger: { type: 'card_moved', listId: lists[DONE].id },
      actions: [{ type: 'set_complete', complete: true }],
    };
    expect((await member.post(`/boards/${boardId}/automations`, rule)).status).toBe(403);
    expect((await outsider.post(`/boards/${boardId}/automations`, rule)).status).toBe(404);
    expect((await outsider.get(`/boards/${boardId}/automations`)).status).toBe(404);
    expect(
      (
        await admin.post(`/boards/${boardId}/automations`, {
          ...rule,
          actions: [],
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await admin.post(`/boards/${boardId}/automations`, {
          ...rule,
          trigger: { type: 'card_moved', listId: crypto.randomUUID() },
        })
      ).status,
    ).toBe(422);
    const created = await admin.post(`/boards/${boardId}/automations`, rule);
    expect(created.status).toBe(200);
    expect((await member.get(`/boards/${boardId}/automations`)).body.rules.map((r: any) => r.name)).toEqual(['Done means done']);
    expect(
      (
        await member.patch(`/automations/${created.body.rule.id}`, {
          enabled: false,
        })
      ).status,
    ).toBe(403);
    expect((await admin.del(`/automations/${created.body.rule.id}`)).status).toBe(200);
    expect((await member.get(`/boards/${boardId}/automations`)).body.rules).toEqual([]);
  });

  it('a member’s move runs the rule in the same transaction; teammates receive the changes live in seq order', async () => {
    const label = labels[0];
    const rule = (
      await admin.post(`/boards/${boardId}/automations`, {
        name: 'Finish',
        trigger: { type: 'card_moved', listId: lists[DONE].id },
        actions: [
          { type: 'set_complete', complete: true },
          { type: 'add_label', labelId: label.id },
        ],
      })
    ).body.rule;
    const c = (await member.post(`/lists/${lists[DOING].id}/cards`, { name: 'Ship it' })).body.card;
    const ws = await admin.ws();
    const before = (await admin.get(`/boards/${boardId}`)).body.seq;
    ws.send({ type: 'subscribe', board: boardId, sinceSeq: before });
    await ws.wait((m) => m.type === 'subscribed');
    expect((await member.post(`/cards/${c.id}/move`, { listId: lists[DONE].id })).status).toBe(200);

    const after = await card(member, c.id);
    expect(after.dueComplete).toBe(true);
    expect(after.labelIds).toEqual([label.id]);
    await ws.wait((m) => m.type === 'event' && m.event === 'card.label_added');
    const evts = ws.events(boardId).filter((e: any) => e.seq > before);
    expect(evts.map((e: any) => e.event)).toEqual(['card.moved', 'card.updated', 'card.label_added']);
    expect(evts.map((e: any) => e.seq)).toEqual([before + 1, before + 2, before + 3]);
    // Visible in the card history with the rule's name.
    const history = after.activity.map((a: any) => a.summary?.automation).filter(Boolean);
    expect(history).toEqual(['Finish', 'Finish']);
    const stored = (await admin.get(`/boards/${boardId}/automations`)).body.rules.find((r: any) => r.id === rule.id);
    expect(stored.runCount).toBe(1);
    expect(stored.lastError).toBeNull();
    // Moving within Done again (no list change) does not re-run it.
    expect(
      (
        await member.post(`/cards/${c.id}/move`, {
          listId: lists[DONE].id,
          position: 'top',
        })
      ).status,
    ).toBe(200);
    expect((await admin.get(`/boards/${boardId}/automations`)).body.rules.find((r: any) => r.id === rule.id).runCount).toBe(1);
    await admin.del(`/automations/${rule.id}`);
    ws.close();
  });

  it('a failing rule never blocks the user’s change and is reported on the rule and in the activity', async () => {
    const temp = (
      await admin.post(`/boards/${boardId}/labels`, {
        name: 'Temporary',
        color: 'pink',
      })
    ).body.label;
    const rule = (
      await admin.post(`/boards/${boardId}/automations`, {
        name: 'Tag new work',
        trigger: { type: 'card_added', listId: lists[TODO].id },
        actions: [
          { type: 'set_due', days: 3 },
          { type: 'add_label', labelId: temp.id },
        ],
      })
    ).body.rule;
    expect((await admin.del(`/labels/${temp.id}`)).status).toBe(200);
    const created = await member.post(`/lists/${lists[TODO].id}/cards`, {
      name: 'Still created',
    });
    expect(created.status).toBe(200);
    const c = await card(member, created.body.card.id);
    expect(c.name).toBe('Still created');
    expect(c.dueAt).toBeNull(); // the rule's first action was rolled back with the failed second one
    const stored = (await admin.get(`/boards/${boardId}/automations`)).body.rules.find((r: any) => r.id === rule.id);
    expect(stored.lastError).toBe('the label was deleted');
    expect(c.activity.map((a: any) => a.type)).toContain('automation.failed');
    // Saving the rule again with a valid action clears the error and it works.
    expect(
      (
        await admin.patch(`/automations/${rule.id}`, {
          actions: [{ type: 'set_due', days: 3 }],
        })
      ).body.rule.lastError,
    ).toBeNull();
    const ok = (
      await member.post(`/lists/${lists[TODO].id}/cards`, {
        name: 'Gets a due date',
      })
    ).body.card;
    expect((await card(member, ok.id)).dueAt).not.toBeNull();
    await admin.del(`/automations/${rule.id}`);
  });

  it('“due soon” rules run once per card and due date from the worker, as the rule owner', async () => {
    const rule = (
      await admin.post(`/boards/${boardId}/automations`, {
        name: 'Escalate',
        trigger: { type: 'due_soon', hours: 24 },
        actions: [{ type: 'add_member', userId: admin.user.id }],
      })
    ).body.rule;
    const soon = (
      await member.post(`/lists/${lists[TODO].id}/cards`, {
        name: 'Due tomorrow morning',
      })
    ).body.card;
    const later = (
      await member.post(`/lists/${lists[TODO].id}/cards`, {
        name: 'Due next month',
      })
    ).body.card;
    await member.patch(`/cards/${soon.id}`, {
      dueAt: new Date(Date.now() + 3 * 3600_000).toISOString(),
    });
    await member.patch(`/cards/${later.id}`, {
      dueAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
    });
    await s.tick();
    expect((await card(admin, soon.id)).memberIds).toEqual([admin.user.id]);
    expect((await card(admin, later.id)).memberIds).toEqual([]);
    // Removing the member and running the worker again does not repeat the rule for the same due date.
    await admin.del(`/cards/${soon.id}/members/${admin.user.id}`);
    await s.tick();
    expect((await card(admin, soon.id)).memberIds).toEqual([]);
    expect((await admin.get(`/boards/${boardId}/automations`)).body.rules.find((r: any) => r.id === rule.id).runCount).toBe(1);
    await admin.del(`/automations/${rule.id}`);
  });
});

describe('outgoing webhooks', () => {
  let hook: any;
  it('board admins only; the secret is shown once', async () => {
    expect((await member.post(`/boards/${boardId}/webhooks`, { url: receiver.url })).status).toBe(403);
    expect((await outsider.get(`/boards/${boardId}/webhooks`)).status).toBe(404);
    expect(
      (
        await admin.post(`/boards/${boardId}/webhooks`, {
          url: 'ftp://example.test/x',
        })
      ).status,
    ).toBe(422);
    const r = await admin.post(`/boards/${boardId}/webhooks`, {
      url: receiver.url,
      events: ['card.created', 'card.moved'],
    });
    expect(r.status).toBe(200);
    hook = r.body.webhook;
    expect(hook.secret).toMatch(/.{30,}/);
    const listed = (await admin.get(`/boards/${boardId}/webhooks`)).body.webhooks;
    expect(listed[0].secret).toBeUndefined();
  });

  it('delivers signed board events after commit, only the chosen event types', async () => {
    receiver.received.length = 0;
    const c = (await member.post(`/lists/${lists[TODO].id}/cards`, { name: 'Hooked' })).body.card;
    await member.patch(`/cards/${c.id}`, { name: 'Hooked (renamed)' }); // card.updated: not subscribed
    await s.tick();
    expect(receiver.received).toHaveLength(1);
    const got = receiver.received[0];
    const body = JSON.parse(got.body);
    expect(body).toMatchObject({
      event: 'card.created',
      board: { id: boardId },
      actor: { id: member.user.id },
    });
    expect(body.data.card.name).toBe('Hooked');
    const expected = `sha256=${crypto.createHmac('sha256', hook.secret).update(`${got.headers['x-flowdeck-timestamp']}.${got.body}`).digest('hex')}`;
    expect(got.headers['x-flowdeck-signature']).toBe(expected);
    expect(got.headers['x-flowdeck-event']).toBe('card.created');
    const log = (await admin.get(`/webhooks/${hook.id}/deliveries`)).body.deliveries;
    expect(log[0]).toMatchObject({
      event: 'card.created',
      status: 'delivered',
      attempts: 1,
      lastStatus: 200,
    });
  });

  it('a failing receiver is retried with backoff and every attempt is logged; a failed delivery can be retried', async () => {
    receiver.state.status = 500;
    await member.post(`/lists/${lists[TODO].id}/cards`, {
      name: 'Receiver down',
    });
    await s.tick();
    let d = (await admin.get(`/webhooks/${hook.id}/deliveries`)).body.deliveries[0];
    expect(d).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastStatus: 500,
    });
    expect(d.lastError).toContain('HTTP 500');
    expect(new Date(d.nextAttemptAt).getTime()).toBeGreaterThan(Date.now() + 20_000);
    // Exhaust the retries (fast-forward the schedule in the database).
    for (let i = 0; i < 5; i++) {
      await s.db.query(`UPDATE webhook_deliveries SET next_attempt_at = now() WHERE id = $1`, [d.id]);
      await s.tick();
    }
    d = (await admin.get(`/webhooks/${hook.id}/deliveries`)).body.deliveries[0];
    expect(d).toMatchObject({ status: 'failed', attempts: 6 });
    receiver.state.status = 200;
    expect((await admin.post(`/webhooks/${hook.id}/deliveries/${d.id}/retry`)).status).toBe(200);
    await s.tick();
    d = (await admin.get(`/webhooks/${hook.id}/deliveries`)).body.deliveries[0];
    expect(d).toMatchObject({ status: 'delivered' });
  });

  it('refuses private and loopback addresses unless the operator allows them', async () => {
    const r = await postSigned(receiver.url, 'secret', '{}', {}, false);
    expect(r.error).toMatch(/refused private address 127\.0\.0\.1/);
    expect(receiver.received.some((x) => x.body === '{}')).toBe(false);
    const ok = await postSigned(receiver.url, 'secret', '{}', {}, true);
    expect(ok).toEqual({ status: 200, error: null });
  });

  it('disabled or deleted webhooks receive nothing', async () => {
    await admin.patch(`/webhooks/${hook.id}`, { enabled: false });
    receiver.received.length = 0;
    await member.post(`/lists/${lists[TODO].id}/cards`, { name: 'Quiet' });
    await s.tick();
    expect(receiver.received).toHaveLength(0);
    expect((await admin.del(`/webhooks/${hook.id}`)).status).toBe(200);
    expect((await admin.get(`/webhooks/${hook.id}/deliveries`)).status).toBe(404);
  });
});
