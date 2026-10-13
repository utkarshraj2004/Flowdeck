import crypto from 'node:crypto';
import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import type { Ctx } from '../context.js';
import { many, withTx, type Queryable } from '../db.js';
import type { EventMsg } from './hub.js';
import { invalid } from './errors.js';

/** Seconds to wait before attempt n+1 (after n failures). After the last one the delivery is marked failed. */
export const WEBHOOK_BACKOFF_S = [30, 120, 600, 3600, 6 * 3600];
const TIMEOUT_MS = 10_000;
const MAX_BODY_LOG = 300;

export function validateWebhookUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 2000) throw invalid('Webhook URL must be an http(s) URL', { field: 'url' });
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw invalid('Webhook URL must be an http(s) URL', { field: 'url' });
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:')
    throw invalid('Webhook URL must start with http:// or https://', {
      field: 'url',
    });
  return u.toString();
}

/** Private, loopback, link-local, multicast and unspecified addresses (IPv4 and IPv6). */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateAddress(v6.slice(7));
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || /^fe[89ab]/.test(v6) || v6.startsWith('ff');
}

export function signPayload(secret: string, timestamp: string, body: string): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

/** Queue one delivery per matching enabled webhook for each event. Runs inside the mutation transaction. */
export async function enqueueWebhooks(q: Queryable, events: EventMsg[]) {
  if (!events.length) return;
  const boards = [...new Set(events.map((e) => e.board))];
  const hooks = await many(q, 'SELECT id, board_id, events FROM webhooks WHERE enabled AND board_id = ANY($1::uuid[])', [boards]);
  if (!hooks.length) return;
  for (const e of events) {
    for (const h of hooks) {
      if (h.board_id !== e.board || (h.events && h.events.length && !h.events.includes(e.event))) continue;
      const payload = {
        event: e.event,
        board: { id: e.board },
        seq: e.seq,
        at: e.at,
        actor: e.actor ? { id: e.actor } : null,
        data: e.data,
      };
      await q.query('INSERT INTO webhook_deliveries (webhook_id, event, seq, payload) VALUES ($1,$2,$3,$4)', [h.id, e.event, e.seq, payload]);
    }
  }
}

export interface PostResult {
  status: number | null;
  error: string | null;
}

/** POST a signed JSON body. Never follows redirects; refuses private addresses unless allowed. */
export function postSigned(url: string, secret: string, body: string, headers: Record<string, string>, allowPrivate: boolean): Promise<PostResult> {
  const u = new URL(url);
  const timestamp = String(Math.floor(Date.now() / 1000));
  // Check the address the connection will actually use (not a separate lookup), so DNS rebinding can't slip through.
  const lookup = (hostname: string, options: dns.LookupOptions, cb: (err: Error | null, address: string, family: number) => void) => {
    dns.lookup(hostname, { family: options.family, hints: options.hints }, (err, address, family) => {
      if (err) return cb(err, '', 0);
      if (!allowPrivate && isPrivateAddress(address)) return cb(new Error(`refused private address ${address}`), '', 0);
      cb(null, address, family);
    });
  };
  return new Promise((resolve) => {
    // Literal IP hosts skip the lookup, so check them here too.
    const host = u.hostname.replace(/^\[|\]$/g, '');
    if (net.isIP(host) && !allowPrivate && isPrivateAddress(host))
      return resolve({
        status: null,
        error: `refused private address ${host}`,
      });
    const req = (u.protocol === 'https:' ? https : http).request(
      u,
      {
        method: 'POST',
        lookup: lookup as unknown as net.LookupFunction,
        timeout: TIMEOUT_MS,
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Flowdeck-Webhooks/1',
          'x-flowdeck-timestamp': timestamp,
          'x-flowdeck-signature': signPayload(secret, timestamp, body),
          ...headers,
        },
      },
      (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (c: string) => {
          if (text.length < MAX_BODY_LOG) text += c;
        });
        res.on('end', () => {
          const code = res.statusCode ?? 0;
          resolve({
            status: code || null,
            error: code >= 200 && code < 300 ? null : `HTTP ${code}${text ? `: ${text.slice(0, MAX_BODY_LOG)}` : ''}`,
          });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`timed out after ${TIMEOUT_MS / 1000} s`)));
    req.on('error', (err) => resolve({ status: null, error: err.message }));
    req.end(body);
  });
}

/** Claim due deliveries (leased for 5 minutes, so a crash retries them), send them, and record each result. */
export async function deliverWebhooks(ctx: Ctx, limit = 20): Promise<number> {
  const claimed = await withTx(ctx.db, async (tx) => {
    const rows = await many(
      tx,
      `SELECT d.id, d.event, d.payload, d.attempts, w.url, w.secret
         FROM webhook_deliveries d JOIN webhooks w ON w.id = d.webhook_id
        WHERE d.status = 'pending' AND d.next_attempt_at <= now() AND w.enabled
        ORDER BY d.id LIMIT $1 FOR UPDATE OF d SKIP LOCKED`,
      [limit],
    );
    if (rows.length) await tx.query(`UPDATE webhook_deliveries SET next_attempt_at = now() + interval '5 minutes' WHERE id = ANY($1::bigint[])`, [rows.map((r) => r.id)]);
    return rows;
  });
  for (const d of claimed) {
    const body = JSON.stringify({ id: String(d.id), ...d.payload });
    const r = await postSigned(d.url, d.secret, body, { 'x-flowdeck-event': d.event, 'x-flowdeck-delivery': String(d.id) }, ctx.config.webhookAllowPrivate);
    const attempts = d.attempts + 1;
    if (!r.error)
      await ctx.db.query(`UPDATE webhook_deliveries SET status = 'delivered', attempts = $2, last_status = $3, last_error = NULL, delivered_at = now() WHERE id = $1`, [
        d.id,
        attempts,
        r.status,
      ]);
    else {
      const wait = WEBHOOK_BACKOFF_S[attempts - 1];
      await ctx.db.query(
        `UPDATE webhook_deliveries SET status = $2, attempts = $3, last_status = $4, last_error = $5, next_attempt_at = now() + make_interval(secs => $6) WHERE id = $1`,
        [d.id, wait === undefined ? 'failed' : 'pending', attempts, r.status, r.error.slice(0, 500), wait ?? 0],
      );
    }
  }
  // Keep the log bounded: delivered entries older than 30 days go; failures stay visible until the webhook is deleted.
  await ctx.db.query(`DELETE FROM webhook_deliveries WHERE status = 'delivered' AND delivered_at < now() - interval '30 days'`);
  return claimed.length;
}
