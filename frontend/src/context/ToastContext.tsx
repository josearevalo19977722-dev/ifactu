import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface Toast {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
  detail?: string;
}

interface ToastCtx {
  success: (message: string, detail?: string) => void;
  error: (message: string, detail?: string) => void;
  info: (message: string, detail?: string) => void;
}

const ToastContext = createContext<ToastCtx | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const add = useCallback((type: Toast['type'], message: string, detail?: string) => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, type, message, detail }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, type === 'error' ? 8000 : 4500);
  }, []);

  const remove = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const success = useCallback((m: string, d?: string) => add('success', m, d), [add]);
  const error   = useCallback((m: string, d?: string) => add('error',   m, d), [add]);
  const info    = useCallback((m: string, d?: string) => add('info',    m, d), [add]);

  const icon = { success: '✅', error: '❌', info: 'ℹ️' };
  const colors = {
    success: { bg: 'var(--success-light)', border: '#86efac', color: 'var(--success)' },
    error:   { bg: 'var(--danger-light)',  border: '#fca5a5', color: 'var(--danger)'  },
    info:    { bg: 'color-mix(in srgb, var(--color-brand) 14%, var(--color-surface))', border: 'color-mix(in srgb, var(--color-brand) 45%, transparent)', color: 'var(--color-brand)' },
  };

  return (
    <ToastContext.Provider value={{ success, error, info }}>
      {children}

      {/* Toast container — aria-live para lectores de pantalla */}
      <div
        role="status"
        aria-live="polite"
        aria-relevant="additions text"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'none',
        }}
      >
        {toasts.map(t => {
          const c = colors[t.type];
          return (
            <div
              key={t.id}
              style={{
                pointerEvents: 'all',
                background: c.bg,
                border: `1px solid ${c.border}`,
                color: c.color,
                borderRadius: 10,
                padding: '12px 16px',
                minWidth: 280,
                maxWidth: 400,
                boxShadow: '0 4px 20px rgba(0,0,0,.12)',
                display: 'flex',
                gap: 10,
                alignItems: 'flex-start',
                animation: 'toast-in .2s ease',
              }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{icon[t.type]}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '.875rem' }}>{t.message}</div>
                {t.detail && (
                  <div style={{ fontSize: '.78rem', marginTop: 3, opacity: .85, wordBreak: 'break-word' }}>{t.detail}</div>
                )}
              </div>
              <button
                type="button"
                aria-label="Cerrar notificación"
                onClick={() => remove(t.id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'inherit', opacity: .6, fontSize: 16, padding: 0, flexShrink: 0,
                }}
              >×</button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de ToastProvider');
  return ctx;
}
