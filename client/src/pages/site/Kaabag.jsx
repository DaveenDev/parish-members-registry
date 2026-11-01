import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { BAND_PAD, Band, BigButton, Card, DataState, Eyebrow, PageHeader, Skeleton, Skeletons, WRAP, useShare } from '../../components/site/kit.jsx';
import { KaabagChart, useKaabagChart } from '../../components/site/OrgCharts.jsx';
import { fmtLong, fmtTime12, initialsOf } from '../../lib/site.js';
import { todayIso } from '../../lib/website.js';
import { KAABAG_PAGE, groupMonths, groupSundays, isKaabagGroup, monthTitle, peopleLines, unnamedCount } from '../../lib/kaabag.js';
import { groupInterestPath, groupPath } from '../../lib/groups.js';
import { useSiteTitle } from './SiteLayout.jsx';
import { listState, useGroups, useKaabagDirectory, useKaabagSchedule } from './data.js';

/**
 * /simbahan/kaabag: who serves at each Sunday Mass. The next Sunday first, in
 * big cards, then the rest of what's scheduled by month. The office makes the
 * schedule (Parish Website → Kaabag Schedule). A person shows by name only
 * once they've agreed; the others are just counted (peopleLines). Then the
 * directory (names and photos, again only of those who agreed) and the
 * Kaabag Structure chart, once it's published.
 */
export default function Kaabag() {
  useSiteTitle('Mga Kaabag');
  const q = listState(useKaabagSchedule());
  const chart = useKaabagChart();
  const share = useShare();

  // A link to one of the sections (Organization Structure's "View on the
  // website" opens #estruktura): there once it has loaded, the one time.
  const { hash } = useLocation();
  const arrived = useRef(false);
  useEffect(() => {
    const id = hash.slice(1);
    if (arrived.current || !id || q.loading || (id === 'estruktura' && !chart)) return;
    arrived.current = true;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
  }, [hash, q.loading, chart]);
  const [next, ...later] = groupSundays(q.rows);
  return (
    <main className="animate-fadeUp">
      <Band as="div">
        <div className={`${WRAP} ${BAND_PAD}`}>
          <PageHeader eyebrow="Pag-alagad sa Misa" title="Mga Kaabag">
            <button
              type="button" onClick={() => share('Mga Kaabag', KAABAG_PAGE)}
              className="flex-none min-h-[44px] px-4 inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-[var(--p-blue-border)] bg-parish-card font-bold text-[14.5px] text-parish-blueDeep cursor-pointer hover:bg-[var(--p-blue-tint)]"
            >
              <Icon name="share" size={17} />Ipaambit
            </button>
          </PageHeader>
          <p className="m-0 mt-3 lg:mt-0 text-[15px] lg:text-[16.5px] leading-normal text-[#4d4636] lg:max-w-[760px]">
            Kinsa ang mag-alagad sa matag Misa sa Domingo. Gi-andam ang iskedyul matag bulan. Kon dili ka makaalagad sa imong petsa, palihug pahibaloa dayon ang opisina sa parokya.
          </p>
        </div>
      </Band>

      <section aria-label="Iskedyul sa mga Kaabag" className={`${WRAP} py-7 lg:py-12`}>
        <DataState
          state={q}
          skeleton={<Skeletons n={3} h={130} />}
          errorText="Wala ma-load ang iskedyul. Susiha ang inyong koneksyon."
          empty={q.empty}
          emptyText="Wala pay iskedyul sa mga Kaabag. Balik unya o pangutana sa opisina sa parokya."
        >
          {next && <NextSunday sunday={next} />}
          {groupMonths(later).map((m) => (
            <section key={m.month} aria-labelledby={`bulan-${m.month}`} className="mt-8 lg:mt-12">
              <h2 id={`bulan-${m.month}`} className="m-0 mb-3 lg:mb-4 font-serif text-[26px] lg:text-[32px] font-bold text-parish-navy leading-tight">{monthTitle(m.month)}</h2>
              <div className="grid gap-3 lg:grid-cols-2 lg:gap-4">
                {m.sundays.map((s) => <SundayCard key={s.date} sunday={s} />)}
              </div>
            </section>
          ))}
        </DataState>
      </section>

      <Directory />

      {chart && (
        <section id="estruktura" aria-labelledby="estruktura-title" className="scroll-mt-16 lg:scroll-mt-[76px] py-8 lg:py-14">
          <div className={WRAP}>
            <div data-reveal className="mb-3 lg:mb-[22px]">
              <Eyebrow>Mga opisyal</Eyebrow>
              <h2 id="estruktura-title" className="m-0 font-serif text-[30px] lg:text-[40px] font-bold text-parish-navy leading-tight">Estruktura sa Kaabag</h2>
            </div>
            <Card className="p-3.5 lg:p-5 lg:rounded-[20px]"><KaabagChart chart={chart} /></Card>
          </div>
        </section>
      )}

      <JoinKaabag />
    </main>
  );
}

/** Today's Sunday, or the next one: a card for each Mass. */
function NextSunday({ sunday }) {
  return (
    <section aria-labelledby="sunod-nga-domingo">
      <Eyebrow>{sunday.date === todayIso() ? 'Karong Domingo' : 'Sunod nga Domingo'}</Eyebrow>
      <h2 id="sunod-nga-domingo" className="m-0 mb-3 lg:mb-4 font-serif text-[30px] lg:text-[40px] font-bold text-parish-navy leading-tight">{fmtLong(sunday.date)}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
        {sunday.masses.map((m, i) => (
          <Card key={i} className="p-4 lg:p-5 lg:rounded-[18px]">
            <div className="font-serif text-[28px] lg:text-[32px] font-bold leading-none text-parish-blue">{fmtTime12(m.time)}</div>
            <div className="mt-1 text-[14.5px] text-parish-text2">{massPlace(m)}</div>
            <People names={m.names} className="mt-3 pt-3 border-t border-[#f0e8d6] text-[16.5px]" />
          </Card>
        ))}
      </div>
    </section>
  );
}

