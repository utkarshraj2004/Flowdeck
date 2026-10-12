import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, del, get, patch, post, put } from '../api';
import { useAuth } from '../auth';
import { ConfirmDialog } from '../components/Modal';
import { Popover } from '../components/Popover';
import { Check, Pencil } from '../components/icons';
import { useToasts } from '../components/Toasts';
import { Avatar, colorName, formatDate, LABEL_COLORS, LabelChip } from '../components/ui';
import { useBoard } from './context';
import type { Card } from './store';

/** The card fields the pickers read; both the board's card front and the dialog's detail have them. */
export type CardLike = Pick<Card, 'id' | 'name' | 'number' | 'listId' | 'labelIds' | 'memberIds' | 'startAt' | 'dueAt' | 'dueComplete' | 'cover'>;
interface PickerProps {
  card: CardLike;
  anchor: HTMLElement | null;
  onClose: () => void;
}

/** Toggle a value in a card array optimistically; a failed request reloads the board (rollback). */
function useToggle() {
  const { patchCard, run, reload } = useBoard();
  return (card: CardLike, field: 'labelIds' | 'memberIds', id: string, path: string) => {
    const on = card[field].includes(id);
    patchCard(card.id, (c) => ({ ...c, [field]: on ? c[field].filter((x) => x !== id) : [...c[field], id] }));
    run(() => (on ? del : put)(path)).then((r) => {
      if (r === undefined) reload();
    });
  };
}

// ---------------------------------------------------------------- labels

