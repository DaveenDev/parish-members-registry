import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { DataState, EmptyNote, PAGE, PageHeader, Pills, Segmented, Skeleton, Skeletons } from '../../components/site/kit.jsx';
import { EventCard, MassRow, eventTone } from '../../components/site/cards.jsx';
import {
  BIS_DAYS_SHORT, BIS_MONTHS_SHORT, EVENT_ICONS, EVENT_TYPE_LABELS, MASS_LANGUAGE_FILTERS, agendaDays, calendarMonths, eventsOnDay, fmtTime12,
  massKindLabel, massLocations, massSections, massShortLabel, massesOnDay, monthCells, monthLabel, parseIso,
} from '../../lib/site.js';
import { EVENT_TYPES, massType, todayIso } from '../../lib/website.js';
import { listState, useAnnouncements, useEvents, useMassSchedule, useSacramentGuides } from './data.js';

/** Misa ug Kalihokan: the weekly Mass schedule (with the sacrament guides below it) and the events agenda. */
export default function Misa() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'kalendaryo' ? 'events' : 'sched';
  const setView = (v) => setParams(v === 'events' ? { view: 'kalendaryo' } : {}, { replace: true });

  return (
    <main className={PAGE}>
      <PageHeader eyebrow="Misa ug Kalihokan" title="Iskedyul sa parokya">
        <Segmented label="Iskedyul" options={[['sched', 'Iskedyul sa Misa'], ['events', 'Kalendaryo']]} value={view} onChange={setView} />
      </PageHeader>
      {view === 'sched' ? (
        <>
          <MassSchedule />
          <SacramentGuides jump={params.get('view') === 'sakramento'} />
        </>
      ) : <EventsAgenda />}
    </main>
  );
}

// The guides people ask about most come first; the rest follow the office's order.
const GUIDE_FIRST = ['baptism', 'wedding', 'ocia'];
const guideRank = (g) => (GUIDE_FIRST.includes(g.key) ? GUIDE_FIRST.indexOf(g.key) : GUIDE_FIRST.length + (g.sort || 0));

/**
 * Mga Sakramento, the section under the Mass schedule: what to bring and the
 * steps for each sacrament, one guide at a time. Hidden until guides are
 * published. `jump` (a ?view=sakramento link) scrolls down to it.
 */
