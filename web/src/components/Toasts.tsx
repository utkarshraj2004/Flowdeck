import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  text: string;
  action?: { label: string; run: () => void };
  sticky?: boolean;
}

const Ctx = createContext<{ push: (t: Omit<Toast, 'id'>) => number; dismiss: (id: number) => void }>(null!);
export const useToasts = () => useContext(Ctx);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (t: Omit<Toast, 'id'>) => {
      const id = nextId++;
      setToasts((ts) => [...ts.slice(-4), { ...t, id }]);
      if (!t.sticky && t.kind !== 'error') window.setTimeout(() => dismiss(id), 8000);
      return id;
    },
    [dismiss],
  );
  return (
    <Ctx.Provider value={{ push, dismiss }}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications">
        <div aria-live="polite" aria-atomic="false">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
              <span>{t.text}</span>
              {t.action && (
                <button
                  className="btn btn-small btn-light"
                  onClick={() => {
                    t.action!.run();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button className="icon-btn" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </Ctx.Provider>
  );
}

export function errorText(e: unknown) {
  return e instanceof Error ? e.message : 'Something went wrong.';
}
