import React, { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { PageHeader, PageBody, ErrorState, LoadingState, Panel } from '../../components/admin.jsx';
import { useAsyncData } from '../../hooks.js';
import { useAuth } from '../../AuthContext.jsx';
import { can, leaderGkk } from '../../lib/access.js';
import { todayItems } from '../../lib/today.js';
import { gkkSlices } from '../../lib/stats.js';
import { todayIso } from '../../lib/website.js';

const CARD = 'bg-parish-card border border-parish-border rounded-2xl shadow-cardSm';
const LINK_FOCUS = 'no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-parish-blue';

/** A card or row that opens the matching filtered list, or a plain block when there's nowhere to go. */
function MaybeLink({ to, className, children, label }) {
  if (!to) return <div className={className}>{children}</div>;
  return <Link to={to} aria-label={label} className={`${className} ${LINK_FOCUS} block hover:border-parish-focusLine hover:shadow-card transition`}>{children}</Link>;
}

function StatCard({ label, value, note, accent, to }) {
  return (
    <MaybeLink to={to} label={`${label}: ${value}. Open the list`} className={`${CARD} px-[18px] py-4 min-w-0`}>
      <div className="flex items-center gap-2 mb-2.5" style={{ color: accent }}>
        <span className="w-2 h-2 rounded-full" style={{ background: accent }} />
        <span className="font-semibold text-[12px] tracking-wide uppercase text-parish-muted">{label}</span>
      </div>
      <div className="font-serif text-[38px] font-semibold leading-none text-parish-navy">{value}</div>
      <div className="text-[12.5px] text-parish-muted mt-1.5">{note}</div>
    </MaybeLink>
  );
}

function Bars({ data, color1, color2, linkLabel }) {
  return (
    <div className="flex items-end gap-3.5 h-[150px]">
      {data.map((b) => {
        const bar = (
          <>
            <div className="font-bold text-[13px]" style={{ color: color2 }}>{b.n}</div>
            <div className="w-full max-w-[38px] rounded-t-lg transition-all duration-500" style={{ height: b.h, minHeight: 4, background: `linear-gradient(180deg,${color1},${color2})` }} />
            <div className="font-semibold text-[12px] text-parish-muted text-center">{b.label}</div>
          </>
        );
        const cls = 'flex-1 flex flex-col items-center gap-2 h-full justify-end';
        return b.to
          ? <Link key={b.label} to={b.to} aria-label={linkLabel ? linkLabel(b) : undefined} className={`${cls} rounded-lg hover:bg-parish-hover ${LINK_FOCUS}`}>{bar}</Link>
          : <div key={b.label} className={cls}>{bar}</div>;
      })}
    </div>
  );
}

function BreakdownBars({ data, color1, color2 }) {
  return (
    <div className="flex flex-col gap-3.5">
      {data.map((g) => {
        const bar = (
          <>
            <div className="flex justify-between text-[13px] mb-1.5"><span className="text-parish-text3 font-semibold">{g.label}</span><span className="text-parish-muted">{g.n}</span></div>
            <div className="h-2.5 bg-parish-track rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: g.w, background: `linear-gradient(90deg,${color1},${color2})` }} />
            </div>
          </>
        );
        return g.to
          ? <Link key={g.label} to={g.to} className={`block rounded-lg -mx-1.5 px-1.5 py-1 hover:bg-parish-hover ${LINK_FOCUS}`}>{bar}</Link>
          : <div key={g.label}>{bar}</div>;
      })}
    </div>
  );
}

const SLICE_COLORS = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)', 'var(--viz-6)', 'var(--viz-7)', 'var(--viz-8)'];

/**
 * Members by GKK as a donut: the eight largest GKKs and "Other", each in a
 * legend with its count and share (so no slice relies on colour alone), and
 * every GKK in the list under it. Hovering or focusing a slice or legend row
 * shows it in the middle. `unit` is "members", or "households" before 0078.
 */
