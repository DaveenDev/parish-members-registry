import React, { useState } from 'react';
import { api } from '../../api.js';
import { Field, TextInput, ComboInput } from '../ui.jsx';
import { Pagination, EmptyState, LoadingState, ErrorState, SearchInput, TAB_BAR, tabClass } from '../admin.jsx';
import { useUrlState, urlListPage } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { DOWNLOAD_ACCEPT, FILE_CATEGORIES, SONG_CATEGORIES, cleanLyrics, downloadFileType, fileKindLabel, firstLine, fold, orderCategories } from '../../lib/downloads.js';
import { fmtFileSize, titleFromFileName } from '../../lib/gkkDocuments.js';
import { useContentList, SidePanel, TextArea, PublishSwitch, StateBadge, RowButton, Panel, TabIntro, AddButton, FilePick } from './shared.jsx';

const KINDS = [['songs', 'Song Lyrics'], ['files', 'Forms & Files']];
const URL_DEFAULTS = { kind: 'songs', q: '', page: 1, size: 10 };
const URL_ALLOWED = { kind: KINDS.map(([k]) => k), size: [10, 20, 50] };

/**
 * Downloads on the public website (/downloads, 0096): song lyrics for the
 * GKK Kasaulogan, the Bible Service and other gatherings, and the forms the
 * office shares (GKK forms, the manual census form…). One tab, two lists.
 */
export default function DownloadsTab() {
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  return (
    <>
      <div role="tablist" aria-label="Downloads" className={`${TAB_BAR} mb-4`}>
        {KINDS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={url.kind === k} onClick={() => setUrl({ kind: k, q: '', page: 1 })} className={tabClass(url.kind === k)}>
            {label}
          </button>
        ))}
      </div>
      {url.kind === 'files' ? <FilesList url={url} setUrl={setUrl} /> : <SongsList url={url} setUrl={setUrl} />}
    </>
  );
}

// ---- songs -----------------------------------------------------------------

function SongsList({ url, setUrl }) {
  const list = useContentList({ table: 'songs', load: api.listSongs, remove: api.deleteSong, describe: (r) => r.title });
  const [editing, setEditing] = useState(null);
  const sorted = [...list.rows].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }));
  const page = urlListPage(sorted, (r) => `${r.title} ${(r.categories || []).join(' ')} ${r.note || ''} ${r.lyrics}`, url, setUrl);
  const known = orderCategories([...SONG_CATEGORIES, ...list.rows.flatMap((r) => r.categories || [])], SONG_CATEGORIES);

  return (
    <>
      <TabIntro text="The words of the songs sung at the GKK Kasaulogan, the Bible Service and other gatherings. Parishioners read them on their phones under Downloads → Mga Kanta, so paste each song with a blank line between stanzas.">
        <SearchInput value={page.query} onChange={(e) => page.setQuery(e.target.value)} placeholder="Search songs" aria-label="Search songs" />
        <AddButton onClick={() => setEditing({ title: '', categories: [], note: '', lyrics: '', published: false })}>New song</AddButton>
      </TabIntro>

      <Panel className="overflow-hidden">
        {list.loading ? <LoadingState /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.rows.length ? (
          <EmptyState title="No songs yet" subtitle="Add the songs parishioners sing most, starting with the Kasaulogan." />
        ) : !page.rows.length ? (
          <EmptyState title="No songs found" subtitle="Try another word." />
        ) : (
          page.rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-4 border-b border-parish-line last:border-b-0 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <div className="font-semibold text-[15px] text-parish-navy">{r.title}</div>
                <div className="text-[12.5px] text-parish-muted truncate">
                  {[(r.categories || []).join(', '), fold(firstLine(r.lyrics)) !== fold(r.title) ? firstLine(r.lyrics) : ''].filter(Boolean).join(' · ') || 'No category'}
                </div>
              </div>
              <StateBadge state={r.published ? 'Published' : 'Draft'} />
              <div className="flex gap-1.5">
                <RowButton onClick={() => setEditing(r)} viewLabel="View">Edit</RowButton>
                <RowButton tone="gray" disabled={list.busyId === r.id} onClick={() => list.togglePublished(r)}>{r.published ? 'Unpublish' : 'Publish'}</RowButton>
                <RowButton tone="red" disabled={list.busyId === r.id} onClick={() => list.removeRow(r)}>Delete</RowButton>
              </div>
            </div>
          ))
        )}
        <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPage={page.setPage} onPageSize={page.setPageSize} />
      </Panel>

      {editing && <SongEditor row={editing} known={known} onClose={() => setEditing(null)} onSaved={(saved) => { list.upsert(saved); setEditing(null); }} />}
    </>
  );
}

