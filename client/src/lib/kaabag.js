// The Kaabag's schedule (0113; other days than Sunday, 0116): its dates and
// how the pages lay it out.
// The database draws the names (kaabag_fill), so the Generate button and the
// monthly run share one scheduler; what's here is pure, so it can be tested.

import { BIS_MONTHS, parseIso } from './site.js';
import { addDays, todayIso } from './website.js';

export const KAABAG_PAGE = '/simbahan/kaabag';
/** The built-in Kaabag Structure org chart (0115); it keeps its slug when it's renamed. */
export const KAABAG_CHART_SLUG = 'kaabag-structure';
export const isKaabagChart = (chart) => chart?.slug === KAABAG_CHART_SLUG;
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

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayOf = (iso) => parseIso(iso).getDay();
/** A Mass's day; one from before 0116 has none, and was always a Sunday's. */
export const massDay = (mass) => Number(mass?.day_of_week ?? 0);

/**
 * The days of the week with a Mass to serve, as kaabag_masses_to_serve
 * (0116) has them: Sunday's Masses, and those of the other days ticked
 * (`settings.days`), less any Mass the rules leave out. Sorted, Sunday first.
 */
export function servedDays(masses = [], settings = {}) {
  const ticked = new Set(settings.days || []);
  const out = new Set();
  for (const m of masses) {
    const day = massDay(m);
    if ((day === 0 || ticked.has(day)) && !massRule(settings.mass_rules, m.id).skip) out.add(day);
  }
  return [...out].sort((a, b) => a - b);
}

/** `days` with one day ticked or not, sorted. */
export function setDay(days = [], day, on) {
  const out = new Set(days);
  if (on) out.add(day);
  else out.delete(day);
  return [...out].sort((a, b) => a - b);
}

/** The month's dates on the days of the week given (Sundays when none are). */
export function massDaysIn(month, days = [0]) {
  const want = new Set(days.length ? days : [0]);
  const out = [];
  for (let d = monthOf(month), end = nextMonth(monthOf(month)); d < end; d = addDays(d, 1)) {
    if (want.has(dayOf(d))) out.push(d);
  }
  return out;
}

/** The month's first day with a Mass to serve (the database's in kaabag_auto_generate). */
export const firstMassDay = (month, days = [0]) => massDaysIn(month, days)[0];
const lastMassDay = (month, days) => massDaysIn(month, days).at(-1);

/**
 * The months to choose from on the Generate button: the next `count` with a
 * Mass day still to come (on the `days` of the week served), and any others
 * that already have a schedule (`dates`).
 */
export function monthChoices(today = todayIso(), dates = [], count = 3, days = [0]) {
  const out = new Set(dates.map(monthOf));
  let month = monthOf(today);
  if (lastMassDay(month, days) < today) month = nextMonth(month);
  for (let i = 0; i < count; i += 1) {
    out.add(month);
    month = nextMonth(month);
  }
  return [...out].sort();
}

/** The month the tab opens on: that of the next day with a schedule, else the next one to make. */
export function openingMonth(dates, choices, today = todayIso()) {
  const next = dates.filter((d) => d >= today).sort()[0];
  return next ? monthOf(next) : choices.find((m) => m >= monthOf(today)) || choices[0];
}

/**
 * When the schedule next makes itself, as the database decides it in
 * kaabag_auto_generate: { on, month }, for the first month with none (`dates`
 * are the days scheduled, `days` the days of the week served). The run is 7
 * days before the month's first Mass day (with Sundays only, its first
 * Sunday), and each morning after that up to that day if it was missed.
 */
export function nextAutoRun(today = todayIso(), dates = [], days = [0]) {
  const done = new Set(dates.map(monthOf));
  let month = monthOf(today);
  for (let i = 0; i < 14; i += 1) {
    const first = firstMassDay(month, days);
    const due = addDays(first, -7);
    const on = due > today ? due : addDays(today, 1);
    if (!done.has(month) && on <= first) return { on, month };
    month = nextMonth(month);
  }
  return null;
}

/**
 * Rows of one list ordered by date, as [{ date, masses }], one per day.
 * `key` is the row's date field: `date` on the website, `service_date` in the admin.
 */
export function groupDays(rows, key = 'date') {
  const out = [];
  for (const row of rows) {
    const date = String(row[key]).slice(0, 10);
    const last = out[out.length - 1];
    if (last?.date === date) last.masses.push(row);
    else out.push({ date, masses: [row] });
  }
  return out;
}

/** Days by month: [{ month, days }]. */
export function groupMonths(days) {
  const out = [];
  for (const day of days) {
    const month = monthOf(day.date);
    const last = out[out.length - 1];
    if (last?.month === month) last.days.push(day);
    else out.push({ month, days: [day] });
  }
  return out;
}

/** True when every day is a Sunday, so the website can still say "Misa sa Domingo". */
export const allSundays = (days) => days.every((d) => dayOf(d.date) === 0);

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

/**
 * How many on the Kaabag list the directory leaves out, because they haven't
 * agreed to be shown (public_kaabag_directory: { total, people }).
 */
export const unnamedCount = (dir) => Math.max(0, (dir?.total || 0) - (dir?.people?.length || 0));
