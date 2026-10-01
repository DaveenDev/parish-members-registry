import React, { useEffect, useId, useState } from 'react';
import { api } from '../../api.js';
import { PrimaryButton, GhostButton, Badge } from '../ui.jsx';
import { STATE_TONES } from '../../lib/website.js';
import { useAsyncData } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../ConfirmDialog.jsx';

/**
 * Rows of one website content table plus the actions every tab shares:
 * publish/unpublish, delete (after a confirm), and putting a saved row back
 * into the list without a reload. `describe(row)` names a row in messages.
 */
export function useContentList({ table, load, remove, describe }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { data, loading, error, reload } = useAsyncData(load, []);
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => { if (data) setRows(data.rows); }, [data]);

  function upsert(saved) {
    setRows((rs) => (rs.some((r) => r.id === saved.id) ? rs.map((r) => (r.id === saved.id ? saved : r)) : [...rs, saved]));
  }

  async function togglePublished(row) {
    setBusyId(row.id);
    try {
      upsert(await api.setWebsitePublished(table, row.id, !row.published));
      toast.success(row.published ? `${describe(row)} is now a draft` : `${describe(row)} is on the website`);
    } catch (e) {
      toast.error(e.message || 'Could not change this');
    } finally {
      setBusyId(null);
    }
  }

  async function removeRow(row) {
    const ok = await confirm({
      title: `Delete “${describe(row)}”?`,
      message: "This can't be undone. To hide it without deleting, make it a draft instead.",
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await remove(row.id);
      setRows((rs) => rs.filter((r) => r.id !== row.id));
      toast.success('Deleted');
    } catch (e) {
      toast.error(e.message || 'Could not delete this');
    } finally {
      setBusyId(null);
    }
  }

  return { rows, loading: loading && !data, error, reload, upsert, togglePublished, removeRow, busyId };
}

/**
 * Slide-in editor panel used by every Parish Website tab. Same shell as the
 * census and household drawers. Escape closes it unless a confirm dialog is
 * open on top.
 */
export function SidePanel({ title, subtitle, onClose, onSave, saving, saveLabel = 'Save', error, footerStart, children }) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !document.querySelector('[role="alertdialog"]') && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  function submit(e) {
    e.preventDefault();
    if (!saving) onSave();
  }

  return (
    <div className="fixed inset-0 z-[45] flex justify-end">
      <div className="absolute inset-0 bg-parish-navy/35 backdrop-blur-[2px] animate-fadeIn" onClick={onClose} />
      <form
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
          {footerStart && <div className="mr-auto flex items-center gap-2">{footerStart}</div>}
          <GhostButton type="button" onClick={onClose} className="px-5 py-2.5 text-[14px]">Cancel</GhostButton>
          <PrimaryButton type="submit" disabled={saving} className="px-6 py-2.5 text-[14px]">{saving ? 'Saving…' : saveLabel}</PrimaryButton>
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

/** "Show on the website" switch inside an editor. */
export function PublishSwitch({ checked, onChange }) {
  return (
    <label className="flex items-start gap-3 px-4 py-3 rounded-xl border border-parish-border bg-[#fdfbf6] cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-[19px] h-[19px] mt-0.5 accent-parish-blue cursor-pointer" />
      <span>
        <span className="block font-semibold text-[14px] text-parish-navy">Show on the public website</span>
        <span className="block text-[12.5px] text-parish-muted">Leave unticked to keep it as a draft only staff can see.</span>
      </span>
    </label>
  );
}

export function StateBadge({ state }) {
  return <Badge tone={STATE_TONES[state] || 'gray'}>{state}</Badge>;
}

/** Small text buttons on a list row. */
export function RowButton({ tone = 'blue', className = '', ...props }) {
  const tones = {
    blue: 'bg-[var(--p-blue-tint)] text-parish-blue',
    red: 'bg-parish-errorBg text-parish-error',
    gray: 'bg-[#f4efe3] text-parish-text2',
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
