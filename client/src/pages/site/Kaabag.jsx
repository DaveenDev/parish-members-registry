import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { BAND_PAD, Band, Card, DataState, EmptyNote, Eyebrow, Pills, Skeleton, WRAP } from '../../components/site/kit.jsx';
import { KaabagChart, useKaabagChart } from '../../components/site/OrgCharts.jsx';
import { BIS_MONTHS, fmtDayMonth, fmtTime12, initialsOf } from '../../lib/site.js';
import { monthDays, monthNames, monthTitle, pickMonth } from '../../lib/kaabag.js';
import { todayIso } from '../../lib/website.js';
import { useKaabag } from './data.js';
import { useSiteTitle } from './SiteLayout.jsx';

// Below the sticky header (58px on phones, 76px on desktop).
const SECTION_MT = 'scroll-mt-16 lg:scroll-mt-[76px]';
const NO_SCROLLBAR = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/**
 * Kaabag (/simbahan/kaabag, under Ang Simbahan in the menu): who serves at
 * each Mass this month (Parish Website → Kaabag → Mass Rotation, once the
 * month is published), then the directory of Kaabag with their photos
 * (→ Directory), then the Kaabag Structure from Organization Structure,
 * once it's published.
 */
export default function Kaabag() {
  useSiteTitle('Kaabag');
  const q = useKaabag();
  const chart = useKaabagChart();
  const months = q.data?.months || [];
  const directory = q.data?.directory || [];

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

  return (
    <main className="animate-fadeUp">
      <Band aria-labelledby="kaabag-title">
        <div className={`${WRAP} ${BAND_PAD}`}>
          <div className="site-stagger lg:flex lg:items-end lg:justify-between lg:gap-6">
            <div className="site-stagger lg:max-w-[640px]">
              <Eyebrow>Ministeryo sa Parokya</Eyebrow>
              <h1 id="kaabag-title" className="font-serif font-semibold text-[32px] lg:text-[46px] leading-[1.08] mt-0.5 mb-2 text-parish-navy">Kaabag</h1>
              <p className="m-0 mb-3.5 lg:mb-0 text-[15.5px] lg:text-[17px] leading-normal text-[#3f3b2f]">
                Kinsa ang moalagad sa matag Misa karong bulana, ug ang mga sakop sa Kaabag.
              </p>
            </div>
            <nav aria-label="Niini nga panid" className={`flex gap-2 overflow-x-auto ${NO_SCROLLBAR} -mx-3.5 px-3.5 lg:mx-0 lg:px-0 lg:flex-wrap lg:flex-none`}>
              <Jump to="iskedyul" icon="clock">Iskedyul ↓</Jump>
              <Jump to="direktoryo" icon="people">Direktoryo ↓</Jump>
              {chart && <Jump to="estruktura" icon="grid">Estruktura ↓</Jump>}
            </nav>
          </div>
        </div>
      </Band>

      <section id="iskedyul" aria-labelledby="iskedyul-title" className={`${SECTION_MT} py-7 lg:py-12`}>
        <div className={WRAP}>
          <DataState
            state={q}
            skeleton={<><Skeleton h={44} className="mb-4 max-w-[320px]" /><div className="grid gap-3.5 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} h={180} alt={i % 2 === 1} />)}</div></>}
            errorText="Wala ma-load ang iskedyul sa Kaabag. Susiha ang inyong koneksyon."
          >
            <Rotation months={months} />
          </DataState>
        </div>
      </section>

      <Band as="section" id="direktoryo" aria-labelledby="direktoryo-title" className={`${SECTION_MT} border-t`}>
        <div className={`${WRAP} ${BAND_PAD}`}>
          <div data-reveal className="mb-3 lg:mb-[22px]">
            <Eyebrow>Mga sakop</Eyebrow>
            <h2 id="direktoryo-title" className="m-0 font-serif text-[30px] lg:text-[40px] font-bold text-parish-navy leading-tight">Direktoryo sa Kaabag</h2>
          </div>
          <DataState
            state={q}
            skeleton={<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} h={190} alt={i % 2 === 1} />)}</div>}
            errorText="Wala ma-load ang direktoryo."
            empty={!q.loading && !q.error && !directory.length}
            emptyText="Wala pay direktoryo sa Kaabag nga gi-publish."
          >
            <Directory rows={directory} />
          </DataState>
        </div>
      </Band>

      {chart && (
        <section id="estruktura" aria-labelledby="estruktura-title" className={`${SECTION_MT} py-8 lg:py-14`}>
          <div className={WRAP}>
            <div data-reveal className="mb-3 lg:mb-[22px]">
              <Eyebrow>Mga opisyal</Eyebrow>
              <h2 id="estruktura-title" className="m-0 font-serif text-[30px] lg:text-[40px] font-bold text-parish-navy leading-tight">Estruktura sa Kaabag</h2>
            </div>
            <Card className="p-3.5 lg:p-5 lg:rounded-[20px]"><KaabagChart chart={chart} /></Card>
          </div>
        </section>
      )}
    </main>
  );
}

