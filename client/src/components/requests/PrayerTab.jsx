import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { fmtDate } from '../../constants.js';
import { useLiveRefresh, useUrlState, urlListPage } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../ConfirmDialog.jsx';
import { Field, TextInput, Select, Checkbox, Badge } from '../ui.jsx';
import { SearchInput, FilterSelect, Pagination, EmptyState, LoadingState, ErrorState, NewItemsNote } from '../admin.jsx';
import { SidePanel, TextArea, RowButton, Panel, TabIntro, AddButton } from '../panels.jsx';
import { useRows, StatusBadge, ContactLinks, FilterChips, receivedText, SourceNote } from './common.jsx';
import { SOURCES } from '../../lib/requests.js';
import { PRAYER_MAX_DAYS, PRAYER_TYPES, isShownNow, needsAttention, prayerPath, showUntilBounds, validShowUntil, websiteState } from '../../lib/prayers.js';
import { addDays, todayIso } from '../../lib/website.js';

const TYPE_TONES = { 'For the sick': 'blue', Thanksgiving: 'gold', 'For the departed': 'gray', 'Special intention': 'green' };

const VIEWS = ['Waiting', 'New', 'Website', 'Prayed for', 'Archived', 'All'];
const URL_DEFAULTS = { view: 'Waiting', type: 'All', q: '', page: 1, size: 20 };
const URL_ALLOWED = { view: VIEWS, type: ['All', ...PRAYER_TYPES], size: [10, 20, 50] };

function inView(r, view, today) {
  if (view === 'All') return true;
  if (view === 'Waiting') return needsAttention(r);
  if (view === 'Website') return isShownNow(r, today);
  return r.status === view;
}

/**
 * Prayer requests from the website's form and the office (0100). The ones
 * the person asked to show on the prayer wall wait here until staff decide;
 * nothing shows on the website before that. The rest are for the priest:
 * print the list for Mass, then mark them prayed for.
 */
