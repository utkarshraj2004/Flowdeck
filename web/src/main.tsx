import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { loadBoardPage } from './board/lazy';
import { AuthProvider } from './auth';
import { ToastProvider } from './components/Toasts';
import './styles.css';
import './styles/shell.css';
import './styles/board.css';

// Opening a board URL directly: fetch the board screen's code in parallel with sign-in, not after it.
if (location.pathname.startsWith('/b/')) void loadBoardPage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
