import { useMemo, useRef, useState } from 'react';
import { ApiError, patch, post } from '../api';
import { useToasts } from '../components/Toasts';
import { Avatar, colorName, DUE_TEXT, dueState, formatDate } from '../components/ui';
import { ChevronLeft, ChevronRight } from '../components/icons';
import { useBoard, useBoardActions } from './context';
import type { Card, List } from './store';

/**
 * Table and calendar views of the same board state as the lists: the same filter, permissions and live
 * updates (every change arrives as a board event). Edits send `base` values, so a concurrent change is
 * reported instead of being overwritten.
 */

interface ViewProps {
  lists: List[];
  colCards: Record<string, Card[]>;
}

function useSaveCard() {
  const { ingest, reload, openCard } = useBoardActions();
  const { push } = useToasts();
  const save = async (card: Card, changes: Record<string, unknown>, base: Record<string, unknown>) => {
    try {
      const r = await patch(`/cards/${card.id}`, { ...changes, base });
      ingest(r.event);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === 'version_conflict') {
        push({
          kind: 'error',
          text: `${e.details.updatedBy ?? 'Someone'} changed “${card.name}” at the same time. Their version is shown; yours was not saved.`,
        });
        reload();
      } else push({ kind: 'error', text: (e as Error).message });
      return false;
    }
  };
  return { save, openCard };
}

type SortKey = 'name' | 'list' | 'due' | 'members' | 'checklist';

export function TableView({ lists, colCards }: ViewProps) {
  const { state } = useBoard();
  const { run, ingest } = useBoardActions();
  const { save, openCard } = useSaveCard();
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: 'list',
    dir: 1,
  });
  const canEdit = state.access.can.edit;
  const listIndex = useMemo(() => Object.fromEntries(lists.map((l, i) => [l.id, i])), [lists]);
  const membersById = useMemo(() => Object.fromEntries(state.members.map((m) => [m.id, m])), [state.members]);
  const rows = useMemo(() => {
    const all = lists.flatMap((l) => colCards[l.id] ?? []);
    const val = (c: Card): string | number => {
      switch (sort.key) {
        case 'name':
          return c.name.toLowerCase();
        case 'list':
          return listIndex[c.listId] * 1e6 + (colCards[c.listId]?.indexOf(c) ?? 0);
        case 'due':
          return c.dueAt ? Date.parse(c.dueAt) : Number.MAX_SAFE_INTEGER;
        case 'members':
          return c.memberIds.length;
        case 'checklist':
          return c.badges.checkItems ? c.badges.checkItemsChecked / c.badges.checkItems : -1;
      }
    };
    return [...all].sort((a, b) => (val(a) < val(b) ? -sort.dir : val(a) > val(b) ? sort.dir : 0));
  }, [lists, colCards, sort, listIndex]);

  const header = (key: SortKey, label: string) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className="th-sort" onClick={() => setSort((s) => ({ key, dir: s.key === key ? (-s.dir as 1 | -1) : 1 }))}>
        {label}
        <span aria-hidden="true">{sort.key === key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</span>
      </button>
    </th>
  );

  return (
    <div className="table-view">
      <table className="cards-table">
        <caption className="visually-hidden">Cards on {state.board.name}. Column headers sort the table.</caption>
        <thead>
          <tr>
            {header('name', 'Card')}
            {header('list', 'List')}
            <th scope="col">Labels</th>
            {header('members', 'Members')}
            {header('due', 'Due')}
            {header('checklist', 'Checklist')}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No cards match.
              </td>
            </tr>
          )}
          {rows.map((c) => {
            const ds = dueState(c.dueAt, c.dueComplete);
            return (
              <tr key={c.id} data-row-card={c.id}>
                <td className="cell-title">
                  {canEdit ? <TitleCell card={c} onSave={(name) => save(c, { name }, { name: c.name })} /> : <span>{c.name}</span>}
                  <button type="button" className="btn btn-small btn-light" onClick={() => openCard(c.number)} aria-label={`Open card ${c.name}`}>
                    Open
                  </button>
                </td>
                <td>
                  {canEdit ? (
                    <select
                      aria-label={`List of ${c.name}`}
                      value={c.listId}
                      onChange={async (e) => {
                        const r: any = await run(() =>
                          post(`/cards/${c.id}/move`, {
                            listId: e.target.value,
                            position: 'bottom',
                          }),
                        );
                        if (r?.event) ingest(r.event);
                      }}
                    >
                      {lists.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    state.lists[c.listId]?.name
                  )}
                </td>
                <td>
                  <span className="table-labels">
                    {state.labels
                      .filter((l) => c.labelIds.includes(l.id))
                      .map((l) => (
                        <span key={l.id} className={`label-chip label-${l.color ?? 'none'}`}>
                          {l.name || colorName(l.color)}
                        </span>
                      ))}
                  </span>
                </td>
                <td>
                  <span className="card-members">
                    {c.memberIds.map((id) => (membersById[id] ? <Avatar key={id} user={membersById[id]} size={24} title={membersById[id].fullName} /> : null))}
                  </span>
                </td>
                <td>
                  {canEdit ? <DueCell card={c} onSave={(dueAt) => save(c, { dueAt }, { dueAt: c.dueAt })} /> : c.dueAt ? formatDate(c.dueAt) : ''}
                  {c.dueAt && <span className={`due-text due-${ds}`}> {DUE_TEXT[ds]}</span>}
                </td>
                <td>{c.badges.checkItems ? `${c.badges.checkItemsChecked}/${c.badges.checkItems}` : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TitleCell({ card, onSave }: { card: Card; onSave: (name: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = async () => {
    const name = (draft ?? '').trim();
    if (draft === null || !name || name === card.name) return setDraft(null);
    await onSave(name);
    setDraft(null);
  };
  return (
    <input
      className="cell-input"
      aria-label={`Title of ${card.name}`}
      value={draft ?? card.name}
      maxLength={512}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          e.stopPropagation();
          setDraft(null);
        }
      }}
    />
  );
}

const pad = (n: number) => String(n).padStart(2, '0');
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function DueCell({ card, onSave }: { card: Card; onSave: (dueAt: string | null) => Promise<boolean> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (card.dueAt ? toLocalInput(card.dueAt) : '');
  const commit = async () => {
    if (draft === null) return;
    const next = draft ? new Date(draft).toISOString() : null;
    setDraft(null);
    if ((next ?? null) !== (card.dueAt ? new Date(card.dueAt).toISOString() : null)) await onSave(next);
  };
  return <input className="cell-input" type="datetime-local" aria-label={`Due date of ${card.name}`} value={shown} onChange={(e) => setDraft(e.target.value)} onBlur={commit} />;
}

// ---- Calendar ----

const DAY = 86400_000;
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const startOfWeek = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // weeks start on Monday
  return x;
};
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(new Date(2024, 0, 1 + i)));
const monthTitle = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
});
const dayTitle = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  minute: '2-digit',
});