export default function PrayerTab({ onCountsChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const layout = useOutletContext();
  const list = useRows(api.listPrayerRequests);
  // View, kind, search and page live in the address bar (see useUrlState).
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const { view, type } = url;
  const [selected, setSelected] = useState(() => new Set());
  const [offeredOn, setOfferedOn] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);
  // New requests from the website, unless one is being edited or rows are ticked.
  const live = useLiveRefresh(list.reload, { kinds: ['prayer'], busy: !!(editing || busy || selected.size) });
  const today = todayIso();

  // Waiting and New: oldest first (who has waited longest). Others: newest first.
  const oldestFirst = view === 'Waiting' || view === 'New';
  const filtered = list.rows
    .filter((r) => inView(r, view, today) && (type === 'All' || r.intention_type === type))
    .sort((a, b) => (oldestFirst ? 1 : -1) * a.created_at.localeCompare(b.created_at));
  const page = urlListPage(filtered, (r) => `${r.ref_no} ${r.intention} ${r.for_name || ''} ${r.requester_name || ''}`, url, setUrl);
  const count = (v) => list.rows.filter((r) => inView(r, v, today)).length;

  function toggle(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function changed(rows) {
    list.upsertMany(rows);
    onCountsChanged();
  }

  async function markPrayed(ids) {
    setBusy(true);
    try {
      changed(await api.markPrayersPrayed(ids, offeredOn));
      setSelected(new Set());
      toast.success(`${ids.length} request${ids.length === 1 ? '' : 's'} marked prayed for`);
    } catch (e) {
      toast.error(e.message || 'Could not update');
    } finally {
      setBusy(false);
    }
  }

  async function patch(r, fields, message) {
    setBusy(true);
    try {
      changed([await api.savePrayerRequest({ id: r.id, ...fields })]);
      if (message) toast.success(message);
    } catch (e) {
      toast.error(e.message || 'Could not update');
    } finally {
      setBusy(false);
    }
  }

  /** Approve for the wall: straight away when its date is still ahead, else pick one first. */
  function show(r) {
    if (r.show_until && r.show_until >= today) patch(r, { show_publicly: true }, `On the website until ${fmtDate(r.show_until)}`);
    else setEditing({ ...r, show_publicly: true, show_until: addDays(today, 30) });
  }

  async function remove(r) {
    const ok = await confirm({ title: `Delete ${r.ref_no}?`, message: "Only for spam or duplicates. This can't be undone.", confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    try { await api.deleteRequest('prayer_requests', r.id); list.drop(r.id); onCountsChanged(); toast.success('Deleted'); } catch (e) { toast.error(e.message || 'Could not delete'); }
  }

  const newOnPage = page.rows.filter((r) => r.status === 'New');
  const allSelected = newOnPage.length > 0 && newOnPage.every((r) => selected.has(r.id));
  const emptyNote = !list.rows.length ? undefined
    : view === 'Waiting' ? 'Nothing is waiting: every request has been reviewed or prayed for.'
      : view === 'Website' ? 'No prayer request is on the website right now.' : undefined;

  return (
    <>
      <TabIntro text="Prayer requests from the website and the office. The ones the person asked to show on the prayer wall (Komunidad → Pag-ampo) wait under Waiting until you show them or decide not to; nothing appears on the website before that, and never their mobile number. Print the list for Mass, then mark them prayed for.">
        <RowButton className="!py-2.5 !text-[13.5px]" disabled={!filtered.length} onClick={() => printIntentions(filtered, layout?.parish?.name, view)}>Print this list</RowButton>
        <AddButton onClick={() => setEditing({ intention_type: 'Special intention', intention: '', for_name: '', requester_name: '', requester_mobile: '', source: 'Walk-in', allow_public: false, show_publicly: false, show_until: '', show_name: false, staff_notes: '' })}>
          Add request
        </AddButton>
      </TabIntro>
      <NewItemsNote count={live.waiting} noun="request" onShow={live.showNow} />

      <div className="flex gap-2.5 flex-wrap items-center mb-4">
        <FilterChips
          label="Which requests"
          options={[['Waiting', 'Waiting', count('Waiting')], ['New', 'To pray for', count('New')], ['Website', 'On the website', count('Website')], ['Prayed for', 'Prayed for'], ['Archived', 'Archived'], ['All', 'All']]}
          value={view}
          onChange={(v) => { setUrl({ view: v }); setSelected(new Set()); }}
        />
        <div className="flex gap-2.5 flex-wrap ml-auto">
          <SearchInput placeholder="Search requests…" aria-label="Search prayer requests" value={page.query} onChange={(e) => page.setQuery(e.target.value)} />
          <FilterSelect value={type} onChange={(e) => setUrl({ type: e.target.value })} aria-label="Kind of request">
            <option value="All">All kinds</option>
            {PRAYER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </FilterSelect>
        </div>
      </div>

      {newOnPage.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap mb-3 px-4 py-3 rounded-xl bg-[var(--p-blue-tint)]">
          <label className="flex items-center gap-2 text-[13.5px] font-semibold text-parish-navy cursor-pointer">
            <Checkbox checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(newOnPage.map((r) => r.id)))} />
            Select all on this page
          </label>
          <span className="text-[13px] text-parish-text2 ml-auto">Prayed for at the Mass on</span>
          <input type="date" aria-label="Mass date" value={offeredOn} onChange={(e) => setOfferedOn(e.target.value)}
            className="px-2.5 py-1.5 text-[14px] bg-parish-surface border-[1.5px] border-parish-borderSoft rounded-lg outline-none" />
          <RowButton tone="green" disabled={busy || !selected.size} onClick={() => markPrayed([...selected])}>
            Mark {selected.size || ''} prayed for
          </RowButton>
        </div>
      )}

      <Panel className="overflow-hidden">
        {list.loading ? <LoadingState /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : !page.total ? (
          <EmptyState title={list.rows.length ? 'Nothing here' : 'No prayer requests yet'} subtitle={emptyNote} />
        ) : (
          page.rows.map((r) => {
            const state = websiteState(r, today);
            return (
              <div key={r.id} className="flex items-start gap-3 px-5 py-3.5 border-b border-parish-line last:border-b-0 flex-wrap">
                {r.status === 'New' && <Checkbox aria-label={`Select ${r.ref_no}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="mt-1" />}
                <div className="flex-1 min-w-[240px]">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge tone={TYPE_TONES[r.intention_type]}>{r.intention_type}</Badge>
                    <StatusBadge status={r.status} />
                    <SourceNote source={r.source} />
                    <WebsiteBadge r={r} state={state} />
                    {r.prayed > 0 && <Badge tone="blue" title="Taps of “Nag-ampo ko” on the website, one per phone or computer">🙏 {r.prayed} prayed</Badge>}
                  </div>
                  {r.for_name && <div className="font-semibold text-[14.5px] text-parish-navy">For {r.for_name}</div>}
                  <div className="text-[14px] text-parish-text3 whitespace-pre-line">{r.intention}</div>
                  {r.staff_notes && <div className="text-[12.5px] text-parish-muted italic mt-1">Note: {r.staff_notes}</div>}
                  <div className="text-[12.5px] text-parish-muted mt-1">
                    {[
                      r.ref_no,
                      r.requester_name && `from ${r.requester_name}`,
                      r.allow_public && (r.show_name ? 'name shown on the website' : 'name not shown'),
                      receivedText(r.created_at),
                      r.offered_on && `prayed for ${fmtDate(r.offered_on)}`,
                      r.reviewed_by_name && r.allow_public && `reviewed by ${r.reviewed_by_name}`,
                    ].filter(Boolean).join(' · ')}
                  </div>
                  {r.requester_mobile && <div className="mt-1.5"><ContactLinks mobile={r.requester_mobile} /></div>}
                </div>
                <div className="flex gap-1.5 flex-wrap justify-end max-w-[320px]">
                  {r.allow_public && !r.show_publicly && r.status !== 'Archived' && <RowButton tone="green" disabled={busy} onClick={() => show(r)}>Show on website</RowButton>}
                  {state === 'review' && <RowButton tone="gray" disabled={busy} onClick={() => patch(r, { reviewed_at: new Date().toISOString() }, 'Kept off the website')}>Don’t show</RowButton>}
                  {state === 'hidden' && r.status !== 'Archived' && <RowButton tone="gray" disabled={busy} onClick={() => patch(r, { reviewed_at: null }, 'Back with the ones to review')}>Review again</RowButton>}
                  {r.show_publicly && <RowButton tone="gray" disabled={busy} onClick={() => patch(r, { show_publicly: false }, 'Taken off the website')}>Hide from website</RowButton>}
                  {state === 'shown' && (
                    <a href={prayerPath(r.id)} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg font-semibold text-[12.5px] whitespace-nowrap no-underline bg-parish-sunk text-parish-text2">
                      See on website
                    </a>
                  )}
                  <RowButton disabled={busy} onClick={() => setEditing(r)} viewLabel="View">Edit</RowButton>
                  {r.status === 'New' && <RowButton tone="green" disabled={busy} onClick={() => markPrayed([r.id])}>Prayed for</RowButton>}
                  {r.status !== 'Archived' && <RowButton tone="gray" disabled={busy} onClick={() => patch(r, { status: 'Archived', show_publicly: false }, 'Archived')}>Archive</RowButton>}
                  {r.status !== 'New' && <RowButton tone="gray" disabled={busy} onClick={() => patch(r, { status: 'New' }, 'Moved back to To pray for')}>Back to New</RowButton>}
                  <RowButton tone="red" disabled={busy} onClick={() => remove(r)}>Delete</RowButton>
                </div>
              </div>
            );
          })
        )}
        <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPage={page.setPage} onPageSize={page.setPageSize} />
      </Panel>

      {editing && <PrayerForm row={editing} onClose={() => setEditing(null)} onSaved={(row) => { changed([row]); setEditing(null); }} />}
    </>
  );
}

/** Where a request stands with the website, as a badge. */
function WebsiteBadge({ r, state }) {
  switch (state) {
    case 'review': return <Badge tone="gold">Waiting for review</Badge>;
    case 'shown': return <Badge tone="green">On the website until {fmtDate(r.show_until)}</Badge>;
    case 'ended': return <Badge tone="gray" title="Approved, but its last day has passed (or none was set). Edit it to choose a new one.">Website: {r.show_until ? `ended ${fmtDate(r.show_until)}` : 'no date set'}</Badge>;
    case 'hidden': return <Badge tone="gray">Not on the website</Badge>;
    default: return <Badge tone="gray" title="The person didn't ask for it to be shown on the website">Private</Badge>;
  }
}

/** Add a request from the office or the phone, or edit one: its text, and how it shows on the website. */
function PrayerForm({ row, onClose, onSaved }) {
  const toast = useToast();
  const isNew = !row.id;
  // Online requests: whether it may show at all is the person's choice, not ours.
  const consentFixed = !isNew && row.source === 'Online';
  const [form, setForm] = useState({
    ...row,
    for_name: row.for_name || '', requester_name: row.requester_name || '', requester_mobile: row.requester_mobile || '',
    show_until: row.show_until || '', staff_notes: row.staff_notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const check = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.checked }));
  const bounds = showUntilBounds();

  async function save() {
    if (!form.intention.trim()) { setError('Write the prayer request.'); return; }
    const shown = form.allow_public && form.show_publicly;
    if (shown && !validShowUntil(form.show_until)) {
      setError(`Choose the last day it shows on the website: from today up to ${PRAYER_MAX_DAYS} days ahead.`);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const fields = { ...form, show_publicly: shown, show_name: form.allow_public && !!form.show_name };
      if (!form.allow_public) fields.show_until = null;
      if (consentFixed) delete fields.allow_public;
      // Showing it or not is what marks it reviewed (the database's trigger); the editor leaves the stamp alone.
      delete fields.reviewed_at;
      const saved = await api.savePrayerRequest(fields);
      toast.success(isNew ? 'Prayer request added' : 'Saved');
      onSaved(saved);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel
      title={isNew ? 'Add a prayer request' : `Edit ${row.ref_no}`}
      subtitle={isNew ? 'For someone at the office or on the phone' : 'What shows on the website is the kind, who it’s for, the request and (if they chose it) their name'}
      onClose={onClose} onSave={save} saving={saving} error={error}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind">
          <Select value={form.intention_type} onChange={set('intention_type')}>{PRAYER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
        </Field>
        {isNew && (
          <Field label="Received by">
            <Select value={form.source} onChange={set('source')}>{SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
          </Field>
        )}
      </div>
      <Field label="For (name of the person, optional)"><TextInput value={form.for_name} onChange={set('for_name')} placeholder="e.g. the late Lola Rosa" /></Field>
      <Field label="Prayer request" required><TextArea rows={4} value={form.intention} onChange={set('intention')} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Requested by"><TextInput value={form.requester_name} onChange={set('requester_name')} /></Field>
        <Field label="Mobile (optional, never shown)"><TextInput type="tel" value={form.requester_mobile} onChange={set('requester_mobile')} /></Field>
      </div>
      <Field label="Staff note (optional, never shown)"><TextArea rows={2} value={form.staff_notes} onChange={set('staff_notes')} /></Field>

      <div className="rounded-xl border border-parish-borderSoft p-4 flex flex-col gap-3">
        <div className="font-semibold text-[14px] text-parish-navy">Prayer wall on the website</div>
        {consentFixed ? (
          <div className="text-[13.5px] text-parish-text2">
            {form.allow_public ? 'The person asked for this to be shown on the website.' : 'The person asked for this to stay private (the priest and the office only). It can’t be shown on the website.'}
          </div>
        ) : (
          <label className="flex items-start gap-3 text-[13.5px] text-parish-navy cursor-pointer">
            <Checkbox checked={!!form.allow_public} onChange={check('allow_public')} className="mt-0.5" />
            <span>The person agreed to have this shown on the parish website</span>
          </label>
        )}
        {form.allow_public && (
          <>
            <label className="flex items-start gap-3 text-[13.5px] text-parish-navy cursor-pointer">
              <Checkbox checked={!!form.show_publicly} onChange={check('show_publicly')} className="mt-0.5" />
              <span>Show it on the website</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Show until (last day)" required={!!form.show_publicly}>
                <TextInput type="date" min={bounds.min} max={bounds.max} value={form.show_until} onChange={set('show_until')} />
              </Field>
            </div>
            <label className="flex items-start gap-3 text-[13.5px] text-parish-navy cursor-pointer">
              <Checkbox checked={!!form.show_name} onChange={check('show_name')} className="mt-0.5" />
              <span>Show the requester’s name with it (otherwise “Usa ka parokyano”)</span>
            </label>
          </>
        )}
      </div>
    </SidePanel>
  );
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const VIEW_TITLES = { Waiting: 'Waiting', New: 'To pray for', Website: 'On the website', 'Prayed for': 'Prayed for', Archived: 'Archived', All: 'All' };

/** Open a plain printable page of requests, grouped by kind, for Mass. */
function printIntentions(rows, parishName, view) {
  const groups = PRAYER_TYPES.map((t) => [t, rows.filter((r) => r.intention_type === t)]).filter(([, rs]) => rs.length);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Prayer requests</title>
<style>body{font-family:Georgia,serif;margin:28px;color:#17263f}h1{font-size:22px;margin:0}p.sub{margin:4px 0 18px;color:#6b6552;font-size:13px}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #ccc;padding-bottom:4px;margin:20px 0 8px}
ol{margin:0;padding-left:22px}li{margin:6px 0;font-size:15px;line-height:1.45}.for{font-weight:bold}</style></head><body>
<h1>Prayer requests</h1><p class="sub">${escapeHtml(parishName || '')} · ${escapeHtml(VIEW_TITLES[view] || view)} · printed ${escapeHtml(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}</p>
${groups.map(([t, rs]) => `<h2>${escapeHtml(t)}</h2><ol>${rs.map((r) => `<li>${r.for_name ? `<span class="for">${escapeHtml(r.for_name)}</span> — ` : ''}${escapeHtml(r.intention)}</li>`).join('')}</ol>`).join('')}
<script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
