import { createContext, useContext } from 'react';
import type { BoardEvent, BoardState } from './store';

export interface BoardCtx {
  state: BoardState;
  ingest: (e: BoardEvent | undefined) => void;
  reload: () => Promise<void>;
  onEvent: (fn: (e: BoardEvent) => void) => () => void;
  editing: Record<string, { id: string; name: string }[]>; // key `${cardId}:${field}`
  presence: string[];
  announce: (text: string) => void;
  run: <T>(fn: () => Promise<T>, okText?: string) => Promise<T | undefined>;
}

export const BoardContext = createContext<BoardCtx>(null!);
export const useBoard = () => useContext(BoardContext);
