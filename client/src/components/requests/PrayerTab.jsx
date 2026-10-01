import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { fmtDate } from '../../constants.js';
import { useUrlState, urlListPage } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../ConfirmDialog.jsx';
import { Field, TextInput, Select, Checkbox, Badge } from '../ui.jsx';
import { SearchInput, FilterSelect, Pagination, EmptyState, LoadingState, ErrorState } from '../admin.jsx';
import { SidePanel, TextArea, RowButton, Panel, TabIntro, AddButton } from '../panels.jsx';
import { useRows, StatusBadge, ContactLinks, FilterChips, receivedText, SourceNote } from './common.jsx';
import { PRAYER_TYPES, SOURCES } from '../../lib/requests.js';
import { todayIso } from '../../lib/website.js';

const TYPE_TONES = { 'For the sick': 'blue', Thanksgiving: 'gold', 'For the departed': 'gray', 'Special intention': 'green' };

const URL_DEFAULTS = { view: 'New', type: 'All', q: '', page: 1, size: 20 };
const URL_ALLOWED = { view: ['New', 'Prayed for', 'Archived', 'All'], type: ['All', ...PRAYER_TYPES], size: [10, 20, 50] };

export default function PrayerTab({ onCountsChanged }) {
  const toast = useToast();
  const confirm = useConfirm();
  const layout = useOutletContext();
  const list = useRows(api.listPrayerRequests);
  // View, type, search and page live in the address bar (see useUrlState).
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const { view, type } = url;
  const setView = (v) => setUrl({ view: v });
  const setType = (v) => setUrl({ type: v });
  const [selected, setSelected] = useState(() => new Set());
  const [offeredOn, setOfferedOn] = useState(todayIso());
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null);

  const filtered = list.rows
    .filter((r) => (view === 'All' || r.status === view) && (type === 'All' || r.intention_type === type))
    .sort((a, b) => (view === 'New' ? 1 : -1) * a.created_at.localeCompare(b.created_at));
  const page = urlListPage(filtered, (r) => `${r.ref_no} ${r.intention} ${r.for_name || ''} ${r.requester_name || ''}`, url, setUrl);
  const newCount = list.rows.filter((r) => r.status === 'New').length;

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
      toast.success(`${ids.length} intention${ids.length === 1 ? '' : 's'} marked prayed for`);
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

  async function remove(r) {
    const ok = await confirm({ title: `Delete ${r.ref_no}?`, message: "Only for spam or duplicates. This can't be undone.", confirmLabel: 'Delete', tone: 'danger' });
    if (!ok) return;
    try { await api.deleteRequest('prayer_requests', r.id); list.drop(r.id); onCountsChanged(); toast.success('Deleted'); } catch (e) { toast.error(e.message || 'Could not delete'); }
  }

  const newOnPage = page.rows.filter((r) => r.status === 'New');
  const allSelected = newOnPage.length > 0 && newOnPage.every((r) => selected.has(r.id));

  return (
    <>
      <TabIntro text="Prayer intentions from parishioners. Print the list for the Mass, then mark them prayed for. An intention can only appear on the website if the person asked for that.">
        <RowButton className="!py-2.5 !text-[13.5px]" disabled={!filtered.length} onClick={() => printIntentions(filtered, layout?.parish?.name, view)}>Print this list</RowButton>
        <AddButton onClick={() => setEditing({ intention_type: 'Special intention', intention: '', for_name: '', requester_name: '', requester_mobile: '', source: 'Walk-in', allow_public: false })}>
          Add intention
        </AddButton>
      </TabIntro>

      <div className="flex gap-2.5 flex-wrap items-center mb-4">
        <FilterChips label="Which intentions" options={[['New', 'New', newCount], ['Prayed for', 'Prayed for'], ['Archived', 'Archived'], ['All', 'All']]} value={view} onChange={(v) => { setView(v); setSelected(new Set()); }} />
        <div className="flex gap-2.5 flex-wrap ml-auto">
          <SearchInput placeholder="Search intentions…" aria-label="Search intentions" value={page.query} onChange={(e) => page.setQuery(e.target.value)} />
          <FilterSelect value={type} onChange={(e) => setType(e.target.value)} aria-label="Intention type">
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
          <EmptyState title={list.rows.length ? 'Nothing here' : 'No prayer requests yet'} subtitle={view === 'New' && list.rows.length ? 'All intentions have been prayed for.' : undefined} />
        ) : (
          page.rows.map((r) => (
            <div key={r.id} className="flex items-start gap-3 px-5 py-3.5 border-b border-parish-line last:border-b-0">
              {r.status === 'New' && <Checkbox aria-label={`Select ${r.ref_no}`} checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="mt-1" />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Badge tone={TYPE_TONES[r.intention_type]}>{r.intention_type}</Badge>
                  {view === 'All' && <StatusBadge status={r.status} />}
                  <SourceNote source={r.source} />
                  {r.show_publicly && <Badge tone="green">On the website</Badge>}
                </div>
                {r.for_name && <div className="font-semibold text-[14.5px] text-parish-navy">For {r.for_name}</div>}
                <div className="text-[14px] text-parish-text3 whitespace-pre-line">{r.intention}</div>
                <div className="text-[12.5px] text-parish-muted mt-1">
                  {[r.ref_no, r.requester_name && `from ${r.requester_name}`, receivedText(r.created_at), r.offered_on && `prayed for ${fmtDate(r.offered_on)}`].filter(Boolean).join(' · ')}
                </div>
                {r.requester_mobile && <div className="mt-1.5"><ContactLinks mobile={r.requester_mobile} /></div>}
              </div>
              <div className="flex gap-1.5 flex-wrap justify-end max-w-[260px]">
                {r.allow_public && (
                  <RowButton tone="gray" disabled={busy} onClick={() => patch(r, { show_publicly: !r.show_publicly }, r.show_publicly ? 'Removed from the website' : 'Shown on the website')}>
                    {r.show_publicly ? 'Hide from website' : 'Show on website'}
                  </RowButton>
                )}
                {r.status === 'New' && <RowButton tone="green" disabled={busy} onClick={() => markPrayed([r.id])}>Prayed for</RowButton>}
                {r.status !== 'Archived' && <RowButton tone="gray" disabled={busy} onClick={() => patch(r, { status: 'Archived', show_publicly: false }, 'Archived')}>Archive</RowButton>}
                {r.status !== 'New' && <RowButton tone="gray" disabled={busy} onClick={() => patch(r, { status: 'New' }, 'Moved back to New')}>Back to New</RowButton>}
                <RowButton tone="red" disabled={busy} onClick={() => remove(r)}>Delete</RowButton>
              </div>
            </div>
          ))
        )}
        <Pagination page={page.page} pageSize={page.pageSize} total={page.total} onPage={page.setPage} onPageSize={page.setPageSize} />
      </Panel>

      {editing && <PrayerForm row={editing} onClose={() => setEditing(null)} onSaved={(row) => { changed([row]); setEditing(null); }} />}
    </>
  );
}

