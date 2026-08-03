import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PageHeader, PageBody, FilterSelect, EmptyState, ErrorState, LoadingState, Pagination, rowActivationProps } from './admin.jsx';
import { ageFromDob } from '../constants.js';
import MemberDetailModal from './MemberDetailModal.jsx';

export default function GroupDirectory({ title, subtitle, listFn }) {
  const [tabs, setTabs] = useState([]);
  const [gkkOptions, setGkkOptions] = useState([]);
  const [gkk, setGkk] = useState('All');
  const [activeTab, setActiveTab] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openMemberId, setOpenMemberId] = useState(null);
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
  }, [gkk]);

  useEffect(() => { api.listGkks().then((r) => setGkkOptions(r.rows.map((x) => x.name))).catch(() => {}); }, []);
  useEffect(() => { setPage(1); }, [gkk, activeTab]);

  // Roster for the active group — filtered and paginated server-side, so this
  // stays correct no matter how large the parish grows.
  function reload() {
    if (!activeTab) { setRows([]); setTotal(0); setLoading(false); return; }
    setLoading(true);
    setError('');
    api.listMembers({ ministry: activeTab, gkk, page, pageSize, sortKey: 'name', sortDir: 'asc' })
      .then((res) => { setRows(res.rows); setTotal(res.total); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(() => { reload(); }, [activeTab, gkk, page, pageSize]);

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
              <div className="px-[18px] py-3.5 border-b border-[#f1e8d5] font-serif text-[19px] font-semibold text-parish-navy">
                {activeTab}
                <span className="font-sans text-[13px] font-semibold text-parish-muted"> · {total} member(s)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth: 640 }}>
                  <thead>
                    <tr className="bg-[#f4efe3]">
                      {['Member', 'Age', 'Address', 'Contact number'].map((h) => (
                        <th key={h} className="text-left px-4 py-3.5 font-bold text-[12px] tracking-wide uppercase text-parish-text2">{h}</th>
                      ))}
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {loading && <LoadingState label="Loading roster…" />}
              {!loading && error && <ErrorState message={error} onRetry={reload} />}
              {!loading && !error && !rows.length && <EmptyState title="No members in this group yet" />}
              <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />
            </div>
          </>
        )}
      </PageBody>

      {openMemberId && <MemberDetailModal memberId={openMemberId} onClose={() => setOpenMemberId(null)} onChanged={reload} />}
    </>
  );
}
