import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { del, get, patch, post } from '../api';
import { useAuth } from '../auth';
import { Modal } from '../components/Modal';
import { Avatar } from '../components/ui';
import { useBoard } from './context';

export function MembersDialog({ onClose }: { onClose: () => void }) {
  const { state, run } = useBoard();
  const { me } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ candidates: any[]; guest: any } | null>(null);
  const [role, setRole] = useState('member');
  const { access, board } = state;
  useEffect(() => {
    if (!access.can.invite) return;
    const t = window.setTimeout(() => get(`/boards/${board.id}/member-candidates?q=${encodeURIComponent(q)}`).then(setFound), 200);
    return () => window.clearTimeout(t);
  }, [q, access.can.invite, board.id, state.members.length]);
  const add = (userId: string) => run(() => post(`/boards/${board.id}/members`, { userId, role }), 'Added to the board');
  const options = [...(found?.candidates ?? []), ...(found?.guest ? [{ ...found.guest, guest: true }] : [])];
  return (
    <Modal title="Share board" onClose={onClose} className="modal-medium">
      <div className="modal-body stack">
        {access.can.invite ? (
          <div className="stack">
            <div className="row wrap">
              <label className="field grow">
                <span>Add a workspace member{access.can.admin ? ' (or a guest by exact username or email)' : ''}</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or username" autoFocus />
              </label>
              <label className="field">
                <span>Role</span>
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  {access.can.admin && <option value="admin">Admin</option>}
                  <option value="member">Member</option>
                  <option value="observer">Observer</option>
                </select>
              </label>
            </div>
            <ul className="rows">
              {options.map((u) => (
                <li key={u.id} className="row between">
                  <span className="row">
                    <Avatar user={u} size={24} /> {u.fullName} <span className="muted">@{u.username}</span> {u.guest && <span className="pill">guest</span>}
                  </span>
                  <button className="btn btn-small btn-primary" onClick={() => add(u.id)}>
                    Add
                  </button>
                </li>
              ))}
              {found && options.length === 0 && (
                <li className="muted small">
                  No matching workspace members. To bring in someone new, create an invitation on the{' '}
                  <button className="link-btn" onClick={() => nav(`/w/${board.workspaceId}?tab=members`)}>
                    workspace members page
                  </button>
                  .
                </li>
              )}
            </ul>
          </div>
        ) : (
          <p className="muted small">Only {board.prefs.invitations === 'admins' ? 'board admins' : 'board members'} can add people to this board.</p>
        )}
        <h3>Board members ({state.members.length})</h3>
        <ul className="rows">
          {state.members.map((m) => (
            <li key={m.id} className="row between wrap">
              <span className="row">
                <Avatar user={m} size={28} />
                <span>
                  {m.fullName} {m.id === me!.id && '(you)'} <span className="muted">@{m.username}</span> {m.isGuest && <span className="pill">guest</span>}
                </span>
              </span>
              <span className="row">
                {access.can.admin ? (
                  <select aria-label={`Role for ${m.fullName}`} value={m.role} onChange={(e) => run(() => patch(`/boards/${board.id}/members/${m.id}`, { role: e.target.value }), 'Role updated')}>
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="observer">Observer</option>
                  </select>
                ) : (
                  <span className="pill">{m.role}</span>
                )}
                {(access.can.admin || m.id === me!.id) && (
                  <button
                    className="btn btn-small btn-light"
                    onClick={async () => {
                      const r = await run(() => del(`/boards/${board.id}/members/${m.id}`), m.id === me!.id ? 'You left the board' : 'Removed from the board');
                      if (r && m.id === me!.id) nav('/');
                    }}
                  >
                    {m.id === me!.id ? 'Leave' : 'Remove'}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="muted small">
          Roles: <strong>Admin</strong> manages the board and its members · <strong>Member</strong> edits lists and cards · <strong>Observer</strong> views and (if allowed) comments. Workspace admins
          administer every board in the workspace. A board always keeps at least one admin.
        </p>
      </div>
    </Modal>
  );
}
