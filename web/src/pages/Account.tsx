import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { del, get, patch, post } from '../api';
import { useAuth } from '../auth';
import { useToasts } from '../components/Toasts';
import { formatDate } from '../components/ui';

/** Notification kinds a person can turn off, with plain-language descriptions (matches the server's mutable list). */
const NOTIFICATION_KINDS: { kind: string; title: string; desc: string }[] = [
  { kind: 'mentioned', title: 'Someone mentions you', desc: 'An @mention of you in a comment.' },
  { kind: 'commented', title: 'New comments', desc: 'Someone comments on a card you’re on or watching.' },
  { kind: 'added_to_card', title: 'You’re added to a card', desc: 'Someone makes you a member of a card.' },
  { kind: 'removed_from_card', title: 'You’re removed from a card', desc: 'Someone takes you off a card.' },
  { kind: 'due_changed', title: 'Dates change', desc: 'The start or due date changes on a card you’re on or watching.' },
  { kind: 'completed', title: 'Cards are marked complete', desc: 'A card you’re on or watching is marked complete.' },
  { kind: 'attachment_added', title: 'Files are attached', desc: 'Someone attaches a file or link to a card you’re on or watching.' },
  { kind: 'card_moved', title: 'Cards move', desc: 'A card you’re on or watching moves to another list.' },
  { kind: 'card_archived', title: 'Cards are archived', desc: 'A card you’re on or watching is archived.' },
  { kind: 'card_created', title: 'New cards on watched lists and boards', desc: 'Someone adds a card where you’re watching.' },
  { kind: 'invite_accepted', title: 'Your invitation is accepted', desc: 'Someone joins a workspace with an invitation you sent.' },
];

