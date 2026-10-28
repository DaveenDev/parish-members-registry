import React, { useState } from 'react';
import { api } from '../../api.js';
import { fmtDate } from '../../constants.js';
import { useLiveRefresh, useUrlState, urlListPage } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../ConfirmDialog.jsx';
import { Field, TextInput, Select, Checkbox, Badge } from '../ui.jsx';
import { SearchInput, FilterSelect, Pagination, EmptyState, LoadingState, ErrorState, NewItemsNote } from '../admin.jsx';
import { SidePanel, TextArea, RowButton, Panel, TabIntro, AddButton } from '../panels.jsx';
import { useRows, StatusBadge, ContactLinks, FilterChips, receivedText, SourceNote } from './common.jsx';
import { MemberSearch } from './MemberMatch.jsx';
import { memberFullName } from '../../lib/util.js';
import { SACRAMENT_REQUEST_TYPES, SACRAMENT_REQUEST_STATUSES, SACRAMENT_REQUEST_OPEN, SOURCES, sacramentRequestLabel } from '../../lib/requests.js';

const TYPE_TONES = Object.fromEntries(SACRAMENT_REQUEST_TYPES.map((t) => [t.key, t.tone]));

const URL_DEFAULTS = { view: 'Open', sac: 'All', q: '', page: 1, size: 20 };
const URL_ALLOWED = { view: ['Open', 'Done', 'Cancelled', 'All'], sac: ['All', ...SACRAMENT_REQUEST_TYPES.map((t) => t.key)], size: [10, 20, 50] };

const inView = (r, view) => (view === 'All' ? true : view === 'Open' ? SACRAMENT_REQUEST_OPEN.includes(r.status) : r.status === view);

/**
 * Requests to avail of a sacrament from the website (0032): joining OCIA,
 * or the Anointing of the Sick. Urgent anointing requests come first.
 */
