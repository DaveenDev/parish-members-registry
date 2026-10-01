import React, { useEffect, useState } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { PageHeader, PageBody, FilterSelect, SearchInput, Pagination, EmptyState, ErrorState, LoadingState, Panel, ActionMenu } from '../../components/admin.jsx';
import { StatusPill, PrimaryButton, Badge, Checkbox } from '../../components/ui.jsx';
import MemberDetailModal from '../../components/MemberDetailModal.jsx';
import HouseholdEditDrawer from '../../components/HouseholdEditDrawer.jsx';
import NewHouseholdDrawer from '../../components/NewHouseholdDrawer.jsx';
import { bis, RELATIONSHIP_LABELS } from '../../lib/bisaya.js';
import PrintSheet, { printHouseholdSheet } from '../../components/PrintSheet.jsx';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';
import { useDebounced, useUrlState } from '../../hooks.js';
import { VerifiedLine } from '../../components/VerifiedLine.jsx';
import { useAuth } from '../../AuthContext.jsx';
import { can } from '../../lib/access.js';
import { daysAgo, fmtDateTime } from '../../constants.js';

const SORTS = [['registered', 'Registered'], ['name', 'Household'], ['gkk', 'GKK'], ['members', 'Members'], ['updated', 'Last updated']];
const URL_DEFAULTS = { status: 'All', gkk: 'All', q: '', sort: 'registered', dir: '', page: 1, size: 10 };
const URL_ALLOWED = { status: ['All', 'Verified', 'Pending'], sort: SORTS.map(([k]) => k), dir: ['', 'asc', 'desc'], size: [10, 20, 50] };
// Dates sort newest first by default, everything else A→Z (see householdQuery in api.js).
const defaultDir = (key) => (key === 'registered' || key === 'updated' ? 'desc' : 'asc');
const MAX_BULK_PRINT = 50;

