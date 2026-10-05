import React, { useRef, useState } from 'react';
import { api } from '../api.js';
import { Field, TextInput } from './ui.jsx';
import { RowButton, SectionLabel, TextArea } from './panels.jsx';
import { FilePick, PublishSwitch } from './website/shared.jsx';

// The GKK form parts that Parish Config → Parish GKK (full-access staff) and
// My GKK (a GKK leader, 0045) share: the chapel details and the history.

const THIS_YEAR = new Date().getFullYear();
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/** A gkks row as form values. */
export function gkkForm(g) {
  return {
    chapel_address: g?.chapel_address || '', puroks: g?.puroks || '', year_established: g?.year_established ?? '',
    meeting_schedule: g?.meeting_schedule || '', meeting_place: g?.meeting_place || '',
    history: g?.history || '', history_photos: g?.history_photos || [], history_published: !!g?.history_published,
  };
}

/** What's wrong with the chapel details, or ''. */
export function chapelProblem(form) {
  const year = String(form.year_established ?? '').trim();
  if (!form.chapel_address.trim()) return 'Enter the chapel address.';
  if (year && !(/^\d{4}$/.test(year) && Number(year) >= 1500 && Number(year) <= THIS_YEAR)) return `Enter the year established as four digits, up to ${THIS_YEAR}.`;
  return '';
}

/** The chapel details to save. */
export function chapelPatch(form) {
  const year = String(form.year_established ?? '').trim();
  return {
    chapel_address: form.chapel_address, puroks: form.puroks, year_established: year ? Number(year) : null,
    meeting_schedule: form.meeting_schedule, meeting_place: form.meeting_place,
  };
}

export const sameHistory = (a, b) => (a.history || '').trim() === (b.history || '').trim()
  && !!a.history_published === !!b.history_published
  && JSON.stringify(a.history_photos || []) === JSON.stringify(b.history_photos || []);

/** The history to save; `withPublished` only for staff who may publish it. */
export function historyPatch(form, { withPublished = true } = {}) {
  return {
    history: form.history.trim(),
    history_photos: form.history_photos.map((p) => ({ url: p.url, caption: (p.caption || '').trim() })),
    ...(withPublished ? { history_published: !!form.history_published } : {}),
  };
}

/** Chapel address (required), puroks, year established, meeting schedule and place. */
export function ChapelFields({ form, setForm, setError, addressError, setAddressError }) {
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setError(''); };
  return (
    <>
      <Field label="Chapel address" required error={addressError}>
        <TextInput value={form.chapel_address} placeholder="e.g. Purok 3, Brgy. San Isidro" onChange={(e) => { set('chapel_address')(e); setAddressError(''); }} />
      </Field>
      <Field label="Puroks / sitios covered">
        <TextInput value={form.puroks} placeholder="e.g. Purok 1, 2 and 3" onChange={set('puroks')} />
      </Field>
      <Field label="Year established">
        <TextInput inputMode="numeric" maxLength={4} value={form.year_established} placeholder="e.g. 1985" className="max-w-[160px]" onChange={(e) => { setForm((f) => ({ ...f, year_established: e.target.value.replace(/\D/g, '') })); setError(''); }} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bible-sharing schedule">
          <TextInput value={form.meeting_schedule} placeholder="e.g. Every Wednesday, 7:00 PM" onChange={set('meeting_schedule')} />
        </Field>
        <Field label="Meeting place">
          <TextInput value={form.meeting_place} placeholder="e.g. The chapel" onChange={set('meeting_place')} />
        </Field>
      </div>
    </>
  );
}

/**
 * History photos are uploaded to R2 as soon as they're picked. `rollback`
 * (nothing was saved) deletes the ones uploaded here; `commit` (saved)
 * deletes the ones taken off the saved history.
 */
