#!/usr/bin/env node
// Reproducible performance benchmark for a Flowdeck *production build*.
//
//   node scripts/perf/bench.mjs --root <checkout with dist/> --port 18181 --out result.json [--lists 12 --cards 100]
//
// It creates a fresh database (flowdeck_perf_<port>), starts `node dist/server/index.js` from --root,
// seeds a deterministic synthetic dataset through the public API, then measures in headless Chromium.
// Every timing is the median of several runs. Run two builds on the same machine back to back to compare.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import pg from 'pg';
import { chromium } from 'playwright-core';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const ROOT = path.resolve(args.root ?? '.');
const PORT = Number(args.port ?? 18181);
const LISTS = Number(args.lists ?? 12);
const CARDS = Number(args.cards ?? 100);
const RUNS = Number(args.runs ?? 5);
const OUT = args.out;
const PROFILE_DIR = args.profile; // optional: write CPU profiles of the filter and drag steps here
const TRACE_DIR = args.trace; // optional: write a Chrome performance trace of one card open here
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_URL = process.env.TEST_DATABASE_URL || 'postgres://flowdeck:flowdeck@localhost:5432/postgres';
const DB = `flowdeck_perf_${PORT}`;
const CHROMIUM = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? Math.round((s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) * 10) / 10 : null;
};
let seed = 1234567;
const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);

/** Main-thread time (CDP Performance metrics, in ms) spent while `fn` runs: total task, script, layout, style. */
async function mainThread(page, fn) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const read = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const a = await read();
  await fn();
  const b = await read();
  await cdp.detach();
  const d = (k) => Math.round((b[k] - a[k]) * 1000);
  return { taskMs: d('TaskDuration'), scriptMs: d('ScriptDuration'), layoutMs: d('LayoutDuration'), styleMs: d('RecalcStyleDuration') };
}

async function profile(page, name) {
  if (!PROFILE_DIR) return async () => {};
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  return async () => {
    const { profile: p } = await cdp.send('Profiler.stop');
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
    fs.writeFileSync(path.join(PROFILE_DIR, `${name}.cpuprofile`), JSON.stringify(p));
    await cdp.detach();
  };
}

async function resetDb() {
  const c = new pg.Client({ connectionString: ADMIN_URL });
  await c.connect();
  await c.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`);
  await c.query(`CREATE DATABASE ${DB}`);
  await c.end();
}

function startServer() {
  const u = new URL(ADMIN_URL);
  u.pathname = `/${DB}`;
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowdeck-perf-'));
  const env = { ...process.env, DATABASE_URL: u.toString(), PORT: String(PORT), HOST: '127.0.0.1', FLOWDECK_BASE_URL: BASE, FLOWDECK_DATA_DIR: dataDir, FLOWDECK_WEB_DIR: path.join(ROOT, 'dist/web') };
  const proc = spawn('node', [path.join(ROOT, 'dist/server/index.js')], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  return { proc, dbUrl: u.toString() };
}

async function waitReady() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/readyz`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('server did not start');
}

