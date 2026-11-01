import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { BAND_PAD, Band, BigButton, Card, DataState, Eyebrow, PageHeader, Skeleton, Skeletons, WRAP, useShare } from '../../components/site/kit.jsx';
import { KaabagChart, useKaabagChart } from '../../components/site/OrgCharts.jsx';
import { BIS_MONTHS_SHORT, fmtTime12, initialsOf, parseIso } from '../../lib/site.js';
import { todayIso } from '../../lib/website.js';
import { KAABAG_PAGE, groupMonths, groupSundays, isKaabagGroup, monthTitle, peopleLines, unnamedCount } from '../../lib/kaabag.js';
import { groupInterestPath, groupPath } from '../../lib/groups.js';
import { useSiteTitle } from './SiteLayout.jsx';
import { listState, useGroups, useKaabagDirectory, useKaabagSchedule } from './data.js';

/**
 * /simbahan/kaabag: who serves at each Sunday Mass, a table for each month
 * (made to be screenshotted for the group chat). The office makes the
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
  const sundays = groupSundays(q.rows);
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
          <div className="flex flex-col gap-6 lg:gap-10">
            {groupMonths(sundays).map((m) => <MonthTable key={m.month} month={m.month} sundays={m.sundays} next={sundays[0]?.date} />)}
          </div>
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

/**
 * A month's schedule as one table, so a Kaabag can screenshot it whole and
 * send it to the group chat: a row for each Mass, its Sunday's date spanning
 * them. The heading is inside the table, so the screenshot says what it is.
 * The first Sunday shown (today's, or the next) is marked.
 */
function MonthTable({ month, sundays, next }) {
  const cell = 'px-3 py-2.5 lg:px-4 lg:py-3 align-top border-t border-[#efe5cf]';
  return (
    <Card className="overflow-hidden lg:rounded-[18px] max-w-[860px]">
      <table className="w-full border-collapse text-left">
        <caption className="px-3 py-3 lg:px-4 bg-parish-navy text-white text-left">
          <span className="block text-[11.5px] font-bold tracking-[.12em] uppercase text-[var(--p-gold)]">Iskedyul sa mga Kaabag</span>
          <span className="block font-serif text-[24px] lg:text-[28px] font-bold leading-tight">{monthTitle(month)}</span>
        </caption>
        <thead>
          <tr className="bg-[#fbf7ef] text-[12px] font-bold tracking-[.08em] uppercase text-parish-text2">
            <th scope="col" className="px-3 py-2 lg:px-4 w-[84px] lg:w-[120px]">Domingo</th>
            <th scope="col" className="px-3 py-2 lg:px-4 w-[104px] lg:w-[200px]">Misa</th>
            <th scope="col" className="px-3 py-2 lg:px-4">Mga Kaabag</th>
          </tr>
        </thead>
        <tbody>
          {sundays.map((s) => {
            const isNext = s.date === next;
            return s.masses.map((m, i) => (
              <tr key={`${s.date}-${i}`} className={`${isNext ? 'bg-[var(--p-blue-tint)]' : ''} ${i === 0 ? '[&>*]:border-t-2 [&>*]:border-t-[#e2d4b4]' : ''}`}>
                {i === 0 && (
                  <th scope="rowgroup" rowSpan={s.masses.length} className={`${cell} border-r ${isNext ? '' : 'bg-[#fdfaf3]'}`}>
                    <span className="block font-serif text-[26px] lg:text-[30px] font-bold leading-none text-parish-navy">{parseIso(s.date).getDate()}</span>
                    <span className="block mt-0.5 text-[12.5px] font-semibold text-parish-text2">{BIS_MONTHS_SHORT[parseIso(s.date).getMonth()]}</span>
                    {isNext && <span className="inline-block mt-1.5 px-1.5 py-0.5 rounded bg-parish-blue text-white text-[10.5px] font-bold tracking-[.06em] uppercase">{s.date === todayIso() ? 'Karon' : 'Sunod'}</span>}
                  </th>
                )}
                <td className={cell}>
                  <span className="block font-serif text-[18px] lg:text-[20px] font-bold leading-tight text-parish-blue whitespace-nowrap">{fmtTime12(m.time)}</span>
                  <span className="block text-[12.5px] lg:text-[13.5px] leading-snug text-parish-text2">{massPlace(m)}</span>
                </td>
                <td className={cell}><People names={m.names} className="text-[15px] lg:text-[16px]" /></td>
              </tr>
            ));
          })}
        </tbody>
      </table>
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
