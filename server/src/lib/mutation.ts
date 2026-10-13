import type { Db, Tx } from '../db.js';
import { withTx } from '../db.js';
import { boardAccess } from './permissions.js';
import { MUTABLE_NOTIFICATIONS } from './constants.js';
import type { EventMsg, Hub } from './hub.js';
import { runAutomations } from './automation.js';
import { enqueueWebhooks } from './webhooks.js';

export interface NotificationOut {
  id: string;
  userId: string;
  kind: string;
  actorId: string | null;
  boardId: string | null;
  cardId: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

/**
 * One mutation = one Postgres transaction. Each change appends an activity row
 * whose `seq` is allocated under the board row lock, so per-board ordering is
 * gap-free. Realtime events and notifications are delivered after COMMIT only.
 */
export class Mutation {
  events: EventMsg[] = [];
  notifications: NotificationOut[] = [];
  recheck = new Set<string>();
  /** Set by the automation worker: its own changes do not trigger further rules. */
  skipAutomation = false;
  private locked = new Set<string>();

  constructor(
    public tx: Tx,
    public actorId: string,
    public clientMutationId: string | null,
  ) {}

  /** Lock boards in a stable order to serialize writes and avoid deadlocks. */
  async lock(...boardIds: string[]) {
    for (const id of [...new Set(boardIds)].sort()) {
      if (this.locked.has(id)) continue;
      await this.tx.query('SELECT id FROM boards WHERE id = $1 FOR UPDATE', [id]);
      this.locked.add(id);
    }
  }

  async emit(
    boardId: string,
    event: string,
    opts: { cardId?: string | null; listId?: string | null; summary?: Record<string, unknown>; data?: Record<string, unknown>; hidden?: boolean } = {},
  ): Promise<EventMsg> {
    await this.lock(boardId);
    const seqRow = await this.tx.query('UPDATE boards SET last_seq = last_seq + 1 WHERE id = $1 RETURNING last_seq', [boardId]);
    const seq = seqRow.rows[0].last_seq as number;
    const data = opts.data ?? {};
    const r = await this.tx.query(
      `INSERT INTO activity (board_id, seq, type, actor_id, card_id, list_id, summary, payload, client_mutation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING created_at`,
      [boardId, seq, event, this.actorId, opts.cardId ?? null, opts.listId ?? null, { ...(opts.summary ?? {}), hidden: opts.hidden ?? false }, data, this.clientMutationId],
    );
    const msg: EventMsg = {
      type: 'event',
      board: boardId,
      seq,
      event,
      actor: this.actorId,
      at: r.rows[0].created_at,
      clientMutationId: this.clientMutationId,
      data,
    };
    this.events.push(msg);
    return msg;
  }

  /**
   * Notify users about something. Never notifies the actor, de-duplicates, and
   * only notifies users who can currently see the board (no leaks through
   * notifications).
   */
  async notify(userIds: Iterable<string>, kind: string, ctx: { boardId: string | null; cardId?: string | null; data?: Record<string, unknown> }) {
    const seen = new Set<string>();
    for (const uid of userIds) {
      if (!uid || uid === this.actorId || seen.has(uid)) continue;
      seen.add(uid);
      if (ctx.boardId && !(await boardAccess(this.tx, uid, ctx.boardId))) continue;
      // Respect the recipient's notification settings (access changes are never mutable).
      if ((MUTABLE_NOTIFICATIONS as readonly string[]).includes(kind)) {
        const muted = await this.tx.query(`SELECT 1 FROM users WHERE id = $1 AND prefs->'mutedNotifications' ? $2`, [uid, kind]);
        if (muted.rowCount) continue;
      }
      const r = await this.tx.query(
        `INSERT INTO notifications (user_id, kind, actor_id, board_id, card_id, data) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
        [uid, kind, this.actorId, ctx.boardId, ctx.cardId ?? null, ctx.data ?? {}],
      );
      this.notifications.push({
        id: r.rows[0].id,
        userId: uid,
        kind,
        actorId: this.actorId,
        boardId: ctx.boardId,
        cardId: ctx.cardId ?? null,
        data: ctx.data ?? {},
        createdAt: r.rows[0].created_at,
      });
    }
  }

  async watch(userId: string, targetType: 'board' | 'list' | 'card', targetId: string) {
    await this.tx.query('INSERT INTO subscriptions (user_id, target_type, target_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [
      userId,
      targetType,
      targetId,
    ]);
  }
}

export async function runMutation<T>(
  deps: { db: Db; hub: Hub },
  actorId: string,
  clientMutationId: string | null,
  fn: (m: Mutation) => Promise<T>,
): Promise<{ data: T; events: EventMsg[] }> {
  let m!: Mutation;
  const data = await withTx(deps.db, async (tx) => {
    m = new Mutation(tx, actorId, clientMutationId);
    const result = await fn(m);
    // Same transaction: automation actions and webhook deliveries commit together with the change.
    if (!m.skipAutomation) await runAutomations(m, [...m.events]);
    await enqueueWebhooks(tx, m.events);
    return result;
  });
  for (const e of m.events) deps.hub.publish(e);
  if (m.notifications.length) {
    const actor = (await deps.db.query('SELECT id, username, full_name, initials FROM users WHERE id = $1', [actorId])).rows[0];
    for (const n of m.notifications)
      deps.hub.sendToUser(n.userId, { type: 'notification', notification: { ...n, readAt: null, actor: actor ? { id: actor.id, username: actor.username, fullName: actor.full_name, initials: actor.initials } : null } });
  }
  for (const b of m.recheck) await deps.hub.recheckBoard(b);
  return { data, events: m.events };
}
