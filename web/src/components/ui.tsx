import type { ReactNode } from 'react';

export function Avatar({ user, size = 28, title }: { user: { fullName: string; initials: string; id?: string } | null | undefined; size?: number; title?: string }) {
  if (!user) return null;
  const hue = [...(user.id ?? user.fullName)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.4, background: `hsl(${hue} 45% 30%)` }}
      title={title ?? user.fullName}
      aria-label={title ?? user.fullName}
      role="img"
    >
      {user.initials}
    </span>
  );
}

export function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 32 32" width="24" height="24" aria-hidden="true">
        <rect width="32" height="32" rx="7" fill="#0f5e63" />
        <rect x="6" y="7" width="8" height="18" rx="2" fill="#f4c66b" />
        <rect x="18" y="7" width="8" height="11" rx="2" fill="#ffffff" />
      </svg>
      <span>Flowdeck</span>
    </span>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <span className="visually-hidden">{label}…</span>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export const LABEL_HUES = ['green', 'yellow', 'orange', 'red', 'purple', 'blue', 'sky', 'lime', 'pink', 'black'] as const;
/**
 * 30 label colours in palette-grid order for a 5-column grid: for each group of five hues, a row of
 * subtle shades, a row of normal shades and a row of bold shades.
 */
export const LABEL_COLORS = [LABEL_HUES.slice(0, 5), LABEL_HUES.slice(5)].flatMap((g) => [...g.map((h) => `${h}_subtle`), ...g, ...g.map((h) => `${h}_bold`)]);
const HUE_NAMES: Record<string, string> = { black: 'grey' };
/** Accessible colour name, e.g. "bold red", "subtle grey". */
export function colorName(c: string | null) {
  if (!c) return 'no colour';
  const [hue, shade] = c.split('_');
  return `${shade ? `${shade} ` : ''}${HUE_NAMES[hue] ?? hue}`;
}
export const BACKGROUNDS = ['ocean', 'forest', 'sunset', 'berry', 'slate', 'sand', 'teal', 'plum'] as const;

export function LabelChip({ label, showName = true }: { label: { name: string; color: string | null }; showName?: boolean }) {
  return (
    <span className={`label-chip label-${label.color ?? 'none'}`} title={label.name || label.color || 'label'}>
      {showName ? label.name || ' ' : ''}
      <span className="visually-hidden">{label.name ? `Label ${label.name}` : `${label.color} label`}</span>
    </span>
  );
}

export function dueState(dueAt: string | null, complete: boolean, now = Date.now()): 'none' | 'complete' | 'overdue-long' | 'overdue' | 'soon' | 'later' {
  if (!dueAt) return 'none';
  if (complete) return 'complete';
  const t = Date.parse(dueAt);
  if (t < now - 86_400_000) return 'overdue-long';
  if (t < now) return 'overdue';
  if (t < now + 86_400_000) return 'soon';
  return 'later';
}

export const DUE_TEXT: Record<string, string> = { complete: 'Complete', 'overdue-long': 'Overdue', overdue: 'Overdue', soon: 'Due soon', later: 'Due' };

export function formatDate(iso: string | null, withTime = true) {
  if (!iso) return '';
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }), ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}) });
}

export function timeAgo(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.round(s / 86400)} d ago`;
  return formatDate(iso, false);
}

export function bytes(n: number | null) {
  if (n === null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
