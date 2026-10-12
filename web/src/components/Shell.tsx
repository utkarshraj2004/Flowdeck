import { Suspense, useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { get, post } from '../api';
import { realtime, type ConnStatus } from '../realtime';
import { Avatar, Logo, Spinner, timeAgo } from './ui';
import { loadBoardPage } from '../board/lazy';
import { useToasts } from './Toasts';
import { Modal } from './Modal';
import { MenuItems, Popover, useLayer, usePopover } from './Popover';
import { ShortcutHelp, isTypingTarget } from './Shortcuts';
import { CreateBoardDialog } from './CreateBoard';
import { Bell, Building2, CheckCheck, CircleHelp, Keyboard, LogOut, Mail, MailOpen, Plus, Search, Settings, ShieldCheck, SquareKanban, Star, X } from './icons';

type ShellPopover = 'create' | 'account';
interface CreateBoardState {
  workspaces: { id: string; name: string; settings?: any }[];
  templates: { id: string; name: string; background: string; workspaceId: string }[];
}

export function Shell() {
  const { me, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const pop = usePopover<ShellPopover>();
  const [switcher, setSwitcher] = useState(false);
  const [help, setHelp] = useState(false);
  const [createBoard, setCreateBoard] = useState<CreateBoardState | null>(null);
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

  const closePopover = pop.close;
  useEffect(() => closePopover(), [loc.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar shell-topbar">
        <Link to="/" className="brand" aria-label="Flowdeck home">
          <Logo />
        </Link>
        <button className="btn btn-ghost shell-btn" onClick={() => setSwitcher(true)} aria-keyshortcuts="b">
          <SquareKanban size={18} aria-hidden="true" />
          <span className="shell-label">Boards</span>
        </button>
        <button className="btn shell-create" aria-label="Create board or workspace" aria-haspopup="dialog" aria-expanded={pop.is('create')} onClick={pop.toggle('create')}>
          <Plus size={18} aria-hidden="true" />
          <span className="shell-label">Create</span>
        </button>
        <GlobalSearch inputRef={searchRef} />
        <button className="icon-btn shell-icon-btn shell-help" aria-label="Keyboard shortcuts" aria-keyshortcuts="?" onClick={() => setHelp(true)}>
          <CircleHelp size={20} aria-hidden="true" />
        </button>
        <Notifications />
        <button className="avatar-btn shell-avatar" aria-haspopup="dialog" aria-expanded={pop.is('account')} onClick={pop.toggle('account')} aria-label="Account menu">
          <Avatar user={me} size={32} />
        </button>
      </header>
      {pop.is('create') && (
        <CreateMenu
          anchor={pop.anchor}
          onClose={pop.close}
          onBoard={(state) => {
            // Focus the opener first so the dialog returns focus there when it closes.
            pop.anchor?.focus();
            pop.close();
            setCreateBoard(state);
          }}
        />
      )}
      {pop.is('account') && (
        <Popover anchor={pop.anchor} title="Account" onClose={pop.close} width={260}>
          <div className="shell-account-head">
            <Avatar user={me} size={36} />
            <span className="grow">
              <strong>{me?.fullName}</strong>
              <span className="muted small">@{me?.username}</span>
            </span>
          </div>
          <MenuItems label="Account">
            <button
              role="menuitem"
              onClick={() => {
                pop.close();
                nav('/account');
              }}
            >
              <Settings size={16} aria-hidden="true" /> Account settings
            </button>
            {me?.isSystemAdmin && (
              <button
                role="menuitem"
                onClick={() => {
                  pop.close();
                  nav('/admin');
                }}
              >
                <ShieldCheck size={16} aria-hidden="true" /> Administration
              </button>
            )}
            <button
              role="menuitem"
              onClick={() => {
                pop.anchor?.focus();
                pop.close();
                setHelp(true);
              }}
            >
              <Keyboard size={16} aria-hidden="true" /> Keyboard shortcuts
            </button>
            <hr />
            <button
              role="menuitem"
              onClick={async () => {
                pop.close();
                await logout();
                nav('/login');
              }}
            >
              <LogOut size={16} aria-hidden="true" /> Log out
            </button>
          </MenuItems>
        </Popover>
      )}
      {status === 'offline' && <OfflineBanner />}
      <main id="main" tabIndex={-1}>
        <Suspense fallback={<Spinner label="Loading" />}>
          <Outlet />
        </Suspense>
      </main>
      {switcher && <BoardSwitcher onClose={() => setSwitcher(false)} />}
      {help && <ShortcutHelp onClose={() => setHelp(false)} />}
      {createBoard && <CreateBoardDialog workspaces={createBoard.workspaces} templates={createBoard.templates} onClose={() => setCreateBoard(null)} />}
    </div>
  );
}

/** "Create" popover: a board (opens the create-board dialog) or a workspace (name form in the popover). */
function CreateMenu({ anchor, onClose, onBoard }: { anchor: HTMLElement | null; onClose: () => void; onBoard: (s: CreateBoardState) => void }) {
  const nav = useNavigate();
  const [step, setStep] = useState<'menu' | 'workspace'>('menu');
  const [needsWorkspace, setNeedsWorkspace] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState('');

  const startBoard = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await get('/me/home');
      if (!r.workspaces.length) {
        setNeedsWorkspace(true);
        setStep('workspace');
        return;
      }
      onBoard({ workspaces: r.workspaces, templates: r.boards.filter((b: any) => b.isTemplate && !b.closedAt) });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (step === 'workspace')
    return (
      <Popover anchor={anchor} title="Create workspace" onClose={onClose} onBack={() => setStep('menu')}>
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              const r = await post('/workspaces', { name: name.trim() });
              onClose();
              nav(`/w/${r.workspace.id}`);
            } catch (err) {
              setError((err as Error).message);
              setBusy(false);
            }
          }}
        >
          {needsWorkspace && <p className="muted small">Boards live in a workspace. Create one first, then add boards to it.</p>}
          <label className="field">
            <span>Workspace name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} data-autofocus />
          </label>
          <p className="muted small">A workspace groups boards and the people who work on them.</p>
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          <button className="btn btn-primary" disabled={!name.trim() || busy}>
            Create workspace
          </button>
        </form>
      </Popover>
    );

  return (
    <Popover anchor={anchor} title="Create" onClose={onClose} width={300}>
      <MenuItems label="Create">
        <button role="menuitem" className="shell-create-item" onClick={startBoard} disabled={busy} aria-describedby="create-board-desc">
          <SquareKanban size={20} aria-hidden="true" />
          <span>
            Board
            <span className="menu-desc" id="create-board-desc">
              Lists and cards for one project or process, blank or from a template.
            </span>
          </span>
        </button>
        <button
          role="menuitem"
          className="shell-create-item"
          aria-describedby="create-ws-desc"
          onClick={() => {
            setNeedsWorkspace(false);
            setStep('workspace');
          }}
        >
          <Building2 size={20} aria-hidden="true" />
          <span>
            Workspace
            <span className="menu-desc" id="create-ws-desc">
              A home for related boards and the team that shares them.
            </span>
          </span>
        </button>
      </MenuItems>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
    </Popover>
  );
}