function SongEditor({ row, known, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ ...row, categories: row.categories || [] });
  const [newCat, setNewCat] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const has = (c) => form.categories.some((x) => fold(x) === fold(c));
  const toggle = (c) => set('categories')(has(c) ? form.categories.filter((x) => fold(x) !== fold(c)) : [...form.categories, c]);
  // Categories typed for this song that aren't on the list yet show as chips too.
  const chips = orderCategories([...known, ...form.categories], SONG_CATEGORIES);

  function addCategory() {
    const c = newCat.trim();
    if (c && !has(c)) set('categories')([...form.categories, c.slice(0, 80)]);
    setNewCat('');
  }

  async function save() {
    if (!form.title.trim()) { setError('Give the song its title.'); return; }
    if (!cleanLyrics(form.lyrics)) { setError('Type or paste the lyrics.'); return; }
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveSong({ ...form, title: form.title.trim(), note: (form.note || '').trim() });
      toast.success('Song saved');
      onSaved(saved);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel title={row.id ? 'Edit song' : 'New song'} subtitle="Downloads → Mga Kanta on the website" onClose={onClose} onSave={save} saving={saving} error={error}>
      <Field label="Title" required><TextInput value={form.title} onChange={(e) => set('title')(e.target.value)} maxLength={200} /></Field>
      <Field label="Sung at" inputId="song-new-category">
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c} type="button" aria-pressed={has(c)} onClick={() => toggle(c)}
              className={`appearance-none cursor-pointer px-3 py-1.5 rounded-full border-[1.5px] font-semibold text-[13px] ${has(c) ? 'bg-[var(--p-blue-tint)] border-parish-blue text-parish-blue' : 'bg-parish-field border-parish-borderSoft text-parish-text2'}`}
            >
              {has(c) ? '✓ ' : ''}{c}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <TextInput
            id="song-new-category" value={newCat} onChange={(e) => setNewCat(e.target.value)} maxLength={80} placeholder="Another category, e.g. Pasko"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
          />
          <RowButton className="!py-2.5" disabled={!newCat.trim()} onClick={addCategory}>Add</RowButton>
        </div>
      </Field>
      <Field label="Note"><TextInput value={form.note || ''} onChange={(e) => set('note')(e.target.value)} maxLength={300} placeholder="Optional: composer, key, when it's sung (Pagsulod, Halad…)" /></Field>
      <Field label="Lyrics" required>
        <TextArea rows={18} value={form.lyrics} onChange={(e) => set('lyrics')(e.target.value)} placeholder={'Paste the song here, with a blank line between stanzas:\n\nUna nga bersikulo…\n…\n\nKORO:\n…'} />
      </Field>
      <PublishSwitch checked={!!form.published} onChange={set('published')} />
    </SidePanel>
  );
}

// ---- files -----------------------------------------------------------------

