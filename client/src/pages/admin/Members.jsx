import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { PageHeader, PageBody, FilterSelect, SearchInput, DataTable, Pagination, EmptyState, ErrorState, LoadingState, rowActivationProps } from '../../components/admin.jsx';
import { StatusPill, Badge } from '../../components/ui.jsx';
import { ageFromDob, CIVIL_STATUSES, AGE_OPTS, DASHBOARD_AGE_OPTS } from '../../constants.js';
import MemberDetailModal from '../../components/MemberDetailModal.jsx';
import { useDebounced, useUrlState } from '../../hooks.js';
import { groupByGkk } from '../../lib/household.js';
import { bis, RELATIONSHIP_LABELS, CIVIL_STATUS_LABELS } from '../../lib/bisaya.js';
import { MEMBERSHIP_STATUSES, STATUS_TONES } from '../../lib/census.js';

const BLOOD_OPTS = ['All', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];
const DEFAULT_FILTERS = { status: 'All', civil: 'All', sacrament: 'All', ministry: 'All', age: 'All', blood: 'All', gkk: 'All', membership: 'Current', census: 'All' };
// Rows are grouped under GKK headings; inside each GKK the default order is
// household name, then member name. Column headers re-sort within the GKKs.
const URL_DEFAULTS = { ...DEFAULT_FILTERS, q: '', sort: 'household', dir: 'asc', page: 1, size: 10 };
const URL_ALLOWED = {
  status: ['All', 'Verified', 'Pending'],
  // The Dashboard's age bars link here with their own ranges.
  age: [...AGE_OPTS, ...DASHBOARD_AGE_OPTS].map(([v]) => v),
  blood: BLOOD_OPTS,
  membership: ['Current', 'All', ...MEMBERSHIP_STATUSES, 'Not assessed'],
  census: ['All', 'Confirmed', 'Not confirmed'],
  sort: ['name', 'household', 'age', 'status'],
  dir: ['asc', 'desc'],
  size: [10, 20, 50],
};

