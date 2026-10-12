import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { Shell } from './components/Shell';
import { Spinner } from './components/ui';
import { LoginPage } from './pages/Login';
import { HomePage } from './pages/Home';
import { NotFoundPage } from './pages/NotFound';
import { loadBoardPage } from './board/lazy';

// Less-used screens load on demand; the board page is fetched in the background after sign-in.
const SetupPage = lazy(() => import('./pages/Setup').then((m) => ({ default: m.SetupPage })));
const InvitePage = lazy(() => import('./pages/Invite').then((m) => ({ default: m.InvitePage })));
const WorkspacePage = lazy(() => import('./pages/Workspace').then((m) => ({ default: m.WorkspacePage })));
const AccountPage = lazy(() => import('./pages/Account').then((m) => ({ default: m.AccountPage })));
const AdminPage = lazy(() => import('./pages/Admin').then((m) => ({ default: m.AdminPage })));
const SearchPage = lazy(() => import('./pages/Search').then((m) => ({ default: m.SearchPage })));
const BoardPage = lazy(() => loadBoardPage().then((m) => ({ default: m.BoardPage })));

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
      <Route path="/setup/:token" element={<Suspense fallback={<Spinner />}><SetupPage /></Suspense>} />
      <Route path="/invite/:token" element={<Suspense fallback={<Spinner />}><InvitePage /></Suspense>} />
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
