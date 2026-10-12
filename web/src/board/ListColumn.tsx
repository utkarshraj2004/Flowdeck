import { memo, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { del, get, patch, post, put } from '../api';
import { ConfirmDialog } from '../components/Modal';
import { MenuItems, Popover, usePopover } from '../components/Popover';
import { ChevronsLeftRight, Ellipsis, Eye, FoldHorizontal, LayoutTemplate, Plus, X } from '../components/icons';
import { useToasts } from '../components/Toasts';
import { useBoard, useBoardActions } from './context';
import { SortableCard } from './CardTile';
import type { Card, List } from './store';
import type { CardPop, CardView } from './BoardPage';

type ListPop = 'menu' | 'move' | 'moveAll' | 'sort' | 'copy' | 'templates';

export const ListColumn = memo(function ListColumn({
  list,
  cards,
  countText,
  onCardKey,
  onHover,
  movingCardId,
  allLists,
  view,
  watching,
  collapsed,
  onToggleCollapsed,
  onCardAction,
  onArchived,
  hasTemplates,
}: {
  list: List;
  cards: Card[];
  countText: string;
  onCardKey: (e: React.KeyboardEvent, c: Card) => void;
  onHover: (cardId: string | null) => void;
  movingCardId: string | null;
  allLists: List[];
  view: CardView;
  watching: boolean;
  collapsed: boolean;
  onToggleCollapsed: (listId: string) => void;
  onCardAction: (p: CardPop) => void;
  onArchived: (l: List) => void;
  hasTemplates: boolean;
}) {
  const { run, setWatching } = useBoardActions();
  const { push } = useToasts();
  const canEdit = view.canEdit;
  const sortable = useSortable({ id: `list:${list.id}`, disabled: !canEdit });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `listbody:${list.id}` });
  const [composer, setComposer] = useState<false | 'top' | 'bottom'>(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const pop = usePopover<ListPop>();
  const menuBtn = useRef<HTMLButtonElement>(null);
  const style = { transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition, opacity: sortable.isDragging ? 0.5 : 1 };
  const templateCount = cards.filter((c) => c.isTemplate).length;
  // Sub-menus replace the list menu and keep its anchor, like a second step.
  const step = (k: ListPop) => () => pop.show(k, menuBtn.current!);

  const archiveList = async () => {
    const r = await run(() => post(`/lists/${list.id}/archive`));
    if (!r) return;
    onArchived(list);
    push({ kind: 'info', text: `Archived list “${list.name}”. Press z to undo.`, action: { label: 'Undo', run: () => run(() => post(`/lists/${list.id}/restore`)) } });
  };

  if (collapsed)
    return (
      <li ref={sortable.setNodeRef} style={style} className="list list-collapsed" data-list-id={list.id} aria-label={`List ${list.name} (collapsed)`}>
        <button className="list-expand" onClick={() => onToggleCollapsed(list.id)} aria-label={`Expand list ${list.name}`} title="Expand list">
          <ChevronsLeftRight size={16} />
          <span className="list-collapsed-name">{list.name}</span>
          <span className="list-count">{countText}</span>
        </button>
        <h2 className="visually-hidden">{list.name}</h2>
      </li>
    );

  return (
    <li ref={sortable.setNodeRef} style={style} className={`list ${isOver ? 'drop-target' : ''}`} data-list-id={list.id} aria-label={`List ${list.name}`}>
      <div className="list-header" {...sortable.listeners}>
        {renaming && canEdit ? (
          <input
            className="list-name-input"
            aria-label="List name"
            defaultValue={list.name}
            maxLength={200}
            autoFocus
            onPointerDown={(e) => e.stopPropagation()}
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
            <button className="title-btn" onClick={() => canEdit && setRenaming(true)} disabled={!canEdit} title={canEdit ? 'Rename list' : undefined}>
              {list.name}
            </button>
          </h2>
        )}
        <span className="list-count" aria-label={`${countText} cards`}>
          {countText}
        </span>
        {watching && (
          <span className="list-watch" title="You are watching this list">
            <Eye size={14} aria-hidden="true" />
            <span className="visually-hidden">Watching</span>
          </span>
        )}
        <button className="icon-btn" aria-label={`Collapse list ${list.name}`} title="Collapse list" onClick={() => onToggleCollapsed(list.id)}>
          <FoldHorizontal size={16} />
        </button>
        <button ref={menuBtn} className="icon-btn" aria-label={`List actions for ${list.name}`} aria-haspopup="dialog" aria-expanded={pop.is('menu')} onClick={pop.toggle('menu')}>
          <Ellipsis size={18} />
        </button>
      </div>
      <div ref={setDropRef} className="list-cards">
        {composer === 'top' && <CardComposer listId={list.id} position="top" onClose={() => setComposer(false)} />}
        <SortableContext items={cards.map((c) => `card:${c.id}`)} strategy={verticalListSortingStrategy} disabled={!canEdit || !!movingCardId}>
          <ol className="cards" aria-label={`Cards in ${list.name}`}>
            {cards.map((c) => (
              <SortableCard key={c.id} card={c} view={view} onKey={onCardKey} onHover={onHover} onAction={onCardAction} moving={movingCardId === c.id} />
            ))}
          </ol>
        </SortableContext>
        {composer === 'bottom' && <CardComposer listId={list.id} position="bottom" onClose={() => setComposer(false)} />}
      </div>
      {canEdit && composer !== 'bottom' && (
        <div className="list-footer">
          <button className="add-card-btn" onClick={() => setComposer('bottom')} aria-keyshortcuts="n">
            <Plus size={16} aria-hidden="true" /> Add a card
          </button>
          {hasTemplates && (
            <button className="icon-btn" aria-label={`Create a card from a template in ${list.name}`} title="Create from template" onClick={pop.toggle('templates')}>
              <LayoutTemplate size={16} />
            </button>
          )}
        </div>
      )}

      {pop.is('menu') && (
        <Popover anchor={pop.anchor} title="List actions" onClose={pop.close}>
          <MenuItems label={`Actions for ${list.name}`}>
            {canEdit && (
              <button role="menuitem" onClick={() => (pop.close(), setComposer('top'))}>
                Add card to the top
              </button>
            )}
            {canEdit && (
              <button role="menuitem" onClick={step('copy')}>
                Copy list…
              </button>
            )}
            {canEdit && (
              <button role="menuitem" onClick={step('move')}>
                Move list…
              </button>
            )}
            {canEdit && cards.length > 0 && (
              <button role="menuitem" onClick={step('moveAll')}>
                Move all cards in this list…
              </button>
            )}
            {canEdit && cards.length > 1 && (
              <button role="menuitem" onClick={step('sort')}>
                Sort by…
              </button>
            )}
            <hr />
            <button
              role="menuitemcheckbox"
              aria-checked={watching}
              onClick={async () => {
                pop.close();
                setWatching('list', list.id, !watching);
                const r = await run(() => (watching ? del : put)(`/lists/${list.id}/watch`), watching ? 'Stopped watching list' : 'Watching list: you’ll be notified of new cards');
                if (!r) setWatching('list', list.id, watching);
              }}
            >
              Watch
            </button>
            <button role="menuitem" onClick={() => (pop.close(), onToggleCollapsed(list.id))}>
              Collapse list
            </button>
            {canEdit && (
              <>
                <hr />
                {cards.length > 0 && (
                  <button role="menuitem" onClick={() => (pop.close(), run(() => post(`/lists/${list.id}/archive-all-cards`), 'Cards archived'))}>
                    Archive all cards in this list
                  </button>
                )}
                <button role="menuitem" onClick={() => (pop.close(), setConfirmArchive(true))}>
                  Archive this list
                </button>
              </>
            )}
          </MenuItems>
          {templateCount > 0 && <p className="muted small">{templateCount} template card(s) in this list.</p>}
        </Popover>
      )}
      {pop.is('sort') && (
        <Popover anchor={pop.anchor} title="Sort list" onClose={pop.close} onBack={step('menu')}>
          <p className="muted small">Reorders the cards once. New cards still go where you put them.</p>
          <MenuItems label="Sort by">
            {(
              [
                ['newest', 'Date created (newest first)'],
                ['oldest', 'Date created (oldest first)'],
                ['name', 'Card name (alphabetical)'],
                ['due', 'Due date (soonest first, no date last)'],
              ] as const
            ).map(([by, label]) => (
              <button key={by} role="menuitem" onClick={() => (pop.close(), run(() => post(`/lists/${list.id}/sort`, { by }), 'List sorted'))}>
                {label}
              </button>
            ))}
          </MenuItems>
        </Popover>
      )}
      {pop.is('copy') && (
        <Popover anchor={pop.anchor} title="Copy list" onClose={pop.close} onBack={step('menu')}>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
              if (!name) return;
              const r = await run(() => post(`/lists/${list.id}/copy`, { name }), 'List copied');
              if (r) pop.close();
            }}
          >
            <label className="field">
              <span>Name</span>
              <textarea name="name" defaultValue={list.name} rows={2} maxLength={200} data-autofocus />
            </label>
            <button className="btn btn-primary btn-small">Create list</button>
          </form>
        </Popover>
      )}
      {pop.is('move') && <MoveListPopover list={list} lists={allLists} anchor={pop.anchor} onClose={pop.close} onBack={step('menu')} />}
      {pop.is('moveAll') && (
        <Popover anchor={pop.anchor} title="Move all cards in list" onClose={pop.close} onBack={step('menu')}>
          <MenuItems label="Move all cards to">
            {allLists
              .filter((l) => l.id !== list.id)
              .map((l) => (
                <button key={l.id} role="menuitem" onClick={() => (pop.close(), run(() => post(`/lists/${list.id}/move-all-cards`, { listId: l.id }), 'Cards moved'))}>
                  {l.name}
                </button>
              ))}
          </MenuItems>
        </Popover>
      )}
      {pop.is('templates') && <TemplatePicker listId={list.id} anchor={pop.anchor} onClose={pop.close} />}
      {confirmArchive && (
        <ConfirmDialog
          title={`Archive “${list.name}”?`}
          body="The list and its cards are hidden from the board. You can restore it from Menu → Archived items."
          confirmLabel="Archive list"
          onCancel={() => setConfirmArchive(false)}
          onConfirm={() => {
            setConfirmArchive(false);
            archiveList();
          }}
        />
      )}
    </li>
  );
});

