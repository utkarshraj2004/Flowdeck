import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { get, post } from '../api';
import { CreateBoardDialog } from '../components/CreateBoard';
import { Modal } from '../components/Modal';
import { Spinner } from '../components/ui';
import { useToasts } from '../components/Toasts';

export function BoardTile({ b }: { b: any }) {
  return (
    <Link to={`/b/${b.shortId}`} className={`board-tile bg-${b.background}`}>
      <span className="board-tile-name">{b.name}</span>
      <span className="board-tile-meta">
        {b.starred && <span aria-label="Starred">★</span>}
        {b.visibility === 'private' && <span>Private</span>}
      </span>
    </Link>
  );
}

export function HomePage() {
  const [data, setData] = useState<any>(null);
  const [creating, setCreating] = useState<string | null>(null);
  const [newWs, setNewWs] = useState(false);
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
  return (
    <div className="page">
      {starred.length > 0 && (
        <section>
          <h2>Starred boards</h2>
          <div className="board-grid">
            {starred.map((b: any) => (
              <BoardTile key={b.id} b={b} />
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
              <button className="board-tile board-tile-new" onClick={() => setCreating(w.id)}>
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
      {creating && <CreateBoardDialog workspaces={data.workspaces} workspaceId={creating} onClose={() => setCreating(null)} />}
      {newWs && (
        <Modal title="Create workspace" onClose={() => setNewWs(false)} className="modal-small">
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
              <input name="name" required maxLength={100} autoFocus />
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
