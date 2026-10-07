import React, { useState } from 'react';
import { api } from '../../api.js';
import { Field, TextInput, Select, Badge } from '../ui.jsx';
import { SearchInput, Pagination, EmptyState, LoadingState, ErrorState } from '../admin.jsx';
import { fmtDate } from '../../constants.js';
import { useUrlState, urlListPage } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { todayIso } from '../../lib/website.js';
import { useContentList, SidePanel, TextArea, PublishSwitch, StateBadge, RowButton, Panel, TabIntro, AddButton, PhotoIcon } from './shared.jsx';
import { useArticlePhotos, PhotoFields } from './photos.jsx';

// Tag values match the articles_tag_check constraint (0021); the site shows them in Bisaya.
const TAGS = [['Parish', 'Parish'], ['GKK', 'GKK'], ['Ministry', 'Ministry'], ['History', 'History (Kasaysayan)']];
const TAG_LABEL = Object.fromEntries(TAGS);
const URL_DEFAULTS = { q: '', page: 1, size: 10 };
const URL_ALLOWED = { size: [10, 20, 50] };
const describe = (r) => r.title;

/** Blog Articles: parish history and write-ups of events held, with a cover photo and a gallery (photos on R2). */
export default function ArticlesTab() {
  const list = useContentList({ table: 'articles', load: api.listArticles, remove: api.deleteArticle, describe });
  const [editing, setEditing] = useState(null);
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);

  // Latest first: newest article date, then most recently added.
  const sorted = [...list.rows].sort((a, b) => b.held_on.localeCompare(a.held_on) || b.id - a.id);
  const page = urlListPage(sorted, (r) => `${r.title} ${r.summary || ''} ${r.place || ''} ${r.author || ''} ${r.tag}`, url, setUrl);

  return (
    <>
      <TabIntro text="Articles about the parish's history and the activities it held. Each can have a cover photo and a gallery; they show under Pahibalo ug Kalihokan on the website.">
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
                <div className="text-[12px] text-parish-muted mt-1">{[`#${r.id}`, fmtDate(r.held_on), r.place, r.author && `by ${r.author}`].filter(Boolean).join(' · ')}</div>
              </div>
              <div className="flex gap-1.5">
                <RowButton onClick={() => setEditing(r)} viewLabel="View">Edit</RowButton>
                <RowButton tone="gray" disabled={list.busyId === r.id} onClick={() => list.togglePublished(r)}>{r.published ? 'Unpublish' : 'Publish'}</RowButton>
                <RowButton tone="red" disabled={list.busyId === r.id} onClick={() => list.removeRow(r)}>Delete</RowButton>
              </div>
            </div>
          ))
        )}
        <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPage={page.setPage} onPageSize={page.setPageSize} alwaysShow />
      </Panel>

      {editing && <ArticleEditor row={editing} onClose={() => setEditing(null)} onSaved={(saved) => { list.upsert(saved); setEditing(null); }} />}
    </>
  );
}

/** One article's editor; its cover and gallery are uploaded to R2 as they're picked (photos.jsx). */
function ArticleEditor({ row, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ ...row, place: row.place || '', author: row.author || '', summary: row.summary || '', body: row.body || '', photo_url: row.photo_url || '', photos: row.photos || [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setError(''); };
  const photos = useArticlePhotos({ form, setForm, setError, folder: 'articles' });
  const { uploading } = photos;

  function close() {
    photos.cancel();
    onClose();
  }

  async function save() {
    if (!form.title.trim()) { setError('Give the article a title.'); return; }
    if (!form.held_on) { setError('Choose the date of the event.'); return; }
    if (uploading) { setError('Wait for the photos to finish uploading.'); return; }
    setSaving(true);
    setError('');
    try {
      const gallery = form.photos.map((p) => ({ url: p.url, caption: (p.caption || '').trim() }));
      // Leave the author out when there never was one, so articles still save before the 0030 migration.
      const { author, ...fields } = form;
      const withAuthor = author.trim() || 'author' in row ? { ...fields, author: author.trim() } : fields;
      const saved = await api.saveArticle({ ...withAuthor, title: form.title.trim(), photos: gallery });
      photos.saved();
      // Now that it has an ID: article<ID>_cover.jpg, article<ID>_1.jpg… on R2.
      let named = null;
      if (saved.photo_url || saved.photos?.length) {
        named = await api.nameImages('articles', saved.id).catch((e) => { toast.error(`Article saved, but its photos weren't renamed: ${e.message}`); return null; });
      }
      toast.success('Article saved');
      onSaved(named || saved);
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
      <Field label="Author"><TextInput value={form.author} onChange={(e) => set('author')(e.target.value)} maxLength={120} placeholder="Who wrote it, e.g. Maria Santos or Parish Youth Ministry" /></Field>
      <Field label="Summary">
        <TextArea rows={2} value={form.summary} onChange={(e) => set('summary')(e.target.value)} maxLength={300} placeholder="One or two sentences shown on the article card." />
      </Field>
      <Field label="Article">
        <TextArea rows={10} value={form.body} onChange={(e) => set('body')(e.target.value)} placeholder="The full story. Blank lines start a new paragraph." />
      </Field>

      <PhotoFields
        form={form} photos={photos}
        coverHint="Shown on the article card. A wide photo works best."
        galleryHint="Old parish photos, the event itself, the people involved. Pick several at once."
      />

      <PublishSwitch checked={!!form.published} onChange={set('published')} />
    </SidePanel>
  );
}
