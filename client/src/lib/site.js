// Helpers for the public website: Bisaya labels for the database values,
// date formatting, the Mass schedule views, office hours and the GKK areas.
// Pure functions, so they're easy to test (client/test/site.test.js).

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
  switch (row.kind) {
    case 'Mass': return row.day_of_week === 0 ? 'Misa sa Domingo' : 'Misa sa Adlaw-adlaw';
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
  const dow = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return rows
    .filter((r) => r.day_of_week === dow && minutesOf(r.start_time) > nowMin)
    .sort((a, b) => minutesOf(a.start_time) - minutesOf(b.start_time))
    .slice(0, limit)
    .map((r, i) => ({ ...r, next: i === 0 }));
}

/**
 * The week's schedule grouped by day, Sunday first, filtered by location and
 * language. Today's next row is marked `next`; days with no rows are dropped.
 */
export function groupMassByDay(rows, { location = 'all', language = 'all' } = {}, now = new Date()) {
  const nextId = upcomingToday(rows, now, 1)[0]?.id;
  return BIS_DAYS.map((name, dow) => ({
    dow,
    name,
    today: dow === now.getDay(),
    rows: rows
      .filter((r) => r.day_of_week === dow && (location === 'all' || r.location === location) && langMatches(r.language, language))
      .sort((a, b) => minutesOf(a.start_time) - minutesOf(b.start_time))
      .map((r) => ({ ...r, next: r.id === nextId })),
  })).filter((d) => d.rows.length);
}

export const massLocations = (rows) => [...new Set(rows.map((r) => r.location).filter(Boolean))].sort();

// ---- Announcements and articles -------------------------------------------

export const ANNOUNCEMENT_LABELS = { Parish: 'Parokya', GKK: 'GKK', Ministry: 'Ministry', 'Schedule change': 'Kausaban sa iskedyul' };
export const ARTICLE_LABELS = { Parish: 'Parokya', GKK: 'GKK', Ministry: 'Ministry' };

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

// ---- GKKs -----------------------------------------------------------------

/** "Sto. Niño -Balabag" → { patron: 'Sto. Niño', area: 'Balabag' }. */
export function gkkParts(name) {
  const s = String(name || '');
  const i = s.lastIndexOf(' -');
  if (i < 0) return { patron: s, area: '' };
  return { patron: s.slice(0, i).trim(), area: s.slice(i + 2).trim() };
}

/** GKKs whose name, area or puroks contain the search text, grouped by area in first-seen order. */
export function groupGkksByArea(gkks, query = '') {
  const q = query.trim().toLowerCase();
  const groups = [];
  for (const g of gkks) {
    const { patron, area } = gkkParts(g.name);
    if (q && !`${g.name} ${g.puroks || ''}`.toLowerCase().includes(q)) continue;
    const key = area || 'Uban pa';
    let grp = groups.find((x) => x.area === key);
    if (!grp) { grp = { area: key, items: [] }; groups.push(grp); }
    grp.items.push({ ...g, patron, area });
  }
  return groups;
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

// ---- Forms ----------------------------------------------------------------

/** Philippine mobile number: 09XXXXXXXXX or +639XXXXXXXXX, spaces and dashes allowed. */
export const validMobile = (v) => /^(09|\+639)\d{9}$/.test(String(v || '').replace(/[\s-]/g, ''));
export const validEmail = (v) => /.+@.+\..+/.test(String(v || ''));
