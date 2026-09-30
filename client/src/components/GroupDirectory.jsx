import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PageHeader, PageBody, FilterSelect, EmptyState, ErrorState, LoadingState, Pagination, rowActivationProps } from './admin.jsx';
import { ageFromDob } from '../constants.js';
import { memberFullName } from '../lib/util.js';
import { PrimaryButton, TextInput } from './ui.jsx';
import MemberDetailModal from './MemberDetailModal.jsx';
import { useToast } from '../ToastContext.jsx';
import { useConfirm } from './ConfirmDialog.jsx';
import { useDebounced } from '../hooks.js';

/**
 * Roster of one ministry or organization at a time. `column` is the member
 * array it lives in ('ministries' | 'organizations'); `noun` is the singular
 * used in button labels.
 */
export default function GroupDirectory({ title, subtitle, listFn, column, noun }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [tabs, setTabs] = useState([]);
  const [gkkOptions, setGkkOptions] = useState([]);
  const [gkk, setGkk] = useState('All');
  const [activeTab, setActiveTab] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openMemberId, setOpenMemberId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Tab list + per-group counts, scoped to the selected GKK.
  useEffect(() => {
    listFn({ gkk })
      .then((res) => {
        setTabs(res.rows);
        setActiveTab((current) => (res.rows.some((r) => r.name === current) ? current : res.rows[0]?.name || ''));
      })
      .catch((e) => setError(e.message));
  }, [gkk, refreshKey]);

  useEffect(() => { api.listGkks().then((r) => setGkkOptions(r.rows.map((x) => x.name))).catch(() => {}); }, []);
  useEffect(() => { setPage(1); }, [gkk, activeTab]);

  // Roster for the active group — filtered and paginated server-side, so this
  // stays correct no matter how large the parish grows.
  function reload() {
    if (!activeTab) { setRows([]); setTotal(0); setLoading(false); return; }
    setLoading(true);
    setError('');
    api.listMembers({ ministry: activeTab, groupColumn: column, gkk, page, pageSize, sortKey: 'name', sortDir: 'asc' })
      .then((res) => { setRows(res.rows); setTotal(res.total); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, [activeTab, gkk, page, pageSize, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

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
        <FilterSelect value={gkk} onChange={(e) => setGkk(e.target.value)}>
          <option value="All">All GKKs</option>{gkkOptions.map((g) => <option key={g} value={g}>{g}</option>)}
        </FilterSelect>
      </PageHeader>
      <PageBody>
        {!tabs.length && <EmptyState title={`No ${title.toLowerCase()} match this filter`} />}
        {!!tabs.length && (
          <>
            <div className="flex flex-wrap gap-2 mb-[18px]">
              {tabs.map((t) => (
                <button
                  key={t.name} onClick={() => setActiveTab(t.name)}
                  className="appearance-none cursor-pointer px-3.5 py-2 rounded-full border-[1.5px] font-semibold text-[13px] flex items-center gap-1.5 whitespace-nowrap"
                  style={{
                    borderColor: activeTab === t.name ? 'var(--p-blue)' : '#e6dcc7',
                    background: activeTab === t.name ? 'var(--p-blue)' : '#fff',
                    color: activeTab === t.name ? '#fff' : '#3f3b2f',
                  }}
                >
                  {t.name}<span className="font-bold text-[11.5px] opacity-80">{t.count}</span>
                </button>
              ))}
            </div>
            <div className="bg-[#fffdf8] border border-parish-border rounded-2xl overflow-hidden shadow-cardSm">
              <div className="px-[18px] py-3.5 border-b border-[#f1e8d5] flex items-center gap-3 flex-wrap">
                <div className="font-serif text-[19px] font-semibold text-parish-navy">
                  {activeTab}
                  <span className="font-sans text-[13px] font-semibold text-parish-muted"> · {total} member(s)</span>
                </div>
                <PrimaryButton onClick={() => setAdding(true)} disabled={!activeTab} className="ml-auto px-4 py-2 text-[13px] flex items-center gap-1.5">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
                  Add member
                </PrimaryButton>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 720 }}>
                  <thead>
                    <tr className="bg-[#f4efe3]">
                      {['Member', 'Age', 'Address', 'Contact number'].map((h) => (
                        <th key={h} className="text-left px-4 py-3.5 font-bold text-[12px] tracking-wide uppercase text-parish-text2">{h}</th>
                      ))}
                      <th className="px-4 py-3.5"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((m) => (
                      <tr key={m.id} {...rowActivationProps(() => setOpenMemberId(m.id), `Open ${m.first_name} ${m.last_name}`)} className="border-t border-[#f1e8d5] cursor-pointer hover:bg-[#f7f2e6] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-parish-blue">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-[30px] h-[30px] rounded-full bg-[#f1e8d5] text-[#7a6a3e] flex items-center justify-center font-bold text-[11px] flex-none">
                              {(m.first_name?.[0] || '') + (m.last_name?.[0] || '')}
                            </div>
                            <div>
                              <div className="text-[14px] font-semibold text-parish-navy whitespace-nowrap">{m.first_name} {m.last_name}</div>
                              <div className="text-[12px] text-parish-muted">{m.household_name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[14px] text-[#3f3b2f]">{ageFromDob(m.dob) ?? '—'}</td>
                        <td className="px-4 py-3 text-[14px] text-parish-text2">{[m.street, m.barangay, m.city].filter(Boolean).join(', ')}</td>
                        <td className="px-4 py-3 text-[14px] text-[#3f3b2f] whitespace-nowrap">{m.contact || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); removeFromGroup(m); }}
                            onKeyDown={(e) => e.stopPropagation()}
                            className="appearance-none border-none cursor-pointer px-3 py-1.5 font-semibold text-[12.5px] text-parish-error bg-parish-errorBg rounded-lg whitespace-nowrap"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {loading && <LoadingState label="Loading roster…" />}
              {!loading && error && <ErrorState message={error} onRetry={reload} />}
              {!loading && !error && !rows.length && <EmptyState title="No members in this group yet" subtitle={`Use “Add member” to put someone on this ${noun}'s roster.`} />}
              <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />
            </div>
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
    <div className="fixed inset-0 z-50 bg-parish-navy/45 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 sm:p-5" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Add a member to ${group}`} className="bg-white rounded-2xl max-w-[560px] w-full shadow-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 sm:p-6 pb-3">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-serif text-[23px] font-semibold m-0 text-parish-navy">Add to {group}</h3>
            <button onClick={onClose} aria-label="Close" className="appearance-none border-none bg-none cursor-pointer text-parish-muted text-2xl leading-none">×</button>
          </div>
          <p className="text-[13px] text-parish-muted mt-0 mb-3.5">Search the registry by member name, household, or contact number.</p>
          <TextInput autoFocus placeholder="e.g. Juan Duran" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search members" />
        </div>
        <div className="overflow-auto px-5 sm:px-6 pb-5 flex flex-col gap-2">
          {loading && <div className="text-[13px] text-parish-muted py-2">Searching…</div>}
          {!loading && debouncedSearch.trim() && !results.length && <div className="text-[13px] text-parish-muted py-2">No members match “{debouncedSearch}”.</div>}
          {results.map((m) => {
            const isMember = (m[column] || []).includes(group) || added.includes(m.id);
            return (
              <div key={m.id} className="flex items-center gap-3 border border-[#f0e8d6] rounded-xl px-3.5 py-2.5 bg-[#fdfbf6]">
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-parish-navy truncate">{[m.first_name, m.last_name, m.suffix].filter(Boolean).join(' ')}</div>
                  <div className="text-[12px] text-parish-muted truncate">{[m.household_name, m.household_gkk].filter(Boolean).join(' · ')}</div>
                </div>
                {isMember ? (
                  <span className="text-[12.5px] font-semibold text-parish-ok whitespace-nowrap">✓ Member</span>
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
