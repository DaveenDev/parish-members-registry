import React, { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { api } from '../../api.js';
import { PageHeader, PageBody, ErrorState, LoadingState, Panel } from '../../components/admin.jsx';
import { useAsyncData } from '../../hooks.js';
import { daysAgo } from '../../constants.js';
import { useToast } from '../../ToastContext.jsx';
import { useAuth } from '../../AuthContext.jsx';
import { can } from '../../lib/access.js';
import { todayItems } from '../../lib/today.js';
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

const TONE_DOT = { gold: 'var(--p-gold)', blue: 'var(--p-blue)', red: 'rgb(var(--c-error))', green: 'rgb(var(--c-ok-text))' };

/**
 * What's waiting today: requests, census, sacraments to verify, the week's
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

/** The newest households still waiting for staff to verify them, with one-click Verify. */
function PendingQueue({ pendingCount, onVerified }) {
  const toast = useToast();
  const queue = useAsyncData(() => api.listHouseholds({ status: 'Pending', pageSize: 8 }), []);
  const [busyId, setBusyId] = useState(null);
  const { user } = useAuth();
  const canVerify = can(user, 'editRegistry');

  async function verify(h) {
    setBusyId(h.id);
    try {
      await api.updateHousehold(h.id, { status: 'Verified' });
      toast.success(`${h.household_name} marked Verified`);
      queue.reload();
      onVerified();
    } catch (e) {
      toast.error(e.message || 'Could not verify this household');
    } finally {
      setBusyId(null);
    }
  }

  const rows = queue.data?.rows || [];
  return (
    <Panel className="px-[22px] py-5 mb-[18px]">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-0.5">
        <h2 className="font-serif text-[20px] font-semibold text-parish-navy m-0">Awaiting verification</h2>
        {pendingCount > 0 && (
          <Link to="/admin/households?status=Pending" className="font-semibold text-[13px] text-parish-blue">View all {pendingCount} pending →</Link>
        )}
      </div>
      <div className="text-[12.5px] text-parish-muted mb-4">Newest registrations first. Check the details against the family before verifying.</div>
      {queue.loading && !queue.data && <LoadingState label="Loading pending households…" />}
      {queue.error && !queue.loading && <ErrorState message={queue.error} onRetry={queue.reload} />}
      {queue.data && !rows.length && <div className="text-[13.5px] text-parish-muted py-2">Nothing waiting. Every household has been verified.</div>}
      {!!rows.length && (
        <ul className="list-none m-0 p-0 flex flex-col divide-y divide-parish-line">
          {rows.map((h) => (
            <li key={h.id} className="flex items-center gap-3 py-2.5 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[14.5px] text-parish-navy truncate">{h.household_name}</div>
                <div className="text-[12.5px] text-parish-muted truncate">
                  {[h.head_name && `Head: ${h.head_name}`, h.gkk || 'No GKK', `${h.member_count} member(s)`, `registered ${daysAgo(h.created_at)}`].filter(Boolean).join(' · ')}
                </div>
              </div>
              <Link to={`/admin/households?status=Pending&q=${encodeURIComponent(h.household_name)}`} className="px-3 py-2 font-semibold text-[12.5px] text-parish-text2 bg-parish-sunk rounded-lg no-underline">Open</Link>
              {canVerify && <button
                onClick={() => verify(h)}
                disabled={busyId === h.id}
                className="appearance-none border-none cursor-pointer px-3 py-2 font-semibold text-[12.5px] text-parish-blue bg-[var(--p-blue-tint)] rounded-lg whitespace-nowrap disabled:opacity-60"
              >
                {busyId === h.id ? 'Verifying…' : 'Verify'}
              </button>}
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

  if (!stats) {
    return (
      <>
        <PageHeader title="Dashboard" subtitle="Parish registry overview" />
        <PageBody>
          {error && !loading ? <ErrorState message={error} onRetry={reload} /> : <LoadingState label="Loading dashboard…" />}
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Parish registry overview" />
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

        <PendingQueue pendingCount={stats.pendingCount} onVerified={() => { reload(); layout?.refreshNavCounts?.(); }} />

        <div className="grid gap-[18px] mb-[18px]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
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

        <div className="grid gap-[18px]" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))' }}>
          <Panel className="px-[22px] py-5">
            <div className="font-serif text-[20px] font-semibold text-parish-navy mb-[18px]">Members by GKK</div>
            {stats.gkkBreak.length ? <BreakdownBars data={stats.gkkBreak} color1="var(--p-blue)" color2="var(--p-blue-light)" /> : <div className="text-parish-muted text-sm">No GKK data yet.</div>}
          </Panel>
          <Panel className="px-[22px] py-5">
            <div className="font-serif text-[20px] font-semibold text-parish-navy mb-[18px]">Top ministries &amp; organizations</div>
            {stats.ministryBreak.length ? <BreakdownBars data={stats.ministryBreak} color1="var(--p-gold)" color2="#e0bd6d" /> : <div className="text-parish-muted text-sm">No participation data yet.</div>}
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
