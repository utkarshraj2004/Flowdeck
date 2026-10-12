import { useAuth } from '../auth';
import { Avatar, LabelChip } from '../components/ui';
import { useBoard } from './context';
import type { Card } from './store';

export interface Filter {
  q: string;
  members: string[]; // user ids, or 'none'
  labels: string[]; // label ids, or 'none'
  due: '' | 'overdue' | 'day' | 'week' | 'month' | 'none';
  status: '' | 'complete' | 'incomplete';
  mode: 'any' | 'all';
}

export function filterFromParams(p: URLSearchParams): Filter {
  const list = (k: string) => (p.get(k) ?? '').split(',').filter(Boolean);
  return {
    q: p.get('q') ?? '',
    members: list('members'),
    labels: list('labels'),
    due: (p.get('due') as Filter['due']) ?? '',
    status: (p.get('status') as Filter['status']) ?? '',
    mode: p.get('mode') === 'all' ? 'all' : 'any',
  };
}

/** Within a category any selected value matches; across categories "any" or "all" (research J09.1). */
export function matchesFilter(c: Card, f: Filter, _meId: string, now = Date.now()): boolean {
  if (f.q && !c.name.toLowerCase().includes(f.q.toLowerCase())) return false;
  const checks: boolean[] = [];
  if (f.members.length) checks.push(f.members.some((m) => (m === 'none' ? c.memberIds.length === 0 : c.memberIds.includes(m))));
  if (f.labels.length) checks.push(f.labels.some((l) => (l === 'none' ? c.labelIds.length === 0 : c.labelIds.includes(l))));
  if (f.due) {
    const t = c.dueAt ? Date.parse(c.dueAt) : null;
    const within = (days: number) => t !== null && t >= now && t < now + days * 86_400_000;
    checks.push(
      f.due === 'none' ? t === null : f.due === 'overdue' ? t !== null && t < now && !c.dueComplete : within(f.due === 'day' ? 1 : f.due === 'week' ? 7 : 30),
    );
  }
  if (f.status) checks.push(f.status === 'complete' ? c.dueComplete : !c.dueComplete);
  if (!checks.length) return true;
  return f.mode === 'all' ? checks.every(Boolean) : checks.some(Boolean);
}

export function FilterPanel({ filter, setFilter, onClose }: { filter: Filter; setFilter: (f: Partial<Filter>) => void; onClose: () => void }) {
  const { state } = useBoard();
  const { me } = useAuth();
  const toggle = (key: 'members' | 'labels', id: string) =>
    setFilter({ [key]: filter[key].includes(id) ? filter[key].filter((x) => x !== id) : [...filter[key], id] } as Partial<Filter>);
  return (
    <section className="filter-panel" aria-label="Filter cards" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="row between">
        <h2>Filter</h2>
        <button className="icon-btn" aria-label="Close filter" onClick={onClose}>
          ×
        </button>
      </div>
      <label className="field">
        <span>Keyword</span>
        <input autoFocus value={filter.q} onChange={(e) => setFilter({ q: e.target.value })} placeholder="Card title contains…" />
      </label>
      <fieldset>
        <legend>Members</legend>
        <label className="row">
          <input type="checkbox" checked={filter.members.includes('none')} onChange={() => toggle('members', 'none')} /> No members
        </label>
        <label className="row">
          <input type="checkbox" checked={filter.members.includes(me!.id)} onChange={() => toggle('members', me!.id)} /> Cards assigned to me
        </label>
        {state.members
          .filter((m) => m.id !== me!.id)
          .map((m) => (
            <label key={m.id} className="row">
              <input type="checkbox" checked={filter.members.includes(m.id)} onChange={() => toggle('members', m.id)} /> <Avatar user={m} size={20} /> {m.fullName}
            </label>
          ))}
      </fieldset>
      <fieldset>
        <legend>Labels</legend>
        <label className="row">
          <input type="checkbox" checked={filter.labels.includes('none')} onChange={() => toggle('labels', 'none')} /> No labels
        </label>
        {state.labels.map((l) => (
          <label key={l.id} className="row">
            <input type="checkbox" checked={filter.labels.includes(l.id)} onChange={() => toggle('labels', l.id)} /> <LabelChip label={l} /> {!l.name && l.color}
          </label>
        ))}
      </fieldset>
      <label className="field">
        <span>Due date</span>
        <select value={filter.due} onChange={(e) => setFilter({ due: e.target.value as Filter['due'] })}>
          <option value="">Any</option>
          <option value="overdue">Overdue</option>
          <option value="day">Due in the next day</option>
          <option value="week">Due in the next week</option>
          <option value="month">Due in the next month</option>
          <option value="none">No due date</option>
        </select>
      </label>
      <label className="field">
        <span>Status</span>
        <select value={filter.status} onChange={(e) => setFilter({ status: e.target.value as Filter['status'] })}>
          <option value="">Any</option>
          <option value="complete">Marked complete</option>
          <option value="incomplete">Not complete</option>
        </select>
      </label>
      <label className="field">
        <span>Match</span>
        <select value={filter.mode} onChange={(e) => setFilter({ mode: e.target.value as Filter['mode'] })}>
          <option value="any">Any selected condition</option>
          <option value="all">All selected conditions</option>
        </select>
      </label>
    </section>
  );
}
