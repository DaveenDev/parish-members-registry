import React, { useRef, useState } from 'react';
import { api } from '../../api.js';
import { Field, TextInput, Select, Badge } from '../ui.jsx';
import { SearchInput, Pagination, EmptyState, LoadingState, ErrorState } from '../admin.jsx';
import { fmtDate } from '../../constants.js';
import { useUrlState, urlListPage } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { todayIso } from '../../lib/website.js';
import { useContentList, SidePanel, SectionLabel, TextArea, PublishSwitch, StateBadge, RowButton, Panel, TabIntro, AddButton } from './shared.jsx';

// Tag values match the articles_tag_check constraint (0021); the site shows them in Bisaya.
const TAGS = [['Parish', 'Parish'], ['GKK', 'GKK'], ['Ministry', 'Ministry'], ['History', 'History (Kasaysayan)']];
const TAG_LABEL = Object.fromEntries(TAGS);
const URL_DEFAULTS = { q: '', page: 1, size: 10 };
const URL_ALLOWED = { size: [10, 20, 50] };
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const describe = (r) => r.title;

/** Blog Articles: parish history and write-ups of events held, with a cover photo and a gallery (photos on R2). */
export default function ArticlesTab() {
  const list = useContentList({ table: 'articles', load: api.listArticles, remove: api.deleteArticle, describe });
  const [editing, setEditing] = useState(null);
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);

  const sorted = [...list.rows].sort((a, b) => b.held_on.localeCompare(a.held_on) || b.id - a.id);
  const page = urlListPage(sorted, (r) => `${r.title} ${r.summary || ''} ${r.place || ''} ${r.tag}`, url, setUrl);

  return (
    <>
      <TabIntro text="Articles about the parish's history and the activities it held. Each can have a cover photo and a gallery; they show under Mga Pahibalo on the website.">
        <AddButton onClick={() => setEditing({ title: '', tag: 'Parish', held_on: todayIso(), place: '', summary: '', body: '', photo_url: '', photos: [], published: false })}>
          New article
        </AddButton>
      </TabIntro>

      {list.rows.length > 0 && (
        <div className="flex gap-2.5 flex-wrap mb-4">
          <SearchInput placeholder="Search articles…" aria-label="Search articles" value={page.query} onChange={(e) => page.setQuery(e.target.value)} />
        </div>
      )}

      <Panel className="overflow-hidden">
        {list.loading ? <LoadingState /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.rows.length ? (
          <EmptyState title="No articles yet" subtitle="Write up a parish event or a piece of parish history." />
        ) : !page.total ? (
          <EmptyState title="Nothing matches" />
        ) : (
          page.rows.map((r) => (
            <div key={r.id} className="flex items-start gap-4 px-5 py-4 border-b border-parish-line last:border-b-0 flex-wrap">
              <div className="w-[104px] h-[70px] flex-none rounded-lg overflow-hidden bg-parish-sunk flex items-center justify-center text-parish-faint">
                {r.photo_url ? <img src={r.photo_url} alt="" className="w-full h-full object-cover" /> : <PhotoIcon />}
              </div>
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge tone={r.tag === 'History' ? 'gold' : 'blue'}>{TAG_LABEL[r.tag] || r.tag}</Badge>
                  <StateBadge state={r.published ? 'Published' : 'Draft'} />
                  {(r.photos || []).length > 0 && <span className="text-[12px] text-parish-muted">{r.photos.length} photo(s) in gallery</span>}
                </div>
                <div className="font-semibold text-[15px] text-parish-navy">{r.title}</div>
                {r.summary && <div className="text-[13px] text-parish-text2 line-clamp-2">{r.summary}</div>}
                <div className="text-[12px] text-parish-muted mt-1">{[fmtDate(r.held_on), r.place].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="flex gap-1.5">
                <RowButton onClick={() => setEditing(r)}>Edit</RowButton>
                <RowButton tone="gray" disabled={list.busyId === r.id} onClick={() => list.togglePublished(r)}>{r.published ? 'Unpublish' : 'Publish'}</RowButton>
                <RowButton tone="red" disabled={list.busyId === r.id} onClick={() => list.removeRow(r)}>Delete</RowButton>
              </div>
            </div>
          ))
        )}
        <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPage={page.setPage} onPageSize={page.setPageSize} />
      </Panel>

      {editing && <ArticleEditor row={editing} onClose={() => setEditing(null)} onSaved={(saved) => { list.upsert(saved); setEditing(null); }} />}
    </>
  );
}

function PhotoIcon({ size = 26 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.8" /><path d="M21 16l-5-5-8 8" />
    </svg>
  );
}

/**
 * Photos are uploaded to R2 as soon as they're picked. If the editor is
 * cancelled, the ones uploaded in this session are deleted again; photos
 * taken off a saved article are deleted once the article is saved.
 */
