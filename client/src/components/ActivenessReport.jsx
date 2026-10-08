import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, triggerDownload } from '../api.js';
import { FilterSelect, ErrorState, LoadingState, Panel } from './admin.jsx';
import { PrimaryButton, GhostButton, Badge } from './ui.jsx';
import { useToast } from '../ToastContext.jsx';
import { analyzeActiveness } from '../lib/activeness.js';
import { PRACTICE_TONES, practiceSourceText } from '../lib/practice.js';
import { toCsv } from '../lib/csv.js';

const COLORS = { Aktibo: 'rgb(var(--c-ok-text))', Panagsa: 'var(--p-gold)', 'Dili aktibo': 'rgb(var(--c-error))', Wala: 'rgb(var(--c-error))' };
const fullName = (m) => [m.first_name, m.last_name, m.suffix].filter(Boolean).join(' ');
const pctText = (n) => `${Math.round(n)}%`;

/** A bar split into Aktibo / Panagsa / Dili aktibo (or Wala) shares. */
function MixBar({ parts, className = 'h-2.5' }) {
  return (
    <div className={`bg-parish-track rounded-full overflow-hidden flex ${className}`} aria-hidden>
      {parts.map(([label, share]) => share > 0 && <div key={label} className="h-full" style={{ width: `${share}%`, background: COLORS[label] }} />)}
    </div>
  );
}

function Tile({ value, label, sub, tone }) {
  return (
    <div className="bg-parish-field border border-parish-line2 rounded-xl px-4 py-3">
      <div className="font-serif text-[30px] font-semibold leading-none" style={{ color: tone ? COLORS[tone] : 'var(--p-navy)' }}>{value}</div>
      <div className="font-semibold text-[12.5px] text-parish-ink mt-1.5">{label}</div>
      {sub && <div className="text-[11.5px] text-parish-muted">{sub}</div>}
    </div>
  );
}

function SectionTitle({ title, sub }) {
  return (
    <>
      <div className="font-serif text-[21px] font-semibold text-parish-navy mb-1">{title}</div>
      {sub && <p className="text-[13px] text-parish-muted m-0 mb-4">{sub}</p>}
    </>
  );
}