function GkkDonut({ rows, unit }) {
  const [active, setActive] = useState(null);
  const { total, slices, all } = gkkSlices(rows, SLICE_COLORS.length);
  if (!total) return <div className="text-parish-muted text-sm">No GKK data yet.</div>;
  const colorOf = (i, s) => (s.other ? 'var(--viz-other)' : SLICE_COLORS[i % SLICE_COLORS.length]);
  const R = 70;
  const C = 2 * Math.PI * R;
  const gap = slices.length > 1 ? 2 : 0; // a 2px surface gap between slices
  let start = 0;
  const arcs = slices.map((s, i) => {
    const len = (C * s.n) / total;
    const arc = { s, i, from: start, len: Math.max(0, len - gap) };
    start += len;
    return arc;
  });
  const shown = active == null ? null : slices[active];
  const on = (i) => ({ onMouseEnter: () => setActive(i), onMouseLeave: () => setActive(null), onFocus: () => setActive(i), onBlur: () => setActive(null) });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <svg viewBox="0 0 180 180" width="180" height="180" className="flex-none mx-auto sm:mx-0" role="img" aria-label={`${unit} by GKK: ${slices.map((s) => `${s.label} ${s.n}`).join(', ')}`}>
          <circle cx="90" cy="90" r={R} fill="none" stroke="rgb(var(--c-track))" strokeWidth="26" />
          {arcs.map(({ s, i, from, len }) => (
            <circle
              key={s.label} cx="90" cy="90" r={R} fill="none" stroke={colorOf(i, s)} strokeWidth={active === i ? 30 : 26}
              strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-from} transform="rotate(-90 90 90)"
              style={{ opacity: active == null || active === i ? 1 : 0.35, transition: 'opacity .15s, stroke-width .15s', cursor: 'pointer' }}
              {...on(i)}
            >
              <title>{`${s.label}: ${s.n} ${unit} (${s.share}%)`}</title>
            </circle>
          ))}
          <text x="90" y={shown ? 84 : 88} textAnchor="middle" fontSize="26" fontWeight="700" fill="rgb(var(--c-ink))" style={{ fontVariantNumeric: 'lining-nums' }}>{shown ? shown.n : total}</text>
          <text x="90" y={shown ? 102 : 108} textAnchor="middle" fontSize="11" fill="rgb(var(--c-muted))">{shown ? `${shown.share}% of ${unit}` : unit}</text>
        </svg>

        <ol className="list-none m-0 p-0 flex-1 min-w-[220px] flex flex-col gap-0.5">
          {slices.map((s, i) => {
            const row = (
              <span className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg ${active === i ? 'bg-parish-hover' : ''}`}>
                <span className="w-3 h-3 rounded-[3px] flex-none" style={{ background: colorOf(i, s) }} aria-hidden />
                <span className="flex-1 min-w-0 text-[13px] leading-snug text-parish-text3 font-semibold" title={s.other ? s.other.join(', ') : s.label}>{s.label}</span>
                <span className="text-[13px] text-parish-ink font-semibold tabular-nums">{s.n}</span>
                <span className="w-[38px] text-right text-[12px] text-parish-muted tabular-nums">{s.share}%</span>
              </span>
            );
            return (
              <li key={s.label} {...on(i)}>
                {s.to ? <Link to={s.to} className={`block rounded-lg ${LINK_FOCUS}`} aria-label={`${s.label}: ${s.n} ${unit}, ${s.share}%. Open the list`}>{row}</Link> : <div tabIndex={0} className={`rounded-lg ${LINK_FOCUS}`}>{row}</div>}
              </li>
            );
          })}
        </ol>
      </div>

      {slices.some((s) => s.other) && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-parish-blue list-none">
            <span className="group-open:hidden">Show all {all.length} GKKs</span><span className="hidden group-open:inline">Hide the full list</span>
          </summary>
          <ol className="list-none m-0 mt-2 p-0 grid grid-cols-1 gap-x-6 gap-y-0.5 sm:grid-cols-2">
            {all.map((g, k) => (
              <li key={g.label} className="min-w-0">
                <Link to={g.to} className={`flex items-baseline gap-2 px-2 py-1 rounded-lg hover:bg-parish-hover text-[12.5px] ${LINK_FOCUS}`}>
                  <span className="w-5 text-right text-parish-muted tabular-nums">{k + 1}.</span>
                  <span className="flex-1 min-w-0 truncate text-parish-text3" title={g.label}>{g.label}</span>
                  <span className="font-semibold text-parish-ink tabular-nums">{g.n}</span>
                  <span className="w-[34px] text-right text-parish-muted tabular-nums">{g.share}%</span>
                </Link>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

const TONE_DOT = { gold: 'var(--p-gold)', blue: 'var(--p-blue)', red: 'rgb(var(--c-error))', green: 'rgb(var(--c-ok-text))' };

/**
 * What's waiting today: households and sacraments to verify, requests, census, the week's
 * events and bulletin. Each part loads on its own and is left out quietly if
 * it can't be (an account without access, or a migration not run yet).
 */
function TodayPanel({ counts }) {
  const { user } = useAuth();
  const [census, setCensus] = useState(null);
  const [site, setSite] = useState({ events: [], bulletins: [] });

  useEffect(() => {
    if (!can(user, 'census')) return;
    api.listCensusCycles()
      .then((cycles) => {
        const open = cycles.find((c) => c.status === 'Open');
        if (open) return api.censusHouseholdProgressCounts(open.id).then((c) => setCensus({ label: open.label, counts: c }));
      })
      .catch(() => {});
  }, [user]);
  useEffect(() => {
    if (!can(user, 'website')) return;
    Promise.all([api.listEvents().catch(() => ({ rows: [] })), api.listBulletins().catch(() => ({ rows: [] }))])
      .then(([e, b]) => setSite({ events: e.rows || [], bulletins: b.rows || [] }));
  }, [user]);

  if (!counts) return null;
  const items = todayItems({ user, counts, census, ...site, today: todayIso() });
  return (
    <Panel className="px-[22px] py-5 mb-[18px]">
      <h2 className="font-serif text-[20px] font-semibold text-parish-navy m-0 mb-0.5">Today</h2>
      <div className="text-[12.5px] text-parish-muted mb-3">What's waiting for the parish office</div>
      {!items.length && <div className="text-[13.5px] text-parish-muted py-1">All caught up. Nothing is waiting.</div>}
      {!!items.length && (
        <ul className="list-none m-0 p-0 grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(min(280px,100%),1fr))' }}>
          {items.map((it) => (
            <li key={it.key}>
              <Link to={it.to} className={`flex items-start gap-3 h-full px-3.5 py-3 rounded-xl border border-parish-line2 bg-parish-field hover:border-parish-focusLine ${LINK_FOCUS}`}>
                {it.n
                  ? <span className="min-w-[30px] h-[30px] px-1.5 rounded-full flex items-center justify-center font-bold text-[13px] text-white flex-none" style={{ background: TONE_DOT[it.tone] }}>{it.n}</span>
                  : <span className="w-2.5 h-2.5 mt-1.5 mx-2.5 rounded-full flex-none" style={{ background: TONE_DOT[it.tone] }} aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-[14px] text-parish-navy">{it.label}</span>
                  {it.detail && <span className="block text-[12.5px] text-parish-muted truncate">{it.detail}</span>}
                  {it.progress !== undefined && (
                    <span className="block h-1.5 mt-2 bg-parish-track rounded-full overflow-hidden" aria-hidden>
                      <span className="block h-full rounded-full bg-[#2f7a52]" style={{ width: `${Math.round(it.progress * 100)}%` }} />
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export default function Dashboard() {
  const { data: stats, loading, error, reload } = useAsyncData(() => api.dashboardStats(), []);
  const layout = useOutletContext();
  // A GKK leader's totals are their GKK's (row rules, 0014).
  const gkk = leaderGkk(useAuth().user);

  if (!stats) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle={gkk ? `${gkk} overview` : 'Parish registry overview'} />
        <PageBody>
          {error && !loading ? <ErrorState message={error} onRetry={reload} /> : <LoadingState label="Loading dashboard…" />}
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Dashboard" subtitle={gkk ? `${gkk} overview` : 'Parish registry overview'} />
      <PageBody>
        <div className="grid gap-3.5 mb-[22px]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(150px,100%),1fr))', marginBottom: '22px' }}>
          {stats.statCards.map((c) => <StatCard key={c.label} {...c} />)}
        </div>

        {stats.duplicateGroups > 0 && (
          <Link to="/admin/duplicates" className={`flex items-center gap-3 mb-[18px] px-[18px] py-3.5 rounded-2xl border border-parish-warnBorder bg-parish-warnBg text-parish-warnStrong hover:border-parish-warnBorder ${LINK_FOCUS}`}>
            <span className="w-8 h-8 rounded-full bg-parish-warnTint flex items-center justify-center font-bold flex-none" aria-hidden>!</span>
            <span className="flex-1 text-[14px]">
              <strong>Possible duplicates: {stats.duplicateGroups}</strong> group{stats.duplicateGroups === 1 ? '' : 's'} of members share a name and date of birth.
            </span>
            <span className="font-semibold text-[13px] whitespace-nowrap">Review →</span>
          </Link>
        )}

        <TodayPanel counts={layout?.navCounts} />

        <div className="grid gap-[18px] mb-[18px]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(320px,100%),1fr))' }}>
          <Panel className="px-[22px] py-5">
            {/* Members per GKK from 0078; before it, the household counts the dashboard stats give. */}
            <div className="font-serif text-[20px] font-semibold text-parish-navy mb-[18px]">{stats.gkkMembers ? 'Members by GKK' : 'Households by GKK'}</div>
            <GkkDonut
              unit={stats.gkkMembers ? 'members' : 'households'}
              rows={stats.gkkMembers
                ? stats.gkkMembers.map((g) => ({ ...g, to: `/admin/members?gkk=${encodeURIComponent(g.label)}` }))
                : stats.gkkBreak}
            />
          </Panel>
          <Panel className="px-[22px] py-5">
            <div className="font-serif text-[20px] font-semibold text-parish-navy mb-[18px]">Top ministries &amp; organizations</div>
            {stats.ministryBreak.length ? <BreakdownBars data={stats.ministryBreak} color1="var(--p-gold)" color2="#e0bd6d" /> : <div className="text-parish-muted text-sm">No participation data yet.</div>}
          </Panel>
        </div>

        <div className="grid gap-[18px]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(320px,100%),1fr))' }}>
          <Panel className="px-[22px] py-5">
            <div className="font-serif text-[20px] font-semibold text-parish-navy mb-0.5">Registrations over time</div>
            <div className="text-[12.5px] text-parish-muted mb-5">Members enrolled per month</div>
            <Bars data={stats.regMonths} color1="var(--p-blue-light)" color2="var(--p-blue)" />
          </Panel>
          <Panel className="px-[22px] py-5">
            <div className="font-serif text-[20px] font-semibold text-parish-navy mb-0.5">Age distribution</div>
            <div className="text-[12.5px] text-parish-muted mb-5">All registered members</div>
            <Bars data={stats.ageBuckets} color1="#e0bd6d" color2="var(--p-gold)" linkLabel={(b) => `Ages ${b.label}: ${b.n} members. Open the members list`} />
          </Panel>
        </div>

        <Panel className="px-[22px] py-5 mt-[18px]">
          <div className="font-serif text-[20px] font-semibold text-parish-navy mb-4">Members by sacrament received</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))' }}>
            {stats.sacStats.map((s) => (
              <MaybeLink key={s.label} to={s.to} label={`${s.label}: ${s.n} members. Open the sacraments list`} className="border border-parish-line2 rounded-xl px-3.5 py-3.5 bg-parish-field text-center">
                <div className="font-serif text-[30px] font-semibold text-parish-blue leading-none">{s.n}</div>
                <div className="text-[12.5px] text-parish-text2 mt-1.5 font-semibold">{s.label}</div>
              </MaybeLink>
            ))}
          </div>
        </Panel>
      </PageBody>
    </>
  );
}
