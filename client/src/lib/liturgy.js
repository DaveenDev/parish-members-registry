// The Church year for the public calendar: its seasons (Advent, Christmas,
// Lent, Holy Week, Easter, Ordinary Time) and its feasts, worked out for any
// year from data/liturgical-calendar.json (passed in as `data`, so this stays
// pure and testable: client/test/liturgy.test.js).
//
// Philippine calendar: Epiphany on the Sunday from 2 to 8 January, the
// Santo Niño on the third Sunday of January, the Ascension and Corpus Christi
// on Sundays. The usual precedence applies: a solemnity on a Sunday of
// Advent, Lent or Easter moves to the Monday, one in Holy Week or the Easter
// Octave moves after it (Saint Joseph before Palm Sunday), and a feast or
// memorial that meets a Sunday or a greater day is left out that year, except
// a Feast of the Lord, which takes a Sunday in Ordinary Time.

const DAY = 86400000;
const toDays = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / DAY;
const fromDays = (n) => new Date(n * DAY).toISOString().slice(0, 10);
export const addDays = (iso, n) => fromDays(toDays(iso) + n);
const dow = (iso) => new Date(toDays(iso) * DAY).getUTCDay();
/** The Sunday on or after `iso`. */
const sundayFrom = (iso) => addDays(iso, (7 - dow(iso)) % 7);

/** Easter Sunday (YYYY-MM-DD) in the Gregorian calendar. */
export function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The days the moveable feasts count from, for the calendar year `year`. */
export function anchors(year) {
  const easter = easterSunday(year);
  const christmas = `${year}-12-25`;
  // The fourth Sunday before Christmas.
  const lastSunday = addDays(christmas, -(dow(christmas) || 7));
  const epiphany = sundayFrom(`${year}-01-02`);
  // Epiphany on 7 or 8 January: the Baptism of the Lord is the Monday after.
  const baptism = Number(epiphany.slice(8)) >= 7 ? addDays(epiphany, 1) : addDays(epiphany, 7);
  // The Sunday within the Christmas octave, or 30 December when there's none.
  const octaveSunday = sundayFrom(`${year}-12-26`);
  return {
    easter,
    advent1: addDays(lastSunday, -21),
    epiphany,
    baptism,
    santoNino: addDays(sundayFrom(`${year}-01-01`), 14),
    holyFamily: octaveSunday <= `${year}-12-31` ? octaveSunday : `${year}-12-30`,
  };
}

/** The season `iso` falls in: advent, christmas, lent, holyweek, easter or ordinary. */
export function seasonId(iso) {
  const year = Number(iso.slice(0, 4));
  const a = anchors(year);
  if (iso >= `${year}-12-25`) return 'christmas';
  if (iso >= a.advent1) return 'advent';
  if (iso <= a.baptism) return 'christmas';
  if (iso >= addDays(a.easter, -46) && iso < addDays(a.easter, -7)) return 'lent';
  if (iso >= addDays(a.easter, -7) && iso < a.easter) return 'holyweek';
  if (iso >= a.easter && iso <= addDays(a.easter, 49)) return 'easter';
  return 'ordinary';
}

// Order on a day: the greatest first.
const LEVEL = { special: 1, solemnity: 2, sunday: 3, feast: 4, memorial: 5, devotion: 6 };
const byLevel = (x, y) => (LEVEL[x.rank] || 9) - (LEVEL[y.rank] || 9);

const years = new WeakMap();

