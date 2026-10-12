import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AutoScrollActivator,
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type CollisionDetection,
} from '@dnd-kit/core';
import { arrayMove, horizontalListSortingStrategy, SortableContext } from '@dnd-kit/sortable';
import { generateKeyBetween } from 'fractional-indexing';
import { ApiError, del, get, patch, post, put } from '../api';
import { useAuth } from '../auth';
import { realtime } from '../realtime';
import { useConnStatus } from '../components/Shell';
import { useToasts } from '../components/Toasts';
import { Avatar, Spinner, dueState } from '../components/ui';
import { Building2, Ellipsis, Eye, ListFilter, Lock, Star, UserPlus, X } from '../components/icons';
import { isTypingTarget } from '../components/Shortcuts';
import { NotFoundPage } from '../pages/NotFound';
import { BoardActionsContext, BoardContext, useBoard as useContextSafe, type BoardActions, type BoardCtx } from './context';
import { byPos, cardsInList, fromSnapshot, reduceEvent, type BoardEvent, type BoardState, type Card, type List } from './store';
import { AddList, ListColumn } from './ListColumn';
import { CardTile, QuickEdit } from './CardTile';
import { FilterPanel, filterFromParams, matchesFilter, type Filter } from './Filter';
import { DatesPicker, LabelsPicker, MembersPicker, MoveCardPicker } from './pickers';
import { loadCardModal } from './lazy';

const CardModal = lazy(() => loadCardModal().then((m) => ({ default: m.CardModal })));
const BoardMenu = lazy(() => import('./BoardMenu').then((m) => ({ default: m.BoardMenu })));
const MembersDialog = lazy(() => import('./MembersDialog').then((m) => ({ default: m.MembersDialog })));

type Cols = Record<string, string[]>;
const EMPTY: Card[] = [];
export type CardPopKind = 'quick' | 'labels' | 'members' | 'dates' | 'move';
export type CardPop = { kind: CardPopKind; cardId: string; anchor: HTMLElement };

/** Board-wide data every card tile needs; changes only when labels, members, edit rights or display settings change. */
export interface CardView {
  shortId: string;
  labels: BoardState['labels'];
  membersById: Record<string, BoardState['members'][number]>;
  canEdit: boolean;
  covers: boolean;
  labelNames: boolean;
  watched: Set<string>;
}
function useCardView(state: BoardState | null, labelNames: boolean): CardView | null {
  const labels = state?.labels;
  const members = state?.members;
  const shortId = state?.board.shortId;
  const canEdit = !!state?.access.can.edit;
  const covers = state?.board.prefs.cardCovers !== false;
  const watchedIds = state?.watchedCardIds;
  return useMemo(
    () =>
      labels && members && shortId
        ? { shortId, labels, membersById: Object.fromEntries(members.map((m) => [m.id, m])), canEdit, covers, labelNames, watched: new Set(watchedIds) }
        : null,
    [labels, members, shortId, canEdit, covers, labelNames, watchedIds],
  );
}

// Per-browser conveniences (never required for correctness): collapsed lists and recently viewed boards.
const storage = {
  get<T>(key: string, fallback: T): T {
    try {
      const v = localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: the setting just isn't remembered */
    }
  },
};

