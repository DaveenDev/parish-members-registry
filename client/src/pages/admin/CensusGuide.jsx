import React from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, PageBody, Panel } from '../../components/admin.jsx';
import { Badge } from '../../components/ui.jsx';
import { useAuth } from '../../AuthContext.jsx';
import { can, leaderGkk } from '../../lib/access.js';
import { MEMBERSHIP_STATUSES, STATUS_TONES } from '../../lib/census.js';

// Line icons on a 24px grid, drawn with the current colour (as NavIcon).
const ICONS = {
  prepare: <><path d="M9 4.5h10.5M9 12h10.5M9 19.5h10.5" /><path d="M3.5 4.5l1.3 1.3 2.2-2.3M3.5 12l1.3 1.3 2.2-2.3M3.5 19.5l1.3 1.3 2.2-2.3" /></>,
  start: <><path d="M5 21V4" /><path d="M5 4.5h11l-2 3.5 2 3.5H5" /></>,
  print: <><path d="M7 8V3.5h10V8" /><rect x="3.5" y="8" width="17" height="8.5" rx="1.5" /><path d="M7 13.5h10V20.5H7z" /></>,
  family: <><path d="M3.5 11L12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><circle cx="12" cy="12.5" r="2" /><path d="M8.8 20c.4-2.2 1.6-3.4 3.2-3.4s2.8 1.2 3.2 3.4" /></>,
  paper: <><path d="M6 3.5h8.5L18.5 7.5V20.5H6z" /><path d="M14 3.5V8h4.5" /><path d="M9 12h6.5M9 15.5h6.5" /></>,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M11 18.5h2" /></>,
  newHome: <><path d="M3.5 11L12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M12 11.5v6M9 14.5h6" /></>,
  record: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1" /><path d="M8.5 12.5l2 2 4.5-4.5" /></>,
  review: <><path d="M3.5 13.5l2.7-8a2 2 0 0 1 1.9-1.5h7.8a2 2 0 0 1 1.9 1.5l2.7 8V19a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3.5 19z" /><path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5" /></>,
  progress: <><path d="M4 20V4M4 20h16" /><path d="M8.5 16v-5M13 16V8M17.5 16v-3" /></>,
  close: <><rect x="5" y="10.5" width="14" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /><path d="M12 14.5v2.5" /></>,
  results: <><circle cx="12" cy="12" r="8.5" /><path d="M12 3.5V12l6 6" /></>,
  office: <><path d="M4 20.5V9l8-5.5L20 9v11.5" /><path d="M12 3.5V2M10.8 2.8h2.4" /><path d="M9.5 20.5v-5h5v5" /></>,
  leader: <><circle cx="12" cy="7.5" r="3.5" /><path d="M5.5 20.5c.6-4 3.2-6 6.5-6s5.9 2 6.5 6" /><path d="M17.5 3.5l.8 1.6 1.7.2-1.3 1.2.4 1.7-1.6-.9-1.5.9.3-1.7-1.2-1.2 1.7-.2z" /></>,
  repeat: <><path d="M4 11a8 8 0 0 1 14-5.3L20 8" /><path d="M20 3.5V8h-4.5" /><path d="M20 13a8 8 0 0 1-14 5.3L4 16" /><path d="M4 20.5V16h4.5" /></>,
  bulb: <><path d="M9 17.5h6M10 21h4" /><path d="M8.2 14.5A6 6 0 1 1 15.8 14.5c-.7.6-1 1.4-1 2.3v.7H9.2v-.7c0-.9-.3-1.7-1-2.3z" /></>,
};

