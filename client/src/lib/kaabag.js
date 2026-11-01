// The Kaabag's Sunday schedule (0113): its dates and how the pages lay it out.
// The database draws the names (kaabag_fill), so the Generate button and the
// monthly run share one scheduler; what's here is pure, so it can be tested.

import { BIS_MONTHS, parseIso } from './site.js';
import { addDays, todayIso } from './website.js';

export const KAABAG_PAGE = '/simbahan/kaabag';
/** The ministry the schedule is for ("Kaabag", or a longer name starting with it, as in kaabag_registered). */
export const isKaabagGroup = (name) => /^\s*kaabag/i.test(String(name || ''));

/** The first of the month `iso` is in. */
export const monthOf = (iso) => `${String(iso).slice(0, 7)}-01`;

export function nextMonth(month) {
  const [y, m] = String(month).split('-').map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

/** "December 2026", for staff. */
export const monthName = (month) => parseIso(month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
/** "Disyembre 2026", for the website. */
export const monthTitle = (month) => `${BIS_MONTHS[parseIso(month).getMonth()]} ${String(month).slice(0, 4)}`;

/** The month's first Sunday (the database's kaabag_first_sunday). */
export function firstSunday(month) {
  const first = monthOf(month);
  return addDays(first, (7 - parseIso(first).getDay()) % 7);
}

/** The last Sunday of the month. */
function lastSunday(month) {
  const last = addDays(nextMonth(monthOf(month)), -1);
  return addDays(last, -parseIso(last).getDay());
}

/**
 * The months to choose from on the Generate button: the next `count` with a
 * Sunday still to come, and any others that already have a schedule (`dates`).
 */
export function monthChoices(today = todayIso(), dates = [], count = 3) {
  const out = new Set(dates.map(monthOf));
  let month = monthOf(today);
  if (lastSunday(month) < today) month = nextMonth(month);
  for (let i = 0; i < count; i += 1) {
    out.add(month);
    month = nextMonth(month);
  }
  return [...out].sort();
}

/** The month the tab opens on: the next Sunday's that has a schedule, else the next one to make. */
export function openingMonth(dates, choices, today = todayIso()) {
  const next = dates.filter((d) => d >= today).sort()[0];
  return next ? monthOf(next) : choices.find((m) => m >= monthOf(today)) || choices[0];
}

/**
 * When the schedule next makes itself, as the database decides it in
 * kaabag_auto_generate: { on, month }, for the first month with none (`dates`
 * are the days scheduled). The run is 7 days before the month's first Sunday,
 * and each morning after that up to that Sunday if it was missed.
 */
export function nextAutoRun(today = todayIso(), dates = []) {
  const done = new Set(dates.map(monthOf));
  let month = monthOf(today);
  for (let i = 0; i < 14; i += 1) {
    const first = firstSunday(month);
    const due = addDays(first, -7);
    const on = due > today ? due : addDays(today, 1);
    if (!done.has(month) && on <= first) return { on, month };
    month = nextMonth(month);
  }
  return null;
}

/**
 * Rows of one list ordered by date, as [{ date, masses }], one per Sunday.
 * `key` is the row's date field: `date` on the website, `service_date` in the admin.
 */
export function groupSundays(rows, key = 'date') {
  const out = [];
  for (const row of rows) {
    const date = String(row[key]).slice(0, 10);
    const last = out[out.length - 1];
    if (last?.date === date) last.masses.push(row);
    else out.push({ date, masses: [row] });
  }
  return out;
}

/** Sundays by month: [{ month, sundays }]. */
export function groupMonths(sundays) {
  const out = [];
  for (const sunday of sundays) {
    const month = monthOf(sunday.date);
    const last = out[out.length - 1];
    if (last?.month === month) last.sundays.push(sunday);
    else out.push({ month, sundays: [sunday] });
  }
  return out;
}

/**
 * The lines the website shows for a Mass. `names` has null for anyone who
 * hasn't agreed to be shown by name, so they're only counted.
 */
export function peopleLines(names = []) {
  const named = names.filter(Boolean);
  const hidden = names.length - named.length;
  if (!hidden) return named;
  return [...named, named.length ? `ug ${hidden} pa ka Kaabag` : `${hidden} ka Kaabag`];
}

/** How many places a Mass still needs filled. */
export const placesShort = (service) => Math.max(0, service.needed - service.people.length);

/** The rules for one Mass: { skip, servers } (`servers` empty means the usual number). */
export const massRule = (rules, id) => rules?.[id] || {};

/** `rules` with one Mass's changed; a Mass with nothing special is left out. */
export function setMassRule(rules, id, patch) {
  const rule = { ...massRule(rules, id), ...patch };
  if (!rule.skip) delete rule.skip;
  if (!rule.servers) delete rule.servers;
  const { [id]: _old, ...others } = rules || {};
  return Object.keys(rule).length ? { ...others, [id]: rule } : others;
}

export const MAX_SERVERS = 12;
/** A whole number of Kaabag a Mass can have. */
export const validServers = (n) => Number.isInteger(n) && n >= 1 && n <= MAX_SERVERS;
