import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../ToastContext.jsx';
import { Field, TextInput, Badge } from './ui.jsx';
import { EmptyState, LoadingState, ErrorState } from './admin.jsx';
import { SidePanel, TextArea, RowButton, Panel, TabIntro } from './panels.jsx';
import { PublishSwitch } from './website/shared.jsx';
import { fmtDate } from '../constants.js';

/**
 * What the website says about each ministry and organization (0111):
 * whether it is listed, a short purpose, who can join, when and where it
 * meets, and a contact person who is only shown once they have agreed. The
 * "Interesado ko" sign-ups land in Requests → Interested.
 */
export default function GroupWebsiteDetails() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);

  function load() {
    setError('');
    api.listGroupDetails().then(setRows).catch((e) => setError(e.message || 'Could not load'));
  }
  useEffect(load, []);

  if (error) return <Panel><ErrorState message={error} onRetry={load} /></Panel>;
  if (!rows) return <Panel><LoadingState /></Panel>;

  const upsert = (saved) => setRows((rs) => rs.map((r) => (r.kind === saved.kind && r.id === saved.id ? saved : r)));

  return (
    <>
      <TabIntro text="Choose which ministries and organizations show on the website's Komunidad → Mga Grupo page, and what it says about each. Parishioners can tap “Interesado ko” on a listed group; those sign-ups arrive in Requests → Interested. Member counts under 5 are never shown." />
      <Panel className="overflow-hidden">
        {!rows.length ? <EmptyState title="No ministries or organizations yet" subtitle="Add them in the other tabs first." /> : rows.map((r) => (
          <div key={`${r.kind}-${r.id}`} className="flex items-center gap-3 px-5 py-3.5 border-b border-parish-line last:border-b-0 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="font-semibold text-[15px] text-parish-navy">{r.name}</div>
              <div className="text-[12.5px] text-parish-muted">{r.kind === 'ministry' ? 'Ministry' : 'Organization'}{r.public_blurb ? '' : ' · no description yet'}</div>
            </div>
            {r.contact_public && <Badge tone="blue" title={r.contact_consent_on ? `Agreed ${fmtDate(r.contact_consent_on)}` : ''}>Contact shown</Badge>}
            <Badge tone={r.published ? 'green' : 'gray'}>{r.published ? 'On the website' : 'Not shown'}</Badge>
            <RowButton onClick={() => setEditing(r)}>Edit</RowButton>
          </div>
        ))}
      </Panel>
      {editing && <Editor row={editing} onClose={() => setEditing(null)} onSaved={(saved) => { upsert(saved); setEditing(null); }} />}
    </>
  );
}

function Editor({ row, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    published: !!row.published, public_blurb: row.public_blurb || '', who_can_join: row.who_can_join || '', meets: row.meets || '',
    contact_name: row.contact_name || '', contact_mobile: row.contact_mobile || '', contact_public: !!row.contact_public, contact_consent_on: row.contact_consent_on || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (form.published && !form.public_blurb.trim()) { setError('Write a short description before showing it on the website.'); return; }
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveGroupDetails(row.kind, row.id, form);
      toast.success('Saved');
      onSaved(saved);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel title={row.name} subtitle={row.kind === 'ministry' ? 'Ministry on the website' : 'Organization on the website'} onClose={onClose} onSave={save} saving={saving} error={error}>
      <Field label="What it does (one or two lines, in Bisaya)" required={form.published}>
        <TextArea rows={3} value={form.public_blurb} onChange={set('public_blurb')} maxLength={400} placeholder="e.g. Nag-alagad sa pag-awit atol sa Misa sa Domingo." />
      </Field>
      <Field label="Who can join">
        <TextInput value={form.who_can_join} onChange={set('who_can_join')} maxLength={200} placeholder="e.g. 16 anyos pataas, nagpuyo sa parokya" />
      </Field>
      <Field label="When and where it meets">
        <TextInput value={form.meets} onChange={set('meets')} maxLength={200} placeholder="e.g. Matag Sabado, 4:00 PM, simbahan" />
      </Field>
      <div className="rounded-xl border border-parish-border bg-parish-field p-4 flex flex-col gap-3">
        <div className="font-semibold text-[13.5px] text-parish-navy">Contact person (optional)</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><TextInput value={form.contact_name} onChange={set('contact_name')} maxLength={120} /></Field>
          <Field label="Mobile"><TextInput type="tel" value={form.contact_mobile} onChange={set('contact_mobile')} maxLength={30} /></Field>
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={form.contact_public} onChange={(e) => setForm((f) => ({ ...f, contact_public: e.target.checked }))} className="w-[19px] h-[19px] mt-0.5 accent-parish-blue cursor-pointer" />
          <span>
            <span className="block font-semibold text-[13.5px] text-parish-navy">Show the contact on the website</span>
            <span className="block text-[12.5px] text-parish-muted">Tick only when this person has agreed to have their name{form.contact_mobile.trim() ? ' and number' : ''} public (Data Privacy Act). The day is noted.</span>
          </span>
        </label>
      </div>
      <PublishSwitch checked={form.published} onChange={(v) => setForm((f) => ({ ...f, published: v }))} />
    </SidePanel>
  );
}
