import type { Queryable } from '../db.js';
import { many, one } from '../db.js';
import { notFound } from './errors.js';
import type { Mutation } from './mutation.js';
import { cardFront } from './serialize.js';
import { isUuid } from './validate.js';

export async function loadCard(q: Queryable, id: string) {
  if (!isUuid(id)) throw notFound('Card not found');
  const c = await one(q, 'SELECT * FROM cards WHERE id = $1', [id]);
  if (!c) throw notFound('Card not found');
  return c;
}

/** Emit a card-scoped event that always carries the fresh card front (keeps badges in sync). */
export async function emitCard(m: Mutation, card: { id: string; board_id: string; list_id: string; name: string }, event: string, summary: Record<string, unknown> = {}, extra: Record<string, unknown> = {}, hidden = false) {
  const front = await cardFront(m.tx, card.id);
  return m.emit(card.board_id, event, {
    cardId: card.id,
    listId: front?.listId ?? card.list_id,
    summary: { cardName: front?.name ?? card.name, cardNumber: front?.number, ...summary },
    data: { cardId: card.id, card: front, ...extra },
    hidden,
  });
}

/** Card members + card watchers (research 06 notification triggers). */
export async function cardAudience(q: Queryable, cardId: string): Promise<string[]> {
  const rows = await many(
    q,
    `SELECT user_id FROM card_members WHERE card_id = $1 UNION SELECT user_id FROM subscriptions WHERE target_type = 'card' AND target_id = $1`,
    [cardId],
  );
  return rows.map((r) => r.user_id);
}
