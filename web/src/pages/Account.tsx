import { useEffect } from 'react';
import { patch, post } from '../api';
import { useAuth } from '../auth';
import { useToasts } from '../components/Toasts';

export function AccountPage() {
  const { me, setMe } = useAuth();
  const { push } = useToasts();
  useEffect(() => {
    document.title = 'Account · Flowdeck';
  }, []);
  if (!me) return null;
  return (
    <div className="page narrow stack">
      <h1>Account settings</h1>
      <form
        className="panel stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          try {
            const r = await patch('/me', { fullName: f.get('fullName'), prefs: { colorBlind: f.get('colorBlind') === 'on', shortcuts: f.get('shortcuts') === 'on' } });
            setMe(r.user);
            push({ kind: 'success', text: 'Settings saved' });
          } catch (err) {
            push({ kind: 'error', text: (err as Error).message });
          }
        }}
      >
        <h2>Profile</h2>
        <p className="muted">
          @{me.username} · {me.email}
        </p>
        <label className="field">
          <span>Full name</span>
          <input name="fullName" defaultValue={me.fullName} required maxLength={100} />
        </label>
        <label className="row">
          <input type="checkbox" name="colorBlind" defaultChecked={me.prefs.colorBlind} /> Colour-blind friendly label patterns
        </label>
        <label className="row">
          <input type="checkbox" name="shortcuts" defaultChecked={me.prefs.shortcuts} /> Keyboard shortcuts
        </label>
        <button className="btn btn-primary">Save</button>
      </form>
      <form
        className="panel stack"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          try {
            await post('/me/password', { currentPassword: f.get('currentPassword'), newPassword: f.get('newPassword') });
            form.reset();
            push({ kind: 'success', text: 'Password changed. Other sessions were signed out.' });
          } catch (err) {
            push({ kind: 'error', text: (err as Error).message });
          }
        }}
      >
        <h2>Change password</h2>
        <label className="field">
          <span>Current password</span>
          <input name="currentPassword" type="password" required autoComplete="current-password" />
        </label>
        <label className="field">
          <span>New password (at least 12 characters)</span>
          <input name="newPassword" type="password" required minLength={12} autoComplete="new-password" />
        </label>
        <button className="btn btn-primary">Change password</button>
      </form>
    </div>
  );
}