export function LabelsPicker({ card, anchor, onClose }: PickerProps) {
  const { state, run } = useBoard();
  const { me, setMe } = useAuth();
  const toggle = useToggle();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<null | { id: string | null; name: string; color: string | null }>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canEdit = state.access.can.edit;
  const shown = state.labels.filter((l) => !q || l.name.toLowerCase().includes(q.toLowerCase()) || colorName(l.color).includes(q.toLowerCase()));

  if (editing)
    return (
      <Popover key="edit" anchor={anchor} title={editing.id ? 'Edit label' : 'Create label'} onClose={onClose} onBack={() => setEditing(null)}>
        <div className="label-preview">
          <LabelChip label={{ name: editing.name, color: editing.color }} />
        </div>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            const body = { name: editing.name.trim(), color: editing.color };
            if (!body.name && !body.color) return;
            if (editing.id) await run(() => patch(`/labels/${editing.id}`, body));
            else {
              const r: any = await run(() => post(`/boards/${state.board.id}/labels`, body));
              if (r?.label && !card.labelIds.includes(r.label.id)) toggle(card, 'labelIds', r.label.id, `/cards/${card.id}/labels/${r.label.id}`);
            }
            setEditing(null);
          }}
        >
          <label className="field">
            <span>Title</span>
            <input value={editing.name} maxLength={100} data-autofocus onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          </label>
          <span className="popover-section-title" id="label-colour-title">
            Select a colour
          </span>
          <div className="palette" role="radiogroup" aria-labelledby="label-colour-title">
            {LABEL_COLORS.map((c) => (
              <button
                type="button"
                key={c}
                role="radio"
                aria-checked={editing.color === c}
                aria-label={colorName(c)}
                title={colorName(c)}
                className={`swatch label-${c}`}
                onClick={() => setEditing({ ...editing, color: c })}
              >
                {editing.color === c && <Check size={14} />}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-light btn-small" disabled={editing.color === null} onClick={() => setEditing({ ...editing, color: null })}>
            Remove colour
          </button>
          {editing.color === null && <p className="muted small">Labels without a colour show only in the card dialog, not on the card front.</p>}
          <div className="row between">
            <button className="btn btn-primary btn-small" disabled={!editing.name.trim() && !editing.color}>
              {editing.id ? 'Save' : 'Create'}
            </button>
            {editing.id && (
              <button type="button" className="btn btn-danger btn-small" onClick={() => setConfirmDelete(true)}>
                Delete
              </button>
            )}
          </div>
        </form>
        {confirmDelete && editing.id && (
          <ConfirmDialog
            title="Delete this label?"
            body="It will be removed from every card on this board. There is no undo."
            confirmLabel="Delete label"
            danger
            onCancel={() => setConfirmDelete(false)}
            onConfirm={async () => {
              setConfirmDelete(false);
              const r = await run(() => del(`/labels/${editing.id}`));
              if (r) setEditing(null);
            }}
          />
        )}
      </Popover>
    );

  return (
    <Popover key="list" anchor={anchor} title="Labels" onClose={onClose}>
      <input type="search" aria-label="Search labels" placeholder="Search labels…" value={q} onChange={(e) => setQ(e.target.value)} data-autofocus />
      <span className="popover-section-title">Labels</span>
      <ul className="picker-list" aria-label="Board labels">
        {shown.map((l) => {
          const on = card.labelIds.includes(l.id);
          return (
            <li key={l.id} className="label-row">
              <label className="label-row-main">
                <input type="checkbox" checked={on} disabled={!canEdit} onChange={() => toggle(card, 'labelIds', l.id, `/cards/${card.id}/labels/${l.id}`)} />
                <LabelChip label={l} />
                <span className="visually-hidden">{on ? 'applied' : ''}</span>
              </label>
              {canEdit && (
                <button type="button" className="icon-btn" aria-label={`Edit label ${l.name || colorName(l.color)}`} onClick={() => setEditing({ id: l.id, name: l.name, color: l.color })}>
                  <Pencil size={14} />
                </button>
              )}
            </li>
          );
        })}
        {!shown.length && <li className="muted small">No labels match.</li>}
      </ul>
      {canEdit && (
        <button type="button" className="btn btn-light btn-small" onClick={() => setEditing({ id: null, name: q, color: 'green' })}>
          Create a new label
        </button>
      )}
      <button
        type="button"
        className="btn btn-light btn-small"
        aria-pressed={!!me?.prefs.colorBlind}
        onClick={async () => {
          const r = await run(() => patch('/me', { prefs: { colorBlind: !me?.prefs.colorBlind } }));
          if (r) setMe((r as any).user);
        }}
      >
        {me?.prefs.colorBlind ? 'Turn off colour-blind patterns' : 'Turn on colour-blind patterns'}
      </button>
    </Popover>
  );
}

// ---------------------------------------------------------------- members

export function MembersPicker({ card, anchor, onClose }: PickerProps) {
  const { state } = useBoard();
  const toggle = useToggle();
  const [q, setQ] = useState('');
  const shown = state.members.filter((m) => !q || m.fullName.toLowerCase().includes(q.toLowerCase()) || m.username.includes(q.toLowerCase()));
  const onCard = shown.filter((m) => card.memberIds.includes(m.id));
  const others = shown.filter((m) => !card.memberIds.includes(m.id) && m.role !== 'observer');
  const row = (m: (typeof shown)[number]) => {
    const on = card.memberIds.includes(m.id);
    return (
      <li key={m.id}>
        <button type="button" className="picker-row" aria-pressed={on} onClick={() => toggle(card, 'memberIds', m.id, `/cards/${card.id}/members/${m.id}`)}>
          <Avatar user={m} size={28} />
          <span className="grow">
            {m.fullName} <span className="muted small">@{m.username}</span>
          </span>
          {on && <Check size={16} aria-label="on this card" />}
        </button>
      </li>
    );
  };
  return (
    <Popover anchor={anchor} title="Members" onClose={onClose}>
      <input type="search" aria-label="Search members" placeholder="Search members…" value={q} onChange={(e) => setQ(e.target.value)} data-autofocus />
      {onCard.length > 0 && (
        <>
          <span className="popover-section-title">Card members</span>
          <ul className="picker-list">{onCard.map(row)}</ul>
        </>
      )}
      <span className="popover-section-title">Board members</span>
      <ul className="picker-list">{others.length ? others.map(row) : <li className="muted small">No other members{q ? ' match' : ''}.</li>}</ul>
    </Popover>
  );
}

// ---------------------------------------------------------------- dates

const pad = (n: number) => String(n).padStart(2, '0');
const localDate = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const localTime = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function DatesPicker({ card, anchor, onClose }: PickerProps) {
  const { ingest, patchCard } = useBoard();
  const tomorrow = new Date(Date.now() + 86_400_000);
  tomorrow.setHours(12, 0, 0, 0);
  const [hasStart, setHasStart] = useState(!!card.startAt);
  const [hasDue, setHasDue] = useState(true);
  const [start, setStart] = useState(localDate(card.startAt) || localDate(new Date().toISOString()));
  const [dueDate, setDueDate] = useState(localDate(card.dueAt ?? tomorrow.toISOString()));
  const [dueTime, setDueTime] = useState(localTime(card.dueAt ?? tomorrow.toISOString()));
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<null | { by: string; startAt: string | null; dueAt: string | null }>(null);
  const base = useMemo(() => ({ startAt: card.startAt, dueAt: card.dueAt }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (values: { startAt: string | null; dueAt: string | null }, against: { startAt: string | null; dueAt: string | null }) => {
    setError('');
    if (values.startAt && values.dueAt && values.startAt > values.dueAt) return setError('The start date must be before the due date.');
    try {
      const r = await patch(`/cards/${card.id}`, { ...values, base: against });
      ingest(r.event);
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'version_conflict')
        setConflict({ by: e.details.updatedBy ?? 'Someone', startAt: e.details.current.startAt, dueAt: e.details.current.dueAt });
      else setError((e as Error).message);
    }
  };
  const values = () => ({
    startAt: hasStart && start ? new Date(`${start}T00:00`).toISOString() : null,
    dueAt: hasDue && dueDate ? new Date(`${dueDate}T${dueTime || '12:00'}`).toISOString() : null,
  });

  return (
    <Popover anchor={anchor} title="Dates" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save(values(), base);
        }}
      >
        <fieldset className="date-field">
          <legend>
            <label className="row">
              <input type="checkbox" checked={hasStart} onChange={(e) => setHasStart(e.target.checked)} /> Start date
            </label>
          </legend>
          <input type="date" aria-label="Start date" value={start} disabled={!hasStart} onChange={(e) => setStart(e.target.value)} />
        </fieldset>
        <fieldset className="date-field">
          <legend>
            <label className="row">
              <input type="checkbox" checked={hasDue} onChange={(e) => setHasDue(e.target.checked)} /> Due date
            </label>
          </legend>
          <div className="row">
            <input type="date" aria-label="Due date" value={dueDate} disabled={!hasDue} onChange={(e) => setDueDate(e.target.value)} data-autofocus />
            <input type="time" aria-label="Due time" value={dueTime} disabled={!hasDue} onChange={(e) => setDueTime(e.target.value)} />
          </div>
        </fieldset>
        {error && (
          <div className="field-error" role="alert">
            {error}
          </div>
        )}
        {conflict && (
          <div className="banner banner-warn" role="alert">
            <span>
              {conflict.by} changed the dates while you were editing (now: {conflict.startAt ? `start ${formatDate(conflict.startAt, false)}, ` : ''}
              {conflict.dueAt ? `due ${formatDate(conflict.dueAt)}` : 'no due date'}).
            </span>
            <div className="row">
              <button type="button" className="btn btn-primary btn-small" onClick={() => save(values(), { startAt: conflict.startAt, dueAt: conflict.dueAt })}>
                Keep mine
              </button>
              <button
                type="button"
                className="btn btn-light btn-small"
                onClick={() => {
                  patchCard(card.id, (c) => ({ ...c, startAt: conflict.startAt, dueAt: conflict.dueAt }));
                  onClose();
                }}
              >
                Keep theirs
              </button>
            </div>
          </div>
        )}
        <button className="btn btn-primary btn-small">Save</button>
        {(card.startAt || card.dueAt) && (
          <button type="button" className="btn btn-light btn-small" onClick={() => save({ startAt: null, dueAt: null }, base)}>
            Remove dates
          </button>
        )}
      </form>
    </Popover>
  );
}

