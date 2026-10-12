import { Suspense, useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { get, post } from '../api';
import { realtime, type ConnStatus } from '../realtime';
import { Avatar, Logo, Spinner, timeAgo } from './ui';
import { loadBoardPage } from '../board/lazy';
import { useToasts } from './Toasts';
import { Modal } from './Modal';
import { ShortcutHelp, isTypingTarget } from './Shortcuts';

export function Shell() {
  const { me, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [menu, setMenu] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const [help, setHelp] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const status = useConnStatus();
  // Fetch the board screen in the background so opening a board does not wait for its code.
  useEffect(() => {
    const t = window.setTimeout(() => void loadBoardPage(), 500);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal')) return;
      if (me?.prefs.shortcuts === false) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'b') {
        e.preventDefault();
        setSwitcher(true);
      } else if (e.key === '?') {
        e.preventDefault();
        setHelp(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [me?.prefs.shortcuts]);

  useEffect(() => setMenu(false), [loc.pathname]);

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Flowdeck home">
          <Logo />
        </Link>
        <button className="btn btn-ghost hide-sm" onClick={() => setSwitcher(true)} aria-keyshortcuts="b">
          Boards
        </button>
        <form
          className="search-form"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const q = searchRef.current!.value.trim();
            if (q) nav(`/search?q=${encodeURIComponent(q)}`);
          }}
        >
          <label className="visually-hidden" htmlFor="global-search">
            Search cards
          </label>
          <input id="global-search" ref={searchRef} type="search" placeholder="Search  ( / )" defaultValue={new URLSearchParams(loc.search).get('q') ?? ''} key={loc.pathname} />
        </form>
        <Notifications />
        <div className="menu-wrap">
          <button className="avatar-btn" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu((m) => !m)} aria-label="Account menu">
            <Avatar user={me} size={32} />
          </button>
          {menu && (
            <div className="menu" role="menu" onKeyDown={(e) => e.key === 'Escape' && setMenu(false)}>
              <div className="menu-head">
                <strong>{me?.fullName}</strong>
                <span className="muted">@{me?.username}</span>
              </div>
              <Link role="menuitem" to="/account">
                Account settings
              </Link>
              {me?.isSystemAdmin && (
                <Link role="menuitem" to="/admin">
                  Administration
                </Link>
              )}
              <button role="menuitem" onClick={() => setHelp(true)}>
                Keyboard shortcuts
              </button>
              <button
                role="menuitem"
                onClick={async () => {
                  await logout();
                  nav('/login');
                }}
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </header>
      {status === 'offline' && <OfflineBanner />}
      <main id="main" tabIndex={-1}>
        <Suspense fallback={<Spinner label="Loading" />}>
          <Outlet />
        </Suspense>
      </main>
      {switcher && <BoardSwitcher onClose={() => setSwitcher(false)} />}
      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
    </div>
  );
}

export function useConnStatus() {
  const [status, setStatus] = useState<ConnStatus>(realtime.status);
  useEffect(() => {
    setStatus(realtime.status);
    const off = realtime.onStatus(setStatus);
    return () => {
      off();
    };
  }, []);
  return status;
}

function OfflineBanner() {
  const [show, setShow] = useState(false);
  const { push } = useToasts();
  useEffect(() => {
    const t = window.setTimeout(() => setShow(true), 4000);
    const off = realtime.onStatus((s) => {
      if (s === 'online') push({ kind: 'success', text: 'Back online. Your board is up to date.' });
    });
    return () => {
      window.clearTimeout(t);
      off();
    };
  }, [push]);
  if (!show) return null;
  return (
    <div className="offline-banner" role="alert">
      Connection to Flowdeck lost. Changes can’t be saved until it reconnects — retrying automatically.
    </div>
  );
}

const NOTIFICATION_TEXT: Record<string, (n: any) => string> = {
  mentioned: (n) => `mentioned you on “${n.data.cardName}”`,
  commented: (n) => `commented on “${n.data.cardName}”`,
  added_to_card: (n) => `added you to “${n.data.cardName}”`,
  removed_from_card: (n) => `removed you from “${n.data.cardName}”`,
  due_changed: (n) => `changed the dates on “${n.data.cardName}”`,
  completed: (n) => `marked “${n.data.cardName}” complete`,
  attachment_added: (n) => `attached ${n.data.attachmentName} to “${n.data.cardName}”`,
  card_created: (n) => `added “${n.data.cardName}” to ${n.data.listName}`,
  card_moved: (n) => `moved “${n.data.cardName}” to ${n.data.listName}`,
  card_archived: (n) => `archived “${n.data.cardName}”`,
  added_to_board: (n) => `added you to the board ${n.data.boardName}`,
  removed_from_board: () => `removed you from a board`,
  role_changed: (n) => `changed your board role to ${n.data.role}`,
  removed_from_workspace: (n) => `removed you from the workspace ${n.data.workspaceName}`,
  invite_accepted: (n) => `joined ${n.data.workspaceName} with your invitation`,
};

function Notifications() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<any[] | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const nav = useNavigate();

  const load = () =>
    get(`/notifications${onlyUnread ? '?unread=true' : ''}`).then((r) => {
      setItems(r.items);
      setUnread(r.unread);
    });

  useEffect(() => {
    get('/notifications?unread=true').then((r) => setUnread(r.unread)).catch(() => undefined);
    const off = realtime.onUserMessage((m) => {
      if (m.type === 'notification') {
        setUnread((u) => u + 1);
        setItems((its) => (its ? [{ ...m.notification, board: null }, ...its] : its));
      } else if (m.type === 'notifications.unread') setUnread(m.unread);
    });
    return () => {
      off();
    };
  }, []);

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onlyUnread]);

  // Group per card, newest first (research 02, S18).
  const groups: { key: string; items: any[] }[] = [];
  for (const n of items ?? []) {
    const key = n.cardId ?? n.id;
    const g = groups.find((x) => x.key === key);
    if (g) g.items.push(n);
    else groups.push({ key, items: [n] });
  }

  return (
    <div className="menu-wrap">
      <button className="icon-btn bell" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3a1.5 1.5 0 0 0-3 0v1.16A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z" />
        </svg>
        {unread > 0 && <span className="badge-count" data-testid="unread-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="menu notifications" role="dialog" aria-label="Notifications" onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
          <div className="row between">
            <strong>Notifications</strong>
            <label className="row small">
              <input type="checkbox" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /> Only unread
            </label>
          </div>
          <button
            className="btn btn-small btn-light"
            onClick={async () => {
              const r = await post('/notifications/read', { all: true });
              setUnread(r.unread);
              load();
            }}
          >
            Mark all as read
          </button>
          {items === null ? (
            <p className="muted">Loading…</p>
          ) : groups.length === 0 ? (
            <p className="muted">You’re all caught up.</p>
          ) : (
            <ul className="notif-list">
              {groups.map((g) => (
                <li key={g.key} className="notif-group">
                  {g.items.map((n) => (
                    <button
                      key={n.id}
                      className={`notif ${n.readAt ? '' : 'unread'}`}
                      onClick={async () => {
                        if (!n.readAt) post('/notifications/read', { ids: [n.id] }).then((r) => setUnread(r.unread));
                        setOpen(false);
                        if (n.board?.shortId && n.cardNumber) nav(`/b/${n.board.shortId}/c/${n.cardNumber}`);
                        else if (n.board?.shortId) nav(`/b/${n.board.shortId}`);
                        else if (n.boardId) nav(`/b/${n.boardId}`);
                      }}
                    >
                      <Avatar user={n.actor} size={24} />
                      <span>
                        <strong>{n.actor?.fullName ?? 'Someone'}</strong> {(NOTIFICATION_TEXT[n.kind] ?? (() => n.kind))(n)}
                        {n.data.excerpt && <span className="notif-excerpt">{n.data.excerpt}</span>}
                        <span className="muted small"> · {timeAgo(n.createdAt)}</span>
                      </span>
                    </button>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function BoardSwitcher({ onClose }: { onClose: () => void }) {
  const [boards, setBoards] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const nav = useNavigate();
  useEffect(() => {
    get('/me/home').then((r) => setBoards(r.boards.filter((b: any) => !b.closedAt)));
  }, []);
  const shown = boards
    .filter((b) => b.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.starred) - Number(a.starred) || a.name.localeCompare(b.name));
  return (
    <Modal title="Switch board" onClose={onClose} className="modal-small">
      <form
        className="modal-body stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (shown[0]) {
            onClose();
            nav(`/b/${shown[0].shortId}`);
          }
        }}
      >
        <input aria-label="Filter boards" placeholder="Type to filter…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <ul className="switcher-list">
          {shown.map((b) => (
            <li key={b.id}>
              <Link to={`/b/${b.shortId}`} onClick={onClose} className={`switcher-item bg-${b.background}`}>
                {b.starred ? '★ ' : ''}
                {b.name}
              </Link>
            </li>
          ))}
          {!shown.length && <li className="muted">No boards match.</li>}
        </ul>
      </form>
    </Modal>
  );
}
