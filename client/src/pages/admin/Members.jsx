import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { PageHeader, PageBody, FilterSelect, SearchInput, DataTable, Pagination, EmptyState, ErrorState, LoadingState, rowActivationProps } from '../../components/admin.jsx';
import { StatusPill } from '../../components/ui.jsx';
import { ageFromDob } from '../../constants.js';
import MemberDetailModal from '../../components/MemberDetailModal.jsx';
import { useDebounced } from '../../hooks.js';

const AGE_OPTS = [['All', 'All ages'], ['0-17', 'Under 18'], ['18-30', '18–30'], ['31-59', '31–59'], ['60-200', '60 & above']];
const BLOOD_OPTS = ['All', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];
const DEFAULT_FILTERS = { status: 'All', civil: 'All', sacrament: 'All', ministry: 'All', age: 'All', blood: 'All', gkk: 'All' };

export default function Members() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search);
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [gkkOptions, setGkkOptions] = useState([]);
  const [groupOptions, setGroupOptions] = useState([]);
  const [openMemberId, setOpenMemberId] = useState(null);

  function reload() {
    setLoading(true);
    setError('');
    api.listMembers({ ...filters, search: debouncedSearch, sortKey, sortDir, page, pageSize })
      .then((res) => { setRows(res.rows); setTotal(res.total); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { reload(); }, [filters, debouncedSearch, sortKey, sortDir, page, pageSize]);
  useEffect(() => { setPage(1); }, [filters, debouncedSearch, sortKey, sortDir]);
  useEffect(() => {
    api.listGkks().then((r) => setGkkOptions(r.rows.map((x) => x.name))).catch(() => {});
    Promise.all([api.listMinistries(), api.listOrganizations()])
      .then(([m, o]) => setGroupOptions([...m.rows.map((x) => x.name), ...o.rows.map((x) => x.name)]))
      .catch(() => {});
  }, []);

  function setFilter(key, value) { setFilters((f) => ({ ...f, [key]: value })); }
  function sort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  }
  function arrow(key) { return sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : ''; }

  return (
    <>
      <PageHeader title="Members" subtitle="Every registered parishioner">
        <SearchInput placeholder="Search name, household, contact…" aria-label="Search members" value={search} onChange={(e) => setSearch(e.target.value)} />
      </PageHeader>
      <PageBody>
        <div className="flex flex-wrap gap-2.5 items-center mb-4">
          <FilterSelect value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="All">All statuses</option><option value="Verified">Verified</option><option value="Pending">Pending</option>
          </FilterSelect>
          <FilterSelect value={filters.civil} onChange={(e) => setFilter('civil', e.target.value)}>
            <option value="All">All civil status</option><option value="Single">Single</option><option value="Married">Married</option><option value="Widowed">Widowed</option><option value="Separated">Separated</option>
          </FilterSelect>
          <FilterSelect value={filters.sacrament} onChange={(e) => setFilter('sacrament', e.target.value)}>
            <option value="All">Any sacrament</option><option value="Baptism">Baptized</option><option value="Communion">First Communion</option><option value="Confirmation">Confirmed</option><option value="Matrimony">Married in Church</option>
          </FilterSelect>
          <FilterSelect value={filters.ministry} onChange={(e) => setFilter('ministry', e.target.value)}>
            <option value="All">Any ministry / org</option>{groupOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </FilterSelect>
          <FilterSelect value={filters.age} onChange={(e) => setFilter('age', e.target.value)}>
            {AGE_OPTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </FilterSelect>
          <FilterSelect value={filters.blood} onChange={(e) => setFilter('blood', e.target.value)}>
            {BLOOD_OPTS.map((b) => <option key={b} value={b}>{b === 'All' ? 'All blood types' : b}</option>)}
          </FilterSelect>
          <FilterSelect value={filters.gkk} onChange={(e) => setFilter('gkk', e.target.value)}>
            <option value="All">All GKKs</option>{gkkOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </FilterSelect>
          <button onClick={() => { setFilters(DEFAULT_FILTERS); setSearch(''); }} className="appearance-none border-none bg-none cursor-pointer font-semibold text-[13px] text-parish-blue px-1.5 py-2">Clear</button>
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
              {!loading && !error && !rows.length && <EmptyState title="No members found" subtitle="Try adjusting your search or filters." />}
              <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />
            </>
          }
        >
          {rows.map((m) => {
            const groups = [...(m.ministries || []), ...(m.organizations || [])];
            return (
              <tr key={m.id} {...rowActivationProps(() => setOpenMemberId(m.id), `Open ${m.first_name} ${m.last_name}`)} className="border-t border-[#f1e8d5] cursor-pointer hover:bg-[#f7f2e6] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-parish-blue">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-[34px] h-[34px] rounded-full bg-[var(--p-blue-tint)] text-parish-blue flex items-center justify-center font-bold text-[12.5px] flex-none">
                      {(m.first_name?.[0] || '') + (m.last_name?.[0] || '')}
                    </div>
                    <span className="font-semibold text-[14.5px] text-parish-navy whitespace-nowrap">{m.first_name} {m.last_name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[14px] text-[#3f3b2f] whitespace-nowrap">{m.household_name}</td>
                <td className="px-4 py-3 text-[14px] text-parish-text2 whitespace-nowrap">{m.relationship || '—'}</td>
                <td className="px-4 py-3 text-[14px] text-[#3f3b2f]">{ageFromDob(m.dob) ?? '—'}</td>
                <td className="px-4 py-3 text-[14px] text-parish-text2 whitespace-nowrap">{m.civil_status || '—'}</td>
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
        </DataTable>
      </PageBody>

      {openMemberId && <MemberDetailModal memberId={openMemberId} onClose={() => setOpenMemberId(null)} onChanged={reload} />}
    </>
  );
}
