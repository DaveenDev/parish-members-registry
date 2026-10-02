import React, { useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { api, triggerDownload } from '../../api.js';
import { PageHeader, PageBody, FilterSelect, SearchInput, Pagination, ErrorState, LoadingState, Tabs, Panel } from '../../components/admin.jsx';
import { useAsyncData, useClientList } from '../../hooks.js';
import { PrimaryButton, GhostButton } from '../../components/ui.jsx';
import { ReportPrintSheet } from '../../components/PrintSheet.jsx';
import ActivenessReport from '../../components/ActivenessReport.jsx';
import { useToast } from '../../ToastContext.jsx';
import { useAuth } from '../../AuthContext.jsx';
import { can } from '../../lib/access.js';

function Bar({ label, right, w, color }) {
  return (
    <div>
      <div className="flex justify-between text-[13.5px] mb-1.5"><span className="text-parish-text3 font-semibold">{label}</span><span className="text-parish-muted">{right}</span></div>
      <div className="h-2.5 bg-parish-track rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: w, background: color }} />
      </div>
    </div>
  );
}

function SplitBar({ label, right, vw, pw }) {
  return (
    <div>
      <div className="flex justify-between text-[13.5px] mb-1.5"><span className="text-parish-text3 font-semibold">{label}</span><span className="text-parish-muted">{right}</span></div>
      <div className="h-2.5 bg-parish-track rounded-full overflow-hidden flex">
        <div className="h-full" style={{ width: vw, background: 'rgb(var(--c-ok-text))' }} />
        <div className="h-full" style={{ width: pw, background: 'var(--p-gold)' }} />
      </div>
    </div>
  );
}

const REPORT_TABS = [['stats', 'Report Stats'], ['gen', 'Generate Report'], ['analysis', 'Analysis Report']];

// Each data source, its reports, and which scope controls a report shows.
const REPORTS = {
  Members: { types: ['By GKK', 'By Sacrament', 'By Ministry / Organization'] },
  Households: { types: ['By Status', 'By GKK', 'By registration month'] },
  Sacraments: { types: ['Verification progress by GKK'] },
  Census: { types: ['Results by GKK', 'Members not confirmed'], need: 'census' },
  Requests: { types: ['Certificate turnaround'], need: 'requests' },
};
function scopeFor(source, type) {
  return {
    gkk: ['Members', 'Households', 'Sacraments'].includes(source) || type === 'Members not confirmed',
    status: type === 'By Status',
    dateRange: source === 'Households' || source === 'Requests',
    sacrament: type === 'By Sacrament',
    group: type === 'By Ministry / Organization',
    cycle: source === 'Census',
  };
}

export default function Reports() {
  const toast = useToast();
  const layout = useOutletContext();
  const [params, setParams] = useSearchParams();
  const tab = REPORT_TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : REPORT_TABS[0][0];
  const setTab = (k) => setParams(k === REPORT_TABS[0][0] ? {} : { tab: k }, { replace: true });
  const { data: stats, loading: statsLoading, error: statsError, reload: reloadStats } = useAsyncData(() => api.reportStats(), []);

  const [genSource, setGenSource] = useState('');
  const [genType, setGenType] = useState('');
  const [scope, setScope] = useState({ gkk: 'All', status: 'All', dateFrom: '', dateTo: '', sacrament: 'Baptism', group: '', cycleId: '' });
  const [cycles, setCycles] = useState([]);
  const { user } = useAuth();
  const [ministryOptions, setMinistryOptions] = useState([]);
  const [gkkOptions, setGkkOptions] = useState([]);
  const [report, setReport] = useState(null);
  const [generating, setGenerating] = useState(false);
  const reportList = useClientList(report?.rows || [], (row) => row.cells.join(' '));

  useEffect(() => {
    Promise.all([api.listMinistries(), api.listOrganizations()])
      .then(([m, o]) => setMinistryOptions([...m.rows.map((x) => x.name), ...o.rows.map((x) => x.name)]))
      .catch(() => {});
  }, []);
  useEffect(() => { api.listGkks().then((r) => setGkkOptions(r.rows.map((g) => g.name))).catch(() => {}); }, []);
  useEffect(() => {
    if (genSource !== 'Census' || cycles.length) return;
    api.listCensusCycles()
      .then((list) => { setCycles(list); if (list[0]) setScope((s) => ({ ...s, cycleId: s.cycleId || String(list[0].id) })); })
      .catch(() => {});
  }, [genSource]);

  async function generate() {
    setGenerating(true);
    try {
      setReport(await api.generateReport({ source: genSource, type: genType, ...scope }));
    } catch (e) {
      toast.error(e.message || 'Could not generate this report');
    } finally {
      setGenerating(false);
    }
  }
  async function exportGenerated() {
    if (!report) return;
    try {
      const blob = await api.exportGenerated({ title: report.title, columns: report.csvColumns, rows: report.rows });
      triggerDownload(blob, `${report.title.toLowerCase().replace(/\s+/g, '-')}.csv`);
    } catch (e) {
      toast.error(e.message || 'Could not export this report');
    }
  }

  const meta = scopeFor(genSource, genType);
  const sources = Object.keys(REPORTS).filter((k) => !REPORTS[k].need || can(user, REPORTS[k].need));

  return (
    <>
      <PageHeader title="Reports" subtitle="Registry statistics, custom reports & analysis" />
      <PageBody>
        <div className="max-w-[920px]">
          <Tabs tabs={REPORT_TABS} value={tab} onChange={setTab} />

          {tab === 'stats' && !stats && (
            statsError && !statsLoading
              ? <ErrorState message={statsError} onRetry={reloadStats} />
              : <LoadingState label="Loading report stats…" />
          )}

          {tab === 'stats' && stats && (
            <div className="flex flex-col gap-5">
              <Panel className="px-6 py-[22px]">
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <div className="font-serif text-[21px] font-semibold text-parish-navy">Registration Status by GKK</div>
                  <div className="text-[13px] text-parish-muted">{stats.totalVerified} verified · {stats.totalPending} pending of {stats.totalHH} households</div>
                </div>
                <p className="text-[13px] text-parish-muted mb-[18px]" style={{ marginBottom: '18px' }}>Households confirmed vs. awaiting verification, broken down by Basic Ecclesial Community.</p>
                <div className="flex flex-col gap-3.5">
                  {stats.regByGkk.map((g) => <SplitBar key={g.label} label={g.label} right={`${g.verified} verified · ${g.pending} pending`} vw={g.vw} pw={g.pw} />)}
                </div>
              </Panel>

              <Panel className="px-6 py-[22px]">
                <div className="font-serif text-[21px] font-semibold text-parish-navy mb-1">Sacramental Completion</div>
                <p className="text-[13px] text-parish-muted mb-[18px]" style={{ marginBottom: '18px' }}>Share of all {stats.totalMembers} registered members who have received each sacrament.</p>
                <div className="flex flex-col gap-3.5">
                  {stats.sacCompletion.map((s) => <Bar key={s.label} label={s.label} right={`${s.n} received · ${s.missing} not yet recorded`} w={s.w} color="linear-gradient(90deg,var(--p-blue),var(--p-blue-light))" />)}
                </div>
              </Panel>

              <Panel className="px-6 py-[22px]">
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <div className="font-serif text-[21px] font-semibold text-parish-navy">Ministry &amp; Organization Participation</div>
                  <div className="text-[13px] text-parish-muted">{stats.anyVolunteer}% of members serve in at least one</div>
                </div>
                <p className="text-[13px] text-parish-muted mb-[18px]" style={{ marginBottom: '18px' }}>Full roster counts across every ministry and organization.</p>
                <div className="grid gap-x-6 gap-y-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(380px,1fr))' }}>
                  {stats.participation.map((p) => <Bar key={p.label} label={p.label} right={p.n} w={p.w} color={p.color} />)}
                </div>
              </Panel>

              <Panel className="px-6 py-[22px]">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                  <div className="font-serif text-[21px] font-semibold text-parish-navy">Blood types</div>
                  <Link to="/admin/blood" className="px-3.5 py-2 font-semibold text-[12.5px] text-white bg-parish-fill rounded-lg no-underline">Open Blood Types page →</Link>
                </div>
                <p className="text-[13px] text-parish-muted mb-4">The directory for finding blood donors now has its own page, with search, filters and click-to-call. {stats.unknownBlood} member(s) have no blood type on file.</p>
                <div className="flex flex-wrap gap-2">
                  {stats.bloodCounts.map((b) => <span key={b.label} className="font-bold text-[12.5px] bg-parish-errorBg text-parish-error px-3.5 py-1.5 rounded-full">{b.label} · {b.n}</span>)}
                </div>
              </Panel>
            </div>
          )}

          {tab === 'analysis' && <ActivenessReport parish={layout?.parish} />}

          {tab === 'gen' && (
            <div className="flex flex-col gap-5">
              <Panel className="px-6 py-[22px]">
                <div className="font-serif text-[21px] font-semibold text-parish-navy mb-1">Build a report</div>
                <p className="text-[13px] text-parish-muted mb-[18px]" style={{ marginBottom: '18px' }}>Choose a data source, a report type, then narrow the scope before generating.</p>

                <div className="grid gap-3.5 mb-[18px]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
                  <div>
                    <div className="font-semibold text-[12px] text-parish-ink mb-1.5">1. Data source</div>
                    <FilterSelect value={genSource} onChange={(e) => { setGenSource(e.target.value); setGenType(''); setReport(null); }} className="w-full">
                      <option value="">Select a data source…</option>
                      {sources.map((k) => <option key={k} value={k}>{k}</option>)}
                    </FilterSelect>
                  </div>
                  {genSource && (
                    <div>
                      <div className="font-semibold text-[12px] text-parish-ink mb-1.5">2. Report</div>
                      <FilterSelect value={genType} onChange={(e) => { setGenType(e.target.value); setReport(null); }} className="w-full">
                        <option value="">Select a report…</option>
                        {(REPORTS[genSource]?.types || []).map((t) => <option key={t} value={t}>{t}</option>)}
                      </FilterSelect>
                    </div>
                  )}
                </div>

                {genType && (
                  <div className="border-t border-parish-line2 pt-4 mb-4">
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
                      {meta.cycle && (
                        <div>
                          <div className="font-semibold text-[11px] text-parish-muted mb-1.5">Census</div>
                          <FilterSelect value={scope.cycleId} onChange={(e) => setScope((s) => ({ ...s, cycleId: e.target.value }))}>
                            {!cycles.length && <option value="">No census yet</option>}
                            {cycles.map((c) => <option key={c.id} value={c.id}>{c.label}{c.status === 'Open' ? ' (open)' : ''}</option>)}
                          </FilterSelect>
                        </div>
                      )}
                      {meta.status && (
                        <div>
                          <div className="font-semibold text-[11px] text-parish-muted mb-1.5">Status</div>
                          <FilterSelect value={scope.status} onChange={(e) => setScope((s) => ({ ...s, status: e.target.value }))}>
                            <option value="All">All statuses</option><option value="Verified">Verified</option><option value="Pending">Pending</option>
                          </FilterSelect>
                        </div>
                      )}
                      {meta.dateRange && (
                        <>
                          <div><div className="font-semibold text-[11px] text-parish-muted mb-1.5">{genSource === 'Requests' ? 'Received from' : 'Registered from'}</div><input type="date" value={scope.dateFrom} onChange={(e) => setScope((s) => ({ ...s, dateFrom: e.target.value }))} className="px-3 py-2.5 text-[13.5px] bg-parish-field border-[1.5px] border-parish-borderSoft rounded-lg outline-none" /></div>
                          <div><div className="font-semibold text-[11px] text-parish-muted mb-1.5">{genSource === 'Requests' ? 'Received to' : 'Registered to'}</div><input type="date" value={scope.dateTo} onChange={(e) => setScope((s) => ({ ...s, dateTo: e.target.value }))} className="px-3 py-2.5 text-[13.5px] bg-parish-field border-[1.5px] border-parish-borderSoft rounded-lg outline-none" /></div>
                        </>
                      )}
                      {meta.sacrament && (
                        <div>
                          <div className="font-semibold text-[11px] text-parish-muted mb-1.5">Sacrament</div>
                          <FilterSelect value={scope.sacrament} onChange={(e) => setScope((s) => ({ ...s, sacrament: e.target.value }))}>
                            {['Baptism', 'Communion', 'Confirmation', 'Matrimony'].map((s) => <option key={s} value={s}>{s}</option>)}
                          </FilterSelect>
                        </div>
                      )}
                      {meta.group && (
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

                <PrimaryButton onClick={generate} disabled={!genType || generating} className="px-[22px] py-2.5 text-[14px]">{generating ? 'Generating…' : 'Generate Report'}</PrimaryButton>
              </Panel>

              {report && (
                <Panel className="px-6 py-[22px]">
                  <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
                    <div className="font-serif text-[21px] font-semibold text-parish-navy">{report.title}</div>
                    <div className="flex gap-2">
                      <GhostButton onClick={() => window.print()} disabled={report.empty} className="px-3.5 py-2 text-[12.5px] !text-parish-text2 !border-transparent bg-parish-sunk">Print</GhostButton>
                      <button onClick={exportGenerated} className="appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-white bg-parish-fill rounded-lg">Export CSV</button>
                    </div>
                  </div>
                  <p className="text-[13px] text-parish-muted mb-4">{report.meta}</p>
                  {report.empty && <div className="py-7 px-4 text-center text-parish-muted text-[14px]">No records match this scope.</div>}
                  {!report.empty && (
                    <div className="mb-3.5">
                      <SearchInput placeholder="Search this report…" aria-label="Search report rows" value={reportList.query} onChange={(e) => reportList.setQuery(e.target.value)} />
                    </div>
                  )}
                  {!report.empty && !reportList.total && <div className="py-7 px-4 text-center text-parish-muted text-[14px]">No rows match “{reportList.query}”.</div>}
                  {!report.empty && !!reportList.total && (
                    <div className="border border-parish-line2 rounded-xl overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse" style={{ minWidth: 560 }}>
                          <thead><tr className="bg-parish-sunk">{report.columns.map((c) => <th key={c} className="text-left px-3.5 py-2.5 font-bold text-[11.5px] tracking-wide uppercase text-parish-text2 whitespace-nowrap">{c}</th>)}</tr></thead>
                          <tbody>
                            {reportList.rows.map((row, i) => (
                              <tr key={i} className="border-t border-parish-line">
                                {row.cells.map((cell, j) => <td key={j} className="px-3.5 py-2.5 text-[13.5px] text-parish-text3 whitespace-nowrap">{cell}</td>)}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Pagination page={reportList.page} pageSize={reportList.pageSize} total={reportList.total} onPage={reportList.setPage} onPageSize={reportList.setPageSize} />
                    </div>
                  )}
                </Panel>
              )}
            </div>
          )}
        </div>
      </PageBody>
      {tab === 'gen' && <ReportPrintSheet report={report} parish={layout?.parish} />}
    </>
  );
}