function ArticleEditor({ row, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ ...row, place: row.place || '', summary: row.summary || '', body: row.body || '', photo_url: row.photo_url || '', photos: row.photos || [] });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState('');
  const added = useRef(new Set());   // uploaded in this editor session
  const removed = useRef(new Set()); // on the saved article, taken off here
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setError(''); };

  async function upload(file) {
    if (!file.type.startsWith('image/')) throw new Error(`${file.name} isn't an image`);
    if (file.size > MAX_SOURCE_BYTES) throw new Error(`${file.name} is over 25 MB`);
    const url = await api.uploadImage(file);
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

  // Latest form for handlers that run after an upload finishes.
  const formRef = useRef(form);
  formRef.current = form;

  const setCover = (url) => { discard(formRef.current.photo_url); setForm((f) => ({ ...f, photo_url: url })); };
  const addPhotos = (urls) => setForm((f) => ({ ...f, photos: [...f.photos, ...urls.map((u) => ({ url: u, caption: '' }))] }));
  const updatePhoto = (i, patch) => setForm((f) => ({ ...f, photos: f.photos.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  const movePhoto = (i, d) => setForm((f) => {
    const photos = [...f.photos];
    [photos[i], photos[i + d]] = [photos[i + d], photos[i]];
    return { ...f, photos };
  });
  const removePhoto = (i) => { discard(formRef.current.photos[i].url); setForm((f) => ({ ...f, photos: f.photos.filter((_, j) => j !== i) })); };

  function close() {
    // Nothing was saved: take back what this session uploaded.
    for (const url of added.current) api.deleteImage(url).catch(() => {});
    onClose();
  }

  async function save() {
    if (!form.title.trim()) { setError('Give the article a title.'); return; }
    if (!form.held_on) { setError('Choose the date of the event.'); return; }
    if (uploading) { setError('Wait for the photos to finish uploading.'); return; }
    setSaving(true);
    setError('');
    try {
      const photos = form.photos.map((p) => ({ url: p.url, caption: (p.caption || '').trim() }));
      const saved = await api.saveArticle({ ...form, title: form.title.trim(), photos });
      for (const url of removed.current) api.deleteImage(url).catch(() => {});
      added.current.clear();
      toast.success('Article saved');
      onSaved(saved);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel title={row.id ? 'Edit article' : 'New article'} onClose={close} onSave={save} saving={saving} error={error}>
      <Field label="Title" required><TextInput value={form.title} onChange={(e) => set('title')(e.target.value)} maxLength={160} placeholder="e.g. Ang pagtukod sa kapilya sa Mua-an, 1985" /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Tag">
          <Select value={form.tag} onChange={(e) => set('tag')(e.target.value)}>
            {TAGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Date of the event" required><TextInput type="date" value={form.held_on} onChange={(e) => set('held_on')(e.target.value)} /></Field>
        <Field label="Place"><TextInput value={form.place} onChange={(e) => set('place')(e.target.value)} placeholder="e.g. Parish church" /></Field>
      </div>
      <Field label="Summary">
        <TextArea rows={2} value={form.summary} onChange={(e) => set('summary')(e.target.value)} maxLength={300} placeholder="One or two sentences shown on the article card." />
      </Field>
      <Field label="Article">
        <TextArea rows={10} value={form.body} onChange={(e) => set('body')(e.target.value)} placeholder="The full story. Blank lines start a new paragraph." />
      </Field>

      <SectionLabel>Cover photo</SectionLabel>
      <div className="flex items-start gap-4 flex-wrap">
        <div className="w-[220px] aspect-[16/10] rounded-xl overflow-hidden border-2 border-dashed border-parish-borderStrong bg-parish-field flex items-center justify-center text-parish-faint">
          {form.photo_url ? <img src={form.photo_url} alt="Cover" className="w-full h-full object-cover" /> : <PhotoIcon size={32} />}
        </div>
        <div className="flex flex-col gap-2 items-start">
          <FilePick label={form.photo_url ? 'Replace cover' : 'Upload cover'} onFiles={(files) => withUploads(files.slice(0, 1), setCover)} disabled={uploading > 0} />
          {form.photo_url && <button type="button" onClick={() => setCover('')} className="appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-[13px] text-parish-error">Remove cover</button>}
          <span className="text-[12px] text-parish-muted max-w-[260px]">Shown on the article card. A wide photo works best.</span>
        </div>
      </div>

      <SectionLabel>Gallery</SectionLabel>
      {form.photos.length > 0 && (
        <ul className="list-none m-0 p-0 flex flex-col gap-2.5">
          {form.photos.map((p, i) => (
            <li key={p.url} className="flex items-center gap-3 border border-parish-line2 rounded-xl p-2 bg-parish-field">
              <img src={p.url} alt="" className="w-[88px] h-[60px] flex-none rounded-lg object-cover" />
              <TextInput value={p.caption} onChange={(e) => updatePhoto(i, { caption: e.target.value })} placeholder="Caption (optional)" aria-label={`Caption for photo ${i + 1}`} className="flex-1 !py-2" />
              <div className="flex gap-1">
                <RowButton tone="gray" disabled={i === 0} onClick={() => movePhoto(i, -1)} aria-label="Move up">↑</RowButton>
                <RowButton tone="gray" disabled={i === form.photos.length - 1} onClick={() => movePhoto(i, 1)} aria-label="Move down">↓</RowButton>
                <RowButton tone="red" onClick={() => removePhoto(i)}>Remove</RowButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        <FilePick multiple label="+ Add photos" onFiles={(files) => withUploads(files, (u) => addPhotos([u]))} disabled={uploading > 0} />
        {uploading > 0 && <span className="text-[13px] text-parish-muted">Uploading {uploading} photo(s)…</span>}
        {!uploading && !form.photos.length && <span className="text-[12.5px] text-parish-muted">Old parish photos, the event itself, the people involved. Pick several at once.</span>}
      </div>

      <PublishSwitch checked={!!form.published} onChange={set('published')} />
    </SidePanel>
  );
}

function FilePick({ label, onFiles, multiple = false, disabled = false }) {
  return (
    <label className={`cursor-pointer px-4 py-2 font-semibold text-[13.5px] text-white bg-parish-fill rounded-xl inline-block ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
      {label}
      <input
        type="file" accept="image/*" multiple={multiple} className="hidden" disabled={disabled}
        onChange={(e) => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) onFiles(files); }}
      />
    </label>
  );
}