export function useHistoryPhotos(setForm, setError) {
  const [uploading, setUploading] = useState(0);
  const added = useRef(new Set());   // uploaded here
  const removed = useRef(new Set()); // on the saved history, taken off here

  async function addPhotos(files) {
    setUploading((n) => n + files.length);
    setError('');
    for (const file of files) {
      try {
        if (!file.type.startsWith('image/')) throw new Error(`${file.name} isn't an image`);
        if (file.size > MAX_SOURCE_BYTES) throw new Error(`${file.name} is over 25 MB`);
        const url = await api.uploadImage(file, 'gkks');
        added.current.add(url);
        setForm((f) => ({ ...f, history_photos: [...f.history_photos, { url, caption: '' }] }));
      } catch (e) {
        setError(e.message || 'Could not upload the photo');
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function removePhoto(url) {
    if (added.current.has(url)) {
      added.current.delete(url);
      api.deleteImage(url).catch(() => {});
    } else {
      removed.current.add(url);
    }
    setForm((f) => ({ ...f, history_photos: f.history_photos.filter((p) => p.url !== url) }));
  }

  return {
    uploading,
    addPhotos,
    removePhoto,
    rollback() {
      for (const url of added.current) api.deleteImage(url).catch(() => {});
      added.current.clear();
    },
    commit() {
      for (const url of removed.current) api.deleteImage(url).catch(() => {});
      removed.current.clear();
      added.current.clear();
    },
  };
}

/**
 * The history text and its photos. Staff who may publish get the "Show on
 * the public website" switch; a GKK leader sees whether it's published.
 */
export function HistoryFields({ form, setForm, setError, photos, canPublish }) {
  const updatePhoto = (i, patch) => setForm((f) => ({ ...f, history_photos: f.history_photos.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const movePhoto = (i, d) => setForm((f) => {
    const list = [...f.history_photos];
    [list[i], list[i + d]] = [list[i + d], list[i]];
    return { ...f, history_photos: list };
  });

  return (
    <>
      <Field label="History of the GKK">
        <TextArea
          rows={14} maxLength={50000} value={form.history} onChange={(e) => { setForm((f) => ({ ...f, history: e.target.value })); setError(''); }}
          placeholder="How the GKK began, how the chapel was built, its patron saint, the people who served it… Blank lines start a new paragraph."
        />
      </Field>

      <SectionLabel>Photos</SectionLabel>
      {form.history_photos.length > 0 && (
        <ul className="list-none m-0 p-0 flex flex-col gap-2.5">
          {form.history_photos.map((p, i) => (
            <li key={p.url} className="flex items-center gap-3 flex-wrap sm:flex-nowrap border border-parish-line2 rounded-xl p-2 bg-parish-field">
              <img src={p.url} alt="" className="w-[88px] h-[60px] flex-none rounded-lg object-cover" />
              <TextInput value={p.caption} onChange={(e) => updatePhoto(i, { caption: e.target.value })} placeholder="Caption (optional)" aria-label={`Caption for photo ${i + 1}`} className="flex-1 min-w-[160px] !py-2" />
              <div className="flex gap-1">
                <RowButton tone="gray" disabled={i === 0} onClick={() => movePhoto(i, -1)} aria-label="Move up">↑</RowButton>
                <RowButton tone="gray" disabled={i === form.history_photos.length - 1} onClick={() => movePhoto(i, 1)} aria-label="Move down">↓</RowButton>
                <RowButton tone="red" onClick={() => photos.removePhoto(p.url)}>Remove</RowButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <FilePick multiple label="+ Add photos" onFiles={photos.addPhotos} disabled={photos.uploading > 0} />
        {photos.uploading > 0 && <span className="text-[13px] text-parish-muted">Uploading {photos.uploading} photo(s)…</span>}
        {!photos.uploading && !form.history_photos.length && <span className="text-[12.5px] text-parish-muted">The chapel then and now, the founders, feasts. Pick several at once.</span>}
      </div>

      {canPublish ? (
        <>
          <PublishSwitch checked={!!form.history_published} onChange={(v) => setForm((f) => ({ ...f, history_published: v }))} />
          <div className="-mt-2 text-[12.5px] text-parish-muted">Published, it shows on the GKK's page under Komunidad → Mga GKK.</div>
        </>
      ) : (
        <div className="px-4 py-3 rounded-xl border border-parish-border bg-parish-field text-[13px] text-parish-text2">
          {form.history_published
            ? <><strong className="text-parish-navy">On the website.</strong> If you change it, it goes back to a draft until the parish office publishes it again.</>
            : <><strong className="text-parish-navy">Draft.</strong> The parish office reviews it and puts it on the GKK's page of the website.</>}
        </div>
      )}
    </>
  );
}
