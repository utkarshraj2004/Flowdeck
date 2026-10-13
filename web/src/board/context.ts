import { createContext, useContext } from 'react';
import type { BoardEvent, BoardState, Card } from './store';

/** Stable for the life of the board page: never changes identity, so consuming it does not re-render on events. */
export interface BoardActions {
  ingest: (e: BoardEvent | undefined) => void;
  reload: () => Promise<void>;
  onEvent: (fn: (e: BoardEvent) => void) => () => void;
  announce: (text: string) => void;
  run: <T>(fn: () => Promise<T>, okText?: string) => Promise<T | undefined>;
  /** Latest board state, read at call time (for event handlers in memoised components). */
  getState: () => BoardState;
  openCard: (cardNumber: number) => void;
  /** Show a change to a card at once (optimistic); the server event that follows replaces it. */
  patchCard: (cardId: string, fn: (c: Card) => Card) => void;
  /** Local-only state the server does not broadcast to others (the user's own watches). */
  setWatching: (kind: 'card' | 'list', id: string, on: boolean) => void;
  toggleLabelNames: () => void;
}

export interface BoardCtx extends BoardActions {
  state: BoardState;
  editing: Record<string, { id: string; name: string }[]>; // key `${cardId}:${field}`
  presence: string[];
}

export const BoardContext = createContext<BoardCtx>(null!);
export const BoardActionsContext = createContext<BoardActions>(null!);
/** Full board state; re-renders on every board change. Use in dialogs and panels, not in per-card components. */
export const useBoard = () => useContext(BoardContext);
export const useBoardActions = () => useContext(BoardActionsContext);
