import React from 'react';
import { Link } from 'react-router-dom';
import { Modal } from './admin.jsx';
import { useAuth } from '../AuthContext.jsx';
import { can, leaderGkk } from '../lib/access.js';

// One colour per part of the census. Text mixes it with the navy, which
// brightens in dark mode, so it reads on both; tints mix it with nothing.
const LANES = {
  start: '#2f6fd6',
  collect: '#1f9d55',
  record: '#0f8a7e',
  review: '#e0661b',
  follow: '#5458d6',
  use: '#8b46c9',
};
const ink = (lane) => `color-mix(in srgb, ${LANES[lane]} 72%, var(--p-navy))`;
const tint = (lane, pct = 10) => `color-mix(in srgb, ${LANES[lane]} ${pct}%, transparent)`;

const CENSUS = '/admin/census';
const UPDATES = '/admin/census?tab=updates';
const RESULTS = '/admin/census?tab=results';
const LAST_YEAR = '/admin/census?tab=lastYear';
const QUEUE = '/admin/households?status=Pending';
const ANALYSIS = '/admin/reports?tab=analysis';
const NOT_CONFIRMED = `/admin/members?census=${encodeURIComponent('Not confirmed')}`;

/** "Draft → Confirmed": a small note at the foot of a card. */
function Chip({ lane, children }) {
  return (
    <span className="inline-block mt-2.5 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ color: ink(lane), background: tint(lane, 12) }}>
      {children}
    </span>
  );
}

/**
 * A card that opens the page where this is done (closing the guide). When
 * the account can't open that page, it stays as text and says who does it.
 */
function FlowCard({ to, need, lane, title, children, chip, dashed = false, highlight = null, onGo }) {
  const { user } = useAuth();
  const allowed = !!to && (!need || can(user, need));
  const look = `group relative block h-full text-left rounded-xl bg-parish-card border px-3.5 py-3 no-underline shadow-cardSm ${dashed ? 'border-dashed' : ''}`;
  const style = highlight
    ? { borderColor: LANES[lane], borderWidth: 1.5, boxShadow: `0 0 0 4px ${tint(lane, 12)}` }
    : { borderColor: 'rgb(var(--c-border))', borderLeft: `3px solid ${LANES[lane]}` };
  const body = (
    <>
      {highlight && (
        <span className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider text-white" style={{ background: LANES[lane] }}>
          {highlight}
        </span>
      )}
      <div className={`font-semibold text-parish-navy flex items-center gap-1.5 ${highlight ? 'font-serif text-[21px] leading-tight' : 'text-[14.5px]'}`}>
        {title}
        {allowed && <span aria-hidden className="text-parish-muted transition-transform group-hover:translate-x-0.5">›</span>}
      </div>
      <div className="text-[12.5px] text-parish-text2 leading-snug mt-1">{children}</div>
      {chip && <Chip lane={lane}>{chip}</Chip>}
      {to && !allowed && <div className="text-[11px] text-parish-muted mt-2 italic">Done by the parish office</div>}
    </>
  );
  if (!allowed) return <div className={look} style={style}>{body}</div>;
  return <Link to={to} onClick={onGo} className={`${look} hover:brightness-[0.98] focus-visible:outline-2 focus-visible:outline-parish-blue`} style={style}>{body}</Link>;
}

/** A lane's numbered heading: "1  START · Before families are asked". */
function LaneHead({ n, lane, label, sub }) {
  return (
    <div className="flex items-start gap-2.5 mb-2.5">
      <span className="flex-none w-7 h-7 rounded-full text-white font-bold text-[13px] flex items-center justify-center" style={{ background: LANES[lane] }}>{n}</span>
      <div>
        <div className="text-[13px] font-bold tracking-wide uppercase" style={{ color: ink(lane) }}>{label}</div>
        <div className="text-[11.5px] text-parish-muted">{sub}</div>
      </div>
    </div>
  );
}

