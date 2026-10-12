import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { del, get, patch, post, put } from '../api';
import { Avatar, DUE_TEXT, dueState, formatDate, LabelChip } from '../components/ui';
import { ConfirmDialog, Modal } from '../components/Modal';
import { useToasts } from '../components/Toasts';
import { useBoard } from './context';
import type { Card, Label, List, Member } from './store';

export function ListColumn({
  list,
  cardIds,
  countText,
  onCardKey,
  movingCardId,
  allLists,
}: {
  list: List;
  cardIds: string[];
  countText: string;
  onCardKey: (e: React.KeyboardEvent, c: Card) => void;
  movingCardId: string | null;
  allLists: List[];
}) {
  const { state, run, reload } = useBoard();
  const { push } = useToasts();
  const can = state.access.can;
  const sortable = useSortable({ id: `list:${list.id}`, disabled: !can.edit });
  const { setNodeRef: setDropRef } = useDroppable({ id: `listbody:${list.id}` });
  const [composer, setComposer] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<'move' | 'moveAll' | 'archive' | null>(null);
  const membersById = Object.fromEntries(state.members.map((m) => [m.id, m]));
  const watching = state.watchedListIds.includes(list.id);
  const style = { transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition, opacity: sortable.isDragging ? 0.5 : 1 };

  return (
    <li ref={sortable.setNodeRef} style={style} className="list" data-list-id={list.id} aria-label={`List ${list.name}`}>
      <div className="list-header" {...sortable.listeners}>
        {renaming && can.edit ? (
          <input
            className="list-name-input"
            aria-label="List name"
            defaultValue={list.name}
            maxLength={200}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                e.stopPropagation();
                setRenaming(false);
              }
            }}
            onBlur={(e) => {
              const name = e.currentTarget.value.trim();
              setRenaming(false);
              if (name && name !== list.name) run(() => patch(`/lists/${list.id}`, { name }));
            }}
          />
        ) : (
          <h2 className="list-name">
            <button className="title-btn" onClick={() => can.edit && setRenaming(true)} disabled={!can.edit}>
              {list.name}
            </button>
          </h2>
        )}
        <span className="list-count" aria-label={`${countText} cards`}>
          {countText}
        </span>
        {watching && (
          <span title="You are watching this list" aria-label="Watching">
            👁
          </span>
        )}
        <div className="menu-wrap">
          <button className="icon-btn" aria-label={`List actions for ${list.name}`} aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
            ⋯
          </button>
          {menu && (
            <div className="menu" role="menu" onKeyDown={(e) => e.key === 'Escape' && setMenu(false)} onMouseLeave={() => setMenu(false)}>
              {can.edit && (
                <button role="menuitem" onClick={() => (setMenu(false), setComposer(true))}>
                  Add card
                </button>
              )}
              {can.edit && (
                <button role="menuitem" onClick={() => (setMenu(false), run(() => post(`/lists/${list.id}/copy`, { name: `${list.name} (copy)` }), 'List copied'))}>
                  Copy list
                </button>
              )}
              {can.edit && (
                <button role="menuitem" onClick={() => (setMenu(false), setDialog('move'))}>
                  Move list…
                </button>
              )}
              {can.edit && cardIds.length > 0 && (
                <button role="menuitem" onClick={() => (setMenu(false), setDialog('moveAll'))}>
                  Move all cards in this list…
                </button>
              )}
              <button
                role="menuitem"
                onClick={async () => {
                  setMenu(false);
                  await run(() => (watching ? del : put)(`/lists/${list.id}/watch`), watching ? 'Stopped watching list' : 'Watching list: you’ll be notified of new cards');
                  await reload();
                }}
              >
                {watching ? 'Stop watching' : 'Watch'}
              </button>
              {can.edit && cardIds.length > 0 && (
                <button role="menuitem" onClick={() => (setMenu(false), run(() => post(`/lists/${list.id}/archive-all-cards`), 'Cards archived'))}>
                  Archive all cards in this list
                </button>
              )}
              {can.edit && (
                <button role="menuitem" onClick={() => (setMenu(false), setDialog('archive'))}>
                  Archive this list
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div ref={setDropRef} className="list-cards">
        <SortableContext items={cardIds.map((id) => `card:${id}`)} strategy={verticalListSortingStrategy} disabled={!can.edit || !!movingCardId}>
          <ol className="cards" aria-label={`Cards in ${list.name}`}>
            {cardIds.map((id) =>
              state.cards[id] ? (
                <SortableCard key={id} card={state.cards[id]} labels={state.labels} membersById={membersById} onKey={onCardKey} moving={movingCardId === id} />
              ) : null,
            )}
          </ol>
        </SortableContext>
        {composer && <CardComposer listId={list.id} onClose={() => setComposer(false)} />}
      </div>
      {can.edit && !composer && (
        <button className="add-card-btn" onClick={() => setComposer(true)} aria-keyshortcuts="n">
          + Add a card
        </button>
      )}
      {dialog === 'archive' && (
        <ConfirmDialog
          title={`Archive “${list.name}”?`}
          body="The list and its cards are hidden from the board. You can restore it from Menu → Archived items."
          confirmLabel="Archive list"
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            run(() => post(`/lists/${list.id}/archive`)).then((r) => r && pushUndo(list));
          }}
        />
      )}
      {dialog === 'move' && <MoveListDialog list={list} lists={allLists} onClose={() => setDialog(null)} />}
      {dialog === 'moveAll' && (
        <Modal title="Move all cards to…" onClose={() => setDialog(null)} className="modal-small">
          <div className="modal-body stack">
            {allLists
              .filter((l) => l.id !== list.id)
              .map((l) => (
                <button key={l.id} className="btn btn-light" onClick={() => (setDialog(null), run(() => post(`/lists/${list.id}/move-all-cards`, { listId: l.id }), 'Cards moved'))}>
                  {l.name}
                </button>
              ))}
          </div>
        </Modal>
      )}
    </li>
  );

  function pushUndo(l: List) {
    push({ kind: 'info', text: `Archived list “${l.name}”.`, action: { label: 'Undo', run: () => run(() => post(`/lists/${l.id}/restore`)) } });
  }
}