function FilesList({ url, setUrl }) {
  const list = useContentList({ table: 'download_files', load: api.listDownloadFiles, remove: api.deleteDownloadFile, describe: (r) => r.title });
  const [editing, setEditing] = useState(null);
  const sorted = [...list.rows].sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title, undefined, { numeric: true }));
  const page = urlListPage(sorted, (r) => `${r.title} ${r.category} ${r.description || ''} ${r.file_name}`, url, setUrl);
  const known = orderCategories([...FILE_CATEGORIES, ...list.rows.map((r) => r.category)], FILE_CATEGORIES);

  return (
    <>
      <TabIntro text="Forms for parishioners to download and print: GKK forms, the manual census form and others (PDF, Word, Excel or a photo, up to 20 MB). Anyone with a file's link can open it, so only upload what's meant for everyone.">
        <SearchInput value={page.query} onChange={(e) => page.setQuery(e.target.value)} placeholder="Search forms" aria-label="Search forms" />
        <AddButton onClick={() => setEditing({ title: '', category: FILE_CATEGORIES[0], description: '', published: false })}>Upload form</AddButton>
      </TabIntro>

      <Panel className="overflow-hidden">
        {list.loading ? <LoadingState /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.rows.length ? (
          <EmptyState title="No forms yet" subtitle="Upload the GKK forms or the manual census form." />
        ) : !page.rows.length ? (
          <EmptyState title="No forms found" subtitle="Try another word." />
        ) : (
          page.rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-4 border-b border-parish-line last:border-b-0 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <div className="font-bold text-[11px] tracking-[.1em] uppercase text-[var(--p-gold-deep)]">{r.category}</div>
                <div className="font-semibold text-[15px] text-parish-navy">{r.title}</div>
                <div className="text-[12.5px] text-parish-muted truncate">
                  {fileKindLabel(r.content_type, r.file_name)}{r.size_bytes ? ` · ${fmtFileSize(r.size_bytes)}` : ''} · {r.file_name}
                </div>
              </div>
              <StateBadge state={r.published ? 'Published' : 'Draft'} />
              <div className="flex gap-1.5 flex-wrap">
                <a href={api.downloadFileUrl(r)} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg font-semibold text-[12.5px] whitespace-nowrap bg-parish-sunk text-parish-text2">Open</a>
                <RowButton onClick={() => setEditing(r)} viewLabel="View">Edit</RowButton>
                <RowButton tone="gray" disabled={list.busyId === r.id} onClick={() => list.togglePublished(r)}>{r.published ? 'Unpublish' : 'Publish'}</RowButton>
                <RowButton tone="red" disabled={list.busyId === r.id} onClick={() => list.removeRow(r)}>Delete</RowButton>
              </div>
            </div>
          ))
        )}
        <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPage={page.setPage} onPageSize={page.setPageSize} />
      </Panel>

      {editing && <FileEditor row={editing} known={known} onClose={() => setEditing(null)} onSaved={(saved) => { list.upsert(saved); setEditing(null); }} />}
    </>
  );
}

function FileEditor({ row, known, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(row);
  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  function pick([f]) {
    try {
      downloadFileType(f);
    } catch (e) {
      setError(e.message);
      return;
    }
    setError('');
    setFile(f);
    if (!form.title.trim()) set('title')(titleFromFileName(f.name));
  }

  async function save() {
    if (!row.id && !file) { setError('Choose the file to upload.'); return; }
    if (!form.title.trim()) { setError('Give the form a title.'); return; }
    if (!(form.category || '').trim()) { setError('Choose or type a category.'); return; }
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveDownloadFile({ ...form, title: form.title.trim(), description: (form.description || '').trim() }, file);
      toast.success(file ? 'Form uploaded' : 'Form saved');
      onSaved(saved);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  const shown = file ? { name: file.name, size: file.size, type: downloadFileType(file) } : row.file_path ? { name: row.file_name, size: row.size_bytes, type: row.content_type } : null;

  return (
    <SidePanel title={row.id ? 'Edit form' : 'Upload form'} subtitle="Downloads → Mga Porma on the website" onClose={onClose} onSave={save} saving={saving} saveLabel={file ? 'Upload and save' : 'Save'} error={error}>
      <Field label="File" required={!row.id}>
        <div className="flex items-center gap-3 flex-wrap">
          <FilePick label={shown ? 'Choose another file' : 'Choose file'} accept={DOWNLOAD_ACCEPT} onFiles={pick} disabled={saving} />
          {shown && (
            <span className="text-[13px] text-parish-text2 min-w-0 break-all">
              <strong className="font-semibold text-parish-navy">{shown.name}</strong> · {fileKindLabel(shown.type, shown.name)}{shown.size ? ` · ${fmtFileSize(shown.size)}` : ''}
              {file && row.id ? ' (replaces the current file)' : ''}
            </span>
          )}
        </div>
      </Field>
      <Field label="Title" required><TextInput value={form.title} onChange={(e) => set('title')(e.target.value)} maxLength={200} placeholder="e.g. GKK Officers Form" /></Field>
      <Field label="Category" required>
        <ComboInput options={known} value={form.category || ''} onChange={set('category')} maxLength={80} toggleLabel="Show categories" />
      </Field>
      <Field label="Description">
        <TextArea rows={3} value={form.description || ''} onChange={(e) => set('description')(e.target.value)} maxLength={500} placeholder="Optional: what it's for, who fills it in, where to bring it" />
      </Field>
      <PublishSwitch checked={!!form.published} onChange={set('published')} />
    </SidePanel>
  );
}