// ---------------------------------------------------------------- move / copy

type Dest = { boards: any[]; boardId: string; lists: any[]; cards: any[] };

function useDestination(card: CardLike) {
  const { state } = useBoard();
  const [d, setD] = useState<Dest>({ boards: [{ id: state.board.id, name: state.board.name, shortId: state.board.shortId }], boardId: state.board.id, lists: [], cards: [] });
  const [listId, setListId] = useState(card.listId);
  useEffect(() => {
    get('/me/home').then((r) => setD((x) => ({ ...x, boards: r.boards.filter((b: any) => !b.closedAt && (b.role === 'admin' || b.role === 'member')) })));
  }, []);
  useEffect(() => {
    if (d.boardId === state.board.id) {
      const lists = Object.values(state.lists)
        .filter((l) => !l.archivedAt)
        .sort((a, b) => (a.position < b.position ? -1 : 1));
      setD((x) => ({ ...x, lists, cards: Object.values(state.cards).filter((c) => !c.archivedAt) }));
      setListId((cur) => (lists.some((l) => l.id === cur) ? cur : lists[0]?.id));
    } else
      get(`/boards/${d.boardId}`).then((s) => {
        setD((x) => ({ ...x, lists: s.lists, cards: s.cards }));
        setListId((cur) => (s.lists.some((l: any) => l.id === cur) ? cur : s.lists[0]?.id));
      });
    // The current board's lists and cards are read once per board choice; positions refresh on reopen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d.boardId]);
  const inList = d.cards.filter((c) => c.listId === listId && c.id !== card.id).sort((a, b) => (a.position < b.position ? -1 : 1));
  return { ...d, setBoardId: (boardId: string) => setD((x) => ({ ...x, boardId })), listId, setListId, inList };
}

function DestinationFields({ dest, pos, setPos }: { dest: ReturnType<typeof useDestination>; pos: string; setPos: (p: string) => void }) {
  return (
    <>
      <label className="field">
        <span>Board</span>
        <select aria-label="Destination board" value={dest.boardId} onChange={(e) => dest.setBoardId(e.target.value)}>
          {dest.boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <div className="row">
        <label className="field grow">
          <span>List</span>
          <select aria-label="Destination list" value={dest.listId} onChange={(e) => dest.setListId(e.target.value)}>
            {dest.lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field grow">
          <span>Position</span>
          <select aria-label="Position in list" value={pos} onChange={(e) => setPos(e.target.value)}>
            <option value="top">1 (top)</option>
            {dest.inList.map((c, i) => (
              <option key={c.id} value={c.id}>
                {i + 2} (after “{c.name.length > 24 ? `${c.name.slice(0, 24)}…` : c.name}”)
              </option>
            ))}
            <option value="bottom">Bottom</option>
          </select>
        </label>
      </div>
    </>
  );
}

const placement = (pos: string) => (pos === 'bottom' ? 'bottom' : { afterId: pos === 'top' ? null : pos });

export function MoveCardPicker({ card, anchor, onClose, onMoved }: PickerProps & { onMoved?: (path?: string) => void }) {
  const { state, run } = useBoard();
  const { push } = useToasts();
  const dest = useDestination(card);
  const [pos, setPos] = useState('bottom');
  return (
    <Popover anchor={anchor} title="Move card" onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const fromList = state.lists[card.listId];
          const r: any = await run(() => post(`/cards/${card.id}/move`, { listId: dest.listId, position: placement(pos) }));
          if (!r) return;
          const b = dest.boards.find((x) => x.id === dest.boardId);
          const other = dest.boardId !== state.board.id;
          if (!other && fromList && fromList.id !== dest.listId)
            push({
              kind: 'info',
              text: `Moved “${card.name}” to ${state.lists[dest.listId]?.name ?? 'another list'}.`,
              action: { label: 'Undo', run: () => run(() => post(`/cards/${card.id}/move`, { listId: fromList.id, position: 'bottom' })) },
            });
          onClose();
          onMoved?.(other && b ? `/b/${b.shortId}/c/${r.card.number}` : undefined);
        }}
      >
        <DestinationFields dest={dest} pos={pos} setPos={setPos} />
        {dest.boardId !== state.board.id && <p className="muted small">Members who aren’t on the target board are removed from the card; labels are matched by name and colour.</p>}
        <button className="btn btn-primary btn-small">Move</button>
      </form>
    </Popover>
  );
}

export function CopyCardPicker({ card, anchor, onClose, counts }: PickerProps & { counts: { checklists: number; attachments: number; comments: number } }) {
  const { state, run } = useBoard();
  const nav = useNavigate();
  const dest = useDestination(card);
  const [pos, setPos] = useState('bottom');
  const [name, setName] = useState(card.name);
  const keepOptions: [string, string, number][] = [
    ['checklists', 'Checklists', counts.checklists],
    ['labels', 'Labels', card.labelIds.length],
    ['members', 'Members', card.memberIds.length],
    ['attachments', 'Attachments', counts.attachments],
    ['comments', 'Comments', counts.comments],
  ];
  return (
    <Popover anchor={anchor} title="Copy card" onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const keep = keepOptions.map(([k]) => k).filter((k) => f.get(k) === 'on');
          const r: any = await run(() => post(`/cards/${card.id}/copy`, { listId: dest.listId, position: placement(pos), name, keep }), 'Card copied');
          if (!r) return;
          onClose();
          const b = dest.boards.find((x) => x.id === dest.boardId);
          nav(`/b/${b?.shortId ?? state.board.shortId}/c/${r.card.number}`);
        }}
      >
        <label className="field">
          <span>Title</span>
          <textarea value={name} rows={2} maxLength={512} required onChange={(e) => setName(e.target.value)} data-autofocus />
        </label>
        <fieldset className="keep-fields">
          <legend>Keep…</legend>
          {keepOptions
            .filter(([, , n]) => n > 0)
            .map(([k, l, n]) => (
              <label key={k} className="row">
                <input type="checkbox" name={k} defaultChecked={k !== 'comments'} /> {l} ({n})
              </label>
            ))}
          {keepOptions.every(([, , n]) => n === 0) && <p className="muted small">Nothing else to copy.</p>}
        </fieldset>
        <DestinationFields dest={dest} pos={pos} setPos={setPos} />
        <button className="btn btn-primary btn-small">Create card</button>
      </form>
    </Popover>
  );
}