export function AccountPage() {
  const { me, setMe } = useAuth();
  const { push } = useToasts();
  const loc = useLocation();
  const [muted, setMuted] = useState<string[]>(me?.prefs.mutedNotifications ?? []);
  const [emailDigest, setEmailDigest] = useState<boolean>(!!me?.prefs.emailNotifications);
  const [emailEnabled, setEmailEnabled] = useState(false);
  useEffect(() => {
    get('/auth/options')
      .then((r) => setEmailEnabled(!!r.emailEnabled))
      .catch(() => setEmailEnabled(false));
  }, []);
  const [savingNotifs, setSavingNotifs] = useState(false);
  useEffect(() => {
    document.title = 'Account · Flowdeck';
  }, []);
  // Links such as "Notification settings" in the notifications drawer point at a section (#notifications).
  useEffect(() => {
    if (!loc.hash) return;
    const el = document.getElementById(decodeURIComponent(loc.hash.slice(1)));
    if (!el) return;
    el.scrollIntoView({ block: 'start' });
    el.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  }, [loc.hash]);
  if (!me) return null;
  return (
    <div className="page narrow stack">
      <h1>Account settings</h1>
      <form
        className="panel stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            const r = await patch('/me', { fullName: f.get('fullName'), prefs: { colorBlind: f.get('colorBlind') === 'on', shortcuts: f.get('shortcuts') === 'on', labelNames: f.get('labelNames') === 'on' } });
            setMe(r.user);
            push({ kind: 'success', text: 'Settings saved' });
          } catch (err) {
            push({ kind: 'error', text: (err as Error).message });
          }
        }}
      >
        <h2>Profile</h2>
        <p className="muted">
          @{me.username} · {me.email}
        </p>
        <label className="field">
          <span>Full name</span>
          <input name="fullName" defaultValue={me.fullName} required maxLength={100} />
        </label>
        <label className="row">
          <input type="checkbox" name="colorBlind" defaultChecked={me.prefs.colorBlind} /> Colour-blind friendly label patterns
        </label>
        <label className="row">
          <input type="checkbox" name="shortcuts" defaultChecked={me.prefs.shortcuts} /> Keyboard shortcuts
        </label>
        <label className="row">
          <input type="checkbox" name="labelNames" defaultChecked={!!me.prefs.labelNames} /> Show label names on cards
        </label>
        <button className="btn btn-primary">Save</button>
      </form>
      <form
        className="panel stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          try {
            await post('/me/password', { currentPassword: f.get('currentPassword'), newPassword: f.get('newPassword') });
            form.reset();
            push({ kind: 'success', text: 'Password changed. Other sessions were signed out.' });
          } catch (err) {
            push({ kind: 'error', text: (err as Error).message });
          }
        }}
      >
        <h2>Change password</h2>
        <label className="field">
          <span>Current password</span>
          <input name="currentPassword" type="password" required autoComplete="current-password" />
        </label>
        <label className="field">
          <span>New password (at least 12 characters)</span>
          <input name="newPassword" type="password" required minLength={12} autoComplete="new-password" />
        </label>
        <button className="btn btn-primary">Change password</button>
      </form>
      <Sessions />
      <form
        id="notifications"
        className="panel stack account-notifications"
        aria-labelledby="notifications-title"
        onSubmit={async (e) => {
          e.preventDefault();
          setSavingNotifs(true);
          try {
            const r = await patch('/me', { prefs: { mutedNotifications: muted, emailNotifications: emailDigest } });
            setMe(r.user);
            push({ kind: 'success', text: 'Notification settings saved' });
          } catch (err) {
            push({ kind: 'error', text: (err as Error).message });
          } finally {
            setSavingNotifs(false);
          }
        }}
      >
        <h2 id="notifications-title" tabIndex={-1}>
          Notifications
        </h2>
        <p className="muted small">Choose what Flowdeck tells you about. Unticked kinds are not delivered to you at all.</p>
        <label className="notif-kind">
          <input type="checkbox" checked={emailDigest} disabled={!emailEnabled} onChange={(e) => setEmailDigest(e.target.checked)} aria-describedby="email-digest-desc" />
          <span>
            <span className="notif-kind-title">Email me unread notifications</span>
            <span id="email-digest-desc" className="muted small">
              {emailEnabled
                ? ' One email listing notifications you have not read after a few minutes. Each one is emailed once.'
                : ' Email is not set up on this Flowdeck server; notifications stay in the app.'}
            </span>
          </span>
        </label>
        <fieldset className="notif-kinds">
          <legend className="visually-hidden">Notify me when</legend>
          {NOTIFICATION_KINDS.map(({ kind, title, desc }) => (
            <label key={kind} className="notif-kind">
              <input
                type="checkbox"
                checked={!muted.includes(kind)}
                onChange={(e) => setMuted((m) => (e.target.checked ? m.filter((k) => k !== kind) : [...m, kind]))}
                aria-describedby={`notif-kind-${kind}`}
              />
              <span>
                <span className="notif-kind-title">{title}</span>
                <span className="muted small" id={`notif-kind-${kind}`}>
                  {desc}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="muted small">Changes to your access — being added to or removed from a board, removed from a workspace, or your board role changing — are always delivered.</p>
        <button className="btn btn-primary" disabled={savingNotifs}>
          Save notification settings
        </button>
      </form>
    </div>
  );
}

interface SessionRow {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

/** Where this account is signed in; any other device can be signed out (its live connection closes too). */
function Sessions() {
  const { push } = useToasts();
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const load = () =>
    get('/me/sessions')
      .then((r) => setRows(r.sessions))
      .catch((e) => push({ kind: 'error', text: (e as Error).message }));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const signOut = async (id: string) => {
    try {
      const r = await del(`/me/sessions/${id}`);
      push({ kind: 'success', text: r.signedOut === 1 ? 'Device signed out' : `${r.signedOut} devices signed out` });
    } catch (e) {
      push({ kind: 'error', text: (e as Error).message });
    }
    load();
  };
  return (
    <section className="panel stack" aria-labelledby="sessions-title">
      <h2 id="sessions-title">Signed-in devices</h2>
      {!rows ? (
        <p aria-busy="true">Loading…</p>
      ) : (
        <ul className="session-list">
          {rows.map((s) => (
            <li key={s.id} className="row between wrap">
              <span>
                <strong>{describeAgent(s.userAgent)}</strong>
                {s.current && <span className="pill">This device</span>}
                <br />
                <span className="muted small">
                  Signed in {formatDate(s.createdAt)} · last active {formatDate(s.lastSeenAt)}
                </span>
              </span>
              {!s.current && (
                <button className="btn btn-small" onClick={() => signOut(s.id)}>
                  Sign out
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {rows && rows.length > 1 && (
        <button className="btn btn-light" onClick={() => signOut('others')}>
          Sign out all other devices
        </button>
      )}
    </section>
  );
}

function describeAgent(ua: string | null) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}
