import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { get, post } from '../api';
import { useAuth } from '../auth';
import { Logo, Spinner } from '../components/ui';

export function InvitePage() {
  const { token } = useParams();
  const { me, loading, setSession } = useAuth();
  const nav = useNavigate();
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!loading) get(`/invites/${token}`).then(setInfo, (e) => setInfo({ valid: false, reason: e.message }));
  }, [token, loading, me?.id]);
  if (!info) return <Spinner />;
  const here = `/invite/${token}`;
  return (
    <div className="auth-page">
      <div className="auth-card stack">
        <Logo />
        {!info.valid ? (
          <>
            <h1>Invitation unavailable</h1>
            <p>{info.reason}</p>
            <Link to="/">Go to Flowdeck</Link>
          </>
        ) : me ? (
          <>
            <h1>Join {info.workspace.name}</h1>
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
            {info.alreadyMember ? (
              <p>You’re already a member of this workspace.</p>
            ) : (
              <p>
                You’re logged in as <strong>{me.fullName}</strong>. Accept to join as a workspace {info.role}.
              </p>
            )}
            <button
              className="btn btn-primary"
              onClick={async () => {
                try {
                  const r = await post(`/invites/${token}/accept`);
                  nav(`/w/${r.workspaceId}`);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              {info.alreadyMember ? 'Open workspace' : 'Accept invitation'}
            </button>
          </>
        ) : (
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = Object.fromEntries(new FormData(e.currentTarget));
              try {
                const r = await post(`/invites/${token}/signup`, f);
                setSession(r.user, r.csrfToken);
                nav(`/w/${info.workspace.id}`);
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            <h1>Join {info.workspace.name}</h1>
            <p className="muted">
              Create your Flowdeck account, or <Link to={`/login?next=${encodeURIComponent(here)}`}>log in</Link> if you already have one.
            </p>
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
            <label className="field">
              <span>Full name</span>
              <input name="fullName" required maxLength={100} autoComplete="name" />
            </label>
            <label className="field">
              <span>Username</span>
              <input name="username" required pattern="[a-z0-9_]{3,32}" title="3–32 lowercase letters, digits or _" autoComplete="username" />
            </label>
            <label className="field">
              <span>Email</span>
              <input name="email" type="email" required defaultValue={info.email ?? ''} readOnly={!!info.email} autoComplete="email" />
            </label>
            <label className="field">
              <span>Password (at least 12 characters)</span>
              <input name="password" type="password" required minLength={12} autoComplete="new-password" />
            </label>
            <button className="btn btn-primary">Create account and join</button>
          </form>
        )}
      </div>
    </div>
  );
}
