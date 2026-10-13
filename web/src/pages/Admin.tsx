import { useEffect, useState } from 'react';
import { get, patch, post } from '../api';
import { useAuth } from '../auth';
import { useToasts } from '../components/Toasts';
import { bytes, formatDate, Spinner } from '../components/ui';
import { NotFoundPage } from './NotFound';

export function AdminPage() {
  const { me } = useAuth();
  const { push } = useToasts();
  const [status, setStatus] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [link, setLink] = useState('');
  const load = () => Promise.all([get('/admin/status').then(setStatus), get('/admin/users').then((r) => setUsers(r.users))]);
  useEffect(() => {
    if (me?.isSystemAdmin) load();
    document.title = 'Administration · Flowdeck';
  }, [me?.isSystemAdmin]);
  if (!me?.isSystemAdmin) return <NotFoundPage />;
  if (!status) return <Spinner />;
  const act = async (fn: () => Promise<any>) => {
    try {
      const r = await fn();
      if (r?.url || r?.setupUrl) setLink(r.url ?? r.setupUrl);
      await load();
    } catch (e) {
      push({ kind: 'error', text: (e as Error).message });
    }
  };
  return (
    <div className="page stack">
      <h1>Administration</h1>
      <section className="panel">
        <h2>Instance</h2>
        <dl className="stats">
          <dt>Version</dt>
          <dd>{status.version}</dd>
          <dt>Database schema</dt>
          <dd>
            {status.schema} {status.schema === status.latestSchema ? '(up to date)' : `(build expects ${status.latestSchema})`}
          </dd>
          <dt>Public URL</dt>
          <dd>{status.baseUrl}</dd>
          <dt>Users / workspaces / boards / cards</dt>
          <dd>
            {status.counts.users} / {status.counts.workspaces} / {status.counts.boards} / {status.counts.cards}
          </dd>
          <dt>Uploaded files</dt>
          <dd>
            {bytes(status.counts.upload_bytes)} (max {bytes(status.maxUploadBytes)} per file)
          </dd>
        </dl>
        <p className="muted small">Backups are taken outside the app; see docs/OPERATIONS.md.</p>
      </section>
      <section className="panel stack" aria-labelledby="email-title">
        <h2 id="email-title">Email</h2>
        {status.email.enabled ? (
          <>
            <p>
              Sending as <code>{status.email.from}</code>. Queued: {status.email.pending}. Failed after retries: {status.email.failed}.
            </p>
            {status.email.lastError && <p className="field-error">Last failure: {status.email.lastError}</p>}
            <button
              className="btn btn-light"
              onClick={async () => {
                try {
                  const r = await post('/admin/email/test', {});
                  push({ kind: 'success', text: `Test email sent to ${r.to}` });
                } catch (e) {
                  push({ kind: 'error', text: (e as Error).message });
                }
                load();
              }}
            >
              Send me a test email
            </button>
          </>
        ) : (
          <p className="muted">
            Email is off. Set <code>FLOWDECK_SMTP_URL</code> (and optionally <code>FLOWDECK_MAIL_FROM</code>) to send invitations, password-reset links and notification digests by email. Everything
            else works without it (docs/OPERATIONS.md).
          </p>
        )}
      </section>
      <section className="panel stack">
        <h2>Users</h2>
        <form
          className="row wrap"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            act(() => post('/admin/users', { email: f.get('email'), isSystemAdmin: f.get('isSystemAdmin') === 'on' }));
            e.currentTarget.reset();
          }}
        >
          <label className="field grow">
            <span>New user email</span>
            <input name="email" type="email" required />
          </label>
          <label className="row">
            <input type="checkbox" name="isSystemAdmin" /> System administrator
          </label>
          <button className="btn btn-primary">Create setup link</button>
        </form>
        {link && (
          <label className="field">
            <span>One-time link — send it to the person (shown once)</span>
            <input readOnly value={link} onFocus={(e) => e.target.select()} data-testid="admin-link" />
          </label>
        )}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Status</th>
                <th>Last seen</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.fullName} <span className="muted">@{u.username}</span> {u.isSystemAdmin && <span className="pill">admin</span>}
                  </td>
                  <td>{u.email}</td>
                  <td>{u.disabledAt ? 'Disabled' : u.setupComplete ? 'Active' : 'Setup pending'}</td>
                  <td>{u.lastSeen ? formatDate(u.lastSeen) : '—'}</td>
                  <td className="row wrap">
                    <button className="btn btn-small btn-light" onClick={() => act(() => post(`/admin/users/${u.id}/reset-link`))}>
                      {u.setupComplete ? 'Reset link' : 'New setup link'}
                    </button>
                    {u.id !== me.id && (
                      <>
                        <button className="btn btn-small btn-light" onClick={() => act(() => patch(`/admin/users/${u.id}`, { disabled: !u.disabledAt }))}>
                          {u.disabledAt ? 'Enable' : 'Disable'}
                        </button>
                        <button className="btn btn-small btn-light" onClick={() => act(() => patch(`/admin/users/${u.id}`, { isSystemAdmin: !u.isSystemAdmin }))}>
                          {u.isSystemAdmin ? 'Remove admin' : 'Make admin'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
