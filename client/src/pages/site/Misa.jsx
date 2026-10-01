import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { DataState, EmptyNote, PAGE, PageHeader, Pills, Segmented, Skeleton, Skeletons } from '../../components/site/kit.jsx';
import { EventCard, MassRow, eventTone } from '../../components/site/cards.jsx';
import {
  BIS_DAYS_SHORT, BIS_MONTHS_SHORT, EVENT_ICONS, EVENT_TYPE_LABELS, MASS_LANGUAGE_FILTERS, eventMonths, eventsOnDay, groupEventsByDate, groupMassByDay,
  massLocations, monthCells, monthLabel, parseIso,
} from '../../lib/site.js';
import { EVENT_TYPES, todayIso } from '../../lib/website.js';
import { listState, useAnnouncements, useEvents, useMassSchedule } from './data.js';

/** Misa ug Kalihokan: the weekly Mass schedule and the events agenda. */
export default function Misa() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'kalendaryo' ? 'events' : 'sched';
  const setView = (v) => setParams(v === 'events' ? { view: 'kalendaryo' } : {}, { replace: true });

  return (
    <main className={PAGE}>
      <PageHeader eyebrow="Misa ug Kalihokan" title="Iskedyul sa parokya">
        <Segmented label="Iskedyul" options={[['sched', 'Iskedyul sa Misa'], ['events', 'Kalendaryo']]} value={view} onChange={setView} />
      </PageHeader>
      {view === 'sched' ? <MassSchedule /> : <EventsAgenda />}
    </main>
  );
}

function MassSchedule() {
  const mass = listState(useMassSchedule());
  const ann = listState(useAnnouncements());
  const [location, setLocation] = useState('all');
  const [language, setLanguage] = useState('all');
  const locations = massLocations(mass.rows);
  const days = groupMassByDay(mass.rows, { location, language });
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
        {!days.length ? <EmptyNote>Walay Misa nga mohaum sa imong pili.</EmptyNote> : (
          <div className="flex flex-col gap-3.5 lg:grid lg:grid-cols-4 lg:items-start">
            {days.map((d) => (
              <div key={d.dow} className="bg-parish-card border border-parish-border rounded-2xl lg:rounded-[18px] shadow-cardSm overflow-hidden">
                <div className="flex items-center gap-2 px-3.5 py-2.5 lg:px-4 lg:py-3 bg-[#fbf7ef] lg:border-b lg:border-[#f0e8d6]">
                  <h3 className="m-0 font-serif text-[21px] lg:text-[23px] font-bold text-parish-navy">{d.name}</h3>
                  {d.today && (
                    <span className="font-bold text-[11px] tracking-[.08em] uppercase text-parish-blueDeep border rounded-md px-[7px] py-0.5" style={{ background: 'var(--p-blue-tint)', borderColor: 'var(--p-blue-border)' }}>
                      Karong adlawa
                    </span>
                  )}
                </div>
                {d.rows.map((m) => <MassRow key={m.id} m={m} />)}
              </div>
            ))}
          </div>
        )}
      </DataState>
    </>
  );
}

function EventsAgenda() {
  const events = listState(useEvents());
  const today = todayIso();
  const months = eventMonths(events.rows, today);
  const [month, setMonth] = useState('');
  useEffect(() => { if (months.length && !months.includes(month)) setMonth(months[0]); }, [months.join(), month]);
  const groups = month ? groupEventsByDate(events.rows, month, today) : [];
  const types = EVENT_TYPES.filter((t) => events.rows.some((e) => e.type === t));

  return (
    <DataState
      state={events}
      skeleton={<><div className="lg:hidden"><Skeletons n={2} h={84} /></div><Skeleton h={560} className="hidden lg:block rounded-[18px]" /></>}
      errorText="Wala ma-load ang kalendaryo."
      empty={events.empty}
      emptyText="Walay kalihokan nga naka-iskedyul."
    >
      <div className="lg:flex lg:items-center lg:gap-2 lg:mb-4">
        {months.length > 1 && (
          <Pills dark className="mb-4 lg:mb-0" options={months.map((m) => [m, <>{monthLabel(m)}<span className="hidden lg:inline"> {m.slice(0, 4)}</span></>])} value={month} onChange={setMonth} />
        )}
        <div className="hidden lg:flex flex-wrap gap-x-3.5 gap-y-1.5 ml-auto">
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
      {month && <MonthCalendar month={month} events={events.rows} today={today} />}
      <div className="flex flex-col gap-[18px] lg:hidden">
        {groups.map((g) => {
          const d = parseIso(g.date);
          return (
            <div key={g.date}>
              <h3 className="m-0 mb-2 font-bold text-[13px] tracking-[.1em] uppercase text-[#4d4636]">
                {BIS_DAYS_SHORT[d.getDay()]}, {d.getDate()} {BIS_MONTHS_SHORT[d.getMonth()]}
              </h3>
              <div className="flex flex-col gap-2">{g.items.map((e) => <EventCard key={e.id} e={e} />)}</div>
            </div>
          );
        })}
      </div>
    </DataState>
  );
}

/** Desktop month grid. Multi-day events run as one bar across the days they cover. */
function MonthCalendar({ month, events, today }) {
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
            </div>
          );
        })}
      </div>
      <div className="text-[13.5px] text-parish-text2 mt-2.5">Ang daghang-adlaw nga kalihokan (sama sa Novena) makita isip usa ka taas nga bar.</div>
    </div>
  );
}
