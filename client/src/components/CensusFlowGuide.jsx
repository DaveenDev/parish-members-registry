import React from 'react';
import { Link } from 'react-router-dom';
import { Modal } from './admin.jsx';
import { useAuth } from '../AuthContext.jsx';
import { can, leaderGkk } from '../lib/access.js';

// One colour per part of the census. Text mixes it with the navy, which
// brightens in dark mode, so it reads on both; tints mix it with nothing.
const LANES = {
  start: '#2f6fd6',
  online: '#1f9d55',
  review: '#0f8a7e',
  close: '#e0661b',
  use: '#8b46c9',
  paper: '#7a8494',
};
const ink = (lane) => `color-mix(in srgb, ${LANES[lane]} 72%, var(--p-navy))`;
const tint = (lane, pct = 10) => `color-mix(in srgb, ${LANES[lane]} ${pct}%, transparent)`;

const CENSUS = '/admin/census';
const UPDATES = '/admin/census?tab=updates';
const RESULTS = '/admin/census?tab=results';
const LAST_YEAR = '/admin/census?tab=lastYear';
const QUEUE = '/admin/households?status=Pending';
const HOUSEHOLDS = '/admin/households?status=All';
const ANALYSIS = '/admin/reports?tab=analysis';
const NOT_CONFIRMED = `/admin/members?census=${encodeURIComponent('Not confirmed')}`;
// The families' own pages on the website, opened in a new tab.
const REGISTER = '/register';
const PORTAL = '/census';

/** "Draft → Confirmed": a small note at the foot of a card. */
function Chip({ lane, children }) {
  return (
    <span className="inline-block mt-2.5 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ color: ink(lane), background: tint(lane, 12) }}>
      {children}
    </span>
  );
}

/** Opens in a new tab (drawn, as the ↗ character turns into an emoji on Windows). */
function NewTabIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="text-parish-muted" aria-label="opens in a new tab">
      <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

/**
 * A card that opens the page where this is done (closing the guide), or with
 * `external` a family's page on the website in a new tab. When the account
 * can't open that page, it stays as text and says who does it.
 */
function FlowCard({ to, need, external = false, lane, title, children, chip, dashed = false, highlight = null, onGo }) {
  const { user } = useAuth();
  const allowed = !!to && (!need || can(user, need));
  const look = `group relative block text-left rounded-xl bg-parish-card border px-3.5 py-3 no-underline shadow-cardSm ${dashed ? 'border-dashed' : ''}`;
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
        {allowed && (external
          ? <NewTabIcon />
          : <span aria-hidden className="text-parish-muted transition-transform group-hover:translate-x-0.5">›</span>)}
      </div>
      <div className="text-[12.5px] text-parish-text2 leading-snug mt-1">{children}</div>
      {chip && <Chip lane={lane}>{chip}</Chip>}
      {to && !allowed && <div className="text-[11px] text-parish-muted mt-2 italic">Done by the parish office</div>}
    </>
  );
  if (!allowed) return <div className={look} style={style}>{body}</div>;
  const linkLook = `${look} hover:brightness-[0.98] focus-visible:outline-2 focus-visible:outline-parish-blue`;
  if (external) return <a href={to} target="_blank" rel="noreferrer" className={linkLook} style={style}>{body}</a>;
  return <Link to={to} onClick={onGo} className={linkLook} style={style}>{body}</Link>;
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
      <span className="text-[11px] font-semibold whitespace-nowrap" style={{ color: ink('review') }}>{label}</span>
      <span className="text-[18px] leading-none lg:rotate-0 rotate-90">→</span>
    </div>
  );
}

