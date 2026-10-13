import type { FastifyRequest } from 'fastify';
import type { Config } from './config.js';
import type { Db } from './db.js';
import type { Hub } from './lib/hub.js';
import type { Worker } from './lib/worker.js';
import { HttpError } from './lib/errors.js';

export interface Ctx {
  db: Db;
  hub: Hub;
  config: Config;
  worker: Worker;
}

export interface SessionUser {
  id: string;
  email: string;
  username: string;
  full_name: string;
  initials: string;
  is_system_admin: boolean;
  prefs: Record<string, unknown>;
  session_id: string;
  csrf_token: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
}

export function auth(req: FastifyRequest): SessionUser {
  if (!req.user) throw new HttpError(401, 'unauthenticated', 'Please log in.');
  return req.user;
}

export function mutationId(req: FastifyRequest): string | null {
  const v = req.headers['x-client-mutation-id'];
  return typeof v === 'string' && v.length <= 100 ? v : null;
}

export const SESSION_COOKIE = 'fd_session';