export default function Households() {
  const location = useLocation();
  const layout = useOutletContext();
  const toast = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const canEdit = can(user, 'editRegistry');
  const canDelete = can(user, 'deleteRecords');

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Filters, search, sort and page live in the address bar (see useUrlState),
  // so dashboard links like ?status=Pending land on the filtered list.
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const { status, gkk, q: search, sort, page, size: pageSize } = url;
  const dir = url.dir || defaultDir(sort);
  const debouncedSearch = useDebounced(search);
  const [gkkOptions, setGkkOptions] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [expandedMembers, setExpandedMembers] = useState({});
  const [openMemberId, setOpenMemberId] = useState(null);
  const [editing, setEditing] = useState(null);
  // The old /admin/households/new link arrives here with the panel open.
  const [creating, setCreating] = useState(!!location.state?.newHousehold);
  const [printData, setPrintData] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState('');
  const [exporting, setExporting] = useState(false);

  const filters = { status, gkk, search: debouncedSearch };

  function reload() {
    setLoading(true);
    setError('');
    api.listHouseholds({ ...filters, sortKey: sort, sortDir: dir, page, pageSize })
      .then((res) => { setRows(res.rows); setTotal(res.total); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  function changed() {
    reload();
    layout?.refreshNavCounts?.();
  }

  // An empty table means something different when no filters are applied:
  // the register itself is empty, not the search.
  const isFiltered = status !== 'All' || gkk !== 'All' || !!debouncedSearch;

  useEffect(() => { reload(); }, [status, gkk, debouncedSearch, sort, dir, page, pageSize]);
  // A selection only ever covers the rows on screen.
  useEffect(() => { setSelected(new Set()); }, [status, gkk, debouncedSearch, sort, dir, page, pageSize]);
  useEffect(() => { api.listGkks().then((res) => setGkkOptions(res.rows.map((r) => r.name))).catch(() => {}); }, []);

  function setSort(key) {
    if (key === sort) setUrl({ dir: dir === 'asc' ? 'desc' : 'asc' });
    else setUrl({ sort: key, dir: '' });
  }

  async function toggleExpand(id) {
    const isOpening = !expanded[id];
    setExpanded((e) => ({ ...e, [id]: isOpening }));
    if (isOpening && !expandedMembers[id]) {
      try {
        const res = await api.getHousehold(id);
        setExpandedMembers((m) => ({ ...m, [id]: res.members }));
      } catch (e) {
        toast.error(e.message || 'Could not load household members');
      }
    }
  }

  /**
   * Re-fetch the member lists of expanded households (or just `onlyId`) after
   * members change, so open rows show the new names instead of going blank.
   */
  function refreshExpanded(onlyId) {
    const ids = Object.keys(expanded).filter((id) => expanded[id] && (onlyId === undefined || String(onlyId) === id));
    // Drop caches that might be stale so collapsed rows refetch when reopened;
    // expanded rows keep showing their list until the fresh one arrives.
    setExpandedMembers((m) => {
      const next = { ...m };
      for (const id of Object.keys(next)) {
        const affected = onlyId === undefined || String(onlyId) === id;
        if (affected && !expanded[id]) delete next[id];
      }
      return next;
    });
    for (const id of ids) {
      api.getHousehold(id)
        .then((res) => setExpandedMembers((m) => ({ ...m, [id]: res.members })))
        .catch(() => {});
    }
  }

  async function toggleStatus(h) {
    const next = h.status === 'Verified' ? 'Pending' : 'Verified';
    try {
      await api.updateHousehold(h.id, { status: next });
      toast.success(`${h.household_name} marked ${next}`);
      changed();
    } catch (e) {
      toast.error(e.message || 'Could not update status');
    }
  }

  async function print(list) {
    try {
      const data = await Promise.all(list.map((h) => api.getHousehold(h.id)));
      setPrintData(data.length === 1 ? data[0] : data);
      // Let React commit the print sheet before handing off to the browser.
      requestAnimationFrame(() => requestAnimationFrame(() => printHouseholdSheet()));
    } catch (e) {
      toast.error(e.message || 'Could not prepare the print sheet');
    }
  }

  async function removeHousehold(h) {
    const ok = await confirm({
      title: `Delete ${h.household_name}?`,
      message: `The household and its ${h.member_count} member record(s) move to the Trash, where they can be restored for 30 days.`,
      confirmLabel: 'Delete household',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const trashId = await api.deleteHousehold(h.id);
      toast.success(`${h.household_name} moved to the trash`, trashId ? {
        action: {
          label: 'Undo',
          onClick: () => api.restoreDeleted(trashId)
            .then(() => { toast.success(`${h.household_name} restored`); changed(); })
            .catch((e) => toast.error(e.message || 'Could not restore')),
        },
      } : undefined);
      changed();
    } catch (e) {
      toast.error(e.message || 'Could not delete household');
    }
  }

  // ---- bulk actions on the selected rows --------------------------------
  const selectedRows = rows.filter((h) => selected.has(h.id));
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  function toggleSelect(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((h) => h.id)));
  }

  async function bulkVerify() {
    const pending = selectedRows.filter((h) => h.status !== 'Verified');
    if (!pending.length) { toast.success('All of these are already verified'); return; }
    const ok = await confirm({
      title: `Verify ${pending.length} household(s)?`,
      message: 'Only verify families whose details you have checked.',
      confirmLabel: 'Mark verified',
    });
    if (!ok) return;
    setBulkBusy('verify');
    try {
      await api.setHouseholdsStatus(pending.map((h) => h.id), 'Verified');
      toast.success(`${pending.length} household(s) marked Verified`);
      setSelected(new Set());
      changed();
    } catch (e) {
      toast.error(e.message || 'Could not verify these households');
    } finally {
      setBulkBusy('');
    }
  }

  async function bulkPrint() {
    if (selectedRows.length > MAX_BULK_PRINT) { toast.error(`Print up to ${MAX_BULK_PRINT} households at a time`); return; }
    setBulkBusy('print');
    await print(selectedRows);
    setBulkBusy('');
  }

  async function exportCsv(params, filename) {
    setExporting(true);
    try {
      const n = await api.exportHouseholdsCsv(params, filename);
      toast.success(`Exported ${n} household(s)`);
    } catch (e) {
      toast.error(e.message || 'Could not export');
    } finally {
      setExporting(false);
    }
  }

  const rowActions = (h) => [
    { label: 'Print record', onClick: () => print([h]) },
    canDelete && { label: 'Delete household', tone: 'danger', onClick: () => removeHousehold(h) },
  ];

  const sortHeader = (key, label, extra = '') => {
    const active = sort === key;
    return (
      <th scope="col" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={`text-left px-4 py-3.5 whitespace-nowrap ${extra}`}>
        <button type="button" onClick={() => setSort(key)} className="appearance-none border-none bg-transparent cursor-pointer p-0 font-bold text-[12px] tracking-wide uppercase text-parish-text2">
          {label} <span aria-hidden>{active ? (dir === 'asc' ? '↑' : '↓') : ''}</span>
        </button>
      </th>
    );
  };

  const empty = !loading && !error && !rows.length && (
    isFiltered
      ? <EmptyState title="No households found" subtitle="Try adjusting your search or filters." />
      : <EmptyState title="No households registered yet" subtitle="Households appear here as families register, or add one with “New Household”." />
  );

  return (
    <>
      <PageHeader title="Households" subtitle="All registered families">
        <FilterSelect value={status} onChange={(e) => setUrl({ status: e.target.value })} aria-label="Filter by status">
          <option value="All">All statuses</option><option value="Verified">Verified</option><option value="Pending">Pending</option>
        </FilterSelect>
        <FilterSelect value={gkk} onChange={(e) => setUrl({ gkk: e.target.value })} aria-label="Filter by GKK">
          <option value="All">All GKKs</option>
          {gkkOptions.map((g) => <option key={g} value={g}>{g}</option>)}
        </FilterSelect>
        <SearchInput placeholder="Search name, address, contact, ref no…" aria-label="Search households" value={search} onChange={(e) => setUrl({ q: e.target.value })} />
      </PageHeader>
      <PageBody>
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <div className="text-[13px] text-parish-muted">{total} household(s)</div>
          {isFiltered && <button onClick={() => setUrl({ status: 'All', gkk: 'All', q: '' })} className="appearance-none border-none bg-transparent cursor-pointer font-semibold text-[13px] text-parish-blue px-1 py-1">Clear</button>}
          {/* Phones have no column headers to click, so sorting gets its own control. */}
          <FilterSelect aria-label="Sort by" value={sort} onChange={(e) => setSort(e.target.value)} className="md:hidden">
            {SORTS.map(([k, l]) => <option key={k} value={k}>Sort: {l}</option>)}
          </FilterSelect>
          <div className="ml-auto flex items-center gap-2.5 flex-wrap">
            {can(user, 'exports') && (
              <button
                onClick={() => exportCsv(filters, 'households.csv')}
                disabled={exporting || !total}
                className="appearance-none border-[1.5px] border-parish-borderSoft bg-[#fffdf8] cursor-pointer px-3.5 py-2.5 font-semibold text-[13px] text-parish-text2 rounded-xl disabled:opacity-60"
                title={isFiltered ? 'Download the households matching these filters' : 'Download every household'}
              >
                {exporting ? 'Exporting…' : isFiltered ? 'Export this view' : 'Export CSV'}
              </button>
            )}
            {canEdit && (
              <PrimaryButton onClick={() => setCreating(true)} className="px-[18px] py-2.5 text-[13.5px] flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="M12 5v14M5 12h14" /></svg>New Household
              </PrimaryButton>
            )}
          </div>
        </div>

        {selectedRows.length > 0 && (
          <div role="region" aria-label="Selected households" className="sticky top-2 lg:top-[92px] z-[5] mb-3 flex items-center gap-2.5 flex-wrap px-4 py-3 rounded-xl bg-parish-navy text-white shadow-card">
            <span className="font-semibold text-[13.5px] mr-1">{selectedRows.length} selected</span>
            {canEdit && <button onClick={bulkVerify} disabled={!!bulkBusy} className="appearance-none border-none cursor-pointer px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 font-semibold text-[13px] text-white disabled:opacity-60">{bulkBusy === 'verify' ? 'Verifying…' : 'Mark verified'}</button>}
            <button onClick={bulkPrint} disabled={!!bulkBusy} className="appearance-none border-none cursor-pointer px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 font-semibold text-[13px] text-white disabled:opacity-60">{bulkBusy === 'print' ? 'Preparing…' : 'Print records'}</button>
            {can(user, 'exports') && <button onClick={() => exportCsv({ ids: selectedRows.map((h) => h.id) }, 'selected-households.csv')} disabled={exporting} className="appearance-none border-none cursor-pointer px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 font-semibold text-[13px] text-white disabled:opacity-60">Export CSV</button>}
            <button onClick={() => setSelected(new Set())} className="ml-auto appearance-none border-none cursor-pointer px-2 py-1.5 bg-transparent font-semibold text-[13px] text-white/80 hover:text-white">Clear selection</button>
          </div>
        )}

        <Panel className="overflow-hidden">
          {/* Tablets and up: a table. */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 900 }}>
              <caption className="sr-only">Registered households</caption>
              <thead>
                <tr className="bg-[#f4efe3]">
                  <th scope="col" className="pl-4 pr-0 py-3.5 w-8">
                    <Checkbox checked={allSelected} onChange={toggleSelectAll} disabled={!rows.length} aria-label="Select every household on this page" />
                  </th>
                  {sortHeader('name', 'Household')}
                  {sortHeader('gkk', 'GKK / Grouping')}
                  {sortHeader('members', 'Members')}
                  {sortHeader('registered', 'Registered')}
                  <th scope="col" className="text-left px-4 py-3.5 font-bold text-[12px] tracking-wide uppercase text-parish-text2">Status</th>
                  <th scope="col" className="text-right px-4 py-3.5 font-bold text-[12px] tracking-wide uppercase text-parish-text2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <React.Fragment key={h.id}>
                    <tr className={`border-t border-[#f1e8d5] ${selected.has(h.id) ? 'bg-[var(--p-blue-tint)]' : ''}`}>
                      <td className="pl-4 pr-0 py-3.5 align-top">
                        <Checkbox checked={selected.has(h.id)} onChange={() => toggleSelect(h.id)} aria-label={`Select ${h.household_name}`} className="mt-1" />
                      </td>
                      <td className="p-0 min-w-[260px]">
                        <button
                          onClick={() => toggleExpand(h.id)}
                          aria-expanded={!!expanded[h.id]}
                          className="appearance-none border-none bg-none cursor-pointer text-left w-full px-4 py-2.5 flex items-center gap-2.5 hover:bg-[#f7f2e6] focus-visible:outline focus-visible:outline-2 focus-visible:outline-parish-blue"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9a927f" strokeWidth="2.6" className="flex-none transition-transform" style={{ transform: expanded[h.id] ? 'rotate(90deg)' : 'none' }} aria-hidden><path d="M9 6l6 6-6 6" /></svg>
                          <span>
                            <span className="block font-serif text-[19px] font-semibold text-parish-navy leading-tight">{h.household_name}</span>
                            {h.head_name && <span className="block text-[12.5px] text-parish-text2 mt-0.5">Head: {h.head_name}</span>}
                            <span className="block text-[12px] text-parish-muted mt-0.5">{[h.street, h.barangay, h.city].filter(Boolean).join(', ')}</span>
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-[13.5px] text-[#3f3b2f] whitespace-nowrap">{h.gkk || '—'}<div className="text-[12px] text-parish-muted">{h.family_grouping || '—'}</div></td>
                      <td className="px-4 py-3.5 text-[14px] text-parish-text2 whitespace-nowrap">{h.member_count} member(s)</td>
                      <td className="px-4 py-3.5 text-[13px] text-parish-text2 whitespace-nowrap" title={fmtDateTime(h.created_at)}>
                        {daysAgo(h.created_at)}
                        {sort === 'updated' && h.updated_at && <div className="text-[12px] text-parish-muted">updated {daysAgo(h.updated_at)}</div>}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusPill status={h.status} />
                        <VerifiedLine household={h} className="mt-1 text-[11.5px] text-parish-muted max-w-[180px]" />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-2 justify-end items-center">
                          {canEdit && (
                            <button onClick={() => toggleStatus(h)} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg whitespace-nowrap">
                              {h.status === 'Verified' ? 'Mark Pending' : 'Verify'}
                            </button>
                          )}
                          <button onClick={() => setEditing(h)} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-text2 bg-[#f4efe3] rounded-lg">{canEdit ? 'Edit' : 'View'}</button>
                          <ActionMenu label={`More actions for ${h.household_name}`} items={rowActions(h)} />
                        </div>
                      </td>
                    </tr>
                    {expanded[h.id] && (
                      <tr className="bg-[#fbf8f0]">
                        <td colSpan={7} className="px-4 py-4 md:pl-[52px]">
                          <MemberList members={expandedMembers[h.id]} onOpen={setOpenMemberId} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones: one card per household. */}
          <ul className="md:hidden list-none m-0 p-0 divide-y divide-[#f1e8d5]" aria-label="Registered households">
            {rows.map((h) => (
              <li key={h.id} className={`px-4 py-3.5 ${selected.has(h.id) ? 'bg-[var(--p-blue-tint)]' : ''}`}>
                <div className="flex items-start gap-3">
                  <Checkbox checked={selected.has(h.id)} onChange={() => toggleSelect(h.id)} aria-label={`Select ${h.household_name}`} className="mt-1.5" />
                  <button onClick={() => toggleExpand(h.id)} aria-expanded={!!expanded[h.id]} className="appearance-none border-none bg-transparent p-0 cursor-pointer text-left min-w-0 flex-1">
                    <span className="block font-serif text-[19px] font-semibold text-parish-navy leading-tight">{h.household_name}</span>
                    <span className="block text-[12.5px] text-parish-text2 mt-0.5">{[h.head_name && `Head: ${h.head_name}`, `${h.member_count} member(s)`].filter(Boolean).join(' · ')}</span>
                    <span className="block text-[12px] text-parish-muted mt-0.5">{[h.gkk, `registered ${daysAgo(h.created_at)}`].filter(Boolean).join(' · ')}</span>
                  </button>
                  <StatusPill status={h.status} />
                </div>
                <div className="flex gap-2 mt-3 pl-8">
                  {canEdit && (
                    <button onClick={() => toggleStatus(h)} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg">
                      {h.status === 'Verified' ? 'Mark Pending' : 'Verify'}
                    </button>
                  )}
                  <button onClick={() => setEditing(h)} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-text2 bg-[#f4efe3] rounded-lg">{canEdit ? 'Edit' : 'View'}</button>
                  <span className="ml-auto"><ActionMenu label={`More actions for ${h.household_name}`} items={rowActions(h)} /></span>
                </div>
                {expanded[h.id] && <div className="mt-3 pl-8"><MemberList members={expandedMembers[h.id]} onOpen={setOpenMemberId} /></div>}
              </li>
            ))}
          </ul>

          {loading && <LoadingState label="Loading households…" />}
          {!loading && error && <ErrorState message={error} onRetry={reload} />}
          {empty}
          <Pagination page={page} pageSize={pageSize} total={total} onPage={(p) => setUrl({ page: p })} onPageSize={(size) => setUrl({ size })} />
        </Panel>
      </PageBody>

      {openMemberId && (
        <MemberDetailModal
          memberId={openMemberId}
          onClose={() => setOpenMemberId(null)}
          onChanged={() => { changed(); refreshExpanded(); }}
        />
      )}
      {editing && (
        <HouseholdEditDrawer
          household={editing}
          gkkOptions={gkkOptions}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); changed(); }}
          onMembersChanged={() => { changed(); refreshExpanded(editing.id); }}
        />
      )}
      {creating && (
        <NewHouseholdDrawer
          gkkOptions={gkkOptions}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); setUrl({ page: 1 }); changed(); }}
        />
      )}
      <PrintSheet data={printData} />
    </>
  );
}

