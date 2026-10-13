import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ApiError, patch, post } from '../api';
import { useLayer } from '../components/Popover';
import { Archive, ArrowRight, Circle, CircleCheck, Clock, Pencil, Tag, Users } from '../components/icons';
import { useToasts } from '../components/Toasts';
import { Avatar, colorName, DUE_TEXT, dueState, formatDate } from '../components/ui';
import { useBoardActions } from './context';
import type { CardPop, CardPopKind, CardView } from './BoardPage';
import type { Card } from './store';

export const SortableCard = memo(function SortableCard({
  card,
  view,
  onKey,
  onHover,
  onAction,
  moving,
  unread,
}: {
  card: Card;
  view: CardView;
  onKey: (e: React.KeyboardEvent, c: Card) => void;
  onHover: (cardId: string | null) => void;
  onAction: (p: CardPop) => void;
  moving: boolean;
  unread: boolean;
}) {
  const { attributes: _a, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `card:${card.id}` });
  const style = { transform: CSS.Translate.toString(transform), transition };
  return (
    <li ref={setNodeRef} style={style} className={isDragging ? 'card-slot dragging' : 'card-slot'} {...listeners}>
      <CardTile card={card} view={view} onKey={onKey} onHover={onHover} onAction={onAction} moving={moving} unread={unread} />
    </li>
  );
});

/**
 * Card front. One tab stop per card (the tile); its mouse shortcuts (complete, quick edit, label names)
 * have keyboard equivalents (open the card, `e`, `;`) and are therefore kept out of the tab order.
 */
