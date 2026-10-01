import React, { useEffect, useId, useRef } from 'react';
import { PrimaryButton, GhostButton } from './ui.jsx';

/**
 * Slide-in editor panel used by the Parish Website and Requests pages. Same
 * shell as the census and household drawers. Escape closes it unless a
 * confirm dialog is open on top. Leave out `onSave` for a read-and-act panel
 * whose footer only has Close.
 */
export function SidePanel({ title, subtitle, onClose, onSave, saving, saveLabel = 'Save', error, footerStart, children }) {
  const titleId = useId();
  const ref = useRef(null);

  useEffect(() => {
    // Only the topmost dialog closes: not when a confirm or another dialog
    // (e.g. sacrament verification) is open above this panel.
    const onTop = () => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      return dialogs[dialogs.length - 1] === ref.current && !document.querySelector('[role="alertdialog"]');
    };
    const onKey = (e) => e.key === 'Escape' && onTop() && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function submit(e) {
    e.preventDefault();
    if (onSave && !saving) onSave();
  }

  return (
    <div className="fixed inset-0 z-[45] flex justify-end">
      <div className="absolute inset-0 bg-parish-navy/35 backdrop-blur-[2px] animate-fadeIn" onClick={onClose} />
      <form
        ref={ref}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative h-full w-full sm:w-[min(100%,620px)] lg:w-[46vw] lg:min-w-[580px] bg-white shadow-2xl flex flex-col animate-slideInRight"
      >
        <header className="flex items-start justify-between gap-3 px-5 sm:px-7 pt-5 pb-4 border-b border-[#f0e8d6]">
          <div className="min-w-0">
            <h3 id={titleId} className="font-serif text-[24px] font-semibold m-0 text-parish-navy truncate">{title}</h3>
            {subtitle && <p className="text-[13px] text-parish-muted m-0">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="appearance-none border-none bg-transparent cursor-pointer text-parish-muted text-2xl leading-none px-1">×</button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 sm:px-7 py-5 flex flex-col gap-4">
          {children}
          {error && <div className="text-parish-error text-[13.5px] font-medium" role="alert">{error}</div>}
        </div>

        <footer className="flex items-center gap-2.5 justify-end px-5 sm:px-7 py-3.5 border-t border-[#f0e8d6] bg-[#fffdf8] flex-wrap">
          {footerStart && <div className="mr-auto flex items-center gap-2 flex-wrap">{footerStart}</div>}
          <GhostButton type="button" onClick={onClose} className="px-5 py-2.5 text-[14px]">{onSave ? 'Cancel' : 'Close'}</GhostButton>
          {onSave && <PrimaryButton type="submit" disabled={saving} className="px-6 py-2.5 text-[14px]">{saving ? 'Saving…' : saveLabel}</PrimaryButton>}
        </footer>
      </form>
    </div>
  );
}

export function SectionLabel({ children }) {
  return (
    <div className="flex items-center gap-2.5 mt-1">
      <span className="font-bold text-[11.5px] text-[var(--p-gold-deep)] tracking-[.1em] uppercase">{children}</span>
      <span className="flex-1 h-px bg-[#f0e8d6]" />
    </div>
  );
}

export const TextArea = React.forwardRef(function TextArea({ className = '', ...props }, ref) {
  return (
    <textarea
      ref={ref}
      {...props}
      className={`w-full px-3.5 py-3 text-[15px] leading-relaxed text-parish-ink bg-[#fdfbf6] border-[1.5px] border-parish-borderSoft rounded-xl outline-none transition focus:border-parish-blue focus:ring-4 focus:ring-parish-blue/15 ${className}`}
    />
  );
});

/** Small text buttons on a list row. */
export function RowButton({ tone = 'blue', className = '', ...props }) {
  const tones = {
    blue: 'bg-[var(--p-blue-tint)] text-parish-blue',
    red: 'bg-parish-errorBg text-parish-error',
    gray: 'bg-[#f4efe3] text-parish-text2',
    green: 'bg-parish-okBg text-parish-ok',
  };
  return (
    <button
      type="button"
      {...props}
      className={`appearance-none border-none cursor-pointer px-3 py-1.5 rounded-lg font-semibold text-[12.5px] whitespace-nowrap disabled:opacity-60 ${tones[tone]} ${className}`}
    />
  );
}

/** Card wrapper for a tab's list. */
export function Panel({ children, className = '' }) {
  return <div className={`bg-[#fffdf8] border border-parish-border rounded-2xl shadow-cardSm ${className}`}>{children}</div>;
}

/** Heading row above a tab's list: short explanation on the left, actions on the right. */
export function TabIntro({ text, children }) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
      <p className="m-0 text-[13.5px] text-parish-muted max-w-[560px]">{text}</p>
      <div className="flex items-center gap-2 flex-wrap">{children}</div>
    </div>
  );
}

export function AddButton({ children, ...props }) {
  return (
    <PrimaryButton type="button" {...props} className="px-[18px] py-2.5 text-[14px] whitespace-nowrap">
      + {children}
    </PrimaryButton>
  );
}

/** Label/value pair for read-only details in a panel. */
export function Detail({ label, children }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className="min-w-0">
      <div className="font-semibold text-[11.5px] tracking-wide uppercase text-parish-muted">{label}</div>
      <div className="text-[14.5px] text-parish-navy break-words whitespace-pre-line">{children}</div>
    </div>
  );
}