// ---------------------------------------------------------------- cover, checklist, attachment

export function CoverPicker({ card, anchor, onClose, images }: PickerProps & { images: { id: string; url: string; name: string }[] }) {
  const { run, patchCard, reload } = useBoard();
  const setCover = (cover: CardLike['cover']) => {
    patchCard(card.id, (c) => ({ ...c, cover }));
    run(() => patch(`/cards/${card.id}`, { cover })).then((r) => {
      if (r === undefined) reload();
    });
  };
  return (
    <Popover anchor={anchor} title="Cover" onClose={onClose}>
      <span className="popover-section-title" id="cover-colours">
        Colours
      </span>
      <div className="palette" role="radiogroup" aria-labelledby="cover-colours">
        {LABEL_COLORS.map((c) => (
          <button
            type="button"
            key={c}
            role="radio"
            aria-checked={card.cover?.color === c}
            aria-label={colorName(c)}
            title={colorName(c)}
            className={`swatch label-${c}`}
            onClick={() => setCover({ color: c })}
          >
            {card.cover?.color === c && <Check size={14} />}
          </button>
        ))}
      </div>
      {images.length > 0 && (
        <>
          <span className="popover-section-title">Attached images</span>
          <div className="cover-images">
            {images.map((a) => (
              <button
                type="button"
                key={a.id}
                aria-pressed={card.cover?.attachmentId === a.id}
                aria-label={`Use ${a.name} as cover`}
                className="cover-image-btn"
                onClick={() => setCover({ attachmentId: a.id })}
              >
                <img src={a.url} alt="" />
              </button>
            ))}
          </div>
        </>
      )}
      {card.cover && (
        <button type="button" className="btn btn-light btn-small" onClick={() => setCover(null)}>
          Remove cover
        </button>
      )}
    </Popover>
  );
}

