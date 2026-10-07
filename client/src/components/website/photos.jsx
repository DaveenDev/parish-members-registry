import React, { useRef, useState } from 'react';
import { api } from '../../api.js';
import { TextInput } from '../ui.jsx';
import { SectionLabel, RowButton, PhotoIcon, FilePick, UploadOverlay, UploadingNote, useUploadCount } from './shared.jsx';

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

/**
 * A cover photo and a captioned gallery on an editor's `form` (photo_url,
 * photos: [{ url, caption }]), as the Blog Articles and the History page have.
 *
 * Photos are uploaded to R2 (under `folder`) as soon as they're picked. If
 * the editor is cancelled, `cancel()` deletes the ones uploaded in this
 * session; once the form is saved, `saved()` deletes the photos taken off it.
 */
export function useArticlePhotos({ form, setForm, setError, folder }) {
  const [uploading, setUploading] = useState(0);
  const added = useRef(new Set());   // uploaded in this editor session
  const removed = useRef(new Set()); // on the saved row, taken off here

  // Latest form for handlers that run after an upload finishes.
  const formRef = useRef(form);
  formRef.current = form;

  async function upload(file) {
    if (!file.type.startsWith('image/')) throw new Error(`${file.name} isn't an image`);
    if (file.size > MAX_SOURCE_BYTES) throw new Error(`${file.name} is over 25 MB`);
    const url = await api.uploadImage(file, folder);
    added.current.add(url);
    return url;
  }

  async function withUploads(files, fn) {
    setUploading((n) => n + files.length);
    setError('');
    for (const file of files) {
      try {
        fn(await upload(file));
      } catch (e) {
        setError(e.message || 'Could not upload the photo');
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  function discard(url) {
    if (!url) return;
    if (added.current.has(url)) {
      added.current.delete(url);
      api.deleteImage(url).catch(() => {});
    } else {
      removed.current.add(url);
    }
  }

  /** Put `url` in a single-photo field (photo_url, or another such as body_photo_url), or clear it with ''. */
  const setPhoto = (field, url) => { discard(formRef.current[field]); setForm((f) => ({ ...f, [field]: url })); };
  const setCover = (url) => setPhoto('photo_url', url);
  const addPhoto = (url) => setForm((f) => ({ ...f, photos: [...f.photos, { url, caption: '' }] }));
  const updatePhoto = (i, patch) => setForm((f) => ({ ...f, photos: f.photos.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const movePhoto = (i, d) => setForm((f) => {
    const photos = [...f.photos];
    [photos[i], photos[i + d]] = [photos[i + d], photos[i]];
    return { ...f, photos };
  });
  const removePhoto = (i) => { discard(formRef.current.photos[i].url); setForm((f) => ({ ...f, photos: f.photos.filter((_, j) => j !== i) })); };

  /** Nothing was saved: take back what this session uploaded. */
  function cancel() {
    for (const url of added.current) api.deleteImage(url).catch(() => {});
    added.current.clear();
  }

  /** The form was saved: delete the photos taken off it. */
  function saved() {
    for (const url of removed.current) api.deleteImage(url).catch(() => {});
    removed.current.clear();
    added.current.clear();
  }

  return { uploading, withUploads, setPhoto, setCover, addPhoto, updatePhoto, movePhoto, removePhoto, cancel, saved };
}

/** One photo in `field` of the form (the cover by default): its preview, upload/replace and remove. `children` go under the buttons. */
export function SinglePhotoField({ form, photos, field = 'photo_url', label, hint, children }) {
  const url = form[field];
  const name = label.toLowerCase();
  const [pending, run] = useUploadCount();
  const busy = pending > 0;
  const pick = (files) => run(files.slice(0, 1), photos.withUploads, (u) => photos.setPhoto(field, u));
  return (
    <>
      <SectionLabel>{label}</SectionLabel>
      <div className="flex items-start gap-4 flex-wrap">
        <div className="relative w-[220px] aspect-[16/10] rounded-xl overflow-hidden border-2 border-dashed border-parish-borderStrong bg-parish-field flex items-center justify-center text-parish-faint">
          {url ? <img src={url} alt={label} className="w-full h-full object-cover" /> : <PhotoIcon size={32} />}
          <UploadOverlay busy={busy} />
        </div>
        <div className="flex flex-col gap-2 items-start flex-1 min-w-[200px]">
          <FilePick label={url ? `Replace ${name}` : `Upload ${name}`} onFiles={pick} busy={busy} disabled={photos.uploading > 0} />
          {url && !busy && <button type="button" onClick={() => photos.setPhoto(field, '')} className="appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-[13px] text-parish-error">Remove {name}</button>}
          {hint && <span className="text-[12px] text-parish-muted max-w-[260px]">{hint}</span>}
          {children}
        </div>
      </div>
    </>
  );
}

/** The cover photo and gallery sections of an editor, driven by useArticlePhotos. */
export function PhotoFields({ form, photos, coverLabel = 'Cover photo', coverHint, galleryHint }) {
  const { uploading } = photos;
  // Photos on their way into the gallery, for its spinner.
  const [adding, run] = useUploadCount();
  const addPhotos = (files) => run(files, photos.withUploads, photos.addPhoto);
  return (
    <>
      <SinglePhotoField form={form} photos={photos} label={coverLabel} hint={coverHint} />

      <SectionLabel>Gallery</SectionLabel>
      {form.photos.length > 0 && (
        <ul className="list-none m-0 p-0 flex flex-col gap-2.5">
          {form.photos.map((p, i) => (
            <li key={p.url} className="flex items-center gap-3 border border-parish-line2 rounded-xl p-2 bg-parish-field">
              <img src={p.url} alt="" className="w-[88px] h-[60px] flex-none rounded-lg object-cover" />
              <TextInput value={p.caption} onChange={(e) => photos.updatePhoto(i, { caption: e.target.value })} placeholder="Caption (optional)" aria-label={`Caption for photo ${i + 1}`} className="flex-1 !py-2" />
              <div className="flex gap-1">
                <RowButton tone="gray" disabled={i === 0} onClick={() => photos.movePhoto(i, -1)} aria-label="Move up">↑</RowButton>
                <RowButton tone="gray" disabled={i === form.photos.length - 1} onClick={() => photos.movePhoto(i, 1)} aria-label="Move down">↓</RowButton>
                <RowButton tone="red" onClick={() => photos.removePhoto(i)}>Remove</RowButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <FilePick multiple label="+ Add photos" onFiles={addPhotos} busy={adding > 0} disabled={uploading > 0} />
        <UploadingNote count={adding} />
        {!uploading && !form.photos.length && galleryHint && <span className="text-[12.5px] text-parish-muted">{galleryHint}</span>}
      </div>
    </>
  );
}
