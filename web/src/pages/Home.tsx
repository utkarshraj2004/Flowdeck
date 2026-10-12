import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, post } from '../api';
import { CreateBoardDialog } from '../components/CreateBoard';
import { Modal } from '../components/Modal';
import { Spinner } from '../components/ui';
import { useToasts } from '../components/Toasts';
import { Clock, LayoutTemplate, Lock, Star } from '../components/icons';

const RECENT_KEY = 'fd:recentBoards';
const RECENT_MAX = 4;

export function BoardTile({ b }: { b: any }) {
  return (
    <Link to={`/b/${b.shortId}`} className={`board-tile bg-${b.background}`}>
      <span className="board-tile-name">{b.name}</span>
      <span className="board-tile-meta">
        {b.starred && (
          <span className="tile-badge" title="Starred">
            <Star size={14} fill="currentColor" aria-hidden="true" />
            <span className="visually-hidden">Starred</span>
          </span>
        )}
        {b.visibility === 'private' && (
          <span className="tile-badge">
            <Lock size={13} aria-hidden="true" /> Private
          </span>
        )}
        {b.isTemplate && <span className="tile-badge tile-template">Template</span>}
      </span>
    </Link>
  );
}

/** Boards the board page recorded as recently opened; anything unreadable counts as "none". */
function readRecentBoards(): { shortId: string; at: number }[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x): x is { shortId: string; at?: unknown } => !!x && typeof x === 'object' && typeof (x as any).shortId === 'string')
      .map((x) => ({ shortId: x.shortId, at: typeof x.at === 'number' ? x.at : Date.parse(String(x.at)) || 0 }));
  } catch {
    return [];
  }
}

export function HomePage() {
  const [data, setData] = useState<any>(null);
  const [creating, setCreating] = useState<{ workspaceId?: string; templateId?: string } | null>(null);
  const [newWs, setNewWs] = useState(false);
  const [recentIds] = useState(readRecentBoards);
  const nav = useNavigate();
  const { push } = useToasts();
  const load = () => get('/me/home').then(setData);
  useEffect(() => {
    load();
    document.title = 'Boards · Flowdeck';
  }, []);
  if (!data) return <Spinner />;
  const open = data.boards.filter((b: any) => !b.closedAt);
  const starred = open.filter((b: any) => b.starred);
  const templates = open.filter((b: any) => b.isTemplate);
  const recent: any[] = [];
  for (const r of [...recentIds].sort((a, b) => b.at - a.at)) {
    const b = open.find((x: any) => x.shortId === r.shortId);
    if (b && !recent.includes(b)) recent.push(b);
    if (recent.length === RECENT_MAX) break;
  }
  const canCreate = data.workspaces.length > 0;
  const memberOf = (wsId: string) => data.workspaces.some((w: any) => w.id === wsId);
  return (
    <div className="page">
      {recent.length > 0 && (
        <section aria-labelledby="home-recent">
          <h2 id="home-recent" className="home-heading">
            <Clock size={18} aria-hidden="true" /> Recently viewed
          </h2>
          <div className="board-grid">
            {recent.map((b) => (
              <BoardTile key={b.id} b={b} />
            ))}
          </div>
        </section>
      )}
      {starred.length > 0 && (
        <section aria-labelledby="home-starred">
          <h2 id="home-starred" className="home-heading">
            <Star size={18} aria-hidden="true" /> Starred boards
          </h2>
          <div className="board-grid">
            {starred.map((b: any) => (
              <BoardTile key={b.id} b={b} />
            ))}
          </div>
        </section>
      )}
      {templates.length > 0 && (
        <section aria-labelledby="home-templates">
          <h2 id="home-templates" className="home-heading">
            <LayoutTemplate size={18} aria-hidden="true" /> Templates
          </h2>
          <p className="muted small">Start a new board with a template’s lists, labels and cards already in place.</p>
          <div className="board-grid">
            {templates.map((b: any) => (
              <div key={b.id} className="template-tile">
                <BoardTile b={b} />
                {canCreate && (
                  <button className="btn btn-light btn-small" aria-label={`Use template ${b.name}`} onClick={() => setCreating({ workspaceId: memberOf(b.workspaceId) ? b.workspaceId : undefined, templateId: b.id })}>
                    Use template
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
      {data.workspaces.map((w: any) => {
        const boards = open.filter((b: any) => b.workspaceId === w.id);
        const closed = data.boards.filter((b: any) => b.workspaceId === w.id && b.closedAt).length;
        return (
          <section key={w.id}>
            <div className="row between wrap">
              <h2>
                <Link to={`/w/${w.id}`}>{w.name}</Link>
              </h2>
              <div className="row">
                <Link className="btn btn-light btn-small" to={`/w/${w.id}`}>
                  Members{w.role === 'admin' ? ' & settings' : ''}
                </Link>
                {closed > 0 && (
                  <Link className="btn btn-light btn-small" to={`/w/${w.id}?tab=closed`}>
                    Closed boards ({closed})
                  </Link>
                )}
              </div>
            </div>
            <div className="board-grid">
              {boards.map((b: any) => (
                <BoardTile key={b.id} b={b} />
              ))}
              <button className="board-tile board-tile-new" onClick={() => setCreating({ workspaceId: w.id })}>
                Create new board
              </button>
            </div>
            {boards.length === 0 && <p className="muted">No boards yet. Create one to start organizing work.</p>}
          </section>
        );
      })}
      {data.guestWorkspaces.map((w: any) => (
        <section key={w.id}>
          <h2>
            {w.name} <span className="pill">Guest</span>
          </h2>
          <div className="board-grid">
            {open
              .filter((b: any) => b.workspaceId === w.id)
              .map((b: any) => (
                <BoardTile key={b.id} b={b} />
              ))}
          </div>
        </section>
      ))}
      <button className="btn btn-light" onClick={() => setNewWs(true)}>
        + Create a workspace
      </button>
      {creating && <CreateBoardDialog workspaces={data.workspaces} workspaceId={creating.workspaceId} templates={templates} templateId={creating.templateId} onClose={() => setCreating(null)} />}
      {newWs && (
        <Modal title="Create workspace" onClose={() => setNewWs(false)} className="modal-small" initialFocus="#new-workspace-name">
          <form
            className="modal-body stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              try {
                const r = await post('/workspaces', { name: f.get('name'), description: f.get('description') });
                setNewWs(false);
                nav(`/w/${r.workspace.id}`);
              } catch (err) {
                push({ kind: 'error', text: (err as Error).message });
              }
            }}
          >
            <label className="field">
              <span>Workspace name</span>
              <input id="new-workspace-name" name="name" required maxLength={100} />
            </label>
            <label className="field">
              <span>Description (optional)</span>
              <textarea name="description" maxLength={2000} rows={3} />
            </label>
            <button className="btn btn-primary">Create workspace</button>
          </form>
        </Modal>
      )}
    </div>
  );
}
