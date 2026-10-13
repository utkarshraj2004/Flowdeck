import { invalid } from './errors.js';

type Obj = Record<string, unknown>;

export function body(raw: unknown): Obj {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw invalid('Request body must be a JSON object');
  return raw as Obj;
}

export function str(o: Obj, key: string, opts: { min?: number; max: number; trim?: boolean; optional?: boolean; label?: string }): string | undefined {
  const v = o[key];
  const label = opts.label ?? key;
  if (v === undefined || v === null) {
    if (opts.optional) return undefined;
    throw invalid(`${label} is required`, { field: key });
  }
  if (typeof v !== 'string') throw invalid(`${label} must be text`, { field: key });
  const s = opts.trim === false ? v : v.trim();
  const min = opts.min ?? 0;
  if (s.length < min) throw invalid(min <= 1 ? `${label} is required` : `${label} must be at least ${min} characters`, { field: key });
  if (s.length > opts.max) throw invalid(`${label} must be at most ${opts.max} characters`, { field: key });
  return s;
}

export function oneOf<T extends string>(o: Obj, key: string, values: readonly T[], optional = false): T | undefined {
  const v = o[key];
  if (v === undefined || v === null) {
    if (optional) return undefined;
    throw invalid(`${key} is required`, { field: key });
  }
  if (typeof v !== 'string' || !values.includes(v as T)) throw invalid(`${key} must be one of: ${values.join(', ')}`, { field: key });
  return v as T;
}

export function bool(o: Obj, key: string): boolean | undefined {
  const v = o[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'boolean') throw invalid(`${key} must be true or false`, { field: key });
  return v;
}

export function dateOrNull(o: Obj, key: string): string | null | undefined {
  if (!(key in o)) return undefined;
  const v = o[key];
  if (v === null || v === '') return null;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) throw invalid(`${key} must be an ISO date or null`, { field: key });
  return new Date(v).toISOString();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);

export function uuid(o: Obj, key: string, optional = false): string | undefined {
  const v = o[key];
  if (v === undefined || v === null) {
    if (optional) return undefined;
    throw invalid(`${key} is required`, { field: key });
  }
  if (!isUuid(v)) throw invalid(`${key} must be an id`, { field: key });
  return v;
}

export function password(o: Obj, key = 'password'): string {
  const v = o[key];
  if (typeof v !== 'string' || v.length < 12) throw invalid('Password must be at least 12 characters', { field: key });
  if (v.length > 256) throw invalid('Password must be at most 256 characters', { field: key });
  return v;
}

export function username(o: Obj, key = 'username'): string {
  const v = typeof o[key] === 'string' ? (o[key] as string).trim().toLowerCase() : '';
  if (!/^[a-z0-9_]{3,32}$/.test(v)) throw invalid('Username must be 3–32 characters: lowercase letters, digits or _', { field: key });
  return v;
}

export function email(o: Obj, key = 'email'): string {
  const v = typeof o[key] === 'string' ? (o[key] as string).trim() : '';
  if (!/^[^\s@]+@[^\s@]+$/.test(v) || v.length > 254) throw invalid('Enter a valid email address', { field: key });
  return v;
}

export function initialsFor(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.slice(0, 2) ?? '?';
  return letters.toUpperCase().slice(0, 4);
}
