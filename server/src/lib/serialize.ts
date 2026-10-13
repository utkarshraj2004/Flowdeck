import type { Queryable } from '../db.js';
import type { BoardRow } from './permissions.js';

export const userJson = (u: any) =>
  u && {
    id: u.id,
    username: u.username,
    fullName: u.full_name,
    initials: u.initials,
  };

export const boardJson = (b: BoardRow & { starred?: boolean }) => ({
  id: b.id,
  shortId: b.short_id,
  workspaceId: b.workspace_id,
  name: b.name,
  description: b.description,
  visibility: b.visibility,
  background: b.background,
  prefs: b.prefs,
  closedAt: b.closed_at,
  isTemplate: !!b.is_template,
  seq: Number(b.last_seq),
  ...(b.starred !== undefined ? { starred: b.starred } : {}),
});

export const listJson = (l: any) => ({
  id: l.id,
  boardId: l.board_id,
  name: l.name,
  position: l.position,
  archivedAt: l.archived_at,
  version: l.version,
});

export const labelJson = (l: any) => ({ id: l.id, boardId: l.board_id, name: l.name, color: l.color });

const CARD_FRONT_SQL = `
  SELECT c.id, c.board_id, c.list_id, c.number, c.name, c.position, c.start_at, c.due_at, c.due_complete,
         c.cover, c.archived_at, c.version, c.updated_at, c.is_template,
         (c.description <> '') AS has_description,
         COALESCE((SELECT array_agg(label_id ORDER BY label_id) FROM card_labels WHERE card_id = c.id), '{}') AS label_ids,
         COALESCE((SELECT array_agg(user_id ORDER BY user_id) FROM card_members WHERE card_id = c.id), '{}') AS member_ids,
         (SELECT count(*) FROM comments WHERE card_id = c.id)::int AS comment_count,
         (SELECT count(*) FROM attachments WHERE card_id = c.id)::int AS attachment_count,
         (SELECT count(*) FROM check_items ci JOIN checklists cl ON cl.id = ci.checklist_id WHERE cl.card_id = c.id)::int AS check_total,
         (SELECT count(*) FROM check_items ci JOIN checklists cl ON cl.id = ci.checklist_id WHERE cl.card_id = c.id AND ci.checked_at IS NOT NULL)::int AS check_done
    FROM cards c`;

export const cardFrontJson = (c: any) => ({
  id: c.id,
  boardId: c.board_id,
  listId: c.list_id,
  number: c.number,
  name: c.name,
  position: c.position,
  startAt: c.start_at,
  dueAt: c.due_at,
  dueComplete: c.due_complete,
  cover: c.cover,
  archivedAt: c.archived_at,
  version: c.version,
  isTemplate: !!c.is_template,
  labelIds: c.label_ids,
  memberIds: c.member_ids,
  badges: {
    description: c.has_description,
    comments: c.comment_count,
    attachments: c.attachment_count,
    checkItems: c.check_total,
    checkItemsChecked: c.check_done,
  },
});

export async function cardFront(q: Queryable, cardId: string) {
  const r = await q.query(`${CARD_FRONT_SQL} WHERE c.id = $1`, [cardId]);
  return r.rows[0] ? cardFrontJson(r.rows[0]) : null;
}

export async function cardFronts(q: Queryable, where: string, params: unknown[]) {
  const r = await q.query(`${CARD_FRONT_SQL} WHERE ${where} ORDER BY c.position, c.id`, params);
  return r.rows.map(cardFrontJson);
}

export async function boardMembers(q: Queryable, boardId: string) {
  const r = await q.query(
    `SELECT u.id, u.username, u.full_name, u.initials, bm.role,
            (wm.user_id IS NULL) AS is_guest
       FROM board_members bm JOIN users u ON u.id = bm.user_id
       JOIN boards b ON b.id = bm.board_id
       LEFT JOIN workspace_members wm ON wm.workspace_id = b.workspace_id AND wm.user_id = u.id
      WHERE bm.board_id = $1 ORDER BY u.full_name`,
    [boardId],
  );
  return r.rows.map((u) => ({ ...userJson(u), role: u.role, isGuest: u.is_guest }));
}
