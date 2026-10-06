import React, { useRef, useState } from 'react';
import { api } from '../api.js';
import { Field, TextInput } from './ui.jsx';
import { RowButton, SectionLabel, TextArea } from './panels.jsx';
import { FilePick, PhotoIcon, PublishSwitch } from './website/shared.jsx';

// The GKK form parts that Parish Config → Parish GKK (full-access staff) and
// My GKK (a GKK leader, 0045) share: the chapel details, the page's photos
// (0046) and the history.

const THIS_YEAR = new Date().getFullYear();
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
/** Keep in sync with the gkks_photos_is_short_array check in 0046. */
export const MAX_GKK_PHOTOS = 5;

/** A gkks row as form values. */
export function gkkForm(g) {
  return {
    chapel_address: g?.chapel_address || '', puroks: g?.puroks || '', year_established: g?.year_established ?? '',
    meeting_schedule: g?.meeting_schedule || '', meeting_place: g?.meeting_place || '',
    photo_url: g?.photo_url || '', photos: g?.photos || [],
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

const cleanPhotos = (list) => (list || []).map((p) => ({ url: p.url, caption: (p.caption || '').trim() }));

export const samePhotos = (a, b) => (a.photo_url || '') === (b.photo_url || '') && JSON.stringify(a.photos || []) === JSON.stringify(b.photos || []);

/** The main photo and gallery to save. */
export const photosPatch = (form) => ({ photo_url: form.photo_url || null, photos: cleanPhotos(form.photos) });

export const sameHistory = (a, b) => (a.history || '').trim() === (b.history || '').trim()
  && !!a.history_published === !!b.history_published
  && JSON.stringify(a.history_photos || []) === JSON.stringify(b.history_photos || []);

/** The history to save; `withPublished` only for staff who may publish it. */
export function historyPatch(form, { withPublished = true } = {}) {
  return {
    history: form.history.trim(),
    history_photos: cleanPhotos(form.history_photos),
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
 * Photos are uploaded to R2 as soon as they're picked. `rollback` (nothing
 * was saved) deletes the ones uploaded here; `commit` (saved) deletes the
 * ones taken off. Use one per thing saved on its own (the page's photos,
 * the history), so saving one never deletes the other's unsaved photos.
 */
export function useGkkPhotos(setError) {
  const [uploading, setUploading] = useState(0);
  const added = useRef(new Set());   // uploaded here
  const removed = useRef(new Set()); // saved before, taken off here

  /** Upload `files` and hand each URL to `place`. */
  async function upload(files, place) {
    setUploading((n) => n + files.length);
    setError('');
    for (const file of files) {
      try {
        if (!file.type.startsWith('image/')) throw new Error(`${file.name} isn't an image`);
        if (file.size > MAX_SOURCE_BYTES) throw new Error(`${file.name} is over 25 MB`);
        const url = await api.uploadImage(file, 'gkks');
        added.current.add(url);
        place(url);
      } catch (e) {
        setError(e.message || 'Could not upload the photo');
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  /** A photo taken off the form. */
  function discard(url) {
    if (!url) return;
    if (added.current.has(url)) {
      added.current.delete(url);
      api.deleteImage(url).catch(() => {});
    } else {
      removed.current.add(url);
    }
  }

  return {
    uploading,
    upload,
    discard,
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

/** A list of photos with captions, reorderable. `field` is the form key; `firstLabel` marks the first photo. */
function PhotoList({ form, setForm, field, photos, firstLabel }) {
  const list = form[field];
  const update = (i, patch) => setForm((f) => ({ ...f, [field]: f[field].map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const move = (i, d) => setForm((f) => {
    const next = [...f[field]];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    return { ...f, [field]: next };
  });
  const remove = (url) => { photos.discard(url); setForm((f) => ({ ...f, [field]: f[field].filter((p) => p.url !== url) })); };
  if (!list.length) return null;
  return (
    <ul className="list-none m-0 p-0 flex flex-col gap-2.5">
      {list.map((p, i) => (
        <li key={p.url} className="flex items-center gap-3 flex-wrap sm:flex-nowrap border border-parish-line2 rounded-xl p-2 bg-parish-field">
          <div className="flex-none flex flex-col items-center gap-1">
            <img src={p.url} alt="" className="w-[88px] h-[60px] rounded-lg object-cover" />
            {firstLabel && i === 0 && <span className="font-bold text-[10.5px] tracking-[.06em] uppercase text-parish-blue">{firstLabel}</span>}
          </div>
          <TextInput value={p.caption} onChange={(e) => update(i, { caption: e.target.value })} placeholder="Caption (optional)" aria-label={`Caption for photo ${i + 1}`} className="flex-1 min-w-[160px] !py-2" />
          <div className="flex gap-1">
            <RowButton tone="gray" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</RowButton>
            <RowButton tone="gray" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</RowButton>
            <RowButton tone="red" onClick={() => remove(p.url)}>Remove</RowButton>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The GKK page's main photo and its gallery of up to 5 photos (0046). */
export function PagePhotoFields({ form, setForm, photos }) {
  const room = MAX_GKK_PHOTOS - form.photos.length;
  // The main photo now, also after an upload finishes.
  const main = useRef(form.photo_url);
  main.current = form.photo_url;
  function setMain(url) {
    if (main.current && main.current !== url) photos.discard(main.current);
    main.current = url;
    setForm((f) => ({ ...f, photo_url: url }));
  }
  return (
    <>
      <SectionLabel>Main photo</SectionLabel>
      <div className="flex items-start gap-4 flex-wrap">
        <div className="w-[220px] aspect-[16/10] rounded-xl overflow-hidden border-2 border-dashed border-parish-borderStrong bg-parish-field flex items-center justify-center text-parish-faint">
          {form.photo_url ? <img src={form.photo_url} alt="Main photo" className="w-full h-full object-cover" /> : <PhotoIcon size={32} />}
        </div>
        <div className="flex flex-col gap-2 items-start">
          <FilePick label={form.photo_url ? 'Replace photo' : 'Upload photo'} onFiles={(files) => photos.upload(files.slice(0, 1), setMain)} disabled={photos.uploading > 0} />
          {form.photo_url && <button type="button" onClick={() => setMain('')} className="appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-[13px] text-parish-error">Remove photo</button>}
          <span className="text-[12px] text-parish-muted max-w-[260px]">Across the top of the GKK's page on the website. The chapel or the community, a wide photo works best.</span>
        </div>
      </div>

      <SectionLabel>Photo gallery</SectionLabel>
      <PhotoList form={form} setForm={setForm} field="photos" photos={photos} />
      <div className="flex items-center gap-3 flex-wrap">
        <FilePick
          multiple label="+ Add photos" disabled={photos.uploading > 0 || room <= 0}
          onFiles={(files) => photos.upload(files.slice(0, room), (url) => setForm((f) => (f.photos.length >= MAX_GKK_PHOTOS ? f : { ...f, photos: [...f.photos, { url, caption: '' }] })))}
        />
        {photos.uploading > 0 && <span className="text-[13px] text-parish-muted">Uploading {photos.uploading} photo(s)…</span>}
        {!photos.uploading && <span className="text-[12.5px] text-parish-muted">{room > 0 ? `3 to ${MAX_GKK_PHOTOS} photos of the GKK's life: Masses, feasts, gatherings. ${room} more can be added.` : `That's ${MAX_GKK_PHOTOS}, the most the page shows. Remove one to add another.`}</span>}
      </div>
    </>
  );
}

/**
 * The history text and its photos. Staff who may publish get the "Show on
 * the public website" switch; a GKK leader sees whether it's published.
 */
export function HistoryFields({ form, setForm, setError, photos, canPublish }) {
  return (
    <>
      <Field label="History of the GKK">
        <TextArea
          rows={14} maxLength={50000} value={form.history} onChange={(e) => { setForm((f) => ({ ...f, history: e.target.value })); setError(''); }}
          placeholder="How the GKK began, how the chapel was built, its patron saint, the people who served it… Blank lines start a new paragraph."
        />
      </Field>

      <SectionLabel>Photos</SectionLabel>
      <PhotoList form={form} setForm={setForm} field="history_photos" photos={photos} firstLabel="Main photo" />
      <div className="flex items-center gap-3 flex-wrap">
        <FilePick multiple label="+ Add photos" onFiles={(files) => photos.upload(files, (url) => setForm((f) => ({ ...f, history_photos: [...f.history_photos, { url, caption: '' }] })))} disabled={photos.uploading > 0} />
        {photos.uploading > 0 && <span className="text-[13px] text-parish-muted">Uploading {photos.uploading} photo(s)…</span>}
        {!photos.uploading && (
          <span className="text-[12.5px] text-parish-muted">
            {form.history_photos.length
              ? 'On the website the first photo sits beside the first paragraph and the rest go underneath. Use ↑ ↓ to choose which is first.'
              : 'The chapel then and now, the founders, feasts. Pick several at once.'}
          </span>
        )}
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
