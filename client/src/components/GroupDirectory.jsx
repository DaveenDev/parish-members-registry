import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PageHeader, PageBody, FilterSelect, EmptyState } from './admin.jsx';
import { ageFromDob } from '../constants.js';
import MemberDetailModal from './MemberDetailModal.jsx';

export default function GroupDirectory({ title, subtitle, listFn, memberKey }) {
  const [names, setNames] = useState([]);
  const [gkkOptions, setGkkOptions] = useState([]);
  const [gkk, setGkk] = useState('All');
  const [activeTab, setActiveTab] = useState('');
  const [allMembers, setAllMembers] = useState([]);
  const [openMemberId, setOpenMemberId] = useState(null);

  function reload() {
    listFn().then((res) => setNames(res.rows.map((r) => r.name)));
    api.listMembers({ status: 'All', civil: 'All', sacrament: 'All', ministry: 'All', age: 'All', blood: 'All', gkk: 'All', search: '', sortKey: 'name', sortDir: 'asc', page: 1, pageSize: 1000 }).then((res) => setAllMembers(res.rows));
  }

  useEffect(() => { reload(); }, []);
  useEffect(() => { api.listGkks().then((r) => setGkkOptions(r.rows.map((x) => x.name))); }, []);

  const filteredMembers = gkk === 'All' ? allMembers : allMembers.filter((m) => m.household_gkk === gkk);
  const tabs = names
    .map((name) => ({ label: name, count: filteredMembers.filter((m) => (m[memberKey] || []).includes(name)).length }))
    .filter((t) => t.count > 0 || gkk === 'All');
  const active = activeTab || (tabs[0] && tabs[0].label) || '';
  const tableRows = filteredMembers.filter((m) => (m[memberKey] || []).includes(active));

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
            <div className="flex flex-wrap gap-2 mb-[18px]" style={{ marginBottom: '18px' }}>
              {tabs.map((t) => (
                <button
                  key={t.label} onClick={() => setActiveTab(t.label)}
                  className="appearance-none cursor-pointer px-3.5 py-2 rounded-full border-[1.5px] font-semibold text-[13px] flex items-center gap-1.5 whitespace-nowrap"
                  style={{
                    borderColor: active === t.label ? '#34589c' : '#e6dcc7',
                    background: active === t.label ? '#34589c' : '#fff',
                    color: active === t.label ? '#fff' : '#3f3b2f',
                  }}
                >
                  {t.label}<span className="font-bold text-[11.5px] opacity-80">{t.count}</span>
                </button>
              ))}
            </div>
            <div className="bg-[#fffdf8] border border-parish-border rounded-2xl overflow-hidden shadow-cardSm">
              <div className="px-[18px] py-3.5 border-b border-[#f1e8d5] font-serif text-[19px] font-semibold text-parish-navy" style={{ padding: '15px 18px' }}>{active}</div>
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
                    {tableRows.map((m) => (
                      <tr key={m.id} onClick={() => setOpenMemberId(m.id)} className="border-t border-[#f1e8d5] cursor-pointer hover:bg-[#f7f2e6]">
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
            </div>
          </>
        )}
      </PageBody>

      {openMemberId && <MemberDetailModal memberId={openMemberId} onClose={() => setOpenMemberId(null)} onChanged={reload} />}
    </>
  );
}