function Jump({ to, icon, children }) {
  return (
    <button
      type="button" onClick={() => scrollTo(to)}
      className="flex-none min-h-[40px] px-3 sm:px-3.5 inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-[var(--p-blue-border)] bg-parish-card font-bold text-[14px] text-parish-blueDeep cursor-pointer appearance-none hover:bg-[var(--p-blue-tint)]"
    >
      <Icon name={icon} size={16} className="hidden sm:block" />{children}
    </button>
  );
}

/**
 * The month's rotation: a card per day with its Masses and their Kaabag.
 * Days already past are dimmed. With more than one month published, pills
 * switch between them; "Pangitaa ang imong turno" keeps one Kaabag's turns.
 */
function Rotation({ months }) {
  const today = todayIso();
  const [picked, setPicked] = useState(null);
  const [name, setName] = useState('');
  const month = months.find((m) => m.month === picked) || pickMonth(months, today);
  const names = useMemo(() => monthNames(month), [month]);
  const who = names.includes(name) ? name : '';
  const days = useMemo(() => monthDays(month, who), [month, who]);

  const head = (
    <div data-reveal className="mb-3 lg:mb-[22px]">
      <Eyebrow>Iskedyul sa Serbisyo</Eyebrow>
      <h2 id="iskedyul-title" className="m-0 font-serif text-[30px] lg:text-[40px] font-bold text-parish-navy leading-tight">
        {month ? monthTitle(month.month) : 'Iskedyul sa Misa'}
      </h2>
    </div>
  );
  if (!month) return <>{head}<EmptyNote>Wala pay iskedyul sa Kaabag nga gi-publish karong bulana. Pangutana sa opisina sa parokya.</EmptyNote></>;

  return (
    <>
      <div className="lg:flex lg:items-end lg:justify-between lg:gap-6">
        {head}
        {months.length > 1 && (
          <Pills
            scroll className="mb-4 lg:mb-[22px]"
            options={months.map((m) => [m.month, BIS_MONTHS[Number(m.month.slice(5, 7)) - 1]])}
            value={month.month} onChange={(m) => { setPicked(m); setName(''); }}
          />
        )}
      </div>

      {month.note && (
        <div className="flex gap-2.5 items-start rounded-[14px] px-3.5 py-3 lg:px-[18px] mb-4 lg:mb-[22px] border text-[14.5px] lg:text-[15.5px] leading-[1.45] text-[#3f3b2f]" style={{ background: 'var(--p-gold-tint)', borderColor: 'color-mix(in srgb, var(--p-gold) 45%, white)' }}>
          <Icon name="alert" className="text-[var(--p-gold-deep)] mt-px" />
          <div className="whitespace-pre-line">{month.note}</div>
        </div>
      )}

      {names.length > 1 && (
        <div className="mb-[18px] lg:mb-[22px]">
          <label htmlFor="kaabag-who" className="block font-semibold text-[13px] lg:font-bold lg:text-[13.5px] mb-[5px] lg:mb-1.5">Pangitaa ang imong turno</label>
          <select
            id="kaabag-who" value={who} onChange={(e) => setName(e.target.value)}
            className="w-full min-h-[48px] px-3.5 text-[16px] text-parish-ink bg-parish-card border-[1.5px] border-parish-borderSoft rounded-xl lg:w-[320px] lg:min-h-[46px] lg:text-[15.5px]"
          >
            <option value="">Tanang Kaabag</option>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      )}

      {!days.length ? (
        <EmptyNote>{who ? `Walay turno si ${who} niining bulana.` : 'Wala pay Misa sa iskedyul niining bulana.'}</EmptyNote>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3 items-start">
          {days.map((d) => <DayCard key={d.date} day={d} today={today} who={who} />)}
        </div>
      )}
    </>
  );
}

