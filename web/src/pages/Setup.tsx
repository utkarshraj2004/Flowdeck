import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { get, post } from '../api';
import { useAuth } from '../auth';
import { Logo, Spinner } from '../components/ui';

export function SetupPage() {
  const { token } = useParams();
  const { setSession } = useAuth();
  const nav = useNavigate();
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  useEffect(() => {
    get(`/setup/${token}`).then(setInfo, (e) => setError(e.message));
  }, [token]);
  if (error && !info)
    return (
      <div className="auth-page">
        <div className="auth-card stack">
          <Logo />
          <h1>Link not valid</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  if (!info) return <Spinner />;
  const isSetup = info.kind === 'setup';
  return (
    <div className="auth-page">
      <form
        className="auth-card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = Object.fromEntries(new FormData(e.currentTarget));
          if (f.password !== f.confirm) return setFieldError('The passwords don’t match.');
          setFieldError('');
          try {
            const r = await post(`/setup/${token}`, f);
            setSession(r.user, r.csrfToken);
            nav('/', { replace: true });
          } catch (err) {
            setFieldError((err as Error).message);
          }
        }}
      >
        <Logo />
        <h1>{isSetup ? 'Set up your account' : 'Choose a new password'}</h1>
        <p className="muted">{info.email}</p>
        {fieldError && (
          <div className="alert" role="alert">
            {fieldError}
          </div>
        )}
        {isSetup && (
          <>
            <label className="field">
              <span>Full name</span>
              <input name="fullName" required maxLength={100} autoComplete="name" defaultValue={info.fullName} autoFocus />
            </label>
            <label className="field">
              <span>Username</span>
              <input name="username" required pattern="[a-z0-9_]{3,32}" title="3–32 lowercase letters, digits or _" autoComplete="username" defaultValue={info.username} />
            </label>
          </>
        )}
        <label className="field">
          <span>Password (at least 12 characters)</span>
          <input name="password" type="password" required minLength={12} autoComplete="new-password" autoFocus={!isSetup} />
        </label>
        <label className="field">
          <span>Confirm password</span>
          <input name="confirm" type="password" required minLength={12} autoComplete="new-password" />
        </label>
        <button className="btn btn-primary">{isSetup ? 'Create account' : 'Save password'}</button>
      </form>
    </div>
  );
}