const SEARCH_DEBOUNCE_MS = 200;
const SEARCH_MIN_CHARS = 2;
const SEARCH_MAX_CARDS = 5;
const SEARCH_MAX_BOARDS = 3;
interface SearchOption {
  id: string;
  href: string;
  label: string;
  detail?: string;
  kind: 'card' | 'board' | 'all';
  background?: string;
}

/** Top-bar search with a live suggestion list (combobox pattern). Enter without a selection opens the full results page. */
function GlobalSearch({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  const nav = useNavigate();
  const loc = useLocation();
  const urlQ = new URLSearchParams(loc.search).get('q') ?? '';
  const [q, setQ] = useState(urlQ);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [fetched, setFetched] = useState<{ term: string; cards: any[]; boards: any[]; failed?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Like before: the field shows the current page's query and resets when the page changes.
  useEffect(() => {
    setQ(urlQ);
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.pathname]);

  const term = q.trim();
  // Results are kept while the list is closed, so Esc then Arrow Down reopens them without a new request.
  useEffect(() => {
    if (term.length < SEARCH_MIN_CHARS) {
      setFetched(null);
      setLoading(false);
      return;
    }
    if (!open || fetched?.term === term) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = window.setTimeout(() => {
      get(`/search?q=${encodeURIComponent(term)}`)
        .then((r) => !cancelled && setFetched({ term, cards: r.cards.slice(0, SEARCH_MAX_CARDS), boards: r.boards.slice(0, SEARCH_MAX_BOARDS) }))
        .catch(() => !cancelled && setFetched({ term, cards: [], boards: [], failed: true }))
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
            setActive(-1);
          }
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, open]);
  // While a new query loads, keep showing the previous results instead of flashing an empty list.
  const res = fetched && (fetched.term === term || loading) ? fetched : null;

  const cardOptions: SearchOption[] = (res?.cards ?? []).map((c) => ({
    id: `gs-card-${c.id}`,
    kind: 'card',
    href: `/b/${c.board.shortId}/c/${c.number}`,
    label: c.name,
    detail: `${c.listName} · ${c.board.name}${c.archivedAt ? ' · archived' : ''}`,
  }));
  const boardOptions: SearchOption[] = (res?.boards ?? []).map((b) => ({ id: `gs-board-${b.id}`, kind: 'board', href: `/b/${b.shortId}`, label: b.name, background: b.background }));
  const allOption: SearchOption = { id: 'gs-all', kind: 'all', href: `/search?q=${encodeURIComponent(term)}`, label: `See all results for “${term}”` };
  const options = res ? [...cardOptions, ...boardOptions, allOption] : [];
  const showList = open && term.length >= SEARCH_MIN_CHARS && (res !== null || loading);

  const go = (href: string) => {
    setOpen(false);
    inputRef.current?.blur();
    nav(href);
  };

  const status = !showList ? '' : loading && !res ? 'Searching…' : res?.failed ? 'Search is unavailable right now.' : `${res!.cards.length} cards and ${res!.boards.length} boards found.`;

  const renderOption = (o: SearchOption) => {
    const i = options.indexOf(o);
    return (
      <div
        key={o.id}
        id={o.id}
        role="option"
        aria-selected={i === active}
        className={`gs-option gs-${o.kind} ${i === active ? 'active' : ''}`}
        // Keep focus in the field so the list does not close before the click lands.
        onMouseDown={(e) => e.preventDefault()}
        onMouseMove={() => setActive(i)}
        onClick={() => go(o.href)}
      >
        {o.kind === 'board' && <span className={`gs-swatch bg-${o.background}`} aria-hidden="true" />}
        {o.kind === 'all' && <Search size={16} aria-hidden="true" />}
        <span className="gs-text">
          <span className="gs-label">{o.label}</span>
          {o.detail && <span className="gs-detail">{o.detail}</span>}
        </span>
      </div>
    );
  };

  return (
    <div
      className="search-form shell-search"
      role="search"
      ref={wrapRef}
      onBlur={(e) => {
        if (!wrapRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (active >= 0 && options[active]) return go(options[active].href);
          if (term) go(`/search?q=${encodeURIComponent(term)}`);
        }}
      >
        <label className="visually-hidden" htmlFor="global-search">
          Search cards
        </label>
        <Search size={16} className="shell-search-icon" aria-hidden="true" />
        <input
          id="global-search"
          ref={inputRef}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls="global-search-results"
          aria-activedescendant={showList && active >= 0 ? options[active]?.id : undefined}
          autoComplete="off"
          placeholder="Search  ( / )"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => q.trim().length >= SEARCH_MIN_CHARS && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && open) {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setActive(-1);
            } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && term.length >= SEARCH_MIN_CHARS) {
              e.preventDefault();
              setOpen(true);
              if (!options.length) return;
              const step = e.key === 'ArrowDown' ? 1 : -1;
              setActive((a) => (a < 0 && step < 0 ? options.length - 1 : (a + step + options.length) % options.length));
            }
          }}
        />
      </form>
      <span className="visually-hidden" role="status">
        {status}
      </span>
      {showList && (
        <div id="global-search-results" role="listbox" aria-label="Search suggestions" className="gs-panel">
          {loading && !res && <p className="gs-empty">Searching…</p>}
          {res?.failed && <p className="gs-empty">Search is unavailable right now. Press Enter to try the full search page.</p>}
          {cardOptions.length > 0 && (
            <div role="group" aria-label="Cards">
              <div className="gs-heading" aria-hidden="true">
                Cards
              </div>
              {cardOptions.map(renderOption)}
            </div>
          )}
          {boardOptions.length > 0 && (
            <div role="group" aria-label="Boards">
              <div className="gs-heading" aria-hidden="true">
                Boards
              </div>
              {boardOptions.map(renderOption)}
            </div>
          )}
          {res && !res.failed && !cardOptions.length && !boardOptions.length && <p className="gs-empty">No cards or boards match yet.</p>}
          {res && renderOption(allOption)}
        </div>
      )}
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
  const bellRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    get('/notifications?unread=true')
      .then((r) => setUnread(r.unread))
      .catch(() => undefined);
    const off = realtime.onUserMessage((m) => {
      if (m.type === 'notification') setUnread((u) => u + 1);
      else if (m.type === 'notifications.unread') setUnread(m.unread);
    });
    return () => {
      off();
    };
  }, []);

  return (
    <>
      <button
        ref={bellRef}
        className="icon-btn shell-icon-btn bell"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        aria-controls={open ? 'notifications-drawer' : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={20} aria-hidden="true" />
        {unread > 0 && (
          <span className="badge-count" data-testid="unread-count">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && <NotificationsDrawer bell={bellRef} unread={unread} setUnread={setUnread} onClose={() => setOpen(false)} />}
    </>
  );
}

function NotificationsDrawer({ bell, unread, setUnread, onClose }: { bell: RefObject<HTMLButtonElement | null>; unread: number; setUnread: (n: number) => void; onClose: () => void }) {
  const [items, setItems] = useState<any[] | null>(null);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const isTop = useLayer();
  const nav = useNavigate();
  const { push } = useToasts();

  const load = () =>
    get(`/notifications${onlyUnread ? '?unread=true' : ''}`)
      .then((r) => {
        setItems(r.items);
        setUnread(r.unread);
        setError('');
      })
      .catch((err) => setError((err as Error).message));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyUnread]);

  // New notifications arrive live while the drawer is open.
  useEffect(() => {
    const off = realtime.onUserMessage((m) => {
      if (m.type === 'notification') setItems((its) => (its ? [{ ...m.notification, board: null }, ...its] : its));
    });
    return () => {
      off();
    };
  }, []);

  // Focus moves in on open and back to the bell on close; a click outside closes it.
  useEffect(() => {
    const el = ref.current!;
    el.querySelector<HTMLElement>('h2')?.focus();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!isTop() || el.contains(t) || bell.current?.contains(t)) return;
      closeRef.current();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      const active = document.activeElement;
      if (bell.current && (!active || active === document.body || el.contains(active))) bell.current.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleRead = async (n: any) => {
    const read = !n.readAt;
    try {
      const r = await post('/notifications/read', { ids: [n.id], read });
      setUnread(r.unread);
      setItems((its) => its?.map((x) => (x.id === n.id ? { ...x, readAt: read ? new Date().toISOString() : null } : x)) ?? its);
    } catch (err) {
      push({ kind: 'error', text: (err as Error).message });
    }
  };

  // Group per card, newest first (research 02, S18).
  const groups: { key: string; items: any[] }[] = [];
  for (const n of items ?? []) {
    const key = n.cardId ?? n.id;
    const g = groups.find((x) => x.key === key);
    if (g) g.items.push(n);
    else groups.push({ key, items: [n] });
  }

  return createPortal(
    <div
      ref={ref}
      id="notifications-drawer"
      className="notif-drawer"
      role="dialog"
      aria-labelledby="notif-drawer-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && isTop()) {
          e.preventDefault();
          e.stopPropagation();
          closeRef.current();
        }
      }}
    >
      <div className="notif-drawer-head">
        <h2 id="notif-drawer-title" tabIndex={-1}>
          Notifications
        </h2>
        <button className="icon-btn" aria-label="Close notifications" onClick={() => closeRef.current()}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="notif-drawer-tools">
        <label className="row small notif-switch">
          <input type="checkbox" role="switch" checked={onlyUnread} onChange={(e) => setOnlyUnread(e.target.checked)} /> Only show unread
        </label>
        <button
          className="btn btn-small btn-light"
          disabled={unread === 0}
          onClick={async () => {
            try {
              const r = await post('/notifications/read', { all: true });
              setUnread(r.unread);
              load();
            } catch (err) {
              push({ kind: 'error', text: (err as Error).message });
            }
          }}
        >
          <CheckCheck size={16} aria-hidden="true" /> Mark all as read
        </button>
      </div>
      <div className="notif-drawer-body">
        {error ? (
          <div className="alert" role="alert">
            {error}{' '}
            <button className="link-btn" onClick={load}>
              Try again
            </button>
          </div>
        ) : items === null ? (
          <p className="muted">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="muted notif-empty">{onlyUnread ? 'No unread notifications. You’re all caught up.' : 'You’re all caught up.'}</p>
        ) : (
          <ul className="notif-list">
            {groups.map((g) => (
              <li key={g.key} className="notif-group">
                {g.items.map((n) => (
                  <div key={n.id} className={`notif-row ${n.readAt ? '' : 'unread'}`}>
                    <button
                      className={`notif ${n.readAt ? '' : 'unread'}`}
                      onClick={async () => {
                        if (!n.readAt)
                          post('/notifications/read', { ids: [n.id] })
                            .then((r) => setUnread(r.unread))
                            .catch(() => undefined);
                        closeRef.current();
                        if (n.board?.shortId && n.cardNumber) nav(`/b/${n.board.shortId}/c/${n.cardNumber}`);
                        else if (n.board?.shortId) nav(`/b/${n.board.shortId}`);
                        else if (n.boardId) nav(`/b/${n.boardId}`);
                      }}
                    >
                      <Avatar user={n.actor} size={28} />
                      <span id={`notif-text-${n.id}`}>
                        {!n.readAt && <span className="visually-hidden">Unread: </span>}
                        <strong>{n.actor?.fullName ?? 'Someone'}</strong> {(NOTIFICATION_TEXT[n.kind] ?? (() => n.kind))(n)}
                        {n.data.excerpt && <span className="notif-excerpt">{n.data.excerpt}</span>}
                        <span className="notif-meta">
                          {n.board?.name ? `${n.board.name} · ` : ''}
                          {timeAgo(n.createdAt)}
                        </span>
                      </span>
                    </button>
                    <button className="icon-btn notif-toggle" aria-label={n.readAt ? 'Mark unread' : 'Mark read'} aria-describedby={`notif-text-${n.id}`} title={n.readAt ? 'Mark unread' : 'Mark read'} onClick={() => toggleRead(n)}>
                      {n.readAt ? <Mail size={16} aria-hidden="true" /> : <MailOpen size={16} aria-hidden="true" />}
                    </button>
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="notif-drawer-foot">
        <Link to="/account#notifications" onClick={() => closeRef.current()}>
          <Settings size={16} aria-hidden="true" /> Notification settings
        </Link>
      </div>
    </div>,
    document.body,
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
    <Modal title="Switch board" onClose={onClose} className="modal-small" initialFocus="#board-switcher-filter">
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
        <input id="board-switcher-filter" aria-label="Filter boards" placeholder="Type to filter…" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="switcher-list">
          {shown.map((b) => (
            <li key={b.id}>
              <Link to={`/b/${b.shortId}`} onClick={onClose} className={`switcher-item bg-${b.background}`}>
                {b.starred && (
                  <>
                    <Star size={14} fill="currentColor" aria-hidden="true" /> <span className="visually-hidden">Starred: </span>
                  </>
                )}
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