export default function SacramentsTab({ onCountsChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const list = useRows(api.listSacramentRequests);
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const { view, sac } = url;
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  // New OCIA and anointing requests, unless one is being edited (useLiveRefresh).
  const live = useLiveRefresh(list.reload, { kinds: ['ocia', 'anointing'], busy: !!(editing || busy) });

  // Open: urgent first, then oldest first (who has waited longest). Others: newest first.
  const filtered = list.rows
    .filter((r) => inView(r, view) && (sac === 'All' || r.sacrament === sac))
    .sort((a, b) => (view === 'Open'
      ? (Number(b.urgent && b.status === 'New') - Number(a.urgent && a.status === 'New')) || a.created_at.localeCompare(b.created_at)
      : b.created_at.localeCompare(a.created_at)));
  const page = urlListPage(filtered, (r) => `${r.ref_no} ${r.person_name} ${r.requester_name} ${r.location || ''}`, url, setUrl);
  const openCount = list.rows.filter((r) => SACRAMENT_REQUEST_OPEN.includes(r.status)).length;

  function changed(row) {
    list.upsert(row);
    onCountsChanged();
  }

  async function patch(r, fields, message) {
    setBusy(true);
    try {
      changed(await api.saveSacramentRequest({ id: r.id, ...fields }));
      if (message) toast.success(message);
    } catch (e) {
      toast.error(e.message || 'Could not update');
    } finally {
      setBusy(false);
    }
  }

  async function remove(r) {
    const ok = await confirm({ title: `Delete ${r.ref_no}?`, message: "Only for spam or duplicates. This can't be undone.", confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    try { await api.deleteRequest('sacrament_requests', r.id); list.drop(r.id); onCountsChanged(); toast.success('Deleted'); } catch (e) { toast.error(e.message || 'Could not delete'); }
  }

  return (
    <>
      <TabIntro text="Requests to join the OCIA or for the Anointing of the Sick, sent from the website's Ang Simbahan page. Call or text the person, then set the date for the visit or the first session. Urgent anointing requests are listed first.">
        <AddButton onClick={() => setEditing({ sacrament: 'anointing', person_name: '', location: '', preferred_date: '', urgent: false, baptism_status: '', requester_name: '', requester_mobile: '', relationship: '', message: '', source: 'Walk-in', status: 'New' })}>
          Add request
        </AddButton>
      </TabIntro>
      <NewItemsNote count={live.waiting} noun="request" onShow={live.showNow} />

      <div className="flex gap-2.5 flex-wrap items-center mb-4">
        <FilterChips label="Which requests" options={[['Open', 'Open', openCount], ['Done', 'Done'], ['Cancelled', 'Cancelled'], ['All', 'All']]} value={view} onChange={(v) => setUrl({ view: v })} />
        <div className="flex gap-2.5 flex-wrap ml-auto">
          <SearchInput placeholder="Search requests…" aria-label="Search sacrament requests" value={page.query} onChange={(e) => page.setQuery(e.target.value)} />
          <FilterSelect value={sac} onChange={(e) => setUrl({ sac: e.target.value })} aria-label="Sacrament">
            <option value="All">All sacraments</option>
            {SACRAMENT_REQUEST_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </FilterSelect>
        </div>
      </div>

      <Panel className="overflow-hidden">
        {list.loading ? <LoadingState /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !page.total ? (
          <EmptyState title={list.rows.length ? 'Nothing here' : 'No sacrament requests yet'} subtitle={view === 'Open' && list.rows.length ? 'Every request has been handled.' : undefined} />
        ) : (
          page.rows.map((r) => (
            <div key={r.id} className="flex items-start gap-3 px-5 py-3.5 border-b border-parish-line last:border-b-0 flex-wrap">
              <div className="flex-1 min-w-[260px]">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge tone={TYPE_TONES[r.sacrament]}>{sacramentRequestLabel(r.sacrament)}</Badge>
                  <StatusBadge status={r.status} />
                  {r.urgent && <Badge tone="red">Urgent</Badge>}
                  <SourceNote source={r.source} />
                </div>
                <div className="font-semibold text-[15px] text-parish-navy">{r.person_name}</div>
                <div className="text-[13.5px] text-parish-text3">
                  {[r.location, r.baptism_status, r.preferred_date && `prefers ${fmtDate(r.preferred_date)}`].filter(Boolean).join(' · ')}
                </div>
                {r.scheduled_on && <div className="text-[13.5px] font-semibold text-parish-ok mt-0.5">Scheduled {fmtDate(r.scheduled_on)}</div>}
                {r.message && <div className="text-[13.5px] text-parish-text3 whitespace-pre-line mt-1">{r.message}</div>}
                {r.staff_notes && <div className="text-[12.5px] text-parish-muted italic mt-1">Note: {r.staff_notes}</div>}
                {r.member && <div className="mt-1"><Badge tone="blue" title="Linked to this member's record">Member: {memberFullName(r.member)}{r.member.household?.household_name ? ` · ${r.member.household.household_name}` : ''}</Badge></div>}
                <div className="text-[12.5px] text-parish-muted mt-1">
                  {[r.ref_no, `from ${r.requester_name}${r.relationship ? ` (${r.relationship})` : ''}`, receivedText(r.created_at), r.handled_by_name && `by ${r.handled_by_name}`].filter(Boolean).join(' · ')}
                </div>
                <div className="mt-1.5"><ContactLinks mobile={r.requester_mobile} /></div>
              </div>
              <div className="flex gap-1.5 flex-wrap justify-end max-w-[300px]">
                {r.status === 'New' && <RowButton tone="gray" disabled={busy} onClick={() => patch(r, { status: 'Contacted' }, 'Marked contacted')}>Contacted</RowButton>}
                {SACRAMENT_REQUEST_OPEN.includes(r.status) && <RowButton disabled={busy} onClick={() => setEditing(r)} viewLabel="View">{r.status === 'Scheduled' ? 'Edit' : 'Schedule…'}</RowButton>}
                {SACRAMENT_REQUEST_OPEN.includes(r.status) && <RowButton tone="green" disabled={busy} onClick={() => patch(r, { status: 'Done' }, 'Marked done')}>Done</RowButton>}
                {SACRAMENT_REQUEST_OPEN.includes(r.status) && <RowButton tone="gray" disabled={busy} onClick={() => patch(r, { status: 'Cancelled' }, 'Cancelled')}>Cancel</RowButton>}
                {!SACRAMENT_REQUEST_OPEN.includes(r.status) && <RowButton tone="gray" disabled={busy} onClick={() => patch(r, { status: 'New' }, 'Reopened')}>Reopen</RowButton>}
                <RowButton tone="red" disabled={busy} onClick={() => remove(r)}>Delete</RowButton>
              </div>
            </div>
          ))
        )}
        <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPage={page.setPage} onPageSize={page.setPageSize} />
      </Panel>

      {editing && <RequestEditor row={editing} onClose={() => setEditing(null)} onSaved={(row) => { changed(row); setEditing(null); }} />}
    </>
  );
}

/** Add a walk-in or phone request, or schedule and annotate one from the website. */
function RequestEditor({ row, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !row.id;
  const [form, setForm] = useState({
    ...row,
    person_name: row.person_name || '', location: row.location || '', baptism_status: row.baptism_status || '',
    preferred_date: row.preferred_date || '', requester_name: row.requester_name || '', requester_mobile: row.requester_mobile || '',
    relationship: row.relationship || '', message: row.message || '', scheduled_on: row.scheduled_on || '', staff_notes: row.staff_notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const ocia = form.sacrament === 'ocia';

  async function save() {
    if (!form.person_name.trim()) { setError(ocia ? 'Write the name of the person joining.' : 'Write the name of the sick person.'); return; }
    if (!form.requester_name.trim() || !form.requester_mobile.trim()) { setError('Write who asked and their mobile number.'); return; }
    setSaving(true);
    setError('');
    try {
      // Setting a date moves a New or Contacted request to Scheduled.
      const status = form.scheduled_on && ['New', 'Contacted'].includes(form.status) ? 'Scheduled' : form.status;
      const saved = await api.saveSacramentRequest({ ...form, status });
      toast.success(isNew ? 'Request added' : 'Request saved');
      onSaved(saved);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel
      title={isNew ? 'Add a sacrament request' : `${row.ref_no} · ${sacramentRequestLabel(row.sacrament)}`}
      subtitle={isNew ? 'For someone at the office or on the phone' : 'Set the date once it is arranged'}
      onClose={onClose} onSave={save} saving={saving} error={error}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Sacrament">
          <Select value={form.sacrament} onChange={set('sacrament')} disabled={!isNew}>
            {SACRAMENT_REQUEST_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </Select>
        </Field>
        {isNew ? (
          <Field label="Received by">
            <Select value={form.source} onChange={set('source')}>{SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
          </Field>
        ) : (
          <Field label="Status">
            <Select value={form.status} onChange={set('status')}>{SACRAMENT_REQUEST_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
          </Field>
        )}
      </div>
      <Field label={ocia ? 'Person joining' : 'Sick person'} required><TextInput value={form.person_name} onChange={set('person_name')} /></Field>
      <Field label={ocia ? 'Address or GKK' : 'Where they are (home address or hospital)'}><TextInput value={form.location} onChange={set('location')} /></Field>
      {ocia && (
        <Field label="Baptized?"><TextInput value={form.baptism_status} onChange={set('baptism_status')} placeholder="e.g. Not baptized; or baptized in another church" /></Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Preferred date"><TextInput type="date" value={form.preferred_date} onChange={set('preferred_date')} /></Field>
        <Field label={ocia ? 'First session on' : 'Visit on'}><TextInput type="date" value={form.scheduled_on} onChange={set('scheduled_on')} /></Field>
      </div>
      {!ocia && (
        <label className="flex items-start gap-3 text-[13.5px] text-parish-navy cursor-pointer">
          <Checkbox checked={!!form.urgent} onChange={(e) => setForm((f) => ({ ...f, urgent: e.target.checked }))} className="mt-0.5" />
          <span>Urgent: the person is gravely ill</span>
        </label>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Requested by" required><TextInput value={form.requester_name} onChange={set('requester_name')} /></Field>
        <Field label="Mobile" required><TextInput type="tel" value={form.requester_mobile} onChange={set('requester_mobile')} /></Field>
      </div>
      <Field label="Relationship"><TextInput value={form.relationship} onChange={set('relationship')} placeholder="e.g. Anak, Kapikas, Ako mismo" /></Field>
      <Field label="Message from the requester"><TextArea rows={3} value={form.message} onChange={set('message')} /></Field>
      <Field label="Staff notes"><TextArea rows={2} value={form.staff_notes} onChange={set('staff_notes')} placeholder="Only staff see this." /></Field>
      {/* After 0074: link the person to their member record, which then lists this request. */}
      {!isNew && 'member_id' in row && (
        <div>
          <div className="font-semibold text-[13px] text-parish-ink mb-1.5">{ocia ? 'Person joining' : 'Sick person'} in the member registry</div>
          {form.member ? (
            <div className="flex items-center gap-3 flex-wrap border-[1.5px] border-parish-focusLine rounded-xl bg-parish-fillSoft px-4 py-3">
              <div className="flex-1 min-w-[180px]">
                <div className="font-semibold text-[14.5px] text-parish-navy">{memberFullName(form.member)}</div>
                <div className="text-[12.5px] text-parish-muted">{[form.member.household?.household_name, form.member.household?.gkk, form.member.dob && `born ${fmtDate(form.member.dob)}`].filter(Boolean).join(' · ')}</div>
              </div>
              <RowButton tone="gray" onClick={() => setForm((f) => ({ ...f, member_id: null, member: null }))}>Unlink</RowButton>
            </div>
          ) : (
            <>
              <div className="text-[12.5px] text-parish-muted mb-2">If they're registered, link their record: the request then shows on it. Saved with the request.</div>
              <MemberSearch initial={form.person_name} onPick={(m) => setForm((f) => ({ ...f, member_id: m.id, member: { ...m, household: { household_name: m.household_name, gkk: m.household_gkk } } }))} />
            </>
          )}
        </div>
      )}
    </SidePanel>
  );
}