/** Every celebration of `year`: Map of YYYY-MM-DD → [celebration], greatest first. */
function buildYear(year, data) {
  let cache = years.get(data);
  if (!cache) { cache = new Map(); years.set(data, cache); }
  if (cache.has(year)) return cache.get(year);

  const a = anchors(year);
  const days = new Map();
  const put = (iso, c) => {
    if (iso.slice(0, 4) !== String(year)) return;
    if (!days.has(iso)) days.set(iso, []);
    days.get(iso).push({ ...c, date: iso });
  };
  for (const m of data.moveable || []) put(addDays(a[m.anchor], m.offset || 0), m);

  const palm = addDays(a.easter, -7);
  // Holy Week, the Easter Octave and Ash Wednesday give way to nothing.
  const privileged = (iso) => (iso >= palm && iso <= addDays(a.easter, 7)) || iso === addDays(a.easter, -46);
  // Sundays of Advent, Lent and Easter outrank even solemnities.
  const greatSunday = (iso) => dow(iso) === 0 && ['advent', 'lent', 'holyweek', 'easter'].includes(seasonId(iso));

  for (const f of data.fixed || []) {
    const iso = `${year}-${f.date}`;
    const here = days.get(iso) || [];
    const has = (...ranks) => here.some((c) => ranks.includes(c.rank));
    const moveTo = (to) => put(to, { ...f, movedFrom: iso, obligation: false });

    if (f.rank === 'devotion') {
      const end = f.end ? `${year}-${f.end}` : iso;
      const n = toDays(end) - toDays(iso) + 1;
      for (let i = 0; i < n; i++) put(addDays(iso, i), { ...f, day: i + 1, of: n });
    } else if (f.rank === 'solemnity') {
      if (privileged(iso)) moveTo(f.date === '03-19' ? addDays(palm, -1) : addDays(a.easter, 8));
      else if (greatSunday(iso)) moveTo(addDays(iso, 1));
      else if (has('special', 'solemnity')) moveTo(addDays(iso, -1));
      else put(iso, f);
    } else if (f.rank === 'feast') {
      const lost = privileged(iso) || greatSunday(iso) || has('special', 'solemnity', 'feast') || (dow(iso) === 0 && !f.lord);
      if (!lost) put(iso, f);
    } else if (!privileged(iso) && dow(iso) !== 0 && !here.length) {
      put(iso, f);
    }
  }
  for (const list of days.values()) list.sort(byLevel);
  cache.set(year, days);
  return days;
}

/** The celebrations on `iso`, greatest first (none on most days). */
export function celebrationsOn(iso, data) {
  return buildYear(Number(iso.slice(0, 4)), data).get(iso) || [];
}

/**
 * One day in the Church year: { season: { id, name, en, color }, celebrations,
 * color }. `color` is the day's liturgical color: its celebration's, or the
 * season's on an ordinary weekday (a memorial doesn't change it here).
 */
export function liturgicalDay(iso, data) {
  const id = seasonId(iso);
  const celebrations = celebrationsOn(iso, data);
  const main = celebrations.find((c) => ['special', 'solemnity', 'sunday', 'feast'].includes(c.rank));
  const season = { id, ...(data.seasons?.[id] || {}) };
  return { season, celebrations, color: main?.color || season.color };
}

/**
 * The celebrations from `fromIso` to `toIso` (both included), in date order,
 * of the ranks asked for (all by default). A run like Simbang Gabi shows once,
 * on its first day in the range.
 */
export function celebrationsBetween(fromIso, toIso, data, ranks = null) {
  const out = [];
  const seen = new Set();
  for (let iso = fromIso; iso <= toIso; iso = addDays(iso, 1)) {
    for (const c of celebrationsOn(iso, data)) {
      if (ranks && !ranks.includes(c.rank)) continue;
      if (c.of) {
        const key = `${c.name}|${addDays(iso, 1 - c.day)}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      out.push(c);
    }
  }
  return out;
}

/** The season `iso` is in, with the day it ends, and the next season and its first day. */
export function seasonSpan(iso, data) {
  const id = seasonId(iso);
  let end = iso;
  while (seasonId(addDays(end, 1)) === id) end = addDays(end, 1);
  const nextStart = addDays(end, 1);
  const nextId = seasonId(nextStart);
  return {
    season: { id, ...(data.seasons?.[id] || {}) },
    ends: end,
    next: { id: nextId, ...(data.seasons?.[nextId] || {}), starts: nextStart },
  };
}

/** How the liturgical colors show on the site (white as gold, so it shows on cream), with their Bisaya names. */
export const LITURGY_COLORS = {
  violet: { hex: '#6d3b9e', name: 'Lila' },
  white: { hex: '#b08d2e', name: 'Puti' },
  red: { hex: '#b3261e', name: 'Pula' },
  green: { hex: '#2f7d4a', name: 'Berde' },
  rose: { hex: '#c2588f', name: 'Rosas' },
};
export const liturgyHex = (color) => LITURGY_COLORS[color]?.hex || LITURGY_COLORS.green.hex;

/** A celebration's kind, for its label: "Solemnidad", "Kapistahan", … */
export const RANK_LABELS = {
  special: 'Dakong adlaw',
  solemnity: 'Solemnidad',
  sunday: 'Domingo',
  feast: 'Kapistahan',
  memorial: 'Handumanan',
  devotion: 'Debosyon',
};