function MoveListPopover({ list, lists, anchor, onClose, onBack }: { list: List; lists: List[]; anchor: HTMLElement | null; onClose: () => void; onBack: () => void }) {
  const { state, run } = useBoard();
  const nav = useNavigate();
  const [boards, setBoards] = useState<any[]>([{ id: state.board.id, name: state.board.name, shortId: state.board.shortId }]);
  const [boardId, setBoardId] = useState(state.board.id);
  const [targetLists, setTargetLists] = useState<List[] | null>(lists);
  const [error, setError] = useState('');
  const [after, setAfter] = useState<string>(() => {
    const i = lists.findIndex((l) => l.id === list.id);
    return i > 0 ? lists[i - 1].id : '';
  });
  useEffect(() => {
    get('/me/home')
      .then((r) => setBoards(r.boards.filter((b: any) => !b.closedAt && (b.role === 'admin' || b.role === 'member'))))
      .catch(() => undefined); // the current board stays available
  }, []);
  useEffect(() => {
    let stale = false;
    setError('');
    if (boardId === state.board.id) setTargetLists(lists);
    else {
      setTargetLists(null);
      get(`/boards/${boardId}`)
        .then((s) => !stale && setTargetLists(s.lists))
        .catch((e) => !stale && setError((e as Error).message));
    }
    return () => {
      stale = true;
    };
  }, [boardId, lists, state.board.id]);
  const others = (targetLists ?? []).filter((l) => l.id !== list.id);
  return (
    <Popover anchor={anchor} title="Move list" onClose={onClose} onBack={onBack}>
      <form
        className="stack"
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
          <select
            aria-label="Destination board"
            value={boardId}
            onChange={(e) => {
              setBoardId(e.target.value);
              setAfter(''); // positions belong to one board
            }}
          >
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
          <select aria-label="Position" value={after} onChange={(e) => setAfter(e.target.value)}>
            <option value="">First</option>
            {others.map((l) => (
              <option key={l.id} value={l.id}>
                After “{l.name}”
              </option>
            ))}
          </select>
        </label>
        {boardId !== state.board.id && <p className="muted small">Card members who aren’t on the target board will be removed from the cards. Labels are matched by name and colour (missing ones are created).</p>}
        {error && (
          <p className="field-error" role="alert">
            Couldn’t load that board’s lists: {error}
          </p>
        )}
        <button className="btn btn-primary btn-small" disabled={!targetLists}>
          Move
        </button>
      </form>
    </Popover>
  );
}

