import { createContext, useCallback, useContext, useState } from 'react';
import { IconAlert, IconCheck, IconX } from '../lib/icons';

const ToastContext = createContext(() => {});

/** App-wide toast so feedback isn't a stray `msg` string buried per-page. */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (message, type = 'info', ttl = 4000) => {
      const id = Math.random().toString(36).slice(2);
      setToasts((prev) => [...prev, { id, message, type }]);
      if (ttl) setTimeout(() => dismiss(id), ttl);
      return id;
    },
    [dismiss]
  );

  // Convenience helpers: toast.success(...), toast.error(...), toast.info(...)
  const toast = useCallback(
    Object.assign((m, type, ttl) => push(m, type, ttl), {
      success: (m, ttl) => push(m, 'success', ttl),
      error: (m, ttl) => push(m, 'error', ttl ?? 6000),
      info: (m, ttl) => push(m, 'info', ttl),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {toasts.map((t) => {
          const tone =
            t.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-success'
              : t.type === 'error'
                ? 'border-red-200 bg-red-50 text-danger'
                : 'border-line bg-white text-ink';
          const Icon = t.type === 'error' ? IconAlert : IconCheck;
          return (
            <div
              key={t.id}
              role="status"
              className={`flex items-start gap-2 rounded-xl border px-4 py-3 shadow-mid text-sm ${tone}`}
            >
              {t.type !== 'info' && <Icon width={16} height={16} className="mt-0.5 shrink-0" />}
              <span className="flex-1 whitespace-pre-wrap break-words">{t.message}</span>
              <button
                type="button"
                className="text-muted hover:text-ink shrink-0"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
              >
                <IconX width={14} height={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