class Api {
  cookie = '';
  csrf = '';
  async call(method, p, body) {
    const r = await fetch(`${BASE}/api/v1${p}`, {
      method,
      headers: { cookie: this.cookie, 'x-csrf-token': this.csrf, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = r.headers.get('set-cookie');
    if (set?.includes('fd_session=')) this.cookie = set.match(/fd_session=[^;]*/)[0];
    const text = await r.text();
    if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${text}`);
    return text ? JSON.parse(text) : null;
  }
}

async function seedUsers(dbUrl) {
  // Users are inserted directly (benchmark fixture); everything else goes through the API.
  const { hash } = await import(path.join(ROOT, 'node_modules/@node-rs/argon2/index.js')).catch(() => import('@node-rs/argon2'));
  const c = new pg.Client({ connectionString: dbUrl });
  await c.connect();
  const h = await hash('correct horse battery');
  for (const [u, n, admin] of [['perf_a', 'Avery Perf', true], ['perf_b', 'Blake Perf', false], ['perf_c', 'Casey Perf', false]])
    await c.query(`INSERT INTO users (email, username, full_name, initials, password_hash, is_system_admin) VALUES ($1,$2,$3,$4,$5,$6)`, [`${u}@example.test`, u, n, n.split(' ').map((x) => x[0]).join(''), h, admin]);
  await c.end();
}

async function login(email) {
  const a = new Api();
  const r = await a.call('POST', '/auth/login', { email, password: 'correct horse battery' });
  a.csrf = r.csrfToken;
  a.user = r.user;
  return a;
}

async function seedData(a, b, c) {
  const ws = (await a.call('POST', '/workspaces', { name: 'Perf team' })).workspace;
  for (const other of [b, c]) {
    const inv = (await a.call('POST', `/workspaces/${ws.id}/invites`, { kind: 'link' })).invite;
    await other.call('POST', `/invites/${inv.url.split('/invite/')[1]}/accept`);
  }
  const board = (await a.call('POST', '/boards', { workspaceId: ws.id, name: 'Large board', defaultLists: false })).board;
  for (const u of [b, c]) await a.call('POST', `/boards/${board.id}/members`, { userId: u.user.id });
  const labels = (await a.call('GET', `/boards/${board.id}`)).labels;
  const members = [a.user.id, b.user.id, c.user.id];
  const lists = [];
  for (let l = 0; l < LISTS; l++) lists.push((await a.call('POST', `/boards/${board.id}/lists`, { name: `Stage ${l + 1}` })).list);
  let n = 0;
  for (const list of lists) {
    const batch = [];
    for (let i = 0; i < CARDS; i++) {
      const k = n++;
      batch.push(
        (async () => {
          const card = (await a.call('POST', `/lists/${list.id}/cards`, { name: `Task ${k + 1}: ${['Review copy', 'Fix layout bug', 'Draft spec', 'Call supplier', 'Update tests', 'Plan sprint'][k % 6]}` })).card;
          if (k % 3 === 0) await a.call('PUT', `/cards/${card.id}/labels/${labels[k % labels.length].id}`);
          if (k % 5 === 0) await a.call('PUT', `/cards/${card.id}/members/${members[k % 3]}`);
          if (k % 7 === 0) await a.call('PATCH', `/cards/${card.id}`, { dueAt: new Date(Date.now() + ((k % 9) - 3) * 86400e3).toISOString(), description: 'Some **markdown** detail.' });
          if (k % 11 === 0) {
            const cl = (await a.call('POST', `/cards/${card.id}/checklists`, { name: 'Steps' })).checklist;
            for (let j = 0; j < 3; j++) await a.call('POST', `/checklists/${cl.id}/items`, { name: `Step ${j + 1}` });
          }
          if (k % 13 === 0) await a.call('POST', `/cards/${card.id}/comments`, { body: 'Looks good, @perf_b please check.' });
        })(),
      );
      if (batch.length >= 8) await Promise.all(batch.splice(0));
    }
    await Promise.all(batch);
  }
  return { board, lists };
}

async function measure(a, b, board, lists) {
  const out = {};
  // 1. API snapshot
  const snapTimes = [];
  let snapBytes = 0;
  for (let i = 0; i < RUNS + 1; i++) {
    const t0 = performance.now();
    // Raw bytes as sent (node:http does not decompress), with the encodings a browser offers.
    const r = await new Promise((resolve, reject) =>
      http
        .get(`${BASE}/api/v1/boards/${board.id}`, { headers: { cookie: a.cookie, 'accept-encoding': 'gzip, deflate, br' } }, (res) => {
          const chunks = [];
          res.on('data', (d) => chunks.push(d));
          res.on('end', () => resolve({ buf: Buffer.concat(chunks), encoding: res.headers['content-encoding'] }));
        })
        .on('error', reject),
    );
    if (i > 0) snapTimes.push(performance.now() - t0); // first is warm-up
    snapBytes = r.buf.length;
    out.snapshotEncoding = r.encoding ?? 'identity';
  }
  out.apiSnapshotMs = median(snapTimes);
  out.apiSnapshotBytesOnWire = snapBytes;
  // 2. Mutation latency (rename) via API
  const card0 = (await a.call('GET', `/boards/${board.id}`)).cards[0];
  const mut = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    await a.call('PATCH', `/cards/${card0.id}`, { name: `Renamed ${i}` });
    mut.push(performance.now() - t0);
  }
  out.apiRenameMs = median(mut);
  const moves = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    await a.call('POST', `/cards/${card0.id}/move`, { listId: lists[(i + 1) % lists.length].id, position: 'top' });
    moves.push(performance.now() - t0);
  }
  out.apiMoveMs = median(moves);

  // Static bundle size
  const assets = path.join(ROOT, 'dist/web/assets');
  const js = fs.readdirSync(assets).filter((f) => f.endsWith('.js'));
  out.jsBytes = js.reduce((s, f) => s + fs.statSync(path.join(assets, f)).size, 0);
  out.jsGzipBytes = js.reduce((s, f) => s + zlib.gzipSync(fs.readFileSync(path.join(assets, f))).length, 0);
  out.jsFiles = js.length;
  // The entry script named in index.html (what every page downloads before anything renders).
  const entry = fs.readFileSync(path.join(ROOT, 'dist/web/index.html'), 'utf8').match(/src="\/assets\/([^"]+\.js)"/)?.[1];
  if (entry) out.jsEntryGzipBytes = zlib.gzipSync(fs.readFileSync(path.join(assets, entry))).length;

  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const cookieVal = a.cookie.split('=')[1];
  await ctx.addCookies([{ name: 'fd_session', value: cookieVal, url: BASE }]);
  const page = await ctx.newPage();
  const requests = [];
  page.on('request', (r) => r.url().includes('/api/v1/') && requests.push(r.method() + ' ' + new URL(r.url()).pathname));
  const total = LISTS * CARDS;

  // 3. Board load: navigation start → every list rendered and last card in DOM
  const loads = [];
  for (let i = 0; i < RUNS; i++) {
    await page.goto(`${BASE}/`);
    await page.waitForSelector('[aria-label="Account menu"]');
    const stopLoadProfile = i === 1 ? await profile(page, 'board-load') : async () => {};
    const t0 = Date.now();
    await page.goto(`${BASE}/b/${board.shortId}`);
    await page.waitForFunction((n) => document.querySelectorAll('[data-card-id]').length >= n, total - 5, { timeout: 60000 });
    loads.push(Date.now() - t0);
    await stopLoadProfile();
  }
  out.boardLoadMs = median(loads);
  out.domNodes = await page.evaluate(() => document.getElementsByTagName('*').length);
  out.cardElements = await page.evaluate(() => document.querySelectorAll('[data-card-id]').length);
  await page.waitForTimeout(500);

  // 4. Remote change → visible in this page (another user creates a card); includes server + WS + render.
  const remote = [];
  for (let i = 0; i < RUNS; i++) {
    const name = `Remote ${i} ${Date.now()}`;
    const t0 = Date.now();
    await b.call('POST', `/lists/${lists[2].id}/cards`, { name });
    await page.waitForFunction((t) => [...document.querySelectorAll('[data-card-id]')].some((e) => e.textContent?.includes(t)), name, { polling: 'raf' });
    remote.push(Date.now() - t0);
  }
  out.remoteCreateVisibleMs = median(remote);

  // 5. Main-thread cost of 20 remote events (long tasks while they apply)
  await page.evaluate(() => {
    window.__lt = 0;
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__lt += e.duration))).observe({ type: 'longtask', buffered: false });
  });
  out.mainThreadFor20RemoteEvents = await mainThread(page, async () => {
    for (let i = 0; i < 20; i++) await b.call('PATCH', `/cards/${card0.id}`, { name: `Burst ${i}` });
    await page.waitForFunction(() => [...document.querySelectorAll('[data-card-id]')].some((e) => e.textContent?.includes('Burst 19')));
    await page.waitForTimeout(300);
  });
  out.longTaskMsFor20RemoteEvents = Math.round(await page.evaluate(() => window.__lt));

  // 6. Open a card dialog: click → title rendered; count API calls
  const opens = [];
  const splits = [];
  let openReqs = 0;
  for (let i = 0; i < RUNS; i++) {
    const tile = page.locator('[data-card-id]').filter({ hasText: `Task ${20 + i}:` }).first();
    await tile.scrollIntoViewIfNeeded();
    requests.length = 0;
    const stopProfile = i === 1 ? await profile(page, 'card-open') : async () => {};
    if (TRACE_DIR && i === 2) await browser.startTracing(page, { path: path.join(TRACE_DIR, 'card-open.json'), screenshots: false });
    const t0 = Date.now();
    const split = await mainThread(page, async () => {
      await tile.click();
      await page.waitForSelector('#card-title button, #card-title');
      await page.waitForFunction(() => !!document.querySelector('[role="dialog"]') && !document.querySelector('[role="dialog"] .skeleton'));
    });
    opens.push(Date.now() - t0);
    splits.push(split);
    if (TRACE_DIR && i === 2) await browser.stopTracing();
    await stopProfile();
    await page.waitForTimeout(300);
    openReqs = requests.length;
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  }
  out.cardOpenMs = median(opens);
  // Main-thread split of the card open (median per field): where the time goes (script vs layout vs style).
  out.cardOpenMainThread = Object.fromEntries(Object.keys(splits[0]).map((k) => [k, median(splits.map((x) => x[k]))]));
  out.apiRequestsOnCardOpen = openReqs;

  // 7. Toggle a label inside the dialog: requests triggered and time until the chip shows
  {
    const tile = page.locator('[data-card-id]').filter({ hasText: 'Task 40:' }).first();
    await tile.click();
    await page.waitForFunction(() => !!document.querySelector('[role="dialog"]') && !document.querySelector('[role="dialog"] .skeleton'));
    await page.getByRole('button', { name: 'Labels', exact: true }).click();
    // The first label not yet on the card (label order differs between builds).
    const box = page.locator('[role="dialog"] input[type="checkbox"]:not(:checked)').first();
    await box.waitFor();
    const handle = await box.elementHandle();
    requests.length = 0;
    const t0 = Date.now();
    await handle.click();
    await page.waitForFunction((el) => el.checked === true, handle, { polling: 'raf' });
    out.labelToggleMs = Date.now() - t0;
    await page.waitForTimeout(600);
    out.apiRequestsOnLabelToggle = requests.length;
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
  }

  // 8. Composer: type a title + Enter → new card visible
  const adds = [];
  for (let i = 0; i < RUNS; i++) {
    const list0 = page.locator(`[data-list-id="${lists[0].id}"]`);
    await list0.getByRole('button', { name: /Add a card/ }).click();
    const box = page.getByLabel('Card title').last();
    await box.fill(`Composer ${i}`);
    const t0 = Date.now();
    await box.press('Enter');
    await page.waitForFunction((t) => [...document.querySelectorAll('[data-card-id]')].some((e) => e.textContent?.includes(t)), `Composer ${i}`, { polling: 'raf' });
    adds.push(Date.now() - t0);
    await page.keyboard.press('Escape');
  }
  out.composerAddVisibleMs = median(adds);

  // 9. Filter keyword typing: 8 characters, time until the board reflects the final query
  {
    await page.keyboard.press('f');
    const kw = page.getByLabel('Keyword');
    await kw.waitFor();
    const stop = await profile(page, 'filter');
    out.mainThreadForFilterTyping = await mainThread(page, async () => {
      const t0 = Date.now();
      await kw.pressSequentially('Task 999', { delay: 0 });
      await page.waitForFunction(() => document.querySelectorAll('[data-card-id]').length <= 3, null, { polling: 'raf' });
      out.filterType8CharsMs = Date.now() - t0;
    });
    await stop();
    await kw.fill('');
    await page.keyboard.press('Escape');
    await page.goto(`${BASE}/b/${board.shortId}`);
    await page.waitForFunction((n) => document.querySelectorAll('[data-card-id]').length >= n, total - 5, { timeout: 60000 });
  }

  // 10. Mouse drag of a card to the next list: drop → card in target list (optimistic) and → server confirmed
  {
    const drags = [];
    for (let i = 0; i < 3; i++) {
      const from = page.locator(`[data-list-id="${lists[1].id}"] [data-card-id]`).first();
      const id = await from.getAttribute('data-card-id');
      await from.scrollIntoViewIfNeeded();
      const fb = await from.boundingBox();
      const target = page.locator(`[data-list-id="${lists[0].id}"]`).first();
      const tb = await target.boundingBox();
      await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2);
      await page.mouse.down();
      await page.mouse.move(fb.x + fb.width / 2 + 10, fb.y + fb.height / 2 + 10, { steps: 4 });
      await page.mouse.move(tb.x + tb.width / 2, tb.y + 80, { steps: 12 });
      await page.waitForTimeout(100);
      const t0 = Date.now();
      await page.mouse.up();
      await page.waitForFunction(([cid, lid]) => !!document.querySelector(`[data-list-id="${lid}"] [data-card-id="${cid}"]`), [id, lists[0].id], { polling: 'raf' });
      drags.push(Date.now() - t0);
      await page.waitForTimeout(400);
    }
    out.dragDropVisibleMs = median(drags);
  }
  await browser.close();
  return out;
}

const { proc, dbUrl } = await (async () => {
  await resetDb();
  return startServer();
})();
let stderr = '';
proc.stderr.on('data', (d) => (stderr += d));
try {
  await waitReady();
  await seedUsers(dbUrl);
  const [a, b, c] = await Promise.all(['perf_a', 'perf_b', 'perf_c'].map((u) => login(`${u}@example.test`)));
  const t0 = Date.now();
  const { board, lists } = await seedData(a, b, c);
  const seedMs = Date.now() - t0;
  const result = { root: ROOT, lists: LISTS, cardsPerList: CARDS, runs: RUNS, node: process.version, seedMs, ...(await measure(a, b, board, lists)) };
  console.log(JSON.stringify(result, null, 2));
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
} catch (e) {
  console.error(e);
  console.error(stderr.slice(-2000));
  process.exitCode = 1;
} finally {
  proc.kill('SIGTERM');
}