/** A tinted box holding a group of cards (Use the results, Paper forms). */
function Group({ lane, title, sub, dashed = false, children }) {
  return (
    <section className={`rounded-2xl border px-4 py-3.5 ${dashed ? 'border-dashed' : ''}`} style={{ background: tint(lane, 7), borderColor: tint(lane, dashed ? 55 : 28) }}>
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

// "Where do I go when…?": [question, page, link, lane, permission, external].
const WHERE = [
  ['A new family wants to register', 'Online Registry', REGISTER, 'online', null, true],
  ['A family asks for their code', 'Households · Get codes', HOUSEHOLDS, 'online', 'censusCodes'],
  ['A family updated online', 'Online updates', UPDATES, 'review', 'census'],
  ['A new family has registered', 'Households · On Queue', QUEUE, 'review', 'registry'],
  ["Who hasn't answered yet?", 'Results by GKK', RESULTS, 'close', 'census'],
  ['Every family has answered', 'Close census', CENSUS, 'close', 'census'],
  ['How active is each GKK?', 'Analysis Report', ANALYSIS, 'use', 'reports'],
  ["It's time for this year's census", 'Start a new census', CENSUS, 'start', 'census'],
  ["A family can't go online", 'Print form', CENSUS, 'paper', 'census'],
  ['A paper form came back', 'Record census', CENSUS, 'paper', 'census'],
];

function WhereCard({ q, page, to, lane, need, external, onGo }) {
  const { user } = useAuth();
  const allowed = !need || can(user, need);
  const body = (
    <>
      <div className="text-[12px] text-parish-muted leading-snug">{q}</div>
      <div className="text-[13.5px] font-semibold mt-1" style={{ color: ink(lane) }}>→ {page}</div>
    </>
  );
  const look = 'block h-full rounded-lg bg-parish-card border border-parish-border px-3 py-2.5 no-underline';
  const style = { borderLeft: `3px solid ${LANES[lane]}` };
  if (!allowed) return <div className={look} style={style}>{body}<div className="text-[11px] text-parish-muted italic mt-0.5">Parish office</div></div>;
  if (external) return <a href={to} target="_blank" rel="noreferrer" className={`${look} hover:brightness-[0.98]`} style={style}>{body}</a>;
  return <Link to={to} onClick={onGo} className={`${look} hover:brightness-[0.98]`} style={style}>{body}</Link>;
}

/**
 * How a census runs, as a map of cards and arrows: what to do, in what
 * order, and on which page. Families answer online, through the Online
 * Registry or an online update; paper forms are the last resort. Every card
 * opens its page. Opened from the ⓘ beside the Census page's title.
 */
export default function CensusFlowGuide({ onClose }) {
  const { user } = useAuth();
  const ownGkk = leaderGkk(user);
  const go = onClose;

  return (
    <Modal title="How the parish census works" onClose={onClose} maxWidth={1120}>
      <p className="-mt-2 mb-5 text-[13px] text-parish-muted">
        Read left to right: start the census, families answer <strong className="text-parish-navy">online</strong>, you review what they send,
        then follow up and close. Paper forms are only for families who can't go online.{' '}
        <strong className="text-parish-navy">Click any card to open that page.</strong>
        {ownGkk && <> You see <strong className="text-parish-navy">{ownGkk}</strong> only; starting and closing are done by the parish office.</>}
      </p>

      {/* The four lanes, left to right. */}
      <div className="grid gap-y-1 lg:gap-x-2 lg:grid-cols-[1fr_auto_1.05fr_auto_1.1fr_auto_1fr]">
        <div className="flex flex-col gap-2.5">
          <LaneHead n={1} lane="start" label="Start" sub="Open the census" />
          <FlowCard to={CENSUS} need="manageCensus" lane="start" title="Start a census" chip={ownGkk ? 'Parish office' : 'Once a year'} onGo={go}>
            Press <strong>Start a new census</strong>, name it and set its dates. The online update form opens on the website at once.
          </FlowCard>
          <FlowCard to={LAST_YEAR} need="census" lane="start" title="Last year's list" chip="First census only" onGo={go}>
            Last year's households, GKK by GKK, so the census can show which families haven't registered yet.
          </FlowCard>
          <p className="m-0 text-[11px] italic text-parish-muted leading-snug">
            Then spread the word — Mass announcements, GKK group chats, the parish page — that families can answer from their phones.
          </p>
        </div>

        <LaneArrow label="website open" />

        <div className="flex flex-col gap-2.5">
          <LaneHead n={2} lane="online" label="Families go online" sub="From any phone, no account needed" />
          <FlowCard to={REGISTER} external lane="online" title="Online Registry" chip="New family → On Queue">
            <strong>New families</strong> register themselves: the household, every member, and the census answers for each. They get their
            reference no and code on screen.
          </FlowCard>
          <FlowCard to={PORTAL} external lane="online" title="Online update" chip="Answers only → approved at once">
            <strong>Registered families</strong> tap <em>I-update ang inyong rekord</em> on the website, sign in with their reference no and code,
            check their details, answer for each member and add newborns.
          </FlowCard>
          <FlowCard to={HOUSEHOLDS} need="censusCodes" lane="online" dashed title="Give out codes" onGo={go}>
            Family lost their code? <strong>Households → ⋯ → Get codes</strong>, then copy and send it by text or Messenger.
          </FlowCard>
        </div>

        <LaneArrow label="families send" />

        <div className="flex flex-col gap-2.5">
          <LaneHead n={3} lane="review" label="Review" sub="What families sent" />
          <FlowCard to={UPDATES} need="census" lane="review" highlight="DAY TO DAY" title="Online updates" onGo={go}>
            <p className="m-0 text-[13px]">Every update families send lands here. The sidebar badge and the bell tell you when one arrives.</p>
            <ul className="m-0 mt-2.5 pt-2.5 pl-4 border-t border-parish-line text-[12.5px] flex flex-col gap-1.5" style={{ listStyle: 'square' }}>
              <li>Answers only: <strong>approved automatically</strong></li>
              <li>Changed details, new members, or someone moved, deceased or left: <strong>waits for you</strong></li>
              <li><strong>Review</strong> shows only what changed</li>
              <li><strong>Approve</strong>, or <strong>Reject</strong> with a reason</li>
              <li>Nothing changes in the registry until you approve</li>
            </ul>
            <p className="m-0 mt-2.5 text-[11.5px] italic" style={{ color: ink('review') }}>Check here every day while the census is open.</p>
          </FlowCard>
          <FlowCard to={QUEUE} need="registry" lane="review" title="New registrations" chip="On Queue → Verified" onGo={go}>
            Families from the Online Registry wait under <strong>Households → On Queue for Verification</strong>. Check and verify them;
            their census answers count already.
          </FlowCard>
        </div>

        <LaneArrow label="who's left?" />

        <div className="flex flex-col gap-2.5">
          <LaneHead n={4} lane="close" label="Follow up & close" sub="Reach everyone, then finish" />
          <FlowCard to={RESULTS} need="census" lane="close" title="Results by GKK" chip="Not yet → remind" onGo={go}>
            Who hasn't answered yet, GKK by GKK. <strong>Print visit list</strong> so GKK leaders can remind them, or help them answer on
            the leader's phone.
          </FlowCard>
          <FlowCard to={CENSUS} need="manageCensus" lane="close" title="Close the census" chip={ownGkk ? 'Parish office' : 'Open → Closed'} onGo={go}>
            When families have answered. Changes no records, keeps the results by GKK as they stand, and closes the online form. Reopen if
            more come in.
          </FlowCard>
        </div>
      </div>

      {/* What to do with the results, and paper as the last resort. */}
      <div className="grid gap-3.5 lg:grid-cols-2 mt-6">
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
        <Group lane="paper" dashed title="Last option · paper forms" sub="Only for families with no phone or internet">
          <FlowCard to={CENSUS} need="census" lane="paper" title="Print form" chip="Code printed on it" onGo={go}>
            On <strong>Census → Households</strong>, <strong>Print form</strong> on the family's row, or choose a GKK to print several.
          </FlowCard>
          <div className="h-full rounded-xl bg-parish-card border border-parish-border px-3.5 py-3 shadow-cardSm" style={{ borderLeft: `3px solid ${LANES.paper}` }}>
            <div className="font-semibold text-[14.5px] text-parish-navy">Family fills it in</div>
            <div className="text-[12.5px] text-parish-text2 leading-snug mt-1">
              They circle A / P / W for each member and sign; or the GKK leader asks at a home visit.
            </div>
          </div>
          <FlowCard to={CENSUS} need="census" lane="paper" title="Record census" chip="Save census" onGo={go}>
            Open the household, tap the answers as circled, check each status, then <strong>Save census</strong>.
          </FlowCard>
        </Group>
      </div>

      {/* What every saved answer comes down to. */}
      <p className="text-center text-[11px] italic text-parish-muted mt-5 mb-1.5">Every answer — online, at registration or on paper — gives a member a status ↓</p>
      <section className="rounded-2xl px-5 py-4 text-white" style={{ background: 'var(--p-sidebar-b)' }}>
        <FlowBandTitle onGo={go} />
        <p className="m-0 mt-1.5 text-[12.5px] text-white/80 leading-snug">
          For Mass, devotions and parish activities, each member is <strong className="text-white">A</strong> Aktibo,{' '}
          <strong className="text-white">P</strong> Panagsa or <strong className="text-white">W</strong> Wala. The answers suggest a status;
          the family or staff can choose another. Children 8 and under are Active with nothing to answer.
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
        {WHERE.map(([q, page, to, lane, need, external]) => (
          <WhereCard key={q} q={q} page={page} to={to} lane={lane} need={need} external={external} onGo={go} />
        ))}
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
