// Helpers for the public website: Bisaya labels for the database values,
// date formatting, the Mass schedule views, office hours and the GKK areas.
// Pure functions, so they're easy to test (client/test/site.test.js).

import { dayList, groupDaily, isCurrentMass, massOnDate, massType } from './website.js';

export const BIS_DAYS = ['Domingo', 'Lunes', 'Martes', 'Miyerkules', 'Huwebes', 'Biyernes', 'Sabado'];
export const BIS_DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Miy', 'Huw', 'Biy', 'Sab'];
export const BIS_MONTHS = ['Enero', 'Pebrero', 'Marso', 'Abril', 'Mayo', 'Hunyo', 'Hulyo', 'Agosto', 'Septiyembre', 'Oktubre', 'Nobyembre', 'Disyembre'];
export const BIS_MONTHS_SHORT = ['Ene', 'Peb', 'Mar', 'Abr', 'May', 'Hun', 'Hul', 'Ago', 'Sep', 'Okt', 'Nob', 'Dis'];

/** "2026-10-01" → a local Date at midnight (no time-zone shift). */
export function parseIso(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function isoOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** "Huwebes, 1 Okt" */
export function fmtDayMonth(iso) {
  const d = parseIso(iso);
  return `${BIS_DAYS[d.getDay()]}, ${d.getDate()} ${BIS_MONTHS_SHORT[d.getMonth()]}`;
}

/** "1 Okt 2026" */
export function fmtShort(iso) {
  if (!iso) return '';
  const d = parseIso(iso);
  return `${d.getDate()} ${BIS_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "24 Septiyembre 2026" */
export function fmtLong(iso) {
  if (!iso) return '';
  const d = parseIso(iso);
  return `${d.getDate()} ${BIS_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "17:30:00" → "5:30 PM"; 12:00 → "12:00 NN". */
export function fmtTime12(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  if (Number.isNaN(h)) return String(t);
  if (h === 12 && !m) return '12:00 NN';
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export const minutesOf = (t) => {
  const [h, m] = String(t || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

// ---- Mass schedule --------------------------------------------------------

/** What a schedule row is called on the site. */
export function massKindLabel(row) {
  switch (massType(row)) {
    case 'Regular Mass': return 'Misa sa Domingo';
    case 'Daily Mass': return 'Misa sa Adlaw-adlaw';
    case 'GKK Mass': return 'Misa sa GKK';
    case 'Special Mass': return row.occasion || 'Espesyal nga Misa';
    case 'Anticipated Mass': return 'Anticipated Mass';
    case 'Confession': return 'Kumpisal';
    case 'Adoration': return 'Adoration';
    default: return row.notes || 'Uban pa';
  }
}

export const MASS_LANGUAGE_FILTERS = [['all', 'Tanan'], ['Bisaya', 'Bisaya'], ['English', 'English']];

function langMatches(rowLang, filter) {
  return filter === 'all' || rowLang === filter || rowLang === 'Bisaya & English';
}

/**
 * Today's schedule rows still to come (up to `limit`), the first one marked
 * `next`. `now` is a Date.
 */
export function upcomingToday(rows, now, limit = 3) {
  const today = isoOf(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  // Weekly rows by their day; dated ones (a feast, Simbang Gabi) only on their dates.
  return rows
    .filter((r) => massOnDate(r, today) && minutesOf(r.start_time) > nowMin)
    .sort((a, b) => minutesOf(a.start_time) - minutesOf(b.start_time))
    .slice(0, limit)
    .map((r, i) => ({ ...r, next: i === 0 }));
}

const byTime = (a, b) => minutesOf(a.start_time) - minutesOf(b.start_time);
const dateOf = (r) => String(r.mass_date || '').slice(0, 10);
/** Weekly rows Monday first by day, then time; dated rows after them by date. */
const byWhen = (a, b) => {
  if (!!a.mass_date !== !!b.mass_date) return a.mass_date ? 1 : -1;
  if (a.mass_date) return dateOf(a).localeCompare(dateOf(b)) || byTime(a, b);
  return ((a.day_of_week + 6) % 7) - ((b.day_of_week + 6) % 7) || byTime(a, b);
};

/** "Dis 8, Martes" for one date, "Dis 16 – 24" (or "Dis 30 – Ene 2") for a run. */
export function massDateLabel(row) {
  const start = parseIso(row.mass_date);
  const day = (d) => `${BIS_MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  const endIso = String(row.mass_end_date || '').slice(0, 10);
  if (!endIso || endIso === dateOf(row)) return `${day(start)}, ${BIS_DAYS[start.getDay()]}`;
  const end = parseIso(endIso);
  return start.getMonth() === end.getMonth() ? `${day(start)} – ${end.getDate()}` : `${day(start)} – ${day(end)}`;
}

/** When a row is held, for the site: its days, its date(s) or its weekday. */
export function massWhen(row) {
  if (row.days) return dayList(row.days, BIS_DAYS, ' – ');
  if (row.mass_date) return massDateLabel(row);
  return BIS_DAYS[row.day_of_week];
}

/**
 * The Mass schedule in its four sections, filtered by location and language:
 * Sunday (Regular Mass), daily (one entry per Daily Mass, with its days),
 * special (each feast with its date and times) and other (Anticipated, GKK,
 * Confession, Adoration…). Dated rows drop off once their date has passed;
 * today's next Mass is marked `next`. Empty sections are left out.
 */
export function massSections(rows, { location = 'all', language = 'all' } = {}, now = new Date()) {
  const today = isoOf(now);
  const nextId = upcomingToday(rows, now, 1)[0]?.id;
  const shown = rows
    .filter((r) => (location === 'all' || r.location === location) && langMatches(r.language, language) && isCurrentMass(r, today))
    .map((r) => ({ ...r, next: r.id === nextId }));
  const of = (type) => shown.filter((r) => massType(r) === type);

  const sunday = of('Regular Mass').sort(byTime);
  const daily = groupDaily(of('Daily Mass')).sort(byTime)
    .map((e) => ({ ...e, next: e.rows.some((r) => r.next), when: massWhen(e) }));

  // One block per feast and date, its Masses by time.
  const special = [];
  for (const r of of('Special Mass').sort(byWhen)) {
    const key = `${(r.occasion || '').trim().toLowerCase()}|${dateOf(r)}|${String(r.mass_end_date || '').slice(0, 10)}`;
    let block = special.find((b) => b.key === key);
    if (!block) {
      block = { key, occasion: r.occasion, when: massDateLabel(r), obligation: false, today: massOnDate(r, today), rows: [] };
      special.push(block);
    }
    block.obligation = block.obligation || !!r.obligation;
    block.rows.push(r);
  }

  const MAIN = ['Regular Mass', 'Daily Mass', 'Special Mass'];
  const other = shown.filter((r) => !MAIN.includes(massType(r))).sort(byWhen).map((r) => ({ ...r, when: massWhen(r) }));

  return [
    { key: 'sunday', title: 'Misa sa Domingo', today: now.getDay() === 0, rows: sunday },
    { key: 'daily', title: 'Misa sa Adlaw-adlaw', today: daily.some((e) => e.days.includes(now.getDay())), rows: daily },
    { key: 'special', title: 'Espesyal nga Misa', today: special.some((b) => b.today), blocks: special },
    { key: 'other', title: 'Uban pang Misa ug Serbisyo', today: other.some((r) => massOnDate(r, today)), rows: other },
  ].filter((s) => (s.blocks || s.rows).length);
}

export const massLocations = (rows) => [...new Set(rows.map((r) => r.location).filter(Boolean))].sort();

// ---- Announcements and articles -------------------------------------------

/** "Bunyag (Baptism)" → "Bunyag": a sacrament guide's name without the translation, for the tabs. */
export function guideShortTitle(title) {
  const t = String(title || '').trim();
  return t.replace(/\s*\([^)]*\)\s*$/, '').trim() || t;
}

/** "3 minutos basahon" for a text, at about 200 words a minute; null when there's no text. */
export function readingTime(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  if (!words) return null;
  const minutes = Math.max(1, Math.round(words / 200));
  return `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} basahon`;
}

/** True when `iso` (yyyy-mm-dd) is today or one of the `days` - 1 days before it: "New". */
export function isRecent(iso, todayIsoStr, days = 3) {
  const age = daysUntil(todayIsoStr, iso);
  return age !== null && age >= 0 && age < days;
}

/** Announcements in list order: urgent first, then pinned, then newest. */
export function sortAnnouncements(rows) {
  return [...(rows || [])].sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0)
    || (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
    || String(b.publish_on || '').localeCompare(String(a.publish_on || ''))
    || (b.id || 0) - (a.id || 0));
}

export const ANNOUNCEMENT_LABELS = { Parish: 'Parokya', GKK: 'GKK', Ministry: 'Ministry', 'Schedule change': 'Kausaban sa iskedyul' };
// Articles live on Komunidad (its "Mga Artikulo" tab, the one it opens on).
// Older links, /pahibalo/artikulo/:id and /komunidad/balita/:id, redirect here.
export const ARTICLES_PAGE = '/komunidad';
export const articlePath = (id) => `/komunidad/artikulo/${id}`;

export const ARTICLE_LABELS ={ Parish: 'Parokya', GKK: 'GKK', Ministry: 'Ministry', History: 'Kasaysayan' };

/** Paragraphs of a typed body: blank lines split paragraphs. */
export function paragraphs(text) {
  return String(text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

/** The first `max` characters of `text`, cut at a word. */
export function excerpt(text, max = 140) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 60 ? cut.lastIndexOf(' ') : max).replace(/[,.;:]$/, '')}…`;
}

// ---- Events ---------------------------------------------------------------

export const EVENT_TYPE_LABELS = {
  Fiesta: 'Fiesta',
  Novena: 'Novena',
  'Recollection / Retreat': 'Recollection',
  'GKK Rotation': 'GKK rotation',
  Seminar: 'Seminar',
  Meeting: 'Tigom',
  Other: 'Kalihokan',
};

export const EVENT_ICONS = {
  Fiesta: 'ev-fiesta',
  Novena: 'ev-novena',
  'Recollection / Retreat': 'ev-retreat',
  'GKK Rotation': 'ev-gkk',
  Seminar: 'ev-seminar',
  Meeting: 'ev-meeting',
  Other: 'cal',
};

/** Number of days an event covers (1 for a one-day event). */
export function eventDays(e) {
  if (!e.end_date || e.end_date === e.start_date) return 1;
  return Math.round((parseIso(e.end_date) - parseIso(e.start_date)) / 86400000) + 1;
}

/** "3–11 Dis · 9 ka adlaw", or '' for a one-day event. */
export function eventSpan(e) {
  const n = eventDays(e);
  if (n === 1) return '';
  const a = parseIso(e.start_date);
  const b = parseIso(e.end_date);
  const range = a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${BIS_MONTHS_SHORT[b.getMonth()]}`
    : `${a.getDate()} ${BIS_MONTHS_SHORT[a.getMonth()]} – ${b.getDate()} ${BIS_MONTHS_SHORT[b.getMonth()]}`;
  return `${range} · ${n} ka adlaw`;
}

export function eventTime(e) {
  if (!e.start_time) return 'Tibuok adlaw';
  const start = fmtTime12(e.start_time);
  const days = eventDays(e);
  if (e.end_time) return `${start} – ${fmtTime12(e.end_time)}${days > 1 ? ' matag adlaw' : ''}`;
  return days > 1 ? `${start} matag adlaw` : start;
}

/** "YYYY-MM" keys of the months the events touch, in order, from `fromIso`. */
export function eventMonths(events, fromIso, max = 3) {
  const keys = new Set();
  for (const e of events) {
    const k = (e.start_date < fromIso ? fromIso : e.start_date).slice(0, 7);
    keys.add(k);
  }
  return [...keys].sort().slice(0, max);
}

export const monthLabel = (key) => BIS_MONTHS[Number(key.slice(5, 7)) - 1];

/** "YYYY-MM" `n` months after `key`. */
function addMonths(key, n) {
  return isoOf(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1 + n, 1)).slice(0, 7);
}

/**
 * The months the calendar offers: this month and the next two (Masses fill
 * every month), plus any later month with an event, up to `max`.
 */
export function calendarMonths(events, fromIso, max = 6) {
  const first = fromIso.slice(0, 7);
  const keys = new Set([0, 1, 2].map((n) => addMonths(first, n)));
  for (const k of eventMonths(events, fromIso, max)) keys.add(k);
  return [...keys].sort().slice(0, max);
}

/** The Masses held on `iso` (weekly ones on their weekday, dated ones on their dates), by time. */
export function massesOnDay(rows, iso) {
  return rows.filter((r) => massOnDate(r, iso)).sort(byTime);
}

/** A Mass's name in a calendar cell: "Regular Mass" or "Daily Mass", the feast for a Special Mass. */
export function massShortLabel(r) {
  const type = massType(r);
  if (type === 'Regular Mass' || type === 'Daily Mass') return type;
  return massKindLabel(r);
}

/**
 * The month's agenda (phones), from `fromIso` on: every day with something,
 * with its events (on their first visible day) and its Masses.
 */
export function agendaDays(events, masses, key, fromIso) {
  const days = [];
  const last = new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 0).getDate();
  for (let d = 1; d <= last; d++) {
    const iso = `${key}-${String(d).padStart(2, '0')}`;
    if (iso < fromIso) continue;
    const evs = events.filter((e) => (e.start_date < fromIso ? fromIso : e.start_date) === iso);
    const ms = massesOnDay(masses, iso);
    if (evs.length || ms.length) days.push({ date: iso, events: evs, masses: ms });
  }
  return days;
}

/** Events in month `key` (YYYY-MM), grouped by their (first visible) date. */
export function groupEventsByDate(events, key, fromIso) {
  const groups = [];
  for (const e of events) {
    const day = e.start_date < fromIso ? fromIso : e.start_date;
    if (day.slice(0, 7) !== key) continue;
    let g = groups.find((x) => x.date === day);
    if (!g) { g = { date: day, items: [] }; groups.push(g); }
    g.items.push(e);
  }
  return groups;
}

/**
 * The days a month calendar shows for month `key` (YYYY-MM): whole weeks,
 * Sunday first, padded with the neighbouring months' days.
 */
export function monthCells(key) {
  const first = parseIso(`${key}-01`);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const weeks = Math.ceil((first.getDay() + last.getDate()) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return { iso: isoOf(d), day: d.getDate(), dow: d.getDay(), inMonth: d.getMonth() === first.getMonth() };
  });
}

/**
 * Events that run on `iso`, longest first so multi-day bars keep their row.
 * Each says whether its bar starts or ends here (a week break counts too).
 */
export function eventsOnDay(events, iso, dow) {
  return events
    .filter((e) => e.start_date <= iso && (e.end_date || e.start_date) >= iso)
    .sort((a, b) => eventDays(b) - eventDays(a) || a.start_date.localeCompare(b.start_date) || String(a.start_time || '').localeCompare(String(b.start_time || '')))
    .map((e) => ({ e, starts: e.start_date === iso || dow === 0, ends: (e.end_date || e.start_date) === iso || dow === 6 }));
}

/** An iCalendar file for one event (all-day when it has no start time). */
export function eventIcs(e, { parishName = 'Parokya', now = new Date() } = {}) {
  const esc = (s) => String(s || '').replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
  const compact = (iso) => iso.replace(/-/g, '');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Parish Website//Bisaya//EN', 'BEGIN:VEVENT', `UID:event-${e.id}@parish`, `DTSTAMP:${stamp}`];
  const lastDay = e.end_date || e.start_date;
  if (e.start_time) {
    const t = (x) => String(x).slice(0, 5).replace(':', '') + '00';
    lines.push(`DTSTART:${compact(e.start_date)}T${t(e.start_time)}`);
    lines.push(`DTEND:${compact(e.start_date)}T${t(e.end_time || e.start_time)}`);
    if (lastDay !== e.start_date) lines.push(`RRULE:FREQ=DAILY;COUNT=${eventDays(e)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compact(e.start_date)}`);
    const after = parseIso(lastDay);
    after.setDate(after.getDate() + 1);
    lines.push(`DTEND;VALUE=DATE:${compact(isoOf(after))}`);
  }
  lines.push(`SUMMARY:${esc(e.title)}`);
  if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
  lines.push(`DESCRIPTION:${esc([e.description, e.organizer && `Nag-organisar: ${e.organizer}`, parishName].filter(Boolean).join('\n'))}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

// ---- Census ---------------------------------------------------------------

/** Whole days from `todayIsoStr` to `endsOn` (both yyyy-mm-dd): 0 on the last day, negative once past. null without a date. */
export function daysUntil(endsOn, todayIsoStr) {
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}/.test(String(v || ''));
  if (!isDate(endsOn) || !isDate(todayIsoStr)) return null;
  // Rounded, so a daylight-saving hour can't shift the count.
  return Math.round((parseIso(endsOn) - parseIso(todayIsoStr)) / 86400000);
}

/** "5 ka adlaw na lang" style countdown for the last `within` days of a census, or null outside them. */
export function censusCountdown(endsOn, todayIsoStr, within = 7) {
  const days = daysUntil(endsOn, todayIsoStr);
  if (days === null || days < 0 || days > within) return null;
  if (days === 0) return 'Karon na ang katapusang adlaw';
  if (days === 1) return 'Ugma na ang katapusan';
  return `${days} ka adlaw na lang`;
}

/**
 * How soon an event is, for its card: "Karon", "Ugma", "Karong Sabado"
 * (this week), "12 days from now" (within a month), "Adlaw 3 sa 9" while a
 * multi-day event is on. null when it's further off or already over.
 */
export function eventCountdown(e, todayIsoStr) {
  const start = daysUntil(e.start_date, todayIsoStr);
  if (start === null) return null;
  const end = daysUntil(e.end_date || e.start_date, todayIsoStr) ?? start;
  if (end < 0) return null;
  if (start <= 0) return eventDays(e) > 1 ? `Adlaw ${1 - start} sa ${eventDays(e)}` : 'Karon';
  if (start === 1) return 'Ugma';
  if (start < 7) return `Karong ${BIS_DAYS[parseIso(e.start_date).getDay()]}`;
  if (start <= 30) return `${start} days from now`;
  return null;
}

// ---- GKKs -----------------------------------------------------------------

/** "Sto. Niño -Balabag" → { patron: 'Sto. Niño', area: 'Balabag' }. */
export function gkkParts(name) {
  const s = String(name || '');
  const i = s.lastIndexOf(' -');
  if (i < 0) return { patron: s, area: '' };
  return { patron: s.slice(0, i).trim(), area: s.slice(i + 2).trim() };
}

/**
 * GKKs whose name (and so its barangay), puroks or chapel address contain the
 * search text, in the order given, each with its patron and area split out.
 */
export function filterGkks(gkks, query = '') {
  const q = query.trim().toLowerCase();
  return gkks
    .filter((g) => !q || `${g.name} ${g.puroks || ''} ${g.chapel_address || ''}`.toLowerCase().includes(q))
    .map((g) => ({ ...g, ...gkkParts(g.name) }));
}

/**
 * Census progress rows ({ name, pct|null }) in the order picked: 'pct' is
 * highest first, with GKKs whose percentage is hidden (under 5 families)
 * last; 'name' is A–Z. Ties go by name.
 */
export function sortCensusGkks(rows, sort = 'pct') {
  const pctOf = (r) => (r.pct == null || Number.isNaN(Number(r.pct)) ? -1 : Number(r.pct));
  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base', numeric: true });
  return [...(rows || [])].sort((a, b) => (sort === 'pct' && pctOf(b) - pctOf(a)) || byName(a, b));
}

export function initialsOf(name) {
  return String(name || '').split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

// ---- Office hours ---------------------------------------------------------

const range = (a, b) => `${fmtTime12(a)} – ${fmtTime12(b)}`;

/** The hours one day shows, e.g. ["8:00 AM – 12:00 NN", "1:00 PM – 5:00 PM"], or null when closed. */
export function dayHours(d) {
  if (!d || d.closed || !d.open || !d.close) return null;
  if (d.break_from && d.break_to) return [range(d.open, d.break_from), range(d.break_to, d.close)];
  return [range(d.open, d.close)];
}

/**
 * Office hours as rows, Monday first, with neighbouring days that keep the
 * same hours merged ("Martes – Sabado"). `today` marks the row with today.
 */
export function officeHourRows(hours, today = new Date().getDay()) {
  if (!Array.isArray(hours) || hours.length !== 7) return [];
  const order = [1, 2, 3, 4, 5, 6, 0];
  const rows = [];
  for (const dow of order) {
    const h = dayHours(hours[dow]);
    const key = h ? h.join('|') : 'closed';
    const last = rows[rows.length - 1];
    if (last && last.key === key) { last.days.push(dow); continue; }
    rows.push({ key, days: [dow], hours: h });
  }
  return rows.map((r) => ({
    label: r.days.length === 1 ? BIS_DAYS[r.days[0]] : `${BIS_DAYS[r.days[0]]} – ${BIS_DAYS[r.days[r.days.length - 1]]}`,
    hours: r.hours,
    today: r.days.includes(today),
  }));
}

/** Whether the office is open at `now`, from the saved hours. null when hours aren't set. */
export function officeOpenNow(hours, now = new Date()) {
  if (!Array.isArray(hours) || hours.length !== 7) return null;
  const d = hours[now.getDay()];
  if (!d || d.closed || !d.open || !d.close) return false;
  const t = now.getHours() * 60 + now.getMinutes();
  if (t < minutesOf(d.open) || t >= minutesOf(d.close)) return false;
  if (d.break_from && d.break_to && t >= minutesOf(d.break_from) && t < minutesOf(d.break_to)) return false;
  return true;
}

/**
 * The office's status line for the Kontak page: { open, text }, or null when
 * no hours are set. "Abli karon hangtod 4:00 PM" while open (until the break
 * if there is one), else when it opens next: later today, "ugma", or the day.
 */
export function officeStatus(hours, now = new Date()) {
  if (!Array.isArray(hours) || hours.length !== 7) return null;
  const t = now.getHours() * 60 + now.getMinutes();
  const today = hours[now.getDay()];
  const worked = (d) => d && !d.closed && d.open && d.close;
  if (officeOpenNow(hours, now)) {
    const until = today.break_from && today.break_to && t < minutesOf(today.break_from) ? today.break_from : today.close;
    return { open: true, text: `Abli karon hangtod ${fmtTime12(until)}` };
  }
  if (worked(today)) {
    if (t < minutesOf(today.open)) return { open: false, text: `Sirado pa. Abli karon sa ${fmtTime12(today.open)}` };
    if (today.break_from && today.break_to && t >= minutesOf(today.break_from) && t < minutesOf(today.break_to)) {
      return { open: false, text: `Pahulay. Abli balik sa ${fmtTime12(today.break_to)}` };
    }
  }
  for (let i = 1; i <= 7; i++) {
    const day = (now.getDay() + i) % 7;
    if (worked(hours[day])) {
      const when = i === 1 ? 'ugma' : `sa ${BIS_DAYS[day]}`;
      return { open: false, text: `Sirado na. Abli ${when} sa ${fmtTime12(hours[day].open)}` };
    }
  }
  return { open: false, text: 'Sirado karon' };
}

// ---- Forms ----------------------------------------------------------------

/** Philippine mobile number: 09XXXXXXXXX or +639XXXXXXXXX, spaces and dashes allowed. */
export const validMobile = (v) => /^(09|\+639)\d{9}$/.test(String(v || '').replace(/[\s-]/g, ''));
export const validEmail = (v) => /.+@.+\..+/.test(String(v || ''));
