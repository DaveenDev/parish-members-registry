import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { PageHeader, PageBody, FilterSelect, DataTable, Pagination, EmptyState, ErrorState, LoadingState, rowActivationProps } from '../../components/admin.jsx';
import MemberDetailModal from '../../components/MemberDetailModal.jsx';

const YN = [['All', 'All'], ['Yes', 'Yes'], ['No', 'No']];

function Tick({ yes }) {
  return yes
    ? <span className="text-[#2f7a52] font-bold">✓</span>
    : <span className="text-[#d3c8ad]">—</span>;
}

export default function Sacraments() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [gkkOptions, setGkkOptions] = useState([]);
  const [filters, setFilters] = useState({ gkk: 'All', baptism: 'All', communion: 'All', confirmation: 'All', matrimony: 'All' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openMemberId, setOpenMemberId] = useState(null);

  useEffect(() => { api.listGkks().then((r) => setGkkOptions(r.rows.map((x) => x.name))).catch(() => {}); }, []);
  useEffect(() => { setPage(1); }, [filters]);

  // The sacrament filters are applied server-side; filtering a single page
  // client-side would make both the row list and the total incorrect.
  function reload() {
    setLoading(true);
    setError('');
    api.listMembers({
      gkk: filters.gkk,
      baptism: filters.baptism,
      communion: filters.communion,
      confirmation: filters.confirmation,
      matrimony: filters.matrimony,
      page, pageSize, sortKey: 'name', sortDir: 'asc',
    })
      .then((res) => { setRows(res.rows); setTotal(res.total); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => { reload(); }, [filters, page, pageSize]);

  return (
    <>
      <PageHeader title="Sacraments" subtitle="Sacramental record overview" />
      <PageBody>
        <div className="flex flex-wrap gap-2.5 items-center mb-4">
          <FilterSelect value={filters.gkk} onChange={(e) => setFilters((f) => ({ ...f, gkk: e.target.value }))}>
            <option value="All">All GKKs</option>{gkkOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </FilterSelect>
          <FilterSelect value={filters.baptism} onChange={(e) => setFilters((f) => ({ ...f, baptism: e.target.value }))}>
            {YN.map(([v, t]) => <option key={v} value={v}>Baptism: {t}</option>)}
          </FilterSelect>
          <FilterSelect value={filters.communion} onChange={(e) => setFilters((f) => ({ ...f, communion: e.target.value }))}>
            {YN.map(([v, t]) => <option key={v} value={v}>Communion: {t}</option>)}
          </FilterSelect>
          <FilterSelect value={filters.confirmation} onChange={(e) => setFilters((f) => ({ ...f, confirmation: e.target.value }))}>
            {YN.map(([v, t]) => <option key={v} value={v}>Confirmation: {t}</option>)}
          </FilterSelect>
          <FilterSelect value={filters.matrimony} onChange={(e) => setFilters((f) => ({ ...f, matrimony: e.target.value }))}>
            {YN.map(([v, t]) => <option key={v} value={v}>Matrimony: {t}</option>)}
          </FilterSelect>
          <div className="ml-auto text-[13px] text-parish-muted">{total} member(s)</div>
        </div>

        <DataTable
          columns={[
            { label: 'Member' }, { label: 'Baptism', align: 'center' }, { label: 'Communion', align: 'center' },
            { label: 'Confirmation', align: 'center' }, { label: 'Matrimony', align: 'center' },
          ]}
          footer={
            <>
              {loading && <LoadingState label="Loading members…" />}
              {!loading && error && <ErrorState message={error} onRetry={reload} />}
              {!loading && !error && !rows.length && <EmptyState title="No members match this filter" />}
              <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />
            </>
          }
        >
          {rows.map((m) => (
            <tr key={m.id} {...rowActivationProps(() => setOpenMemberId(m.id), `Open ${m.first_name} ${m.last_name}`)} className="border-t border-[#f1e8d5] cursor-pointer hover:bg-[#f7f2e6] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-parish-blue">
              <td className="px-4 py-2.5 font-semibold text-[14px] text-parish-navy whitespace-nowrap">{m.first_name} {m.last_name}</td>
              <td className="text-center px-2.5 py-2.5"><Tick yes={m.has_baptism} /></td>
              <td className="text-center px-2.5 py-2.5"><Tick yes={m.has_communion} /></td>
              <td className="text-center px-2.5 py-2.5"><Tick yes={m.has_confirmation} /></td>
              <td className="text-center px-2.5 py-2.5"><Tick yes={m.has_matrimony} /></td>
            </tr>
          ))}
        </DataTable>
      </PageBody>

      {openMemberId && <MemberDetailModal memberId={openMemberId} onClose={() => setOpenMemberId(null)} onChanged={reload} />}
    </>
  );
}
