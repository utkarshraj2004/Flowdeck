import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_LIMITS, limitsFromEnv } from '../../server/src/lib/constants.js';
import { Client, loggedIn, seedBoard, startServer, stopServer, type TestServer } from './helpers.js';

let s: TestServer;
beforeAll(async () => {
  process.env.FLOWDECK_WS_CHECK_MS = '200'; // fast heartbeat so the test sees a revoked socket close
  s = await startServer();
});
afterAll(async () => {
  delete process.env.FLOWDECK_WS_CHECK_MS;
  await stopServer(s);
});

describe('signed-in devices', () => {
  it('lists the user’s own sessions, signs out another device, and closes that device’s live connection', async () => {
    const laptop = await loggedIn(s, 'sess_user');
    const phone = await new Client(s).login('sess_user@example.test');
    const other = await loggedIn(s, 'sess_other');
    const { boardId } = await seedBoard(laptop);

    const list = (await laptop.get('/me/sessions')).body.sessions;
    expect(list).toHaveLength(2);
    expect(list.filter((x: any) => x.current)).toHaveLength(1);
    expect((await other.get('/me/sessions')).body.sessions).toHaveLength(1); // only your own

    const phoneId = list.find((x: any) => !x.current).id;
    expect((await other.del(`/me/sessions/${phoneId}`)).status).toBe(404); // not someone else's
    const ws = await phone.ws();
    ws.send({ type: 'subscribe', board: boardId, sinceSeq: 0 });
    await ws.wait((m) => m.type === 'subscribed');

    const current = list.find((x: any) => x.current).id;
    expect((await laptop.del(`/me/sessions/${current}`)).status).toBe(422); // use log out for this one
    expect((await laptop.del(`/me/sessions/${phoneId}`)).body).toEqual({ signedOut: 1 });
    expect((await phone.get('/me')).status).toBe(401);
    await ws.wait((m) => m.type === 'error' && m.code === 'session_ended', 3000);
    await new Promise<void>((resolve) => (ws.socket.readyState === ws.socket.CLOSED ? resolve() : ws.socket.once('close', () => resolve())));
    expect((await laptop.get('/me/sessions')).body.sessions).toHaveLength(1);
  });

  it('“sign out all other devices” keeps the current one', async () => {
    const a = await loggedIn(s, 'sess_many');
    for (let i = 0; i < 3; i++) await new Client(s).login('sess_many@example.test');
    expect((await a.del('/me/sessions/others')).body).toEqual({ signedOut: 3 });
    expect((await a.get('/me/sessions')).body.sessions).toHaveLength(1);
    expect((await a.get('/me')).status).toBe(200);
  });
});

describe('configurable object limits', () => {
  it('reads FLOWDECK_LIMIT_* overrides and rejects bad values', () => {
    expect(limitsFromEnv({})).toEqual(DEFAULT_LIMITS);
    expect(limitsFromEnv({ FLOWDECK_LIMIT_OPEN_CARDS_PER_BOARD: '10000', FLOWDECK_LIMIT_ATTACHMENTS_PER_CARD: '5' })).toEqual({
      ...DEFAULT_LIMITS,
      openCardsPerBoard: 10000,
      attachmentsPerCard: 5,
    });
    expect(() => limitsFromEnv({ FLOWDECK_LIMIT_LABELS_PER_BOARD: 'lots' })).toThrow(/FLOWDECK_LIMIT_LABELS_PER_BOARD/);
    expect(() => limitsFromEnv({ FLOWDECK_LIMIT_ITEMS_PER_CHECKLIST: '0' })).toThrow();
  });
});
