import { many, one } from '../db.js';
import type { Mutation } from './mutation.js';
import { labelJson } from './serialize.js';

/**
 * Move a card's board-scoped data to another board (research J07.4):
 * new per-board number, labels mapped by name+colour (missing ones created on
 * the target), and card members who are not on the target board dropped.
 */
export async function transferCardToBoard(m: Mutation, cardId: string, fromBoardId: string, toBoardId: string) {
  const tx = m.tx;
  const num = await one(tx, 'UPDATE boards SET next_card_number = next_card_number + 1 WHERE id = $1 RETURNING next_card_number - 1 AS n', [toBoardId]);
  await tx.query('UPDATE cards SET board_id = $2, number = $3 WHERE id = $1', [cardId, toBoardId, num.n]);
  const createdLabels: ReturnType<typeof labelJson>[] = [];
  const labels = await many(tx, 'SELECT l.* FROM card_labels cl JOIN labels l ON l.id = cl.label_id WHERE cl.card_id = $1', [cardId]);
  await tx.query('DELETE FROM card_labels WHERE card_id = $1', [cardId]);
  for (const l of labels) {
    let target = await one(tx, 'SELECT * FROM labels WHERE board_id = $1 AND name = $2 AND color IS NOT DISTINCT FROM $3 LIMIT 1', [toBoardId, l.name, l.color]);
    if (!target) {
      target = await one(tx, 'INSERT INTO labels (board_id, name, color) VALUES ($1,$2,$3) RETURNING *', [toBoardId, l.name, l.color]);
      createdLabels.push(labelJson(target));
    }
    await tx.query('INSERT INTO card_labels (card_id, label_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [cardId, target.id]);
  }
  const dropped = await many(
    tx,
    `DELETE FROM card_members cm WHERE cm.card_id = $1 AND NOT EXISTS (SELECT 1 FROM board_members bm WHERE bm.board_id = $2 AND bm.user_id = cm.user_id) RETURNING user_id`,
    [cardId, toBoardId],
  );
  void fromBoardId;
  return { createdLabels, droppedMemberIds: dropped.map((d) => d.user_id as string) };
}
