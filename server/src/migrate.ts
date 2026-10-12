import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './db.js';

const here = path.dirname(fileURLToPath(import.meta.url));
// Works from both server/src (tsx) and dist/server (compiled).
export const MIGRATIONS_DIR = [path.resolve(here, '../../migrations'), path.resolve(here, '../migrations')].find((p) =>
  fs.existsSync(p),
)!;

export function listMigrations(): { version: number; name: string; file: string }[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({ version: Number.parseInt(f.slice(0, 4), 10), name: f, file: path.join(MIGRATIONS_DIR, f) }));
}

export const LATEST_SCHEMA = () => Math.max(0, ...listMigrations().map((m) => m.version));

/**
 * Forward-only migrations, applied in one transaction each, under an advisory
 * lock so two app instances starting together cannot race. Refuses to run if
 * the database schema is newer than this build (downgrade protection).
 */
export async function migrate(db: Db, log: (msg: string) => void = () => undefined): Promise<number[]> {
  const client = await db.connect();
  const applied: number[] = [];
  try {
    await client.query('SELECT pg_advisory_lock(727274)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version int PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const done = new Set((await client.query('SELECT version FROM schema_migrations')).rows.map((r) => r.version as number));
    const all = listMigrations();
    const latest = Math.max(0, ...all.map((m) => m.version));
    const dbMax = Math.max(0, ...done);
    if (dbMax > latest) {
      throw new Error(
        `Database schema version ${dbMax} is newer than this Flowdeck build (${latest}). Refusing to start; run a newer Flowdeck image or restore a matching backup.`,
      );
    }
    for (const m of all) {
      if (done.has(m.version)) continue;
      const sql = fs.readFileSync(m.file, 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [m.version, m.name]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${m.name} failed: ${(err as Error).message}`);
      }
      applied.push(m.version);
      log(`applied migration ${m.name}`);
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(727274)').catch(() => undefined);
    client.release();
  }
  return applied;
}
