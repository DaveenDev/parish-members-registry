import React, { useEffect, useRef, useState } from 'react';
import { api } from '../../api.js';
import { PageHeader, PageBody, FilterSelect, SearchInput, DataTable, Pagination, EmptyState, ErrorState, LoadingState, rowActivationProps, Panel } from '../../components/admin.jsx';
import MemberDetailModal from '../../components/MemberDetailModal.jsx';
import SacramentVerifyDialog, { SacramentChip } from '../../components/SacramentVerifyDialog.jsx';
import { SACRAMENTS } from '../../constants.js';
import { useDebounced, useUrlState } from '../../hooks.js';
import { groupByGkk } from '../../lib/household.js';
import { bis, RELATIONSHIP_LABELS } from '../../lib/bisaya.js';

// Filter values understood by api.listMembers for each sacrament.
const STATUS_OPTIONS = [
  ['All', 'Any'],
  ['Yes', 'Claimed'],
  ['Unverified', 'Awaiting verification'],
  ['Verified', 'Verified'],
  ['No', 'Not claimed'],
];
const DEFAULT_FILTERS = { gkk: 'All', baptism: 'All', communion: 'All', confirmation: 'All', matrimony: 'All' };
// Rows are grouped by GKK, households kept together inside each GKK.
const URL_DEFAULTS = { ...DEFAULT_FILTERS, q: '', page: 1, size: 20 };
const STATUS_VALUES = STATUS_OPTIONS.map(([v]) => v);
const URL_ALLOWED = { baptism: STATUS_VALUES, communion: STATUS_VALUES, confirmation: STATUS_VALUES, matrimony: STATUS_VALUES, size: [10, 20, 50] };

