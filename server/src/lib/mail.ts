import nodemailer, { type Transporter } from 'nodemailer';
import type { Ctx } from '../context.js';
import type { Config } from '../config.js';
import { many, withTx, type Queryable } from '../db.js';

/**
 * Optional email. Only active when FLOWDECK_SMTP_URL is set; every in-app flow works without it.
 * Messages go through an outbox table and are sent by the background worker with retries, so a slow or
 * unreachable SMTP server never blocks a request.
 */

const BACKOFF_S = [60, 300, 1800, 7200];
let cached: { url: string; transport: Transporter } | null = null;

export const mailEnabled = (config: Config) => !!config.smtpUrl;

function transport(config: Config): Transporter {
  if (!cached || cached.url !== config.smtpUrl)
    cached = {
      url: config.smtpUrl!,
      transport: nodemailer.createTransport(config.smtpUrl!),
    };
  return cached.transport;
}

export async function enqueueEmail(
  q: Queryable,
  config: Config,
  msg: {
    userId?: string | null;
    to: string;
    kind: string;
    subject: string;
    text: string;
  },
): Promise<boolean> {
  if (!mailEnabled(config)) return false;
  await q.query('INSERT INTO email_outbox (user_id, to_address, kind, subject, body_text) VALUES ($1,$2,$3,$4,$5)', [
    msg.userId ?? null,
    msg.to,
    msg.kind,
    msg.subject.slice(0, 200),
    msg.text,
  ]);
  return true;
}

/** Send one message now (admin "send test email"); throws with the SMTP error so the admin sees it. */
export async function sendNow(config: Config, to: string, subject: string, text: string) {
  if (!mailEnabled(config)) throw new Error('Email is not configured (FLOWDECK_SMTP_URL is not set).');
  await transport(config).sendMail({
    from: config.mailFrom,
    to,
    subject,
    text,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

export async function sendQueuedEmail(ctx: Ctx, limit = 20): Promise<number> {
  if (!mailEnabled(ctx.config)) return 0;
  const claimed = await withTx(ctx.db, async (tx) => {
    const rows = await many(tx, `SELECT * FROM email_outbox WHERE status = 'pending' AND next_attempt_at <= now() ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED`, [limit]);
    if (rows.length) await tx.query(`UPDATE email_outbox SET next_attempt_at = now() + interval '5 minutes' WHERE id = ANY($1::bigint[])`, [rows.map((r) => r.id)]);
    return rows;
  });
  for (const m of claimed) {
    try {
      await transport(ctx.config).sendMail({
        from: ctx.config.mailFrom,
        to: m.to_address,
        subject: m.subject,
        text: m.body_text,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      await ctx.db.query(`UPDATE email_outbox SET status = 'sent', attempts = attempts + 1, sent_at = now(), last_error = NULL WHERE id = $1`, [m.id]);
    } catch (err) {
      const attempts = m.attempts + 1;
      const wait = BACKOFF_S[attempts - 1];
      await ctx.db.query(`UPDATE email_outbox SET status = $2, attempts = $3, last_error = $4, next_attempt_at = now() + make_interval(secs => $5) WHERE id = $1`, [
        m.id,
        wait === undefined ? 'failed' : 'pending',
        attempts,
        String((err as Error).message).slice(0, 500),
        wait ?? 0,
      ]);
    }
  }
  await ctx.db.query(`DELETE FROM email_outbox WHERE status = 'sent' AND sent_at < now() - interval '30 days'`);
  return claimed.length;
}

// Same wording as the in-app notification drawer (web/src/components/Shell.tsx).
const DIGEST_TEXT: Record<string, (d: any) => string> = {
  mentioned: (d) => `mentioned you on “${d.cardName}”`,
  commented: (d) => `commented on “${d.cardName}”`,
  added_to_card: (d) => `added you to “${d.cardName}”`,
  removed_from_card: (d) => `removed you from “${d.cardName}”`,
  due_changed: (d) => `changed the dates on “${d.cardName}”`,
  completed: (d) => `marked “${d.cardName}” complete`,
  attachment_added: (d) => `attached ${d.attachmentName} to “${d.cardName}”`,
  card_created: (d) => `added “${d.cardName}” to ${d.listName}`,
  card_moved: (d) => `moved “${d.cardName}” to ${d.listName}`,
  card_archived: (d) => `archived “${d.cardName}”`,
  added_to_board: (d) => `added you to the board ${d.boardName}`,
  removed_from_board: () => `removed you from a board`,
  role_changed: (d) => `changed your board role to ${d.role}`,
  removed_from_workspace: (d) => `removed you from the workspace ${d.workspaceName}`,
  invite_accepted: (d) => `joined ${d.workspaceName} with your invitation`,
};

/**
 * Users who opted in get one email listing notifications that stayed unread for the digest delay.
 * Each notification is emailed at most once.
 */
export async function queueDigests(ctx: Ctx): Promise<number> {
  if (!mailEnabled(ctx.config)) return 0;
  const users = await many(
    ctx.db,
    `SELECT DISTINCT u.id, u.email, u.full_name FROM users u JOIN notifications n ON n.user_id = u.id
      WHERE u.disabled_at IS NULL AND u.prefs->>'emailNotifications' = 'true'
        AND n.read_at IS NULL AND n.emailed_at IS NULL AND n.created_at < now() - make_interval(mins => $1)`,
    [ctx.config.emailDigestMinutes],
  );
  for (const u of users) {
    await withTx(ctx.db, async (tx) => {
      const items = await many(
        tx,
        `UPDATE notifications n SET emailed_at = now()
          FROM notifications src LEFT JOIN users a ON a.id = src.actor_id LEFT JOIN boards b ON b.id = src.board_id LEFT JOIN cards c ON c.id = src.card_id
         WHERE n.id = src.id AND n.user_id = $1 AND n.read_at IS NULL AND n.emailed_at IS NULL AND n.created_at < now() - make_interval(mins => $2)
         RETURNING n.kind, n.data, n.created_at, a.full_name AS actor, b.short_id, b.name AS board_name, c.number`,
        [u.id, ctx.config.emailDigestMinutes],
      );
      if (!items.length) return;
      const lines = items
        .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
        .map((n) => {
          const what = (DIGEST_TEXT[n.kind] ?? (() => 'sent you a notification'))(n.data ?? {});
          const link = n.short_id ? `\n  ${ctx.config.baseUrl}/b/${n.short_id}${n.number ? `/c/${n.number}` : ''}` : '';
          return `- ${n.actor ?? 'Someone'} ${what}${n.board_name ? ` (${n.board_name})` : ''}${link}`;
        });
      await enqueueEmail(tx, ctx.config, {
        userId: u.id,
        to: u.email,
        kind: 'digest',
        subject: `Flowdeck: ${items.length} unread notification${items.length === 1 ? '' : 's'}`,
        text: `Hi ${u.full_name},\n\nYou have unread notifications in Flowdeck:\n\n${lines.join('\n')}\n\nOpen Flowdeck: ${ctx.config.baseUrl}\n\nTurn these emails off in Account settings → Notifications.\n`,
      });
    });
  }
  return users.length;
}
