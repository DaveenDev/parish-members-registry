import React, { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { PageHeader, PageBody, EmptyState, ErrorState, LoadingState, Panel, SearchInput, FilterSelect, Pagination } from '../../components/admin.jsx';
import { Badge, Checkbox } from '../../components/ui.jsx';
import { useAsyncData, useUrlState, urlListPage } from '../../hooks.js';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';
import { fmtDateTime } from '../../constants.js';

const KEEP_DAYS = 30;
const URL_DEFAULTS = { kind: 'All', q: '', page: 1, size: 20 };
const URL_ALLOWED = { kind: ['All', 'household', 'member'], size: [10, 20, 50] };
const trashText = (r) => [r.label, r.detail, r.deleted_by_name].filter(Boolean).join(' ');

function daysLeft(deletedAt, now = Date.now()) {
  return Math.max(0, KEEP_DAYS - Math.floor((now - new Date(deletedAt).getTime()) / 86400000));
}

/** Deleted households and members, kept for 30 days so they can be put back. */
export default function Trash() {
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const layout = useOutletContext();
  const trash = useAsyncData(() => api.listTrash(), []);
  const [busyId, setBusyId] = useState(null);
  const all = trash.data?.rows || [];
  // Searched, filtered and paged here; the search and page are in the address bar.
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const list = urlListPage(url.kind === 'All' ? all : all.filter((r) => r.kind === url.kind), trashText, url, setUrl);
  const rows = list.rows;
  const filtered = url.kind !== 'All' || !!url.q;

  // Ticked entries, for Restore or Delete for good on all of them at once.
  // A selection only ever covers the rows on screen.
  const [selected, setSelected] = useState(() => new Set());
  // While a bulk action runs: { verb: 'Restoring' | 'Deleting', done, of }.
  const [bulk, setBulk] = useState(null);
  useEffect(() => { setSelected(new Set()); }, [url.kind, url.q, url.page, url.size]);
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  const toggleSelect = (id) => setSelected((s) => {
    const next = new Set(s);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const busy = (r) => busyId === r.id || !!bulk;

  /**
   * Run `action` on each ticked entry, one at a time (the database restores
   * or deletes one entry per call), and say how it went. Households go
   * first, so a member whose household is ticked too has it to go back to.
   */
  async function runBulk(verb, action) {
    const items = [...selectedRows].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'household' ? -1 : 1));
    const failed = [];
    setBulk({ verb, done: 0, of: items.length });
    for (const [i, r] of items.entries()) {
      try {
        await action(r);
      } catch (e) {
        failed.push(`${r.label}: ${e.message || 'failed'}`);
      }
      setBulk({ verb, done: i + 1, of: items.length });
    }
    setBulk(null);
    setSelected(new Set());
    trash.reload();
    layout?.refreshNavCounts?.();
    return { ok: items.length - failed.length, failed };
  }

  function report({ ok, failed }, doneText) {
    if (ok) toast.success(`${ok} ${ok === 1 ? 'entry' : 'entries'} ${doneText}`);
    if (failed.length) toast.error(`${failed.length} could not be done. ${failed.slice(0, 3).join('; ')}${failed.length > 3 ? '…' : ''}`);
  }

  async function restoreSelected() {
    report(await runBulk('Restoring', (r) => api.restoreDeleted(r.id)), 'restored to the registry');
  }

  async function purgeSelected() {
    const n = selectedRows.length;
    const households = selectedRows.filter((r) => r.kind === 'household').length;
    const ok = await confirm({
      title: `Delete ${n} ${n === 1 ? 'entry' : 'entries'} for good?`,
      message: `${households ? `This includes ${households === 1 ? 'a household' : `${households} households`}, with all their members. ` : ''}They’re removed permanently and can’t be restored.`,
      confirmLabel: `Delete ${n} for good`,
      tone: 'danger',
    });
    if (!ok) return;
    report(await runBulk('Deleting', (r) => api.purgeDeleted(r.id)), 'deleted for good');
  }

  async function restore(r) {
    setBusyId(r.id);
    try {
      const res = await api.restoreDeleted(r.id);
      toast.success(`${r.label} is back in the registry`, {
        action: { label: 'Open', onClick: () => navigate(res.kind === 'household' ? `/admin/households?status=All&q=${encodeURIComponent(r.label)}` : `/admin/members?q=${encodeURIComponent(r.label)}`) },
      });
      trash.reload();
      layout?.refreshNavCounts?.();
    } catch (e) {
      toast.error(e.message || 'Could not restore this');
    } finally {
      setBusyId(null);
    }
  }

  async function purge(r) {
    const ok = await confirm({
      title: `Delete ${r.label} for good?`,
      message: r.kind === 'household'
        ? 'The household and its members are removed permanently and can’t be restored.'
        : 'The member is removed permanently and can’t be restored.',
      confirmLabel: 'Delete for good',
      tone: 'danger',
    });
    if (!ok) return;
    setBusyId(r.id);
    try {
      await api.purgeDeleted(r.id);
      toast.success('Deleted for good');
      trash.reload();
    } catch (e) {
      toast.error(e.message || 'Could not delete this');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader title="Trash" subtitle={`Deleted households and members, kept for ${KEEP_DAYS} days`}>
        <FilterSelect aria-label="What was deleted" value={url.kind} onChange={(e) => setUrl({ kind: e.target.value })}>
          <option value="All">Households and members</option><option value="household">Households</option><option value="member">Members</option>
        </FilterSelect>
        <SearchInput placeholder="Search name or who deleted it…" aria-label="Search the trash" value={list.query} onChange={(e) => list.setQuery(e.target.value)} />
      </PageHeader>
      <PageBody>
        <div>
          <div className="mb-[18px] px-[18px] py-3.5 bg-[var(--p-blue-tint)] border border-parish-infoBorder rounded-xl text-[13.5px] text-parish-info leading-relaxed">
            Restoring puts the record back as it was, with its members, sacrament verifications and census answers, and links it again to
            certificate requests and the blood donor list. Items are removed for good after {KEEP_DAYS} days.
          </div>
          {(selectedRows.length > 0 || bulk) && (
            <div role="region" aria-label="Selected entries" className="sticky top-2 md:top-[92px] z-[5] mb-3 flex items-center gap-2.5 flex-wrap px-4 py-3 rounded-xl bg-parish-navy text-white shadow-card">
              {bulk ? (
                <span role="status" className="font-semibold text-[13.5px]">{bulk.verb} {Math.min(bulk.done + 1, bulk.of)} of {bulk.of}…</span>
              ) : (
                <>
                  <span className="font-semibold text-[13.5px] mr-1">{selectedRows.length} selected</span>
                  <button onClick={restoreSelected} className="appearance-none border-none cursor-pointer px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 font-semibold text-[13px] text-white">Restore</button>
                  <button onClick={purgeSelected} className="appearance-none border-none cursor-pointer px-3 py-1.5 rounded-lg bg-[#b42318] hover:brightness-110 font-semibold text-[13px] text-white">Delete for good</button>
                  <button onClick={() => setSelected(new Set())} className="ml-auto appearance-none border-none cursor-pointer px-2 py-1.5 bg-transparent font-semibold text-[13px] text-white/80 hover:text-white">Clear selection</button>
                </>
              )}
            </div>
          )}
          <Panel className="overflow-hidden">
            {!!rows.length && (
              <label className="flex items-center gap-3 px-[18px] py-2.5 bg-parish-sunk border-b border-parish-line cursor-pointer font-semibold text-[12.5px] text-parish-text2">
                <Checkbox checked={allSelected} onChange={toggleSelectAll} disabled={!!bulk} />
                {allSelected ? 'All on this page selected' : `Select all ${rows.length} on this page`}
              </label>
            )}
            {trash.loading && !trash.data && <LoadingState label="Loading the trash…" />}
            {trash.error && <ErrorState message={trash.error} onRetry={trash.reload} />}
            {trash.data && !all.length && <EmptyState title="The trash is empty" subtitle="Deleted households and members show up here." />}
            {trash.data && !!all.length && !rows.length && filtered && <EmptyState title="Nothing in the trash matches" subtitle="Try another name or clear the search." />}
            {!!rows.length && (
              <ul className="list-none m-0 p-0 divide-y divide-parish-line">
                {rows.map((r) => (
                  <li key={r.id} className={`px-[18px] py-3.5 flex items-center gap-3 flex-wrap ${selected.has(r.id) ? 'bg-[var(--p-blue-tint)]' : ''}`}>
                    <Checkbox checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} disabled={!!bulk} aria-label={`Select ${r.label}`} className="self-start mt-0.5" />
                    <div className="min-w-0 flex-1 basis-[calc(100%-40px)] sm:basis-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-[14.5px] text-parish-navy">{r.label}</span>
                        <Badge tone={r.kind === 'household' ? 'gold' : 'blue'}>{r.kind === 'household' ? 'Household' : 'Member'}</Badge>
                      </div>
                      <div className="text-[12.5px] text-parish-muted">
                        {[r.detail, `deleted ${fmtDateTime(r.deleted_at)}`, r.deleted_by_name && `by ${r.deleted_by_name}`].filter(Boolean).join(' · ')}
                      </div>
                      <div className="text-[12px] text-parish-warn font-semibold">{daysLeft(r.deleted_at)} day(s) left</div>
                    </div>
                    {/* Phones: the buttons go under the details, side by side. */}
                    <div className="flex gap-2 max-sm:w-full max-sm:pl-[31px]">
                      <button onClick={() => restore(r)} disabled={busy(r)} className="max-sm:flex-1 appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg disabled:opacity-60">Restore</button>
                      <button onClick={() => purge(r)} disabled={busy(r)} className="max-sm:flex-1 appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-parish-error bg-parish-errorBg rounded-lg disabled:opacity-60">Delete for good</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {trash.data && <Pagination page={list.page} pageSize={list.pageSize} total={list.total} onPage={list.setPage} onPageSize={list.setPageSize} />}
          </Panel>
        </div>
      </PageBody>
    </>
  );
}