/** Same time of day on another date (keeps the card's due time when it is rescheduled). */
function moveToDay(iso: string, day: Date) {
  const old = new Date(iso);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), old.getHours(), old.getMinutes()).toISOString();
}

export function CalendarView({ lists, colCards }: ViewProps) {
  const { state } = useBoard();
  const { announce } = useBoardActions();
  const { save, openCard } = useSaveCard();
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [dropDay, setDropDay] = useState<string | null>(null);
  const dragged = useRef<string | null>(null);
  const canEdit = state.access.can.edit;

  const cards = useMemo(() => lists.flatMap((l) => colCards[l.id] ?? []), [lists, colCards]);
  const byDay = useMemo(() => {
    const m: Record<string, Card[]> = {};
    for (const c of cards) if (c.dueAt) (m[dayKey(new Date(c.dueAt))] ??= []).push(c);
    for (const k of Object.keys(m)) m[k].sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!));
    return m;
  }, [cards]);
  const undated = cards.filter((c) => !c.dueAt);

  const first = mode === 'month' ? startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1)) : startOfWeek(anchor);
  const days = Array.from({ length: mode === 'month' ? 42 : 7 }, (_, i) => addDays(first, i));
  const today = dayKey(new Date());
  const step = (n: number) => setAnchor((a) => (mode === 'month' ? new Date(a.getFullYear(), a.getMonth() + n, 1) : addDays(a, 7 * n)));
  const title = mode === 'month' ? monthTitle.format(anchor) : `${dayTitle.format(days[0])} – ${dayTitle.format(days[6])}`;

  const reschedule = async (card: Card, day: Date) => {
    if (!card.dueAt || dayKey(new Date(card.dueAt)) === dayKey(day)) return;
    const dueAt = moveToDay(card.dueAt, day);
    if (await save(card, { dueAt }, { dueAt: card.dueAt })) announce(`“${card.name}” is now due ${formatDate(dueAt)}.`);
  };

  return (
    <div className="calendar-view">
      <div className="calendar-toolbar">
        <button type="button" className="icon-btn on-dark" onClick={() => step(-1)} aria-label={mode === 'month' ? 'Previous month' : 'Previous week'}>
          <ChevronLeft size={18} />
        </button>
        <button type="button" className="btn btn-small btn-light" onClick={() => setAnchor(new Date())}>
          Today
        </button>
        <button type="button" className="icon-btn on-dark" onClick={() => step(1)} aria-label={mode === 'month' ? 'Next month' : 'Next week'}>
          <ChevronRight size={18} />
        </button>
        <h2 className="calendar-title" aria-live="polite">
          {title}
        </h2>
        <div className="segmented" role="group" aria-label="Calendar range">
          <button type="button" aria-pressed={mode === 'month'} onClick={() => setMode('month')}>
            Month
          </button>
          <button type="button" aria-pressed={mode === 'week'} onClick={() => setMode('week')}>
            Week
          </button>
        </div>
      </div>
      <div className="calendar-body">
        <div className={`calendar-grid ${mode}`} role="grid" aria-label={`Cards by due date, ${title}`}>
          <div role="row" className="calendar-weekdays">
            {WEEKDAYS.map((w) => (
              <div role="columnheader" key={w}>
                {w}
              </div>
            ))}
          </div>
          {Array.from({ length: days.length / 7 }, (_, w) => (
            <div role="row" className="calendar-week" key={w}>
              {days.slice(w * 7, w * 7 + 7).map((d) => {
                const k = dayKey(d);
                const items = byDay[k] ?? [];
                return (
                  <div
                    role="gridcell"
                    key={k}
                    aria-label={`${dayTitle.format(d)}, ${items.length} card${items.length === 1 ? '' : 's'}`}
                    className={`calendar-day ${mode === 'month' && d.getMonth() !== anchor.getMonth() ? 'other-month' : ''} ${k === today ? 'today' : ''} ${dropDay === k ? 'drop' : ''}`}
                    onDragOver={(e) => {
                      if (!canEdit || !dragged.current) return;
                      e.preventDefault();
                      setDropDay(k);
                    }}
                    onDragLeave={() => setDropDay((x) => (x === k ? null : x))}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDropDay(null);
                      const card = cards.find((c) => c.id === dragged.current);
                      dragged.current = null;
                      if (card) void reschedule(card, d);
                    }}
                  >
                    <span className="calendar-date" aria-hidden="true">
                      {d.getDate()}
                    </span>
                    {items.map((c) => (
                      <button
                        type="button"
                        key={c.id}
                        className={`calendar-card ${c.dueComplete ? 'is-complete' : ''} due-${dueState(c.dueAt, c.dueComplete)}`}
                        draggable={canEdit}
                        data-cal-card={c.id}
                        aria-keyshortcuts={canEdit ? 'Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown' : undefined}
                        aria-label={`${c.name}, due ${formatDate(c.dueAt)}${c.dueComplete ? ', complete' : ''}${canEdit ? '. Alt plus arrow keys move it by a day or a week.' : ''}`}
                        onDragStart={(e) => {
                          dragged.current = c.id;
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', c.name);
                        }}
                        onDragEnd={() => {
                          dragged.current = null;
                          setDropDay(null);
                        }}
                        onClick={() => openCard(c.number)}
                        onKeyDown={(e) => {
                          if (!canEdit || !e.altKey) return;
                          const delta = {
                            ArrowLeft: -1,
                            ArrowRight: 1,
                            ArrowUp: -7,
                            ArrowDown: 7,
                          }[e.key];
                          if (delta === undefined) return;
                          e.preventDefault();
                          void reschedule(c, addDays(new Date(c.dueAt!), delta)).then(() => {
                            requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-cal-card="${c.id}"]`)?.focus());
                          });
                        }}
                      >
                        <span className="calendar-time">{timeFmt.format(new Date(c.dueAt!))}</span> {c.name}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <section className="calendar-undated" aria-label="Cards without a due date">
          <h3>No due date ({undated.length})</h3>
          <ul>
            {undated.slice(0, 200).map((c) => (
              <li key={c.id}>
                <button type="button" className="link-btn" onClick={() => openCard(c.number)}>
                  {c.name}
                </button>{' '}
                <span className="muted small">{state.lists[c.listId]?.name}</span>
              </li>
            ))}
          </ul>
          {undated.length > 200 && <p className="muted small">Showing the first 200. Use the filter to narrow them down.</p>}
          {canEdit && <p className="muted small">Open a card to give it a due date. Drag a card to another day, or focus it and press Alt with an arrow key, to reschedule it.</p>}
        </section>
      </div>
    </div>
  );
}
