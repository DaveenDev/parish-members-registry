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
 * The shape and size each main photo looks best in, from how the website
 * shows it. Bigger photos are shrunk on upload, so the size is a minimum.
 *   parish    behind the home page's title on computers (its left side
 *             faded), a banner on phones
 *   gkk       a GKK page's main photo: 16:10 on phones, 2:1 on computers
 *   cover     article and History covers: 16:9 cards, wide on the page
 *   event     shown whole over a soft fill, so a poster keeps its text
 *   portrait  the org chart's round photos
 *   logo      the parish logo
 */
export const PHOTO_SHAPES = {
  parish: { w: 16, h: 7, shape: 'Wide landscape', size: '1600 × 700 px', note: 'On computers the left side fades behind the parish name, so keep the church in the middle or on the right.' },
  gkk: { w: 16, h: 9, shape: 'Landscape', size: '1600 × 900 px', note: 'Phones show it a little taller and computers a little wider, so keep the chapel in the middle.' },
  cover: { w: 16, h: 9, shape: 'Landscape', size: '1600 × 900 px', note: 'Some screens trim the edges, so keep what matters in the middle.' },
  event: { w: 16, h: 9, shape: 'Landscape', size: '1600 × 900 px', note: 'A poster of another shape is shown whole, with soft edges filling the space.' },
  portrait: { w: 1, h: 1, shape: 'Square', size: '400 × 400 px', note: 'Shown in a circle, so keep the face in the middle.' },
  // Saved at 256 × 256 (resizeLogo).
  logo: { w: 1, h: 1, shape: 'Square', size: '256 × 256 px', note: 'A plain or clear (transparent) background.' },
};

/** Under an upload button: a small outline of the best shape, its ratio and size (PHOTO_SHAPES). */
export function PhotoSizeHint({ kind, className = '' }) {
  const s = PHOTO_SHAPES[kind];
  if (!s) return null;
  const scale = 20 / Math.max(s.w, s.h);
  return (
    <div className={`flex items-start gap-2 text-[12px] text-parish-muted max-w-[300px] ${className}`}>
      <span aria-hidden className="flex-none w-6 h-[22px] flex items-center justify-center">
        <span className="block rounded-[3px] border-[1.5px] border-[var(--p-gold-deep)] bg-[var(--p-gold-tint)]" style={{ width: Math.round(s.w * scale), height: Math.round(s.h * scale) }} />
      </span>
      <span>
        <strong className="font-semibold text-parish-text2">Best: {s.shape.toLowerCase()} {s.w}:{s.h}, at least {s.size}.</strong> {s.note}
      </span>
    </div>
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