function SacramentGuides({ jump = false }) {
  const q = listState(useSacramentGuides());
  const guides = [...q.rows].sort((a, b) => guideRank(a) - guideRank(b) || a.id - b.id);
  const [key, setKey] = useState('');
  const g = guides.find((x) => x.key === key) || guides[0];
  const ref = useRef(null);
  useEffect(() => { if (jump && guides.length) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [jump, guides.length]);

  if (q.loading || q.error || !guides.length) return null;
  return (
    <section ref={ref} id="sakramento" aria-labelledby="sakramento-title" className="mt-8 lg:mt-12 scroll-mt-24">
      <h2 id="sakramento-title" className="m-0 font-serif text-[28px] lg:text-[34px] font-bold text-parish-navy leading-tight">Mga Sakramento</h2>
      <p className="m-0 mt-1 mb-3.5 lg:mb-5 text-[15px] lg:text-[16px] leading-normal text-[#4d4636] lg:max-w-[760px]">
        Unsa ang dad-on ug unsa ang mga lakang sa matag sakramento. Palihug duol sa opisina sa parokya una sa tanan aron makumpirma.
      </p>
      {guides.length > 1 && <Pills scroll className="mb-4 lg:mb-5" options={guides.map((x) => [x.key, x.title])} value={g?.key} onChange={setKey} />}
      {g && <GuideCard g={g} />}
    </section>
  );
}

function GuideCard({ g }) {
  const steps = (g.steps || []).filter((s) => s.title || s.detail);
  const docs = (g.requirements || []).filter(Boolean);
  const extras = [['Iskedyul', g.schedule, 'clock'], ['Donasyon', g.fees, 'heart'], ['Pahinumdom', g.notes, 'alert']].filter(([, v]) => v);
  return (
    <article className="bg-parish-card border border-parish-border rounded-2xl lg:rounded-[18px] shadow-cardSm overflow-hidden">
      <header className="px-4 py-3.5 lg:px-6 lg:py-5 bg-[#fbf7ef] border-b border-[#f0e8d6]">
        <h3 className="m-0 font-serif text-[24px] lg:text-[28px] font-bold text-parish-navy leading-tight">{g.title}</h3>
        {g.summary && <p className="m-0 mt-1.5 text-[15px] lg:text-[16px] leading-normal text-[#4d4636] lg:max-w-[820px]">{g.summary}</p>}
      </header>
      <div className="grid gap-5 p-4 lg:p-6 lg:grid-cols-2 lg:gap-8">
        {docs.length > 0 && (
          <section aria-labelledby={`docs-${g.key}`}>
            <h4 id={`docs-${g.key}`} className="m-0 mb-2.5 font-bold text-[13px] tracking-[.1em] uppercase text-[var(--p-gold-deep)]">Mga dokumento nga dad-on</h4>
            <ul className="list-none m-0 p-0 flex flex-col gap-2">
              {docs.map((d, i) => (
                <li key={i} className="flex gap-2.5 items-start text-[15px] leading-snug text-parish-ink">
                  <span className="w-5 h-5 mt-px flex-none rounded border-[1.5px] border-parish-borderSoft bg-parish-card" aria-hidden />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {steps.length > 0 && (
          <section aria-labelledby={`steps-${g.key}`}>
            <h4 id={`steps-${g.key}`} className="m-0 mb-2.5 font-bold text-[13px] tracking-[.1em] uppercase text-[var(--p-gold-deep)]">Mga lakang</h4>
            <ol className="list-none m-0 p-0 flex flex-col gap-3">
              {steps.map((s, i) => (
                <li key={i} className="flex gap-3 items-start">
                  <span className="w-7 h-7 flex-none rounded-full bg-parish-blue text-white font-bold text-[13px] flex items-center justify-center" aria-hidden>{i + 1}</span>
                  <div className="min-w-0">
                    <div className="font-semibold text-[15px] text-parish-navy leading-snug">{s.title}</div>
                    {s.detail && <div className="text-[14px] leading-snug text-parish-text2 mt-0.5">{s.detail}</div>}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
      {extras.length > 0 && (
        <div className="flex flex-col gap-2.5 px-4 pb-4 lg:px-6 lg:pb-6">
          {extras.map(([label, value, icon]) => (
            <div key={label} className="flex gap-2.5 items-start rounded-xl px-3.5 py-3 border border-[#eee3ce] bg-parish-bg">
              <Icon name={icon} size={18} className="text-[var(--p-gold-deep)] mt-px flex-none" />
              <div className="text-[14.5px] leading-normal text-[#3f3b2f]"><strong className="text-parish-navy">{label}:</strong> {value}</div>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2.5 px-4 pb-4 lg:px-6 lg:pb-6">
        <Link to="/kontak" className="min-h-[44px] px-4 inline-flex items-center rounded-[10px] bg-parish-blue text-white font-bold text-[14.5px] hover:brightness-110">Pangutana sa opisina</Link>
        <Link to="/serbisyo/hangyo/sertipiko" className="min-h-[44px] px-4 inline-flex items-center rounded-[10px] border-[1.5px] border-[var(--p-blue-border)] bg-parish-card text-parish-blueDeep font-bold text-[14.5px] hover:bg-[var(--p-blue-tint)]">Pangayo og sertipiko</Link>
      </div>
    </article>
  );
}

// Desktop columns by how many schedule sections there are, so they share the width evenly.
const SECTION_COLS = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-2 xl:grid-cols-3',
  4: 'lg:grid-cols-2 xl:grid-cols-4',
};

function MassSchedule() {
  const mass = listState(useMassSchedule());
  const ann = listState(useAnnouncements());
  const [location, setLocation] = useState('all');
  const [language, setLanguage] = useState('all');
  const locations = massLocations(mass.rows);
  const sections = massSections(mass.rows, { location, language });
  // The newest "Schedule change" announcement is the special-schedule banner.
  const special = ann.rows.find((a) => a.category === 'Schedule change');

  return (
    <>
      {special && (
        <Link
          to={`/pahibalo/${special.id}`}
          className="flex gap-2.5 lg:gap-3 items-start lg:items-center rounded-[14px] px-3.5 py-3 lg:px-[18px] lg:py-3.5 mb-4 lg:mb-[22px] border"
          style={{ background: 'var(--p-gold-tint)', borderColor: 'color-mix(in srgb, var(--p-gold) 45%, white)' }}
        >
          <Icon name="star" className="text-[var(--p-gold-deep)] mt-px lg:mt-0 lg:w-[22px] lg:h-[22px]" />
          <div className="text-[14.5px] lg:text-[15.5px] leading-[1.45] text-[#3f3b2f]">
            <strong className="text-parish-navy">Espesyal nga iskedyul:</strong> {special.title}
          </div>
        </Link>
      )}

      {mass.rows.length > 0 && (
        <div className="flex flex-col gap-2.5 mb-[18px] lg:flex-row lg:flex-wrap lg:items-end lg:gap-5 lg:mb-[22px]">
          {locations.length > 1 && (
            <div>
              <label htmlFor="f-loc" className="block font-semibold text-[13px] lg:font-bold lg:text-[13.5px] mb-[5px] lg:mb-1.5">Lugar</label>
              <select
                id="f-loc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full min-h-[48px] px-3.5 text-[16px] text-parish-ink bg-parish-card border-[1.5px] border-parish-borderSoft rounded-xl lg:w-[300px] lg:min-h-[46px] lg:text-[15.5px]"
              >
                <option value="all">Tanang simbahan ug kapilya</option>
                {locations.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}
          <div>
            <div className="font-semibold text-[13px] lg:font-bold lg:text-[13.5px] mb-[5px] lg:mb-1.5">Pinulongan</div>
            <Pills options={MASS_LANGUAGE_FILTERS} value={language} onChange={setLanguage} />
          </div>
        </div>
      )}

      <DataState
        state={mass}
        skeleton={<><div className="lg:hidden"><Skeletons n={2} h={120} /></div><div className="hidden lg:grid grid-cols-4 gap-3.5 items-start">{[220, 160, 160, 200].map((h, i) => <Skeleton key={i} h={h} alt={i % 2 === 1} className="rounded-[18px]" />)}</div></>}
        errorText="Wala ma-load ang iskedyul. Susiha ang inyong koneksyon."
        empty={mass.empty}
        emptyText="Wala pay iskedyul nga gi-publish. Tawagi ang opisina para sa oras sa Misa."
      >
        {!sections.length ? <EmptyNote>Walay Misa nga mohaum sa imong pili.</EmptyNote> : (
          <div className={`flex flex-col gap-3.5 lg:grid lg:items-start ${SECTION_COLS[Math.min(sections.length, 4)]}`}>
            {sections.map((s) => (
              <section key={s.key} className="bg-parish-card border border-parish-border rounded-2xl lg:rounded-[18px] shadow-cardSm overflow-hidden">
                <div className="flex items-center gap-2 flex-wrap px-3.5 py-2.5 lg:px-4 lg:py-3 bg-[#fbf7ef] lg:border-b lg:border-[#f0e8d6]">
                  <h3 className="m-0 font-serif text-[21px] lg:text-[23px] font-bold text-parish-navy">{s.title}</h3>
                  {s.today && <MassTag tone="blue">Karong adlawa</MassTag>}
                </div>
                {s.key === 'sunday' && s.rows.map((m) => <MassRow key={m.id} m={m} heading={m.location} />)}
                {s.key === 'daily' && s.rows.map((m) => <MassRow key={m.id} m={m} heading={m.when} />)}
                {s.key === 'other' && s.rows.map((m) => <MassRow key={m.id} m={m} when={m.when} />)}
                {s.key === 'special' && s.blocks.map((b) => (
                  <div key={b.key} className="border-t border-[#f4eddd] first:border-t-0">
                    <div className="px-3.5 pt-3 lg:px-4">
                      <div className="font-serif text-[18px] lg:text-[19px] font-bold text-parish-navy leading-tight">{b.occasion}</div>
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <span className="font-semibold text-[13.5px] text-parish-text2">{b.when}</span>
                        {b.obligation && <MassTag tone="gold">Adlaw nga Obligasyon</MassTag>}
                        {b.today && <MassTag tone="blue">Karon</MassTag>}
                      </div>
                    </div>
                    {b.rows.map((m) => <MassRow key={m.id} m={m} heading={m.location} />)}
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </DataState>
    </>
  );
}

/** Small label beside a schedule heading: "Karong adlawa", "Adlaw nga Obligasyon". */
function MassTag({ tone, children }) {
  const style = tone === 'gold'
    ? { background: 'var(--p-gold-tint)', borderColor: 'color-mix(in srgb, var(--p-gold) 45%, white)', color: 'var(--p-gold-deep)' }
    : { background: 'var(--p-blue-tint)', borderColor: 'var(--p-blue-border)' };
  return (
    <span className={`font-bold text-[11px] tracking-[.08em] uppercase border rounded-md px-[7px] py-0.5 ${tone === 'gold' ? '' : 'text-parish-blueDeep'}`} style={style}>
      {children}
    </span>
  );
}

function EventsAgenda() {
  const events = listState(useEvents());
  // The Masses go on the calendar too; if they fail to load, the events still show.
  const mass = listState(useMassSchedule());
  const masses = mass.error ? [] : mass.rows;
  const today = todayIso();
  const months = calendarMonths(events.rows, today);
  const [month, setMonth] = useState('');
  useEffect(() => { if (months.length && !months.includes(month)) setMonth(months[0]); }, [months.join(), month]);
  const days = month ? agendaDays(events.rows, masses, month, today) : [];
  const types = EVENT_TYPES.filter((t) => events.rows.some((e) => e.type === t));
  const state = { ...events, loading: events.loading || mass.loading };

  return (
    <DataState
      state={state}
      skeleton={<><div className="lg:hidden"><Skeletons n={2} h={84} /></div><Skeleton h={560} className="hidden lg:block rounded-[18px]" /></>}
      errorText="Wala ma-load ang kalendaryo."
      empty={events.empty && !masses.length}
      emptyText="Walay kalihokan o Misa nga naka-iskedyul."
    >
      <div className="lg:flex lg:items-center lg:gap-2 lg:mb-4">
        {months.length > 1 && (
          <Pills dark className="mb-4 lg:mb-0" options={months.map((m) => [m, <>{monthLabel(m)}<span className="hidden lg:inline"> {m.slice(0, 4)}</span></>])} value={month} onChange={setMonth} />
        )}
        <div className="hidden lg:flex flex-wrap gap-x-3.5 gap-y-1.5 ml-auto">
          {masses.length > 0 && (
            <span className="inline-flex items-center gap-[5px] font-semibold text-[13px] text-parish-blueDeep">
              <span className="w-[22px] h-[22px] rounded-md flex items-center justify-center bg-[var(--p-blue-tint)]"><Icon name="church" size={13} /></span>
              Misa
            </span>
          )}
          {types.map((t) => {
            const tone = eventTone({ type: t });
            return (
              <span key={t} className="inline-flex items-center gap-[5px] font-semibold text-[13px]" style={{ color: tone.color }}>
                <span className="w-[22px] h-[22px] rounded-md flex items-center justify-center" style={{ background: tone.background }}><Icon name={EVENT_ICONS[t] || 'cal'} size={13} /></span>
                {EVENT_TYPE_LABELS[t] || t}
              </span>
            );
          })}
        </div>
      </div>
      {month && <MonthCalendar month={month} events={events.rows} masses={masses} today={today} />}
      <div className="flex flex-col gap-[18px] lg:hidden">
        {days.map((g) => {
          const d = parseIso(g.date);
          return (
            <div key={g.date}>
              <h3 className="m-0 mb-2 font-bold text-[13px] tracking-[.1em] uppercase text-[#4d4636]">
                {BIS_DAYS_SHORT[d.getDay()]}, {d.getDate()} {BIS_MONTHS_SHORT[d.getMonth()]}
                {g.date === today && <span className="ml-1.5 text-parish-blueDeep">· Karon</span>}
              </h3>
              <div className="flex flex-col gap-2">
                {g.events.map((e) => <EventCard key={e.id} e={e} />)}
                {g.masses.length > 0 && (
                  <div className="bg-parish-card border border-parish-border rounded-[14px] shadow-cardSm overflow-hidden [&>*:first-child]:border-t-0">
                    {g.masses.map((m) => <MassRow key={m.id} m={m} />)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </DataState>
  );
}

/** One Mass in a calendar cell: a feast stands out like an event; weekly Masses are a quiet time line. */
function CalendarMass({ m }) {
  if (massType(m) === 'Special Mass') {
    return (
      <Link
        to="/misa"
        title={`${fmtTime12(m.start_time)} ${massShortLabel(m)} · ${m.location}`}
        className="mx-1.5 min-h-[24px] flex items-center gap-1 px-1.5 py-[3px] rounded-md font-bold text-[11.5px] leading-[1.2] overflow-hidden hover:brightness-95"
        style={{ background: 'var(--p-gold-tint)', color: 'var(--p-gold-deep)' }}
      >
        <Icon name="star" size={11} /><span className="truncate">{fmtTime12(m.start_time)} {massShortLabel(m)}</span>
      </Link>
    );
  }
  return (
    <div className="px-2.5 text-[11.5px] leading-[1.35] text-parish-text2 truncate" title={`${fmtTime12(m.start_time)} ${massKindLabel(m)} · ${m.location}`}>
      <span className="font-bold text-parish-blueDeep">{fmtTime12(m.start_time)}</span> {massShortLabel(m)}
    </div>
  );
}

/** Desktop month grid. Multi-day events run as one bar across the days they cover. */
function MonthCalendar({ month, events, masses, today }) {
  const cells = monthCells(month);
  return (
    <div className="hidden lg:block">
      <div className="bg-[#e7dcc4] border border-parish-borderSoft rounded-[18px] overflow-hidden grid grid-cols-7 gap-px">
        {BIS_DAYS_SHORT.map((d) => (
          <div key={d} className="bg-[#fbf7ef] p-2.5 font-bold text-[12px] tracking-[.1em] uppercase text-[#4d4636]">{d}</div>
        ))}
        {cells.map((c) => {
          const isToday = c.iso === today;
          return (
            <div key={c.iso} className="min-h-[108px] py-2" style={{ background: isToday ? 'var(--p-blue-tint)' : c.inMonth ? '#fffdf8' : '#f7f2e8' }}>
              <div className={`px-2.5 mb-1.5 font-bold text-[15px] ${c.inMonth ? 'text-parish-ink' : 'text-[#b3aa94]'}`}>
                {c.day}
                {isToday && <span className="ml-1.5 font-bold text-[10px] tracking-[.08em] uppercase text-parish-blueDeep">Karon</span>}
              </div>
              <div className="flex flex-col gap-[3px]">
                {eventsOnDay(events, c.iso, c.dow).map(({ e, starts, ends }) => {
                  const tone = eventTone(e);
                  return (
                    <Link
                      key={e.id}
                      to={`/misa/kalihokan/${e.id}`}
                      title={e.title}
                      className="min-h-[26px] flex items-center gap-1 px-1.5 py-[3px] font-bold text-[12px] leading-[1.2] overflow-hidden hover:brightness-95"
                      style={{
                        color: tone.color,
                        background: tone.background,
                        marginLeft: starts ? 6 : 0,
                        marginRight: ends ? 6 : 0,
                        borderRadius: `${starts ? 6 : 0}px ${ends ? 6 : 0}px ${ends ? 6 : 0}px ${starts ? 6 : 0}px`,
                      }}
                    >
                      {starts && <><Icon name={EVENT_ICONS[e.type] || 'cal'} size={12} /><span className="truncate">{e.title}</span></>}
                    </Link>
                  );
                })}
              </div>
              {c.inMonth && (
                <div className="flex flex-col gap-[2px] mt-1">
                  {massesOnDay(masses, c.iso).map((m) => <CalendarMass key={m.id} m={m} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="text-[13.5px] text-parish-text2 mt-2.5">Ang daghang-adlaw nga kalihokan (sama sa Novena) makita isip usa ka taas nga bar. Ang mga oras sa Misa naa sa matag adlaw; ang espesyal nga Misa may bitoon.</div>
    </div>
  );
}
