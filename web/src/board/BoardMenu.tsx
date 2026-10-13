import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { del, get, patch, post, put } from '../api';
import { useAuth } from '../auth';
import { ConfirmDialog, Modal } from '../components/Modal';
import { Avatar, BACKGROUNDS, timeAgo } from '../components/ui';
import { Markdown } from '../components/Markdown';
import { useBoard } from './context';
import { describeActivity } from './store';

type View = 'main' | 'activity' | 'archived' | 'settings' | 'background' | 'about' | 'copy' | 'automation' | 'webhooks';

const AutomationPanel = lazy(() => import('./Automation').then((m) => ({ default: m.AutomationPanel })));
const WebhooksPanel = lazy(() => import('./Automation').then((m) => ({ default: m.WebhooksPanel })));

export function BoardMenu({ onClose }: { onClose: () => void }) {
  const { state, run, reload } = useBoard();
  const { me } = useAuth();
  const nav = useNavigate();
  const [view, setView] = useState<View>('main');
  const [confirm, setConfirm] = useState<null | { title: string; body: string; label: string; danger?: boolean; run: () => void }>(null);
  const { board, access } = state;
  const isMember = !!access.boardRole;
  const titles: Record<View, string> = { main: 'Board menu', activity: 'Activity', archived: 'Archived items', settings: 'Settings', background: 'Background', about: 'About this board', copy: 'Copy board', automation: 'Automation', webhooks: 'Webhooks' };

  return (
    <Modal title={titles[view]} onClose={onClose} className="drawer">
      <div className="modal-body stack">
        {view !== 'main' && (
          <button className="link-btn" onClick={() => setView('main')}>
            ← Back
          </button>
        )}
        {view === 'main' && (
          <nav className="menu-list" aria-label="Board menu">
            <button onClick={() => setView('about')}>About this board</button>
            <button onClick={() => setView('activity')}>Activity</button>
            <button onClick={() => setView('archived')}>Archived items</button>
            {access.can.admin && <button onClick={() => setView('settings')}>Settings</button>}
            <button onClick={() => setView('automation')}>Automation</button>
            {access.can.admin && <button onClick={() => setView('webhooks')}>Webhooks</button>}
            {access.can.edit && <button onClick={() => setView('background')}>Change background</button>}
            <button
              onClick={async () => {
                const watching = !board.watching;
                await run(() => (watching ? put : del)(`/boards/${board.id}/watch`), watching ? 'Watching this board: you’ll be notified of new cards' : 'Stopped watching');
                reload();
              }}
            >
              {board.watching ? 'Stop watching board' : 'Watch board'}
            </button>
            <button onClick={() => setView('copy')}>Copy board</button>
            <a href={`/api/v1/boards/${board.id}/export`} download>
              Export as JSON
            </a>
            {access.can.admin && !board.closedAt && (
              <button
                className="danger-text"
                onClick={() =>
                  setConfirm({
                    title: 'Close this board?',
                    body: 'The board becomes read-only and moves to the workspace’s closed boards. Admins can reopen it later.',
                    label: 'Close board',
                    run: () => run(() => post(`/boards/${board.id}/close`), 'Board closed'),
                  })
                }
              >
                Close board…
              </button>
            )}
            {access.can.admin && board.closedAt && (
              <button onClick={() => run(() => post(`/boards/${board.id}/reopen`), 'Board reopened')}>Reopen board</button>
            )}
            {access.can.admin && board.closedAt && (
              <button className="danger-text" onClick={() => nav(`/w/${board.workspaceId}?tab=closed`)}>
                Delete board… (from Closed boards)
              </button>
            )}
            {isMember && (
              <button
                className="danger-text"
                onClick={() =>
                  setConfirm({
                    title: 'Leave this board?',
                    body: 'You’ll be removed from the board and its cards.',
                    label: 'Leave board',
                    danger: true,
                    run: async () => {
                      const r = await run(() => del(`/boards/${board.id}/members/${me!.id}`));
                      if (r) nav('/');
                    },
                  })
                }
              >
                Leave board
              </button>
            )}
          </nav>
        )}
        {view === 'about' && <About />}
        {view === 'activity' && <Activity />}
        {view === 'archived' && <Archived />}
        {view === 'settings' && <Settings />}
        {(view === 'automation' || view === 'webhooks') && (
          <Suspense fallback={<p aria-busy="true">Loading…</p>}>{view === 'automation' ? <AutomationPanel /> : <WebhooksPanel />}</Suspense>
        )}
        {view === 'background' && (
          <div className="swatches big">
            {BACKGROUNDS.map((b) => (
              <button key={b} className={`swatch bg-${b} ${board.background === b ? 'selected' : ''}`} aria-label={b} aria-pressed={board.background === b} onClick={() => run(() => patch(`/boards/${board.id}`, { background: b }))} />
            ))}
          </div>
        )}
        {view === 'copy' && (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const r: any = await run(() => post('/boards', { workspaceId: board.workspaceId, name: f.get('name'), sourceBoardId: board.id, keepCards: f.get('keepCards') === 'on', background: board.background, visibility: board.visibility }));
              if (r) {
                onClose();
                nav(`/b/${r.board.shortId}`);
              }
            }}
          >
            <label className="field">
              <span>Title</span>
              <input name="name" defaultValue={`${board.name} (copy)`} maxLength={200} required />
            </label>
            <label className="row">
              <input type="checkbox" name="keepCards" defaultChecked /> Keep cards (with labels and checklists; not comments, members or attachments)
            </label>
            <button className="btn btn-primary">Create copy</button>
          </form>
        )}
      </div>
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.label}
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
        />
      )}
    </Modal>
  );
}

