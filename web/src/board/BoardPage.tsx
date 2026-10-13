import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { isTypingTarget } from '../components/Shortcuts';
import { NotFoundPage } from '../pages/NotFound';
import { BoardContext, useBoard as useContextSafe, type BoardCtx } from './context';
import { cardsInList, fromSnapshot, reduceEvent, sortedLists, type BoardEvent, type BoardState, type Card } from './store';
import { AddList, CardTile, ListColumn } from './ListColumn';
import { CardModal } from './CardModal';
import { BoardMenu } from './BoardMenu';
import { MembersDialog } from './MembersDialog';
import { FilterPanel, filterFromParams, matchesFilter, type Filter } from './Filter';

type Cols = Record<string, string[]>;

export function BoardPage() {
  const { shortId, cardNumber } = useParams();
  const nav = useNavigate();
  const { me } = useAuth();
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
  const seqRef = useRef(0);
  const pending = useRef(new Map<number, BoardEvent>());
  const gapTimer = useRef<number | undefined>(undefined);
  const listeners = useRef(new Set<(e: BoardEvent) => void>());
  const boardIdRef = useRef<string>('');
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
        if (r?.event) ingest(r.event);
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

  const ctx: BoardCtx | null = useMemo(
    () =>
      state && {
        state,
        ingest,
        reload: load,
        onEvent: (fn) => {
          listeners.current.add(fn);
          return () => listeners.current.delete(fn);
        },
        editing,
        presence,
        announce,
        run,
      },
    [state, ingest, load, editing, presence, announce, run],
  );

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
  const lists = state ? sortedLists(state) : [];
  const baseCols: Cols = useMemo(() => {
    if (!state) return {};
    const cols: Cols = {};
    for (const l of sortedLists(state)) cols[l.id] = cardsInList(state, l.id).filter((c) => matchesFilter(c, filter, me!.id)).map((c) => c.id);
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, filter]);
  const [dragCols, setDragCols] = useState<Cols | null>(null);
  const [activeDrag, setActiveDrag] = useState<string | null>(null);
  const [kbMove, setKbMove] = useState<{ cardId: string } | null>(null);
  const cols = dragCols ?? baseCols;
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
    if (id.startsWith('card:')) setDragCols(structuredClone(baseCols));
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

  // Keyboard alternative to dragging (WCAG 2.5.7): Space picks up, arrows move, Enter/Space drops, Esc cancels.
  const focusCard = (cardId: string) => window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-card-id="${cardId}"]`)?.focus());
  const listName = (id: string) => state?.lists[id]?.name ?? '';
  const onCardKey = (e: React.KeyboardEvent, card: Card) => {
    if (!state || me?.prefs.shortcuts === false && !['Enter', ' ', 'Escape'].includes(e.key)) return;
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
    const from = card.listId;
    const ids = cols[from] ?? [];
    const idx = ids.indexOf(card.id);
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        nav(`/b/${state.board.shortId}/c/${card.number}${location.search}`);
        break;
      case ' ':
        e.preventDefault();
        if (!can.edit) return announce('You can’t move cards on this board.');
        setDragCols(structuredClone(baseCols));
        setKbMove({ cardId: card.id });
        announce(`Picked up “${card.name}”. Use the arrow keys to move it, Enter to drop, Escape to cancel.`);
        break;
      case 'ArrowDown':
      case 'j':
        e.preventDefault();
        if (idx + 1 < ids.length) focusCard(ids[idx + 1]);
        break;
      case 'ArrowUp':
      case 'k':
        e.preventDefault();
        if (idx > 0) focusCard(ids[idx - 1]);
        break;
      case 'ArrowLeft':
      case 'ArrowRight': {
        e.preventDefault();
        let li = listIds.indexOf(from);
        do li += e.key === 'ArrowLeft' ? -1 : 1;
        while (li >= 0 && li < listIds.length && !cols[listIds[li]]?.length);
        if (li >= 0 && li < listIds.length) focusCard(cols[listIds[li]][Math.min(Math.max(idx, 0), cols[listIds[li]].length - 1)]);
        break;
      }
      case ',':
      case '.': {
        e.preventDefault();
        if (!can.edit) return;
        const li = listIds.indexOf(from) + (e.key === ',' ? -1 : 1);
        if (li < 0 || li >= listIds.length) return;
        const to = listIds[li];
        commitCardMove(card.id, to, [...(cols[to] ?? []), card.id]);
        announce(`Moved “${card.name}” to ${listName(to)}.`);
        focusCard(card.id);
        break;
      }
      case 'c':
        e.preventDefault();
        if (!can.edit) return;
        run(() => post(`/cards/${card.id}/archive`)).then((r) => {
          if (r)
            push({
              kind: 'info',
              text: `Archived “${card.name}”.`,
              action: { label: 'Undo', run: () => run(() => post(`/cards/${card.id}/restore`)) },
            });
        });
        if (idx + 1 < ids.length) focusCard(ids[idx + 1]);
        else if (idx > 0) focusCard(ids[idx - 1]);
        break;
    }
  };

  // Board-level shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal') || me?.prefs.shortcuts === false) return;
      if (e.key === 'f') {
        e.preventDefault();
        setShowFilter(true);
      } else if (e.key === 'x') {
        e.preventDefault();
        setFilter({ q: '', members: [], labels: [], due: '', status: '' });
      } else if (e.key === 'q') {
        e.preventDefault();
        setFilter({ members: filter.members.includes(me!.id) ? [] : [me!.id] });
      } else if (e.key === 'n') {
        const list = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-list-id]') ?? document.querySelector<HTMLElement>('[data-list-id]');
        if (list) {
          e.preventDefault();
          list.querySelector<HTMLButtonElement>('.add-card-btn')?.click();
        }
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
  if (!state || !ctx) return <BoardSkeleton />;

  const { board, access } = state;
  const visibleCount = (listId: string) => cols[listId]?.length ?? 0;
  const totalCount = (listId: string) => cardsInList(state, listId).length;
  const activeCard = activeDrag?.startsWith('card:') ? state.cards[activeDrag.slice(5)] : null;
  const membersById = Object.fromEntries(state.members.map((m) => [m.id, m]));
  const online = presence.filter((id) => id !== me!.id);

  return (
    <BoardContext.Provider value={ctx}>
      <div className={`board bg-${board.background}`}>
        <div className="board-header">
          <BoardTitle />
          <button
            className="icon-btn on-dark"
            aria-pressed={!!board.starred}
            aria-label={board.starred ? 'Unstar board' : 'Star board'}
            onClick={async () => {
              const starred = !board.starred;
              await (starred ? put : del)(`/boards/${board.id}/star`);
              setState((s) => (s ? { ...s, board: { ...s.board, starred } } : s));
            }}
          >
            {board.starred ? '★' : '☆'}
          </button>
          <span className="pill on-dark">{board.visibility === 'private' ? 'Private' : 'Workspace'}</span>
          <span className="pill on-dark hide-sm">{state.workspace.name}</span>
          <span className="pill on-dark" title="Your role on this board">
            {access.role === 'viewer' ? 'Viewing' : access.role}
          </span>
          <div className="grow" />
          <div className="member-stack" aria-label="Board members">
            {state.members.slice(0, 6).map((m) => (
              <span key={m.id} className={`member-dot ${online.includes(m.id) ? 'online' : ''}`}>
                <Avatar user={m} size={28} title={`${m.fullName}${online.includes(m.id) ? ' (viewing now)' : ''}`} />
              </span>
            ))}
            {state.members.length > 6 && <span className="pill on-dark">+{state.members.length - 6}</span>}
          </div>
          {access.can.join && !access.boardRole && (
            <button className="btn btn-primary btn-small" onClick={() => run(() => post(`/boards/${board.id}/join`), 'You joined this board').then(() => load())}>
              Join board
            </button>
          )}
          <button className="btn btn-light btn-small" onClick={() => setShowMembers(true)}>
            Share
          </button>
          <button className={`btn btn-small ${filterActive ? 'btn-primary' : 'btn-light'}`} onClick={() => setShowFilter((v) => !v)} aria-expanded={showFilter} aria-keyshortcuts="f">
            Filter{filterActive ? ` · ${Object.values(baseCols).reduce((a, c) => a + c.length, 0)} shown` : ''}
          </button>
          {filterActive && (
            <button className="btn btn-light btn-small" onClick={() => setFilter({ q: '', members: [], labels: [], due: '', status: '' })} aria-keyshortcuts="x">
              Clear
            </button>
          )}
          <button className="btn btn-light btn-small" onClick={() => setShowMenu(true)} aria-label="Board menu">
            ⋯ Menu
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
            autoScroll={{ activator: AutoScrollActivator.Pointer, threshold: { x: 0.15, y: 0.15 }, acceleration: 6 }} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => (setDragCols(null), setActiveDrag(null))}>
            <SortableContext items={lists.map((l) => `list:${l.id}`)} strategy={horizontalListSortingStrategy} disabled={!access.can.edit}>
              <ol className="lists">
                {lists.map((l) => (
                  <ListColumn
                    key={l.id}
                    list={l}
                    cardIds={cols[l.id] ?? []}
                    countText={filterActive ? `${visibleCount(l.id)} of ${totalCount(l.id)}` : String(totalCount(l.id))}
                    onCardKey={onCardKey}
                    movingCardId={kbMove?.cardId ?? null}
                    allLists={lists}
                  />
                ))}
                {access.can.edit && <AddList />}
              </ol>
            </SortableContext>
            <DragOverlay>{activeCard ? <CardTile card={activeCard} overlay labels={state.labels} membersById={membersById} /> : null}</DragOverlay>
          </DndContext>
          {lists.length === 0 && !access.can.edit && <p className="board-empty">This board has no lists yet.</p>}
        </div>
        <div id="board-announcer" className="visually-hidden" aria-live="assertive" aria-atomic="true">
          {announcement}
        </div>
      </div>
      {cardNumber && <CardModal key={cardNumber} number={Number(cardNumber)} onClose={() => nav(`/b/${board.shortId}${location.search}`)} />}
      {showMenu && <BoardMenu onClose={() => setShowMenu(false)} />}
      {showMembers && <MembersDialog onClose={() => setShowMembers(false)} />}
    </BoardContext.Provider>
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
