import type { Ctx } from '../context.js';
import { many, one, type Queryable } from '../db.js';
import { emitCard } from './cards.js';
import { invalid } from './errors.js';
import type { EventMsg } from './hub.js';
import { runMutation, type Mutation } from './mutation.js';
import { boardAccess } from './permissions.js';
import { keyFor } from './positions.js';
import { isUuid } from './validate.js';

/**
 * Board automation: "when <trigger>, do <actions>".
 *
 * - Card triggers run inside the mutation transaction that caused them, so the actions commit (and are
 *   broadcast) together with the user's change, in seq order, and appear in the activity log.
 * - Each rule runs in a savepoint. If an action fails (a list or label was deleted, a member left), the
 *   rule's changes are rolled back, the user's change still commits, and the failure is recorded on the
 *   rule and in the board activity. Nothing fails silently.
 * - Actions never trigger other rules, so rules cannot loop.
 */

export type Trigger = { type: 'card_added'; listId: string | null } | { type: 'card_moved'; listId: string } | { type: 'card_completed' } | { type: 'due_soon'; hours: number };

export type Action =
  | { type: 'move_to_list'; listId: string; position: 'top' | 'bottom' }
  | { type: 'add_label' | 'remove_label'; labelId: string }
  | { type: 'add_member' | 'remove_member'; userId: string }
  | { type: 'set_complete'; complete: boolean }
  | { type: 'set_due'; days: number }
  | { type: 'archive' };

export interface RuleRow {
  id: string;
  board_id: string;
  name: string;
  trigger: Trigger;
  actions: Action[];
  enabled: boolean;
  created_by: string | null;
}

export const MAX_RULES_PER_BOARD = 50;
const MAX_ACTIONS = 5;

class AutomationError extends Error {}

async function requireList(q: Queryable, boardId: string, listId: unknown, what: string) {
  if (!isUuid(listId)) throw invalid(`${what}: choose a list`);
  const l = await one(q, 'SELECT id FROM lists WHERE id = $1 AND board_id = $2 AND archived_at IS NULL', [listId, boardId]);
  if (!l) throw invalid(`${what}: that list is not an open list on this board`);
  return listId;
}

/** Validate a trigger and actions against the board (lists, labels and members must exist on it). */
export async function parseRule(q: Queryable, boardId: string, rawTrigger: unknown, rawActions: unknown): Promise<{ trigger: Trigger; actions: Action[] }> {
  const t = (rawTrigger ?? {}) as Record<string, unknown>;
  let trigger: Trigger;
  switch (t.type) {
    case 'card_added':
      trigger = {
        type: 'card_added',
        listId: t.listId == null || t.listId === '' ? null : await requireList(q, boardId, t.listId, 'Trigger'),
      };
      break;
    case 'card_moved':
      trigger = {
        type: 'card_moved',
        listId: await requireList(q, boardId, t.listId, 'Trigger'),
      };
      break;
    case 'card_completed':
      trigger = { type: 'card_completed' };
      break;
    case 'due_soon': {
      const hours = Number(t.hours);
      if (!Number.isInteger(hours) || hours < 1 || hours > 24 * 14) throw invalid('Trigger: "due soon" needs a number of hours between 1 and 336');
      trigger = { type: 'due_soon', hours };
      break;
    }
    default:
      throw invalid('Choose a trigger');
  }
  if (!Array.isArray(rawActions) || rawActions.length === 0) throw invalid('Add at least one action');
  if (rawActions.length > MAX_ACTIONS) throw invalid(`A rule can have at most ${MAX_ACTIONS} actions`);
  const actions: Action[] = [];
  for (const raw of rawActions as Record<string, unknown>[]) {
    const a = raw ?? {};
    switch (a.type) {
      case 'move_to_list':
        actions.push({
          type: 'move_to_list',
          listId: await requireList(q, boardId, a.listId, 'Move'),
          position: a.position === 'top' ? 'top' : 'bottom',
        });
        break;
      case 'add_label':
      case 'remove_label': {
        const ok = isUuid(a.labelId) && (await one(q, 'SELECT 1 FROM labels WHERE id = $1 AND board_id = $2', [a.labelId, boardId]));
        if (!ok) throw invalid('Label action: choose a label on this board');
        actions.push({ type: a.type, labelId: a.labelId as string });
        break;
      }
      case 'add_member':
      case 'remove_member': {
        const ok = isUuid(a.userId) && (await one(q, 'SELECT 1 FROM board_members WHERE user_id = $1 AND board_id = $2', [a.userId, boardId]));
        if (!ok) throw invalid('Member action: choose a member of this board');
        actions.push({ type: a.type, userId: a.userId as string });
        break;
      }
      case 'set_complete':
        actions.push({ type: 'set_complete', complete: a.complete !== false });
        break;
      case 'set_due': {
        const days = Number(a.days);
        if (!Number.isInteger(days) || days < 0 || days > 365) throw invalid('Due date action: days must be between 0 and 365');
        actions.push({ type: 'set_due', days });
        break;
      }
      case 'archive':
        actions.push({ type: 'archive' });
        break;
      default:
        throw invalid('Unknown action');
    }
  }
  if (trigger.type === 'card_moved' && actions.some((a) => a.type === 'move_to_list' && a.listId === trigger.listId))
    throw invalid('A rule cannot move cards into the list that triggers it');
  return { trigger, actions };
}

