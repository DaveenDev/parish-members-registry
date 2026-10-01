import React, { useState } from 'react';
import { api } from '../../api.js';
import { Field, TextInput } from '../ui.jsx';
import { EmptyState, LoadingState, ErrorState } from '../admin.jsx';
import { fmtDateTime } from '../../constants.js';
import { useToast } from '../../ToastContext.jsx';
import { useContentList, SidePanel, SectionLabel, TextArea, PublishSwitch, StateBadge, RowButton, Panel, TabIntro } from './shared.jsx';

const describe = (r) => r.title;

export default function SacramentGuidesTab() {
  const list = useContentList({ table: 'sacrament_guides', load: api.listSacramentGuides, remove: async () => {}, describe });
  const [editing, setEditing] = useState(null);

  return (
    <>
      <TabIntro text="What families need to know before asking the office: the steps, the documents to bring, seminar schedules and fees. Each sacrament is one guide." />

      {list.loading ? <Panel><LoadingState /></Panel> : list.error ? <Panel><ErrorState message={list.error} onRetry={list.reload} /></Panel> : !list.rows.length ? (
        <Panel><EmptyState title="No guides found" subtitle="Re-run the 0011 migration to add the six sacrament guides." /></Panel>
      ) : (
        <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))' }}>
          {list.rows.map((g) => {
            const steps = (g.steps || []).length;
            const docs = (g.requirements || []).length;
            const empty = !g.summary && !steps && !docs;
            return (
              <Panel key={g.id} className="p-5 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-serif text-[20px] font-semibold text-parish-navy leading-tight">{g.title}</div>
                  <StateBadge state={g.published ? 'Published' : 'Draft'} />
                </div>
                <div className="text-[13px] text-parish-text2 flex-1">
                  {empty ? <span className="text-parish-muted">Not filled in yet.</span> : `${steps} step${steps === 1 ? '' : 's'} · ${docs} document${docs === 1 ? '' : 's'}`}
                </div>
                <div className="text-[12px] text-parish-muted">Updated {fmtDateTime(g.updated_at, { time: false })}</div>
                <div className="flex gap-1.5 mt-1">
                  <RowButton onClick={() => setEditing(g)}>{empty ? 'Fill in' : 'Edit'}</RowButton>
                  <RowButton tone="gray" disabled={list.busyId === g.id} onClick={() => list.togglePublished(g)}>{g.published ? 'Unpublish' : 'Publish'}</RowButton>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {editing && <GuideEditor row={editing} onClose={() => setEditing(null)} onSaved={(saved) => { list.upsert(saved); setEditing(null); }} />}
    </>
  );
}

function GuideEditor({ row, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    ...row,
    steps: (row.steps || []).map((s) => ({ title: s.title || '', detail: s.detail || '' })),
    requirements: [...(row.requirements || [])],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const setStep = (i, k, v) => set('steps')(form.steps.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const moveStep = (i, by) => {
    const steps = [...form.steps];
    [steps[i], steps[i + by]] = [steps[i + by], steps[i]];
    set('steps')(steps);
  };
  const setDoc = (i, v) => set('requirements')(form.requirements.map((d, j) => (j === i ? v : d)));

  async function save() {
    if (!String(form.title || '').trim()) { setError('The guide needs a title.'); return; }
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveSacramentGuide({
        id: form.id,
        title: form.title.trim(),
        summary: form.summary,
        steps: form.steps.filter((s) => s.title.trim() || s.detail.trim()).map((s) => ({ title: s.title.trim(), detail: s.detail.trim() })),
        requirements: form.requirements.map((d) => d.trim()).filter(Boolean),
        schedule: form.schedule,
        fees: form.fees,
        notes: form.notes,
        published: form.published,
      });
      toast.success('Guide saved');
      onSaved(saved);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel title={row.title} subtitle="Sacrament guide" onClose={onClose} onSave={save} saving={saving} error={error}>
      <Field label="Title" required><TextInput value={form.title} onChange={(e) => set('title')(e.target.value)} maxLength={120} /></Field>
      <Field label="Short introduction">
        <TextArea rows={3} value={form.summary || ''} onChange={(e) => set('summary')(e.target.value)} placeholder="Who this is for and how far ahead to come to the office" />
      </Field>

      <SectionLabel>Steps, in order</SectionLabel>
      <div className="flex flex-col gap-2.5">
        {form.steps.map((s, i) => (
          <div key={i} className="border border-parish-line2 rounded-xl bg-parish-field p-3 flex gap-3">
            <div className="w-7 h-7 rounded-full bg-parish-fill text-white font-bold text-[13px] flex items-center justify-center flex-none mt-1" aria-hidden>{i + 1}</div>
            <div className="flex-1 flex flex-col gap-2 min-w-0">
              <TextInput aria-label={`Step ${i + 1} title`} value={s.title} onChange={(e) => setStep(i, 'title', e.target.value)} placeholder="e.g. Attend the pre-Cana seminar" className="!py-2.5 !text-[15px]" />
              <TextArea aria-label={`Step ${i + 1} details`} rows={2} value={s.detail} onChange={(e) => setStep(i, 'detail', e.target.value)} placeholder="Details (optional): when, where, what to bring" className="!py-2.5 !text-[14px]" />
              <div className="flex gap-1.5">
                <RowButton tone="gray" disabled={i === 0} onClick={() => moveStep(i, -1)} aria-label={`Move step ${i + 1} up`}>↑ Up</RowButton>
                <RowButton tone="gray" disabled={i === form.steps.length - 1} onClick={() => moveStep(i, 1)} aria-label={`Move step ${i + 1} down`}>↓ Down</RowButton>
                <RowButton tone="red" onClick={() => set('steps')(form.steps.filter((_, j) => j !== i))}>Remove</RowButton>
              </div>
            </div>
          </div>
        ))}
        <RowButton className="self-start" onClick={() => set('steps')([...form.steps, { title: '', detail: '' }])}>+ Add a step</RowButton>
      </div>

      <SectionLabel>Documents to bring</SectionLabel>
      <div className="flex flex-col gap-2">
        {form.requirements.map((d, i) => (
          <div key={i} className="flex gap-2 items-center">
            <span className="text-parish-gold flex-none" aria-hidden>☐</span>
            <TextInput aria-label={`Document ${i + 1}`} value={d} onChange={(e) => setDoc(i, e.target.value)} placeholder="e.g. PSA birth certificate (original and photocopy)" className="!py-2.5 !text-[15px]" />
            <RowButton tone="red" onClick={() => set('requirements')(form.requirements.filter((_, j) => j !== i))} aria-label={`Remove document ${i + 1}`}>Remove</RowButton>
          </div>
        ))}
        <RowButton className="self-start" onClick={() => set('requirements')([...form.requirements, ''])}>+ Add a document</RowButton>
      </div>

      <SectionLabel>Other details</SectionLabel>
      <Field label="Schedule (seminars, when it's celebrated)">
        <TextArea rows={2} value={form.schedule || ''} onChange={(e) => set('schedule')(e.target.value)} placeholder="e.g. Baptisms every Sunday after the 8:00 AM Mass. Seminar on the Saturday before." />
      </Field>
      <Field label="Fees / donation (leave blank to not show)">
        <TextInput value={form.fees || ''} onChange={(e) => set('fees')(e.target.value)} placeholder="e.g. ₱500 donation, includes the certificate" />
      </Field>
      <Field label="Other notes">
        <TextArea rows={2} value={form.notes || ''} onChange={(e) => set('notes')(e.target.value)} placeholder="e.g. Godparents must be confirmed Catholics" />
      </Field>
      <PublishSwitch checked={!!form.published} onChange={set('published')} />
    </SidePanel>
  );
}
