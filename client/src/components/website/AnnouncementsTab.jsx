import React, { useState } from 'react';
import { api } from '../../api.js';
import { Field, TextInput, Select, Checkbox, Badge } from '../ui.jsx';
import { FilterSelect, SearchInput, Pagination, EmptyState, LoadingState, ErrorState } from '../admin.jsx';
import { fmtDate } from '../../constants.js';
import { useUrlState, urlListPage } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { ANNOUNCEMENT_CATEGORIES, announcementState, todayIso } from '../../lib/website.js';
import { useContentList, SidePanel, TextArea, PublishSwitch, StateBadge, RowButton, Panel, TabIntro, AddButton } from './shared.jsx';

const STATES = ['Live', 'Scheduled', 'Draft', 'Expired'];
const URL_DEFAULTS = { state: 'All', q: '', page: 1, size: 10 };
const URL_ALLOWED = { state: ['All', ...STATES], size: [10, 20, 50] };
const describe = (r) => r.title;

export default function AnnouncementsTab() {
  const list = useContentList({ table: 'announcements', load: api.listAnnouncements, remove: api.deleteAnnouncement, describe });
  const [editing, setEditing] = useState(null);
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const { state } = url;
  const setState = (v) => setUrl({ state: v });
  const today = todayIso();

  // Pinned first, then newest start date first.
  const sorted = [...list.rows].sort((a, b) => (b.pinned - a.pinned) || b.publish_on.localeCompare(a.publish_on) || b.id - a.id);
  const filtered = state === 'All' ? sorted : sorted.filter((r) => announcementState(r, today) === state);
  const page = urlListPage(filtered, (r) => `${r.title} ${r.body || ''} ${r.category}`, url, setUrl);

  return (
    <>
      <TabIntro text="News for parishioners. Set a start date to schedule one ahead and an end date so it drops off by itself. Urgent ones will show as a banner on the website's home page.">
        <AddButton onClick={() => setEditing({ title: '', body: '', category: 'Parish', urgent: false, pinned: false, publish_on: today, expires_on: '', published: true })}>
          New announcement
        </AddButton>
      </TabIntro>

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
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {r.pinned && <Badge tone="gold">Pinned</Badge>}
                  {r.urgent && <Badge tone="red">Urgent</Badge>}
                  <Badge tone="blue">{r.category}</Badge>
                  <StateBadge state={announcementState(r, today)} />
                </div>
                <div className="font-semibold text-[15px] text-parish-navy">{r.title}</div>
                {r.body && <div className="text-[13px] text-parish-text2 line-clamp-2 whitespace-pre-line">{r.body}</div>}
                <div className="text-[12px] text-parish-muted mt-1">
                  From {fmtDate(r.publish_on)}{r.expires_on ? ` until ${fmtDate(r.expires_on)}` : ''}
                </div>
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

      {editing && <AnnouncementEditor row={editing} onClose={() => setEditing(null)} onSaved={(saved) => { list.upsert(saved); setEditing(null); }} />}
    </>
  );
}

function AnnouncementEditor({ row, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ ...row, expires_on: row.expires_on || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.title.trim()) { setError('Give the announcement a title.'); return; }
    if (!form.publish_on) { setError('Choose the date it starts showing.'); return; }
    if (form.expires_on && form.expires_on < form.publish_on) { setError('The end date must be on or after the start date.'); return; }
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveAnnouncement({ ...form, title: form.title.trim() });
      toast.success('Announcement saved');
      onSaved(saved);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel title={row.id ? 'Edit announcement' : 'New announcement'} onClose={onClose} onSave={save} saving={saving} error={error}>
      <Field label="Title" required><TextInput value={form.title} onChange={(e) => set('title')(e.target.value)} maxLength={150} placeholder="e.g. Walay Misa sa Kapilya sa Balabag karong Domingo" /></Field>
      <Field label="Message">
        <TextArea rows={7} value={form.body || ''} onChange={(e) => set('body')(e.target.value)} placeholder="The full announcement. Blank lines start a new paragraph." />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Category">
          <Select value={form.category} onChange={(e) => set('category')(e.target.value)}>
            {ANNOUNCEMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Show from" required><TextInput type="date" value={form.publish_on} onChange={(e) => set('publish_on')(e.target.value)} /></Field>
        <Field label="Until (optional)"><TextInput type="date" value={form.expires_on} min={form.publish_on} onChange={(e) => set('expires_on')(e.target.value)} /></Field>
      </div>
      <div className="flex gap-5 flex-wrap">
        <label className="flex items-center gap-2 text-[14px] font-semibold text-parish-navy cursor-pointer">
          <Checkbox checked={!!form.urgent} onChange={(e) => set('urgent')(e.target.checked)} /> Urgent
        </label>
        <label className="flex items-center gap-2 text-[14px] font-semibold text-parish-navy cursor-pointer">
          <Checkbox checked={!!form.pinned} onChange={(e) => set('pinned')(e.target.checked)} /> Pin to the top
        </label>
      </div>
      <PublishSwitch checked={!!form.published} onChange={set('published')} />
    </SidePanel>
  );
}
