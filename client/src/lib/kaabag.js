// The Kaabag page (/simbahan/kaabag, 0102 migration): the month's rotation of
// Kaabag at the Masses, the Kaabag directory and the Kaabag Structure chart.
// Pure helpers shared by the page and Parish Website → Kaabag, so they can be
// unit tested (client/test/kaabag.test.js).
//
// A rotation slot is one Mass the Kaabag serve at:
//   { date: 'YYYY-MM-DD', time: 'HH:MM', location, note, servers: [kaabag id…] }
// A month is 'YYYY-MM-01'.

import { massOnDate, massType } from './website.js';
import { BIS_MONTHS, minutesOf } from './site.js';

export const KAABAG_PAGE = '/simbahan/kaabag';
/** The built-in Kaabag Structure org chart (0102); its slug stays when it's renamed. */
export const KAABAG_CHART_SLUG = 'kaabag-structure';
export const isKaabagChart = (c) => c?.slug === KAABAG_CHART_SLUG;
export const KAABAG_MIGRATION = '0102_kaabag.sql';

const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The month 'YYYY-MM-01' that the date `iso` is in. */
export const monthOf = (iso) => `${String(iso).slice(0, 7)}-01`;

/** The month `n` months after `month` (before it, for a negative `n`). */
export function addMonths(month, n) {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Every date of `month`, first to last. */
export function monthDates(month) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const last = new Date(y, m, 0).getDate();
  return Array.from({ length: last }, (_, i) => `${month.slice(0, 7)}-${String(i + 1).padStart(2, '0')}`);
}

/** "Nobyembre 2026", for the website. */
export const monthTitle = (month) => `${BIS_MONTHS[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;
/** "November 2026", for the admin. */
export const monthTitleEn = (month) => `${MONTHS_EN[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`;

/** The months the admin's month picker offers: from last month to six ahead, and any with a saved rotation. */
export function monthChoices(today, saved = []) {
  const now = monthOf(today);
  const set = new Set([...Array.from({ length: 8 }, (_, i) => addMonths(now, i - 1)), ...saved]);
  return [...set].sort();
}

// The Mass schedule's types a rotation can be filled from, and those ticked at first.
export const FILL_TYPES = [
  ['Regular Mass', 'Sunday Masses'],
  ['Anticipated Mass', 'Anticipated Masses'],
  ['Special Mass', 'Special Masses (feasts, holy days)'],
  ['Daily Mass', 'Daily Masses'],
  ['GKK Mass', 'GKK Masses'],
];
export const DEFAULT_FILL = ['Regular Mass', 'Anticipated Mass', 'Special Mass'];

const hhmm = (t) => {
  const [h, m] = String(t || '').split(':');
  return h === undefined || m === undefined ? '' : `${String(Number(h)).padStart(2, '0')}:${m.slice(0, 2)}`;
};
const placeKey = (s) => String(s || '').trim().toLowerCase();
const slotKey = (s) => `${s.date}|${hhmm(s.time)}|${placeKey(s.location)}`;

/** Slots in order: by date, then time, then place. */
export function sortSlots(slots) {
  return [...slots].sort((a, b) => a.date.localeCompare(b.date) || minutesOf(a.time) - minutesOf(b.time)
    || placeKey(a.location).localeCompare(placeKey(b.location)));
}

/** `slots` with `extra` added, leaving out any already there (same date, time and place). */
export function mergeSlots(slots, extra) {
  const seen = new Set(slots.map(slotKey));
  const added = [];
  for (const s of extra) {
    const k = slotKey(s);
    if (seen.has(k)) continue;
    seen.add(k);
    added.push(s);
  }
  return sortSlots([...slots, ...added]);
}

/**
 * The Masses of `month` in the Mass schedule (mass_schedules rows), as
 * empty slots: the published ones of `types` (massType), at `location`
 * ('all' for every church and chapel). A Special Mass carries its occasion
 * as the note.
 */
export function slotsFromSchedule(rows, month, { types = DEFAULT_FILL, location = 'all' } = {}) {
  const picked = (rows || []).filter((r) => r.published !== false && types.includes(massType(r))
    && (location === 'all' || placeKey(r.location) === placeKey(location)));
  const out = [];
  for (const date of monthDates(month)) {
    for (const r of picked) {
      if (!massOnDate(r, date)) continue;
      out.push({ date, time: hhmm(r.start_time), location: r.location || '', note: massType(r) === 'Special Mass' ? r.occasion || '' : '', servers: [] });
    }
  }
  return mergeSlots([], out);
}

/**
 * Hand the Kaabag in `ids` (the directory's order) round the slots that
 * have nobody yet, `perMass` to each, carrying on from one Mass to the next
 * so everyone gets a turn before anyone gets a second. Slots that already
 * have Kaabag keep them. Returns new slots.
 */
export function rotate(slots, ids, perMass = 2) {
  const n = Math.max(1, Math.min(Number(perMass) || 1, ids.length));
  if (!ids.length) return slots;
  let next = 0;
  return slots.map((s) => {
    if (s.servers.length) return s;
    const servers = [];
    while (servers.length < n) {
      servers.push(ids[next % ids.length]);
      next += 1;
    }
    return { ...s, servers };
  });
}

/** How many Masses each Kaabag serves at in `slots`: a Map of id → count. */
export function turnsOf(slots) {
  const turns = new Map();
  for (const s of slots) for (const id of s.servers) turns.set(id, (turns.get(id) || 0) + 1);
  return turns;
}

/** Slots by day: [{ date, slots }], in order. */
export function slotsByDate(slots) {
  const days = [];
  for (const s of sortSlots(slots)) {
    const last = days[days.length - 1];
    if (last?.date === s.date) last.slots.push(s);
    else days.push({ date: s.date, slots: [s] });
  }
  return days;
}

/** What stops `slots` from being saved as `month`'s rotation, or ''. */
export function slotsError(slots, month) {
  for (const s of slots) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date || '')) return 'Every Mass needs its date.';
    if (monthOf(s.date) !== month) return `The Mass on ${s.date} isn't in ${monthTitleEn(month)}.`;
    if (!hhmm(s.time)) return `The Mass on ${s.date} needs its time.`;
  }
  const keys = slots.map(slotKey);
  const twice = keys.find((k, i) => keys.indexOf(k) !== i);
  if (twice) {
    const [date, time] = twice.split('|');
    return `There are two Masses on ${date} at ${time} in the same place. Remove one.`;
  }
  return '';
}

