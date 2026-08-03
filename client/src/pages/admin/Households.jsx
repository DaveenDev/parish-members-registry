import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { PageHeader, PageBody, FilterSelect, SearchInput, Pagination, EmptyState } from '../../components/admin.jsx';
import { StatusPill, PrimaryButton } from '../../components/ui.jsx';
import MemberDetailModal from '../../components/MemberDetailModal.jsx';

export default function Households() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState('All');
  const [gkk, setGkk] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [gkkOptions, setGkkOptions] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [expandedMembers, setExpandedMembers] = useState({});
  const [openMemberId, setOpenMemberId] = useState(null);

  function reload() {
    api.listHouseholds({ status, gkk, search, page, pageSize }).then((res) => { setRows(res.rows); setTotal(res.total); });
  }

  useEffect(() => { reload(); }, [status, gkk, search, page, pageSize]);
  useEffect(() => { api.listGkks().then((res) => setGkkOptions(res.rows.map((r) => r.name))); }, []);
  useEffect(() => { setPage(1); }, [status, gkk, search]);

  async function toggleExpand(id) {
    setExpanded((e) => ({ ...e, [id]: !e[id] }));
    if (!expandedMembers[id]) {
      const res = await api.getHousehold(id);
      setExpandedMembers((m) => ({ ...m, [id]: res.members }));
    }
  }

  async function toggleStatus(h) {
    await api.updateHousehold(h.id, { status: h.status === 'Verified' ? 'Pending' : 'Verified' });
    reload();
  }

  return (
    <>
      <PageHeader title="Households" subtitle="All registered families">
        <FilterSelect value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="All">All statuses</option><option value="Verified">Verified</option><option value="Pending">Pending</option>
        </FilterSelect>
        <FilterSelect value={gkk} onChange={(e) => setGkk(e.target.value)}>
          <option value="All">All GKKs</option>
          {gkkOptions.map((g) => <option key={g} value={g}>{g}</option>)}
        </FilterSelect>
        <SearchInput placeholder="Search name, address, contact…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </PageHeader>
      <PageBody>
        <div className="flex items-center mb-4">
          <div className="text-[13px] text-parish-muted">{total} household(s)</div>
          <PrimaryButton onClick={() => navigate('/admin/households/new')} className="ml-auto px-[18px] py-2.5 text-[13.5px] flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14" /></svg>New Household
          </PrimaryButton>
        </div>

        <div className="bg-[#fffdf8] border border-parish-border rounded-2xl overflow-hidden shadow-cardSm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 820 }}>
              <thead>
                <tr className="bg-[#f4efe3]">
                  {['Household', 'GKK / Grouping', 'Members', 'Status', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3.5 font-bold text-[12px] tracking-wide uppercase text-parish-text2 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <React.Fragment key={h.id}>
                    <tr className="border-t border-[#f1e8d5]">
                      <td className="p-0">
                        <button onClick={() => toggleExpand(h.id)} className="appearance-none border-none bg-none cursor-pointer text-left w-full px-4 py-2.5 flex items-center gap-2.5 hover:bg-[#f7f2e6]">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9a927f" strokeWidth="2.6" className="flex-none transition-transform" style={{ transform: expanded[h.id] ? 'rotate(90deg)' : 'none' }}><path d="M9 6l6 6-6 6" /></svg>
                          <span>
                            <span className="block font-serif text-[19px] font-semibold text-parish-navy leading-tight">{h.household_name}</span>
                            <span className="block text-[12px] text-parish-muted mt-0.5">{[h.street, h.barangay, h.city].filter(Boolean).join(', ')}</span>
                          </span>
                        </button>
                      </td>
                      <td className="px-4 py-3.5 text-[13.5px] text-[#3f3b2f] whitespace-nowrap">{h.gkk || '—'}<div className="text-[12px] text-parish-muted">{h.family_grouping || '—'}</div></td>
                      <td className="px-4 py-3.5 text-[14px] text-parish-text2 whitespace-nowrap">{h.member_count} member(s)</td>
                      <td className="px-4 py-3.5"><StatusPill status={h.status} /></td>
                      <td className="px-4 py-3.5">
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => toggleStatus(h)} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-blue bg-[#eef3fb] rounded-lg whitespace-nowrap">
                            {h.status === 'Verified' ? 'Mark Pending' : 'Mark Verified'}
                          </button>
                          <button onClick={() => window.print()} className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-text2 bg-[#f4efe3] rounded-lg">Print</button>
                        </div>
                      </td>
                    </tr>
                    {expanded[h.id] && (
                      <tr className="bg-[#fbf8f0]">
                        <td colSpan={5} className="px-4 py-4" style={{ paddingLeft: 42 }}>
                          <div className="flex flex-col gap-2">
                            {(expandedMembers[h.id] || []).map((m) => (
                              <button key={m.id} onClick={() => setOpenMemberId(m.id)} className="flex items-center gap-3 px-3.5 py-2.5 bg-[#fffdf8] border border-[#f0e8d6] rounded-xl text-left hover:border-[#cdd7e8]">
                                <div className="w-[34px] h-[34px] rounded-full bg-[#eef3fb] text-parish-blue flex items-center justify-center font-bold text-[12px] flex-none">
                                  {(m.first_name?.[0] || '') + (m.last_name?.[0] || '')}
                                </div>
                                <div className="flex-none min-w-[160px]">
                                  <div className="text-[14px] font-semibold text-parish-navy">{m.first_name} {m.last_name}</div>
                                  <div className="text-[12px] text-parish-muted">{m.relationship || '—'}</div>
                                </div>
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
          {!rows.length && <EmptyState title="No households found" subtitle="Try adjusting your search or filters." />}
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={setPageSize} />
        </div>
      </PageBody>

      {openMemberId && (
        <MemberDetailModal memberId={openMemberId} onClose={() => setOpenMemberId(null)} onChanged={() => { reload(); setExpandedMembers({}); }} />
      )}
    </>
  );
}
