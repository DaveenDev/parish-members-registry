import React, { useEffect, useState } from 'react';
import { api, downloadWithAuth, triggerDownload } from '../../api.js';
import { PageHeader, PageBody, FilterSelect } from '../../components/admin.jsx';
import { PrimaryButton, GhostButton } from '../../components/ui.jsx';

function Bar({ label, right, w, color }) {
  return (
    <div>
      <div className="flex justify-between text-[13.5px] mb-1.5"><span className="text-[#3f3b2f] font-semibold">{label}</span><span className="text-parish-muted">{right}</span></div>
      <div className="h-2.5 bg-[#f1e8d5] rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: w, background: color }} />
      </div>
    </div>
  );
}

function SplitBar({ label, right, vw, pw }) {
  return (
    <div>
      <div className="flex justify-between text-[13.5px] mb-1.5"><span className="text-[#3f3b2f] font-semibold">{label}</span><span className="text-parish-muted">{right}</span></div>
      <div className="h-2.5 bg-[#f1e8d5] rounded-full overflow-hidden flex">
        <div className="h-full" style={{ width: vw, background: '#2f7a52' }} />
        <div className="h-full" style={{ width: pw, background: 'var(--p-gold)' }} />
      </div>
    </div>
  );
}

const SOURCE_META = {
  Members: { gkk: true, group: true, sacrament: true },
  Households: { gkk: true, dateRange: true },
};

