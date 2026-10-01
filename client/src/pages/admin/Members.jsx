import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { PageHeader, PageBody, FilterSelect, SearchInput, DataTable, Pagination, EmptyState, ErrorState, LoadingState, rowActivationProps } from '../../components/admin.jsx';
import { StatusPill, Badge, Checkbox } from '../../components/ui.jsx';
import { ageFromDob, CIVIL_STATUSES, AGE_OPTS, DASHBOARD_AGE_OPTS } from '../../constants.js';
import MemberDetailModal from '../../components/MemberDetailModal.jsx';
import { useDebounced, useUrlState } from '../../hooks.js';
import { groupByGkk } from '../../lib/household.js';
import { bis, RELATIONSHIP_LABELS, CIVIL_STATUS_LABELS } from '../../lib/bisaya.js';
import { MEMBERSHIP_STATUSES, STATUS_TONES } from '../../lib/census.js';
import { useToast } from '../../ToastContext.jsx';
import { useAuth } from '../../AuthContext.jsx';
import { can } from '../../lib/access.js';

const BLOOD_OPTS = ['All', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];
const SACRAMENT_OPTS = [['All', 'Any sacrament'], ['Baptism', 'Baptized'], ['Communion', 'First Communion'], ['Confirmation', 'Confirmed'], ['Matrimony', 'Married in Church']];
const MEMBERSHIP_OPTS = [['Current', 'Current members'], ['All', 'Everyone (incl. moved / deceased)'], ...MEMBERSHIP_STATUSES.map((s) => [s, s]), ['Not assessed', 'Not yet assessed']];
const CENSUS_OPTS = [['All', 'Any census'], ['Confirmed', 'Confirmed in census'], ['Not confirmed', 'Not confirmed in census']];
const DEFAULT_FILTERS = { status: 'All', civil: 'All', sacrament: 'All', ministry: 'All', age: 'All', blood: 'All', gkk: 'All', membership: 'Current', census: 'All' };
// Shown up front; the rest sit under "More filters".
const MAIN_FILTERS = ['gkk', 'status', 'membership', 'sacrament'];
// Rows are grouped under GKK headings; inside each GKK the default order is
// household name, then member name. Column headers re-sort within the GKKs.
const URL_DEFAULTS = { ...DEFAULT_FILTERS, q: '', sort: 'household', dir: 'asc', page: 1, size: 10 };
const URL_ALLOWED = {
  status: ['All', 'Verified', 'Pending'],
  // The Dashboard's age bars link here with their own ranges.
  age: [...AGE_OPTS, ...DASHBOARD_AGE_OPTS].map(([v]) => v),
  blood: BLOOD_OPTS,
  membership: MEMBERSHIP_OPTS.map(([v]) => v),
  census: CENSUS_OPTS.map(([v]) => v),
  sort: ['name', 'household', 'age', 'status'],
  dir: ['asc', 'desc'],
  size: [10, 20, 50],
};

const fullName = (m) => [m.first_name, m.last_name, m.suffix].filter(Boolean).join(' ');