/** Create a card from one of the board's template cards (keeps its checklists, labels, members and attachments). */
function TemplatePicker({ listId, anchor, onClose }: { listId: string; anchor: HTMLElement | null; onClose: () => void }) {
  const { state, run, openCard } = useBoard();
  const templates = Object.values(state.cards).filter((c) => c.isTemplate && !c.archivedAt);
  const [chosen, setChosen] = useState<Card | null>(templates.length === 1 ? templates[0] : null);
  const [name, setName] = useState(chosen?.name ?? '');
  if (!chosen)
    return (
      <Popover key="choose" anchor={anchor} title="Card templates" onClose={onClose}>
        <MenuItems label="Templates">
          {templates.map((t) => (
            <button
              key={t.id}
              role="menuitem"
              onClick={() => {
                setChosen(t);
                setName(t.name);
              }}
            >
              <LayoutTemplate size={16} aria-hidden="true" /> {t.name}
            </button>
          ))}
        </MenuItems>
        {!templates.length && <p className="muted small">No template cards on this board yet. Open a card and choose “Make template”.</p>}
      </Popover>
    );
  return (
    <Popover key="create" anchor={anchor} title="Create card from template" onClose={onClose} onBack={templates.length > 1 ? () => setChosen(null) : undefined}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const keep = ['checklists', 'labels', 'members', 'attachments'];
          const r: any = await run(() => post(`/cards/${chosen.id}/copy`, { listId, position: 'bottom', name: name.trim() || chosen.name, keep }), 'Card created from template');
          if (r) {
            onClose();
            openCard(r.card.number);
          }
        }}
      >
        <label className="field">
          <span>Title</span>
          <textarea value={name} rows={2} maxLength={512} onChange={(e) => setName(e.target.value)} data-autofocus />
        </label>
        <p className="muted small">The new card gets the template’s checklists, labels, members and attachments.</p>
        <button className="btn btn-primary btn-small">Create card</button>
      </form>
    </Popover>
  );
}

