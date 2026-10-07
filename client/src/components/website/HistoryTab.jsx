import React, { useState } from 'react';
import { api } from '../../api.js';
import { Field, TextInput, Badge } from '../ui.jsx';
import { DataTable, EmptyState, LoadingState, ErrorState } from '../admin.jsx';
import { fmtDateTime } from '../../constants.js';
import { useToast } from '../../ToastContext.jsx';
import { HISTORY_PAGE, historyWhen, openingParagraph, parseYear, sortChapters } from '../../lib/history.js';
import { useContentList, SidePanel, TextArea, PublishSwitch, StateBadge, RowButton, Panel, TabIntro, AddButton, PhotoIcon } from './shared.jsx';
import { useArticlePhotos, PhotoFields, SinglePhotoField } from './photos.jsx';

const describe = (r) => r.title;
const NEW_MAIN = { is_main: true, title: 'Ang Kasaysayan sa Parokya', author: '', body: '', photo_url: '', photos: [], published: false };
const newChapter = () => ({ is_main: false, title: '', year: '', date_label: '', author: '', body: '', photo_url: '', photos: [], published: false });

/**
 * History: the parish's story for the History page on the website (Ang
 * Simbahan → Kasaysayan). The main article (always there, 0068) opens the
 * page and is excerpted on Ang Simbahan; the chapters follow in order of year.
 */
