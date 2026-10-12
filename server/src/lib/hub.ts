import crypto from 'node:crypto';
import type { Db } from '../db.js';
import { boardAccess, type EffectiveRole } from './permissions.js';

export interface EventMsg {
  type: 'event';
  board: string;
  seq: number;
  event: string;
  actor: string | null;
  at: string;
  clientMutationId: string | null;
  data: Record<string, unknown>;
}

export interface Client {
  id: string;
  userId: string;
  boards: Map<string, EffectiveRole>;
  send: (msg: unknown) => void;
  close: () => void;
}

const EDITING_TTL_MS = 30_000;

/**
 * In-process pub/sub for a single Flowdeck node. Events are published only
 * after their transaction commits. Access is checked on subscribe and
 * re-checked whenever membership, roles or visibility change.
 */
export class Hub {
  private byBoard = new Map<string, Set<Client>>();
  private byUser = new Map<string, Set<Client>>();
  // board -> "cardId:field" -> userId -> {name, expires}
  private editing = new Map<string, Map<string, Map<string, { name: string; expires: number }>>>();
  private timer: NodeJS.Timeout;

  constructor(private db: Db) {
    this.timer = setInterval(() => this.expireEditing(), 5_000);
    this.timer.unref();
  }

  stop() {
    clearInterval(this.timer);
    for (const set of this.byUser.values()) for (const c of set) c.close();
  }

  newClient(userId: string, send: (msg: unknown) => void, close: () => void): Client {
    const c: Client = { id: crypto.randomUUID(), userId, boards: new Map(), send, close };
    if (!this.byUser.has(userId)) this.byUser.set(userId, new Set());
    this.byUser.get(userId)!.add(c);
    return c;
  }

  removeClient(c: Client) {
    for (const boardId of c.boards.keys()) this.unsubscribe(c, boardId);
    this.byUser.get(c.userId)?.delete(c);
    if (this.byUser.get(c.userId)?.size === 0) this.byUser.delete(c.userId);
  }

  subscribe(c: Client, boardId: string, role: EffectiveRole) {
    c.boards.set(boardId, role);
    if (!this.byBoard.has(boardId)) this.byBoard.set(boardId, new Set());
    this.byBoard.get(boardId)!.add(c);
    this.sendPresence(boardId);
  }

  unsubscribe(c: Client, boardId: string) {
    c.boards.delete(boardId);
    this.byBoard.get(boardId)?.delete(c);
    if (this.byBoard.get(boardId)?.size === 0) this.byBoard.delete(boardId);
    this.clearEditingFor(boardId, c.userId);
    this.sendPresence(boardId);
  }

  publish(evt: EventMsg) {
    for (const c of this.byBoard.get(evt.board) ?? []) c.send(evt);
  }

  sendToUser(userId: string, msg: unknown) {
    for (const c of this.byUser.get(userId) ?? []) c.send(msg);
  }

  sendToBoard(boardId: string, msg: unknown) {
    for (const c of this.byBoard.get(boardId) ?? []) c.send(msg);
  }

  /** Re-evaluate every socket subscribed to the board (after member/role/visibility changes). */
  async recheckBoard(boardId: string) {
    const clients = [...(this.byBoard.get(boardId) ?? [])];
    for (const c of clients) {
      const access = await boardAccess(this.db, c.userId, boardId);
      if (!access) {
        this.unsubscribe(c, boardId);
        c.send({ type: 'board.access_revoked', board: boardId });
        continue;
      }
      const prev = c.boards.get(boardId);
      if (prev !== access.role) {
        c.boards.set(boardId, access.role);
        c.send({ type: 'board.member_role_changed', board: boardId, user: c.userId, role: access.role, can: access.can });
      }
    }
  }

  async recheckUserBoards(userId: string) {
    const boards = new Set<string>();
    for (const c of this.byUser.get(userId) ?? []) for (const b of c.boards.keys()) boards.add(b);
    for (const b of boards) await this.recheckBoard(b);
  }

  /** Re-check every subscribed board of a workspace (workspace role changes affect board access). */
  async recheckBoards(boardIds: string[]) {
    for (const b of boardIds) if (this.byBoard.has(b)) await this.recheckBoard(b);
  }

  presence(boardId: string) {
    const users = new Set<string>();
    for (const c of this.byBoard.get(boardId) ?? []) users.add(c.userId);
    return [...users];
  }

  private sendPresence(boardId: string) {
    this.sendToBoard(boardId, { type: 'presence', board: boardId, users: this.presence(boardId) });
  }

  setEditing(boardId: string, cardId: string, field: string, userId: string, name: string, active: boolean) {
    const key = `${cardId}:${field}`;
    if (!this.editing.has(boardId)) this.editing.set(boardId, new Map());
    const byKey = this.editing.get(boardId)!;
    if (!byKey.has(key)) byKey.set(key, new Map());
    const users = byKey.get(key)!;
    const had = users.has(userId);
    if (active) users.set(userId, { name, expires: Date.now() + EDITING_TTL_MS });
    else users.delete(userId);
    if (had !== active || active) this.broadcastEditing(boardId, cardId, field);
  }

  private broadcastEditing(boardId: string, cardId: string, field: string) {
    const users = this.editing.get(boardId)?.get(`${cardId}:${field}`) ?? new Map();
    this.sendToBoard(boardId, {
      type: 'editing',
      board: boardId,
      cardId,
      field,
      users: [...users.entries()].map(([id, v]) => ({ id, name: v.name })),
    });
  }

  private clearEditingFor(boardId: string, userId: string) {
    const byKey = this.editing.get(boardId);
    if (!byKey) return;
    for (const [key, users] of byKey) {
      if (users.delete(userId)) {
        const [cardId, field] = key.split(':');
        this.broadcastEditing(boardId, cardId, field);
      }
    }
  }

  private expireEditing() {
    const now = Date.now();
    for (const [boardId, byKey] of this.editing) {
      for (const [key, users] of byKey) {
        let changed = false;
        for (const [uid, v] of users) if (v.expires < now) (users.delete(uid), (changed = true));
        if (changed) {
          const [cardId, field] = key.split(':');
          this.broadcastEditing(boardId, cardId, field);
        }
        if (users.size === 0) byKey.delete(key);
      }
      if (byKey.size === 0) this.editing.delete(boardId);
    }
  }
}
