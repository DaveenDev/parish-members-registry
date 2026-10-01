import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(null);

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  // `action` is an optional { label, onClick } button, e.g. Undo. Toasts with
  // one stay up longer so there's time to use it.
  const push = useCallback(
    (message, tone = 'ok', action = null) => {
      if (!message) return;
      const id = nextId++;
      setToasts((list) => [...list, { id, message, tone, action }]);
      timers.current.set(id, setTimeout(() => dismiss(id), action ? 8000 : tone === 'error' ? 5000 : 3000));
    },
    [dismiss]
  );

  const toast = {
    success: (m, opts) => push(m, 'ok', opts?.action),
    error: (m) => push(m, 'error'),
    show: push,
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed left-1/2 bottom-6 z-[100] -translate-x-1/2 flex flex-col items-center gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            aria-live="polite"
            onClick={() => dismiss(t.id)}
            className={`pointer-events-auto cursor-pointer flex items-center gap-2.5 px-[18px] py-3 rounded-xl shadow-card font-semibold text-[14.5px] max-w-[88vw] border animate-fadeUp ${
              t.tone === 'error'
                ? 'bg-parish-errorBg text-parish-error border-parish-errorBorder'
                : 'bg-parish-okBg text-parish-ok border-parish-okBorder'
            }`}
          >
            <span aria-hidden>{t.tone === 'error' ? '!' : '✓'}</span>
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); dismiss(t.id); t.action.onClick(); }}
                className="appearance-none cursor-pointer ml-1 px-2.5 py-1 rounded-lg border-[1.5px] border-current bg-transparent font-bold text-[13px] text-inherit"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside a ToastProvider');
  return ctx;
}