/** One later Sunday: its date, then a row for each Mass. */
function SundayCard({ sunday }) {
  return (
    <Card className="overflow-hidden lg:rounded-[18px]">
      <h3 className="m-0 px-3.5 py-2.5 lg:px-4 lg:py-3 bg-[#fbf7ef] border-b border-[#f0e8d6] font-serif text-[20px] lg:text-[22px] font-bold text-parish-navy">{fmtLong(sunday.date)}</h3>
      <ul className="list-none m-0 p-0">
        {sunday.masses.map((m, i) => (
          <li key={i} className="flex gap-3 px-3.5 py-3 lg:px-4 border-t border-[#f4eddd] first:border-t-0">
            <div className="w-[92px] flex-none">
              <div className="font-serif text-[20px] font-bold leading-tight text-parish-blue">{fmtTime12(m.time)}</div>
              <div className="text-[13px] leading-snug text-parish-text2">{massPlace(m)}</div>
            </div>
            <People names={m.names} className="min-w-0 flex-1 text-[15.5px]" />
          </li>
        ))}
      </ul>
    </Card>
  );
}

const massPlace = (m) => [m.location, m.language].filter(Boolean).join(' · ');

/** Who serves a Mass, each on a line. */
function People({ names, className = '' }) {
  const lines = peopleLines(names);
  return (
    <div className={`font-semibold leading-snug text-parish-ink ${className}`}>
      {lines.length ? lines.map((line) => <div key={line}>{line}</div>) : <div className="font-normal text-parish-text2">—</div>}
    </div>
  );
}

/**
 * Direktoryo sa Kaabag: a card with the photo and name of each Kaabag who
 * agreed to be shown (0115). The others are only counted. Nothing at all while
 * nobody agreed, so the page doesn't open on an empty section.
 */
function Directory() {
  const q = useKaabagDirectory();
  const people = q.data?.people || [];
  if (q.error || (!q.loading && !people.length)) return null;
  const hidden = unnamedCount(q.data);
  return (
    <Band as="section" id="direktoryo" aria-labelledby="direktoryo-title" className="scroll-mt-16 lg:scroll-mt-[76px] border-t">
      <div className={`${WRAP} ${BAND_PAD}`}>
        <div data-reveal className="mb-3 lg:mb-[22px]">
          <Eyebrow>Mga sakop</Eyebrow>
          <h2 id="direktoryo-title" className="m-0 font-serif text-[30px] lg:text-[40px] font-bold text-parish-navy leading-tight">Direktoryo sa Kaabag</h2>
        </div>
        {q.loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={190} alt={i % 2 === 1} />)}</div>
        ) : (
          <>
            <ul className="list-none m-0 p-0 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 lg:gap-4">
              {people.map((p, i) => (
                <li key={`${p.name}-${i}`} className="bg-parish-card border border-parish-border rounded-2xl shadow-cardSm px-3 pt-4 pb-3.5 lg:px-4 lg:pt-5 flex flex-col items-center text-center">
                  {p.photo
                    ? <img src={p.photo} alt="" loading="lazy" className="w-[88px] h-[88px] lg:w-[104px] lg:h-[104px] rounded-full object-cover border-2 border-[var(--p-gold)] bg-[#efe6d3]" />
                    : <span aria-hidden className="w-[88px] h-[88px] lg:w-[104px] lg:h-[104px] rounded-full flex items-center justify-center font-bold text-white text-[30px] lg:text-[34px] border-2 border-[var(--p-gold)]" style={{ background: 'var(--p-navy)' }}>{initialsOf(p.name)}</span>}
                  <div className="mt-2.5 font-serif font-bold text-[17px] lg:text-[19px] leading-tight text-parish-navy [overflow-wrap:anywhere]">{p.name}</div>
                </li>
              ))}
            </ul>
            {hidden > 0 && <p className="m-0 mt-4 text-[14px] text-parish-text2">Dugang {hidden} ka Kaabag nga wala pa mohatag og pagtugot nga ipakita ang ilang ngalan.</p>}
          </>
        )}
      </div>
    </Band>
  );
}

/** Once the office lists the Kaabag under Mga Grupo: what it is, and how to join. */
function JoinKaabag() {
  const groups = listState(useGroups());
  const g = groups.rows.find((x) => x.kind === 'ministry' && isKaabagGroup(x.name));
  if (!g) return null;
  return (
    <Band className="border-t">
      <div className={`${WRAP} ${BAND_PAD} lg:flex lg:items-center lg:justify-between lg:gap-8`}>
        <div className="lg:max-w-[720px]">
          <h2 className="m-0 mb-1.5 font-serif text-[26px] lg:text-[32px] font-bold text-parish-navy leading-tight">Gusto ka mag-alagad?</h2>
          {g.blurb && <p className="m-0 mb-3 lg:mb-0 text-[15.5px] lg:text-[16.5px] leading-normal text-[#3f3b2f]">{g.blurb}</p>}
        </div>
        <div className="flex flex-col gap-2.5 sm:flex-row lg:flex-none">
          <BigButton to={groupInterestPath(g)} className="lg:w-auto lg:px-7"><Icon name="heart" size={19} />Interesado ko</BigButton>
          <BigButton to={groupPath(g)} variant="secondary" className="lg:w-auto lg:px-6">Dugang detalye</BigButton>
        </div>
      </div>
    </Band>
  );
}
