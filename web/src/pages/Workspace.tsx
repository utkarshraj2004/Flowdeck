import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { del, get, patch, post } from '../api';
import { useAuth } from '../auth';
import { CreateBoardDialog } from '../components/CreateBoard';
import { ConfirmDialog, Modal } from '../components/Modal';
import { useToasts } from '../components/Toasts';
import { Avatar, Spinner, formatDate } from '../components/ui';
import { NotFoundPage } from './NotFound';
import { BoardTile } from './Home';

export function WorkspacePage() {
  const { workspaceId } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'boards';
  const { me } = useAuth();
  const nav = useNavigate();
  const { push } = useToasts();
  const [data, setData] = useState<any>(null);
  const [missing, setMissing] = useState(false);
  const [closed, setClosed] = useState<any[]>([]);
  const [creating, setCreating] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [removing, setRemoving] = useState<any>(null);
  const [confirm, setConfirm] = useState<any>(null);

  const load = () =>
    get(`/workspaces/${workspaceId}`).then(
      (d) => {
        setData(d);
        document.title = `${d.workspace.name} · Flowdeck`;
      },
      () => setMissing(true),
    );
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);
  useEffect(() => {
    if (tab === 'closed') get(`/workspaces/${workspaceId}/boards?filter=closed`).then((r) => setClosed(r.boards));
  }, [tab, workspaceId]);

  if (missing) return <NotFoundPage />;
  if (!data) return <Spinner />;
  const isAdmin = data.workspace.role === 'admin';
  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) push({ kind: 'success', text: ok });
      await load();
    } catch (e) {
      push({ kind: 'error', text: (e as Error).message });
    }
  };
  const tabs = [
    ['boards', 'Boards'],
    ['members', `Members (${data.members.length})`],
    ...(data.guests.length ? [['guests', `Guests (${data.guests.length})`]] : []),
    ['closed', 'Closed boards'],
    ...(isAdmin ? [['settings', 'Settings']] : []),
  ];

  return (
    <div className="page">
      <h1>{data.workspace.name}</h1>
      {data.workspace.description && <p className="muted">{data.workspace.description}</p>}
      <div className="tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'active' : ''} onClick={() => setParams({ tab: id })}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'boards' && (
        <div className="board-grid">
          {data.boards
            .filter((b: any) => !b.closedAt)
            .map((b: any) => (
              <BoardTile key={b.id} b={b} />
            ))}
          <button className="board-tile board-tile-new" onClick={() => setCreating(true)}>
            Create new board
          </button>
        </div>
      )}

      {tab === 'members' && (
        <div className="stack">
          {data.canInvite && (
            <section className="panel stack">
              <h2>Invite people</h2>
              <p className="muted small">Flowdeck doesn’t send email. Create a link and share it with your teammate yourself (chat, email…).</p>
              <form
                className="row wrap"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const email = String(f.get('email') ?? '').trim();
                  try {
                    const r = await post(`/workspaces/${workspaceId}/invites`, email ? { kind: 'email', email, role: f.get('role') } : { kind: 'link', role: f.get('role') });
                    setInviteUrl(r.invite.url);
                    if (r.emailed) push({ kind: 'success', text: `Invitation emailed to ${email}` });
                    (e.target as HTMLFormElement).reset();
                    load();
                  } catch (err) {
                    push({ kind: 'error', text: (err as Error).message });
                  }
                }}
              >
                <label className="field grow">
                  <span>Email (optional — leave empty for a reusable link)</span>
                  <input name="email" type="email" placeholder="teammate@example.com" />
                </label>
                <label className="field">
                  <span>Role</span>
                  <select name="role" defaultValue="member">
                    <option value="member">Member</option>
                    {isAdmin && <option value="admin">Admin</option>}
                  </select>
                </label>
                <button className="btn btn-primary">Create invite link</button>
              </form>
              {inviteUrl && (
                <div className="invite-url">
                  <label className="field grow">
                    <span>Share this link (shown once)</span>
                    <input readOnly value={inviteUrl} onFocus={(e) => e.target.select()} data-testid="invite-url" />
                  </label>
                  <button className="btn btn-light" onClick={() => navigator.clipboard?.writeText(inviteUrl).then(() => push({ kind: 'success', text: 'Link copied' }))}>
                    Copy
                  </button>
                </div>
              )}
              {data.invites.length > 0 && (
                <>
                  <h3>Pending invitations</h3>
                  <ul className="rows">
                    {data.invites.map((i: any) => (
                      <li key={i.id} className="row between">
                        <span>
                          {i.kind === 'email' ? i.email : 'Reusable link'} · {i.role}
                          <span className="muted small">
                            {' '}
                            · created {formatDate(i.createdAt, false)}
                            {i.expiresAt ? ` · expires ${formatDate(i.expiresAt, false)}` : ''}
                            {i.kind === 'link' ? ` · used ${i.useCount}×` : ''}
                          </span>
                        </span>
                        <button className="btn btn-small btn-light" onClick={() => run(() => del(`/invites/${i.id}`), 'Invitation revoked')}>
                          Revoke
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
          <ul className="rows panel">
            {data.members.map((m: any) => (
              <li key={m.id} className="row between wrap">
                <span className="row">
                  <Avatar user={m} />
                  <span>
                    <strong>{m.fullName}</strong> <span className="muted">@{m.username}</span>
                  </span>
                </span>
                <span className="row">
                  {isAdmin ? (
                    <select aria-label={`Role for ${m.fullName}`} value={m.role} onChange={(e) => run(() => patch(`/workspaces/${workspaceId}/members/${m.id}`, { role: e.target.value }), 'Role updated')}>
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                  ) : (
                    <span className="pill">{m.role}</span>
                  )}
                  {m.id === me!.id ? (
                    <button className="btn btn-small btn-light" onClick={() => setRemoving({ ...m, self: true })}>
                      Leave
                    </button>
                  ) : (
                    isAdmin && (
                      <button className="btn btn-small btn-light" onClick={() => setRemoving(m)}>
                        Remove
                      </button>
                    )
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === 'guests' && (
        <ul className="rows panel">
          {data.guests.map((g: any) => (
            <li key={g.id} className="row">
              <Avatar user={g} /> {g.fullName} <span className="muted">@{g.username} · on individual boards only</span>
            </li>
          ))}
        </ul>
      )}

      {tab === 'closed' && (
        <ul className="rows panel">
          {closed.length === 0 && <li className="muted">No closed boards.</li>}
          {closed.map((b) => (
            <li key={b.id} className="row between wrap">
              <span>{b.name}</span>
              {b.role === 'admin' && (
                <span className="row">
                  <button className="btn btn-small btn-light" onClick={() => run(() => post(`/boards/${b.id}/reopen`).then(() => nav(`/b/${b.shortId}`)))}>
                    Reopen
                  </button>
                  <button
                    className="btn btn-small btn-danger"
                    onClick={() =>
                      setConfirm({
                        title: `Delete “${b.name}”?`,
                        body: 'All lists, cards, comments and attachments on this board will be permanently deleted. This can’t be undone.',
                        typed: b.name,
                        run: (typed: string) => del(`/boards/${b.id}`, { confirmName: typed }).then(() => get(`/workspaces/${workspaceId}/boards?filter=closed`).then((r) => setClosed(r.boards))),
                      })
                    }
                  >
                    Delete…
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {tab === 'settings' && isAdmin && (
        <form
          className="panel stack narrow"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(
              () =>
                patch(`/workspaces/${workspaceId}`, {
                  name: f.get('name'),
                  description: f.get('description'),
                  settings: { membersCanInvite: f.get('membersCanInvite') === 'on', defaultBoardVisibility: f.get('defaultBoardVisibility') },
                }),
              'Workspace saved',
            );
          }}
        >
          <label className="field">
            <span>Name</span>
            <input name="name" defaultValue={data.workspace.name} required maxLength={100} />
          </label>
          <label className="field">
            <span>Description</span>
            <textarea name="description" defaultValue={data.workspace.description} rows={3} maxLength={2000} />
          </label>
          <label className="field">
            <span>Default visibility for new boards</span>
            <select name="defaultBoardVisibility" defaultValue={data.workspace.settings.defaultBoardVisibility}>
              <option value="workspace">Workspace</option>
              <option value="private">Private</option>
            </select>
          </label>
          <label className="row">
            <input type="checkbox" name="membersCanInvite" defaultChecked={!!data.workspace.settings.membersCanInvite} /> Members (not only admins) can create invitations
          </label>
          <button className="btn btn-primary">Save</button>
          <hr />
          <button
            type="button"
            className="btn btn-danger"
            onClick={() =>
              setConfirm({
                title: `Delete workspace “${data.workspace.name}”?`,
                body: 'Every board in this workspace, with all its cards and files, will be permanently deleted.',
                typed: data.workspace.name,
                run: (typed: string) => del(`/workspaces/${workspaceId}`, { confirmName: typed }).then(() => nav('/')),
              })
            }
          >
            Delete workspace…
          </button>
        </form>
      )}

      {creating && <CreateBoardDialog workspaces={[data.workspace]} workspaceId={data.workspace.id} onClose={() => setCreating(false)} />}
      {removing && (
        <Modal title={removing.self ? 'Leave workspace' : `Remove ${removing.fullName}`} onClose={() => setRemoving(null)} className="modal-small">
          <div className="modal-body stack">
            <p>{removing.self ? 'Do you want to keep access to the boards you are a member of, as a guest?' : `Choose what happens to ${removing.fullName}’s board memberships.`}</p>
            <button
              className="btn btn-light"
              onClick={() =>
                run(
                  () => del(`/workspaces/${workspaceId}/members/${removing.id}?keepBoards=true`).then(() => (removing.self ? nav('/') : setRemoving(null))),
                  removing.self ? 'You left the workspace' : 'Removed from the workspace; board memberships kept as guest',
                )
              }
            >
              {removing.self ? 'Leave, keep my boards as a guest' : 'Remove from workspace (keep boards as a guest)'}
            </button>
            <button
              className="btn btn-danger"
              onClick={() =>
                run(
                  () => del(`/workspaces/${workspaceId}/members/${removing.id}?keepBoards=false`).then(() => (removing.self ? nav('/') : setRemoving(null))),
                  removing.self ? 'You left the workspace' : 'Removed from the workspace and its boards',
                )
              }
            >
              {removing.self ? 'Leave workspace and its boards' : 'Remove from workspace and its boards'}
            </button>
          </div>
        </Modal>
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          body={confirm.body}
          typedConfirmation={confirm.typed}
          danger
          confirmLabel="Delete permanently"
          onCancel={() => setConfirm(null)}
          onConfirm={async (typed) => {
            try {
              await confirm.run(typed);
              setConfirm(null);
            } catch (e) {
              push({ kind: 'error', text: (e as Error).message });
            }
          }}
        />
      )}
    </div>
  );
}