export default function HistoryTab() {
  const list = useContentList({ table: 'history_articles', load: api.listHistory, remove: api.deleteHistory, describe });
  const [editing, setEditing] = useState(null);
  const main = list.rows.find((r) => r.is_main);
  const chapters = sortChapters(list.rows);

  return (
    <>
      <TabIntro text="The parish's history on the website, under Ang Simbahan. The main article opens the History page; the chapters follow it in order of year, each with its own cover photo and gallery.">
        <a href={HISTORY_PAGE} target="_blank" rel="noreferrer" className="font-semibold text-[13.5px] text-parish-blue no-underline hover:underline">Open the page ↗</a>
        <AddButton onClick={() => setEditing(newChapter())}>New chapter</AddButton>
      </TabIntro>

      {list.loading ? <Panel><LoadingState /></Panel> : list.error ? <Panel><ErrorState message={list.error} onRetry={list.reload} /></Panel> : (
        <>
          <MainCard row={main} busy={main && list.busyId === main.id} onEdit={() => setEditing(main || NEW_MAIN)} onToggle={() => list.togglePublished(main)} />

          <div className="flex items-baseline justify-between gap-3 mt-7 mb-3">
            <h3 className="m-0 font-bold text-[15px] text-parish-navy">Chapters <span className="font-semibold text-parish-muted">({chapters.length})</span></h3>
            <span className="text-[12.5px] text-parish-muted">Oldest first, as on the website</span>
          </div>
          {!chapters.length ? (
            <Panel><EmptyState title="No chapters yet" subtitle="Add one for each period or milestone: the founding, the first chapel, the new church…" /></Panel>
          ) : (
            <DataTable
              minWidth={720}
              columns={[{ label: 'Year' }, { label: 'Chapter' }, { label: 'Photos', align: 'center' }, { label: 'Status' }, { label: '', key: 'actions' }]}
              mobile={chapters.map((r) => <ChapterCard key={r.id} r={r} list={list} onEdit={() => setEditing(r)} />)}
            >
              {chapters.map((r) => (
                <tr key={r.id} className="border-t border-parish-line align-top">
                  <td className="px-4 py-3.5 font-serif font-bold text-[17px] text-parish-navy whitespace-nowrap">{historyWhen(r)}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <Thumb url={r.photo_url} />
                      <div className="min-w-0">
                        <div className="font-semibold text-[14.5px] text-parish-navy">{r.title}</div>
                        {r.body && <div className="text-[12.5px] text-parish-text2 line-clamp-2">{openingParagraph(r.body)}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-center text-[13.5px] text-parish-text2">{(r.photo_url ? 1 : 0) + (r.photos || []).length}</td>
                  <td className="px-4 py-3.5"><StateBadge state={r.published ? 'Published' : 'Draft'} /></td>
                  <td className="px-4 py-3.5 w-px"><ChapterActions r={r} list={list} onEdit={() => setEditing(r)} /></td>
                </tr>
              ))}
            </DataTable>
          )}
        </>
      )}

      {editing && <HistoryEditor row={editing} onClose={() => setEditing(null)} onSaved={(saved) => { list.upsert(saved); setEditing(null); }} />}
    </>
  );
}

function Thumb({ url, className = 'w-[72px] h-[48px]' }) {
  return (
    <div className={`${className} flex-none rounded-lg overflow-hidden bg-parish-sunk flex items-center justify-center text-parish-faint`}>
      {url ? <img src={url} alt="" className="w-full h-full object-cover" /> : <PhotoIcon size={20} />}
    </div>
  );
}

function ChapterActions({ r, list, onEdit, wrap = false }) {
  return (
    <div className={`flex gap-1.5 ${wrap ? 'flex-wrap' : 'justify-end'}`}>
      <RowButton onClick={onEdit} viewLabel="View">Edit</RowButton>
      <RowButton tone="gray" disabled={list.busyId === r.id} onClick={() => list.togglePublished(r)}>{r.published ? 'Unpublish' : 'Publish'}</RowButton>
      <RowButton tone="red" disabled={list.busyId === r.id} onClick={() => list.removeRow(r)}>Delete</RowButton>
    </div>
  );
}

/** A chapter on a phone, in place of the table row. */
function ChapterCard({ r, list, onEdit }) {
  return (
    <div className="flex gap-3 px-4 py-3.5 border-b border-parish-line last:border-b-0">
      <Thumb url={r.photo_url} className="w-[64px] h-[64px]" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-serif font-bold text-[16px] text-parish-navy">{historyWhen(r)}</span>
          <StateBadge state={r.published ? 'Published' : 'Draft'} />
        </div>
        <div className="font-semibold text-[14px] text-parish-navy mb-2">{r.title}</div>
        <ChapterActions r={r} list={list} onEdit={onEdit} wrap />
      </div>
    </div>
  );
}

/** The main article as a card: its photo and gallery, the opening paragraph, and its actions. */
function MainCard({ row, busy, onEdit, onToggle }) {
  if (!row) {
    return (
      <Panel className="p-6 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="font-semibold text-[15px] text-parish-navy">The main article isn't written yet</div>
          <div className="text-[13px] text-parish-muted">It opens the History page and is shown at the bottom of Ang Simbahan.</div>
        </div>
        <RowButton onClick={onEdit}>Write it</RowButton>
      </Panel>
    );
  }
  const gallery = (row.photos || []).filter((p) => p?.url);
  const excerpt = openingParagraph(row.body);
  return (
    <Panel className="overflow-hidden">
      <div className="grid md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="p-4 md:pr-0 flex flex-col gap-2">
          <div className="aspect-[16/10] rounded-xl overflow-hidden bg-parish-sunk flex items-center justify-center text-parish-faint">
            {row.photo_url ? <img src={row.photo_url} alt="" className="w-full h-full object-cover" /> : <PhotoIcon size={36} />}
          </div>
          {gallery.length > 0 && (
            <div className="grid grid-cols-5 gap-1.5">
              {gallery.slice(0, 5).map((p, i) => (
                <div key={p.url} className="relative aspect-square rounded-md overflow-hidden bg-parish-sunk">
                  <img src={p.url} alt="" className="w-full h-full object-cover" />
                  {i === 4 && gallery.length > 5 && <span className="absolute inset-0 bg-black/55 text-white font-bold text-[13px] flex items-center justify-center">+{gallery.length - 5}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="p-5 flex flex-col gap-2 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="gold">Main article</Badge>
            <StateBadge state={row.published ? 'Published' : 'Draft'} />
            <span className="text-[12px] text-parish-muted">{(row.photo_url ? 1 : 0) + gallery.length} photo(s)</span>
          </div>
          <div className="font-serif font-bold text-[22px] leading-tight text-parish-navy">{row.title}</div>
          <div className="text-[12px] text-parish-muted">{[row.author && `by ${row.author}`, row.updated_at && `updated ${fmtDateTime(row.updated_at, { time: false })}`].filter(Boolean).join(' · ')}</div>
          {excerpt
            ? <p className="m-0 text-[13.5px] leading-relaxed text-parish-text2 line-clamp-5 whitespace-pre-line">{excerpt}</p>
            : <p className="m-0 text-[13.5px] text-parish-muted italic">Not written yet. Its opening paragraph is what Ang Simbahan shows.</p>}
          {!row.published && <p className="m-0 text-[12.5px] text-parish-muted">The History page and its section on Ang Simbahan appear once this is published.</p>}
          <div className="flex gap-1.5 mt-auto pt-2">
            <RowButton onClick={onEdit} viewLabel="View">Edit</RowButton>
            <RowButton tone="gray" disabled={busy} onClick={onToggle}>{row.published ? 'Unpublish' : 'Publish'}</RowButton>
          </div>
        </div>
      </div>
    </Panel>
  );
}

/** The main article's or a chapter's editor; photos go to R2 under history/ as they're picked. */
function HistoryEditor({ row, onClose, onSaved }) {
  const toast = useToast();
  const isMain = !!row.is_main;
  const [form, setForm] = useState({
    ...row, title: row.title || '', year: row.year ?? '', date_label: row.date_label || '', author: row.author || '',
    body: row.body || '', photo_url: row.photo_url || '', photos: row.photos || [],
    body_photo_url: row.body_photo_url || '', body_photo_caption: row.body_photo_caption || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => { setForm((f) => ({ ...f, [k]: v })); setError(''); };
  const photos = useArticlePhotos({ form, setForm, setError, folder: 'history' });

  function close() {
    photos.cancel();
    onClose();
  }

  async function save() {
    if (!form.title.trim()) { setError(isMain ? 'Give the article a title.' : 'Give the chapter a title.'); return; }
    const year = parseYear(form.year);
    if (!isMain && year == null) { setError('Type the year it happened, e.g. 1952. Use "Date shown" for a period or a month.'); return; }
    if (photos.uploading) { setError('Wait for the photos to finish uploading.'); return; }
    setSaving(true);
    setError('');
    try {
      const gallery = form.photos.map((p) => ({ url: p.url, caption: (p.caption || '').trim() }));
      // The photo inside the article is the main article's (0069); left out
      // otherwise, so chapters still save before that migration.
      const { body_photo_url: inside, body_photo_caption: insideCaption, ...fields } = form;
      const withInside = isMain && (inside || 'body_photo_url' in row)
        ? { ...fields, body_photo_url: inside, body_photo_caption: inside ? insideCaption.trim() : '' }
        : fields;
      const saved = await api.saveHistory({
        ...withInside, title: form.title.trim(), author: form.author.trim(), photos: gallery,
        year: isMain ? null : year, date_label: isMain ? '' : form.date_label.trim(),
      });
      photos.saved();
      // Now that it has an ID: history<ID>_cover.jpg, history<ID>_1.jpg… on R2.
      let named = null;
      if (saved.photo_url || saved.photos?.length || saved.body_photo_url) {
        named = await api.nameImages('history_articles', saved.id).catch((e) => { toast.error(`Saved, but its photos weren't renamed: ${e.message}`); return null; });
      }
      toast.success(isMain ? 'Main article saved' : 'Chapter saved');
      onSaved(named || saved);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel
      title={isMain ? 'Main history article' : row.id ? 'Edit chapter' : 'New chapter'}
      subtitle={isMain ? 'Opens the History page; its first paragraph shows on Ang Simbahan.' : 'Placed on the History page by its year.'}
      onClose={close} onSave={save} saving={saving} error={error}
    >
      <Field label="Title" required>
        <TextInput value={form.title} onChange={(e) => set('title')(e.target.value)} maxLength={160} placeholder={isMain ? 'e.g. Ang Kasaysayan sa Parokya' : 'e.g. Ang unang kapilya sa Mua-an'} />
      </Field>
      {!isMain && (
        <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <Field label="Year" required>
            <TextInput inputMode="numeric" maxLength={4} value={form.year} onChange={(e) => set('year')(e.target.value.replace(/\D/g, ''))} placeholder="e.g. 1952" />
          </Field>
          <Field label="Date shown">
            <TextInput value={form.date_label} onChange={(e) => set('date_label')(e.target.value)} maxLength={40} placeholder="Optional, e.g. 1950–1965 or Hunyo 1952" />
          </Field>
        </div>
      )}
      <Field label="Author"><TextInput value={form.author} onChange={(e) => set('author')(e.target.value)} maxLength={120} placeholder="Optional, e.g. Parish Pastoral Council" /></Field>
      <Field label="Article">
        <TextArea
          rows={isMain ? 14 : 10} value={form.body} onChange={(e) => set('body')(e.target.value)}
          placeholder={isMain ? 'How the parish came to be. The first paragraph is the excerpt on Ang Simbahan. Blank lines start a new paragraph.' : 'What happened in this period. Blank lines start a new paragraph.'}
        />
      </Field>

      <PhotoFields
        form={form} photos={photos}
        coverLabel={isMain ? 'Main photo' : 'Cover photo'}
        coverHint={isMain ? 'The large photo at the top of the History page and on Ang Simbahan. A wide photo works best.' : 'Shown at the top of the chapter. A wide photo works best.'}
        galleryHint={isMain ? 'Shown beside the main photo at the top of the page. Pick several at once.' : 'Old photos from this period. Pick several at once.'}
      />

      {isMain && (
        <SinglePhotoField form={form} photos={photos} field="body_photo_url" label="Photo inside the article" hint="Optional. Shown in the article's second paragraph, with the text around it. Leave empty for none.">
          {form.body_photo_url && (
            <TextInput value={form.body_photo_caption} onChange={(e) => set('body_photo_caption')(e.target.value)} maxLength={200} placeholder="Caption (optional)" aria-label="Caption for the photo inside the article" className="w-full !py-2" />
          )}
        </SinglePhotoField>
      )}

      <PublishSwitch checked={!!form.published} onChange={set('published')} />
    </SidePanel>
  );
}
