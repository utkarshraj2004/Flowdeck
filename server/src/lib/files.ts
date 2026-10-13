import fs from 'node:fs/promises';
import path from 'node:path';
import type { Queryable } from '../db.js';

export function storagePath(uploadDir: string, key: string) {
  return path.join(uploadDir, key.slice(0, 2), key);
}

/** Storage keys of uploaded files under a scope, collected before a cascading delete. */
export async function fileKeys(q: Queryable, where: string, params: unknown[]): Promise<string[]> {
  const r = await q.query(
    `SELECT a.storage_key FROM attachments a JOIN cards c ON c.id = a.card_id WHERE a.storage_key IS NOT NULL AND ${where}`,
    params,
  );
  return r.rows.map((x) => x.storage_key);
}

/** Remove files after the database commit; missing files are ignored. */
export async function removeFiles(uploadDir: string, keys: string[]) {
  for (const k of keys) await fs.rm(storagePath(uploadDir, k), { force: true });
}
