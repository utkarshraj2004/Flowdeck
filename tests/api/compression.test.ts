import http from 'node:http';
import zlib from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loggedIn, seedBoard, startServer, stopServer, type Client, type TestServer } from './helpers.js';

let s: TestServer;
let a: Client;
let boardId: string;
beforeAll(async () => {
  s = await startServer();
  a = await loggedIn(s, 'cmp_a');
  ({ boardId } = await seedBoard(a));
  const list = (await a.get(`/boards/${boardId}`)).body.lists[0];
  for (let i = 0; i < 40; i++) await a.post(`/lists/${list.id}/cards`, { name: `Compressible card ${i}` });
});
afterAll(async () => stopServer(s));

const raw = (path: string, encoding: string) =>
  new Promise<{ headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) =>
    http
      .get(`${s.url}/api/v1${path}`, { headers: { cookie: a.cookie, 'accept-encoding': encoding } }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => resolve({ headers: res.headers, body: Buffer.concat(chunks) }));
      })
      .on('error', reject),
  );

describe('response compression', () => {
  it('compresses board snapshots for clients that accept it, and only for them', async () => {
    const plain = await raw(`/boards/${boardId}`, 'identity');
    expect(plain.headers['content-encoding']).toBeUndefined();
    const br = await raw(`/boards/${boardId}`, 'br, gzip');
    expect(br.headers['content-encoding']).toBe('br');
    expect(br.body.length).toBeLessThan(plain.body.length / 3);
    expect(JSON.parse(zlib.brotliDecompressSync(br.body).toString())).toEqual(JSON.parse(plain.body.toString()));
    const gz = await raw(`/boards/${boardId}`, 'gzip');
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(JSON.parse(zlib.gunzipSync(gz.body).toString()).board.id).toBe(boardId);
    // Security headers and no-store still apply to compressed API responses.
    expect(br.headers['cache-control']).toBe('no-store');
    expect(br.headers['x-content-type-options']).toBe('nosniff');
  });
});