export const CardTile = memo(function CardTile({
  card,
  view,
  onKey,
  onHover,
  onAction,
  moving,
  overlay,
  unread = false,
}: {
  card: Card;
  view: CardView;
  onKey?: (e: React.KeyboardEvent, c: Card) => void;
  onHover?: (cardId: string | null) => void;
  onAction?: (p: CardPop) => void;
  moving?: boolean;
  overlay?: boolean;
  /** The viewer has unread notifications about this card. */
  unread?: boolean;
}) {
  const { openCard, patchCard, run, reload, toggleLabelNames } = useBoardActions();
  const ref = useRef<HTMLDivElement>(null);
  // Hover/focus-only controls are rendered just for the active card, keeping large boards light.
  const [hot, setHot] = useState(false);
  const { labels, membersById } = view;
  const cardLabels = labels.filter((l) => card.labelIds.includes(l.id));
  const frontLabels = cardLabels.filter((l) => l.color); // colourless labels show only in the card dialog
  const ds = dueState(card.dueAt, card.dueComplete);
  const b = card.badges;
  const watching = view.watched.has(card.id);
  const coverImg = card.cover?.attachmentId && view.covers ? `/api/v1/attachments/${card.cover.attachmentId}/download` : null;
  const interactive = !overlay && view.canEdit;
  const toggleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    const dueComplete = !card.dueComplete;
    patchCard(card.id, (c) => ({ ...c, dueComplete }));
    run(() => patch(`/cards/${card.id}`, { dueComplete })).then((r) => {
      if (r === undefined) reload();
    });
  };
  const summary = [
    card.name,
    unread ? 'unread notifications' : '',
    card.isTemplate ? 'template' : '',
    card.dueComplete ? 'complete' : '',
    cardLabels.length ? `labels ${cardLabels.map((l) => l.name || colorName(l.color)).join(', ')}` : '',
    card.dueAt ? `${DUE_TEXT[ds]} ${formatDate(card.dueAt)}` : '',
    card.memberIds.length ? `members ${card.memberIds.map((id) => membersById[id]?.fullName).filter(Boolean).join(', ')}` : '',
    b.comments ? `${b.comments} comment${b.comments === 1 ? '' : 's'}` : '',
    b.attachments ? `${b.attachments} attachment${b.attachments === 1 ? '' : 's'}` : '',
    b.checkItems ? `checklist ${b.checkItemsChecked} of ${b.checkItems} done` : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <div
      ref={ref}
      className={`card-tile ${moving ? 'moving' : ''} ${overlay ? 'overlay' : ''} ${card.dueComplete ? 'is-complete' : ''}`}
      role="group"
      aria-roledescription="card"
      tabIndex={overlay ? -1 : 0}
      data-card-id={overlay ? undefined : card.id}
      aria-label={summary}
      aria-describedby={overlay ? undefined : 'card-help'}
      onClick={() => !overlay && openCard(card.number)}
      onKeyDown={(e) => onKey?.(e, card)}
      onMouseEnter={() => (onHover?.(card.id), setHot(true))}
      onMouseLeave={() => (onHover?.(null), setHot(false))}
      onFocus={() => setHot(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setHot(false)}
    >
      {card.cover?.color && <div className={`card-cover label-${card.cover.color}`} aria-hidden="true" />}
      {coverImg && <img className="card-cover-img" src={coverImg} alt="" loading="lazy" />}
      <div className="card-body">
        {frontLabels.length > 0 && (
          <div
            className={`card-labels ${view.labelNames ? 'named' : ''}`}
            aria-hidden="true"
            title={view.labelNames ? 'Hide label names (;)' : 'Show label names (;)'}
            onClick={(e) => {
              if (overlay) return;
              e.stopPropagation();
              toggleLabelNames();
            }}
          >
            {frontLabels.map((l) => (
              <span key={l.id} className={`card-label label-${l.color}`} title={l.name || colorName(l.color)}>
                {view.labelNames ? l.name : ''}
              </span>
            ))}
          </div>
        )}
        <div className="card-title-row">
          {interactive && !card.isTemplate && (hot || card.dueComplete) && (
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className={`complete-toggle ${card.dueComplete ? 'on' : ''}`}
              title={card.dueComplete ? 'Mark incomplete' : 'Mark complete'}
              onClick={toggleComplete}
            >
              {card.dueComplete ? <CircleCheck size={16} /> : <Circle size={16} />}
            </button>
          )}
          {!interactive && card.dueComplete && <CircleCheck size={16} className="complete-mark" aria-hidden="true" />}
          <span className="card-title">{card.name}</span>
        </div>
        <div className="card-badges">
          {card.isTemplate && (
            <span className="badge badge-template ci i-template">
              Template
            </span>
          )}
          {unread && (
            <span className="badge badge-unread ci i-bell" title="New activity you have not seen yet">
              <span className="visually-hidden">Unread notifications</span>
            </span>
          )}
          {watching && (
            <span className="badge ci i-eye" title="You are watching this card">
              <span className="visually-hidden">Watching</span>
            </span>
          )}
          {card.dueAt && (
            <span className={`badge ci i-clock due-${ds}`} title={`${DUE_TEXT[ds]}: ${formatDate(card.dueAt)}`}>
              {card.startAt ? `${formatDate(card.startAt, false)} – ` : ''}
              {formatDate(card.dueAt, false)}
              <span className="visually-hidden"> {DUE_TEXT[ds]}</span>
            </span>
          )}
          {b.description && (
            <span className="badge ci i-desc" title="This card has a description">
              <span className="visually-hidden">Has a description</span>
            </span>
          )}
          {b.comments > 0 && (
            <span className="badge ci i-comment" title={`${b.comments} comment${b.comments === 1 ? '' : 's'}`}>
              {b.comments}
              <span className="visually-hidden"> comments</span>
            </span>
          )}
          {b.attachments > 0 && (
            <span className="badge ci i-clip" aria-label={`${b.attachments} attachments`} title={`${b.attachments} attachment${b.attachments === 1 ? '' : 's'}`}>
              {b.attachments}
            </span>
          )}
          {b.checkItems > 0 && (
            <span className={`badge ci i-check ${b.checkItems === b.checkItemsChecked ? 'due-complete' : ''}`} title={`Checklist items: ${b.checkItemsChecked} of ${b.checkItems} done`}>
              {b.checkItemsChecked}/{b.checkItems}
            </span>
          )}
          {card.memberIds.length > 0 && (
            <span className="card-members">
              {card.memberIds.map((id) => (membersById[id] ? <Avatar key={id} user={membersById[id]} size={24} /> : null))}
            </span>
          )}
        </div>
      </div>
      {interactive && onAction && hot && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="card-edit-btn"
          title="Quick edit (e)"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            if (ref.current) onAction({ kind: 'quick', cardId: card.id, anchor: ref.current });
          }}
        >
          <Pencil size={14} />
        </button>
      )}
    </div>
  );
});

/**
 * Quick editor: rename the card in place and reach the common actions without opening it.
 * A title rename is base-checked like in the card dialog: a conflicting change asks first.
 */
