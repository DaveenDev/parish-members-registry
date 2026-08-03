import React from 'react';
import { api, downloadWithAuth } from '../../api.js';
import { PageHeader, PageBody } from '../../components/admin.jsx';

function ExportCard({ icon, iconBg, iconColor, title, desc, onExport, btnBg }) {
  return (
    <div className="bg-[#fffdf8] border border-parish-border rounded-2xl p-[22px] shadow-cardSm" style={{ padding: '22px' }}>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3.5" style={{ background: iconBg, color: iconColor }}>{icon}</div>
      <div className="font-serif text-[20px] font-semibold text-parish-navy mb-1">{title}</div>
      <div className="text-[13px] text-parish-muted mb-4">{desc}</div>
      <button onClick={onExport} className="w-full appearance-none border-none cursor-pointer py-2.5 font-semibold text-[14px] text-white rounded-xl" style={{ background: btnBg }}>Export CSV</button>
    </div>
  );
}

export default function Exports() {
  return (
    <>
      <PageHeader title="Exports" subtitle="Download registry data as CSV" />
      <PageBody>
        <div className="max-w-[760px]">
          <div className="grid gap-4 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))' }}>
            <ExportCard
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /></svg>}
              iconBg="var(--p-blue-tint)" iconColor="var(--p-blue)" title="Members" desc="All member records with personal details, sacraments & ministries."
              onExport={() => downloadWithAuth('/exports/members.csv', 'members.csv')} btnBg="var(--p-blue)"
            />
            <ExportCard
              icon={<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>}
              iconBg="#fbf1dd" iconColor="var(--p-gold)" title="Households" desc="Household directory with address, GKK, grouping & status."
              onExport={() => downloadWithAuth('/exports/households.csv', 'households.csv')} btnBg="var(--p-gold)"
            />
          </div>
          <div className="bg-[var(--p-blue-tint)] border border-[#d4e0f2] rounded-xl px-[18px] py-4 text-[13.5px] text-[#2b466f] leading-relaxed">
            CSV files open directly in Microsoft Excel and Google Sheets. Exported data is handled discreetly — share only with authorized parish personnel.
          </div>
        </div>
      </PageBody>
    </>
  );
}