/** The expanded row: each member, with their roles and groups, opening the member window. */
function MemberList({ members, onOpen }) {
  if (!members) return <div className="text-[13px] text-parish-muted" role="status">Loading members…</div>;
  if (!members.length) return <div className="text-[13px] text-parish-muted">No members yet.</div>;
  return (
    <div className="flex flex-col gap-2">
      {members.map((m) => (
        <button key={m.id} onClick={() => onOpen(m.id)} className="flex items-center gap-3 px-3.5 py-2.5 bg-[#fffdf8] border border-[#f0e8d6] rounded-xl text-left hover:border-[#cdd7e8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-parish-blue flex-wrap">
          <div className="w-[34px] h-[34px] rounded-full bg-[var(--p-blue-tint)] text-parish-blue flex items-center justify-center font-bold text-[12px] flex-none" aria-hidden>
            {(m.first_name?.[0] || '') + (m.last_name?.[0] || '')}
          </div>
          <div className="flex-none min-w-[140px]">
            <div className="text-[14px] font-semibold text-parish-navy">{[m.first_name, m.last_name, m.suffix].filter(Boolean).join(' ')}</div>
            <div className="text-[12px] text-parish-muted">{bis(RELATIONSHIP_LABELS, m.relationship) || '—'}</div>
          </div>
          <MemberBadges member={m} />
        </button>
      ))}
    </div>
  );
}

/** At-a-glance parish and GKK roles, ministries and organizations, right of the member's name. */
function MemberBadges({ member }) {
  const ministries = member.ministries || [];
  const organizations = member.organizations || [];
  if (!member.gkk_role && !member.parish_role && !ministries.length && !organizations.length) {
    return <span className="ml-auto text-[12px] text-parish-muted">No roles or groups</span>;
  }
  return (
    <div className="ml-auto flex flex-wrap gap-1.5 justify-end">
      {member.parish_role && <Badge tone="gold" title="Responsibility in Parish">Parish: {member.parish_role}</Badge>}
      {member.gkk_role && <Badge tone="gold" title="Responsibility in GKK">GKK: {member.gkk_role}</Badge>}
      {ministries.map((name) => <Badge key={`m-${name}`} tone="blue" title="Ministry">{name}</Badge>)}
      {organizations.map((name) => <Badge key={`o-${name}`} tone="green" title="Organization">{name}</Badge>)}
    </div>
  );
}
