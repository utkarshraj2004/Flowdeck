import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, joinWorkspace, loggedIn, seedBoard, startServer, stopServer, type TestServer } from './helpers.js';

let s: TestServer;
let a: Client, b: Client, outsider: Client, card: any, boardId: string;
const MB = 1024 * 1024;
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000000200015e2a8b0b0000000049454e44ae426082', 'hex');

function filesOnDisk(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => fs.existsSync(d) && fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : out.push(e.name)));
  walk(dir);
  return out;
}

async function upload(c: Client, cardId: string, name: string, content: Buffer | string, type = 'application/octet-stream') {
  const fd = new FormData();
  fd.append('file', new Blob([content], { type }), name);
  return c.req('POST', `/cards/${cardId}/attachments`, fd);
}

beforeAll(async () => {
  s = await startServer({ maxUploadBytes: 1 * MB });
  a = await loggedIn(s, 'up_a');
  b = await loggedIn(s, 'up_b');
  outsider = await loggedIn(s, 'up_c');
  const seeded = await seedBoard(a);
  boardId = seeded.boardId;
  await joinWorkspace(a, b, seeded.workspaceId);
  card = (await a.post(`/lists/${seeded.lists[0].id}/cards`, { name: 'Files' })).body.card;
});
afterAll(async () => stopServer(s));

describe('attachments', () => {
  it('stores uploads, serves them byte-for-byte to board viewers with safe headers', async () => {
    const r = await upload(a, card.id, 'notes.txt', 'hello from flowdeck', 'text/plain');
    expect(r.status).toBe(200);
    const att = r.body.attachment;
    expect(att).toMatchObject({ kind: 'file', name: 'notes.txt', bytes: 19 });
    const dl = await fetch(`${s.url}${att.url}`, { headers: { cookie: b.cookie } }); // b is a workspace viewer
    expect(dl.status).toBe(200);
    expect(await dl.text()).toBe('hello from flowdeck');
    expect(dl.headers.get('x-content-type-options')).toBe('nosniff');
    expect(dl.headers.get('content-security-policy')).toContain('sandbox');
  });

  it('never serves HTML or SVG inline, and makes the first image the cover', async () => {
    const html = (await upload(a, card.id, 'evil.html', '<script>alert(1)</script>', 'text/html')).body.attachment;
    const svg = (await upload(a, card.id, 'logo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>', 'image/svg+xml')).body.attachment;
    for (const att of [html, svg]) {
      const dl = await fetch(`${s.url}${att.url}`, { headers: { cookie: a.cookie } });
      expect(dl.headers.get('content-type')).toBe('application/octet-stream');
      expect(dl.headers.get('content-disposition')).toMatch(/^attachment;/);
    }
    const png = (await upload(a, card.id, 'shot.png', PNG, 'image/png')).body.attachment;
    expect(png.isImage).toBe(true);
    const dl = await fetch(`${s.url}${png.url}`, { headers: { cookie: a.cookie } });
    expect(dl.headers.get('content-type')).toBe('image/png');
    expect(dl.headers.get('content-disposition')).toMatch(/^inline;/);
    expect((await a.get(`/cards/${card.id}`)).body.card.cover).toEqual({ attachmentId: png.id });
  });

  it('rejects files over the limit with 413 and leaves nothing on disk', async () => {
    const before = filesOnDisk(s.config.uploadDir).length;
    const r = await upload(a, card.id, 'big.bin', Buffer.alloc(1 * MB + 10));
    expect(r.status).toBe(413);
    expect(r.body.error).toMatchObject({ code: 'payload_too_large', message: 'File is larger than 1 MB' });
    expect(filesOnDisk(s.config.uploadDir).length).toBe(before);
    const exact = await upload(a, card.id, 'exact.bin', Buffer.alloc(1 * MB));
    expect(exact.status).toBe(200);
  });

  it('enforces permissions on upload, download and removal', async () => {
    const att = (await upload(a, card.id, 'private.txt', 'only for members')).body.attachment;
    // Outsider: no access at all, and no existence leak.
    expect((await fetch(`${s.url}${att.url}`, { headers: { cookie: outsider.cookie } })).status).toBe(404);
    expect((await upload(outsider, card.id, 'x.txt', 'x')).status).toBe(404);
    // Unauthenticated: 401.
    expect((await fetch(`${s.url}${att.url}`)).status).toBe(401);
    // Viewer (not joined): cannot upload or delete.
    expect((await upload(b, card.id, 'x.txt', 'x')).status).toBe(403);
    expect((await b.del(`/attachments/${att.id}`)).status).toBe(403);
    // A board member may only remove their own uploads; admins may remove any.
    await b.post(`/boards/${boardId}/join`);
    const mine = (await upload(b, card.id, 'mine.txt', 'mine')).body.attachment;
    expect((await b.del(`/attachments/${att.id}`)).status).toBe(403);
    expect((await b.del(`/attachments/${mine.id}`)).status).toBe(200);
    expect((await a.del(`/attachments/${att.id}`)).status).toBe(200);
  });

  it('accepts only http(s) links and never fetches them', async () => {
    expect((await a.post(`/cards/${card.id}/attachments`, { url: 'javascript:alert(1)' })).status).toBe(422);
    expect((await a.post(`/cards/${card.id}/attachments`, { url: 'file:///etc/passwd' })).status).toBe(422);
    const ok = await a.post(`/cards/${card.id}/attachments`, { url: 'https://example.com/spec', name: 'Spec' });
    expect(ok.body.attachment).toMatchObject({ kind: 'link', url: 'https://example.com/spec', name: 'Spec' });
  });

  it('removes files from disk when the card is deleted, and keeps them across restarts', async () => {
    const c2 = (await a.post(`/lists/${card.listId}/cards`, { name: 'Temp files' })).body.card;
    const att = (await upload(a, c2.id, 'keep.txt', 'persisted bytes')).body.attachment;
    s = await s.restart();
    a = await new Client(s).login('up_a@example.test');
    const dl = await fetch(`${s.url}${att.url}`, { headers: { cookie: a.cookie } });
    expect(await dl.text()).toBe('persisted bytes');
    const before = filesOnDisk(s.config.uploadDir).length;
    await a.post(`/cards/${c2.id}/archive`);
    await a.del(`/cards/${c2.id}`);
    expect(filesOnDisk(s.config.uploadDir).length).toBe(before - 1);
  });
});
