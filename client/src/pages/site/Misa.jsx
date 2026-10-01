import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/site/Icons.jsx';
import { DataState, EmptyNote, Eyebrow, PageTitle, Pills, Segmented, Skeletons } from '../../components/site/kit.jsx';
import { EventCard, MassRow } from '../../components/site/cards.jsx';
import {
  BIS_DAYS_SHORT, BIS_MONTHS_SHORT, MASS_LANGUAGE_FILTERS, eventMonths, groupEventsByDate, groupMassByDay, massLocations, monthLabel, parseIso,
} from '../../lib/site.js';
import { todayIso } from '../../lib/website.js';
import { listState, useAnnouncements, useEvents, useMassSchedule } from './data.js';

/** Misa ug Kalihokan: the weekly Mass schedule and the events agenda. */
export default function Misa() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'kalendaryo' ? 'events' : 'sched';
  const setView = (v) => setParams(v === 'events' ? { view: 'kalendaryo' } : {}, { replace: true });

  return (
    <main className="px-3.5 pt-4 pb-7 animate-fadeUp">
      <Eyebrow>Misa ug Kalihokan</Eyebrow>
      <PageTitle>Iskedyul sa parokya</PageTitle>
      <Segmented label="Iskedyul" options={[['sched', 'Iskedyul sa Misa'], ['events', 'Kalendaryo']]} value={view} onChange={setView} />
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
          className="flex gap-2.5 items-start rounded-[14px] px-3.5 py-3 mb-4 border"
          style={{ background: 'var(--p-gold-tint)', borderColor: 'color-mix(in srgb, var(--p-gold) 45%, white)' }}
        >
          <Icon name="star" className="text-[var(--p-gold-deep)] mt-px" />
          <div className="text-[14.5px] leading-[1.45] text-[#3f3b2f]">
            <strong className="text-parish-navy">Espesyal nga iskedyul:</strong> {special.title}
          </div>
        </Link>
      )}

      {mass.rows.length > 0 && (
        <div className="flex flex-col gap-2.5 mb-[18px]">
          {locations.length > 1 && (
            <div>
              <label htmlFor="f-loc" className="block font-semibold text-[13px] mb-[5px]">Lugar</label>
              <select
                id="f-loc"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full min-h-[48px] px-3.5 text-[16px] text-parish-ink bg-parish-card border-[1.5px] border-parish-borderSoft rounded-xl"
              >
                <option value="all">Tanang simbahan ug kapilya</option>
                {locations.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}
          <div>
            <div className="font-semibold text-[13px] mb-[5px]">Pinulongan</div>
            <Pills options={MASS_LANGUAGE_FILTERS} value={language} onChange={setLanguage} />
          </div>
        </div>
      )}

      <DataState
        state={mass}
        skeleton={<Skeletons n={2} h={120} />}
        errorText="Wala ma-load ang iskedyul. Susiha ang inyong koneksyon."
        empty={mass.empty}
        emptyText="Wala pay iskedyul nga gi-publish. Tawagi ang opisina para sa oras sa Misa."
      >
        {!days.length ? <EmptyNote>Walay Misa nga mohaum sa imong pili.</EmptyNote> : (
          <div className="flex flex-col gap-3.5">
            {days.map((d) => (
              <div key={d.dow} className="bg-parish-card border border-parish-border rounded-2xl shadow-cardSm overflow-hidden">
                <div className="flex items-center gap-2 px-3.5 py-2.5 bg-[#fbf7ef]">
                  <h3 className="m-0 font-serif text-[21px] font-bold text-parish-navy">{d.name}</h3>
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

  return (
    <DataState
      state={events}
      skeleton={<Skeletons n={2} h={84} />}
      errorText="Wala ma-load ang kalendaryo."
      empty={events.empty}
      emptyText="Walay kalihokan nga naka-iskedyul."
    >
      {months.length > 1 && (
        <Pills dark className="mb-4" options={months.map((m) => [m, monthLabel(m)])} value={month} onChange={setMonth} />
      )}
      <div className="flex flex-col gap-[18px]">
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
