import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { fmtDate, BLOOD_TYPES } from '../../constants.js';
import { useUrlState, urlListPage } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../ConfirmDialog.jsx';
import { Field, TextInput, Select, Checkbox, Badge, OptionSelect } from '../ui.jsx';
import { SearchInput, FilterSelect, Pagination, EmptyState, LoadingState, ErrorState, rowActivationProps } from '../admin.jsx';
import { SidePanel, TextArea, RowButton, Panel, TabIntro, AddButton } from '../panels.jsx';
import { useRows, ContactLinks, FilterChips } from './common.jsx';
import { donorAvailability, AVAILABILITY_TONES } from '../../lib/requests.js';

const URL_DEFAULTS = { view: 'Available', type: 'All', q: '', page: 1, size: 20 };
const URL_ALLOWED = { view: ['Available', 'Resting', 'Opted out', 'All'], type: ['All', ...BLOOD_TYPES, 'Unknown'], size: [10, 20, 50] };

export default function DonorsTab() {
  const list = useRows(api.listBloodDonors);
  // View, blood type, search and page live in the address bar (see useUrlState).
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const { view, type } = url;
  const setView = (v) => setUrl({ view: v });
  const setType = (v) => setUrl({ type: v });
  const [editing, setEditing] = useState(null);
  const [gkks, setGkks] = useState([]);

  useEffect(() => { api.listGkks().then((r) => setGkks(r.rows.map((g) => g.name))).catch(() => {}); }, []);

  const rows = list.rows.map((d) => ({ ...d, availability: donorAvailability(d) }));
  const count = (s) => rows.filter((d) => d.availability.state === s).length;
  const filtered = rows.filter((d) => (view === 'All' || d.availability.state === view) && (type === 'All' || (type === 'Unknown' ? !d.blood_type : d.blood_type === type)));
  const page = urlListPage(filtered, (d) => `${d.full_name} ${d.mobile} ${d.gkk || ''}`, url, setUrl);

  return (
    <>
      <TabIntro text="People who agreed to be contacted when someone needs blood. They sign up on the website, or you can add someone who agreed in person. This list is staff-only.">
        <AddButton onClick={() => setEditing({ full_name: '', mobile: '', blood_type: '', gkk: '', last_donated_on: '', notes: '', source: 'Added by staff' })}>Add donor</AddButton>
      </TabIntro>

      <div className="flex gap-2.5 flex-wrap items-center mb-4">
        <FilterChips label="Which donors" value={view} onChange={setView}
          options={[['Available', 'Available', count('Available')], ['Resting', 'Resting', count('Resting')], ['Opted out', 'Opted out', count('Opted out')], ['All', 'All']]} />
        <div className="flex gap-2.5 flex-wrap ml-auto">
          <SearchInput placeholder="Search name, mobile, GKK…" aria-label="Search donors" value={page.query} onChange={(e) => page.setQuery(e.target.value)} />
          <FilterSelect value={type} onChange={(e) => setType(e.target.value)} aria-label="Blood type">
            <option value="All">All blood types</option>
            {BLOOD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            <option value="Unknown">Unknown</option>
          </FilterSelect>
        </div>
      </div>

      <Panel className="overflow-hidden">
        {list.loading ? <LoadingState /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !page.total ? (
          <EmptyState title={list.rows.length ? 'No donors here' : 'No donors yet'} subtitle={list.rows.length ? undefined : 'Add parishioners who agreed to be contacted for blood calls.'} />
        ) : (
          page.rows.map((d) => (
            <div key={d.id} {...rowActivationProps(() => setEditing(d), `Edit donor ${d.full_name}`)}
              className="flex items-center gap-3 px-5 py-3 border-b border-parish-line last:border-b-0 flex-wrap cursor-pointer hover:bg-parish-field focus-visible:bg-parish-field outline-none">
              <div className="w-[48px] text-center font-serif font-bold text-[20px] text-parish-error">{d.blood_type || '?'}</div>
              <div className="flex-1 min-w-[180px]">
                <div className="font-semibold text-[14.5px] text-parish-navy">{d.full_name}</div>
                <div className="text-[12.5px] text-parish-muted">
                  {[d.mobile, d.gkk, d.last_donated_on && `last gave ${fmtDate(d.last_donated_on)}`, d.source === 'Online' ? 'signed up online' : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              <Badge tone={AVAILABILITY_TONES[d.availability.state]}>
                {d.availability.state === 'Resting' ? `Resting until ${fmtDate(d.availability.until)}` : d.availability.state}
              </Badge>
              <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}><ContactLinks mobile={d.mobile} /></span>
            </div>
          ))
        )}
        <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPage={page.setPage} onPageSize={page.setPageSize} />
      </Panel>

      {editing && <DonorForm row={editing} gkks={gkks} onClose={() => setEditing(null)} onSaved={(row) => { list.upsert(row); setEditing(null); }} onDeleted={(id) => { list.drop(id); setEditing(null); }} />}
    </>
  );
}

function DonorForm({ row, gkks, onClose, onSaved, onDeleted }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState({ ...row, blood_type: row.blood_type || '', gkk: row.gkk || '', last_donated_on: row.last_donated_on || '', notes: row.notes || '' });
  const [consent, setConsent] = useState(!!row.id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(extra = {}, message = row.id ? 'Donor saved' : 'Donor added') {
    if (!form.full_name.trim()) { setError('Enter the donor\'s name.'); return; }
    if (String(form.mobile || '').replace(/\D/g, '').length < 10) { setError('Enter a mobile number with at least 10 digits.'); return; }
    if (!row.id && !consent) { setError('Only add people who agreed to be contacted. Tick the box to confirm.'); return; }
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveBloodDonor({ ...form, ...extra });
      toast.success(message);
      onSaved(saved);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  async function optOut() {
    const ok = await confirm({ title: `Stop contacting ${row.full_name}?`, message: "They won't appear in blood request matches. You can turn them back on later.", confirmLabel: 'Opt out', tone: 'danger' });
    if (ok) save({ opted_out_at: new Date().toISOString() }, 'Opted out');
  }

  async function remove() {
    const ok = await confirm({ title: `Delete ${row.full_name}?`, message: 'Removes the donor and their contact history on blood requests. To just stop contacting them, use Opt out.', confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    try { await api.deleteRequest('blood_donors', row.id); toast.success('Deleted'); onDeleted(row.id); } catch (e) { setError(e.message || 'Could not delete'); }
  }

  return (
    <SidePanel
      title={row.id ? row.full_name : 'Add a donor'}
      subtitle={row.id ? `${row.source === 'Online' ? 'Signed up online' : 'Added by staff'} · agreed ${fmtDate(String(row.consent_at).slice(0, 10))}` : 'Someone who agreed to be contacted for blood calls'}
      onClose={onClose}
      onSave={() => save()}
      saving={saving}
      error={error}
      footerStart={row.id && (
        <>
          {row.opted_out_at
            ? <RowButton tone="green" className="!py-2.5 !text-[13.5px]" disabled={saving} onClick={() => save({ opted_out_at: null }, 'Back on the donor list')}>Opt back in</RowButton>
            : <RowButton tone="gray" className="!py-2.5 !text-[13.5px]" disabled={saving} onClick={optOut}>Opt out</RowButton>}
          <RowButton tone="red" className="!py-2.5 !text-[13.5px]" disabled={saving} onClick={remove}>Delete</RowButton>
        </>
      )}
    >
      {row.opted_out_at && <div className="px-4 py-2.5 rounded-xl bg-parish-sunk text-parish-text2 text-[13.5px] font-semibold">Opted out on {fmtDate(String(row.opted_out_at).slice(0, 10))}. Not shown in blood request matches.</div>}
      <Field label="Full name" required><TextInput value={form.full_name} onChange={set('full_name')} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Mobile" required><TextInput type="tel" value={form.mobile} onChange={set('mobile')} placeholder="09xx xxx xxxx" /></Field>
        <Field label="Blood type">
          <Select value={form.blood_type} onChange={set('blood_type')}>
            <option value="">Unknown</option>
            {BLOOD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="GKK"><OptionSelect options={gkks} value={form.gkk} onChange={(v) => setForm((f) => ({ ...f, gkk: v }))} placeholder="Not given" /></Field>
        <Field label="Last donated"><TextInput type="date" value={form.last_donated_on} onChange={set('last_donated_on')} /></Field>
      </div>
      <Field label="Notes"><TextArea rows={2} value={form.notes} onChange={set('notes')} placeholder="e.g. Prefers a text first; available weekends" /></Field>
      {!row.id && (
        <label className="flex items-start gap-3 text-[13.5px] text-parish-navy cursor-pointer">
          <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5" />
          <span>This person agreed to be contacted by the parish when someone needs blood.</span>
        </label>
      )}
    </SidePanel>
  );
}
