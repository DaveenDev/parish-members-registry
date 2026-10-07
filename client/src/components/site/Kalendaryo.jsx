import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icons.jsx';
import { DataState, EmptyNote, Pills, Skeleton, Skeletons } from './kit.jsx';
import { EventCard, MassRow, eventTone } from './cards.jsx';
import { CellCelebrations, ChurchYear, LiturgyLine, LiturgyNow, agendaCelebrations, dayColor } from './Liturgy.jsx';
import {
  BIS_DAYS_SHORT, BIS_MONTHS_SHORT, EVENT_ICONS, EVENT_TYPE_LABELS, agendaDays, calendarMonths, eventsOnDay, fmtTime12,
  massKindLabel, massShortLabel, massesOnDay, monthCells, monthLabel, parseIso,
} from '../../lib/site.js';
import { EVENT_TYPES, massType, todayIso } from '../../lib/website.js';
import { listState, useEvents, useMassSchedule } from '../../pages/site/data.js';

// The Kalendaryo (Pahibalo ug Kalihokan → Kalendaryo): the parish's events,
// the special Masses and the Church year, as a month grid on desktop and an
// agenda on phones.

/** "Iskedyul sa Misa" in the calendar's notes: the weekly Masses are on Ang Simbahan. */
function MassScheduleLink() {
  return <Link to="/simbahan" className="font-semibold text-parish-blueDeep underline">Iskedyul sa Misa</Link>;
}

/**
 * The phone agenda for `month`: each day from today with events, special
 * Masses or a celebration of the Church year (Liturgy.jsx).
 */
function monthAgenda(events, masses, month, today) {
  const byDate = new Map((month ? agendaDays(events, masses, month, today) : []).map((g) => [g.date, { ...g, liturgy: [] }]));
  for (const c of month ? monthCells(month) : []) {
    if (!c.inMonth || c.iso < today) continue;
    const liturgy = agendaCelebrations(c.iso);
    if (!liturgy.length) continue;
    byDate.set(c.iso, { date: c.iso, events: [], masses: [], ...byDate.get(c.iso), liturgy });
  }
  // Only the special Masses (feasts): the weekly ones are in Iskedyul sa Misa (Ang Simbahan).
  return [...byDate.values()]
    .map((g) => ({ ...g, masses: g.masses.filter((m) => massType(m) === 'Special Mass') }))
    .filter((g) => g.events.length || g.masses.length || g.liturgy.length)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The whole calendar: the season now, the month switch, the grid or agenda, then the great days of the year. */
export default function Kalendaryo() {
  const events = listState(useEvents());
  // The Masses go on the calendar too (not the Daily Masses: the same every
  // weekday, they're in Iskedyul sa Misa); if they fail to load, the events still show.
  const mass = listState(useMassSchedule());
  const masses = (mass.error ? [] : mass.rows).filter((m) => massType(m) !== 'Daily Mass');
  const today = todayIso();
  const months = calendarMonths(events.rows, today);
  const [month, setMonth] = useState('');
  useEffect(() => { if (months.length && !months.includes(month)) setMonth(months[0]); }, [months.join(), month]);
  const days = monthAgenda(events.rows, masses, month, today);
  const types = EVENT_TYPES.filter((t) => events.rows.some((e) => e.type === t));
  const state = { ...events, loading: events.loading || mass.loading };

  return (
    <DataState
      state={state}
      skeleton={<><div className="lg:hidden"><Skeletons n={2} h={84} /></div><Skeleton h={560} className="hidden lg:block rounded-[18px]" /></>}
      errorText="Wala ma-load ang kalendaryo."
      // The Church year always has something to show.
      empty={false}
    >
      <LiturgyNow today={today} />
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
        <p className="m-0 text-[13.5px] leading-normal text-parish-text2">
          Mga kalihokan, espesyal nga Misa ug mga kapistahan sa Simbahan ang naa dinhi. Ang regular nga Misa matag semana naa sa <MassScheduleLink />.
        </p>
        {!days.length && <EmptyNote>Walay kalihokan o espesyal nga Misa niining bulana.</EmptyNote>}
        {days.map((g) => {
          const d = parseIso(g.date);
          return (
            <div key={g.date}>
              <h3 className="m-0 mb-2 font-bold text-[13px] tracking-[.1em] uppercase text-[#4d4636]">
                {BIS_DAYS_SHORT[d.getDay()]}, {d.getDate()} {BIS_MONTHS_SHORT[d.getMonth()]}
                {g.date === today && <span className="ml-1.5 text-parish-blueDeep">· Karon</span>}
              </h3>
              <div className="flex flex-col gap-2">
                {g.liturgy.map((c) => <LiturgyLine key={c.name} c={c} />)}
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
      <ChurchYear today={today} />
    </DataState>
  );
}

/** One Mass in a calendar cell: a feast stands out like an event; weekly Masses are a quiet time line. */
function CalendarMass({ m }) {
  if (massType(m) === 'Special Mass') {
    return (
      <Link
        to="/simbahan"
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

/**
 * Desktop month grid. Each day has its liturgical color as a line along the
 * top and its celebrations under the date (Liturgy.jsx). Multi-day events run
 * as one bar across the days they cover.
 */
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
            <div
              key={c.iso}
              className="min-h-[108px] py-2"
              style={{
                background: isToday ? 'var(--p-blue-tint)' : c.inMonth ? '#fffdf8' : '#f7f2e8',
                boxShadow: `inset 0 3px 0 ${c.inMonth ? dayColor(c.iso) : 'transparent'}`,
              }}
            >
              <div className={`px-2.5 mb-1 font-bold text-[15px] ${c.inMonth ? 'text-parish-ink' : 'text-[#b3aa94]'}`}>
                {c.day}
                {isToday && <span className="ml-1.5 font-bold text-[10px] tracking-[.08em] uppercase text-parish-blueDeep">Karon</span>}
              </div>
              {c.inMonth && <CellCelebrations iso={c.iso} />}
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
      <div className="text-[13.5px] text-parish-text2 mt-2.5">Ang linya sa ibabaw sa matag adlaw mao ang kolor sa liturhiya, ug ang mga kapistahan nakasulat ilalom sa petsa. Ang daghang-adlaw nga kalihokan (sama sa Novena) makita isip usa ka taas nga bar; ang espesyal nga Misa may bitoon. Ang Misa sa adlaw-adlaw naa sa <MassScheduleLink />.</div>
    </div>
  );
}
