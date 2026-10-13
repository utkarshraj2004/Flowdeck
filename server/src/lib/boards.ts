import type { Queryable } from '../db.js';
import { many } from '../db.js';
import { REPLAY_LIMIT } from './constants.js';

export async function eventsSince(q: Queryable, boardId: string, sinceSeq: number, lastSeq: number) {
  if (lastSeq - sinceSeq > REPLAY_LIMIT || sinceSeq < 0) return { resync: true as const, events: [] };
  const rows = await many(
    q,
    `SELECT seq, type, actor_id, created_at, client_mutation_id, payload FROM activity WHERE board_id = $1 AND seq > $2 ORDER BY seq`,
    [boardId, sinceSeq],
  );
  // seq must be contiguous from sinceSeq + 1; if old activity was pruned, ask for a resync.
  if (rows.length && rows[0].seq !== sinceSeq + 1) return { resync: true as const, events: [] };
  return {
    resync: false as const,
    events: rows.map((r) => ({
      type: 'event' as const,
      board: boardId,
      seq: r.seq,
      event: r.type,
      actor: r.actor_id,
      at: r.created_at,
      clientMutationId: r.client_mutation_id,
      data: r.payload,
    })),
  };
}