function About() {
  const { state, run } = useBoard();
  const [editing, setEditing] = useState(false);
  const { board, access } = state;
  return (
    <div className="stack">
      <h3>Board admins</h3>
      <ul className="rows">
        {state.members
          .filter((m) => m.role === 'admin')
          .map((m) => (
            <li key={m.id} className="row">
              <Avatar user={m} size={24} /> {m.fullName}
            </li>
          ))}
      </ul>
      <h3>Description</h3>
      {editing ? (
        <form
          className="stack"
          onSubmit={async (e) => {
            e.preventDefault();
            await run(() => patch(`/boards/${board.id}`, { description: new FormData(e.currentTarget).get('description') }));
            setEditing(false);
          }}
        >
          <textarea name="description" defaultValue={board.description} rows={6} maxLength={16384} autoFocus aria-label="Board description" onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setEditing(false))} />
          <div className="row">
            <button className="btn btn-primary btn-small">Save</button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          {board.description ? <Markdown source={board.description} /> : <p className="muted">No description.</p>}
          {access.can.admin && (
            <button className="btn btn-light btn-small" onClick={() => setEditing(true)}>
              Edit description
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Activity() {
  const { state } = useBoard();
  const [items, setItems] = useState<any[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'comments'>('all');
  const load = async (before?: number | null) => {
    const r = await get(`/boards/${state.board.id}/activity?limit=40${before ? `&before=${before}` : ''}${filter === 'comments' ? '&filter=comments' : ''}`);
    setItems((its) => (before ? [...its, ...r.items] : r.items));
    setNext(r.nextBefore);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);
  return (
    <div className="stack">
      <div className="tabs small" role="tablist">
        <button role="tab" aria-selected={filter === 'all'} className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          All
        </button>
        <button role="tab" aria-selected={filter === 'comments'} className={filter === 'comments' ? 'active' : ''} onClick={() => setFilter('comments')}>
          Comments
        </button>
      </div>
      <ul className="feed">
        {items.map((a) => (
          <li key={a.seq} className="feed-item activity">
            <Avatar user={a.actor ?? { fullName: 'Someone', initials: '?' }} size={24} />
            <div>
              <strong>{a.actor?.fullName ?? 'Someone'}</strong> {describeActivity(a)} <span className="muted small">{timeAgo(a.createdAt)}</span>
            </div>
          </li>
        ))}
        {items.length === 0 && <li className="muted">No activity yet.</li>}
      </ul>
      {next && (
        <button className="btn btn-light btn-small" onClick={() => load(next)}>
          Load more
        </button>
      )}
    </div>
  );
}

function Archived() {
  const { state, run } = useBoard();
  const [type, setType] = useState<'cards' | 'lists'>('cards');
  const [data, setData] = useState<{ cards: any[]; lists: any[] } | null>(null);
  const [confirm, setConfirm] = useState<any>(null);
  const load = () => get(`/boards/${state.board.id}/archived`).then(setData);
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const can = state.access.can.edit;
  const act = async (fn: () => Promise<any>, ok?: string) => {
    await run(fn, ok);
    load();
  };
  if (!data) return <p className="muted">Loading…</p>;
  return (
    <div className="stack">
      <div className="tabs small" role="tablist">
        <button role="tab" aria-selected={type === 'cards'} className={type === 'cards' ? 'active' : ''} onClick={() => setType('cards')}>
          Cards ({data.cards.length})
        </button>
        <button role="tab" aria-selected={type === 'lists'} className={type === 'lists' ? 'active' : ''} onClick={() => setType('lists')}>
          Lists ({data.lists.length})
        </button>
      </div>
      <ul className="rows">
        {type === 'cards' &&
          data.cards.map((c) => (
            <li key={c.id} className="row between wrap">
              <span>
                {c.name} <span className="muted small">in {c.listName}</span>
              </span>
              {can && (
                <span className="row">
                  <button className="btn btn-small btn-light" onClick={() => act(() => post(`/cards/${c.id}/restore`), 'Card restored')}>
                    Restore
                  </button>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={() => setConfirm({ title: `Delete “${c.name}”?`, body: 'The card and all its activity will be permanently deleted. There is no undo.', run: () => act(() => del(`/cards/${c.id}`), 'Card deleted') })}
                  >
                    Delete
                  </button>
                </span>
              )}
            </li>
          ))}
        {type === 'lists' &&
          data.lists.map((l) => (
            <li key={l.id} className="row between wrap">
              <span>{l.name}</span>
              {can && (
                <span className="row">
                  <button className="btn btn-small btn-light" onClick={() => act(() => post(`/lists/${l.id}/restore`), 'List restored')}>
                    Restore
                  </button>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={() =>
                      setConfirm({ title: `Delete list “${l.name}”?`, body: 'The list and every card in it will be permanently deleted. There is no undo.', run: () => act(() => del(`/lists/${l.id}`), 'List deleted') })
                    }
                  >
                    Delete
                  </button>
                </span>
              )}
            </li>
          ))}
        {((type === 'cards' && !data.cards.length) || (type === 'lists' && !data.lists.length)) && <li className="muted">Nothing archived.</li>}
      </ul>
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          confirmLabel="Delete permanently"
          danger
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            confirm.run();
            setConfirm(null);
          }}
        />
      )}
    </div>
  );
}

function Settings() {
  const { state, run } = useBoard();
  const { board } = state;
  const save = (body: unknown) => run(() => patch(`/boards/${board.id}`, body), 'Settings saved');
  return (
    <div className="stack">
      <label className="field">
        <span>Visibility</span>
        <select value={board.visibility} onChange={(e) => save({ visibility: e.target.value })}>
          <option value="workspace">Workspace — all workspace members can see it</option>
          <option value="private">Private — only board members (and workspace admins)</option>
        </select>
      </label>
      <label className="field">
        <span>Who can comment</span>
        <select value={board.prefs.comments} onChange={(e) => save({ prefs: { comments: e.target.value } })}>
          <option value="disabled">Nobody</option>
          <option value="members">Board admins and members</option>
          <option value="observers">Members and observers</option>
          <option value="workspace">Anyone in the workspace who can see the board</option>
        </select>
      </label>
      <label className="field">
        <span>Who can add people to the board</span>
        <select value={board.prefs.invitations} onChange={(e) => save({ prefs: { invitations: e.target.value } })}>
          <option value="admins">Admins only</option>
          <option value="members">Admins and members</option>
        </select>
      </label>
      <label className="row">
        <input type="checkbox" checked={board.prefs.selfJoin} onChange={(e) => save({ prefs: { selfJoin: e.target.checked } })} /> Workspace members can join this board themselves
      </label>
      <label className="row">
        <input type="checkbox" checked={board.prefs.cardCovers !== false} onChange={(e) => save({ prefs: { cardCovers: e.target.checked } })} /> Show image covers on cards
      </label>
      <label className="row">
        <input type="checkbox" checked={!!board.isTemplate} onChange={(e) => save({ isTemplate: e.target.checked })} /> Use this board as a template (offered in “Create board”)
      </label>
    </div>
  );
}