export default function Reports() {
  const [tab, setTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [bloodType, setBloodType] = useState('All');
  const [bloodRows, setBloodRows] = useState([]);

  const [genSource, setGenSource] = useState('');
  const [genType, setGenType] = useState('');
  const [scope, setScope] = useState({ gkk: 'All', dateFrom: '', dateTo: '', sacrament: 'Baptism', group: '' });
  const [ministryOptions, setMinistryOptions] = useState([]);
  const [gkkOptions, setGkkOptions] = useState([]);
  const [report, setReport] = useState(null);

  useEffect(() => { api.reportStats().then(setStats); }, []);
  useEffect(() => { api.bloodReport(bloodType).then((r) => setBloodRows(r.rows)); }, [bloodType]);
  useEffect(() => {
    Promise.all([api.listMinistries(), api.listOrganizations()]).then(([m, o]) => setMinistryOptions([...m.rows.map((x) => x.name), ...o.rows.map((x) => x.name)]));
  }, []);
  useEffect(() => { api.listGkks().then((r) => setGkkOptions(r.rows.map((g) => g.name))); }, []);

  async function generate() {
    const res = await api.generateReport({ source: genSource, type: genType, ...scope });
    setReport(res);
  }
  async function exportGenerated() {
    if (!report) return;
    const blob = await api.exportGenerated({ title: report.title, columns: report.csvColumns, rows: report.rows });
    triggerDownload(blob, `${report.title.toLowerCase().replace(/\s+/g, '-')}.csv`);
  }

  const meta = SOURCE_META[genSource] || {};

  return (
    <>
      <PageHeader title="Reports" subtitle="Registry statistics & custom reports" />
      <PageBody>
        <div className="max-w-[920px]">
          <div className="flex gap-1 mb-[22px] border-b border-parish-border" style={{ marginBottom: '22px' }}>
            {[['stats', 'Report Stats'], ['gen', 'Generate Report']].map(([k, label]) => (
              <button
                key={k} onClick={() => setTab(k)}
                className="appearance-none border-none bg-none cursor-pointer px-4 py-2.5 -mb-px font-semibold text-[15px]"
                style={{ color: tab === k ? 'var(--p-blue)' : '#8a836f', borderBottom: `2.5px solid ${tab === k ? 'var(--p-blue)' : 'transparent'}` }}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'stats' && stats && (
            <div className="flex flex-col gap-5">
              <div className="bg-[#fffdf8] border border-parish-border rounded-2xl px-[22px] py-[22px] shadow-cardSm" style={{ padding: '22px 24px' }}>
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <div className="font-serif text-[21px] font-semibold text-parish-navy">Registration Status by GKK</div>
                  <div className="text-[13px] text-parish-muted">{stats.totalVerified} verified · {stats.totalPending} pending of {stats.totalHH} households</div>
                </div>
                <p className="text-[13px] text-parish-muted mb-[18px]" style={{ marginBottom: '18px' }}>Households confirmed vs. awaiting verification, broken down by Basic Ecclesial Community.</p>
                <div className="flex flex-col gap-3.5">
                  {stats.regByGkk.map((g) => <SplitBar key={g.label} label={g.label} right={`${g.verified} verified · ${g.pending} pending`} vw={g.vw} pw={g.pw} />)}
                </div>
              </div>

              <div className="bg-[#fffdf8] border border-parish-border rounded-2xl px-[22px] py-[22px] shadow-cardSm" style={{ padding: '22px 24px' }}>
                <div className="font-serif text-[21px] font-semibold text-parish-navy mb-1">Sacramental Completion</div>
                <p className="text-[13px] text-parish-muted mb-[18px]" style={{ marginBottom: '18px' }}>Share of all {stats.totalMembers} registered members who have received each sacrament.</p>
                <div className="flex flex-col gap-3.5">
                  {stats.sacCompletion.map((s) => <Bar key={s.label} label={s.label} right={`${s.n} received · ${s.missing} not yet recorded`} w={s.w} color="linear-gradient(90deg,var(--p-blue),var(--p-blue-light))" />)}
                </div>
              </div>

              <div className="bg-[#fffdf8] border border-parish-border rounded-2xl px-[22px] py-[22px] shadow-cardSm" style={{ padding: '22px 24px' }}>
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <div className="font-serif text-[21px] font-semibold text-parish-navy">Ministry &amp; Organization Participation</div>
                  <div className="text-[13px] text-parish-muted">{stats.anyVolunteer}% of members serve in at least one</div>
                </div>
                <p className="text-[13px] text-parish-muted mb-[18px]" style={{ marginBottom: '18px' }}>Full roster counts across every ministry and organization.</p>
                <div className="grid gap-x-6 gap-y-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(380px,1fr))' }}>
                  {stats.participation.map((p) => <Bar key={p.label} label={p.label} right={p.n} w={p.w} color={p.color} />)}
                </div>
              </div>

              <div className="bg-[#fffdf8] border border-parish-border rounded-2xl px-[22px] py-[22px] shadow-cardSm" style={{ padding: '22px 24px' }}>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                  <div className="font-serif text-[21px] font-semibold text-parish-navy">Blood Type Directory</div>
                  <button onClick={() => downloadWithAuth('/exports/blood.csv', 'blood-directory.csv')} className="appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-white bg-parish-blue rounded-lg">Export CSV</button>
                </div>
                <p className="text-[13px] text-parish-muted mb-4">For locating potential blood donors quickly in an emergency. {stats.unknownBlood} member(s) have no blood type on file.</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {stats.bloodCounts.map((b) => <span key={b.label} className="font-bold text-[12.5px] bg-parish-errorBg text-parish-error px-3.5 py-1.5 rounded-full">{b.label} · {b.n}</span>)}
                </div>
                <FilterSelect value={bloodType} onChange={(e) => setBloodType(e.target.value)} className="mb-3.5">
                  <option value="All">All blood types</option>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b} value={b}>{b}</option>)}
                </FilterSelect>
                {!bloodRows.length && <div className="py-7 px-4 text-center text-parish-muted text-[14px]">No members with a recorded blood type for this filter.</div>}
                {!!bloodRows.length && (
                  <div className="border border-[#f0e8d6] rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse" style={{ minWidth: 560 }}>
                        <thead><tr className="bg-[#f4efe3]">{['Member', 'Blood Type', 'Age', 'GKK', 'Contact'].map((h) => <th key={h} className="text-left px-3.5 py-2.5 font-bold text-[11.5px] tracking-wide uppercase text-parish-text2">{h}</th>)}</tr></thead>
                        <tbody>
                          {bloodRows.map((b) => (
                            <tr key={b.mid} className="border-t border-[#f1e8d5]">
                              <td className="px-3.5 py-2.5">
                                <div className="flex items-center gap-2.5"><div className="w-7 h-7 rounded-full bg-[var(--p-blue-tint)] text-parish-blue flex items-center justify-center font-bold text-[11px] flex-none">{b.initials}</div>
                                  <div><div className="text-[13.5px] font-semibold text-parish-navy whitespace-nowrap">{b.name}</div><div className="text-[11.5px] text-parish-muted">{b.household}</div></div>
                                </div>
                              </td>
                              <td className="px-3.5 py-2.5"><span className="font-bold text-[12px] bg-parish-errorBg text-parish-error px-2.5 py-1 rounded-full">{b.bloodType}</span></td>
                              <td className="px-3.5 py-2.5 text-[13.5px] text-[#3f3b2f]">{b.age ?? '—'}</td>
                              <td className="px-3.5 py-2.5 text-[13.5px] text-parish-text2 whitespace-nowrap">{b.gkk || '—'}</td>
                              <td className="px-3.5 py-2.5 text-[13.5px] text-[#3f3b2f] whitespace-nowrap">{b.contact || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'gen' && (
            <div className="flex flex-col gap-5">
              <div className="bg-[#fffdf8] border border-parish-border rounded-2xl px-[22px] py-[22px] shadow-cardSm" style={{ padding: '22px 24px' }}>
                <div className="font-serif text-[21px] font-semibold text-parish-navy mb-1">Build a report</div>
                <p className="text-[13px] text-parish-muted mb-[18px]" style={{ marginBottom: '18px' }}>Choose a data source, a report type, then narrow the scope before generating.</p>

                <div className="grid gap-3.5 mb-[18px]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
                  <div>
                    <div className="font-semibold text-[12px] text-parish-ink mb-1.5">1. Data source</div>
                    <FilterSelect value={genSource} onChange={(e) => { setGenSource(e.target.value); setGenType(''); setReport(null); }} className="w-full">
                      <option value="">Select a data source…</option>
                      <option value="Members">Members</option><option value="Households">Households</option>
                    </FilterSelect>
                  </div>
                  {genSource && (
                    <div>
                      <div className="font-semibold text-[12px] text-parish-ink mb-1.5">2. Report</div>
                      <FilterSelect value={genType} onChange={(e) => { setGenType(e.target.value); setReport(null); }} className="w-full">
                        <option value="">Select a report…</option>
                        {genSource === 'Members' && ['By GKK', 'By Sacrament', 'By Ministry / Organization'].map((t) => <option key={t} value={t}>{t}</option>)}
                        {genSource === 'Households' && ['By Status', 'By GKK'].map((t) => <option key={t} value={t}>{t}</option>)}
                      </FilterSelect>
                    </div>
                  )}
                </div>

                {genType && (
                  <div className="border-t border-[#f0e8d6] pt-4 mb-4">
                    <div className="font-semibold text-[12px] text-parish-ink mb-2.5">3. Scope</div>
                    <div className="flex flex-wrap gap-3.5 items-end">
                      {meta.gkk && (
                        <div>
                          <div className="font-semibold text-[11px] text-parish-muted mb-1.5">GKK</div>
                          <FilterSelect value={scope.gkk} onChange={(e) => setScope((s) => ({ ...s, gkk: e.target.value }))}>
                            <option value="All">All GKKs</option>
                            {gkkOptions.map((g) => <option key={g} value={g}>{g}</option>)}
                          </FilterSelect>
                        </div>
                      )}
                      {meta.dateRange && (
                        <>
                          <div><div className="font-semibold text-[11px] text-parish-muted mb-1.5">Registered from</div><input type="date" value={scope.dateFrom} onChange={(e) => setScope((s) => ({ ...s, dateFrom: e.target.value }))} className="px-3 py-2.5 text-[13.5px] bg-[#fdfbf6] border-[1.5px] border-parish-borderSoft rounded-lg outline-none" /></div>
                          <div><div className="font-semibold text-[11px] text-parish-muted mb-1.5">Registered to</div><input type="date" value={scope.dateTo} onChange={(e) => setScope((s) => ({ ...s, dateTo: e.target.value }))} className="px-3 py-2.5 text-[13.5px] bg-[#fdfbf6] border-[1.5px] border-parish-borderSoft rounded-lg outline-none" /></div>
                        </>
                      )}
                      {meta.sacrament && genType === 'By Sacrament' && (
                        <div>
                          <div className="font-semibold text-[11px] text-parish-muted mb-1.5">Sacrament</div>
                          <FilterSelect value={scope.sacrament} onChange={(e) => setScope((s) => ({ ...s, sacrament: e.target.value }))}>
                            {['Baptism', 'Communion', 'Confirmation', 'Matrimony'].map((s) => <option key={s} value={s}>{s}</option>)}
                          </FilterSelect>
                        </div>
                      )}
                      {meta.group && genType === 'By Ministry / Organization' && (
                        <div>
                          <div className="font-semibold text-[11px] text-parish-muted mb-1.5">Ministry / Organization</div>
                          <FilterSelect value={scope.group} onChange={(e) => setScope((s) => ({ ...s, group: e.target.value }))}>
                            <option value="">Select…</option>{ministryOptions.map((g) => <option key={g} value={g}>{g}</option>)}
                          </FilterSelect>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <PrimaryButton onClick={generate} disabled={!genType} className="px-[22px] py-2.5 text-[14px]">Generate Report</PrimaryButton>
              </div>

              {report && (
                <div className="bg-[#fffdf8] border border-parish-border rounded-2xl px-[22px] py-[22px] shadow-cardSm" style={{ padding: '22px 24px' }}>
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                    <div className="font-serif text-[21px] font-semibold text-parish-navy">{report.title}</div>
                    <div className="flex gap-2">
                      <GhostButton onClick={() => window.print()} className="px-3.5 py-2 text-[12.5px] !text-parish-text2 !border-transparent bg-[#f4efe3]">Print</GhostButton>
                      <button onClick={exportGenerated} className="appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-white bg-parish-blue rounded-lg">Export CSV</button>
                    </div>
                  </div>
                  <p className="text-[13px] text-parish-muted mb-4">{report.meta}</p>
                  {report.empty && <div className="py-7 px-4 text-center text-parish-muted text-[14px]">No records match this scope.</div>}
                  {!report.empty && (
                    <div className="border border-[#f0e8d6] rounded-xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse" style={{ minWidth: 560 }}>
                          <thead><tr className="bg-[#f4efe3]">{report.columns.map((c) => <th key={c} className="text-left px-3.5 py-2.5 font-bold text-[11.5px] tracking-wide uppercase text-parish-text2 whitespace-nowrap">{c}</th>)}</tr></thead>
                          <tbody>
                            {report.rows.map((row, i) => (
                              <tr key={i} className="border-t border-[#f1e8d5]">
                                {row.cells.map((cell, j) => <td key={j} className="px-3.5 py-2.5 text-[13.5px] text-[#3f3b2f] whitespace-nowrap">{cell}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