export function ChecklistPicker({ card, anchor, onClose }: PickerProps) {
  const { run } = useBoard();
  return (
    <Popover anchor={anchor} title="Add checklist" onClose={onClose}>
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run(() => post(`/cards/${card.id}/checklists`, { name: new FormData(e.currentTarget).get('name') }));
          if (r) onClose();
        }}
      >
        <label className="field">
          <span>Title</span>
          <input name="name" defaultValue="Checklist" maxLength={200} required data-autofocus />
        </label>
        <button className="btn btn-primary btn-small">Add</button>
      </form>
    </Popover>
  );
}

export function AttachmentPicker({ card, anchor, onClose, upload }: PickerProps & { upload: (files: FileList | File[]) => Promise<void> }) {
  const { run } = useBoard();
  return (
    <Popover anchor={anchor} title="Attach" onClose={onClose}>
      <label className="field">
        <span>Upload a file from your computer</span>
        <input type="file" multiple onChange={(e) => e.target.files?.length && upload(e.target.files).then(onClose)} />
      </label>
      <p className="muted small">You can also drop files onto the open card or paste them.</p>
      <hr className="sep" />
      <form
        className="stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const r = await run(() => post(`/cards/${card.id}/attachments`, { url: f.get('url'), name: f.get('name') || undefined }));
          if (r) onClose();
        }}
      >
        <label className="field">
          <span>Search or paste a link</span>
          <input name="url" type="url" placeholder="https://…" required data-autofocus />
        </label>
        <label className="field">
          <span>Display text (optional)</span>
          <input name="name" maxLength={256} />
        </label>
        <button className="btn btn-primary btn-small">Attach link</button>
      </form>
    </Popover>
  );
}