/** Rows of groups (GKKs, age groups) with their level mix and average. */
function GroupTable({ rows, nameOf, empty }) {
  if (!rows.some((r) => r.members)) return <div className="text-[13.5px] text-parish-muted">{empty}</div>;
  return (
    <div className="border border-parish-line2 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 640 }}>
          <thead>
            <tr className="bg-parish-sunk">
              {['', 'Rated', 'Average', 'Aktibo · Panagsa · Dili aktibo', 'No answers yet'].map((h, i) => (
                <th key={i} className={`px-3.5 py-2.5 font-bold text-[11.5px] tracking-wide uppercase text-parish-text2 whitespace-nowrap ${i === 0 ? 'text-left' : i === 3 ? 'text-left w-[40%]' : 'text-right'}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.filter((r) => r.members).map((r) => (
              <tr key={nameOf(r)} className="border-t border-parish-line">
                <td className="px-3.5 py-2.5 text-[13.5px] font-semibold text-parish-navy whitespace-nowrap">{nameOf(r)}</td>
                <td className="px-3.5 py-2.5 text-[13.5px] text-parish-text3 text-right">{r.rated}<span className="text-parish-muted"> / {r.members}</span></td>
                <td className="px-3.5 py-2.5 text-[13.5px] font-semibold text-parish-text3 text-right">{r.avgScore == null ? '—' : pctText(r.avgScore)}</td>
                <td className="px-3.5 py-2.5">
                  {r.rated ? (
                    <>
                      <MixBar parts={[['Aktibo', r.aktiboPct], ['Panagsa', r.panagsaPct], ['Dili aktibo', r.diliPct]]} />
                      <div className="text-[11.5px] text-parish-muted mt-1">{r.aktiboPct}% · {r.panagsaPct}% · {r.diliPct}%</div>
                    </>
                  ) : <span className="text-[12.5px] text-parish-muted">Not enough answers</span>}
                </td>
                <td className="px-3.5 py-2.5 text-[13.5px] text-parish-text3 text-right">{r.unassessed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Reports → Analysis Report: how active the parish's members are, from each
 * member's Practicing Catholic status. Scoped by GKK; printable; the
 * member-level data exports as CSV.
 */
export default function ActivenessReport({ parish }) {
  const toast = useToast();
  const [gkk, setGkk] = useState('All');
  const [gkkOptions, setGkkOptions] = useState([]);
  const [result, setResult] = useState(null); // { analysis, members, answers, scope, at }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.listGkks().then((r) => setGkkOptions(r.rows.map((g) => g.name))).catch(() => {}); }, []);

  async function generate(scope = gkk) {
    setLoading(true);
    setError('');
    try {
      const { members, answers } = await api.activenessData({ gkk: scope });
      setResult({ analysis: analyzeActiveness(members, (m) => answers.get(m.id)), members, scope, at: new Date() });
    } catch (e) {
      setError(e.message || 'Could not generate the analysis');
    } finally {
      setLoading(false);
    }
  }
  // The parish-wide analysis is ready when the tab opens.
  useEffect(() => { generate('All'); }, []);

  function exportCsv() {
    if (!result) return;
    const csv = toCsv(result.members, [
      { label: 'Member', value: fullName },
      { label: 'Household', value: (m) => m.household_name },
      { label: 'GKK', value: (m) => m.household_gkk || '' },
      { label: 'Age', value: (m) => m.age ?? '' },
      { label: 'Practicing Catholic', value: (m) => m.practice_level || '' },
      { label: 'Score (%)', value: (m) => (m.practice_score == null ? '' : Math.round(m.practice_score)) },
      { label: 'Participation (of 60)', value: (m) => m.practice_participation ?? '' },
      { label: 'Sacraments (of 25)', value: (m) => m.practice_sacraments ?? '' },
      { label: 'Involvement (of 15)', value: (m) => m.practice_involvement ?? '' },
      { label: 'Based on', value: (m) => (m.practice_source === 'census' ? m.practice_source_label || 'Census' : m.practice_source === 'registration' ? 'Own answers at registration' : m.practice_source === 'household' ? 'Household survey (estimate)' : '') },
      { label: 'Change since census before', value: (m) => (m.practice_trend == null ? '' : Math.round(m.practice_trend)) },
      { label: 'Census status', value: (m) => m.membership_status || '' },
      { label: 'Contact', value: (m) => m.contact || '' },
    ]);
    const name = result.scope === 'All' ? 'parish' : result.scope === 'None' ? 'no-gkk' : result.scope.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `membership-activeness-${name}.csv`);
    toast.success(`Exported ${result.members.length} member(s)`);
  }

  const a = result?.analysis;
  const scopeLabel = !result ? '' : result.scope === 'All' ? 'Whole parish' : result.scope === 'None' ? 'Households with no GKK' : result.scope;

  return (
    <div className="flex flex-col gap-5">
      <Panel className="px-6 py-[22px]">
        <SectionTitle title="Membership Activeness" sub="How active members are in parish life, from each member's Practicing Catholic status: their own census participation answers (or the household survey before their first census), their sacraments for their age, and their ministries and roles." />
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="font-semibold text-[11px] text-parish-muted mb-1.5">GKK</div>
            <FilterSelect value={gkk} onChange={(e) => setGkk(e.target.value)} aria-label="GKK">
              <option value="All">Whole parish</option>
              {gkkOptions.map((g) => <option key={g} value={g}>{g}</option>)}
              <option value="None">No GKK</option>
            </FilterSelect>
          </div>
          <PrimaryButton onClick={() => generate()} disabled={loading} className="px-[22px] py-2.5 text-[14px]">{loading ? 'Analyzing…' : 'Generate Analysis'}</PrimaryButton>
          {a && (
            <div className="ml-auto flex gap-2">
              <GhostButton onClick={() => window.print()} className="px-3.5 py-2 text-[12.5px] !text-parish-text2 !border-transparent bg-parish-sunk">Print</GhostButton>
              <button onClick={exportCsv} disabled={!result.members.length} className="appearance-none border-none cursor-pointer px-3.5 py-2 font-semibold text-[12.5px] text-white bg-parish-fill rounded-lg disabled:opacity-60">Export CSV</button>
            </div>
          )}
        </div>
      </Panel>

      {loading && !a && <Panel><LoadingState label="Analyzing members…" /></Panel>}
      {error && <Panel><ErrorState message={error} onRetry={() => generate()} /></Panel>}

      {a && (
        <>
          <Panel className="px-6 py-[22px]">
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
              <div className="font-serif text-[21px] font-semibold text-parish-navy">{scopeLabel}</div>
              <div className="text-[12.5px] text-parish-muted">{a.summary.members} current member(s) · generated {result.at.toLocaleString()}</div>
            </div>
            <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
              <Tile value={a.summary.avgScore == null ? '—' : pctText(a.summary.avgScore)} label="Average score" sub={`${a.summary.rated} rated member(s)`} />
              <Tile value={`${a.summary.aktiboPct}%`} label="Aktibo" sub={`${a.summary.aktibo} member(s) · 70%+`} tone="Aktibo" />
              <Tile value={`${a.summary.panagsaPct}%`} label="Panagsa" sub={`${a.summary.panagsa} member(s) · 40–69%`} tone="Panagsa" />
              <Tile value={`${a.summary.diliPct}%`} label="Dili aktibo" sub={`${a.summary.dili} member(s) · below 40%`} tone="Dili aktibo" />
            </div>
            {a.summary.rated > 0 && <MixBar className="h-3.5" parts={[['Aktibo', a.summary.aktiboPct], ['Panagsa', a.summary.panagsaPct], ['Dili aktibo', a.summary.diliPct]]} />}
            <div className="text-[12.5px] text-parish-muted mt-2.5">
              Not rated: {a.summary.unassessed} with no participation answers yet · {a.summary.children} under 7 · {a.summary.otherReligion} of another religion.
              {' '}{a.summary.ownAnswers} score(s) use the member's own census answers; {a.summary.estimated} are household estimates.
            </div>
          </Panel>

          <Panel className="px-6 py-[22px]">
            <SectionTitle title="Key findings" />
            <ul className="m-0 pl-5 flex flex-col gap-2 text-[14px] leading-relaxed text-parish-text3">
              {a.findings.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </Panel>

          {result.scope === 'All' && (
            <Panel className="px-6 py-[22px]">
              <SectionTitle title="By GKK" sub="The GKKs with the lowest average come first, so the ones that need a visit lead the list." />
              <GroupTable rows={a.byGkk} nameOf={(r) => r.gkk || 'No GKK'} empty="No members in any GKK yet." />
            </Panel>
          )}

          <Panel className="px-6 py-[22px]">
            <SectionTitle title="By age group" sub="Children under 7 aren't rated." />
            <GroupTable rows={a.byAge} nameOf={(r) => r.label} empty="No ages on record." />
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel className="px-6 py-[22px]">
              <SectionTitle title="Parts of the score" sub="Average of rated members, against the most each part can give." />
              <div className="flex flex-col gap-3.5">
                {a.parts.map((p) => (
                  <div key={p.key}>
                    <div className="flex justify-between text-[13.5px] mb-1.5"><span className="text-parish-text3 font-semibold">{p.label}</span><span className="text-parish-muted">{p.average == null ? '—' : `${Math.round(p.average)} of ${p.max} (${p.sharePct}%)`}</span></div>
                    <div className="h-2.5 bg-parish-track rounded-full overflow-hidden"><div className="h-full rounded-full bg-parish-blue" style={{ width: `${p.sharePct}%` }} /></div>
                    <div className="text-[11.5px] text-parish-muted mt-1">{p.note}</div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="px-6 py-[22px]">
              <SectionTitle title="Changes since the census before" sub="Members with answers in two censuses." />
              {a.trend.compared ? (
                <div className="grid grid-cols-3 gap-3">
                  <Tile value={a.trend.improved} label="More active" tone="Aktibo" />
                  <Tile value={a.trend.same} label="About the same" />
                  <Tile value={a.trend.declined} label="Less active" tone="Dili aktibo" />
                </div>
              ) : <div className="text-[13.5px] text-parish-muted">Shown once members have answers in two censuses.</div>}
            </Panel>
          </div>

          <Panel className="px-6 py-[22px]">
            <SectionTitle title="Participation by activity" sub="Rated members' answers for each activity: Aktibo · Panagsa · Wala." />
            <div className="grid gap-x-6 gap-y-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(320px,100%),1fr))' }}>
              {a.activities.map((x) => (
                <div key={x.key}>
                  <div className="flex justify-between text-[13.5px] mb-1.5"><span className="text-parish-text3 font-semibold">{x.label}</span><span className="text-parish-muted">{x.answered ? `${x.aktiboPct}% · ${x.panagsaPct}% · ${x.walaPct}%` : 'No answers'}</span></div>
                  <MixBar parts={[['Aktibo', x.aktiboPct], ['Panagsa', x.panagsaPct], ['Wala', x.walaPct]]} />
                </div>
              ))}
            </div>
          </Panel>

          <Panel className="px-6 py-[22px]">
            <SectionTitle title={`Needs a follow-up (${a.followUp.length})`} sub="Rated Dili aktibo, least active first: a list for GKK leaders' visits. The CSV export has every member." />
            {!a.followUp.length ? <div className="text-[13.5px] text-parish-muted">No member is rated Dili aktibo in this scope.</div> : (
              <MemberTable rows={a.followUp.slice(0, 50)} more={a.followUp.length - 50} />
            )}
          </Panel>

          {a.mismatches.length > 0 && (
            <Panel className="px-6 py-[22px]">
              <SectionTitle title={`Census status and score disagree (${a.mismatches.length})`} sub="Marked Active in the census but scored Dili aktibo, or the other way round. The census status is staff's own judgement; check the answers on file." />
              <MemberTable rows={a.mismatches.slice(0, 50)} more={a.mismatches.length - 50} showStatus />
            </Panel>
          )}

          <ActivenessPrintSheet result={result} scopeLabel={scopeLabel} parish={parish} />
        </>
      )}
    </div>
  );
}

function MemberTable({ rows, more, showStatus = false }) {
  return (
    <div className="border border-parish-line2 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: 640 }}>
          <thead>
            <tr className="bg-parish-sunk">
              {['Member', 'Household', 'GKK', 'Age', 'Score', ...(showStatus ? ['Census status'] : []), 'Contact'].map((h) => (
                <th key={h} className="text-left px-3.5 py-2.5 font-bold text-[11.5px] tracking-wide uppercase text-parish-text2 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-t border-parish-line">
                <td className="px-3.5 py-2.5 text-[13.5px] font-semibold text-parish-navy whitespace-nowrap">{fullName(m)}</td>
                <td className="px-3.5 py-2.5 text-[13.5px] text-parish-text3 whitespace-nowrap">{m.household_name}</td>
                <td className="px-3.5 py-2.5 text-[13.5px] text-parish-text3 whitespace-nowrap">{m.household_gkk || '—'}</td>
                <td className="px-3.5 py-2.5 text-[13.5px] text-parish-text3">{m.age ?? '—'}</td>
                <td className="px-3.5 py-2.5 whitespace-nowrap" title={practiceSourceText(m)}>
                  <Badge tone={PRACTICE_TONES[m.practice_level]}>{Math.round(m.practice_score)}% {m.practice_level}</Badge>
                  {m.practice_source === 'household' && <span className="text-[11px] text-parish-muted ml-1">est.</span>}
                </td>
                {showStatus && <td className="px-3.5 py-2.5 text-[13.5px] text-parish-text3 whitespace-nowrap">{m.membership_status}</td>}
                <td className="px-3.5 py-2.5 text-[13.5px] text-parish-text3 whitespace-nowrap">{m.contact || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {more > 0 && <div className="px-3.5 py-2.5 border-t border-parish-line text-[12.5px] text-parish-muted">…and {more} more in the CSV export.</div>}
    </div>
  );
}

/** The printed analysis: summary, findings and the group tables, in print-safe inline styles. */
function ActivenessPrintSheet({ result, scopeLabel, parish }) {
  const a = result.analysis;
  const cell = { padding: '4px 8px', borderBottom: '1px solid #e6dcc7', fontSize: 11, textAlign: 'left' };
  const head = { ...cell, fontWeight: 700, textTransform: 'uppercase', fontSize: 9.5, color: '#6b6552', borderBottom: '1.5px solid #1a2b4a' };
  const h2 = { fontSize: 14, fontWeight: 700, color: '#1a2b4a', margin: '16px 0 6px' };
  const groupRows = (rows, nameOf) => rows.filter((r) => r.members).map((r) => (
    <tr key={nameOf(r)} style={{ breakInside: 'avoid' }}>
      <td style={cell}>{nameOf(r)}</td><td style={cell}>{r.rated} / {r.members}</td><td style={cell}>{r.avgScore == null ? '—' : pctText(r.avgScore)}</td>
      <td style={cell}>{r.aktiboPct}%</td><td style={cell}>{r.panagsaPct}%</td><td style={cell}>{r.diliPct}%</td><td style={cell}>{r.unassessed}</td>
    </tr>
  ));
  const groupHead = (first) => <tr>{[first, 'Rated', 'Average', 'Aktibo', 'Panagsa', 'Dili aktibo', 'No answers'].map((h) => <th key={h} style={head}>{h}</th>)}</tr>;

  return createPortal(
    <div id="print-sheet" aria-hidden>
      <header style={{ display: 'flex', alignItems: 'center', gap: 16, borderBottom: '2px solid #1a2b4a', paddingBottom: 12, marginBottom: 12 }}>
        {parish?.logo && <img src={parish.logo} alt="" style={{ width: 52, height: 52, objectFit: 'contain' }} />}
        <div>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 600, color: '#1a2b4a' }}>{parish?.name || 'Our Lady of Guadalupe'}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1a2b4a', marginTop: 2 }}>Membership Activeness Analysis — {scopeLabel}</div>
          <div style={{ fontSize: 11, color: '#6b6552' }}>{a.summary.members} current member(s) · {a.summary.rated} rated · generated {result.at.toLocaleString()}</div>
        </div>
      </header>
      <div style={{ fontSize: 12, color: '#1a2b4a' }}>
        Average score <b>{a.summary.avgScore == null ? '—' : pctText(a.summary.avgScore)}</b> · Aktibo <b>{a.summary.aktiboPct}%</b> ({a.summary.aktibo}) · Panagsa <b>{a.summary.panagsaPct}%</b> ({a.summary.panagsa}) · Dili aktibo <b>{a.summary.diliPct}%</b> ({a.summary.dili})
      </div>
      <div style={h2}>Key findings</div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 11.5, lineHeight: 1.5 }}>{a.findings.map((f, i) => <li key={i}>{f}</li>)}</ul>
      {result.scope === 'All' && (
        <>
          <div style={h2}>By GKK</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead>{groupHead('GKK')}</thead><tbody>{groupRows(a.byGkk, (r) => r.gkk || 'No GKK')}</tbody></table>
        </>
      )}
      <div style={h2}>By age group</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}><thead>{groupHead('Age')}</thead><tbody>{groupRows(a.byAge, (r) => r.label)}</tbody></table>
      <div style={h2}>Parts of the score</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>{a.parts.map((p) => <tr key={p.key}><td style={cell}>{p.label}</td><td style={cell}>{p.average == null ? '—' : `${Math.round(p.average)} of ${p.max} (${p.sharePct}%)`}</td></tr>)}</tbody>
      </table>
      <div style={h2}>Participation by activity (Aktibo · Panagsa · Wala)</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>{a.activities.map((x) => <tr key={x.key}><td style={cell}>{x.label}</td><td style={cell}>{x.answered ? `${x.aktiboPct}% · ${x.panagsaPct}% · ${x.walaPct}%` : 'No answers'}</td></tr>)}</tbody>
      </table>
      {a.followUp.length > 0 && (
        <>
          <div style={h2}>Needs a follow-up ({a.followUp.length})</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', breakInside: 'auto' }}>
            <thead><tr>{['Member', 'Household', 'GKK', 'Age', 'Score', 'Contact'].map((h) => <th key={h} style={head}>{h}</th>)}</tr></thead>
            <tbody>
              {a.followUp.map((m) => (
                <tr key={m.id} style={{ breakInside: 'avoid' }}>
                  <td style={cell}>{fullName(m)}</td><td style={cell}>{m.household_name}</td><td style={cell}>{m.household_gkk || '—'}</td>
                  <td style={cell}>{m.age ?? '—'}</td><td style={cell}>{Math.round(m.practice_score)}%</td><td style={cell}>{m.contact || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>,
    document.body
  );
}