/** The slots as save_kaabag_month() takes them. */
export const slotsPayload = (slots) => sortSlots(slots).map((s) => ({
  date: s.date, time: hhmm(s.time), location: (s.location || '').trim(), note: (s.note || '').trim(), servers: [...new Set(s.servers)],
}));

/**
 * The month the website opens on (`months` are public_kaabag()'s, in
 * order): this month's when it's published, else the next one, else the
 * latest. null when none is published.
 */
export function pickMonth(months, today) {
  if (!months?.length) return null;
  const now = monthOf(today);
  return months.find((m) => m.month === now) || months.find((m) => m.month > now) || months[months.length - 1];
}

/** A published month's Masses by day, with `filter` (a Kaabag's name) keeping only their turns. */
export function monthDays(month, filter = '') {
  const services = (month?.services || []).filter((s) => !filter || s.servers.some((k) => k.name === filter));
  return slotsByDate(services.map((s) => ({ ...s, time: hhmm(s.time) })));
}

/** Everyone on a published month's rotation, A to Z, for "Pangitaa ang imong ngalan". */
export function monthNames(month) {
  const names = new Set((month?.services || []).flatMap((s) => s.servers.map((k) => k.name)));
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/** A registry member's name for the directory: "Juan D. Dela Cruz Jr.". */
export function registryName(m) {
  const middle = String(m.middle_name || '').trim();
  return [m.first_name, middle ? `${middle[0].toUpperCase()}.` : '', m.last_name, m.suffix].map((x) => String(x || '').trim()).filter(Boolean).join(' ');
}

// No longer in the parish: not offered for the directory.
const GONE = ['Moved away', 'Deceased', 'Left the Church'];

/** The registry's Kaabag (members of the ministry) not in the directory yet, A to Z. */
export function notListed(registry, directory) {
  const listed = new Set(directory.map((d) => d.member_id).filter(Boolean));
  return registry
    .filter((m) => !listed.has(m.id) && !GONE.includes(m.membership_status))
    .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, undefined, { sensitivity: 'base' }));
}

/** The directory in its order on the page. */
export const sortDirectory = (rows) => [...rows].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)
  || String(a.name).localeCompare(String(b.name), undefined, { sensitivity: 'base' }) || a.id - b.id);

/** The directory's order after moving the row at `i` by `d` (-1 up, 1 down): the ids, top to bottom. */
export function moved(rows, i, d) {
  const ids = sortDirectory(rows).map((r) => r.id);
  const j = i + d;
  if (j < 0 || j >= ids.length) return ids;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}
