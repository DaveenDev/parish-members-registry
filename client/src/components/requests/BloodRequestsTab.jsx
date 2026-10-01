import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { fmtDate, fmtDateTime, BLOOD_TYPES } from '../../constants.js';
import { useUrlState } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../ConfirmDialog.jsx';
import { Field, TextInput, Select, Checkbox, Badge } from '../ui.jsx';
import { EmptyState, LoadingState, ErrorState, rowActivationProps } from '../admin.jsx';
import { SidePanel, SectionLabel, TextArea, RowButton, Panel, TabIntro, AddButton, Detail } from '../panels.jsx';
import { useRows, StatusBadge, ContactLinks, FilterChips, receivedText, SourceNote } from './common.jsx';
import {
  BLOOD_OPEN, CONTACT_STATUSES, SOURCES, STATUS_TONES, AVAILABILITY_TONES,
  matchDonors, compatibleDonorTypes, bloodCallSms,
} from '../../lib/requests.js';
import { todayIso, addDays } from '../../lib/website.js';

function urgency(r, today = todayIso()) {
  if (!r.needed_by || !BLOOD_OPEN.includes(r.status)) return null;
  if (r.needed_by < today) return { tone: 'gray', text: 'Date passed' };
  if (r.needed_by <= addDays(today, 1)) return { tone: 'red', text: r.needed_by === today ? 'Needed today' : 'Needed tomorrow' };
  return null;
}

const URL_DEFAULTS = { view: 'open' };
const URL_ALLOWED = { view: ['open', 'all'] };

