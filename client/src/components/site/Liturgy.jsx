import React, { useState } from 'react';
import { Icon } from './Icons.jsx';
import LITURGY from '../../data/liturgical-calendar.json';
import {
  LITURGY_COLORS, RANK_LABELS, addDays, celebrationsBetween, celebrationsOn, liturgicalDay, liturgyHex, seasonSpan,
} from '../../lib/liturgy.js';
import { BIS_DAYS, BIS_DAYS_SHORT, BIS_MONTHS, BIS_MONTHS_SHORT, fmtShort, parseIso } from '../../lib/site.js';

// The Church year on the public calendar (Pahibalo ug Kalihokan → Kalendaryo): the
// season now, the feasts in the month grid and the phone agenda, and the
// great days of the year ahead. Data: data/liturgical-calendar.json.

/** The celebrations a day shows in the phone agenda: not the ordinary memorials. */
export function agendaCelebrations(iso) {
  return celebrationsOn(iso, LITURGY).filter((c) => c.rank !== 'memorial' || c.ph || c.parish);
}

/** A day's liturgical color, as shown on the site. */
export const dayColor = (iso) => liturgyHex(liturgicalDay(iso, LITURGY).color);

const dot = (color, size = 10) => (
  <span aria-hidden className="inline-block flex-none rounded-full" style={{ width: size, height: size, background: liturgyHex(color) }} />
);

/** "Simbang Gabi · Adlaw 5 sa 9", or the celebration's name. */
const celebrationName = (c) => (c.of ? `${c.name} · Adlaw ${c.day} sa ${c.of}` : c.name);

/** Small tags after a celebration: holy day of obligation, parish fiesta, moved from its usual date. */
function Tags({ c }) {
  return (
    <>
      {c.obligation && <span className="ml-1.5 align-middle font-bold text-[10.5px] tracking-[.06em] uppercase rounded px-1.5 py-px" style={{ background: 'var(--p-gold-tint)', color: 'var(--p-gold-deep)' }}>Obligasyon</span>}
      {c.parish && <span className="ml-1.5 align-middle font-bold text-[10.5px] tracking-[.06em] uppercase rounded px-1.5 py-px text-white bg-parish-blue">Fiesta</span>}
      {c.movedFrom && <span className="ml-1.5 text-[12px] font-normal text-parish-text2">(gibalhin gikan sa {fmtShort(c.movedFrom)})</span>}
    </>
  );
}

/** One celebration as a line in the phone agenda. */
export function LiturgyLine({ c }) {
  const big = ['special', 'solemnity'].includes(c.rank) || c.parish;
  return (
    <div
      className="flex gap-2.5 items-start rounded-[12px] border px-3 py-2.5 bg-parish-card"
      style={{ borderColor: 'var(--p-blue-border)', borderLeft: `4px solid ${liturgyHex(c.color)}` }}
      title={c.en}
    >
      <Icon name={c.parish ? 'star' : 'church'} size={16} className="mt-0.5 flex-none" style={{ color: liturgyHex(c.color) }} />
      <div className="min-w-0">
        <div className={`text-[15px] leading-snug text-parish-navy ${big ? 'font-bold' : 'font-semibold'}`}>{celebrationName(c)}<Tags c={c} /></div>
        <div className="text-[12.5px] text-parish-text2">{RANK_LABELS[c.rank]} · {LITURGY_COLORS[c.color]?.name}</div>
      </div>
    </div>
  );
}

