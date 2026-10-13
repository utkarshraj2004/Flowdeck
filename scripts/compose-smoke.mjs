#!/usr/bin/env node
// End-to-end operations check for the Docker Compose deployment (research O1/O2):
// build + start → first admin → create data + upload → restart (persistence) →
// backup → wipe all volumes → restore → identical board export and file bytes.
// Uses its own compose project and port, so it never touches a real install.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = process.env.SMOKE_PORT || '18080';
const BASE = `http://localhost:${PORT}`;
const env = {
  ...process.env,
  COMPOSE_PROJECT_NAME: 'flowdeck-smoke',
  POSTGRES_PASSWORD: 'smoke' + Math.random().toString(16).slice(2),
  FLOWDECK_BASE_URL: BASE,
  FLOWDECK_PORT: PORT,
  FLOWDECK_RESTORE_YES: '1',
};
const sh = (cmd, opts = {}) => execSync(cmd, { env, stdio: opts.capture ? 'pipe' : 'inherit', encoding: 'utf8' });
const step = (m) => console.log(`\n=== ${m}`);
const fail = (m) => {
  console.error(`SMOKE FAILED: ${m}`);
  process.exit(1);
};

async function ready(timeoutMs = 120_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${BASE}/readyz`);
      if (r.ok) return Date.now() - t0;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  fail('Flowdeck did not become ready');
}

class Session {
  cookie = '';
  csrf = '';
  async call(method, p, body, raw = false) {
    const headers = { cookie: this.cookie, 'x-csrf-token': this.csrf };
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    const r = await fetch(`${BASE}/api/v1${p}`, { method, headers, body: payload });
    const set = r.headers.get('set-cookie');
    if (set?.includes('fd_session=')) this.cookie = set.match(/fd_session=[^;]*/)[0];
    if (raw) return r;
    const json = await r.json().catch(() => null);
    if (!r.ok) fail(`${method} ${p} → ${r.status} ${JSON.stringify(json)}`);
    return json;
  }
}

const exportBoard = async (s, id) => {
  const e = await s.call('GET', `/boards/${id}/export`);
  delete e.exportedAt;
  return JSON.stringify(e);
};

const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flowdeck-smoke-backup-'));
try {
  step('Build and start (clean volumes)');
  sh('docker compose down -v --remove-orphans');
  // Host networking for the build works in restricted sandboxes (e.g. Claude Code Cloud) and on normal hosts.
  const ca = process.env.EXTRA_CA_CERT ? ` --secret id=extra_ca,src=${process.env.EXTRA_CA_CERT}` : '';
  sh(`docker build --network host${ca} -t flowdeck:local .`);
  sh('docker compose up -d');
  console.log(`ready after ${await ready()} ms`);

  step('Create the first administrator with the CLI and activate through the setup link');
  const out = sh('docker compose exec -T app node dist/server/cli.js admin create --email admin@example.test', { capture: true });
  const link = out.match(/https?:\/\/\S+\/setup\/(\S+)/);
  if (!link) fail(`no setup link in CLI output:\n${out}`);
  const s = new Session();
  const setup = await s.call('POST', `/setup/${link[1]}`, { fullName: 'Smoke Admin', username: 'smoke_admin', password: 'correct horse battery' });
  s.csrf = setup.csrfToken;

  step('Create workspace data and an attachment');
  const ws = (await s.call('GET', '/me/home')).workspaces[0];
  const board = (await s.call('POST', '/boards', { workspaceId: ws.id, name: 'Smoke board' })).board;
  const lists = (await s.call('GET', `/boards/${board.id}`)).lists;
  const card = (await s.call('POST', `/lists/${lists[0].id}/cards`, { name: 'Persist me' })).card;
  await s.call('PATCH', `/cards/${card.id}`, { description: 'Survives restarts and restores.' });
  await s.call('POST', `/cards/${card.id}/comments`, { body: 'Smoke comment' });
  const bytes = Buffer.from(`attachment ${Date.now()}`);
  const fd = new FormData();
  fd.append('file', new Blob([bytes]), 'proof.txt');
  const att = (await s.call('POST', `/cards/${card.id}/attachments`, fd)).attachment;
  const before = await exportBoard(s, board.id);

  step('Restart the app container: data persists');
  sh('docker compose restart app');
  await ready();
  if ((await exportBoard(s, board.id)) !== before) fail('board export changed after restart');
  console.log('export identical after restart');

  step('Back up');
  sh(`scripts/backup.sh ${backupRoot}`);
  const dir = path.join(backupRoot, fs.readdirSync(backupRoot)[0]);
  console.log(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));

  step('Wipe everything (containers and volumes) and start fresh');
  sh('docker compose down -v');
  sh('docker compose up -d');
  await ready();
  const empty = await new Session().call('POST', '/auth/login', { email: 'admin@example.test', password: 'correct horse battery' }, true);
  if (empty.status !== 401) fail(`expected an empty instance, login returned ${empty.status}`);

  step('Restore and verify');
  sh(`scripts/restore.sh ${dir}`);
  await ready();
  const s2 = new Session();
  const login = await s2.call('POST', '/auth/login', { email: 'admin@example.test', password: 'correct horse battery' });
  s2.csrf = login.csrfToken;
  if ((await exportBoard(s2, board.id)) !== before) fail('board export differs after restore');
  const dl = await s2.call('GET', `/attachments/${att.id}/download`, undefined, true);
  if (!Buffer.from(await dl.arrayBuffer()).equals(bytes)) fail('attachment bytes differ after restore');
  console.log('\nSMOKE PASSED: restart persistence, backup, wipe, restore (export and file bytes identical)');
} finally {
  if (!process.env.SMOKE_KEEP) sh('docker compose down -v --remove-orphans');
  fs.rmSync(backupRoot, { recursive: true, force: true });
}