export default function Members() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Filters, search, sort and page live in the address bar (see useUrlState).
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const { q: search, sort: sortKey, dir: sortDir, page, size: pageSize } = url;
  const filters = Object.fromEntries(Object.keys(DEFAULT_FILTERS).map((k) => [k, url[k]]));
  const filterKey = JSON.stringify(filters);
  const debouncedSearch = useDebounced(search);
  const [gkkOptions, setGkkOptions] = useState([]);
  const [groupOptions, setGroupOptions] = useState([]);
  const [openMemberId, setOpenMemberId] = useState(null);

  function reload() {
    setLoading(true);
    setError('');
    api.listMembers({ ...filters, search: debouncedSearch, sortKey, sortDir, page, pageSize, groupBy: 'gkk', memberOrder: 'name' })
      .then((res) => { setRows(res.rows); setTotal(res.total); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  // An empty table means something different when no filters are applied:
  // the register itself is empty, not the search.
  const isFiltered = !!debouncedSearch || Object.keys(DEFAULT_FILTERS).some((k) => filters[k] !== DEFAULT_FILTERS[k]);

  useEffect(() => { reload(); }, [filterKey, debouncedSearch, sortKey, sortDir, page, pageSize]);
  useEffect(() => {
    api.listGkks().then((r) => setGkkOptions(r.rows.map((x) => x.name))).catch(() => {});
    Promise.all([api.listMinistries(), api.listOrganizations()])
      .then(([m, o]) => setGroupOptions([...m.rows.map((x) => x.name), ...o.rows.map((x) => x.name)]))
      .catch(() => {});
  }, []);

  function setFilter(key, value) { setUrl({ [key]: value }); }
  const setSearch = (q) => setUrl({ q });
  const setPage = (p) => setUrl({ page: p });
  const setPageSize = (size) => setUrl({ size });
  function sort(key) {
    if (sortKey === key) setUrl({ dir: sortDir === 'asc' ? 'desc' : 'asc' });
    else setUrl({ sort: key, dir: 'asc' });
  }
  function arrow(key) { return sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : ''; }

  return (
    <>
      <PageHeader title="Members" subtitle="Every registered parishioner, grouped by GKK">
        <SearchInput placeholder="Search name, household, contact…" aria-label="Search members" value={search} onChange={(e) => setSearch(e.target.value)} />
      </PageHeader>
      <PageBody>
        <div className="flex flex-wrap gap-2.5 items-center mb-4">
          <FilterSelect aria-label="Household status" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="All">All statuses</option><option value="Verified">Verified</option><option value="Pending">Pending</option>
          </FilterSelect>
          <FilterSelect aria-label="Civil status" value={filters.civil} onChange={(e) => setFilter('civil', e.target.value)}>
            <option value="All">All civil status</option>{CIVIL_STATUSES.map((c) => <option key={c} value={c}>{bis(CIVIL_STATUS_LABELS, c)}</option>)}
          </FilterSelect>
          <FilterSelect aria-label="Sacrament" value={filters.sacrament} onChange={(e) => setFilter('sacrament', e.target.value)}>
            <option value="All">Any sacrament</option><option value="Baptism">Baptized</option><option value="Communion">First Communion</option><option value="Confirmation">Confirmed</option><option value="Matrimony">Married in Church</option>
          </FilterSelect>
          <FilterSelect aria-label="Ministry or organization" value={filters.ministry} onChange={(e) => setFilter('ministry', e.target.value)}>
            <option value="All">Any ministry / org</option>{groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </FilterSelect>
          <FilterSelect aria-label="Age" value={filters.age} onChange={(e) => setFilter('age', e.target.value)}>
            {AGE_OPTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            {DASHBOARD_AGE_OPTS.filter(([v]) => v === filters.age).map(([v, t]) => <option key={v} value={v}>Age {t}</option>)}
          </FilterSelect>
          <FilterSelect aria-label="Blood type" value={filters.blood} onChange={(e) => setFilter('blood', e.target.value)}>
            {BLOOD_OPTS.map((b) => <option key={b} value={b}>{b === 'All' ? 'All blood types' : b}</option>)}
          </FilterSelect>
          <FilterSelect aria-label="GKK" value={filters.gkk} onChange={(e) => setFilter('gkk', e.target.value)}>
            <option value="All">All GKKs</option>{gkkOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </FilterSelect>
          <FilterSelect aria-label="Membership status" value={filters.membership} onChange={(e) => setFilter('membership', e.target.value)}>
            <option value="Current">Current members</option>
            <option value="All">Everyone (incl. moved / deceased)</option>
            {MEMBERSHIP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            <option value="Not assessed">Not yet assessed</option>
          </FilterSelect>
          <FilterSelect aria-label="Census" value={filters.census} onChange={(e) => setFilter('census', e.target.value)}>
            <option value="All">Any census</option><option value="Confirmed">Confirmed in census</option><option value="Not confirmed">Not confirmed in census</option>
          </FilterSelect>
          {isFiltered && (
            <button onClick={() => setUrl({ ...DEFAULT_FILTERS, q: '' })} className="appearance-none border-none bg-transparent cursor-pointer font-semibold text-[13px] text-parish-blue px-1.5 py-2">Clear</button>
          )}
          <div className="ml-auto text-[13px] text-parish-muted">{total} member(s)</div>
        </div>

        <DataTable
          minWidth={760}
          columns={[
            { label: 'Member', key: 'name', onSort: () => sort('name'), arrow: arrow('name') },
            { label: 'Household', key: 'household', onSort: () => sort('household'), arrow: arrow('household') },
            { label: 'Relationship' },
            { label: 'Age', key: 'age', onSort: () => sort('age'), arrow: arrow('age') },
            { label: 'Civil' },
            { label: 'Ministries' },
            { label: 'Status', key: 'status', onSort: () => sort('status'), arrow: arrow('status') },
          ]}
          footer={
            <>
              {loading && <LoadingState label="Loading members…" />}
              {!loading && error && <ErrorState message={error} onRetry={reload} />}
              {!loading && !error && !rows.length && (
                isFiltered
                  ? <EmptyState title="No members found" subtitle="Try adjusting your search or filters." />
                  : <EmptyState title="No members registered yet" subtitle="Members appear here once households are registered." />
              )}
              <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />
            </>
          }
        >
          {groupByGkk(rows).map((g, gi) => (
            <React.Fragment key={g.gkk || 'no-gkk'}>
              <tr className={`bg-[#f4efe3] ${gi ? 'border-t-2 border-[#e7dcc4]' : ''}`}>
                <th scope="colgroup" colSpan={7} className="text-left px-4 py-2 font-serif text-[16.5px] font-semibold text-parish-navy">
                  {g.gkk || 'No GKK'}
                </th>
              </tr>
              {g.members.map((m) => {
            const groups = [...(m.ministries || []), ...(m.organizations || [])];
            return (
              <tr key={m.id} {...rowActivationProps(() => setOpenMemberId(m.id), `Open ${m.first_name} ${m.last_name}`)} className="border-t border-[#f1e8d5] cursor-pointer hover:bg-[#f7f2e6] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-parish-blue">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-[34px] h-[34px] rounded-full bg-[var(--p-blue-tint)] text-parish-blue flex items-center justify-center font-bold text-[12.5px] flex-none">
                      {(m.first_name?.[0] || '') + (m.last_name?.[0] || '')}
                    </div>
                    <span className="font-semibold text-[14.5px] text-parish-navy whitespace-nowrap">{m.first_name} {m.last_name}</span>
                    {m.membership_status && <Badge tone={STATUS_TONES[m.membership_status]} title={m.last_census_label ? `From the ${m.last_census_label}` : undefined}>{m.membership_status}</Badge>}
                  </div>
                </td>
                <td className="px-4 py-3 text-[14px] text-[#3f3b2f] whitespace-nowrap">{m.household_name}</td>
                <td className="px-4 py-3 text-[14px] text-parish-text2 whitespace-nowrap">{bis(RELATIONSHIP_LABELS, m.relationship) || '—'}</td>
                <td className="px-4 py-3 text-[14px] text-[#3f3b2f]">{ageFromDob(m.dob) ?? '—'}</td>
                <td className="px-4 py-3 text-[14px] text-parish-text2 whitespace-nowrap">{bis(CIVIL_STATUS_LABELS, m.civil_status) || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5 items-center">
                    {groups.slice(0, 2).map((g) => <span key={g} className="font-semibold text-[11.5px] bg-[#f1e8d5] text-[#7a6a3e] px-2.5 py-1 rounded-full whitespace-nowrap">{g}</span>)}
                    {groups.length > 2 && <span className="font-semibold text-[11.5px] text-parish-muted">+{groups.length - 2} more</span>}
                    {!groups.length && <span className="text-[13px] text-[#c4bba4]">—</span>}
                  </div>
                </td>
                <td className="px-4 py-3"><StatusPill status={m.household_status} /></td>
              </tr>
            );
              })}
            </React.Fragment>
          ))}
        </DataTable>
      </PageBody>

      {openMemberId && <MemberDetailModal memberId={openMemberId} onClose={() => setOpenMemberId(null)} onChanged={reload} />}
    </>
  );
}