/** The celebrations in one desktop calendar cell, under the date. */
export function CellCelebrations({ iso }) {
  const list = celebrationsOn(iso, LITURGY);
  if (!list.length) return null;
  return (
    <div className="flex flex-col gap-[2px] px-2.5 mb-1.5">
      {list.slice(0, 2).map((c) => {
        const big = ['special', 'solemnity'].includes(c.rank) || c.parish;
        return (
          <div
            key={c.name}
            title={`${c.en}${c.movedFrom ? ` (moved from ${c.movedFrom})` : ''}`}
            className={`text-[11.5px] leading-[1.25] line-clamp-2 ${big ? 'font-bold' : c.rank === 'memorial' ? 'italic' : 'font-semibold'}`}
            style={{ color: liturgyHex(c.color) }}
          >
            {c.parish && <Icon name="star" size={10} className="inline -mt-0.5 mr-0.5" />}
            {celebrationName(c)}
            {c.obligation && <span className="text-[var(--p-gold-deep)]"> · Obligasyon</span>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Where the Church is now: the season with its color and when it ends,
 * today's celebration if there is one, and the next season.
 */
export function LiturgyNow({ today }) {
  const day = liturgicalDay(today, LITURGY);
  const span = seasonSpan(today, LITURGY);
  const todays = day.celebrations.filter((c) => c.rank !== 'devotion' || c.day === 1)[0] || day.celebrations[0];
  const next = parseIso(span.next.starts);
  return (
    <div className="mb-4 lg:mb-5 rounded-[16px] border bg-parish-card overflow-hidden flex" style={{ borderColor: 'var(--p-blue-border)' }}>
      <span aria-hidden className="w-2 flex-none" style={{ background: liturgyHex(day.color) }} />
      <div className="px-3.5 py-3 lg:px-5 lg:py-3.5 flex-1 min-w-0 lg:flex lg:items-center lg:gap-6">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[11px] tracking-[.16em] uppercase text-[var(--p-eyebrow)]">Panahon sa Simbahan karon</div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            {dot(span.season.color, 12)}
            <span className="font-serif font-bold text-[21px] lg:text-[24px] leading-tight text-parish-navy">{span.season.name}</span>
            <span className="text-[13.5px] text-parish-text2">hangtod {fmtShort(span.ends)}</span>
          </div>
          {todays && (
            <div className="mt-1 text-[14.5px] text-[#3f3b2f]">
              <span className="font-semibold">Karon:</span> {celebrationName(todays)} <span className="text-parish-text2">({RANK_LABELS[todays.rank]})</span><Tags c={todays} />
            </div>
          )}
        </div>
        <div className="mt-2 lg:mt-0 flex-none text-[14px] text-[#3f3b2f] flex items-center gap-2">
          <Icon name="chev" size={14} className="text-parish-text2" />
          Sunod: <strong className="inline-flex items-center gap-1.5">{dot(span.next.color)}{span.next.name}</strong>
          <span className="text-parish-text2">· {BIS_DAYS_SHORT[next.getDay()]}, {next.getDate()} {BIS_MONTHS_SHORT[next.getMonth()]}</span>
        </div>
      </div>
    </div>
  );
}

// The great days listed for the year ahead: the Triduum and the like, the
// solemnities, the parish fiesta, Philippine days, Simbang Gabi and the start
// of Advent and Lent.
const isGreat = (c) => ['special', 'solemnity', 'devotion'].includes(c.rank) || c.parish || c.ph || /^(First Sunday of (Advent|Lent))$/.test(c.en);

/**
 * "Mga dakong adlaw sa Simbahan": the next twelve months of great days,
 * by month, with what the colors mean. Phones show the first few with a
 * button for the rest.
 */
export function ChurchYear({ today }) {
  const [all, setAll] = useState(false);
  const list = celebrationsBetween(today, addDays(today, 365), LITURGY).filter(isGreat);
  const shown = all ? list : list.slice(0, 8);
  const months = [];
  for (const c of shown) {
    const key = c.date.slice(0, 7);
    if (months[months.length - 1]?.key !== key) months.push({ key, items: [] });
    months[months.length - 1].items.push(c);
  }
  return (
    <section aria-labelledby="church-year" className="mt-7 lg:mt-10">
      <h3 id="church-year" className="m-0 font-serif text-[24px] lg:text-[30px] font-bold text-parish-navy">Mga dakong adlaw sa Simbahan</h3>
      <p className="m-0 mt-0.5 mb-3.5 lg:mb-5 text-[14.5px] lg:text-[15.5px] text-[#4d4636]">Ang mga panahon ug kapistahan sulod sa usa ka tuig gikan karon, sumala sa kalendaryo sa Simbahan sa Pilipinas.</p>
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 items-start">
        {months.map((m) => (
          <div key={m.key} className="bg-parish-card border border-parish-border rounded-2xl shadow-cardSm overflow-hidden">
            <div className="px-3.5 py-2 bg-[#fbf7ef] border-b border-[#f0e8d6] font-bold text-[12.5px] tracking-[.12em] uppercase text-[#4d4636]">
              {BIS_MONTHS[Number(m.key.slice(5)) - 1]} {m.key.slice(0, 4)}
            </div>
            <ul className="list-none m-0 p-0">
              {m.items.map((c) => {
                const d = parseIso(c.date);
                const end = c.of ? parseIso(addDays(c.date, c.of - c.day)) : null;
                return (
                  <li key={`${c.date}-${c.name}`} className="flex gap-3 items-start px-3.5 py-2.5 border-t border-[#f4eddd] first:border-t-0" title={c.en}>
                    <div className="w-[52px] flex-none text-center">
                      <div className="font-serif font-bold text-[22px] leading-none" style={{ color: liturgyHex(c.color) }}>{d.getDate()}{end ? `–${end.getDate()}` : ''}</div>
                      <div className="text-[11px] font-semibold text-parish-text2 mt-0.5">{BIS_DAYS[d.getDay()]}</div>
                    </div>
                    <div className="min-w-0 pt-px">
                      <div className={`text-[14.5px] leading-snug text-parish-navy ${['special', 'solemnity'].includes(c.rank) || c.parish ? 'font-bold' : 'font-semibold'}`}>{c.name}<Tags c={c} /></div>
                      <div className="text-[12.5px] text-parish-text2">{RANK_LABELS[c.rank]}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
      {list.length > shown.length && (
        <button type="button" onClick={() => setAll(true)} className="mt-3.5 w-full lg:w-auto min-h-[46px] px-5 rounded-[12px] border-[1.5px] border-[var(--p-blue-border)] bg-parish-card text-parish-blueDeep font-bold text-[15px] hover:bg-[var(--p-blue-tint)]">
          Tan-awa ang tanan ({list.length})
        </button>
      )}
    </section>
  );
}

const COLOR_MEANING = [
  ['violet', 'Adbiyento, Kwaresma, Kalag-kalag'],
  ['white', 'Pasko, Pagkabanhaw, kapistahan ni Kristo, ni Maria ug sa mga santos'],
  ['red', 'Domingo sa Palaspas, Biyernes Santo, Pentekostes, mga martir'],
  ['green', 'Ordinaryong Panahon'],
  ['rose', 'Gaudete ug Laetare (Ikatulong Domingo sa Adbiyento, Ikaupat sa Kwaresma)'],
];

/** What each liturgical color is for: right under the calendar, whose day lines use them. */
export function ColorLegend({ className = 'mt-3' }) {
  return (
    <div className={`${className} rounded-2xl border border-parish-border bg-parish-card px-3.5 py-3 lg:px-5`}>
      <div className="font-bold text-[11.5px] tracking-[.14em] uppercase text-[var(--p-eyebrow)] mb-1.5">Mga kolor sa liturhiya</div>
      <ul className="list-none m-0 p-0 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {COLOR_MEANING.map(([color, meaning]) => (
          <li key={color} className="flex gap-2 items-start text-[13.5px] leading-snug text-[#3f3b2f]">
            <span className="mt-[4px]">{dot(color)}</span>
            <span><strong>{LITURGY_COLORS[color].name}:</strong> {meaning}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
