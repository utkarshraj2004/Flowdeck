// Starts Flowdeck for the browser tests against a fresh database and data directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { E2E_DB_URL, ADMIN_URL, E2E_DB } from './env.js';

const admin = new pg.Client({ connectionString: ADMIN_URL });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${E2E_DB} WITH (FORCE)`);
await admin.query(`CREATE DATABASE ${E2E_DB}`);
await admin.end();

const port = process.env.E2E_PORT || '4173';
process.env.DATABASE_URL = E2E_DB_URL;
process.env.PORT = port;
process.env.HOST = '127.0.0.1';
process.env.FLOWDECK_BASE_URL = `http://localhost:${port}`;
process.env.FLOWDECK_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'flowdeck-e2e-'));
process.env.FLOWDECK_WEB_DIR = path.resolve('dist/web');
process.env.MAX_UPLOAD_MB = '2';
if (!fs.existsSync(path.join(process.env.FLOWDECK_WEB_DIR, 'index.html'))) {
  console.error('dist/web is missing: run "npm run build:web" before the browser tests.');
  process.exit(1);
}
await import('../../server/src/index.js');