function DayCard({ day, today, who }) {
  const isToday = day.date === today;
  const past = day.date < today;
  return (
    <section
      aria-label={fmtDayMonth(day.date)}
      className={`bg-parish-card border rounded-2xl lg:rounded-[18px] shadow-cardSm overflow-hidden ${isToday ? 'border-[var(--p-blue-border)] ring-2 ring-[var(--p-blue-border)]' : 'border-parish-border'} ${past ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-2 flex-wrap px-3.5 py-2.5 lg:px-4 lg:py-3 bg-[#fbf7ef] border-b border-[#f0e8d6]">
        <h3 className="m-0 font-serif text-[20px] lg:text-[22px] font-bold text-parish-navy">{fmtDayMonth(day.date)}</h3>
        {isToday && <span className="font-bold text-[11px] tracking-[.08em] uppercase border rounded-md px-[7px] py-0.5 text-parish-blueDeep" style={{ background: 'var(--p-blue-tint)', borderColor: 'var(--p-blue-border)' }}>Karong adlawa</span>}
      </div>
      {day.slots.map((s, i) => (
        <div key={i} className="px-3.5 py-3 lg:px-4 border-t border-[#f4eddd] first:border-t-0">
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <span className="font-serif font-bold text-[22px] text-parish-blue">{fmtTime12(s.time)}</span>
            {s.location && <span className="text-[14px] text-parish-text2">{s.location}</span>}
          </div>
          {s.note && <div className="text-[13.5px] font-semibold text-[var(--p-gold-deep)] mt-0.5">{s.note}</div>}
          {s.servers.length ? (
            <ul className="list-none m-0 mt-2 p-0 flex flex-wrap gap-1.5">
              {s.servers.map((k) => (
                <li
                  key={k.name}
                  className={`inline-flex items-center gap-2 pl-1 pr-3 py-1 rounded-full border text-[14px] font-semibold ${k.name === who ? 'bg-parish-blue border-parish-blue text-white' : 'bg-parish-bg border-[#eee3ce] text-parish-ink'}`}
                >
                  <Person photo={k.photo} name={k.name} size={28} />
                  {k.name}
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-1.5 text-[14px] italic text-parish-text2">Wala pay naka-iskedyul</div>
          )}
        </div>
      ))}
    </section>
  );
}

/** A Kaabag's round photo, or their initials. */
function Person({ photo, name, size }) {
  if (photo) return <img src={photo} alt="" loading="lazy" className="rounded-full object-cover flex-none bg-[#efe6d3]" style={{ width: size, height: size }} />;
  return (
    <span aria-hidden className="rounded-full flex-none flex items-center justify-center font-bold text-white" style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: 'var(--p-navy)' }}>
      {initialsOf(name)}
    </span>
  );
}

/** The directory: a card per Kaabag with their photo, name and role; a search once there are many. */
function Directory({ rows }) {
  const [query, setQuery] = useState('');
  const term = query.trim().toLowerCase();
  const shown = term ? rows.filter((k) => `${k.name} ${k.role || ''}`.toLowerCase().includes(term)) : rows;
  return (
    <>
      <div className="flex items-center gap-3 flex-wrap mb-4 lg:mb-5">
        <p className="m-0 text-[15px] lg:text-[16px] text-[#4d4636]">{rows.length} ka sakop</p>
        {rows.length > 12 && (
          <label className="relative ml-auto w-full sm:w-[300px]">
            <span className="sr-only">Pangitaa og ngalan</span>
            <Icon name="search" size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-parish-text2" />
            <input
              type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pangitaa og ngalan"
              className="w-full min-h-[46px] pl-10 pr-3.5 text-[16px] lg:text-[15.5px] text-parish-ink bg-parish-card border-[1.5px] border-parish-borderSoft rounded-xl"
            />
          </label>
        )}
      </div>
      {!shown.length ? <EmptyNote>Walay Kaabag nga mohaum sa “{query.trim()}”.</EmptyNote> : (
        <ul className="list-none m-0 p-0 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 lg:gap-4">
          {shown.map((k) => (
            <li key={k.id} className="bg-parish-card border border-parish-border rounded-2xl shadow-cardSm px-3 pt-4 pb-3.5 lg:px-4 lg:pt-5 flex flex-col items-center text-center">
              {k.photo
                ? <img src={k.photo} alt="" loading="lazy" className="w-[88px] h-[88px] lg:w-[104px] lg:h-[104px] rounded-full object-cover border-2 border-[var(--p-gold)] bg-[#efe6d3]" />
                : <span aria-hidden className="w-[88px] h-[88px] lg:w-[104px] lg:h-[104px] rounded-full flex items-center justify-center font-bold text-white text-[30px] lg:text-[34px] border-2 border-[var(--p-gold)]" style={{ background: 'var(--p-navy)' }}>{initialsOf(k.name)}</span>}
              <div className="mt-2.5 font-serif font-bold text-[17px] lg:text-[19px] leading-tight text-parish-navy [overflow-wrap:anywhere]">{k.name}</div>
              {k.role && <div className="mt-1 font-bold text-[11px] tracking-[.1em] uppercase text-[var(--p-eyebrow)]">{k.role}</div>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
