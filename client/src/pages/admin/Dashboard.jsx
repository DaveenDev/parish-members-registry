import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import { PageHeader, PageBody } from '../../components/admin.jsx';

function StatCard({ label, value, note, accent }) {
  return (
    <div className="bg-[#fffdf8] border border-parish-border rounded-2xl px-[18px] py-4 shadow-cardSm min-w-0" style={{ padding: '16px 18px' }}>
      <div className="flex items-center gap-2 mb-2.5" style={{ color: accent }}>
        <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
        <span className="font-semibold text-[12px] tracking-wide uppercase text-parish-muted">{label}</span>
      </div>
      <div className="font-serif text-[38px] font-semibold leading-none text-parish-navy">{value}</div>
      <div className="text-[12.5px] text-parish-muted mt-1.5">{note}</div>
    </div>
  );
}

function Bars({ data, color1, color2 }) {
  return (
    <div className="flex items-end gap-3.5 h-[150px]">
      {data.map((b) => (
        <div key={b.label} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
          <div className="font-bold text-[13px]" style={{ color: color2 }}>{b.n}</div>
          <div className="w-full max-w-[38px] rounded-t-lg transition-all duration-500" style={{ height: b.h, minHeight: 4, background: `linear-gradient(180deg,${color1},${color2})` }} />
          <div className="font-semibold text-[12px] text-parish-muted text-center">{b.label}</div>
        </div>
      ))}
    </div>
  );
}

function BreakdownBars({ data, color1, color2 }) {
  return (
    <div className="flex flex-col gap-3.5">
      {data.map((g) => (
        <div key={g.label}>
          <div className="flex justify-between text-[13px] mb-1.5"><span className="text-[#3f3b2f] font-semibold">{g.label}</span><span className="text-parish-muted">{g.n}</span></div>
          <div className="h-2.5 bg-[#f1e8d5] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: g.w, background: `linear-gradient(90deg,${color1},${color2})` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => { api.dashboardStats().then(setStats); }, []);

  if (!stats) return <div className="p-8 text-parish-muted">Loading dashboard…</div>;

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Parish registry overview" />
      <PageBody>
        <div className="grid gap-3.5 mb-[22px]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(150px,100%),1fr))', marginBottom: '22px' }}>
          {stats.statCards.map((c) => <StatCard key={c.label} {...c} />)}
        </div>

        <div className="grid gap-[18px] mb-[18px]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
          <div className="bg-[#fffdf8] border border-parish-border rounded-2xl px-[22px] py-5 shadow-cardSm">
            <div className="font-serif text-[20px] font-semibold text-parish-navy mb-0.5">Registrations over time</div>
            <div className="text-[12.5px] text-parish-muted mb-5">Members enrolled per month</div>
            <Bars data={stats.regMonths} color1="#4a71b8" color2="#34589c" />
          </div>
          <div className="bg-[#fffdf8] border border-parish-border rounded-2xl px-[22px] py-5 shadow-cardSm">
            <div className="font-serif text-[20px] font-semibold text-parish-navy mb-0.5">Age distribution</div>
            <div className="text-[12.5px] text-parish-muted mb-5">All registered members</div>
            <Bars data={stats.ageBuckets} color1="#e0bd6d" color2="#c39b4e" />
          </div>
        </div>

        <div className="grid gap-[18px]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
          <div className="bg-[#fffdf8] border border-parish-border rounded-2xl px-[22px] py-5 shadow-cardSm">
            <div className="font-serif text-[20px] font-semibold text-parish-navy mb-[18px]">Members by GKK</div>
            {stats.gkkBreak.length ? <BreakdownBars data={stats.gkkBreak} color1="#34589c" color2="#4a71b8" /> : <div className="text-parish-muted text-sm">No GKK data yet.</div>}
          </div>
          <div className="bg-[#fffdf8] border border-parish-border rounded-2xl px-[22px] py-5 shadow-cardSm">
            <div className="font-serif text-[20px] font-semibold text-parish-navy mb-[18px]">Top ministries &amp; organizations</div>
            {stats.ministryBreak.length ? <BreakdownBars data={stats.ministryBreak} color1="#c39b4e" color2="#e0bd6d" /> : <div className="text-parish-muted text-sm">No participation data yet.</div>}
          </div>
        </div>

        <div className="bg-[#fffdf8] border border-parish-border rounded-2xl px-[22px] py-5 shadow-cardSm mt-[18px]">
          <div className="font-serif text-[20px] font-semibold text-parish-navy mb-4">Members by sacrament received</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
            {stats.sacStats.map((s) => (
              <div key={s.label} className="border border-[#f0e8d6] rounded-xl px-3.5 py-3.5 bg-[#fdfbf6] text-center">
                <div className="font-serif text-[30px] font-semibold text-parish-blue leading-none">{s.n}</div>
                <div className="text-[12.5px] text-parish-text2 mt-1.5 font-semibold">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </PageBody>
    </>
  );
}