function PrayerForm({ row, onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState(row);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    if (!form.intention.trim()) { setError('Write the intention.'); return; }
    setSaving(true);
    setError('');
    try {
      const saved = await api.savePrayerRequest(form);
      toast.success('Intention added');
      onSaved(saved);
    } catch (e) {
      setError(e.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SidePanel title="Add a prayer intention" subtitle="For someone at the office or on the phone" onClose={onClose} onSave={save} saving={saving} error={error}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kind">
          <Select value={form.intention_type} onChange={set('intention_type')}>{PRAYER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
        </Field>
        <Field label="Received by">
          <Select value={form.source} onChange={set('source')}>{SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
        </Field>
      </div>
      <Field label="For (name of the person, optional)"><TextInput value={form.for_name} onChange={set('for_name')} placeholder="e.g. the late Lola Rosa" /></Field>
      <Field label="Intention" required><TextArea rows={4} value={form.intention} onChange={set('intention')} /></Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Requested by (optional)"><TextInput value={form.requester_name} onChange={set('requester_name')} /></Field>
        <Field label="Mobile (optional)"><TextInput type="tel" value={form.requester_mobile} onChange={set('requester_mobile')} /></Field>
      </div>
      <label className="flex items-start gap-3 text-[13.5px] text-parish-navy cursor-pointer">
        <Checkbox checked={!!form.allow_public} onChange={(e) => setForm((f) => ({ ...f, allow_public: e.target.checked }))} className="mt-0.5" />
        <span>The person agreed to have this intention shared on the parish website</span>
      </label>
    </SidePanel>
  );
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Open a plain printable page of intentions, grouped by kind. */
function printIntentions(rows, parishName, view) {
  const groups = PRAYER_TYPES.map((t) => [t, rows.filter((r) => r.intention_type === t)]).filter(([, rs]) => rs.length);
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Prayer intentions</title>
<style>body{font-family:Georgia,serif;margin:28px;color:#17263f}h1{font-size:22px;margin:0}p.sub{margin:4px 0 18px;color:#6b6552;font-size:13px}
h2{font-size:15px;text-transform:uppercase;letter-spacing:.08em;border-bottom:1px solid #ccc;padding-bottom:4px;margin:20px 0 8px}
ol{margin:0;padding-left:22px}li{margin:6px 0;font-size:15px;line-height:1.45}.for{font-weight:bold}</style></head><body>
<h1>Prayer intentions</h1><p class="sub">${escapeHtml(parishName || '')} · ${escapeHtml(view === 'All' ? 'All' : view)} · printed ${escapeHtml(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))}</p>
${groups.map(([t, rs]) => `<h2>${escapeHtml(t)}</h2><ol>${rs.map((r) => `<li>${r.for_name ? `<span class="for">${escapeHtml(r.for_name)}</span> — ` : ''}${escapeHtml(r.intention)}</li>`).join('')}</ol>`).join('')}
<script>window.onload=function(){window.print()}</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}
