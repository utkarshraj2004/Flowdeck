import type { Queryable } from '../db.js';
import { randomToken, sha256 } from './security.js';

/** One-time link token for first-admin setup (24 h) or password reset (1 h). Only the hash is stored. */
export async function createUserToken(q: Queryable, userId: string, kind: 'setup' | 'reset'): Promise<string> {
  const token = randomToken();
  const hours = kind === 'setup' ? 24 : 1;
  await q.query(`UPDATE user_tokens SET used_at = now() WHERE user_id = $1 AND kind = $2 AND used_at IS NULL`, [userId, kind]);
  await q.query(`INSERT INTO user_tokens (user_id, kind, token_hash, expires_at) VALUES ($1,$2,$3, now() + make_interval(hours => $4))`, [userId, kind, sha256(token), hours]);
  return token;
}