/** The arrow between two lanes: across on wide screens, down when they stack. */
function LaneArrow({ label }) {
  return (
    <div className="flex lg:flex-col items-center justify-center gap-1.5 py-1 lg:py-0 lg:pt-28 text-parish-muted" aria-hidden>
      <span className="text-[11px] font-semibold whitespace-nowrap" style={{ color: ink('record') }}>{label}</span>
      <span className="text-[18px] leading-none lg:rotate-0 rotate-90">→</span>
    </div>
  );
}

/** A tinted box holding a group of cards (Follow up, Use the results). */
function Group({ lane, title, sub, children }) {
  return (
    <section className="rounded-2xl border px-4 py-3.5" style={{ background: tint(lane, 7), borderColor: tint(lane, 28) }}>
      <div className="text-[13px] font-bold tracking-wide uppercase" style={{ color: ink(lane) }}>{title}</div>
      <div className="text-[11.5px] text-parish-muted mb-3">{sub}</div>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(145px,100%),1fr))' }}>{children}</div>
    </section>
  );
}

// The status chips on the dark band (the band is dark in both modes).
const STATUS_CHIPS = [
  ['Active', '#d9f5e3', '#14532d'],
  ['Inactive', '#fbefcf', '#7a5300'],
  ['Moved away', '#e4e7ec', '#344054'],
  ['Deceased', '#e4e7ec', '#344054'],
  ['Left the Church', '#fde2e1', '#8a1c1c'],
];

// "Where do I go when…?": [question, page, link, lane, permission].
const WHERE = [
  ["It's time for this year's census", 'Start a new census', CENSUS, 'start', 'census'],
  ['A GKK needs its forms', 'Print forms', CENSUS, 'collect', 'census'],
  ['A paper form came back', 'Record census', CENSUS, 'record', 'census'],
  ['Someone moved away or died', 'Record census · status', CENSUS, 'record', 'census'],
  ['A family answered online', 'Online updates', UPDATES, 'review', 'census'],
  ['A family lost their code', 'Record census · New code', CENSUS, 'follow', 'census'],
  ["Who hasn't answered yet?", 'Results by GKK', RESULTS, 'follow', 'census'],
  ['A new family wants to register', 'Households · On Queue', QUEUE, 'follow', 'registry'],
  ['All the forms are in', 'Close census', CENSUS, 'review', 'census'],
  ['How active is each GKK?', 'Analysis Report', ANALYSIS, 'use', 'reports'],
];

function WhereCard({ q, page, to, lane, need, onGo }) {
  const { user } = useAuth();
  const allowed = can(user, need);
  const body = (
    <>
      <div className="text-[12px] text-parish-muted leading-snug">{q}</div>
      <div className="text-[13.5px] font-semibold mt-1" style={{ color: ink(lane) }}>→ {page}</div>
    </>
  );
  const look = 'block h-full rounded-lg bg-parish-card border border-parish-border px-3 py-2.5 no-underline';
  const style = { borderLeft: `3px solid ${LANES[lane]}` };
  if (!allowed) return <div className={look} style={style}>{body}<div className="text-[11px] text-parish-muted italic mt-0.5">Parish office</div></div>;
  return <Link to={to} onClick={onGo} className={`${look} hover:brightness-[0.98]`} style={style}>{body}</Link>;
}

/**
 * How a census runs, as a map of cards and arrows: what to do, in what
 * order, and on which page. Every card opens its page. Opened from the ⓘ
 * beside the Census page's title.
 */