function CardComposer({ listId, position, onClose }: { listId: string; position: 'top' | 'bottom'; onClose: () => void }) {
  const { run } = useBoardActions();
  const ref = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState('');
  const { push } = useToasts();
  useEffect(() => {
    formRef.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  const submit = async () => {
    const name = ref.current!.value.trim();
    if (!name) return onClose();
    if (name.length > 512) return setError(`Card titles can be at most 512 characters (this one has ${name.length}).`);
    setError('');
    try {
      const r = await post(`/lists/${listId}/cards`, { name, position });
      run(async () => r);
      // The composer may have been closed (Esc) while the request was in flight.
      if (ref.current) {
        ref.current.value = '';
        ref.current.focus();
        formRef.current?.scrollIntoView({ block: 'nearest' });
      }
    } catch (e) {
      push({ kind: 'error', text: (e as Error).message });
    }
  };
  return (
    <form
      ref={formRef}
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
        placeholder="Enter a title or paste a link"
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
        <button type="button" className="icon-btn" aria-label="Cancel adding a card" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
    </form>
  );
}

export function AddList() {
  const { getState, run } = useBoardActions();
  const [open, setOpen] = useState(() => Object.keys(getState().lists).length === 0);
  const ref = useRef<HTMLInputElement>(null);
  if (!open)
    return (
      <li className="list add-list">
        <button className="add-list-btn" onClick={() => setOpen(true)}>
          <Plus size={16} aria-hidden="true" /> Add another list
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
          const r = await run(() => post(`/boards/${getState().board.id}/lists`, { name }));
          if (!r || !ref.current) return; // keep the typed name when it failed
          ref.current.value = '';
          ref.current.focus();
        }}
      >
        <input ref={ref} autoFocus aria-label="List name" placeholder="Enter list name…" maxLength={200} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))} />
        <div className="row">
          <button className="btn btn-primary btn-small">Add list</button>
          <button type="button" className="icon-btn" aria-label="Cancel adding a list" onClick={() => setOpen(false)}>
            <X size={18} />
          </button>
        </div>
      </form>
    </li>
  );
}