export function BoardPage() {
  const { shortId, cardNumber } = useParams();
  const nav = useNavigate();
  const { me, setMe } = useAuth();
  const { push } = useToasts();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<BoardState | null>(null);
  const [error, setError] = useState<'not_found' | 'revoked' | 'deleted' | null>(null);
  const [editing, setEditing] = useState<Record<string, { id: string; name: string }[]>>({});
  const [presence, setPresence] = useState<string[]>([]);
  const [showFilter, setShowFilter] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [cardPop, setCardPop] = useState<CardPop | null>(null);
  const [labelNames, setLabelNames] = useState(!!me?.prefs.labelNames);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const seqRef = useRef(0);
  const pending = useRef(new Map<number, BoardEvent>());
  const gapTimer = useRef<number | undefined>(undefined);
  const listeners = useRef(new Set<(e: BoardEvent) => void>());
  const boardIdRef = useRef<string>('');
  const hovered = useRef<string | null>(null);
  const lastArchived = useRef<null | { kind: 'card' | 'list'; id: string; name: string }>(null);
  const status = useConnStatus();

  const load = useCallback(async () => {
    try {
      const snap = await get(`/boards/${shortId}`);
      seqRef.current = snap.seq;
      pending.current.clear();
      boardIdRef.current = snap.board.id;
      setState(fromSnapshot(snap));
      setError(null);
      document.title = `${snap.board.name} · Flowdeck`;
      setCollapsed(storage.get<string[]>(`fd:collapsed:${snap.board.id}`, []));
      const recent = storage.get<{ shortId: string }[]>('fd:recentBoards', []).filter((b) => b && b.shortId !== snap.board.shortId);
      storage.set('fd:recentBoards', [{ shortId: snap.board.shortId, name: snap.board.name, background: snap.board.background, at: Date.now() }, ...recent].slice(0, 8));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setError('not_found');
      else push({ kind: 'error', text: (e as Error).message });
    }
  }, [shortId, push]);

  /** Apply events strictly in seq order; buffer out-of-order ones and ask for a replay if a gap persists. */
  const ingest = useCallback((e: BoardEvent | undefined) => {
    if (!e || e.type !== 'event' || e.seq <= seqRef.current) return;
    pending.current.set(e.seq, e);
    const applied: BoardEvent[] = [];
    while (pending.current.has(seqRef.current + 1)) {
      const ev = pending.current.get(seqRef.current + 1)!;
      pending.current.delete(ev.seq);
      seqRef.current = ev.seq;
      applied.push(ev);
    }
    if (applied.length) {
      setState((s) => (s ? applied.reduce(reduceEvent, s) : s));
      for (const ev of applied) for (const l of listeners.current) l(ev);
    }
    if (pending.current.size) {
      window.clearTimeout(gapTimer.current);
      gapTimer.current = window.setTimeout(() => {
        if (pending.current.size && boardIdRef.current) realtime.resubscribe(boardIdRef.current);
      }, 1500);
    }
  }, []);

  useEffect(() => {
    setState(null);
    load();
  }, [load]);
  // The card dialog is a separate chunk: fetch it while the user looks at the board.
  useEffect(() => {
    const t = window.setTimeout(() => void loadCardModal(), 300);
    return () => window.clearTimeout(t);
  }, []);

  const boardId = state?.board.id;
  useEffect(() => {
    if (!boardId) return;
    const off = realtime.subscribeBoard(
      boardId,
      () => seqRef.current,
      (m) => {
        if (m.type === 'event') ingest(m);
        else if (m.type === 'resync_required') load();
        else if (m.type === 'board.access_revoked') setError('revoked');
        else if (m.type === 'board.deleted') setError('deleted');
        else if (m.type === 'board.member_role_changed') setState((s) => (s ? { ...s, access: { ...s.access, role: m.role, can: m.can } } : s));
        else if (m.type === 'presence') setPresence(m.users);
        else if (m.type === 'subscribed') setPresence(m.users ?? []);
        else if (m.type === 'editing') setEditing((ed) => ({ ...ed, [`${m.cardId}:${m.field}`]: m.users }));
      },
    );
    return () => {
      off();
    };
  }, [boardId, ingest, load]);

  // Polling fallback when the socket stays down (research 06): catch up via the events feed.
  useEffect(() => {
    if (!boardId || status === 'online') return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await get(`/boards/${boardId}/events?sinceSeq=${seqRef.current}`);
        if (r.resync) await load();
        else r.events.forEach(ingest);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) setError('revoked');
      }
    };
    const start = window.setTimeout(function loop() {
      if (stop) return;
      tick().finally(() => !stop && (timer = window.setTimeout(loop, document.hidden ? 60_000 : 5_000)));
    }, 10_000);
    let timer = start;
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [boardId, status, ingest, load]);

  const announce = useCallback((t: string) => {
    setAnnouncement('');
    window.setTimeout(() => setAnnouncement(t), 30);
  }, []);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, okText?: string) => {
      try {
        const r: any = await fn();
        if (r?.events) r.events.forEach(ingest);
        else if (r?.event) ingest(r.event);
        if (okText) push({ kind: 'success', text: okText });
        return r as T;
      } catch (e) {
        push({ kind: 'error', text: (e as Error).message });
        if (e instanceof ApiError && (e.status === 409 || e.status === 403)) load();
        return undefined;
      }
    },
    [ingest, push, load],
  );

  const stateRef = useRef(state);
  stateRef.current = state;
  const navRef = useRef(nav);
  navRef.current = nav;
  const actions: BoardActions = useMemo(
    () => ({
      ingest,
      reload: load,
      onEvent: (fn) => {
        listeners.current.add(fn);
        return () => listeners.current.delete(fn);
      },
      announce,
      run,
      getState: () => stateRef.current!,
      openCard: (n: number) => stateRef.current && navRef.current(`/b/${stateRef.current.board.shortId}/c/${n}${location.search}`),
      patchCard: (cardId, fn) => setState((s) => (s && s.cards[cardId] ? { ...s, cards: { ...s.cards, [cardId]: fn(s.cards[cardId]) } } : s)),
      setWatching: (kind, id, on) =>
        setState((s) => {
          if (!s) return s;
          const key = kind === 'card' ? 'watchedCardIds' : 'watchedListIds';
          const ids = s[key].filter((x) => x !== id);
          return { ...s, [key]: on ? [...ids, id] : ids };
        }),
      toggleLabelNames: () =>
        setLabelNames((v) => {
          const next = !v;
          patch('/me', { prefs: { labelNames: next } })
            .then((r) => setMe(r.user))
            .catch(() => undefined); // still toggled for this session
          return next;
        }),
    }),
    [ingest, load, announce, run, setMe],
  );
  const ctx: BoardCtx | null = useMemo(() => state && { ...actions, state, editing, presence }, [actions, state, editing, presence]);

  // ---- filter ----
  // Filter state is local (synchronous, so controls never flicker) and mirrored into the URL so it can be shared.
  const [filter, setFilterState] = useState<Filter>(() => filterFromParams(params));
  const filterActive = !!(filter.q || filter.members.length || filter.labels.length || filter.due || filter.status);
  const setFilter = (f: Partial<Filter>) => {
    const next = { ...filter, ...f };
    setFilterState(next);
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries({ q: next.q, members: next.members.join(','), labels: next.labels.join(','), due: next.due, status: next.status, mode: next.mode === 'all' ? 'all' : '' }))
      v ? p.set(k, v) : p.delete(k);
    setParams(p, { replace: true });
  };

  // ---- columns (visible cards per list), drag state and keyboard moves ----
  const listsMap = state?.lists;
  const lists: List[] = useMemo(() => (listsMap ? Object.values(listsMap).filter((l) => !l.archivedAt).sort(byPos) : []), [listsMap]);
  // Typing in the filter stays responsive: the board re-filters at a lower priority.
  const deferredFilter = useDeferredValue(filter);
  const cardsMap = state?.cards;
  const { baseCols, totals } = useMemo(() => {
    const byList: Record<string, Card[]> = {};
    const totals: Record<string, number> = {};
    for (const c of Object.values(cardsMap ?? {})) {
      if (c.archivedAt) continue;
      totals[c.listId] = (totals[c.listId] ?? 0) + 1;
      if (matchesFilter(c, deferredFilter, me!.id)) (byList[c.listId] ??= []).push(c);
    }
    const baseCols: Cols = {};
    for (const l of lists) baseCols[l.id] = (byList[l.id] ?? []).sort(byPos).map((c) => c.id);
    return { baseCols, totals };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardsMap, lists, deferredFilter]);
  const [dragCols, setDragCols] = useState<Cols | null>(null);
  const [activeDrag, setActiveDrag] = useState<string | null>(null);
  const [kbMove, setKbMove] = useState<{ cardId: string } | null>(null);
  const cols = dragCols ?? baseCols;
  // Per-list card arrays keep their identity while unchanged, so memoised lists and cards skip re-rendering.
  const colCache = useRef<Record<string, Card[]>>({});
  const colCards = useMemo(() => {
    const out: Record<string, Card[]> = {};
    for (const [listId, ids] of Object.entries(cols)) {
      const next: Card[] = [];
      for (const id of ids) if (cardsMap?.[id]) next.push(cardsMap[id]);
      const prev = colCache.current[listId];
      out[listId] = prev && prev.length === next.length && prev.every((c, i) => c === next[i]) ? prev : next;
    }
    colCache.current = out;
    return out;
  }, [cols, cardsMap]);
  const view = useCardView(state, labelNames);
  const hasTemplates = useMemo(() => Object.values(cardsMap ?? {}).some((c) => c.isTemplate && !c.archivedAt), [cardsMap]);
  const findList = (c: Cols, cardId: string) => Object.keys(c).find((l) => c[l].includes(cardId));

  const commitCardMove = useCallback(
    async (cardId: string, listId: string, ordered: string[]) => {
      if (!state) return;
      const card = state.cards[cardId];
      const idx = ordered.indexOf(cardId);
      const afterId = idx > 0 ? ordered[idx - 1] : null;
      const prev = afterId ? state.cards[afterId]?.position ?? null : null;
      const nextPos = idx + 1 < ordered.length ? state.cards[ordered[idx + 1]]?.position ?? null : null;
      const current = cardsInList(state, card.listId).map((c) => c.id);
      const curIdx = current.indexOf(cardId);
      if (card.listId === listId && (curIdx > 0 ? current[curIdx - 1] : null) === afterId) return; // no change
      let position = card.position;
      try {
        position = generateKeyBetween(prev, nextPos);
      } catch {
        /* server decides */
      }
      setState((s) => (s ? { ...s, cards: { ...s.cards, [cardId]: { ...s.cards[cardId], listId, position } } } : s));
      try {
        const r = await post(`/cards/${cardId}/move`, { listId, position: { afterId } });
        ingest(r.event);
      } catch (e) {
        push({ kind: 'error', text: `Couldn’t move the card: ${(e as Error).message}` });
        load();
      }
    },
    [state, ingest, push, load],
  );

  const commitListMove = useCallback(
    async (listId: string, ordered: string[]) => {
      if (!state) return;
      const idx = ordered.indexOf(listId);
      const afterId = idx > 0 ? ordered[idx - 1] : null;
      let position = state.lists[listId].position;
      try {
        position = generateKeyBetween(afterId ? state.lists[afterId].position : null, idx + 1 < ordered.length ? state.lists[ordered[idx + 1]].position : null);
      } catch {
        /* server decides */
      }
      setState((s) => (s ? { ...s, lists: { ...s.lists, [listId]: { ...s.lists[listId], position } } } : s));
      try {
        const r = await post(`/lists/${listId}/move`, { position: { afterId } });
        ingest(r.event);
      } catch (e) {
        push({ kind: 'error', text: `Couldn’t move the list: ${(e as Error).message}` });
        load();
      }
    },
    [state, ingest, push, load],
  );

  // Lists only collide with lists; cards collide with cards and list bodies.
  const collisions: CollisionDetection = (args) => {
    const isList = String(args.active.id).startsWith('list:');
    const droppableContainers = args.droppableContainers.filter((c) => String(c.id).startsWith('list:') === isList || (!isList && String(c.id).startsWith('listbody:')));
    return isList ? closestCenter({ ...args, droppableContainers }) : closestCorners({ ...args, droppableContainers });
  };

  const sensors = useSensors(useSensor(MouseSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }));

  const onDragStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setActiveDrag(id);
    setCardPop(null);
    if (id.startsWith('card:')) setDragCols({ ...baseCols });
  };
  const onDragOver = (e: DragOverEvent) => {
    const id = String(e.active.id);
    if (!id.startsWith('card:') || !e.over) return;
    const cardId = id.slice(5);
    const overId = String(e.over.id);
    setDragCols((c) => {
      if (!c) return c;
      const from = findList(c, cardId);
      const to = overId.startsWith('card:') ? findList(c, overId.slice(5)) : overId.startsWith('listbody:') ? overId.slice(9) : overId.startsWith('list:') ? overId.slice(5) : undefined;
      if (!from || !to || from === to) return c;
      const target = [...c[to]];
      let idx = overId.startsWith('card:') ? target.indexOf(overId.slice(5)) : target.length;
      if (idx < 0) idx = target.length;
      target.splice(idx, 0, cardId);
      return { ...c, [from]: c[from].filter((x) => x !== cardId), [to]: target };
    });
  };
  const onDragEnd = (e: DragEndEvent) => {
    const id = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    setActiveDrag(null);
    if (id.startsWith('list:')) {
      if (overId?.startsWith('list:') && overId !== id) {
        const ids = lists.map((l) => l.id);
        const ordered = arrayMove(ids, ids.indexOf(id.slice(5)), ids.indexOf(overId.slice(5)));
        commitListMove(id.slice(5), ordered);
      }
      return;
    }
    const c = dragCols;
    setDragCols(null);
    if (!c || !overId) return;
    const cardId = id.slice(5);
    const listId = findList(c, cardId)!;
    let ordered = c[listId];
    if (overId.startsWith('card:') && overId !== id && ordered.includes(overId.slice(5))) ordered = arrayMove(ordered, ordered.indexOf(cardId), ordered.indexOf(overId.slice(5)));
    commitCardMove(cardId, listId, ordered);
  };

  // ---- card shortcuts (focused card, or the card under the pointer) ----
  const tileOf = (cardId: string) => document.querySelector<HTMLElement>(`[data-card-id="${cardId}"]`);
  const focusCard = (cardId: string) => window.requestAnimationFrame(() => tileOf(cardId)?.focus());
  const listName = (id: string) => state?.lists[id]?.name ?? '';
  const archiveCard = (card: Card) => {
    run(() => post(`/cards/${card.id}/archive`)).then((r) => {
      if (!r) return;
      lastArchived.current = { kind: 'card', id: card.id, name: card.name };
      push({
        kind: 'info',
        text: `Archived “${card.name}”. Press z to undo.`,
        action: { label: 'Undo', run: () => run(() => post(`/cards/${card.id}/restore`)) },
      });
    });
  };
  const toggleWatch = (card: Card) => {
    const on = !state!.watchedCardIds.includes(card.id);
    actions.setWatching('card', card.id, on);
    run(() => (on ? put : del)(`/cards/${card.id}/watch`), on ? `Watching “${card.name}”` : `Stopped watching “${card.name}”`).then((r) => {
      if (!r) actions.setWatching('card', card.id, !on);
    });
  };
  /** Shortcuts that act on one card, shared by the focused-card handler and the hovered-card handler. Returns true if handled. */
  const cardShortcut = (key: string, card: Card): boolean => {
    if (!state) return false;
    const can = state.access.can;
    const el = tileOf(card.id);
    const pop = (kind: CardPopKind) => {
      if (!can.edit) {
        announce('You can’t change cards on this board.');
        return true;
      }
      if (el) setCardPop({ kind, cardId: card.id, anchor: el });
      return true;
    };
    switch (key) {
      case 'e':
        return pop('quick');
      case 'l':
        return pop('labels');
      case 'm':
        return pop('members');
      case 'd':
        return pop('dates');
      case 't':
        nav(`/b/${state.board.shortId}/c/${card.number}${location.search}`, { state: { edit: 'title' } });
        return true;
      case '-':
        nav(`/b/${state.board.shortId}/c/${card.number}${location.search}`, { state: { open: 'checklist' } });
        return true;
      case 's':
        toggleWatch(card);
        return true;
      case 'c':
        if (!can.edit) return false;
        archiveCard(card);
        return true;
    }
    return false;
  };

  // Keyboard alternative to dragging (WCAG 2.5.7): Space picks up, arrows move, Enter/Space drops, Esc cancels.
  const onCardKey = (e: React.KeyboardEvent, card: Card) => {
    if (!state || (me?.prefs.shortcuts === false && !['Enter', ' ', 'Escape'].includes(e.key))) return;
    const can = state.access.can;
    const listIds = lists.map((l) => l.id);
    if (kbMove) {
      if (kbMove.cardId !== card.id) return;
      e.preventDefault();
      e.stopPropagation();
      const c = dragCols!;
      const from = findList(c, card.id)!;
      const idx = c[from].indexOf(card.id);
      let to = from;
      let toIdx = idx;
      if (e.key === 'ArrowUp' || e.key === 'k') toIdx = Math.max(0, idx - 1);
      else if (e.key === 'ArrowDown' || e.key === 'j') toIdx = Math.min(c[from].length - 1, idx + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const li = listIds.indexOf(from) + (e.key === 'ArrowLeft' ? -1 : 1);
        if (li < 0 || li >= listIds.length) return;
        to = listIds[li];
        toIdx = Math.min(idx, c[to].length);
      } else if (e.key === 'Enter' || e.key === ' ') {
        setKbMove(null);
        setDragCols(null);
        commitCardMove(card.id, from, c[from]);
        announce(`Dropped “${card.name}” in ${listName(from)}, position ${idx + 1} of ${c[from].length}.`);
        focusCard(card.id);
        return;
      } else if (e.key === 'Escape') {
        setKbMove(null);
        setDragCols(null);
        announce('Move cancelled.');
        focusCard(card.id);
        return;
      } else return;
      const next = { ...c, [from]: c[from].filter((x) => x !== card.id) };
      const target = [...next[to]];
      target.splice(toIdx, 0, card.id);
      next[to] = target;
      setDragCols(next);
      announce(`${listName(to)}, position ${toIdx + 1} of ${target.length}.`);
      focusCard(card.id);
      return;
    }
    if (isTypingTarget(e.target) && e.target !== e.currentTarget) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const from = card.listId;
    const ids = cols[from] ?? [];
    const idx = ids.indexOf(card.id);
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        nav(`/b/${state.board.shortId}/c/${card.number}${location.search}`);
        return;
      case ' ':
        e.preventDefault();
        if (!can.edit) return announce('You can’t move cards on this board.');
        setDragCols({ ...baseCols });
        setKbMove({ cardId: card.id });
        announce(`Picked up “${card.name}”. Use the arrow keys to move it, Enter to drop, Escape to cancel.`);
        return;
      case 'ArrowDown':
      case 'j':
        e.preventDefault();
        if (idx + 1 < ids.length) focusCard(ids[idx + 1]);
        return;
      case 'ArrowUp':
      case 'k':
        e.preventDefault();
        if (idx > 0) focusCard(ids[idx - 1]);
        return;
      case 'ArrowLeft':
      case 'ArrowRight': {
        e.preventDefault();
        let li = listIds.indexOf(from);
        do li += e.key === 'ArrowLeft' ? -1 : 1;
        while (li >= 0 && li < listIds.length && !cols[listIds[li]]?.length);
        if (li >= 0 && li < listIds.length) focusCard(cols[listIds[li]][Math.min(Math.max(idx, 0), cols[listIds[li]].length - 1)]);
        return;
      }
      case ',':
      case '.':
      case '<':
      case '>': {
        e.preventDefault();
        if (!can.edit) return;
        const li = listIds.indexOf(from) + (e.key === ',' || e.key === '<' ? -1 : 1);
        if (li < 0 || li >= listIds.length) return;
        const to = listIds[li];
        const top = e.key === '<' || e.key === '>';
        commitCardMove(card.id, to, top ? [card.id, ...(cols[to] ?? [])] : [...(cols[to] ?? []), card.id]);
        announce(`Moved “${card.name}” to the ${top ? 'top' : 'bottom'} of ${listName(to)}.`);
        focusCard(card.id);
        return;
      }
      case 'c':
        e.preventDefault();
        if (cardShortcut('c', card)) {
          if (idx + 1 < ids.length) focusCard(ids[idx + 1]);
          else if (idx > 0) focusCard(ids[idx - 1]);
        }
        return;
    }
    if (cardShortcut(e.key, card)) {
      e.preventDefault();
      e.stopPropagation();
    }
  };
  const cardKeyRef = useRef(onCardKey);
  cardKeyRef.current = onCardKey;
  const stableCardKey = useCallback((e: React.KeyboardEvent, c: Card) => cardKeyRef.current(e, c), []);
  const onHover = useCallback((cardId: string | null) => {
    hovered.current = cardId;
  }, []);

  const toggleCollapsed = useCallback((listId: string) => {
    setCollapsed((c) => {
      const next = c.includes(listId) ? c.filter((x) => x !== listId) : [...c, listId];
      storage.set(`fd:collapsed:${boardIdRef.current}`, next);
      return next;
    });
  }, []);
  const onListArchived = useCallback((l: List) => {
    lastArchived.current = { kind: 'list', id: l.id, name: l.name };
  }, []);

  // Board-level shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal, .popover') || me?.prefs.shortcuts === false) return;
      if ((e.target as HTMLElement | null)?.closest?.('[data-card-id]')) return; // the focused card handles its own keys
      if (e.key === 'f') {
        e.preventDefault();
        setShowFilter(true);
      } else if (e.key === 'x') {
        e.preventDefault();
        setFilter({ q: '', members: [], labels: [], due: '', status: '' });
      } else if (e.key === 'q') {
        e.preventDefault();
        setFilter({ members: filter.members.includes(me!.id) ? [] : [me!.id] });
      } else if (e.key === ';') {
        e.preventDefault();
        actions.toggleLabelNames();
      } else if (e.key === 'z' && lastArchived.current) {
        e.preventDefault();
        const last = lastArchived.current;
        lastArchived.current = null;
        run(() => post(`/${last.kind === 'card' ? 'cards' : 'lists'}/${last.id}/restore`), `Restored “${last.name}”`);
      } else if (e.key === 'n') {
        const list = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-list-id]') ?? document.querySelector<HTMLElement>('[data-list-id]');
        if (list) {
          e.preventDefault();
          list.querySelector<HTMLButtonElement>('.add-card-btn')?.click();
        }
      } else if (hovered.current && state?.cards[hovered.current]) {
        if (cardShortcut(e.key, state.cards[hovered.current])) e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (error === 'not_found') return <NotFoundPage message="This board doesn’t exist, or you don’t have access to it." />;
  if (error === 'revoked' || error === 'deleted')
    return (
      <NotFoundPage
        message={error === 'deleted' ? 'This board was deleted.' : 'You no longer have access to this board. Ask a board admin if you think this is a mistake.'}
      />
    );
  if (!state || !ctx || !view) return <BoardSkeleton />;

  const { board, access } = state;
  const visibleCount = (listId: string) => cols[listId]?.length ?? 0;
  const totalCount = (listId: string) => totals[listId] ?? 0;
  const activeCard = activeDrag?.startsWith('card:') ? state.cards[activeDrag.slice(5)] : null;
  const online = presence.filter((id) => id !== me!.id);
  const shownTotal = Object.values(baseCols).reduce((a, c) => a + c.length, 0);
  const popCard = cardPop ? state.cards[cardPop.cardId] : null;
  const closePop = () => setCardPop(null);

  return (
    <BoardActionsContext.Provider value={actions}>
      <BoardContext.Provider value={ctx}>
        <div className={`board bg-${board.background}`}>
          <div className="board-header">
            <BoardTitle />
            <button
              className="icon-btn on-dark"
              aria-pressed={!!board.starred}
              aria-label={board.starred ? 'Unstar board' : 'Star board'}
              title={board.starred ? 'Unstar board' : 'Star board'}
              onClick={async () => {
                const starred = !board.starred;
                setState((s) => (s ? { ...s, board: { ...s.board, starred } } : s));
                await (starred ? put : del)(`/boards/${board.id}/star`).catch((e) => {
                  setState((s) => (s ? { ...s, board: { ...s.board, starred: !starred } } : s));
                  push({ kind: 'error', text: (e as Error).message });
                });
              }}
            >
              <Star size={18} fill={board.starred ? 'currentColor' : 'none'} />
            </button>
            <span className="pill on-dark" title={board.visibility === 'private' ? 'Only board members can see this board' : `Everyone in ${state.workspace.name} can see this board`}>
              {board.visibility === 'private' ? <Lock size={14} /> : <Building2 size={14} />}
              <span className="hide-sm">{board.visibility === 'private' ? 'Private' : state.workspace.name}</span>
            </span>
            {board.isTemplate && <span className="pill on-dark">Template</span>}
            {board.watching && (
              <span className="pill on-dark hide-sm" title="You are watching this board">
                <Eye size={14} />
                <span className="visually-hidden">Watching</span>
              </span>
            )}
            <span className="pill on-dark hide-sm" title="Your role on this board">
              {access.role === 'viewer' ? 'Viewing' : access.role}
            </span>
            <div className="grow" />
            <div className="member-stack" aria-label="Board members">
              {state.members.slice(0, 5).map((m) => (
                <span key={m.id} className={`member-dot ${online.includes(m.id) ? 'online' : ''}`}>
                  <Avatar user={m} size={28} title={`${m.fullName}${online.includes(m.id) ? ' (viewing now)' : ''}`} />
                </span>
              ))}
              {state.members.length > 5 && <span className="pill on-dark">+{state.members.length - 5}</span>}
            </div>
            {access.can.join && !access.boardRole && (
              <button className="btn btn-primary btn-small" onClick={() => run(() => post(`/boards/${board.id}/join`), 'You joined this board').then(() => load())}>
                Join board
              </button>
            )}
            <button
              className={`btn btn-small header-btn ${filterActive ? 'active' : ''}`}
              onClick={() => setShowFilter((v) => !v)}
              aria-expanded={showFilter}
              aria-keyshortcuts="f"
              aria-label={filterActive ? `Filter, ${shownTotal} cards shown` : 'Filter'}
            >
              <ListFilter size={16} />
              <span className="hide-sm">{filterActive ? `${shownTotal} shown` : 'Filter'}</span>
            </button>
            {filterActive && (
              <button className="btn btn-small header-btn" onClick={() => setFilter({ q: '', members: [], labels: [], due: '', status: '' })} aria-keyshortcuts="x" aria-label="Clear filters">
                <X size={16} />
                <span className="hide-sm">Clear</span>
              </button>
            )}
            <button className="btn btn-small btn-light share-btn" onClick={() => setShowMembers(true)} aria-label="Share">
              <UserPlus size={16} />
              <span className="hide-sm">Share</span>
            </button>
            <button className="icon-btn on-dark" onClick={() => setShowMenu(true)} aria-label="Board menu" title="Board menu">
              <Ellipsis size={20} />
            </button>
          </div>
          {board.closedAt && (
            <div className="board-banner" role="status">
              This board is closed and read-only.{' '}
              {access.can.admin && (
                <button className="btn btn-small btn-light" onClick={() => run(() => post(`/boards/${board.id}/reopen`), 'Board reopened')}>
                  Reopen board
                </button>
              )}
            </div>
          )}
          {!access.can.edit && !board.closedAt && (
            <div className="board-banner" role="status">
              {access.role === 'observer' ? 'You are an observer on this board: you can view and comment, but not change cards.' : 'You can view this board but not change it.'}
              {access.can.join && ' Join the board to start editing.'}
            </div>
          )}
          {showFilter && <FilterPanel filter={filter} setFilter={setFilter} onClose={() => setShowFilter(false)} />}
          <div className="board-canvas" aria-label={`${board.name} lists`}>
            <DndContext
              sensors={sensors}
              collisionDetection={collisions}
              // Scroll by finger/pointer position: on phones a card is ~85% of the screen wide, so rect-based auto-scroll never stops.
              autoScroll={{ activator: AutoScrollActivator.Pointer, threshold: { x: 0.15, y: 0.15 }, acceleration: 6 }}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
              onDragCancel={() => (setDragCols(null), setActiveDrag(null))}
            >
              <SortableContext items={lists.map((l) => `list:${l.id}`)} strategy={horizontalListSortingStrategy} disabled={!access.can.edit}>
                <ol className="lists">
                  {lists.map((l) => (
                    <ListColumn
                      key={l.id}
                      list={l}
                      cards={colCards[l.id] ?? EMPTY}
                      countText={filterActive ? `${visibleCount(l.id)} of ${totalCount(l.id)}` : String(totalCount(l.id))}
                      onCardKey={stableCardKey}
                      onHover={onHover}
                      movingCardId={kbMove && cols[l.id]?.includes(kbMove.cardId) ? kbMove.cardId : null}
                      allLists={lists}
                      view={view}
                      watching={state.watchedListIds.includes(l.id)}
                      collapsed={collapsed.includes(l.id)}
                      onToggleCollapsed={toggleCollapsed}
                      onCardAction={setCardPop}
                      onArchived={onListArchived}
                      hasTemplates={hasTemplates}
                    />
                  ))}
                  {access.can.edit && <AddList />}
                </ol>
              </SortableContext>
              <DragOverlay>{activeCard ? <CardTile card={activeCard} overlay view={view} /> : null}</DragOverlay>
            </DndContext>
            {lists.length === 0 && !access.can.edit && <p className="board-empty">This board has no lists yet.</p>}
          </div>
          <p id="card-help" className="visually-hidden">
            Enter opens the card. Space picks it up to move with the arrow keys. E: quick edit, L: labels, M: members, D: dates, C: archive.
          </p>
          <div id="board-announcer" className="visually-hidden" aria-live="assertive" aria-atomic="true">
            {announcement}
          </div>
        </div>
        {cardPop && popCard && cardPop.kind === 'quick' && <QuickEdit card={popCard} anchor={cardPop.anchor} view={view} onClose={closePop} onAction={setCardPop} />}
        {cardPop && popCard && cardPop.kind === 'labels' && <LabelsPicker card={popCard} anchor={cardPop.anchor} onClose={closePop} />}
        {cardPop && popCard && cardPop.kind === 'members' && <MembersPicker card={popCard} anchor={cardPop.anchor} onClose={closePop} />}
        {cardPop && popCard && cardPop.kind === 'dates' && <DatesPicker card={popCard} anchor={cardPop.anchor} onClose={closePop} />}
        {cardPop && popCard && cardPop.kind === 'move' && <MoveCardPicker card={popCard} anchor={cardPop.anchor} onClose={closePop} onMoved={(p) => p && nav(p)} />}
        <Suspense fallback={null}>
          {cardNumber && <CardModal key={cardNumber} number={Number(cardNumber)} onClose={() => nav(`/b/${board.shortId}${location.search}`)} />}
          {showMenu && <BoardMenu onClose={() => setShowMenu(false)} />}
          {showMembers && <MembersDialog onClose={() => setShowMembers(false)} />}
        </Suspense>
      </BoardContext.Provider>
    </BoardActionsContext.Provider>
  );
}