export function QuickEdit({ card, anchor, view, onClose, onAction }: { card: Card; anchor: HTMLElement; view: CardView; onClose: () => void; onAction: (p: CardPop) => void }) {
  const { openCard, ingest, run } = useBoardActions();
  const { push } = useToasts();
  const isTop = useLayer();
  const [name, setName] = useState(card.name);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<null | { theirs: string; by: string }>(null);
  const base = useRef(card.name);
  const box = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState(() => anchor.getBoundingClientRect());
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const r = () => setRect(anchor.getBoundingClientRect());
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, [anchor]);
  useEffect(() => {
    const ta = box.current?.querySelector('textarea');
    ta?.focus();
    ta?.select();
    return () => {
      if (document.contains(anchor)) anchor.focus();
    };
  }, [anchor]);

  const save = async (against: string) => {
    const v = name.trim();
    if (!v || v === card.name) return closeRef.current();
    if (v.length > 512) return setError(`Card titles can be at most 512 characters (this one has ${v.length}).`);
    try {
      const r = await patch(`/cards/${card.id}`, { name: v, base: { name: against } });
      ingest(r.event);
      closeRef.current();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'version_conflict') setConflict({ theirs: e.details.current.name, by: e.details.updatedBy ?? 'Someone' });
      else setError((e as Error).message);
    }
  };
  // Pickers replace the quick editor and anchor to the card itself (the editor's buttons go away).
  const action = (kind: CardPopKind) => () => onAction({ kind, cardId: card.id, anchor });
  const narrow = window.innerWidth < 600;
  const left = narrow ? 8 : Math.min(rect.left, window.innerWidth - rect.width - 200);
  const top = narrow ? 64 : Math.max(8, Math.min(rect.top, window.innerHeight - 320));

  return createPortal(
    <div
      className="quick-edit-backdrop"
      onPointerDown={(e) => {
        // Clicking outside saves an edited title (nothing typed is thrown away); an unchanged one just closes.
        if (e.target === e.currentTarget && isTop()) save(base.current);
      }}
    >
      <div
        ref={box}
        className="quick-edit"
        role="dialog"
        aria-label={`Quick edit “${card.name}”`}
        style={{ left, top, width: narrow ? 'calc(100vw - 16px)' : undefined }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && isTop()) {
            e.stopPropagation();
            closeRef.current();
          }
        }}
      >
        <div className="quick-edit-card" style={{ width: narrow ? undefined : rect.width }}>
          <textarea
            aria-label="Card title"
            value={name}
            rows={3}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                save(base.current);
              }
            }}
          />
          {error && (
            <div className="field-error" role="alert">
              {error}
            </div>
          )}
          {conflict && (
            <div className="banner banner-warn" role="alert">
              <span>
                {conflict.by} renamed this card to “{conflict.theirs}” while you were editing.
              </span>
              <div className="row">
                <button type="button" className="btn btn-small btn-primary" onClick={() => save(conflict.theirs)}>
                  Keep mine
                </button>
                <button type="button" className="btn btn-small btn-light" onClick={() => closeRef.current()}>
                  Use theirs
                </button>
              </div>
            </div>
          )}
          <button type="button" className="btn btn-primary btn-small" onClick={() => save(base.current)}>
            Save
          </button>
        </div>
        <div className="quick-edit-actions">
          <button type="button" className="btn btn-dark" onClick={() => (closeRef.current(), openCard(card.number))}>
            <ArrowRight size={16} /> Open card
          </button>
          <button type="button" className="btn btn-dark" onClick={action('labels')}>
            <Tag size={16} /> Edit labels
          </button>
          <button type="button" className="btn btn-dark" onClick={action('members')}>
            <Users size={16} /> Change members
          </button>
          <button type="button" className="btn btn-dark" onClick={action('dates')}>
            <Clock size={16} /> Edit dates
          </button>
          <button type="button" className="btn btn-dark" onClick={action('move')}>
            <ArrowRight size={16} /> Move
          </button>
          {view.canEdit && (
            <button
              type="button"
              className="btn btn-dark"
              onClick={async () => {
                const r = await run(() => post(`/cards/${card.id}/archive`));
                if (!r) return;
                closeRef.current();
                push({ kind: 'info', text: `Archived “${card.name}”.`, action: { label: 'Undo', run: () => run(() => post(`/cards/${card.id}/restore`)) } });
              }}
            >
              <Archive size={16} /> Archive
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