function MoveListDialog({ list, lists, onClose }: { list: List; lists: List[]; onClose: () => void }) {
  const { state, run } = useBoard();
  const nav = useNavigate();
  const [boards, setBoards] = useState<any[]>([]);
  const [boardId, setBoardId] = useState(state.board.id);
  const [targetLists, setTargetLists] = useState<List[]>(lists);
  const [after, setAfter] = useState<string>('');
  useEffect(() => {
    get('/me/home').then((r) => setBoards(r.boards.filter((b: any) => !b.closedAt && (b.role === 'admin' || b.role === 'member'))));
  }, []);
  useEffect(() => {
    if (boardId === state.board.id) setTargetLists(lists);
    else get(`/boards/${boardId}`).then((s) => setTargetLists(s.lists));
  }, [boardId, lists, state.board.id]);
  const others = targetLists.filter((l) => l.id !== list.id);
  return (
    <Modal title="Move list" onClose={onClose} className="modal-small">
      <form
        className="modal-body stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(() => post(`/lists/${list.id}/move`, { boardId, position: { afterId: after || null } }), 'List moved');
          onClose();
          if (r && boardId !== state.board.id) {
            const b = boards.find((x) => x.id === boardId);
            if (b) nav(`/b/${b.shortId}`);
          }
        }}
      >
        <label className="field">
          <span>Board</span>
          <select value={boardId} onChange={(e) => setBoardId(e.target.value)}>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
                {b.id === state.board.id ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Position</span>
          <select value={after} onChange={(e) => setAfter(e.target.value)}>
            <option value="">First</option>
            {others.map((l) => (
              <option key={l.id} value={l.id}>
                After “{l.name}”
              </option>
            ))}
          </select>
        </label>
        {boardId !== state.board.id && <p className="muted small">Card members who aren’t on the target board will be removed from the cards. Labels are matched by name and colour (missing ones are created).</p>}
        <button className="btn btn-primary">Move</button>
      </form>
    </Modal>
  );
}

function SortableCard({ card, labels, membersById, onKey, moving }: { card: Card; labels: Label[]; membersById: Record<string, Member>; onKey: (e: React.KeyboardEvent, c: Card) => void; moving: boolean }) {
  const { attributes: _a, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `card:${card.id}` });
  const style = { transform: CSS.Translate.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <li ref={setNodeRef} style={style} {...listeners}>
      <CardTile card={card} labels={labels} membersById={membersById} onKey={onKey} moving={moving} />
    </li>
  );
}

