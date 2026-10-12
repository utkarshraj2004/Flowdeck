import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { Shell } from './components/Shell';
import { Spinner } from './components/ui';
import { LoginPage } from './pages/Login';
import { SetupPage } from './pages/Setup';
import { InvitePage } from './pages/Invite';
import { HomePage } from './pages/Home';
import { WorkspacePage } from './pages/Workspace';
import { AccountPage } from './pages/Account';
import { AdminPage } from './pages/Admin';
import { SearchPage } from './pages/Search';
import { NotFoundPage } from './pages/NotFound';
import { BoardPage } from './board/BoardPage';

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { me, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <Spinner />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/setup/:token" element={<SetupPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/w/:workspaceId" element={<WorkspacePage />} />
        <Route path="/b/:shortId" element={<BoardPage />} />
        <Route path="/b/:shortId/c/:cardNumber" element={<BoardPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