export default function Members() {
  const toast = useToast();
  const { user } = useAuth();
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
  const extraActive = Object.keys(DEFAULT_FILTERS).filter((k) => !MAIN_FILTERS.includes(k) && filters[k] !== DEFAULT_FILTERS[k]).length;
  const [moreOpen, setMoreOpen] = useState(extraActive > 0);
  const [selected, setSelected] = useState(() => new Set());
  const [exporting, setExporting] = useState(false);

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
  useEffect(() => { setSelected(new Set()); }, [filterKey, debouncedSearch, sortKey, sortDir, page, pageSize]);
  useEffect(() => {
    api.listGkks().then((r) => setGkkOptions(r.rows.map((x) => x.name))).catch(() => {});
    Promise.all([api.listMinistries(), api.listOrganizations()])
      .then(([m, o]) => setGroupOptions([...m.rows.map((x) => x.name), ...o.rows.map((x) => x.name)]))
      .catch(() => {});
  }, []);

  function setFilter(key, value) { setUrl({ [key]: value }); }
  function sort(key) {
    if (sortKey === key) setUrl({ dir: sortDir === 'asc' ? 'desc' : 'asc' });
    else setUrl({ sort: key, dir: 'asc' });
  }
  function arrow(key) { return sortKey === key ? (sortDir === 'asc' ? '↑' : '↓') : ''; }

  // Every filter: its label in the chips, its options, and how it reads when set.
  const FILTERS = {
    gkk: { label: 'GKK', options: [['All', 'All GKKs'], ...gkkOptions.map((g) => [g, g])] },
    status: { label: 'Household status', options: [['All', 'All statuses'], ['Verified', 'Verified'], ['Pending', 'Pending']] },
    membership: { label: 'Membership', options: MEMBERSHIP_OPTS },
    sacrament: { label: 'Sacrament', options: SACRAMENT_OPTS },
    civil: { label: 'Civil status', options: [['All', 'All civil status'], ...CIVIL_STATUSES.map((c) => [c, bis(CIVIL_STATUS_LABELS, c)])] },
    ministry: { label: 'Ministry or organization', options: [['All', 'Any ministry / org'], ...groupOptions.map((g) => [g, g])] },
    age: { label: 'Age', options: [...AGE_OPTS, ...DASHBOARD_AGE_OPTS.filter(([v]) => v === filters.age).map(([v, t]) => [v, `Age ${t}`])] },
    blood: { label: 'Blood type', options: BLOOD_OPTS.map((b) => [b, b === 'All' ? 'All blood types' : b]) },
    census: { label: 'Census', options: CENSUS_OPTS },
  };
  const select = (key) => (
    <FilterSelect key={key} aria-label={FILTERS[key].label} value={filters[key]} onChange={(e) => setFilter(key, e.target.value)}>
      {FILTERS[key].options.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
    </FilterSelect>
  );
  const chips = Object.keys(DEFAULT_FILTERS).filter((k) => filters[k] !== DEFAULT_FILTERS[k]).map((k) => {
    const opt = FILTERS[k].options.find(([v]) => v === filters[k]);
    return { key: k, text: `${FILTERS[k].label}: ${opt ? opt[1] : filters[k]}` };
  });
  if (debouncedSearch) chips.unshift({ key: 'q', text: `Search: “${debouncedSearch}”` });

  const selectedRows = rows.filter((m) => selected.has(m.id));
  const allSelected = rows.length > 0 && selectedRows.length === rows.length;
  function toggleSelect(id) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  async function exportCsv(params, filename) {
    setExporting(true);
    try {
      const n = await api.exportMembersCsv(params, filename);
      toast.success(`Exported ${n} member(s)`);
    } catch (e) {
      toast.error(e.message || 'Could not export');
    } finally {
      setExporting(false);
    }
  }
  const canExport = can(user, 'exports');

  const groups = groupByGkk(rows);
  const footer = (
    <>
      {loading && <LoadingState label="Loading members…" />}
      {!loading && error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && !rows.length && (
        isFiltered
          ? <EmptyState title="No members found" subtitle="Try adjusting your search or filters." />
          : <EmptyState title="No members registered yet" subtitle="Members appear here once households are registered." />
      )}
      <Pagination page={page} pageSize={pageSize} total={total} onPage={(p) => setUrl({ page: p })} onPageSize={(size) => setUrl({ size })} />
    </>
  );

  return (
    <>
      <PageHeader title="Members" subtitle="Every registered parishioner, grouped by GKK">
        <SearchInput placeholder="Search name, household, contact…" aria-label="Search members" value={search} onChange={(e) => setUrl({ q: e.target.value })} />
      </PageHeader>
      <PageBody>
        <div className="flex flex-wrap gap-2.5 items-center mb-2.5">
          {MAIN_FILTERS.map(select)}
          <button
            type="button" onClick={() => setMoreOpen((o) => !o)} aria-expanded={moreOpen} aria-controls="more-member-filters"
            className="appearance-none cursor-pointer px-3 py-2.5 rounded-lg border-[1.5px] border-parish-borderSoft bg-parish-card font-semibold text-[13px] text-parish-text2"
          >
            More filters{extraActive ? ` (${extraActive})` : ''} <span aria-hidden>{moreOpen ? '▴' : '▾'}</span>
          </button>
          <div className="ml-auto flex items-center gap-2.5">
            <span className="text-[13px] text-parish-muted">{total} member(s)</span>
            {canExport && (
              <button
                onClick={() => exportCsv({ ...filters, search: debouncedSearch }, 'members.csv')} disabled={exporting || !total}
                className="appearance-none border-[1.5px] border-parish-borderSoft bg-parish-card cursor-pointer px-3.5 py-2.5 font-semibold text-[13px] text-parish-text2 rounded-xl disabled:opacity-60"
              >
                {exporting ? 'Exporting…' : isFiltered ? 'Export this view' : 'Export CSV'}
              </button>
            )}
          </div>
        </div>
        {moreOpen && (
          <div id="more-member-filters" className="flex flex-wrap gap-2.5 items-center mb-2.5 p-3 rounded-xl bg-parish-hover">
            {Object.keys(DEFAULT_FILTERS).filter((k) => !MAIN_FILTERS.includes(k)).map(select)}
          </div>
        )}
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center mb-3" aria-label="Active filters">
            {chips.map((c) => (
              <button
                key={c.key} type="button"
                onClick={() => setUrl({ [c.key]: c.key === 'q' ? '' : DEFAULT_FILTERS[c.key] })}
                aria-label={`Remove filter ${c.text}`}
                className="appearance-none cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-parish-infoBorder bg-[var(--p-blue-tint)] font-semibold text-[12.5px] text-parish-blue"
              >
                {c.text} <span aria-hidden className="text-[14px] leading-none">×</span>
              </button>
            ))}
            <button onClick={() => setUrl({ ...DEFAULT_FILTERS, q: '' })} className="appearance-none border-none bg-transparent cursor-pointer font-semibold text-[13px] text-parish-blue px-1.5 py-1">Clear all</button>
          </div>
        )}

        {selectedRows.length > 0 && (
          <div role="region" aria-label="Selected members" className="mb-3 flex items-center gap-2.5 flex-wrap px-4 py-3 rounded-xl bg-parish-navy text-white shadow-card">
            <span className="font-semibold text-[13.5px] mr-1">{selectedRows.length} selected</span>
            {canExport && <button onClick={() => exportCsv({ ids: selectedRows.map((m) => m.id), membership: 'All' }, 'selected-members.csv')} disabled={exporting} className="appearance-none border-none cursor-pointer px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 font-semibold text-[13px] text-white disabled:opacity-60">Export CSV</button>}
            <button onClick={() => setSelected(new Set())} className="ml-auto appearance-none border-none cursor-pointer px-2 py-1.5 bg-transparent font-semibold text-[13px] text-white/80 hover:text-white">Clear selection</button>
          </div>
        )}

        <DataTable
          minWidth={800}
          columns={[
            { key: 'select', className: 'w-8 pr-0', header: <Checkbox checked={allSelected} disabled={!rows.length} onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((m) => m.id)))} aria-label="Select every member on this page" /> },
            { label: 'Member', key: 'name', onSort: () => sort('name'), arrow: arrow('name') },
            { label: 'Household', key: 'household', onSort: () => sort('household'), arrow: arrow('household') },
            { label: 'Relationship' },
            { label: 'Age', key: 'age', onSort: () => sort('age'), arrow: arrow('age') },
            { label: 'Civil' },
            { label: 'Ministries' },
            { label: 'Status', key: 'status', onSort: () => sort('status'), arrow: arrow('status') },
          ]}
          footer={footer}
          mobile={
            <ul className="list-none m-0 p-0">
              {groups.map((g) => (
                <React.Fragment key={g.gkk || 'no-gkk'}>
                  <li className="px-4 py-2 bg-parish-sunk font-serif text-[16.5px] font-semibold text-parish-navy">{g.gkk || 'No GKK'}</li>
                  {g.members.map((m) => (
                    <li key={m.id} className="border-t border-parish-line">
                      <button type="button" onClick={() => setOpenMemberId(m.id)} className="w-full appearance-none border-none bg-transparent cursor-pointer text-left px-4 py-3 flex items-center gap-3">
                        <div className="w-[34px] h-[34px] rounded-full bg-[var(--p-blue-tint)] text-parish-blue flex items-center justify-center font-bold text-[12.5px] flex-none" aria-hidden>
                          {(m.first_name?.[0] || '') + (m.last_name?.[0] || '')}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-[14.5px] text-parish-navy">{fullName(m)}</div>
                          <div className="text-[12.5px] text-parish-muted truncate">
                            {[m.household_name, bis(RELATIONSHIP_LABELS, m.relationship), ageFromDob(m.dob) != null && `${ageFromDob(m.dob)} yrs`].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        {m.membership_status && <Badge tone={STATUS_TONES[m.membership_status]}>{m.membership_status}</Badge>}
                      </button>
                    </li>
                  ))}
                </React.Fragment>
              ))}
            </ul>
          }
        >
          {groups.map((g, gi) => (
            <React.Fragment key={g.gkk || 'no-gkk'}>
              <tr className={`bg-parish-sunk ${gi ? 'border-t-2 border-parish-borderStrong' : ''}`}>
                <th scope="colgroup" colSpan={8} className="text-left px-4 py-2 font-serif text-[16.5px] font-semibold text-parish-navy">
                  {g.gkk || 'No GKK'}
                </th>
              </tr>
              {g.members.map((m) => {
                const memberGroups = [...(m.ministries || []), ...(m.organizations || [])];
                return (
                  <tr key={m.id} {...rowActivationProps(() => setOpenMemberId(m.id), `Open ${m.first_name} ${m.last_name}`)} className={`border-t border-parish-line cursor-pointer hover:bg-parish-hover focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-parish-blue ${selected.has(m.id) ? 'bg-[var(--p-blue-tint)]' : ''}`}>
                    <td className="pl-4 pr-0 py-2.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(m.id)} onChange={() => toggleSelect(m.id)} aria-label={`Select ${fullName(m)}`} />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-[34px] h-[34px] rounded-full bg-[var(--p-blue-tint)] text-parish-blue flex items-center justify-center font-bold text-[12.5px] flex-none">
                          {(m.first_name?.[0] || '') + (m.last_name?.[0] || '')}
                        </div>
                        <span className="font-semibold text-[14.5px] text-parish-navy whitespace-nowrap">{m.first_name} {m.last_name}</span>
                        {m.membership_status && <Badge tone={STATUS_TONES[m.membership_status]} title={m.last_census_label ? `From the ${m.last_census_label}` : undefined}>{m.membership_status}</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[14px] text-parish-text3 whitespace-nowrap">{m.household_name}</td>
                    <td className="px-4 py-3 text-[14px] text-parish-text2 whitespace-nowrap">{bis(RELATIONSHIP_LABELS, m.relationship) || '—'}</td>
                    <td className="px-4 py-3 text-[14px] text-parish-text3">{ageFromDob(m.dob) ?? '—'}</td>
                    <td className="px-4 py-3 text-[14px] text-parish-text2 whitespace-nowrap">{bis(CIVIL_STATUS_LABELS, m.civil_status) || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {memberGroups.slice(0, 2).map((x) => <span key={x} className="font-semibold text-[11.5px] bg-parish-track text-parish-chip px-2.5 py-1 rounded-full whitespace-nowrap">{x}</span>)}
                        {memberGroups.length > 2 && <span className="font-semibold text-[11.5px] text-parish-muted">+{memberGroups.length - 2} more</span>}
                        {!memberGroups.length && <span className="text-[13px] text-parish-faint">—</span>}
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