export function CardTile({
  card,
  labels,
  membersById,
  onKey,
  moving,
  overlay,
}: {
  card: Card;
  labels: Label[];
  membersById: Record<string, Member>;
  onKey?: (e: React.KeyboardEvent, c: Card) => void;
  moving?: boolean;
  overlay?: boolean;
}) {
  const nav = useNavigate();
  const { state } = useBoard();
  const cardLabels = labels.filter((l) => card.labelIds.includes(l.id));
  const ds = dueState(card.dueAt, card.dueComplete);
  const b = card.badges;
  const coverImg = card.cover?.attachmentId && state.board.prefs.cardCovers !== false ? `/api/v1/attachments/${card.cover.attachmentId}/download` : null;
  return (
    <div
      className={`card-tile ${moving ? 'moving' : ''} ${overlay ? 'overlay' : ''}`}
      role="button"
      tabIndex={overlay ? -1 : 0}
      data-card-id={overlay ? undefined : card.id}
      aria-roledescription="card"
      aria-label={`${card.name}${cardLabels.length ? `, labels ${cardLabels.map((l) => l.name || l.color).join(', ')}` : ''}${card.dueAt ? `, ${DUE_TEXT[ds]} ${formatDate(card.dueAt)}` : ''}`}
      aria-pressed={moving ? true : undefined}
      onClick={() => !overlay && nav(`/b/${state.board.shortId}/c/${card.number}${location.search}`)}
      onKeyDown={(e) => onKey?.(e, card)}
    >
      {card.cover?.color && <div className={`card-cover label-${card.cover.color}`} aria-hidden="true" />}
      {coverImg && <img className="card-cover-img" src={coverImg} alt="" loading="lazy" />}
      {cardLabels.length > 0 && (
        <div className="card-labels">
          {cardLabels.map((l) => (
            <LabelChip key={l.id} label={l} />
          ))}
        </div>
      )}
      <div className="card-title">{card.name}</div>
      <div className="card-badges">
        {card.dueAt && (
          <span className={`badge due-${ds}`}>
            <span aria-hidden="true">🕑</span> {formatDate(card.dueAt, false)}
            <span className="visually-hidden"> {DUE_TEXT[ds]}</span>
          </span>
        )}
        {b.description && (
          <span className="badge" title="Has a description" aria-label="Has a description">
            ≡
          </span>
        )}
        {b.comments > 0 && (
          <span className="badge" aria-label={`${b.comments} comments`}>
            💬 {b.comments}
          </span>
        )}
        {b.attachments > 0 && (
          <span className="badge" aria-label={`${b.attachments} attachments`}>
            📎 {b.attachments}
          </span>
        )}
        {b.checkItems > 0 && (
          <span className={`badge ${b.checkItems === b.checkItemsChecked ? 'due-complete' : ''}`} aria-label={`Checklist ${b.checkItemsChecked} of ${b.checkItems} done`}>
            ☑ {b.checkItemsChecked}/{b.checkItems}
          </span>
        )}
        <span className="grow" />
        {card.memberIds.map((id) => (membersById[id] ? <Avatar key={id} user={membersById[id]} size={24} /> : null))}
      </div>
    </div>
  );
}

function CardComposer({ listId, onClose }: { listId: string; onClose: () => void }) {
  const { run } = useBoard();
  const ref = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState('');
  const { push } = useToasts();
  const submit = async () => {
    const name = ref.current!.value.trim();
    if (!name) return onClose();
    if (name.length > 512) return setError(`Card titles can be at most 512 characters (this one has ${name.length}).`);
    setError('');
    try {
      const r = await post(`/lists/${listId}/cards`, { name });
      run(async () => r);
      // The composer may have been closed (Esc) while the request was in flight.
      if (ref.current) {
        ref.current.value = '';
        ref.current.focus();
      }
    } catch (e) {
      push({ kind: 'error', text: (e as Error).message });
    }
  };
  return (
    <form
      className="composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={ref}
        autoFocus
        aria-label="Card title"
        placeholder="Enter a title for this card…"
        rows={2}
        aria-invalid={!!error}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
      />
      {error && (
        <div className="field-error" role="alert">
          {error}
        </div>
      )}
      <div className="row">
        <button className="btn btn-primary btn-small">Add card</button>
        <button type="button" className="btn btn-ghost btn-small" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function AddList() {
  const { state, run } = useBoard();
  const [open, setOpen] = useState(state && Object.keys(state.lists).length === 0);
  const ref = useRef<HTMLInputElement>(null);
  if (!open)
    return (
      <li className="list add-list">
        <button className="add-list-btn" onClick={() => setOpen(true)}>
          + Add another list
        </button>
      </li>
    );
  return (
    <li className="list add-list">
      <form
        className="composer"
        onSubmit={async (e) => {
          e.preventDefault();
          const name = ref.current!.value.trim();
          if (!name) return;
          await run(() => post(`/boards/${state.board.id}/lists`, { name }));
          ref.current!.value = '';
          ref.current!.focus();
        }}
      >
        <input ref={ref} autoFocus aria-label="List name" placeholder="Enter list name…" maxLength={200} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))} />
        <div className="row">
          <button className="btn btn-primary btn-small">Add list</button>
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setOpen(false)}>
            Cancel
          </button>
        </div>
      </form>
    </li>
  );
}