export default function BloodRequestsTab({ onCountsChanged }) {
  const list = useRows(api.listBloodRequests);
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const { view } = url;
  const setView = (v) => setUrl({ view: v });
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);

  const openCount = list.rows.filter((r) => BLOOD_OPEN.includes(r.status)).length;
  const shown = list.rows
    .filter((r) => (view === 'open' ? BLOOD_OPEN.includes(r.status) : true))
    .sort((a, b) => (view === 'open'
      ? String(a.needed_by || '9999').localeCompare(String(b.needed_by || '9999')) || a.created_at.localeCompare(b.created_at)
      : b.created_at.localeCompare(a.created_at)));
  const open = list.rows.find((r) => r.id === openId);

  function saved(row) {
    list.upsert(row);
    onCountsChanged();
  }

  return (
    <>
      <TabIntro text="Families asking for blood. Open a request to see the donors whose blood type matches, then call or text them yourself. Donor names and numbers are never shown to the public.">
        <AddButton onClick={() => setCreating(true)}>Walk-in / phone request</AddButton>
      </TabIntro>

      <div className="mb-4">
        <FilterChips label="Which requests" options={[['open', 'Open', openCount], ['all', 'All']]} value={view} onChange={setView} />
      </div>

      <Panel className="overflow-hidden">
        {list.loading ? <LoadingState /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !shown.length ? (
          <EmptyState title={list.rows.length ? 'No open blood requests' : 'No blood requests yet'} />
        ) : (
          shown.map((r) => {
            const u = urgency(r);
            return (
              <div key={r.id} {...rowActivationProps(() => setOpenId(r.id), `Open request ${r.ref_no}`)}
                className="flex items-center gap-4 px-5 py-3.5 border-b border-parish-line last:border-b-0 flex-wrap cursor-pointer hover:bg-parish-field focus-visible:bg-parish-field outline-none">
                <div className="w-[64px] h-[52px] rounded-xl bg-parish-errorBg text-parish-error font-serif font-bold text-[24px] flex items-center justify-center flex-none" aria-label={`Blood type ${r.blood_type}`}>
                  {r.blood_type}
                </div>
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <StatusBadge status={r.status} />
                    {u && <Badge tone={u.tone}>{u.text}</Badge>}
                    <SourceNote source={r.source} />
                    {r.show_publicly && <Badge tone="green">On the website</Badge>}
                  </div>
                  <div className="font-semibold text-[15px] text-parish-navy">{r.units} bag{r.units === 1 ? '' : 's'} · {r.hospital}</div>
                  <div className="text-[12.5px] text-parish-muted">
                    {[r.ref_no, `for ${r.patient_name}`, r.needed_by && `by ${fmtDate(r.needed_by)}`, receivedText(r.created_at)].filter(Boolean).join(' · ')}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </Panel>

      {open && <BloodRequestDrawer key={open.id} request={open} onClose={() => setOpenId(null)} onSaved={saved} onDeleted={() => { list.drop(open.id); setOpenId(null); onCountsChanged(); }} />}
      {creating && <BloodRequestForm onClose={() => setCreating(false)} onSaved={(row) => { saved(row); setCreating(false); setOpenId(row.id); }} />}
    </>
  );
}

function BloodRequestDrawer({ request: r, onClose, onSaved, onDeleted }) {
  const toast = useToast();
  const confirm = useConfirm();
  const layout = useOutletContext();
  const [notes, setNotes] = useState(r.staff_notes || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [donors, setDonors] = useState(null);
  const [contacts, setContacts] = useState({});
  const [loadError, setLoadError] = useState('');

  function loadDonors() {
    setLoadError('');
    Promise.all([api.listBloodDonors(), api.listBloodContacts(r.id)])
      .then(([d, c]) => { setDonors(d.rows); setContacts(Object.fromEntries(c.map((x) => [x.donor_id, x]))); })
      .catch((e) => setLoadError(e.message || 'Could not load donors'));
  }
  useEffect(loadDonors, [r.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(fields, message = 'Saved') {
    setBusy(true);
    setError('');
    try {
      onSaved(await api.saveBloodRequest({ id: r.id, staff_notes: notes, ...fields }));
      toast.success(message);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setBusy(false);
    }
  }

  async function setContact(donor, status, note) {
    try {
      if (!status) {
        await api.clearBloodContact(r.id, donor.id);
        setContacts((c) => { const n = { ...c }; delete n[donor.id]; return n; });
        return;
      }
      const saved = await api.setBloodContact(r.id, donor.id, status, note);
      setContacts((c) => ({ ...c, [donor.id]: saved }));
      // Donated moves the donor's last donation date; first contact moves the request along.
      if (status === 'Donated') loadDonors();
      if (r.status === 'Open') await save({ status: 'Contacting donors' }, 'Marked as contacting donors');
    } catch (e) {
      toast.error(e.message || 'Could not save the contact');
    }
  }

  async function remove() {
    const ok = await confirm({ title: `Delete ${r.ref_no}?`, message: "Only for spam or duplicates. This also removes the contact log. It can't be undone.", confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    try { await api.deleteRequest('blood_requests', r.id); toast.success('Deleted'); onDeleted(); } catch (e) { setError(e.message || 'Could not delete'); }
  }

  const matches = donors ? matchDonors(r, donors) : [];
  const tally = Object.values(contacts).reduce((t, c) => ({ ...t, [c.status]: (t[c.status] || 0) + 1 }), {});
  const open = BLOOD_OPEN.includes(r.status);
  const sms = bloodCallSms(r, layout?.parish?.name);

  return (
    <SidePanel
      title={`${r.blood_type} · ${r.units} bag${r.units === 1 ? '' : 's'}`}
      subtitle={`${r.hospital} · ${r.ref_no}`}
      onClose={onClose}
      onSave={() => save({}, 'Notes saved')}
      saving={busy}
      saveLabel="Save notes"
      error={error}
      footerStart={open ? (
        <>
          <RowButton tone="green" className="!py-2.5 !text-[13.5px]" disabled={busy} onClick={() => save({ status: 'Fulfilled', show_publicly: false }, 'Marked fulfilled')}>Fulfilled</RowButton>
          <RowButton tone="gray" className="!py-2.5 !text-[13.5px]" disabled={busy} onClick={() => save({ status: 'Closed', show_publicly: false }, 'Closed')}>Close</RowButton>
        </>
      ) : (
        <RowButton tone="gray" className="!py-2.5 !text-[13.5px]" disabled={busy} onClick={() => save({ status: 'Open' }, 'Reopened')}>Reopen</RowButton>
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <StatusBadge status={r.status} />
        <span className="text-[12.5px] text-parish-muted">Received {fmtDateTime(r.created_at)}{r.handled_by_name ? ` · last changed by ${r.handled_by_name}` : ''}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Detail label="Patient">{r.patient_name}</Detail>
        <Detail label="Needed by">{r.needed_by ? fmtDate(r.needed_by) : 'Not given'}</Detail>
        <Detail label="Contact">{r.contact_name}{r.relationship ? ` (${r.relationship})` : ''} · {r.contact_mobile}</Detail>
        <Detail label="Notes from the family">{r.notes}</Detail>
      </div>
      <ContactLinks mobile={r.contact_mobile} />

      {r.allow_public ? (
        <label className="flex items-start gap-3 px-4 py-3 rounded-xl border border-parish-border bg-parish-field cursor-pointer">
          <Checkbox checked={!!r.show_publicly} disabled={busy || !open} onChange={(e) => save({ show_publicly: e.target.checked }, e.target.checked ? 'Posted on the website' : 'Removed from the website')} className="mt-0.5" />
          <span>
            <span className="block font-semibold text-[14px] text-parish-navy">Post a blood call on the website</span>
            <span className="block text-[12.5px] text-parish-muted">The family agreed. Only the blood type, number of bags, hospital and date are shown; never the patient's name.</span>
          </span>
        </label>
      ) : (
        <div className="text-[12.5px] text-parish-muted">The family didn't agree to a public post, so this stays private.</div>
      )}

      <SectionLabel>Matching donors</SectionLabel>
      <div className="text-[12.5px] text-parish-muted -mt-2">
        A {r.blood_type} patient can receive {compatibleDonorTypes(r.blood_type).join(', ')}. Exact matches and available donors are listed first.
        {Object.keys(tally).length > 0 && <span className="block mt-1 font-semibold text-parish-navy">{CONTACT_STATUSES.filter((s) => tally[s]).map((s) => `${tally[s]} ${s.toLowerCase()}`).join(' · ')}</span>}
      </div>
      {loadError ? <ErrorState message={loadError} onRetry={loadDonors} /> : !donors ? <LoadingState label="Finding donors…" /> : !matches.length ? (
        <div className="text-[13.5px] text-parish-muted">No donors with a matching blood type have signed up yet.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {matches.map((d) => <DonorContactRow key={d.id} donor={d} contact={contacts[d.id]} exact={d.blood_type === r.blood_type} sms={sms} onChange={setContact} />)}
        </div>
      )}

      <SectionLabel>Staff notes</SectionLabel>
      <TextArea rows={2} aria-label="Staff notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Hospital blood bank says 2 bags still needed" />
      <div><RowButton tone="red" onClick={remove}>Delete request</RowButton></div>
    </SidePanel>
  );
}

function DonorContactRow({ donor: d, contact, exact, sms, onChange }) {
  const [note, setNote] = useState(contact?.note || '');
  const a = d.availability;
  return (
    <div className="border border-parish-line2 rounded-xl bg-parish-field px-3.5 py-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-semibold text-[14.5px] text-parish-navy">{d.full_name}</span>
        <Badge tone={exact ? 'red' : 'gray'}>{d.blood_type}</Badge>
        <Badge tone={AVAILABILITY_TONES[a.state]}>{a.state === 'Resting' ? `Resting until ${fmtDate(a.until)}` : a.state}</Badge>
        {d.gkk && <span className="text-[12.5px] text-parish-muted">{d.gkk}</span>}
        <span className="ml-auto"><ContactLinks mobile={d.mobile} sms={sms} /></span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <select
          aria-label={`Contact status for ${d.full_name}`}
          value={contact?.status || ''}
          onChange={(e) => onChange(d, e.target.value, note)}
          className="px-2.5 py-1.5 text-[13px] bg-parish-surface border-[1.5px] border-parish-borderSoft rounded-lg outline-none cursor-pointer"
          style={contact ? { color: STATUS_TONES[contact.status] === 'red' ? 'rgb(var(--c-error))' : STATUS_TONES[contact.status] === 'green' ? '#2f6b48' : undefined } : undefined}
        >
          <option value="">Not contacted</option>
          {CONTACT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          aria-label={`Note for ${d.full_name}`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => contact && note !== (contact.note || '') && onChange(d, contact.status, note)}
          placeholder="Note (e.g. can come Saturday)"
          className="flex-1 min-w-[160px] px-2.5 py-1.5 text-[13px] bg-parish-surface border-[1.5px] border-parish-borderSoft rounded-lg outline-none"
        />
        {contact && <span className="text-[11.5px] text-parish-muted">{contact.updated_by_name ? `${contact.updated_by_name}, ` : ''}{fmtDateTime(contact.updated_at)}</span>}
      </div>
    </div>
  );
}

function BloodRequestForm({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    patient_name: '', blood_type: 'O+', units: 1, hospital: '', needed_by: '', contact_name: '', contact_mobile: '',
    relationship: '', notes: '', allow_public: false, source: 'Walk-in',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.patient_name.trim() || !form.hospital.trim()) { setError("Enter the patient's name and the hospital."); return; }
    if (!form.contact_name.trim() || !form.contact_mobile.trim()) { setError('Enter a contact person and mobile number.'); return; }
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveBloodRequest({ ...form, units: Number(form.units) || 1 });
      toast.success(`Request ${saved.ref_no} added`);
      onSaved(saved);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel title="New blood request" subtitle="For a family at the office or on the phone" onClose={onClose} onSave={save} saving={saving} error={error}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Blood type needed" required>
          <Select value={form.blood_type} onChange={set('blood_type')}>{BLOOD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
        </Field>
        <Field label="Bags"><TextInput type="number" min={1} max={20} value={form.units} onChange={set('units')} /></Field>
        <Field label="Needed by"><TextInput type="date" value={form.needed_by} onChange={set('needed_by')} /></Field>
      </div>
      <Field label="Patient's name" required><TextInput value={form.patient_name} onChange={set('patient_name')} /></Field>
      <Field label="Hospital" required><TextInput value={form.hospital} onChange={set('hospital')} placeholder="e.g. Kidapawan Doctors Hospital" /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact person" required><TextInput value={form.contact_name} onChange={set('contact_name')} /></Field>
        <Field label="Contact mobile" required><TextInput type="tel" value={form.contact_mobile} onChange={set('contact_mobile')} /></Field>
        <Field label="Relationship to the patient"><TextInput value={form.relationship} onChange={set('relationship')} /></Field>
        <Field label="Received by">
          <Select value={form.source} onChange={set('source')}>{SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
        </Field>
      </div>
      <Field label="Notes"><TextArea rows={2} value={form.notes} onChange={set('notes')} /></Field>
      <label className="flex items-start gap-3 text-[13.5px] text-parish-navy cursor-pointer">
        <Checkbox checked={form.allow_public} onChange={(e) => setForm((f) => ({ ...f, allow_public: e.target.checked }))} className="mt-0.5" />
        <span>The family agreed to a public blood call (blood type, bags, hospital and date only)</span>
      </label>
    </SidePanel>
  );
}

