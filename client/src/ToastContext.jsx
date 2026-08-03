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

  const push = useCallback(
    (message, tone = 'ok') => {
      if (!message) return;
      const id = nextId++;
      setToasts((list) => [...list, { id, message, tone }]);
      timers.current.set(id, setTimeout(() => dismiss(id), tone === 'error' ? 5000 : 3000));
    },
    [dismiss]
  );

  const toast = {
    success: (m) => push(m, 'ok'),
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