function Icon({ name, size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

/** A tinted round tile holding an icon. */
function IconTile({ name, tone = 'blue', size = 44 }) {
  const look = tone === 'gold'
    ? 'text-parish-gold'
    : tone === 'green' ? 'text-parish-okText bg-parish-okTint' : 'text-parish-blue bg-[var(--p-blue-tint)]';
  // The gold is a plain colour, not channels, so its tint is mixed here.
  const tint = tone === 'gold' ? { background: 'color-mix(in srgb, var(--p-gold) 16%, transparent)' } : null;
  return (
    <span className={`inline-flex items-center justify-center rounded-2xl flex-none ${look}`} style={{ width: size, height: size, ...tint }}>
      <Icon name={name} size={Math.round(size * 0.52)} />
    </span>
  );
}

/**
 * "Census → Households ›": a link to the page where a step is done, or
 * when this account can't open it, who does it there.
 */
function GoTo({ to, need, external = false, children }) {
  const { user } = useAuth();
  const look = 'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold no-underline whitespace-nowrap';
  if (need && !can(user, need)) {
    return <span className={`${look} text-parish-muted bg-parish-sunk`} title="Your account can't open this page; the parish office does this">{children} · parish office</span>;
  }
  const inner = <>{children} <span aria-hidden>›</span></>;
  const linkLook = `${look} text-parish-blue bg-[var(--p-blue-tint)] hover:brightness-95`;
  if (external) return <a href={to} target="_blank" rel="noreferrer" className={linkLook}>{inner}</a>;
  return <Link to={to} className={linkLook}>{inner}</Link>;
}

function WhoChip({ children }) {
  return <span className="inline-flex items-center text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-parish-sunk text-parish-text2 whitespace-nowrap">{children}</span>;
}

/** One numbered step of the flow. */
function Step({ id, n, icon, title, who, children, links, tone }) {
  return (
    <Panel id={id} className="relative px-5 py-5 sm:px-6 scroll-mt-28">
      <div className="flex items-start gap-4">
        <div className="relative flex-none">
          <IconTile name={icon} tone={tone} size={52} />
          <span className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-parish-fill text-white text-[12.5px] font-bold flex items-center justify-center shadow-cardSm">{n}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mb-1.5">
            <h3 className="m-0 font-serif text-[22px] font-semibold text-parish-navy leading-tight">{title}</h3>
            {who && <WhoChip>{who}</WhoChip>}
          </div>
          <div className="text-[14px] text-parish-text2 leading-relaxed">{children}</div>
          {links && <div className="flex flex-wrap gap-2 mt-3.5">{links}</div>}
        </div>
      </div>
    </Panel>
  );
}

/** Bullets inside a step. */
function Points({ items }) {
  return (
    <ul className="m-0 mt-2 p-0 list-none flex flex-col gap-1.5">
      {items.filter(Boolean).map((t, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-parish-gold flex-none" aria-hidden />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/** "Census → Households → Record census": where to click, as on screen. */
function Path({ children }) {
  const parts = React.Children.toArray(children);
  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span className="text-parish-faint" aria-label="then">→</span>}
          <strong className="px-1.5 py-px rounded-md bg-parish-sunk text-parish-navy text-[13px] font-semibold">{p}</strong>
        </React.Fragment>
      ))}
    </span>
  );
}

/** The arrow down to the next step, with what happens in between. */
function Arrow({ label }) {
  return (
    <div className="flex flex-col items-center py-1.5" aria-hidden>
      <span className="w-0.5 h-4 bg-parish-borderStrong" />
      {label && <span className="my-1 px-3 py-1 rounded-full border border-parish-border bg-parish-card text-[12px] font-semibold text-parish-muted">{label}</span>}
      <svg width="18" height="22" viewBox="0 0 18 22" className="text-parish-borderStrong">
        <path d="M9 0v16" stroke="currentColor" strokeWidth="2" />
        <path d="M2 12l7 8 7-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** One arrow splitting into three, over the three ways families answer (wide screens). */
function Fork() {
  return (
    <div aria-hidden>
      <svg className="hidden md:block w-full text-parish-borderStrong" height="46" viewBox="0 0 600 46" preserveAspectRatio="none">
        <path d="M300 0v14M100 14h400M100 14v24M300 14v24M500 14v24" fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="hidden md:grid grid-cols-3 -mt-3 mb-1 text-parish-borderStrong">
        {[0, 1, 2].map((i) => (
          <svg key={i} className="mx-auto" width="18" height="12" viewBox="0 0 18 12"><path d="M2 2l7 8 7-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        ))}
      </div>
      <div className="md:hidden"><Arrow label="Three ways in" /></div>
    </div>
  );
}

/** Three arrows joining back into one (wide screens). */
function Join({ label }) {
  return (
    <div aria-hidden>
      <svg className="hidden md:block w-full text-parish-borderStrong" height="34" viewBox="0 0 600 34" preserveAspectRatio="none">
        <path d="M100 0v14M300 0v14M500 0v14M100 14h400M300 14v20" fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="md:-mt-1"><Arrow label={label} /></div>
    </div>
  );
}

/** One of the three ways a family's answers come in. */
function Branch({ icon, title, children, links }) {
  return (
    <Panel className="px-4 py-4 flex flex-col">
      <div className="flex items-center gap-3 mb-2">
        <IconTile name={icon} tone="gold" size={40} />
        <h4 className="m-0 font-serif text-[19px] font-semibold text-parish-navy leading-tight">{title}</h4>
      </div>
      <div className="text-[13.5px] text-parish-text2 leading-relaxed flex-1">{children}</div>
      {links && <div className="flex flex-wrap gap-2 mt-3">{links}</div>}
    </Panel>
  );
}

const PHASES = [
  ['prepare', 'prepare', 'Prepare'],
  ['start', 'start', 'Start'],
  ['collect', 'print', 'Collect'],
  ['review', 'review', 'Record & review'],
  ['finish', 'close', 'Close & report'],
];

const SCORE = [['A', 'Aktibo', 'goes regularly'], ['P', 'Panagsa', 'sometimes'], ['W', 'Wala', 'not at all']];

const STATUS_NOTES = {
  Active: 'a practising member',
  Inactive: 'still a member, not practising',
  'Moved away': 'no longer lives in the parish',
  Deceased: 'has passed away',
  'Left the Church': 'no longer Catholic',
};

export default function CensusGuide() {
  const { user } = useAuth();
  const ownGkk = leaderGkk(user);
  const office = ownGkk ? 'Parish office' : null;

  return (
    <>
      <PageHeader title="Census Guide" subtitle="How to run a parish census, step by step">
        <Link to="/admin/census" className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border-[1.5px] border-parish-borderSoft bg-parish-card text-parish-navy font-semibold text-[13.5px] no-underline max-sm:w-full max-sm:justify-center">
          <span aria-hidden>←</span> Back to Census
        </Link>
      </PageHeader>
      <PageBody>
        <div className="max-w-[980px] mx-auto">
          {/* What a census is, and the five phases at a glance. */}
          <Panel className="px-5 py-5 sm:px-7 sm:py-6 mb-6 bg-[var(--p-blue-tint)] border-[var(--p-blue-border)]">
            <h2 className="m-0 mb-1.5 font-serif text-[26px] font-semibold text-parish-navy">What is the parish census?</h2>
            <p className="m-0 text-[14.5px] text-parish-text2 leading-relaxed max-w-[720px]">
              Once a year (or on the schedule you set), every household is asked to re-confirm its members. Each member gets a
              status — Active, Inactive, Moved away, Deceased or Left the Church — so the parish knows who it serves today.
              Follow the steps below in order; each card shows <strong>where to go</strong> in the admin panel.
            </p>
            {ownGkk && (
              <p className="m-0 mt-3 text-[13.5px] text-parish-navy font-medium">
                As a GKK leader you work on <strong>{ownGkk}</strong> only. The steps marked <WhoChip>Parish office</WhoChip> are done for the whole parish by the office.
              </p>
            )}
            <nav aria-label="Census phases" className="mt-5">
              <ol className="m-0 p-0 list-none flex flex-wrap items-center gap-y-2">
                {PHASES.map(([anchor, icon, label], i) => (
                  <li key={anchor} className="flex items-center">
                    {i > 0 && <span className="mx-1.5 sm:mx-2.5 text-parish-faint text-[18px]" aria-hidden>→</span>}
                    <a href={`#${anchor}`} className="inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full bg-parish-card border border-parish-border text-[13px] font-semibold text-parish-navy no-underline hover:border-[var(--p-blue-border)]">
                      <span className="inline-flex w-7 h-7 items-center justify-center rounded-full bg-[var(--p-blue-tint)] text-parish-blue"><Icon name={icon} size={16} /></span>
                      {label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </Panel>

          {/* Who does what. */}
          <h2 className="mt-0 mb-3 font-serif text-[24px] font-semibold text-parish-navy">Who does what</h2>
          <div className="grid gap-3.5 mb-8" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(240px,100%),1fr))' }}>
            {[
              ['office', 'Parish office', 'Starts and closes the census, sets the schedule, prints forms for every GKK, records answers and reviews online updates for the whole parish.'],
              ['leader', 'GKK leaders', 'Hand out and collect the forms in their GKK, record the answers, review their GKK\'s online updates and give families a new code when one is lost.'],
              ['family', 'Families', 'Answer the paper form, or update their record online at /census with the reference number and code printed on the form.'],
            ].map(([icon, title, text]) => (
              <Panel key={title} className="px-4 py-4 flex gap-3.5">
                <IconTile name={icon} />
                <div className="min-w-0">
                  <div className="font-semibold text-[15px] text-parish-navy mb-0.5">{title}</div>
                  <div className="text-[13.5px] text-parish-text2 leading-relaxed">{text}</div>
                </div>
              </Panel>
            ))}
          </div>

          {/* The flow. */}
          <h2 className="mt-0 mb-3 font-serif text-[24px] font-semibold text-parish-navy">The census, step by step</h2>
          <div>
            <Step
              id="prepare" n={1} icon="prepare" title="Prepare what to measure against" who={office || 'Before you start · optional'}
              links={<>
                <GoTo to="/admin/census?tab=lastYear" need="census">Census → Last year's list</GoTo>
                <GoTo to="/admin/settings?tab=gkk" need="settings">Parish Config → Parish GKK</GoTo>
              </>}
            >
              For the <strong>first</strong> census only, give the system a starting point so it can show which families haven't registered yet:
              <Points items={[
                <>Type or upload last year's household names, GKK by GKK, under <Path>Census</Path>{' '}<Path>Last year's list</Path>.</>,
                <>Or just set each GKK's <strong>Households last year</strong> and <strong>Families last year</strong> in <Path>Parish Config</Path>{' '}<Path>Parish GKK</Path>.</>,
                'From the second census on, each census is measured against the one before, so this step is no longer needed.',
              ]} />
            </Step>

            <Arrow />

            <Step
              id="start" n={2} icon="start" title="Start the census" who={office || 'Parish office'}
              links={<GoTo to="/admin/census" need="census">Census</GoTo>}
            >
              Open <Path>Census</Path> and press <strong>Start a new census</strong>. Keep the suggested name (e.g. "2026 Census"),
              check the start date, and add a target end date if you like.
              <Points items={[
                'Every current member starts as "not confirmed". Nothing in the records changes until someone saves a household\'s answers.',
                <>Set the <strong>Schedule</strong> (every 6 months to every 3 years) so the page reminds you when the next census is due.</>,
                <>While it is open, <strong>CENSUS</strong> appears at the top of the sidebar, and families can answer online.</>,
              ]} />
            </Step>

            <Arrow />

            <Step
              id="collect" n={3} icon="print" title="Print the forms, GKK by GKK" who="Parish office · GKK leaders"
              links={<GoTo to="/admin/census" need="census">Census → Households</GoTo>}
            >
              On the <Path>Households</Path> tab, choose a GKK in the filter, then press <strong>Print forms for …</strong>.
              Use <strong>Print form</strong> on a single row to reprint one household.
              <Points items={[
                'One page per household, already filled in with its address, members and sacraments.',
                'Each page has an A / P / W grid per member, the status choices, blank rows for new members and signature lines.',
                <>A box at the top carries the household's <strong>reference number</strong> and an 8-character <strong>online code</strong>. Reprinting keeps the same code.</>,
                'GKK leaders hand the forms to each family and collect them back.',
              ]} />
            </Step>

            <Arrow label="The forms go out to families" />

            <Panel className="px-5 py-4 sm:px-6 bg-parish-surface">
              <div className="flex items-center gap-3">
                <IconTile name="family" tone="gold" />
                <div>
                  <h3 className="m-0 font-serif text-[22px] font-semibold text-parish-navy leading-tight">Families answer</h3>
                  <p className="m-0 text-[13.5px] text-parish-muted">Answers come back in one of three ways.</p>
                </div>
              </div>
            </Panel>
            <Fork />
            <div className="grid gap-3.5 md:grid-cols-3">
              <Branch icon="paper" title="On the paper form">
                The family circles <strong>A</strong>, <strong>P</strong> or <strong>W</strong> for each member, ticks a status, adds any new
                members and signs. The GKK leader brings the form back, or a leader fills it in at a <strong>home visit</strong>.
                <div className="mt-2 text-parish-muted">→ Recorded by staff in step 4.</div>
              </Branch>
              <Branch icon="phone" title="Online, on a phone" links={<GoTo to="/census" external>Open the family form</GoTo>}>
                The family opens <strong>/census</strong> on the parish website and types the reference number and code from their form.
                They update their details, answer for each member, add new members and send.
                <div className="mt-2 text-parish-muted">→ Lands in Online updates, step 5.</div>
              </Branch>
              <Branch icon="newHome" title="A family not yet registered" links={<GoTo to="/admin/households?status=Pending" need="registry">Households → On Queue</GoTo>}>
                A new family registers with the <strong>registration form</strong> on the website, answering the census for each member as they go.
                <div className="mt-2 text-parish-muted">→ Verify it under Households → On Queue for Verification.</div>
              </Branch>
            </div>
            <Join label="Answers come back" />

            <Step
              id="review" n={4} icon="record" title="Record the paper answers" who="Parish office · GKK leaders"
              links={<GoTo to="/admin/census" need="census">Census → Households</GoTo>}
            >
              Find the household (search by name, head or ref no) and press <Path>Record census</Path>.
              <Points items={[
                <>Choose where the answers came from: <strong>Paper census form</strong> or <strong>Staff / GKK home visit</strong>.</>,
                <>Tap A / P / W for each member as circled on the form. The <strong>status is suggested</strong> from the answers until you pick one yourself.</>,
                'Children aged 8 and under are Active with no questions to answer.',
                <>Press <strong>Save census</strong>. Nothing is saved until you do; closing the panel asks before throwing answers away.</>,
                <>Made a mistake? Open the household again and use <strong>Clear answer</strong> on that member.</>,
                <>Family lost their code? <strong>New code</strong> in the same panel gives them another; the old one stops working.</>,
              ]} />
            </Step>

            <Arrow />

            <Step
              id="updates" n={5} icon="review" title="Review the online updates" who="Parish office · GKK leaders"
              links={<>
                <GoTo to="/admin/census?tab=updates" need="census">Census → Online updates</GoTo>
                <GoTo to="/admin/settings/notifications">Notifications</GoTo>
              </>}
            >
              Open the <Path>Online updates</Path> tab. The sidebar badge and the bell tell you when new ones arrive.
              <Points items={[
                <>An update that <strong>only answers the census</strong> is approved automatically — nothing to do.</>,
                <>One that changes details, adds a member, or marks someone moved away, deceased or left the Church waits under <strong>Waiting for review</strong>.</>,
                <>Press <strong>Review</strong>: it shows only what changed (old value struck through, new value in bold). Then <strong>Approve</strong>, or <strong>Reject…</strong> with a reason.</>,
                'Nothing in the registry changes until you approve.',
              ]} />
            </Step>

            <Arrow />

            <Step
              id="track" n={6} icon="progress" title="Track progress and follow up" who="Parish office · GKK leaders"
              links={<>
                <GoTo to="/admin/census" need="census">Census → Households</GoTo>
                <GoTo to="/admin/census?tab=results" need="census">Census → Results by GKK</GoTo>
              </>}
            >
              The tiles at the top of <Path>Census</Path> show the share of members confirmed and the households done.
              <Points items={[
                <>Filter the households by <strong>Not started</strong> or <strong>Partly confirmed</strong> to see who is left.</>,
                <>On <Path>Results by GKK</Path>, the <strong>Not yet registered / answered</strong> list names the families still to reach. Press <strong>Print visit list</strong> for the GKK leaders.</>,
                !ownGkk && 'Click a GKK in the results to see it exactly as its leader does.',
              ]} />
              <div className="mt-3.5 flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-dashed border-parish-borderStrong text-[13.5px] text-parish-text2">
                <span className="text-parish-blue flex-none"><Icon name="repeat" size={22} /></span>
                <span>Visit, record and review again — <a href="#collect" className="font-semibold text-parish-blue">repeat steps 3 to 6</a> until every household has answered.</span>
              </div>
            </Step>

            <Arrow label="When the forms are in" />

            <Step
              id="finish" n={7} icon="close" title="Close the census" who={office || 'Parish office'}
              links={<GoTo to="/admin/census" need="census">Census</GoTo>}
            >
              Press <strong>Close census</strong> beside the census name.
              <Points items={[
                'Closing changes no member\'s details. Members nobody confirmed show as "not confirmed" in this census.',
                'The results by GKK are kept as they stand, so they don\'t shift as the registry changes later.',
                'The online form closes for families.',
                <>Forms still coming in? <strong>Reopen</strong> it — possible until the end of the census's year.</>,
              ]} />
            </Step>

            <Arrow />

            <Step
              id="results" n={8} icon="results" title="Use the results" tone="green"
              links={<>
                <GoTo to="/admin/census?tab=results" need="census">Census → Results by GKK</GoTo>
                <GoTo to="/admin/reports?tab=analysis" need="reports">Reports → Analysis Report</GoTo>
                <GoTo to={`/admin/members?census=${encodeURIComponent('Not confirmed')}`} need="registry">Members not confirmed</GoTo>
                <GoTo to="/admin" need="registry">Dashboard</GoTo>
              </>}
            >
              <Points items={[
                <><Path>Results by GKK</Path>: members per status in every GKK. <strong>Print</strong> it or <strong>Export CSV</strong>.</>,
                <><strong>Analysis Report →</strong> shows how active the members are, GKK by GKK, from this census's answers.</>,
                <>On <Path>Members</Path>, the <strong>Not confirmed in census</strong> filter lists everyone nobody confirmed.</>,
                <>The <Path>Dashboard</Path> counts <strong>Active Catholics</strong> from the census statuses.</>,
                'The Census page then shows when the next census is due.',
              ]} />
            </Step>
          </div>

          {/* What the answers mean. */}
          <h2 className="mt-10 mb-3 font-serif text-[24px] font-semibold text-parish-navy">Reading the form</h2>
          <div className="grid gap-3.5 md:grid-cols-2 mb-8">
            <Panel className="px-5 py-4">
              <div className="font-semibold text-[15px] text-parish-navy mb-1">The activity answers</div>
              <p className="m-0 mb-3 text-[13.5px] text-parish-muted">For each member: Mass, devotions and parish activities.</p>
              <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
                {SCORE.map(([k, word, meaning]) => (
                  <li key={k} className="flex items-center gap-3 text-[14px]">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full border-2 border-parish-navy text-parish-navy font-bold" aria-hidden>{k}</span>
                    <span><strong className="text-parish-ink">{word}</strong> <span className="text-parish-muted">— {meaning}</span></span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel className="px-5 py-4">
              <div className="font-semibold text-[15px] text-parish-navy mb-1">The member's status</div>
              <p className="m-0 mb-3 text-[13.5px] text-parish-muted">Suggested from the answers; you can always choose another.</p>
              <ul className="m-0 p-0 list-none flex flex-col gap-2">
                {MEMBERSHIP_STATUSES.map((s) => (
                  <li key={s} className="flex items-center gap-3 text-[14px]">
                    <span className="w-[118px] flex-none"><Badge tone={STATUS_TONES[s]}>{s}</Badge></span>
                    <span className="text-parish-text2">{STATUS_NOTES[s]}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          {/* Good to know. */}
          <h2 className="mt-0 mb-3 font-serif text-[24px] font-semibold text-parish-navy">Good to know</h2>
          <div className="grid gap-3 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(min(260px,100%),1fr))' }}>
            {[
              'Starting or closing a census never changes anyone\'s records. Only saving a household\'s answers, or approving an update, does.',
              'One household can have both active and inactive members — each member gets their own status.',
              'A family can send their online update again; it replaces the one before, and staff see only the latest.',
              'After five wrong codes in a row, the online form locks that household for 15 minutes.',
              'A census started by mistake can be deleted under Edit → Delete this census…, while it has no answers worth keeping.',
              'Read-only and clergy accounts can follow the census but not record answers.',
            ].map((t) => (
              <div key={t} className="flex gap-3 px-4 py-3 rounded-xl border border-parish-border bg-parish-card text-[13.5px] text-parish-text2 leading-relaxed">
                <span className="text-parish-gold flex-none mt-0.5"><Icon name="bulb" size={20} /></span>
                <span>{t}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-center pt-2 pb-4">
            <Link to="/admin/census" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-parish-fill text-white font-semibold text-[14.5px] no-underline shadow-btn">
              Go to the Census page <span aria-hidden>→</span>
            </Link>
          </div>
        </div>
      </PageBody>
    </>
  );
}
