import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { get, post } from '../api';
import { useAuth } from '../auth';
import { Logo } from '../components/ui';

export function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
}

export function LoginPage() {
  const { me, setSession } = useAuth();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [forgot, setForgot] = useState<'closed' | 'open' | 'sent'>('closed');
  useEffect(() => {
    get('/auth/options')
      .then((r) => setEmailEnabled(!!r.emailEnabled))
      .catch(() => setEmailEnabled(false)); // the page keeps the "ask your administrator" advice
  }, []);
  if (me) return <Navigate to={safeNext(params.get('next'))} replace />;
  return (
    <div className="auth-page">
      <form
        className="auth-card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          setError('');
          try {
            const r = await post('/auth/login', { email: f.get('email'), password: f.get('password') });
            setSession(r.user, r.csrfToken);
            nav(safeNext(params.get('next')), { replace: true });
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Logo />
        <h1>Log in to Flowdeck</h1>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <label className="field">
          <span>Email or username</span>
          <input name="email" autoComplete="username" required autoFocus />
        </label>
        <label className="field">
          <span>Password</span>
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
        <p className="muted small">
          No account? Ask a workspace admin for an invite link.{' '}
          {emailEnabled ? (
            <button type="button" className="link-btn" onClick={() => setForgot('open')}>
              Forgot your password?
            </button>
          ) : (
            'Forgot your password? Ask your Flowdeck administrator for a reset link.'
          )}
        </p>
      </form>
      {emailEnabled && forgot !== 'closed' && (
        <form
          className="auth-card stack"
          aria-label="Reset your password"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setError('');
            try {
              await post('/auth/forgot', { email: f.get('resetEmail') });
              setForgot('sent');
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <h2>Reset your password</h2>
          {forgot === 'sent' ? (
            <p role="status">If an account uses that address, a reset link is on its way. It works once, for one hour.</p>
          ) : (
            <>
              <label className="field">
                <span>Your account email</span>
                <input name="resetEmail" type="email" autoComplete="email" required />
              </label>
              <button className="btn btn-primary">Email me a reset link</button>
            </>
          )}
        </form>
      )}
    </div>
  );
}