export default function CensusFlowGuide({ onClose }) {
  const { user } = useAuth();
  const ownGkk = leaderGkk(user);
  const go = onClose;

  return (
    <Modal title="How the parish census works" onClose={onClose} maxWidth={1120}>
      <p className="-mt-2 mb-5 text-[13px] text-parish-muted">
        Read left to right: start the census, collect the forms, record the answers, then review and close. Every answer gives a member a
        status. <strong className="text-parish-navy">Click any card to open that page.</strong>
        {ownGkk && <> You see <strong className="text-parish-navy">{ownGkk}</strong> only; starting and closing are done by the parish office.</>}
      </p>

      {/* The four lanes, left to right. */}
      <div className="grid gap-y-1 lg:gap-x-2 lg:grid-cols-[1fr_auto_1fr_auto_1.1fr_auto_1fr]">
        <div className="flex flex-col gap-2.5">
          <LaneHead n={1} lane="start" label="Start" sub="Before families are asked" />
          <FlowCard to={CENSUS} need="manageCensus" lane="start" title="Start a census" chip={ownGkk ? 'Parish office' : 'Once a year'} onGo={go}>
            Press <strong>Start a new census</strong>, name it and set its dates. Every member starts “not confirmed” — nothing changes until
            answers are saved.
          </FlowCard>
          <FlowCard to={LAST_YEAR} need="census" lane="start" title="Last year's list" chip="First census only" onGo={go}>
            Last year's households, GKK by GKK, so the census can show which families haven't registered yet.
          </FlowCard>
          <p className="m-0 text-[11px] italic text-parish-muted leading-snug">
            Set the <strong>Schedule</strong> on the Census page and it tells you when the next census is due.
          </p>
        </div>

        <LaneArrow label="forms" />

        <div className="flex flex-col gap-2.5">
          <LaneHead n={2} lane="collect" label="Collect" sub="Get the answers back" />
          <FlowCard to={CENSUS} need="census" lane="collect" title="Print forms" chip="Same code on every reprint" onGo={go}>
            On <strong>Households</strong>, choose a GKK, then <strong>Print forms</strong>: one pre-filled page per household, with its
            reference no and online code.
          </FlowCard>
          <div className="text-center text-parish-muted text-[14px] leading-none" aria-hidden>↓</div>
          <div className="rounded-xl bg-parish-card border border-parish-border px-3.5 py-3 shadow-cardSm" style={{ borderLeft: `3px solid ${LANES.collect}` }}>
            <div className="font-semibold text-[14.5px] text-parish-navy">Families answer</div>
            <ul className="m-0 mt-1 pl-4 list-disc text-[12.5px] text-parish-text2 leading-snug flex flex-col gap-1">
              <li><strong>On paper:</strong> circle A / P / W for each member, tick a status, sign; the GKK leader brings it back.</li>
              <li>
                <strong>Online:</strong> at{' '}
                <a href="/census" target="_blank" rel="noreferrer" className="font-semibold" style={{ color: ink('collect') }}>/census</a>{' '}
                with the reference no and code.
              </li>
            </ul>
          </div>
        </div>

        <LaneArrow label="answers in" />

        <div className="flex flex-col gap-2.5">
          <LaneHead n={3} lane="record" label="Record" sub="Census → Households" />
          <FlowCard to={CENSUS} need="census" lane="record" highlight="DAY TO DAY" title="Record census" onGo={go}>
            <p className="m-0 text-[13px]">Open a household, tap the answers as circled on the form, check each member's status, and save.</p>
            <ul className="m-0 mt-2.5 pt-2.5 pl-4 border-t border-parish-line text-[12.5px] flex flex-col gap-1.5" style={{ listStyle: 'square' }}>
              <li>Search by name, head or ref no</li>
              <li>Filter by <strong>Not started</strong> or <strong>Partly confirmed</strong></li>
              <li>Say where answers came from: paper or home visit</li>
              <li>The status is suggested from the answers</li>
              <li>Nothing is saved until <strong>Save census</strong></li>
              <li><strong>Clear answer</strong> undoes a mistake</li>
            </ul>
            <p className="m-0 mt-2.5 text-[11.5px] italic" style={{ color: ink('record') }}>Not sure where to go? Start here.</p>
          </FlowCard>
        </div>

        <LaneArrow label="check" />

        <div className="flex flex-col gap-2.5">
          <LaneHead n={4} lane="review" label="Review & close" sub="Finish the census" />
          <FlowCard to={UPDATES} need="census" lane="review" title="Online updates" chip="The badge shows how many wait" onGo={go}>
            Answers only are approved automatically. Changed details, new members, or someone moved, deceased or left wait for you to
            <strong> Approve</strong> or <strong>Reject</strong>.
          </FlowCard>
          <FlowCard to={CENSUS} need="manageCensus" lane="review" title="Close the census" chip={ownGkk ? 'Parish office' : 'Open → Closed'} onGo={go}>
            When the forms are in. Changes no records, keeps the results by GKK as they stand, and closes the online form. Reopen if more
            come in.
          </FlowCard>
        </div>
      </div>

      {/* Follow-up while it's open, and what to do with the results. */}
      <div className="grid gap-3.5 lg:grid-cols-2 mt-6">
        <Group lane="follow" title="Follow up" sub="While the census is open — reach every family">
          <FlowCard to={RESULTS} need="census" lane="follow" title="Results by GKK" chip="Not yet → Visit" onGo={go}>
            Who hasn't answered yet, GKK by GKK. <strong>Print visit list</strong> for the leaders.
          </FlowCard>
          <FlowCard to={QUEUE} need="registry" lane="follow" title="New families" chip="On Queue → Verified" onGo={go}>
            A family not yet registered signs up on the website form. Verify it under <strong>On Queue</strong>.
          </FlowCard>
          <FlowCard to={CENSUS} need="censusCodes" lane="follow" dashed title="Lost code" chip="Old code stops working" onGo={go}>
            In <strong>Record census</strong>, press <strong>New code</strong> and tell the family.
          </FlowCard>
        </Group>
        <Group lane="use" title="Use the results" sub="Once it's closed — or any time for a progress check">
          <FlowCard to={ANALYSIS} need="reports" lane="use" title="Analysis Report" chip="By GKK" onGo={go}>
            How active the members are, from this census's answers.
          </FlowCard>
          <FlowCard to={NOT_CONFIRMED} need="registry" lane="use" title="Not confirmed" chip="Members filter" onGo={go}>
            Everyone nobody confirmed in the census, to follow up.
          </FlowCard>
          <FlowCard to="/admin" need="registry" lane="use" title="Dashboard" chip="Active Catholics" onGo={go}>
            Counts the members marked Active, with the inactive and not yet assessed.
          </FlowCard>
        </Group>
      </div>

      {/* What every saved answer comes down to. */}
      <p className="text-center text-[11px] italic text-parish-muted mt-5 mb-1.5">Every saved answer, from every page above, gives a member a status ↓</p>
      <section className="rounded-2xl px-5 py-4 text-white" style={{ background: 'var(--p-sidebar-b)' }}>
        <FlowBandTitle onGo={go} />
        <p className="m-0 mt-1.5 text-[12.5px] text-white/80 leading-snug">
          For Mass, devotions and parish activities, each member is <strong className="text-white">A</strong> Aktibo,{' '}
          <strong className="text-white">P</strong> Panagsa or <strong className="text-white">W</strong> Wala. The answers suggest a status;
          you can always choose another. Children 8 and under are Active with nothing to answer.
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          {STATUS_CHIPS.map(([s, bg, fg]) => (
            <span key={s} className="px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold" style={{ background: bg, color: fg }}>{s}</span>
          ))}
          <span className="px-2.5 py-0.5 rounded-full text-[11.5px] font-semibold border border-white/40 text-white/85">Not confirmed · no answer yet</span>
        </div>
      </section>

      {/* Quick answers. */}
      <h4 className="mt-6 mb-2.5 text-[13px] font-bold tracking-wide uppercase text-parish-navy">Where do I go when…?</h4>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(min(190px,100%),1fr))' }}>
        {WHERE.map(([q, page, to, lane, need]) => <WhereCard key={q} q={q} page={page} to={to} lane={lane} need={need} onGo={go} />)}
      </div>
    </Modal>
  );
}

/** "MEMBER STATUS — what the census records", opening Results by GKK. */
function FlowBandTitle({ onGo }) {
  const { user } = useAuth();
  const title = (
    <>
      <span className="font-bold tracking-wide text-[15px]">MEMBER STATUS</span>
      <span className="text-[15px] text-white/85"> — what the census records for every member</span>
    </>
  );
  if (!can(user, 'census')) return <div>{title}</div>;
  return (
    <Link to={RESULTS} onClick={onGo} className="text-white no-underline hover:underline">
      {title} <span aria-hidden className="text-white/70">›</span>
    </Link>
  );
}
