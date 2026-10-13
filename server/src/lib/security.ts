import crypto from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export async function hashPassword(password: string): Promise<string> {
  // argon2id with the library defaults (m=19 MiB, t=2, p=1), per OWASP guidance.
  return hash(password);
}

export async function verifyPassword(stored: string | null, password: string): Promise<boolean> {
  if (!stored) return false;
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

const SHORT_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function shortId(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (const b of bytes) out += SHORT_ALPHABET[b % SHORT_ALPHABET.length];
  return out;
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}
