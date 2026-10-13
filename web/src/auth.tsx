import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiError, get, post, setCsrf } from './api';
import { realtime } from './realtime';

export interface Me {
  id: string;
  email: string;
  username: string;
  fullName: string;
  initials: string;
  isSystemAdmin: boolean;
  prefs: { colorBlind: boolean; shortcuts: boolean; labelNames?: boolean; mutedNotifications?: string[]; emailNotifications?: boolean };
}

interface AuthState {
  me: Me | null;
  loading: boolean;
  setSession: (user: Me, csrf: string) => void;
  setMe: (user: Me) => void;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get('/me')
      .then((r) => {
        setCsrf(r.csrfToken);
        setMe(r.user);
      })
      .catch((e) => {
        if (!(e instanceof ApiError) || e.status !== 401) console.error(e);
      })
      .finally(() => setLoading(false));
    const onUnauth = () => {
      realtime.stop();
      setMe(null);
    };
    window.addEventListener('fd:unauthenticated', onUnauth);
    return () => window.removeEventListener('fd:unauthenticated', onUnauth);
  }, []);

  useEffect(() => {
    if (me) realtime.start();
  }, [me]);

  useEffect(() => {
    document.documentElement.dataset.colorblind = me?.prefs.colorBlind ? 'true' : 'false';
  }, [me?.prefs.colorBlind]);

  const setSession = useCallback((user: Me, csrf: string) => {
    setCsrf(csrf);
    setMe(user);
  }, []);

  const logout = useCallback(async () => {
    await post('/auth/logout').catch(() => undefined);
    realtime.stop();
    setCsrf('');
    setMe(null);
  }, []);

  return <Ctx.Provider value={{ me, loading, setSession, setMe, logout }}>{children}</Ctx.Provider>;
}
