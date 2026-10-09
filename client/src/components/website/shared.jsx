import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { Badge, Spinner } from '../ui.jsx';
import { STATE_TONES } from '../../lib/website.js';
import { useAsyncData } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../ConfirmDialog.jsx';

export { SidePanel, SectionLabel, TextArea, RowButton, Panel, TabIntro, AddButton } from '../panels.jsx';

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

  /** Drop rows deleted elsewhere (e.g. the days unticked from a Daily Mass). */
  function forget(ids) {
    setRows((rs) => rs.filter((r) => !ids.includes(r.id)));
  }

  return { rows, loading: loading && !data, error, reload, upsert, forget, togglePublished, removeRow, busyId };
}

/** "Show on the public website" switch inside an editor. */
export function PublishSwitch({ checked, onChange }) {
  return (
    <label className="flex items-start gap-3 px-4 py-3 rounded-xl border border-parish-border bg-parish-field cursor-pointer">
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

/** A picture placeholder for photo slots without a photo yet. */
export function PhotoIcon({ size = 26 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-8 8" />
    </svg>
  );
}

/**
 * A button that opens the file picker for images. While `busy` (this
 * button's upload is running) it shows a spinner and "Uploading…" (or
 * `busyLabel`) and can't be pressed; `disabled` alone just greys it out.
 */
export function FilePick({ label, onFiles, multiple = false, disabled = false, busy = false, busyLabel = 'Uploading…', accept = 'image/*' }) {
  const off = disabled || busy;
  return (
    <label aria-busy={busy || undefined} className={`cursor-pointer px-4 py-2 font-semibold text-[13.5px] text-white bg-parish-fill rounded-xl inline-flex items-center gap-2 ${off ? 'pointer-events-none' : ''} ${disabled && !busy ? 'opacity-60' : ''} ${busy ? 'opacity-90' : ''}`}>
      {busy && <Spinner />}
      {busy ? busyLabel : label}
      <input
        type="file" accept={accept} multiple={multiple} className="hidden" disabled={off}
        onChange={(e) => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) onFiles(files); }}
      />
    </label>
  );
}

/**
 * A spinner over a photo preview while a photo uploads into it. The preview
 * needs `relative`; `round` for a round avatar.
 */
export function UploadOverlay({ busy, label = 'Uploading photo…', round = false }) {
  if (!busy) return null;
  return (
    <div role="status" className={`absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-parish-card/90 backdrop-blur-[2px] ${round ? 'rounded-full' : ''}`}>
      <Spinner tone="blue" className={round ? '!w-5 !h-5' : '!w-7 !h-7 !border-[3px]'} />
      {round ? <span className="sr-only">{label}</span> : <span className="text-[12px] font-semibold text-parish-text2">{label}</span>}
    </div>
  );
}

/**
 * How many photos one button is uploading, counting down as each lands.
 * `run(files, upload, place)` calls `upload(files, place)` (useArticlePhotos'
 * withUploads, useGkkPhotos' upload): the count shows a spinner on that
 * button and preview only, though other uploads may be running.
 */
export function useUploadCount() {
  const [count, setCount] = useState(0);
  async function run(files, upload, place) {
    setCount((n) => n + files.length);
    try {
      await upload(files, (url) => { setCount((n) => Math.max(0, n - 1)); place(url); });
    } finally {
      setCount(0);
    }
  }
  return [count, run];
}

/** "Uploading 2 photos…" with a spinner, beside a gallery's Add button. */
export function UploadingNote({ count }) {
  if (!count) return null;
  return (
    <span role="status" className="inline-flex items-center gap-2 text-[13px] text-parish-muted">
      <Spinner tone="blue" />
      Uploading {count} photo{count === 1 ? '' : 's'}…
    </span>
  );
}
