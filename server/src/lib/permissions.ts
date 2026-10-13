import type { Queryable } from '../db.js';
import { forbidden, notFound } from './errors.js';

/**
 * Flowdeck's permission policy (research/04-permissions.md, "Flowdeck model").
 * Every REST handler and every WebSocket subscription goes through these
 * functions; the UI only hides affordances.
 */

export type WorkspaceRole = 'admin' | 'member';
export type BoardRole = 'admin' | 'member' | 'observer';
/** Effective role: board role, or `viewer` for a workspace member on a workspace-visible board they have not joined. */
export type EffectiveRole = BoardRole | 'viewer';

export interface BoardRow {
  id: string;
  workspace_id: string;
  short_id: string;
  name: string;
  description: string;
  visibility: 'private' | 'workspace';
  background: string;
  prefs: { comments: 'disabled' | 'members' | 'observers' | 'workspace'; invitations: 'admins' | 'members'; selfJoin: boolean; cardCovers: boolean };
  closed_at: string | null;
  last_seq: number;
  is_template?: boolean;
  created_at: string;
  updated_at: string;
}

export interface BoardAccess {
  board: BoardRow;
  role: EffectiveRole;
  boardRole: BoardRole | null;
  workspaceRole: WorkspaceRole | null;
  can: Capabilities;
}

export interface Capabilities {
  view: boolean;
  edit: boolean;
  admin: boolean;
  comment: boolean;
  invite: boolean;
  join: boolean;
}

export function capabilities(board: Pick<BoardRow, 'prefs' | 'closed_at'>, role: EffectiveRole, boardRole: BoardRole | null): Capabilities {
  const open = !board.closed_at;
  const editor = role === 'admin' || role === 'member';
  const commentLevel = board.prefs.comments;
  const commenters: Record<string, EffectiveRole[]> = {
    disabled: [],
    members: ['admin', 'member'],
    observers: ['admin', 'member', 'observer'],
    workspace: ['admin', 'member', 'observer', 'viewer'],
  };
  return {
    view: true,
    edit: open && editor,
    admin: role === 'admin',
    comment: open && (commenters[commentLevel] ?? commenters.members).includes(role),
    invite: open && (role === 'admin' || (role === 'member' && board.prefs.invitations === 'members')),
    join: open && boardRole === null && board.prefs.selfJoin,
  };
}

export async function workspaceRole(q: Queryable, userId: string, workspaceId: string): Promise<WorkspaceRole | null> {
  const r = await q.query('SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2', [workspaceId, userId]);
  return (r.rows[0]?.role as WorkspaceRole) ?? null;
}

/** Resolve a user's access to a board, or null when they cannot see it (callers answer 404, never 403, to avoid leaking existence). */
export async function boardAccess(q: Queryable, userId: string, boardId: string): Promise<BoardAccess | null> {
  const r = await q.query(
    `SELECT b.*, bm.role AS board_role, wm.role AS ws_role
       FROM boards b
       LEFT JOIN board_members bm ON bm.board_id = b.id AND bm.user_id = $2
       LEFT JOIN workspace_members wm ON wm.workspace_id = b.workspace_id AND wm.user_id = $2
      WHERE b.id = $1`,
    [boardId, userId],
  );
  const row = r.rows[0];
  if (!row) return null;
  const boardRole = (row.board_role as BoardRole) ?? null;
  const wsRole = (row.ws_role as WorkspaceRole) ?? null;
  let role: EffectiveRole | null = null;
  if (wsRole === 'admin') role = 'admin'; // workspace admins administer every board in their workspace
  else if (boardRole) role = boardRole;
  else if (wsRole === 'member' && row.visibility === 'workspace') role = 'viewer';
  if (!role) return null;
  const { board_role: _a, ws_role: _b, ...board } = row;
  return { board: board as BoardRow, role, boardRole, workspaceRole: wsRole, can: capabilities(board as BoardRow, role, boardRole) };
}

export type Need = 'view' | 'edit' | 'admin' | 'comment' | 'invite';

const reasons: Record<Exclude<Need, 'view'>, string> = {
  edit: 'You can view this board but not change it. Ask a board admin to make you a member.',
  admin: 'Only board admins can do this.',
  comment: 'Commenting is not allowed for your role on this board.',
  invite: 'You are not allowed to add people to this board.',
};

export async function requireBoard(q: Queryable, userId: string, boardId: string, need: Need): Promise<BoardAccess> {
  const access = await boardAccess(q, userId, boardId);
  if (!access) throw notFound('Board not found');
  if (need !== 'view' && !access.can[need]) {
    if (access.board.closed_at && need !== 'admin') throw forbidden('This board is closed. Reopen it to make changes.');
    throw forbidden(reasons[need]);
  }
  return access;
}

export async function requireWorkspace(q: Queryable, userId: string, workspaceId: string, need: 'view' | 'admin' | 'invite') {
  const r = await q.query(
    `SELECT w.*, wm.role FROM workspaces w LEFT JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.user_id = $2 WHERE w.id = $1`,
    [workspaceId, userId],
  );
  const row = r.rows[0];
  if (!row || !row.role) throw notFound('Workspace not found');
  const role = row.role as WorkspaceRole;
  if (need === 'admin' && role !== 'admin') throw forbidden('Only workspace admins can do this.');
  if (need === 'invite' && role !== 'admin' && !row.settings?.membersCanInvite)
    throw forbidden('Only workspace admins can invite people to this workspace.');
  return { workspace: row, role };
}
