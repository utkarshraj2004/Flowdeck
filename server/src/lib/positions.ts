import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import type { Tx } from '../db.js';

type Scope = { table: 'lists' | 'cards' | 'checklists' | 'check_items'; column: string; id: string; openOnly: boolean };

/** Placement request from clients: after a sibling id, at the top (afterId null) or at the bottom. */
export type Placement = { afterId: string | null } | 'bottom' | 'top';

export function parsePlacement(raw: unknown): Placement {
  if (raw === 'top' || raw === 'bottom') return raw;
  if (raw && typeof raw === 'object' && 'afterId' in raw) {
    const a = (raw as { afterId: unknown }).afterId;
    if (a === null || typeof a === 'string') return { afterId: a };
  }
  return 'bottom';
}

/**
 * Compute a fractional key for the placement inside the scope. Callers hold
 * the board lock, so neighbours cannot change concurrently. Only the moved row
 * is written, except when keys collide or grow long, where the scope is
 * rebalanced in the same transaction (returned in `rebalanced`).
 */
export async function keyFor(
  tx: Tx,
  scope: Scope,
  placement: Placement,
  excludeId?: string,
): Promise<{ position: string; rebalanced: { id: string; position: string }[] }> {
  const where = scope.openOnly ? 'AND archived_at IS NULL' : '';
  const rows = (
    await tx.query(
      `SELECT id, position FROM ${scope.table} WHERE ${scope.column} = $1 ${where} AND ($2::uuid IS NULL OR id <> $2) ORDER BY position, id`,
      [scope.id, excludeId ?? null],
    )
  ).rows as { id: string; position: string }[];

  let index: number; // insert before rows[index]
  if (placement === 'top') index = 0;
  else if (placement === 'bottom') index = rows.length;
  else if (placement.afterId === null) index = 0;
  else {
    const i = rows.findIndex((r) => r.id === placement.afterId);
    index = i === -1 ? rows.length : i + 1;
  }
  const before = index > 0 ? rows[index - 1].position : null;
  const after = index < rows.length ? rows[index].position : null;
  try {
    if (before !== null && after !== null && before >= after) throw new Error('collision');
    const position = generateKeyBetween(before, after);
    if (position.length <= 48) return { position, rebalanced: [] };
  } catch {
    /* fall through to rebalance */
  }
  const keys = generateNKeysBetween(null, null, rows.length + 1);
  const rebalanced: { id: string; position: string }[] = [];
  let k = 0;
  let position = '';
  for (let i = 0; i <= rows.length; i++) {
    if (i === index) position = keys[k++];
    if (i < rows.length) {
      rebalanced.push({ id: rows[i].id, position: keys[k++] });
    }
  }
  for (const r of rebalanced) await tx.query(`UPDATE ${scope.table} SET position = $2 WHERE id = $1`, [r.id, r.position]);
  return { position, rebalanced };
}

export async function bottomKey(tx: Tx, scope: Scope): Promise<string> {
  return (await keyFor(tx, scope, 'bottom')).position;
}

export { generateKeyBetween, generateNKeysBetween };
