import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../../api.js';
import { PageHeader, PageBody, FilterSelect, SearchInput, Pagination, EmptyState, ErrorState, LoadingState, Panel } from '../../components/admin.jsx';
import { StatusPill, PrimaryButton, Badge } from '../../components/ui.jsx';
import MemberDetailModal from '../../components/MemberDetailModal.jsx';
import HouseholdEditDrawer from '../../components/HouseholdEditDrawer.jsx';
import NewHouseholdDrawer from '../../components/NewHouseholdDrawer.jsx';
import { bis, RELATIONSHIP_LABELS } from '../../lib/bisaya.js';
import PrintSheet, { printHouseholdSheet } from '../../components/PrintSheet.jsx';
import { useToast } from '../../ToastContext.jsx';
import { useConfirm } from '../../components/ConfirmDialog.jsx';
import { useDebounced, useUrlState } from '../../hooks.js';
import { VerifiedLine } from '../../components/VerifiedLine.jsx';

const URL_DEFAULTS = { status: 'All', gkk: 'All', q: '', page: 1, size: 10 };
const URL_ALLOWED = { status: ['All', 'Verified', 'Pending'], size: [10, 20, 50] };

export default function Households() {
  const location = useLocation();
  const toast = useToast();
  const confirm = useConfirm();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Filters, search and page live in the address bar (see useUrlState), so
  // dashboard links like ?status=Pending land on the filtered list.
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const { status, gkk, q: search, page, size: pageSize } = url;
  const setStatus = (v) => setUrl({ status: v });
  const setGkk = (v) => setUrl({ gkk: v });
  const setSearch = (v) => setUrl({ q: v });
  const setPage = (p) => setUrl({ page: p });
  const setPageSize = (size) => setUrl({ size });
  const debouncedSearch = useDebounced(search);
  const [gkkOptions, setGkkOptions] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [expandedMembers, setExpandedMembers] = useState({});
  const [openMemberId, setOpenMemberId] = useState(null);
  const [editing, setEditing] = useState(null);
  // The old /admin/households/new link arrives here with the panel open.
  const [creating, setCreating] = useState(!!location.state?.newHousehold);
  const [printData, setPrintData] = useState(null);

  function reload() {
    setLoading(true);
    setError('');
    api.listHouseholds({ status, gkk, search: debouncedSearch, page, pageSize })
      .then((res) => { setRows(res.rows); setTotal(res.total); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  // An empty table means something different when no filters are applied:
  // the register itself is empty, not the search.
  const isFiltered = status !== 'All' || gkk !== 'All' || !!debouncedSearch;

  useEffect(() => { reload(); }, [status, gkk, debouncedSearch, page, pageSize]);
  useEffect(() => { api.listGkks().then((res) => setGkkOptions(res.rows.map((r) => r.name))).catch(() => {}); }, []);

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
      reload();
    } catch (e) {
      toast.error(e.message || 'Could not update status');
    }
  }

  async function print(h) {
    try {
      const res = await api.getHousehold(h.id);
      setPrintData(res);
      // Let React commit the print sheet before handing off to the browser.
      requestAnimationFrame(() => requestAnimationFrame(() => printHouseholdSheet()));
    } catch (e) {
      toast.error(e.message || 'Could not prepare the print sheet');
    }
  }

  async function removeHousehold(h) {
    const ok = await confirm({
      title: `Delete ${h.household_name}?`,
      message: `This permanently removes the household and its ${h.member_count} member record(s). This cannot be undone.`,
      confirmLabel: 'Delete household',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.deleteHousehold(h.id);
      toast.success('Household deleted');
      reload();
    } catch (e) {
      toast.error(e.message || 'Could not delete household');
    }
  }

  return (
    <>
      <PageHeader title="Households" subtitle="All registered families">
        <FilterSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="All">All statuses</option><option value="Verified">Verified</option><option value="Pending">Pending</option>
        </FilterSelect>
        <FilterSelect value={gkk} onChange={(e) => setGkk(e.target.value)} aria-label="Filter by GKK">
          <option value="All">All GKKs</option>
          {gkkOptions.map((g) => <option key={g} value={g}>{g}</option>)}
        </FilterSelect>
        <SearchInput placeholder="Search name, address, contact…" aria-label="Search households" value={search} onChange={(e) => setSearch(e.target.value)} />
      </PageHeader>
      <PageBody>
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <div className="text-[13px] text-parish-muted">{total} household(s)</div>
          <PrimaryButton onClick={() => setCreating(true)} className="ml-auto px-[18px] py-2.5 text-[13.5px] flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="M12 5v14M5 12h14" /></svg>New Household
          </PrimaryButton>
        </div>

        <Panel className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 820 }}>
              <caption className="sr-only">Registered households</caption>
              <thead>
                <tr className="bg-[#f4efe3]">
                  {['Household', 'GKK / Grouping', 'Members', 'Status'].map((h) => (
                    <th key={h} scope="col" className="text-left px-4 py-3.5 font-bold text-[12px] tracking-wide uppercase text-parish-text2 whitespace-nowrap">{h}</th>
                  ))}
                  <th scope="col" className="text-right px-4 py-3.5 font-bold text-[12px] tracking-wide uppercase text-parish-text2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <React.Fragment key={h.id}>
                    <tr className="border-t border-[#f1e8d5]">
                      <td className="p-0">
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
                      <td className="px-4 py-3.5">
                        <StatusPill status={h.status} />
                        <VerifiedLine household={h} className="mt-1 text-[11.5px] text-parish-muted max-w-[180px]" />
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-2 justify-end flex-wrap">
                          <button onClick={() => toggleStatus(h)} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg whitespace-nowrap">
                            {h.status === 'Verified' ? 'Mark Pending' : 'Mark Verified'}
                          </button>
                          <button onClick={() => setEditing(h)} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-text2 bg-[#f4efe3] rounded-lg">Edit</button>
                          <button onClick={() => print(h)} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-text2 bg-[#f4efe3] rounded-lg">Print</button>
                          <button onClick={() => removeHousehold(h)} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-error bg-parish-errorBg rounded-lg">Delete</button>
                        </div>
                      </td>
                    </tr>
                    {expanded[h.id] && (
                      <tr className="bg-[#fbf8f0]">
                        <td colSpan={5} className="px-4 py-4 md:pl-[42px]">
                          <div className="flex flex-col gap-2">
                            {(expandedMembers[h.id] || []).map((m) => (
                              <button key={m.id} onClick={() => setOpenMemberId(m.id)} className="flex items-center gap-3 px-3.5 py-2.5 bg-[#fffdf8] border border-[#f0e8d6] rounded-xl text-left hover:border-[#cdd7e8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-parish-blue">
                                <div className="w-[34px] h-[34px] rounded-full bg-[var(--p-blue-tint)] text-parish-blue flex items-center justify-center font-bold text-[12px] flex-none" aria-hidden>
                                  {(m.first_name?.[0] || '') + (m.last_name?.[0] || '')}
                                </div>
                                <div className="flex-none min-w-[160px]">
                                  <div className="text-[14px] font-semibold text-parish-navy">{[m.first_name, m.last_name, m.suffix].filter(Boolean).join(' ')}</div>
                                  <div className="text-[12px] text-parish-muted">{bis(RELATIONSHIP_LABELS, m.relationship) || '—'}</div>
                                </div>
                                <MemberBadges member={m} />
                              </button>
                            ))}
                            {!(expandedMembers[h.id] || []).length && <div className="text-[13px] text-parish-muted">No members yet.</div>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {loading && <LoadingState label="Loading households…" />}
          {!loading && error && <ErrorState message={error} onRetry={reload} />}
          {!loading && !error && !rows.length && (
            isFiltered
              ? <EmptyState title="No households found" subtitle="Try adjusting your search or filters." />
              : <EmptyState title="No households registered yet" subtitle="Households appear here as families register, or add one with “New Household”." />
          )}
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />
        </Panel>
      </PageBody>

      {openMemberId && (
        <MemberDetailModal
          memberId={openMemberId}
          onClose={() => setOpenMemberId(null)}
          onChanged={() => { reload(); refreshExpanded(); }}
        />
      )}
      {editing && (
        <HouseholdEditDrawer
          household={editing}
          gkkOptions={gkkOptions}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
          onMembersChanged={() => { reload(); refreshExpanded(editing.id); }}
        />
      )}
      {creating && (
        <NewHouseholdDrawer
          gkkOptions={gkkOptions}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); setPage(1); reload(); }}
        />
      )}
      <PrintSheet data={printData} />
    </>
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
