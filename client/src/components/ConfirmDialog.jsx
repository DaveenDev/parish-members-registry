import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { PrimaryButton, GhostButton } from './ui.jsx';

const ConfirmContext = createContext(null);

/**
 * Promise-based replacement for window.confirm, so destructive actions get a
 * styled dialog instead of a browser chrome popup.
 *
 *   const confirm = useConfirm();
 *   if (await confirm({ title: 'Remove member?', tone: 'danger' })) { ... }
 */
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolver = useRef(null);
  const cancelRef = useRef(null);

  const confirm = useCallback((options) => {
    setDialog({
      title: 'Are you sure?',
      message: '',
      confirmLabel: 'Confirm',
      cancelLabel: 'Cancel',
      tone: 'default',
      ...(typeof options === 'string' ? { title: options } : options),
    });
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((result) => {
    setDialog(null);
    resolver.current?.(result);
    resolver.current = null;
  }, []);

  useEffect(() => {
    if (!dialog) return;
    cancelRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Enter') close(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [dialog, close]);

  const danger = dialog?.tone === 'danger';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[90] bg-parish-navy/45 backdrop-blur-sm flex items-center justify-center p-5"
          onClick={() => close(false)}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label={dialog.title}
            className="bg-white rounded-2xl max-w-[420px] w-full shadow-2xl p-6 animate-fadeUp"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-serif text-[24px] font-semibold m-0 mb-2 text-parish-navy">{dialog.title}</h3>
            {dialog.message && (
              <p className="text-[14.5px] leading-relaxed text-parish-text2 m-0 mb-5">{dialog.message}</p>
            )}
            <div className="flex gap-2.5 justify-end">
              <GhostButton ref={cancelRef} onClick={() => close(false)} className="px-5 py-2.5 text-[14px]">
                {dialog.cancelLabel}
              </GhostButton>
              {danger ? (
                <button
                  onClick={() => close(true)}
                  className="appearance-none border-none cursor-pointer font-bold text-white bg-parish-error rounded-xl px-5 py-2.5 text-[14px] transition hover:-translate-y-px"
                >
                  {dialog.confirmLabel}
                </button>
              ) : (
                <PrimaryButton onClick={() => close(true)} className="px-5 py-2.5 text-[14px]">
                  {dialog.confirmLabel}
                </PrimaryButton>
              )}
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside a ConfirmProvider');
  return ctx;
}
