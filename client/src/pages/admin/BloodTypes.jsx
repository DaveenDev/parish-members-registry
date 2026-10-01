import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { PageHeader, PageBody, FilterSelect, SearchInput, DataTable, Pagination, EmptyState, ErrorState, LoadingState, rowActivationProps } from '../../components/admin.jsx';
import MemberDetailModal from '../../components/MemberDetailModal.jsx';
import { BLOOD_TYPES, AGE_OPTS } from '../../constants.js';
import { useDebounced, useCsvExport, useUrlState } from '../../hooks.js';

const URL_DEFAULTS = { gkk: 'All', age: 'All', blood: 'Recorded', q: '', sort: 'blood', dir: 'asc', page: 1, size: 20 };
const URL_ALLOWED = {
  blood: [...BLOOD_TYPES, 'Recorded', 'Unknown'],
  age: AGE_OPTS.map(([v]) => v),
  sort: ['name', 'blood', 'age'],
  dir: ['asc', 'desc'],
  size: [10, 20, 50],
};


function BloodBadge({ type }) {
  return <span className="font-bold text-[12.5px] bg-parish-errorBg text-parish-error px-3 py-1 rounded-full whitespace-nowrap">{type}</span>;
}

export default function BloodTypes() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gkkOptions, setGkkOptions] = useState([]);
  // Filters, search, sort and page live in the address bar (see useUrlState).
  // `blood` is a type, 'Recorded' (any on file), or 'Unknown'.
  const [url, setUrl] = useUrlState(URL_DEFAULTS, URL_ALLOWED);
  const { gkk, age, blood, q: search, sort: sortKey, dir: sortDir, page, size: pageSize } = url;
  const setGkk = (v) => setUrl({ gkk: v });
  const setAge = (v) => setUrl({ age: v });
  const setBlood = (v) => setUrl({ blood: v });
  const setSearch = (q) => setUrl({ q });
  const setPage = (p) => setUrl({ page: p });
  const setPageSize = (size) => setUrl({ size });
  const debouncedSearch = useDebounced(search);
  const csvExport = useCsvExport();
  const [openMemberId, setOpenMemberId] = useState(null);

  // Everything except the blood type itself, so the tiles show how each type
  // splits up under the current GKK / age / search.
  const scope = { gkk, age, search: debouncedSearch };

  useEffect(() => { api.listGkks().then((r) => setGkkOptions(r.rows.map((x) => x.name))).catch(() => {}); }, []);

  function reload() {
    setLoading(true);
    setError('');
    api.listMembers({ ...scope, blood, sortKey, sortDir, page, pageSize })
      .then((res) => { setRows(res.rows); setTotal(res.total); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  function reloadCounts() {
    api.bloodTypeCounts(scope).then(setCounts).catch(() => setCounts(null));
  }
  useEffect(() => { reload(); }, [gkk, age, blood, debouncedSearch, sortKey, sortDir, page, pageSize]);
  useEffect(() => { reloadCounts(); }, [gkk, age, debouncedSearch]);

  function sort(key) {
    if (sortKey === key) setUrl({ dir: sortDir === 'asc' ? 'desc' : 'asc' });
    else setUrl({ sort: key, dir: 'asc' });
  }
  const arrow = (key) => (sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : '');

  const recorded = counts ? BLOOD_TYPES.reduce((n, t) => n + counts[t], 0) : null;
  const isFiltered = gkk !== 'All' || age !== 'All' || !!debouncedSearch || !['Recorded'].includes(blood);

  const tiles = counts && [
    { key: 'Recorded', label: 'All recorded', n: recorded },
    ...BLOOD_TYPES.map((t) => ({ key: t, label: t, n: counts[t] })),
    { key: 'Unknown', label: 'Not recorded', n: counts.Unknown },
  ];

  return (
    <>
      <PageHeader title="Blood Types" subtitle="Find potential blood donors quickly in an emergency">
        <FilterSelect value={gkk} onChange={(e) => setGkk(e.target.value)} aria-label="Filter by GKK">
          <option value="All">All GKKs</option>{gkkOptions.map((g) => <option key={g} value={g}>{g}</option>)}
        </FilterSelect>
        <FilterSelect value={age} onChange={(e) => setAge(e.target.value)} aria-label="Filter by age">
          {AGE_OPTS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </FilterSelect>
        <SearchInput placeholder="Search name, household, contact…" aria-label="Search members" value={search} onChange={(e) => setSearch(e.target.value)} />
      </PageHeader>
      <PageBody>
        {tiles && (
          <div className="grid gap-2.5 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))' }} role="group" aria-label="Filter by blood type">
            {tiles.map((t) => {
              const active = blood === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setBlood(t.key)}
                  aria-pressed={active}
                  className={`appearance-none cursor-pointer text-left px-3 py-2.5 rounded-xl border-[1.5px] transition ${active ? 'border-parish-blue bg-[var(--p-blue-tint)]' : 'border-[#eee3ce] bg-[#fffdf8] hover:border-parish-blue'}`}
                >
                  <div className={`font-serif text-[26px] font-semibold leading-none ${t.key === 'Unknown' ? 'text-parish-muted' : 'text-parish-error'}`}>{t.n}</div>
                  <div className="text-[12px] font-semibold text-parish-text2 mt-1">{t.label}</div>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="text-[13px] text-parish-muted">{total} member(s){blood !== 'Recorded' && blood !== 'Unknown' ? ` with blood type ${blood}` : blood === 'Unknown' ? ' with no blood type on file' : ''}</div>
          {isFiltered && (
            <button onClick={() => setUrl({ gkk: 'All', age: 'All', blood: 'Recorded', q: '' })} className="appearance-none border-none bg-transparent cursor-pointer font-semibold text-[13px] text-parish-blue px-1.5 py-1">Clear</button>
          )}
          <button
            onClick={() => csvExport.run('/exports/blood.csv', 'blood-directory.csv')}
            disabled={!!csvExport.busy}
            className="ml-auto appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-white bg-parish-blue rounded-lg disabled:opacity-60"
          >
            {csvExport.busy ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>

        <DataTable
          minWidth={760}
          columns={[
            { label: 'Member', key: 'name', onSort: () => sort('name'), arrow: arrow('name') },
            { label: 'Blood type', key: 'blood', onSort: () => sort('blood'), arrow: arrow('blood') },
            { label: 'Age', key: 'age', onSort: () => sort('age'), arrow: arrow('age') },
            { label: 'GKK' },
            { label: 'Contact' },
            { label: 'Address' },
          ]}
          footer={
            <>
              {loading && <LoadingState label="Loading members…" />}
              {!loading && error && <ErrorState message={error} onRetry={reload} />}
              {!loading && !error && !rows.length && (
                isFiltered
                  ? <EmptyState title="No members match" subtitle="Try another blood type, or clear the search and filters." />
                  : <EmptyState title="No blood types on file yet" subtitle="Blood types appear here once members register or staff add them." />
              )}
              <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />
            </>
          }
          mobile={
            <ul className="list-none m-0 p-0 divide-y divide-[#f1e8d5]">
              {rows.map((m) => {
                const tel = m.contact && String(m.contact).replace(/[^\d+]/g, '');
                return (
                  <li key={m.id} className="px-4 py-3 flex items-center gap-3">
                    <button type="button" onClick={() => setOpenMemberId(m.id)} className="appearance-none border-none bg-transparent p-0 cursor-pointer text-left min-w-0 flex-1">
                      <div className="font-semibold text-[14.5px] text-parish-navy">{[m.first_name, m.last_name, m.suffix].filter(Boolean).join(' ')}</div>
                      <div className="text-[12.5px] text-parish-muted truncate">{[m.age != null && `${m.age} yrs`, m.household_gkk, m.household_name].filter(Boolean).join(' · ')}</div>
                    </button>
                    {m.blood_type ? <BloodBadge type={m.blood_type} /> : <span className="text-[12px] text-[#c4bba4]">—</span>}
                    {tel && <a href={`tel:${tel}`} aria-label={`Call ${m.first_name} ${m.last_name} at ${m.contact}`} className="px-3 py-2 rounded-lg font-semibold text-[12.5px] no-underline bg-[var(--p-blue-tint)] text-parish-blue">Call</a>}
                  </li>
                );
              })}
            </ul>
          }
        >
          {rows.map((m) => (
            <tr key={m.id} {...rowActivationProps(() => setOpenMemberId(m.id), `Open ${m.first_name} ${m.last_name}`)} className="border-t border-[#f1e8d5] cursor-pointer hover:bg-[#f7f2e6] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-parish-blue">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-[34px] h-[34px] rounded-full bg-[var(--p-blue-tint)] text-parish-blue flex items-center justify-center font-bold text-[12.5px] flex-none" aria-hidden>
                    {(m.first_name?.[0] || '') + (m.last_name?.[0] || '')}
                  </div>
                  <div>
                    <div className="font-semibold text-[14px] text-parish-navy whitespace-nowrap">{[m.first_name, m.last_name, m.suffix].filter(Boolean).join(' ')}</div>
                    <div className="text-[12px] text-parish-muted whitespace-nowrap">{m.household_name}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">{m.blood_type ? <BloodBadge type={m.blood_type} /> : <span className="text-[13px] text-[#c4bba4]">Not recorded</span>}</td>
              <td className="px-4 py-3 text-[14px] text-[#3f3b2f]">{m.age ?? '—'}</td>
              <td className="px-4 py-3 text-[13.5px] text-parish-text2 whitespace-nowrap">{m.household_gkk || '—'}</td>
              <td className="px-4 py-3 text-[14px] whitespace-nowrap">
                {m.contact ? (
                  <a
                    href={`tel:${String(m.contact).replace(/[^\d+]/g, '')}`}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="font-semibold text-parish-blue hover:underline"
                    aria-label={`Call ${m.first_name} ${m.last_name} at ${m.contact}`}
                  >
                    {m.contact}
                  </a>
                ) : <span className="text-[#c4bba4]">—</span>}
              </td>
              <td className="px-4 py-3 text-[13.5px] text-parish-text2">{[m.street, m.barangay].filter(Boolean).join(', ') || '—'}</td>
            </tr>
          ))}
        </DataTable>
      </PageBody>

      {openMemberId && <MemberDetailModal memberId={openMemberId} onClose={() => setOpenMemberId(null)} onChanged={() => { reload(); reloadCounts(); }} />}
    </>
  );
}