export default function Sacraments() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gkkOptions, setGkkOptions] = useState([]);
  // Filters, search and page live in the address bar (see useUrlState).
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const { q: search, page, size: pageSize } = url;
  const filters = Object.fromEntries(Object.keys(DEFAULT_FILTERS).map((k) => [k, url[k]]));
  const filterKey = JSON.stringify(filters);
  const setSearch = (q) => setUrl({ q });
  const setPage = (p) => setUrl({ page: p });
  const setPageSize = (size) => setUrl({ size });
  const debouncedSearch = useDebounced(search);
  const [openMemberId, setOpenMemberId] = useState(null);
  const [verifying, setVerifying] = useState(null); // { member, sacrament, verification }
  const [counts, setCounts] = useState(null);

  useEffect(() => { api.listGkks().then((r) => setGkkOptions(r.rows.map((x) => x.name))).catch(() => {}); }, []);

  // The sacrament filters are applied server-side; filtering a single page
  // client-side would make both the row list and the total incorrect.
  // `quiet` refreshes behind the rows already on screen, without the spinner.
  // Only the latest load fills the list: with quick filter or page changes,
  // an earlier, slower answer would otherwise land last.
  const loadSeq = useRef(0);
  function reload({ quiet = false } = {}) {
    const seq = ++loadSeq.current;
    if (!quiet) setLoading(true);
    setError('');
    api.listMembers({ ...filters, search: debouncedSearch, page, pageSize, sortKey: 'household', sortDir: 'asc', groupBy: 'gkk' })
      .then((res) => { if (seq === loadSeq.current) { setRows(res.rows); setTotal(res.total); } })
      .catch((e) => { if (!quiet && seq === loadSeq.current) setError(e.message); })
      .finally(() => { if (seq === loadSeq.current) setLoading(false); });
  }
  function reloadCounts() {
    api.sacramentVerificationCounts({ gkk: filters.gkk }).then(setCounts).catch(() => setCounts(null));
  }
  function refreshAll() { reload({ quiet: true }); reloadCounts(); }

  /**
   * A verification was saved or removed: flip the chip and the waiting count
   * at once, then re-read in the background (the server counts take a moment).
   */
  function verificationChanged({ memberId, sacrament, verified }) {
    const key = `${sacrament}_verified`;
    const row = rows.find((r) => r.id === memberId);
    if (row && !!row[key] !== verified) {
      setRows((rs) => rs.map((r) => (r.id === memberId ? { ...r, [key]: verified } : r)));
      setCounts((c) => c && { ...c, [sacrament]: { ...c[sacrament], verified: c[sacrament].verified + (verified ? 1 : -1) } });
    }
    refreshAll();
  }

  useEffect(() => { reload(); }, [filterKey, debouncedSearch, page, pageSize]);
  useEffect(() => { reloadCounts(); }, [filters.gkk]);

  const setFilter = (key, value) => setUrl({ [key]: value });
  const isFiltered = !!debouncedSearch || Object.keys(DEFAULT_FILTERS).some((k) => filters[k] !== DEFAULT_FILTERS[k]);

  async function openVerify(member, sacrament) {
    let verification = null;
    if (member[`${sacrament.key}_verified`]) {
      try {
        verification = (await api.getSacramentVerifications(member.id))[sacrament.key] || null;
      } catch { /* the dialog still works; it just won't show who verified */ }
    }
    setVerifying({ member, sacrament, verification });
  }

  /** Show only the claims still waiting on staff for one sacrament. */
  function showQueue(key) {
    setUrl({ ...DEFAULT_FILTERS, gkk: filters.gkk, [key]: 'Unverified', q: '' });
  }

  return (
    <>
      <PageHeader title="Sacraments" subtitle="Self-reported by families · verify against certificates or the parish register">
        <SearchInput placeholder="Search name, household, contact…" aria-label="Search members" value={search} onChange={(e) => setSearch(e.target.value)} />
      </PageHeader>
      <PageBody>
        {counts && (
          <Panel className="px-4 py-3.5 mb-4">
            <div className="font-bold text-[11.5px] tracking-[.1em] uppercase text-[var(--p-gold-deep)] mb-2">Awaiting verification</div>
            <div className="flex flex-wrap gap-2">
              {SACRAMENTS.map((s) => {
                const waiting = counts[s.key].claimed - counts[s.key].verified;
                const active = filters[s.key] === 'Unverified';
                return (
                  <button
                    key={s.key}
                    onClick={() => showQueue(s.key)}
                    disabled={!waiting}
                    className={`appearance-none cursor-pointer px-3 py-2 rounded-xl border-[1.5px] text-left disabled:cursor-default disabled:opacity-60 ${active ? 'border-parish-blue bg-[var(--p-blue-tint)]' : 'border-parish-edge bg-parish-surface hover:border-parish-blue'}`}
                  >
                    <div className="text-[13px] font-semibold text-parish-navy">{s.label}</div>
                    <div className="text-[12px] text-parish-muted">
                      <strong className={waiting ? 'text-parish-warn' : 'text-parish-ok'}>{waiting}</strong> waiting · {counts[s.key].verified} of {counts[s.key].claimed} verified
                    </div>
                  </button>
                );
              })}
            </div>
          </Panel>
        )}

        <div className="flex flex-wrap gap-2.5 items-center mb-3">
          <FilterSelect value={filters.gkk} onChange={(e) => setFilter('gkk', e.target.value)} aria-label="Filter by GKK">
            <option value="All">All GKKs</option>{gkkOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </FilterSelect>
          {SACRAMENTS.map((s) => (
            <FilterSelect key={s.key} value={filters[s.key]} onChange={(e) => setFilter(s.key, e.target.value)} aria-label={`Filter by ${s.label}`}>
              {STATUS_OPTIONS.map(([v, t]) => <option key={v} value={v}>{s.label}: {t}</option>)}
            </FilterSelect>
          ))}
          {isFiltered && (
            <button onClick={() => setUrl({ ...DEFAULT_FILTERS, q: '' })} className="appearance-none border-none bg-transparent cursor-pointer font-semibold text-[13px] text-parish-blue px-1.5 py-2">Clear</button>
          )}
          <div className="ml-auto text-[13px] text-parish-muted">{total} member(s)</div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4 text-[12.5px] text-parish-muted">
          <span className="flex items-center gap-1.5"><SacramentChip claimed label="Example" /> self-reported, not yet checked</span>
          <span className="flex items-center gap-1.5"><SacramentChip claimed verified label="Example" /> confirmed by staff</span>
          <span>Click a chip to verify or review it.</span>
        </div>

        <DataTable
          minWidth={860}
          columns={[{ label: 'Member' }, { label: 'Household' }, ...SACRAMENTS.map((s) => ({ label: s.label, align: 'center' }))]}
          footer={
            <>
              {loading && <LoadingState label="Loading members…" />}
              {!loading && error && <ErrorState message={error} onRetry={reload} />}
              {!loading && !error && !rows.length && (
                isFiltered
                  ? <EmptyState title="No members match this filter" subtitle="Try adjusting your search or filters." />
                  : <EmptyState title="No members registered yet" />
              )}
              <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />
            </>
          }
        >
          {groupByGkk(rows).map((g, gi) => (
            <React.Fragment key={g.gkk || 'no-gkk'}>
              <tr className={`bg-parish-sunk ${gi ? 'border-t-2 border-parish-borderStrong' : ''}`}>
                <th scope="colgroup" colSpan={SACRAMENTS.length + 2} className="text-left px-4 py-2 font-serif text-[16.5px] font-semibold text-parish-navy">
                  {g.gkk || 'No GKK'}
                </th>
              </tr>
              {g.members.map((m) => (
            <tr key={m.id} {...rowActivationProps(() => setOpenMemberId(m.id), `Open ${m.first_name} ${m.last_name}`)} className="border-t border-parish-line cursor-pointer hover:bg-parish-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-parish-blue">
              <td className="px-4 py-2.5">
                <div className="font-semibold text-[14px] text-parish-navy whitespace-nowrap">{[m.first_name, m.last_name, m.suffix].filter(Boolean).join(' ')}</div>
                <div className="text-[12px] text-parish-muted whitespace-nowrap">{bis(RELATIONSHIP_LABELS, m.relationship) || '—'}</div>
              </td>
              <td className="px-4 py-2.5 text-[14px] text-parish-text3 whitespace-nowrap">{m.household_name || '—'}</td>
              {SACRAMENTS.map((s) => (
                <td key={s.key} className="text-center px-2.5 py-2.5">
                  <SacramentChip
                    claimed={!!m[s.has]}
                    verified={!!m[`${s.key}_verified`]}
                    label={s.label}
                    onClick={() => openVerify(m, s)}
                  />
                </td>
              ))}
            </tr>
              ))}
            </React.Fragment>
          ))}
        </DataTable>
      </PageBody>

      {openMemberId && <MemberDetailModal memberId={openMemberId} onClose={() => setOpenMemberId(null)} onChanged={refreshAll} />}
      {verifying && (
        <SacramentVerifyDialog
          member={verifying.member}
          sacrament={verifying.sacrament}
          verification={verifying.verification}
          onClose={() => setVerifying(null)}
          onChanged={verificationChanged}
        />
      )}
    </>
  );
}