function BoardTitle() {
  const { state, run } = useContextSafe();
  const [editing, setEditing] = useState(false);
  const { board, access } = state;
  if (!editing || !access.can.admin)
    return (
      <h1 className="board-title">
        <button className="title-btn" disabled={!access.can.admin} onClick={() => setEditing(true)} title={access.can.admin ? 'Rename board' : undefined}>
          {board.name}
        </button>
      </h1>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const name = new FormData(e.currentTarget).get('name') as string;
        setEditing(false);
        if (name.trim() && name.trim() !== board.name) run(() => patch(`/boards/${board.id}`, { name }));
      }}
    >
      <input
        className="board-title-input"
        name="name"
        aria-label="Board title"
        defaultValue={board.name}
        maxLength={200}
        autoFocus
        onBlur={(e) => e.currentTarget.form?.requestSubmit()}
        onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setEditing(false))}
      />
    </form>
  );
}

function BoardSkeleton() {
  return (
    <div className="board bg-slate" aria-busy="true">
      <div className="board-header">
        <div className="skeleton" style={{ width: 200, height: 28 }} />
      </div>
      <div className="board-canvas">
        <ol className="lists">
          {[5, 3, 4].map((n, i) => (
            <li key={i} className="list skeleton-list">
              {Array.from({ length: n }).map((_, j) => (
                <div key={j} className="skeleton" style={{ height: 40, marginBottom: 8 }} />
              ))}
            </li>
          ))}
        </ol>
      </div>
      <Spinner label="Loading board" />
    </div>
  );
}

export { dueState };