function matches(trigger: Trigger, e: EventMsg): string | null {
  const card = e.data?.card as { id: string; listId: string; dueComplete: boolean; isTemplate?: boolean } | undefined;
  if (!card || card.isTemplate) return null;
  switch (trigger.type) {
    case 'card_added':
      return e.event === 'card.created' && (!trigger.listId || card.listId === trigger.listId) ? card.id : null;
    case 'card_moved':
      return ((e.event === 'card.moved' && e.data.fromListId !== card.listId) || e.event === 'card.moved_in') && card.listId === trigger.listId ? card.id : null;
    case 'card_completed':
      return e.event === 'card.updated' && (e.data.changed as string[] | undefined)?.includes('dueComplete') && card.dueComplete ? card.id : null;
    default:
      return null;
  }
}

async function applyAction(m: Mutation, rule: RuleRow, cardId: string, a: Action) {
  const tx = m.tx;
  const card = await one(tx, 'SELECT * FROM cards WHERE id = $1', [cardId]);
  if (!card || card.board_id !== rule.board_id) throw new AutomationError('the card is no longer on this board');
  if (card.archived_at) throw new AutomationError('the card is archived');
  const via = { automation: rule.name };
  switch (a.type) {
    case 'move_to_list': {
      if (card.list_id === a.listId) return;
      const list = await one(tx, 'SELECT * FROM lists WHERE id = $1 AND board_id = $2 AND archived_at IS NULL', [a.listId, rule.board_id]);
      if (!list) throw new AutomationError('the target list was archived or deleted');
      const from = await one(tx, 'SELECT name FROM lists WHERE id = $1', [card.list_id]);
      const { position, rebalanced } = await keyFor(tx, { table: 'cards', column: 'list_id', id: a.listId, openOnly: true }, a.position, cardId);
      const row = await one(tx, 'UPDATE cards SET list_id = $2, position = $3, version = version + 1, updated_at = now() WHERE id = $1 RETURNING *', [cardId, a.listId, position]);
      await emitCard(m, row, 'card.moved', { fromList: from?.name, toList: list.name, ...via }, { rebalanced, fromListId: card.list_id });
      return;
    }
    case 'add_label':
    case 'remove_label': {
      const label = await one(tx, 'SELECT * FROM labels WHERE id = $1 AND board_id = $2', [a.labelId, rule.board_id]);
      if (!label) throw new AutomationError('the label was deleted');
      const r =
        a.type === 'add_label'
          ? await tx.query('INSERT INTO card_labels (card_id, label_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [cardId, a.labelId])
          : await tx.query('DELETE FROM card_labels WHERE card_id = $1 AND label_id = $2', [cardId, a.labelId]);
      if (r.rowCount) await emitCard(m, card, a.type === 'add_label' ? 'card.label_added' : 'card.label_removed', { labelName: label.name, labelColor: label.color, ...via });
      return;
    }
    case 'add_member':
    case 'remove_member': {
      const member = await one(tx, 'SELECT u.full_name FROM board_members bm JOIN users u ON u.id = bm.user_id WHERE bm.board_id = $1 AND bm.user_id = $2', [
        rule.board_id,
        a.userId,
      ]);
      if (!member && a.type === 'add_member') throw new AutomationError('the person is no longer a member of this board');
      const r =
        a.type === 'add_member'
          ? await tx.query('INSERT INTO card_members (card_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [cardId, a.userId])
          : await tx.query('DELETE FROM card_members WHERE card_id = $1 AND user_id = $2', [cardId, a.userId]);
      if (!r.rowCount) return;
      if (a.type === 'add_member') await m.watch(a.userId, 'card', cardId);
      await emitCard(m, card, a.type === 'add_member' ? 'card.member_added' : 'card.member_removed', { userId: a.userId, userName: member?.full_name, ...via });
      await m.notify([a.userId], a.type === 'add_member' ? 'added_to_card' : 'removed_from_card', { boardId: rule.board_id, cardId, data: { cardName: card.name } });
      return;
    }
    case 'set_complete': {
      if (card.due_complete === a.complete) return;
      const row = await one(tx, 'UPDATE cards SET due_complete = $2, version = version + 1, updated_at = now() WHERE id = $1 RETURNING *', [cardId, a.complete]);
      await emitCard(m, row, 'card.updated', { changed: ['dueComplete'], dueComplete: a.complete, ...via }, { changed: ['dueComplete'] });
      return;
    }
    case 'set_due': {
      const row = await one(
        tx,
        `UPDATE cards SET due_at = date_trunc('minute', now()) + make_interval(days => $2), version = version + 1, updated_at = now() WHERE id = $1 RETURNING *`,
        [cardId, a.days],
      );
      await emitCard(m, row, 'card.updated', { changed: ['dueAt'], dueAt: row.due_at, ...via }, { changed: ['dueAt'] });
      return;
    }
    case 'archive': {
      const row = await one(tx, 'UPDATE cards SET archived_at = now(), version = version + 1 WHERE id = $1 RETURNING *', [cardId]);
      await emitCard(m, row, 'card.archived', via);
      return;
    }
  }
}

/** Run one rule for one card in a savepoint; record success or the failure. Returns false when it failed. */
export async function applyRule(m: Mutation, rule: RuleRow, cardId: string): Promise<boolean> {
  const before = {
    events: m.events.length,
    notifications: m.notifications.length,
  };
  await m.tx.query('SAVEPOINT automation_rule');
  try {
    for (const a of rule.actions) await applyAction(m, rule, cardId, a);
    await m.tx.query('RELEASE SAVEPOINT automation_rule');
    await m.tx.query('UPDATE automation_rules SET run_count = run_count + 1, last_run_at = now() WHERE id = $1', [rule.id]);
    return true;
  } catch (err) {
    await m.tx.query('ROLLBACK TO SAVEPOINT automation_rule');
    // The rolled-back events and notifications must not be broadcast (their seq numbers are reused).
    m.events.length = before.events;
    m.notifications.length = before.notifications;
    const message = err instanceof AutomationError ? err.message : 'an unexpected error occurred';
    await m.tx.query('UPDATE automation_rules SET last_error = $2, last_error_at = now() WHERE id = $1', [rule.id, message]);
    const card = await one(m.tx, 'SELECT id, board_id, list_id, name FROM cards WHERE id = $1', [cardId]);
    if (card) await emitCard(m, card, 'automation.failed', { ruleName: rule.name, error: message }, { ruleId: rule.id, error: message });
    if (!(err instanceof AutomationError)) console.error(`automation rule ${rule.id} failed`, err);
    return false;
  }
}

/** Run the card-trigger rules matching the events a mutation produced (called inside its transaction). */
export async function runAutomations(m: Mutation, events: EventMsg[]) {
  const cardEvents = events.filter((e) => e.event === 'card.created' || e.event === 'card.moved' || e.event === 'card.moved_in' || e.event === 'card.updated');
  if (!cardEvents.length) return;
  const boards = [...new Set(cardEvents.map((e) => e.board))];
  const rules = await many<RuleRow>(
    m.tx,
    `SELECT * FROM automation_rules WHERE enabled AND board_id = ANY($1::uuid[]) AND trigger->>'type' <> 'due_soon' ORDER BY created_at, id`,
    [boards],
  );
  if (!rules.length) return;
  for (const e of cardEvents)
    for (const rule of rules) {
      if (rule.board_id !== e.board) continue;
      const cardId = matches(rule.trigger, e);
      if (cardId) await applyRule(m, rule, cardId);
    }
}

/** "Due soon" rules: run once per card and due date, as the rule's owner (worker, every tick). */
export async function runDueSoon(ctx: Ctx): Promise<number> {
  const rules = await many<RuleRow>(
    ctx.db,
    `SELECT r.* FROM automation_rules r JOIN boards b ON b.id = r.board_id WHERE r.enabled AND r.trigger->>'type' = 'due_soon' AND b.closed_at IS NULL`,
  );
  let ran = 0;
  for (const rule of rules) {
    const hours = (rule.trigger as { hours: number }).hours;
    const cards = await many(
      ctx.db,
      `SELECT c.id, c.due_at FROM cards c
        WHERE c.board_id = $1 AND c.archived_at IS NULL AND NOT c.is_template AND NOT c.due_complete
          AND c.due_at > now() AND c.due_at <= now() + make_interval(hours => $2)
          AND NOT EXISTS (SELECT 1 FROM automation_due_runs d WHERE d.rule_id = $3 AND d.card_id = c.id AND d.due_at = c.due_at)
        ORDER BY c.due_at LIMIT 50`,
      [rule.board_id, hours, rule.id],
    );
    if (!cards.length) continue;
    // The rule acts with its owner's rights. If the owner can no longer edit the board, the rule is switched off visibly.
    const access = rule.created_by ? await boardAccess(ctx.db, rule.created_by, rule.board_id) : null;
    if (!access?.can.edit) {
      await ctx.db.query(`UPDATE automation_rules SET enabled = false, last_error = $2, last_error_at = now() WHERE id = $1`, [
        rule.id,
        'Switched off: the person who last saved this rule can no longer edit the board. A board admin can switch it on again.',
      ]);
      continue;
    }
    for (const c of cards) {
      await runMutation(ctx, rule.created_by!, null, async (m) => {
        m.skipAutomation = true;
        await m.lock(rule.board_id);
        const claimed = await m.tx.query('INSERT INTO automation_due_runs (rule_id, card_id, due_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [rule.id, c.id, c.due_at]);
        if (!claimed.rowCount) return;
        await applyRule(m, rule, c.id);
        ran++;
      });
    }
  }
  return ran;
}

export const ruleJson = (r: any) => ({
  id: r.id,
  boardId: r.board_id,
  name: r.name,
  trigger: r.trigger,
  actions: r.actions,
  enabled: r.enabled,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  runCount: r.run_count,
  lastRunAt: r.last_run_at,
  lastError: r.last_error,
  lastErrorAt: r.last_error_at,
});
