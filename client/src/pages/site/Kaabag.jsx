import React from 'react';
import { Icon } from '../../components/site/Icons.jsx';
import { BAND_PAD, Band, BigButton, Card, DataState, Eyebrow, PageHeader, Skeletons, WRAP, useShare } from '../../components/site/kit.jsx';
import { fmtLong, fmtTime12 } from '../../lib/site.js';
import { todayIso } from '../../lib/website.js';
import { KAABAG_PAGE, groupMonths, groupSundays, isKaabagGroup, monthTitle, peopleLines } from '../../lib/kaabag.js';
import { groupInterestPath, groupPath } from '../../lib/groups.js';
import { useSiteTitle } from './SiteLayout.jsx';
import { listState, useGroups, useKaabagSchedule } from './data.js';

/**
 * /simbahan/kaabag: who serves at each Sunday Mass. The next Sunday first, in
 * big cards, then the rest of what's scheduled by month. The office makes the
 * schedule (Parish Website → Kaabag Schedule). A person shows by name only
 * once they've agreed; the others are just counted (peopleLines).
 */
export default function Kaabag() {
  useSiteTitle('Mga Kaabag');
  const q = listState(useKaabagSchedule());
  const share = useShare();
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
