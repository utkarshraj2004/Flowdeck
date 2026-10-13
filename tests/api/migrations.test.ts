import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPool } from '../../server/src/db.js';
import { LATEST_SCHEMA, migrate } from '../../server/src/migrate.js';
import { createTestDatabase, dropTestDatabase } from './helpers.js';

let name: string;
beforeAll(async () => {
  name = await createTestDatabase();
});
afterAll(async () => dropTestDatabase(name));

describe('migrations', () => {
  it('apply once, are idempotent, and refuse a database newer than the build', async () => {
    const u = new URL(process.env.TEST_DATABASE_URL || 'postgres://flowdeck:flowdeck@localhost:5432/postgres');
    u.pathname = `/${name}`;
    const db = createPool(u.toString());
    expect(await migrate(db)).toEqual(Array.from({ length: LATEST_SCHEMA() }, (_, i) => i + 1));
    expect(await migrate(db)).toEqual([]);
    // Two app instances starting together: the advisory lock serializes them.
    expect(await Promise.all([migrate(db), migrate(db)])).toEqual([[], []]);
    await db.query(`INSERT INTO schema_migrations (version, name) VALUES (9999, '9999_future.sql')`);
    await expect(migrate(db)).rejects.toThrow(/newer than this Flowdeck build/);
    await db.end();
  });
});
