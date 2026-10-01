import React, { useState } from 'react';
import { api } from '../../api.js';
import { Field, TextInput } from '../ui.jsx';
import { Pagination, EmptyState, LoadingState, ErrorState } from '../admin.jsx';
import { fmtDate } from '../../constants.js';
import { useClientList } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { sundayOf, todayIso, addDays } from '../../lib/website.js';
import { useContentList, SidePanel, TextArea, PublishSwitch, StateBadge, RowButton, Panel, TabIntro, AddButton } from './shared.jsx';

const describe = (r) => `Bulletin for ${fmtDate(r.week_of)}`;

export default function BulletinTab() {
  const list = useContentList({ table: 'bulletins', load: api.listBulletins, remove: api.deleteBulletin, describe });
  const [editing, setEditing] = useState(null);
  const sorted = [...list.rows].sort((a, b) => b.week_of.localeCompare(a.week_of));
  const page = useClientList(sorted, (r) => `${r.title} ${r.body || ''}`);
  const latest = sorted[0];

  function newBulletin(copyFrom) {
    // The Sunday after the latest one, or this week's Sunday for the first.
    const week = latest ? addDays(latest.week_of, 7) : sundayOf(todayIso());
    setEditing({
      week_of: week,
      title: copyFrom ? copyFrom.title : 'Parish Bulletin',
      body: copyFrom ? copyFrom.body || '' : '',
      published: false,
    });
  }

  return (
    <>
      <TabIntro text="The weekly bulletin, typed in. Each one is filed under the Sunday of its week. Copying last week's keeps the regular sections so only the news needs changing.">
        {latest && <RowButton className="!py-2.5 !text-[13.5px]" onClick={() => newBulletin(latest)}>Copy last week's</RowButton>}
        <AddButton onClick={() => newBulletin(null)}>New bulletin</AddButton>
      </TabIntro>

      <Panel className="overflow-hidden">
        {list.loading ? <LoadingState /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !list.rows.length ? (
          <EmptyState title="No bulletins yet" subtitle="Type in this week's bulletin." />
        ) : (
          page.rows.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-5 py-4 border-b border-[#f1e8d5] last:border-b-0 flex-wrap">
              <div className="w-[120px]">
                <div className="font-bold text-[11px] tracking-[.1em] uppercase text-[var(--p-gold-deep)]">Week of</div>
                <div className="font-serif text-[18px] font-semibold text-parish-blue">{fmtDate(r.week_of)}</div>
              </div>
              <div className="flex-1 min-w-[180px]">
                <div className="font-semibold text-[15px] text-parish-navy">{r.title}</div>
                <div className="text-[12.5px] text-parish-muted">{(r.body || '').trim() ? `${(r.body || '').trim().split(/\s+/).length} words` : 'Empty'}</div>
              </div>
              <StateBadge state={r.published ? 'Published' : 'Draft'} />
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

      {editing && <BulletinEditor row={editing} onClose={() => setEditing(null)} onSaved={(saved) => { list.upsert(saved); setEditing(null); }} />}
    </>
  );
}

function BulletinEditor({ row, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(row);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    if (!form.week_of) { setError('Choose the week.'); return; }
    if (!form.title.trim()) { setError('Give the bulletin a title.'); return; }
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveBulletin({ ...form, week_of: sundayOf(form.week_of), title: form.title.trim() });
      toast.success('Bulletin saved');
      onSaved(saved);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel title={row.id ? 'Edit bulletin' : 'New bulletin'} subtitle={`Week of ${fmtDate(sundayOf(form.week_of || todayIso()))}`} onClose={onClose} onSave={save} saving={saving} error={error}>
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <Field label="Week of (Sunday)" required><TextInput type="date" value={form.week_of} onChange={(e) => set('week_of')(e.target.value)} /></Field>
        <Field label="Title" required><TextInput value={form.title} onChange={(e) => set('title')(e.target.value)} maxLength={150} /></Field>
      </div>
      <Field label="Bulletin">
        <TextArea rows={18} value={form.body || ''} onChange={(e) => set('body')(e.target.value)} placeholder={'Type the bulletin here. Put each section on its own line, e.g.\n\nMGA PAHIBALO\n…\n\nMGA MISA KARONG SEMANA\n…'} />
      </Field>
      <PublishSwitch checked={!!form.published} onChange={set('published')} />
    </SidePanel>
  );
}
