import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { PageHeader, PageBody, FilterSelect, SearchInput, EmptyState, ErrorState, LoadingState, Pagination, rowActivationProps, Panel } from './admin.jsx';
import { ageFromDob } from '../constants.js';
import { memberFullName } from '../lib/util.js';
import { groupByGkk } from '../lib/household.js';
import { MEN_ONLY_NOTE, menOnlyBlocked, menOnlyMessage } from '../lib/ministries.js';
import { PrimaryButton, TextInput, Badge } from './ui.jsx';
import MemberDetailModal from './MemberDetailModal.jsx';
import { useToast } from '../ToastContext.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import { useDebounced } from '../hooks.js';
import { useAuth } from '../AuthContext.jsx';
import { can } from '../lib/access.js';

// Key of the "Responsibility in Parish" tab; can't clash with a group name.
const PARISH_TAB = '__parish_roles__';
const PARISH_LABEL = 'Responsibility in Parish';

/**
 * Roster of one ministry or organization at a time. `column` is the member
 * array it lives in ('ministries' | 'organizations'); `noun` is the singular
 * used in button labels. With `parishRolesTab`, a first tab (open by default)
 * lists every member holding a Responsibility in Parish.
 */
export default function GroupDirectory({ title, subtitle, listFn, column, noun, parishRolesTab = false }) {
  const toast = useToast();
  const confirm = useConfirm();
  // Read-only and Website & requests accounts see the rosters but don't change them.
  const canEdit = can(useAuth().user, 'editRegistry');
  const [tabs, setTabs] = useState([]);
  const [gkkOptions, setGkkOptions] = useState([]);
  const [gkk, setGkk] = useState('All');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [activeTab, setActiveTab] = useState(parishRolesTab ? PARISH_TAB : '');
  const [parishCount, setParishCount] = useState(0);
  const isParish = activeTab === PARISH_TAB;
  const activeLabel = isParish ? PARISH_LABEL : activeTab;
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openMemberId, setOpenMemberId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [gkkCounts, setGkkCounts] = useState(null); // Map of GKK (or null) -> member count
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Tab list + per-group counts, scoped to the selected GKK.
  useEffect(() => {
    listFn({ gkk })
      .then((res) => {
        setTabs(res.rows);
        setActiveTab((current) => (current === PARISH_TAB || res.rows.some((r) => r.name === current) ? current : res.rows[0]?.name || ''));
      })
      .catch((e) => setError(e.message));
    if (parishRolesTab) {
      api.listMembers({ parishRole: 'Any', gkk, pageSize: 1 }).then((res) => setParishCount(res.total || 0)).catch(() => {});
    }
  }, [gkk, refreshKey]);

  useEffect(() => { api.listGkks().then((r) => setGkkOptions(r.rows.map((x) => x.name))).catch(() => {}); }, []);
  useEffect(() => { setPage(1); }, [gkk, activeTab, debouncedSearch]);

  // Only the latest load fills the roster: switching groups quickly would
  // otherwise let an earlier, slower answer land last.
  const loadSeq = useRef(0);
  // Roster for the active group — filtered and paginated server-side, so this
  // stays correct no matter how large the parish grows.
  function reload() {
    const seq = ++loadSeq.current;
    if (!activeTab) { setRows([]); setTotal(0); setLoading(false); return; }
    setLoading(true);
    setError('');
    // Same layout as the Members page: GKK by GKK, then household, then name.
    const filter = isParish
      ? { parishRole: 'Any', gkk, search: debouncedSearch }
      : { ministry: activeTab, groupColumn: column, gkk, search: debouncedSearch };
    // Parish roles are one flat list by name; ministries/organizations group by GKK.
    const layout = isParish
      ? { sortKey: 'name', sortDir: 'asc' }
      : { sortKey: 'household', sortDir: 'asc', groupBy: 'gkk', memberOrder: 'name' };
    api.listMembers({ ...filter, page, pageSize, ...layout })
      .then((res) => { if (seq === loadSeq.current) { setRows(res.rows); setTotal(res.total); } })
      .catch((e) => { if (seq === loadSeq.current) setError(e.message); })
      .finally(() => { if (seq === loadSeq.current) setLoading(false); });
    // Full per-GKK totals for the badges, not just what's on this page.
    if (isParish) setGkkCounts(null);
    else api.memberCountsByGkk(filter).then((c) => { if (seq === loadSeq.current) setGkkCounts(c); }).catch(() => { if (seq === loadSeq.current) setGkkCounts(null); });
  }
  useEffect(() => { reload(); }, [activeTab, gkk, debouncedSearch, page, pageSize, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);
  const allTabs = [
    ...(parishRolesTab ? [{ key: PARISH_TAB, label: PARISH_LABEL, count: parishCount }] : []),
    ...tabs.map((t) => ({ key: t.name, label: t.name, count: t.count })),
  ];
  const columns = isParish ? ['Member', PARISH_LABEL, 'Age', 'Address', 'Contact number'] : ['Member', 'Age', 'Address', 'Contact number'];

  async function removeFromGroup(m) {
    const name = memberFullName(m);
    const ok = await confirm({
      title: `Remove ${name} from ${activeTab}?`,
      message: `${name} stays in the registry; they're only taken off this ${noun}'s roster.`,
      confirmLabel: 'Remove from roster',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.removeMemberFromGroup(m.id, column, activeTab);
      toast.success(`${name} removed from ${activeTab}`);
      refresh();
    } catch (e) {
      toast.error(e.message || 'Could not update the roster');
    }
  }

  return (
    <>
      <PageHeader title={title} subtitle={subtitle}>
        <FilterSelect value={gkk} onChange={(e) => setGkk(e.target.value)} aria-label="Filter by GKK">
          <option value="All">All GKKs</option>{gkkOptions.map((g) => <option key={g} value={g}>{g}</option>)}
        </FilterSelect>
        <SearchInput placeholder={isParish ? 'Search members with a parish role…' : `Search this ${noun}'s members…`} aria-label="Search members" value={search} onChange={(e) => setSearch(e.target.value)} />
      </PageHeader>
      <PageBody>
        {!allTabs.length && <EmptyState title={`No ${title.toLowerCase()} match this filter`} />}
        {!!allTabs.length && (
          <>
            <div className="flex flex-wrap gap-2 mb-[18px]">
              {allTabs.map((t) => (
                <button
                  key={t.key} onClick={() => setActiveTab(t.key)}
                  className="appearance-none cursor-pointer px-3.5 py-2 rounded-full border-[1.5px] font-semibold text-[13px] flex items-center gap-1.5 whitespace-nowrap"
                  style={{
                    borderColor: activeTab === t.key ? 'var(--p-blue)' : 'rgb(var(--c-border-strong))',
                    background: activeTab === t.key ? 'var(--p-blue)' : 'rgb(var(--c-surface))',
                    color: activeTab === t.key ? 'rgb(var(--c-surface))' : 'rgb(var(--c-text3))',
                  }}
                >
                  {t.label}<span className="font-bold text-[11.5px] opacity-80">{t.count}</span>
                </button>
              ))}
            </div>
            <Panel className="overflow-hidden">
              <div className="px-[18px] py-3.5 border-b border-parish-line flex items-center gap-3 flex-wrap">
                <div className="font-serif text-[19px] font-semibold text-parish-navy">
                  {activeLabel}
                  <span className="font-sans text-[13px] font-semibold text-parish-muted"> · {total} member(s)</span>
                </div>
                {isParish ? (
                  // Parish roles are set on the member record, not added to a roster here.
                  <div className="ml-auto text-[12.5px] text-parish-muted">Open a member to change their Responsibility in Parish.</div>
                ) : canEdit && (
                  <PrimaryButton onClick={() => setAdding(true)} disabled={!activeTab} className="ml-auto px-4 py-2 text-[13px] flex items-center gap-1.5">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                    Add member
                  </PrimaryButton>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 720 }}>
                  <thead>
                    <tr className="bg-parish-sunk">
                      {columns.map((h) => (
                        <th key={h} className="text-left px-4 py-3.5 font-bold text-[12px] tracking-wide uppercase text-parish-text2">{h}</th>
                      ))}
                      {!isParish && canEdit && <th className="px-4 py-3.5"><span className="sr-only">Actions</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(isParish ? [{ gkk: null, members: rows, flat: true }] : groupByGkk(rows)).map((g, gi) => (
                      <React.Fragment key={g.gkk || 'no-gkk'}>
                        {!g.flat && <tr className={`bg-parish-sunk ${gi ? 'border-t-2 border-parish-borderStrong' : ''}`}>
                          <th scope="colgroup" colSpan={5} className="text-left px-4 py-2">
                            <span className="flex items-center gap-2 flex-wrap">
                              <span className="font-serif text-[16.5px] font-semibold text-parish-navy">{g.gkk || 'No GKK'}</span>
                              {gkkCounts?.has(g.gkk) && (
                                <Badge tone="blue" title={`${activeLabel} members in ${g.gkk || 'households with no GKK'}`}>
                                  {gkkCounts.get(g.gkk)} member{gkkCounts.get(g.gkk) === 1 ? '' : 's'}
                                </Badge>
                              )}
                            </span>
                          </th>
                        </tr>}
                        {g.members.map((m) => (
                      <tr key={m.id} {...rowActivationProps(() => setOpenMemberId(m.id), `Open ${m.first_name} ${m.last_name}`)} className="border-t border-parish-line cursor-pointer hover:bg-parish-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-parish-blue">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-[30px] h-[30px] rounded-full bg-parish-track text-parish-chip flex items-center justify-center font-bold text-[11px] flex-none">
                              {(m.first_name?.[0] || '') + (m.last_name?.[0] || '')}
                            </div>
                            <div>
                              <div className="text-[14px] font-semibold text-parish-navy whitespace-nowrap">{m.first_name} {m.last_name}</div>
                              <div className="text-[12px] text-parish-muted">{m.household_name}</div>
                            </div>
                          </div>
                        </td>
                        {isParish && <td className="px-4 py-3"><Badge tone="gold" title={PARISH_LABEL}>{m.parish_role}</Badge></td>}
                        <td className="px-4 py-3 text-[14px] text-parish-text3">{ageFromDob(m.dob) ?? '—'}</td>
                        <td className="px-4 py-3 text-[14px] text-parish-text2">{[m.street, m.barangay, m.city].filter(Boolean).join(', ')}</td>
                        <td className="px-4 py-3 text-[14px] text-parish-text3 whitespace-nowrap">{m.contact || '—'}</td>
                        {!isParish && canEdit && <td className="px-4 py-3 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); removeFromGroup(m); }}
                            onKeyDown={(e) => e.stopPropagation()}
                            className="appearance-none border-none cursor-pointer px-3 py-1.5 font-semibold text-[12.5px] text-parish-error bg-parish-errorBg rounded-lg whitespace-nowrap"
                          >
                            Remove
                          </button>
                        </td>}
                      </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {loading && <LoadingState label="Loading roster…" />}
              {!loading && error && <ErrorState message={error} onRetry={reload} />}
              {!loading && !error && !rows.length && (
                debouncedSearch
                  ? <EmptyState title={`No members match “${debouncedSearch}”`} subtitle="Try a different name, household, or contact number." />
                  : isParish
                    ? <EmptyState title="No members have a Responsibility in Parish yet" subtitle="Open a member's record and set their Responsibility in Parish." />
                    : <EmptyState title="No members in this group yet" subtitle={canEdit ? `Use “Add member” to put someone on this ${noun}'s roster.` : undefined} />
              )}
              <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />
            </Panel>
          </>
        )}
      </PageBody>

      {openMemberId && <MemberDetailModal memberId={openMemberId} onClose={() => setOpenMemberId(null)} onChanged={refresh} />}
      {adding && (
        <AddToGroupModal
          group={activeTab}
          column={column}
          onClose={() => setAdding(false)}
          onAdded={refresh}
        />
      )}
    </>
  );
}

function AddToGroupModal({ group, column, onClose, onAdded }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [added, setAdded] = useState([]);
  // Kaabag and other men-only ministries: women can't be added (0038).
  const [menOnly, setMenOnly] = useState(null);
  useEffect(() => {
    if (column === 'ministries') api.menOnlyMinistries().then(setMenOnly).catch(() => setMenOnly(null));
  }, [column]);
  const forMenOnly = column === 'ministries' && !!menOnly?.has(group);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!debouncedSearch.trim()) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    api.listMembers({ search: debouncedSearch, pageSize: 8, sortKey: 'name', sortDir: 'asc' })
      .then((res) => { if (!cancelled) setResults(res.rows); })
      .catch((e) => { if (!cancelled) toast.error(e.message || 'Search failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debouncedSearch]);

  async function add(m) {
    setBusyId(m.id);
    try {
      await api.addMemberToGroup(m.id, column, group);
      setAdded((a) => [...a, m.id]);
      toast.success(`${memberFullName(m)} added to ${group}`);
      onAdded();
    } catch (e) {
      toast.error(e.message || 'Could not add this member');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-parish-scrim/45 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-5" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Add a member to ${group}`} className="bg-parish-surface rounded-2xl max-w-[560px] w-full shadow-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 sm:p-6 pb-3">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-serif text-[23px] font-semibold m-0 text-parish-navy">Add to {group}</h3>
            <button onClick={onClose} aria-label="Close" className="appearance-none border-none bg-none cursor-pointer text-parish-muted text-2xl leading-none">×</button>
          </div>
          <p className="text-[13px] text-parish-muted mt-0 mb-3.5">
            Search the registry by member name, household, or contact number.
            {forMenOnly && <> <strong className="text-parish-text2">{menOnlyMessage(group)}</strong></>}
          </p>
          <TextInput autoFocus placeholder="e.g. Juan Duran" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search members" />
        </div>
        <div className="overflow-auto px-5 sm:px-6 pb-5 flex flex-col gap-2">
          {loading && <div className="text-[13px] text-parish-muted py-2">Searching…</div>}
          {!loading && debouncedSearch.trim() && !results.length && <div className="text-[13px] text-parish-muted py-2">No members match “{debouncedSearch}”.</div>}
          {results.map((m) => {
            const isMember = (m[column] || []).includes(group) || added.includes(m.id);
            const blocked = forMenOnly && menOnlyBlocked(group, m.sex, menOnly, isMember);
            return (
              <div key={m.id} className="flex items-center gap-3 border border-parish-line2 rounded-xl px-3.5 py-2.5 bg-parish-field">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-parish-navy truncate">{[m.first_name, m.last_name, m.suffix].filter(Boolean).join(' ')}</div>
                  <div className="text-[12px] text-parish-muted truncate">{[m.household_name, m.household_gkk].filter(Boolean).join(' · ')}</div>
                </div>
                {isMember ? (
                  <span className="text-[12.5px] font-semibold text-parish-ok whitespace-nowrap">✓ Member</span>
                ) : blocked ? (
                  <span className="text-[12.5px] font-semibold text-parish-muted whitespace-nowrap" title={menOnlyMessage(group)}>{MEN_ONLY_NOTE}</span>
                ) : (
                  <button
                    onClick={() => add(m)}
                    disabled={busyId === m.id}
                    className="appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg whitespace-nowrap disabled:opacity-60"
                  >
                    {busyId === m.id ? 'Adding…' : 'Add'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
