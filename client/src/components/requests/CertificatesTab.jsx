import React, { useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { fmtDate, fmtDateTime } from '../../constants.js';
import { useUrlState, urlListPage } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../ConfirmDialog.jsx';
import { Field, TextInput, Select, Badge } from '../ui.jsx';
import { SearchInput, FilterSelect, Pagination, EmptyState, LoadingState, ErrorState, rowActivationProps } from '../admin.jsx';
import { SidePanel, SectionLabel, TextArea, RowButton, Panel, TabIntro, AddButton, Detail } from '../panels.jsx';
import MemberMatch from './MemberMatch.jsx';
import { useRows, StatusBadge, ContactLinks, FilterChips, receivedText, SourceNote } from './common.jsx';
import {
  CERT_TYPES, CERT_OPEN, CERT_FLOW, SOURCES,
  certTypeLabel, certTypeShort, certSearchText, subjectName, certificateReadySms,
} from '../../lib/requests.js';

const URL_DEFAULTS = { view: 'open', type: 'All', q: '', page: 1, size: 10 };
const URL_ALLOWED = { view: ['open', 'ready', 'done', 'all'], type: ['All', ...CERT_TYPES.map((t) => t.key)], size: [10, 20, 50] };

export default function CertificatesTab({ onCountsChanged }) {
  const list = useRows(api.listCertificateRequests);
  // View, type, search and page live in the address bar (see useUrlState).
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const { view, type } = url;
  const setView = (v) => setUrl({ view: v });
  const setType = (v) => setUrl({ type: v });
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);

  const count = (pred) => list.rows.filter(pred).length;
  const views = [
    ['open', 'To do', count((r) => r.status === 'Received' || r.status === 'Being prepared')],
    ['ready', 'Ready for pick-up', count((r) => r.status === 'Ready for pick-up')],
    ['done', 'Released / closed', 0],
    ['all', 'All', 0],
  ];
  const inView = (r) => (view === 'open' ? r.status === 'Received' || r.status === 'Being prepared'
    : view === 'ready' ? r.status === 'Ready for pick-up'
      : view === 'done' ? !CERT_OPEN.includes(r.status) : true);
  // Oldest first while there's work to do, so nobody waits longest.
  const filtered = list.rows
    .filter((r) => inView(r) && (type === 'All' || r.cert_type === type))
    .sort((a, b) => (view === 'open' || view === 'ready' ? 1 : -1) * a.created_at.localeCompare(b.created_at));
  const page = urlListPage(filtered, certSearchText, url, setUrl);
  const open = list.rows.find((r) => r.id === openId);

  function saved(row) {
    list.upsert(row);
    onCountsChanged();
  }

  return (
    <>
      <TabIntro text="Requests for baptismal, confirmation and marriage certificates. Link each to the person's member record to check the sacrament against the parish register, then move it along until it's released.">
        <AddButton onClick={() => setCreating(true)}>Walk-in / phone request</AddButton>
      </TabIntro>

      <div className="flex gap-2.5 flex-wrap items-center mb-4">
        <FilterChips label="Which requests" options={views} value={view} onChange={setView} />
        <div className="flex gap-2.5 flex-wrap ml-auto">
          <SearchInput placeholder="Search ref, name or mobile…" aria-label="Search certificate requests" value={page.query} onChange={(e) => page.setQuery(e.target.value)} />
          <FilterSelect value={type} onChange={(e) => setType(e.target.value)} aria-label="Certificate type">
            <option value="All">All certificates</option>
            {CERT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </FilterSelect>
        </div>
      </div>

      <Panel className="overflow-hidden">
        {list.loading ? <LoadingState /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !page.total ? (
          <EmptyState title={list.rows.length ? 'Nothing here' : 'No certificate requests yet'} subtitle={list.rows.length ? 'Try another filter.' : 'Online requests and walk-ins you add will appear here.'} />
        ) : (
          page.rows.map((r) => (
            <div key={r.id} {...rowActivationProps(() => setOpenId(r.id), `Open request ${r.ref_no}`)}
              className="flex items-center gap-3 px-5 py-3.5 border-b border-parish-line last:border-b-0 flex-wrap cursor-pointer hover:bg-parish-field focus-visible:bg-parish-field outline-none">
              <div className="flex-1 min-w-[220px]">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <Badge tone="blue">{certTypeShort(r.cert_type)}</Badge>
                  <StatusBadge status={r.status} />
                  <SourceNote source={r.source} />
                  {r.copies > 1 && <Badge tone="gray">{r.copies} copies</Badge>}
                </div>
                <div className="font-semibold text-[15px] text-parish-navy">{subjectName(r)}</div>
                <div className="text-[12.5px] text-parish-muted">
                  {r.ref_no} · asked by {r.requester_name} · {receivedText(r.created_at)}
                </div>
              </div>
              <div className="text-[12.5px] font-semibold text-right">
                {r.member ? <span className="text-parish-ok">Linked to registry</span> : <span className="text-parish-warn">Not linked yet</span>}
              </div>
            </div>
          ))
        )}
        <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPage={page.setPage} onPageSize={page.setPageSize} />
      </Panel>

      {open && <CertificateDrawer key={open.id} request={open} onClose={() => setOpenId(null)} onSaved={saved} onDeleted={() => { list.drop(open.id); setOpenId(null); onCountsChanged(); }} />}
      {creating && <CertificateForm onClose={() => setCreating(false)} onSaved={(row) => { saved(row); setCreating(false); setOpenId(row.id); }} />}
    </>
  );
}

function CertificateDrawer({ request: r, onClose, onSaved, onDeleted }) {
  const toast = useToast();
  const confirm = useConfirm();
  const layout = useOutletContext();
  const [form, setForm] = useState({ fee: r.fee || '', or_number: r.or_number || '', released_to: r.released_to || '', public_note: r.public_note || '', staff_notes: r.staff_notes || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  // The box a status change still needs ('released_to' or 'public_note'): outlined in red until filled in.
  const [missing, setMissing] = useState(null);
  const fieldRefs = { released_to: useRef(null), public_note: useRef(null) };
  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (k === missing && e.target.value.trim()) { setMissing(null); setError(''); }
  };

  /** Explain what's missing, outline its box and put the cursor in it. */
  function needField(key, message) {
    setError(message);
    setMissing(key);
    const el = fieldRefs[key].current;
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.focus({ preventScroll: true });
  }
  const missingCls = (key) => (missing === key ? '!border-parish-error ring-4 ring-parish-error/20 !bg-parish-errorBg/40' : '');

  async function save(extra = {}, message = 'Saved') {
    setBusy(true);
    setError('');
    try {
      onSaved(await api.saveCertificateRequest({ id: r.id, ...form, ...extra }));
      toast.success(message);
      return true;
    } catch (e) {
      setError(e.message || 'Could not save');
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function moveTo(status) {
    if (status === 'Released' && !form.released_to.trim()) { needField('released_to', 'Enter who received the certificate before marking it released.'); return; }
    if (status === 'Cannot issue') {
      if (!form.public_note.trim()) { needField('public_note', 'Write a short note for the requester (e.g. "No record found; please visit the office") before closing it.'); return; }
      const ok = await confirm({ title: 'Close as “Cannot issue”?', message: 'The requester will see your note when they check the status.', confirmLabel: 'Close request', tone: 'danger' });
      if (!ok) return;
    }
    await save({ status }, `Marked ${status.toLowerCase()}`);
  }

  async function remove() {
    const ok = await confirm({ title: `Delete ${r.ref_no}?`, message: "Only for spam or duplicates. This can't be undone.", confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    try { await api.deleteRequest('certificate_requests', r.id); toast.success('Deleted'); onDeleted(); } catch (e) { setError(e.message || 'Could not delete'); }
  }

  const step = CERT_FLOW.indexOf(r.status);
  const next = step >= 0 && step < CERT_FLOW.length - 1 ? CERT_FLOW[step + 1] : null;
  const closed = !CERT_OPEN.includes(r.status);

  if (editing) return <CertificateForm row={r} onClose={() => setEditing(false)} onSaved={(row) => { onSaved(row); setEditing(false); }} />;

  return (
    <SidePanel
      title={subjectName(r)}
      subtitle={`${certTypeLabel(r.cert_type)} · ${r.ref_no}`}
      onClose={onClose}
      onSave={() => save()}
      saving={busy}
      saveLabel="Save notes"
      error={error}
      footerStart={(
        <>
          {next && <RowButton tone="green" className="!py-2.5 !text-[13.5px]" disabled={busy} onClick={() => moveTo(next)}>Mark {next.toLowerCase()} →</RowButton>}
          {!closed && <RowButton tone="red" className="!py-2.5 !text-[13.5px]" disabled={busy} onClick={() => moveTo('Cannot issue')}>Cannot issue…</RowButton>}
          {closed && <RowButton tone="gray" className="!py-2.5 !text-[13.5px]" disabled={busy} onClick={() => save({ status: 'Being prepared' }, 'Reopened')}>Reopen</RowButton>}
        </>
      )}
    >
      <Stepper status={r.status} />
      <div className="text-[12.5px] text-parish-muted -mt-2">
        Received {fmtDateTime(r.created_at)}{r.handled_by_name ? ` · last changed by ${r.handled_by_name}, ${fmtDateTime(r.status_changed_at)}` : ''}
        {r.released_at && ` · released ${fmtDateTime(r.released_at)}`}
      </div>

      <SectionLabel>Record requested</SectionLabel>
      <div className="grid gap-3 sm:grid-cols-2">
        <Detail label="Name on the record">{subjectName(r)}</Detail>
        <Detail label="Born">{r.subject_birth_date && fmtDate(r.subject_birth_date)}</Detail>
        <Detail label="Date of the sacrament">{r.sacrament_date ? fmtDate(r.sacrament_date) : r.sacrament_year ? `around ${r.sacrament_year}` : null}</Detail>
        <Detail label="Church / parish">{r.sacrament_place}</Detail>
        <Detail label="Father">{r.father_name}</Detail>
        <Detail label="Mother">{r.mother_name}</Detail>
        <Detail label="Spouse">{r.spouse_name}</Detail>
        <Detail label="Purpose">{r.purpose}</Detail>
        <Detail label="Copies">{r.copies}</Detail>
      </div>
      <div><RowButton tone="gray" onClick={() => setEditing(true)}>Edit request details</RowButton></div>

      <SectionLabel>Check against the registry</SectionLabel>
      <MemberMatch request={r} busy={busy} onLink={(memberId) => save({ member_id: memberId }, memberId ? 'Linked to member' : 'Unlinked')} />

      <SectionLabel>Requested by</SectionLabel>
      <div className="grid gap-3 sm:grid-cols-2">
        <Detail label="Name">{r.requester_name}{r.relationship ? ` (${r.relationship})` : ''}</Detail>
        <Detail label="Mobile">{r.requester_mobile}</Detail>
        <Detail label="Email">{r.requester_email}</Detail>
        <Detail label="Message">{r.message}</Detail>
      </div>
      <ContactLinks mobile={r.requester_mobile} sms={certificateReadySms(r, layout?.parish?.name)} />

      <SectionLabel>Office</SectionLabel>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Fee / donation"><TextInput value={form.fee} onChange={set('fee')} placeholder="e.g. ₱150" /></Field>
        <Field label="OR number"><TextInput value={form.or_number} onChange={set('or_number')} /></Field>
      </div>
      <Field
        label="Released to (name of who picked it up)"
        required={missing === 'released_to'}
        error={missing === 'released_to' ? 'Needed to mark it released.' : ''}
      >
        <TextInput ref={fieldRefs.released_to} value={form.released_to} onChange={set('released_to')} placeholder="Required when marking it released" className={missingCls('released_to')} />
      </Field>
      <Field
        label="Note to the requester (shown when they check the status)"
        required={missing === 'public_note'}
        error={missing === 'public_note' ? 'Needed to close it as "Cannot issue": tell the requester why, e.g. No record found; please visit the office.' : ''}
      >
        <TextArea ref={fieldRefs.public_note} rows={2} value={form.public_note} onChange={set('public_note')} placeholder="e.g. Please bring a valid ID. / No record found under this name; please visit the office." className={missingCls('public_note')} />
      </Field>
      <Field label="Staff notes (never shown publicly)">
        <TextArea rows={2} value={form.staff_notes} onChange={set('staff_notes')} placeholder="e.g. Book 12, page 34, entry 5" />
      </Field>
      <div><RowButton tone="red" onClick={remove}>Delete request</RowButton></div>
    </SidePanel>
  );
}

function Stepper({ status }) {
  if (status === 'Cannot issue') return <div className="px-4 py-2.5 rounded-xl bg-parish-errorBg text-parish-error font-semibold text-[14px]">Closed: cannot issue</div>;
  const at = CERT_FLOW.indexOf(status);
  return (
    <ol className="flex gap-1.5 m-0 p-0 list-none flex-wrap" aria-label="Progress">
      {CERT_FLOW.map((s, i) => (
        <li key={s} aria-current={i === at ? 'step' : undefined}
          className={`flex-1 min-w-[110px] text-center px-2 py-2 rounded-lg text-[12.5px] font-semibold ${i < at ? 'bg-parish-okBg text-parish-ok' : i === at ? 'bg-parish-fill text-white' : 'bg-parish-sunk text-parish-muted'}`}>
          {i < at ? '✓ ' : ''}{s}
        </li>
      ))}
    </ol>
  );
}

const EMPTY = {
  cert_type: 'baptism', source: 'Walk-in', subject_first_name: '', subject_middle_name: '', subject_last_name: '',
  subject_birth_date: '', sacrament_date: '', sacrament_year: '', sacrament_place: '', father_name: '', mother_name: '',
  spouse_name: '', purpose: '', copies: 1, requester_name: '', requester_mobile: '', requester_email: '', relationship: '', message: '',
};

/** New walk-in/phone request, or editing the details of an existing one. */
function CertificateForm({ row, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(() => (row ? Object.fromEntries(Object.keys(EMPTY).map((k) => [k, row[k] ?? ''])) : EMPTY));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.subject_first_name.trim() || !form.subject_last_name.trim()) { setError('Enter the first and last name on the record.'); return; }
    if (!form.requester_name.trim() || !form.requester_mobile.trim()) { setError("Enter the requester's name and mobile number."); return; }
    const year = String(form.sacrament_year || '').trim();
    if (year && !/^(19|20)\d\d$/.test(year)) { setError('The year should look like 1998.'); return; }
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveCertificateRequest({ ...form, id: row?.id, copies: Number(form.copies) || 1, sacrament_year: year || null });
      toast.success(row ? 'Request updated' : `Request ${saved.ref_no} added`);
      onSaved(saved);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel title={row ? 'Edit request details' : 'New certificate request'} subtitle={row ? row.ref_no : 'For someone at the office or on the phone'} onClose={onClose} onSave={save} saving={saving} error={error}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Certificate" required>
          <Select value={form.cert_type} onChange={set('cert_type')}>
            {CERT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </Select>
        </Field>
        {!row && (
          <Field label="Received by">
            <Select value={form.source} onChange={set('source')}>{SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
          </Field>
        )}
        <Field label="Copies"><TextInput type="number" min={1} max={10} value={form.copies} onChange={set('copies')} /></Field>
      </div>

      <SectionLabel>Name on the record</SectionLabel>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="First name" required><TextInput value={form.subject_first_name} onChange={set('subject_first_name')} /></Field>
        <Field label="Middle name"><TextInput value={form.subject_middle_name} onChange={set('subject_middle_name')} /></Field>
        <Field label="Last name" required><TextInput value={form.subject_last_name} onChange={set('subject_last_name')} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Birth date"><TextInput type="date" value={form.subject_birth_date} onChange={set('subject_birth_date')} /></Field>
        <Field label="Date of the sacrament"><TextInput type="date" value={form.sacrament_date} onChange={set('sacrament_date')} /></Field>
        <Field label="…or the year"><TextInput inputMode="numeric" value={form.sacrament_year} onChange={set('sacrament_year')} placeholder="e.g. 1998" /></Field>
      </div>
      <Field label="Church / parish where it was celebrated"><TextInput value={form.sacrament_place} onChange={set('sacrament_place')} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {form.cert_type !== 'matrimony' && <Field label="Father's name"><TextInput value={form.father_name} onChange={set('father_name')} /></Field>}
        {form.cert_type !== 'matrimony' && <Field label="Mother's maiden name"><TextInput value={form.mother_name} onChange={set('mother_name')} /></Field>}
        {form.cert_type === 'matrimony' && <Field label="Spouse's name"><TextInput value={form.spouse_name} onChange={set('spouse_name')} /></Field>}
        <Field label="Purpose"><TextInput value={form.purpose} onChange={set('purpose')} placeholder="e.g. School, employment, marriage" /></Field>
      </div>

      <SectionLabel>Requested by</SectionLabel>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required><TextInput value={form.requester_name} onChange={set('requester_name')} /></Field>
        <Field label="Mobile" required><TextInput type="tel" value={form.requester_mobile} onChange={set('requester_mobile')} placeholder="09xx xxx xxxx" /></Field>
        <Field label="Relationship to the person"><TextInput value={form.relationship} onChange={set('relationship')} placeholder="e.g. Self, parent" /></Field>
        <Field label="Email"><TextInput type="email" value={form.requester_email} onChange={set('requester_email')} /></Field>
      </div>
      <Field label="Message / notes from the requester"><TextArea rows={2} value={form.message} onChange={set('message')} /></Field>
    </SidePanel>
  );
}
