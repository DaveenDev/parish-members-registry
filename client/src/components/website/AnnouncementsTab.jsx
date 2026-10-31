import React, { useRef, useState } from 'react';
import { api } from '../../api.js';
import { Field, TextInput, Select, Checkbox, Badge } from '../ui.jsx';
import { FilterSelect, SearchInput, Pagination, EmptyState, LoadingState, ErrorState } from '../admin.jsx';
import { fmtDate } from '../../constants.js';
import { useUrlState, urlListPage } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { ANNOUNCEMENT_CATEGORIES, ANNOUNCEMENT_DAYS, MAX_PINNED, announcementLastDay, announcementState, todayIso } from '../../lib/website.js';
import { useContentList, SidePanel, SectionLabel, TextArea, PublishSwitch, StateBadge, RowButton, Panel, TabIntro, AddButton, PhotoIcon, FilePick, PhotoSizeHint, UploadOverlay } from './shared.jsx';

const STATES = ['Live', 'Scheduled', 'Draft', 'Expired'];
const URL_DEFAULTS = { state: 'All', q: '', page: 1, size: 10 };
const URL_ALLOWED = { state: ['All', ...STATES], size: [10, 20, 50] };
const describe = (r) => r.title;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export default function AnnouncementsTab() {
  const list = useContentList({ table: 'announcements', load: api.listAnnouncements, remove: api.deleteAnnouncement, describe });
  const [editing, setEditing] = useState(null);
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const { state } = url;
  const setState = (v) => setUrl({ state: v });
  const today = todayIso();

  // Latest first: newest start date, then most recently added. Pinned ones keep
  // their badge here; pinning only orders the public website.
  const sorted = [...list.rows].sort((a, b) => b.publish_on.localeCompare(a.publish_on) || b.id - a.id);
  const filtered = state === 'All' ? sorted : sorted.filter((r) => announcementState(r, today) === state);
  const page = urlListPage(filtered, (r) => `${r.title} ${r.body || ''} ${r.category}`, url, setUrl);
  // Pinned ones that are on the website now (urgent ones show as cards, not in the pinned strip).
  const livePinned = list.rows.filter((r) => r.pinned && !r.urgent && announcementState(r, today) === 'Live');

  return (
    <>
      <TabIntro text={`News for parishioners. Set a start date to schedule one ahead. It drops off the website on its end date, or ${ANNOUNCEMENT_DAYS} days after it starts if it has none (pinned ones stay until unpinned). Urgent ones will show as a banner on the website's home page.`}>
        <AddButton onClick={() => setEditing({ title: '', body: '', category: 'Parish', urgent: false, pinned: false, publish_on: today, expires_on: '', published: true })}>
          New announcement
        </AddButton>
      </TabIntro>

      {livePinned.length > MAX_PINNED && (
        <PinWarning>
          {livePinned.length} announcements are pinned on the website. A pin stands out when it's rare: keep it to {MAX_PINNED} or fewer and unpin the rest.
        </PinWarning>
      )}

      {list.rows.length > 0 && (
        <div className="flex gap-2.5 flex-wrap mb-4">
          <SearchInput placeholder="Search announcements…" aria-label="Search announcements" value={page.query} onChange={(e) => page.setQuery(e.target.value)} />
          <FilterSelect value={state} onChange={(e) => setState(e.target.value)} aria-label="Filter by status">
            <option value="All">All statuses</option>
            {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </FilterSelect>
        </div>
      )}

      <Panel className="overflow-hidden">
        {list.loading ? <LoadingState /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.rows.length ? (
          <EmptyState title="No announcements yet" subtitle="Post this week's parish news." />
        ) : !page.total ? (
          <EmptyState title="Nothing matches" />
        ) : (
          page.rows.map((r) => (
            <div key={r.id} className="flex items-start gap-3 px-5 py-4 border-b border-parish-line last:border-b-0 flex-wrap">
              {r.photo_url && <img src={r.photo_url} alt="" className="w-[72px] h-[48px] flex-none rounded-lg object-cover border border-parish-line" />}
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {r.pinned && <Badge tone="gold">Pinned</Badge>}
                  {r.urgent && <Badge tone="red">Urgent</Badge>}
                  <Badge tone="blue">{r.category}</Badge>
                  <StateBadge state={announcementState(r, today)} />
                </div>
                <div className="font-semibold text-[15px] text-parish-navy">{r.title}</div>
                {r.body && <div className="text-[13px] text-parish-text2 line-clamp-2 whitespace-pre-line">{r.body}</div>}
                <div className="text-[12px] text-parish-muted mt-1">From {fmtDate(r.publish_on)} {untilText(r)}</div>
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

      {editing && (
        <AnnouncementEditor
          row={editing}
          otherPinned={livePinned.filter((r) => r.id !== editing.id).length}
          onClose={() => setEditing(null)}
          onSaved={(saved) => { list.upsert(saved); setEditing(null); }}
        />
      )}
    </>
  );
}

/** "until 12 Oct 2026", "until 2 Nov 2026 (30 days)" or "until unpinned". */
function untilText(r) {
  if (r.expires_on) return `until ${fmtDate(r.expires_on)}`;
  if (r.pinned) return '· no end date, stays while pinned';
  const last = announcementLastDay(r);
  return last ? `until ${fmtDate(last)} (${ANNOUNCEMENT_DAYS} days, no end date set)` : '';
}

function PinWarning({ children }) {
  return (
    <div role="status" className="mb-4 rounded-xl border px-4 py-3 text-[13.5px] leading-relaxed bg-parish-warnBg border-parish-warnBorder text-parish-warnStrong">
      {children}
    </div>
  );
}

function AnnouncementEditor({ row, otherPinned, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ ...row, expires_on: row.expires_on || '' });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  // The cover is uploaded to R2 as soon as it's picked, as on events.
  // Cancelling deletes what this session uploaded; a cover taken off is
  // deleted once the announcement is saved.
  const uploaded = useRef(new Set());
  const replaced = useRef(new Set());
  const coverRef = useRef(form.photo_url || '');
  coverRef.current = form.photo_url || '';

  function setCover(url) {
    const old = coverRef.current;
    if (old && uploaded.current.has(old)) {
      uploaded.current.delete(old);
      api.deleteImage(old).catch(() => {});
    } else if (old) {
      replaced.current.add(old);
    }
    setForm((f) => ({ ...f, photo_url: url }));
  }

  async function pickCover([file]) {
    if (!file.type.startsWith('image/')) { setError(`${file.name} isn't an image`); return; }
    if (file.size > MAX_SOURCE_BYTES) { setError(`${file.name} is over 25 MB`); return; }
    setUploading(true);
    setError('');
    try {
      const url = await api.uploadImage(file, 'announcements');
      uploaded.current.add(url);
      setCover(url);
    } catch (e) {
      setError(e.message || 'Could not upload the photo');
    } finally {
      setUploading(false);
    }
  }

  function close() {
    for (const url of uploaded.current) api.deleteImage(url).catch(() => {});
    onClose();
  }

  async function save() {
    if (!form.title.trim()) { setError('Give the announcement a title.'); return; }
    if (!form.publish_on) { setError('Choose the date it starts showing.'); return; }
    if (form.expires_on && form.expires_on < form.publish_on) { setError('The end date must be on or after the start date.'); return; }
    if (uploading) { setError('Wait for the photo to finish uploading.'); return; }
    setSaving(true);
    setError('');
    try {
      const { photo_url: cover, ...fields } = form;
      // Leave the cover out when there never was one, so announcements still save before the 0112 migration.
      const withCover = cover || 'photo_url' in row ? { ...fields, photo_url: cover || '' } : fields;
      const saved = await api.saveAnnouncement({ ...withCover, title: form.title.trim() });
      for (const url of replaced.current) api.deleteImage(url).catch(() => {});
      uploaded.current.clear();
      // Now that it has an ID: announcement<ID>_cover.jpg on R2.
      let named = null;
      if (saved.photo_url) {
        named = await api.nameImages('announcements', saved.id).catch((e) => { toast.error(`Announcement saved, but its photo wasn't renamed: ${e.message}`); return null; });
      }
      toast.success('Announcement saved');
      onSaved(named || saved);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel title={row.id ? 'Edit announcement' : 'New announcement'} onClose={close} onSave={save} saving={saving} error={error}>
      <Field label="Title" required><TextInput value={form.title} onChange={(e) => set('title')(e.target.value)} maxLength={150} placeholder="e.g. Walay Misa sa Kapilya sa Balabag karong Domingo" /></Field>
      <Field label="Message">
        <TextArea rows={7} value={form.body || ''} onChange={(e) => set('body')(e.target.value)} placeholder="The full announcement. Blank lines start a new paragraph." />
      </Field>
      <SectionLabel>Photo or poster (optional)</SectionLabel>
      <div className="flex items-start gap-4 flex-wrap">
        <div className="relative w-[220px] aspect-[16/10] rounded-xl overflow-hidden border-2 border-dashed border-parish-borderStrong bg-parish-field flex items-center justify-center text-parish-faint">
          {form.photo_url ? <img src={form.photo_url} alt="Cover" className="w-full h-full object-cover" /> : <PhotoIcon size={32} />}
          <UploadOverlay busy={uploading} />
        </div>
        <div className="flex flex-col gap-2 items-start">
          <FilePick label={form.photo_url ? 'Replace photo' : 'Upload photo'} onFiles={pickCover} busy={uploading} />
          {form.photo_url && !uploading && <button type="button" onClick={() => setCover('')} className="appearance-none border-none bg-transparent cursor-pointer p-0 font-semibold text-[13px] text-parish-error">Remove photo</button>}
          <span className="text-[12px] text-parish-muted max-w-[260px]">
            Shown on the announcement's card and page. Put the key details in the message too: the urgent banner and the pinned list show no photo, and screen readers can't read a poster.
          </span>
          <PhotoSizeHint kind="announcement" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Category">
          <Select value={form.category} onChange={(e) => set('category')(e.target.value)}>
            {ANNOUNCEMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Show from" required><TextInput type="date" value={form.publish_on} onChange={(e) => set('publish_on')(e.target.value)} /></Field>
        <Field label="Until (optional)"><TextInput type="date" value={form.expires_on} min={form.publish_on} onChange={(e) => set('expires_on')(e.target.value)} /></Field>
      </div>
      {!form.expires_on && (
        <div className="-mt-2 text-[12.5px] text-parish-muted">
          {form.pinned
            ? 'No end date: it stays on the website while it\'s pinned.'
            : `No end date: it drops off the website ${ANNOUNCEMENT_DAYS} days after it starts${form.publish_on ? `, after ${fmtDate(announcementLastDay(form))}` : ''}.`}
        </div>
      )}
      <div className="flex gap-5 flex-wrap">
        <label className="flex items-center gap-2 text-[14px] font-semibold text-parish-navy cursor-pointer">
          <Checkbox checked={!!form.urgent} onChange={(e) => set('urgent')(e.target.checked)} /> Urgent
        </label>
        <label className="flex items-center gap-2 text-[14px] font-semibold text-parish-navy cursor-pointer">
          <Checkbox checked={!!form.pinned} onChange={(e) => set('pinned')(e.target.checked)} /> Pin to the top
        </label>
      </div>
      {form.pinned && !form.urgent && otherPinned >= MAX_PINNED && (
        <PinWarning>
          {otherPinned} other announcement{otherPinned === 1 ? ' is' : 's are'} already pinned. A pin stands out when it's rare; consider unpinning one of them, or leave this one unpinned.
        </PinWarning>
      )}
      <PublishSwitch checked={!!form.published} onChange={set('published')} />
    </SidePanel>
  );
}
