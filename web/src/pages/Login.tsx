import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { post } from '../api';
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
          No account? Ask a workspace admin for an invite link. Forgot your password? Ask your Flowdeck administrator for a reset link.
        </p>
      </form>
    </div>
  );
}
