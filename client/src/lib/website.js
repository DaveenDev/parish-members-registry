// Option lists and helpers for the Parish Website admin page. The values
// match the check constraints in supabase/migrations/0011_website_content.sql.

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// The Mass schedule types (0016_mass_types.sql). Regular Mass is always on
// Sunday, a Daily Mass repeats on the weekdays ticked, a Special Mass is on a
// date (or a run of dates) and a GKK Mass is either weekly or on a date.
export const MASS_KINDS = ['Regular Mass', 'Daily Mass', 'Anticipated Mass', 'GKK Mass', 'Special Mass', 'Confession', 'Adoration', 'Other'];
export const MASS_LANGUAGES = ['Bisaya', 'English', 'Bisaya & English'];
export const DEFAULT_LOCATION = 'Main church';
/** Monday to Saturday, the days a Daily Mass can be on. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6];

/**
 * Special Mass presets, in groups. A preset with a month and day fills in its
 * next date (and `endDay` the last day of a run); movable feasts like Ash
 * Wednesday leave the date to staff. `obligation` marks the Philippine holy
 * days of obligation (CBCP): Jan 1, Dec 8 and Dec 25.
 */
export const SPECIAL_OCCASIONS = [
  ['Holy Days of Obligation', [
    { name: 'Solemnity of Mary, Mother of God', month: 1, day: 1, obligation: true },
    { name: 'Immaculate Conception', month: 12, day: 8, obligation: true },
    { name: 'Christmas Day', month: 12, day: 25, obligation: true },
  ]],
  ['Patronal and local fiestas', [
    { name: 'Patronal Fiesta – Our Lady of Guadalupe', month: 12, day: 12 },
    { name: 'GKK / Barangay Fiesta' },
  ]],
  ['Feasts of Mary', [
    { name: 'Our Lady of Lourdes', month: 2, day: 11 },
    { name: 'Annunciation of the Lord', month: 3, day: 25 },
    { name: 'Assumption of Mary', month: 8, day: 15 },
    { name: 'Nativity of Mary', month: 9, day: 8 },
    { name: 'Our Lady of the Rosary', month: 10, day: 7 },
  ]],
  ['Lent, Holy Week and Easter', [
    { name: 'Ash Wednesday' },
    { name: 'Palm Sunday' },
    { name: 'Chrism Mass' },
    { name: "Holy Thursday – Mass of the Lord's Supper" },
    { name: "Good Friday – Celebration of the Lord's Passion" },
    { name: 'Easter Vigil' },
    { name: 'Easter Sunday' },
  ]],
  ['Christmas season', [
    { name: 'Simbang Gabi', month: 12, day: 16, endDay: 24 },
    { name: 'Christmas Eve Mass', month: 12, day: 24 },
    { name: "New Year's Eve Mass", month: 12, day: 31 },
    { name: 'Feast of the Santo Niño' },
  ]],
  ['Other solemnities', [
    { name: "All Saints' Day", month: 11, day: 1 },
    { name: "All Souls' Day", month: 11, day: 2 },
    { name: 'Pentecost' },
    { name: 'Corpus Christi' },
    { name: 'Sacred Heart of Jesus' },
    { name: 'Christ the King' },
  ]],
  ['Devotional and occasional', [
    { name: 'First Friday Mass' },
    { name: 'First Saturday Mass' },
    { name: 'Healing Mass' },
    { name: 'Thanksgiving Mass' },
    { name: 'Mass for the Sick' },
  ]],
];

/** The preset with this name, or null. */
export function findOccasion(name) {
  const n = String(name || '').trim().toLowerCase();
  for (const [, items] of SPECIAL_OCCASIONS) {
    const hit = items.find((o) => o.name.toLowerCase() === n);
    if (hit) return hit;
  }
  return null;
}

/**
 * The next date (YYYY-MM-DD) a fixed-date preset falls on, from `fromIso`
 * (today if it's that day): { start, end } with `end` set for a run like
 * Simbang Gabi. null for presets without a fixed date.
 */
export function nextOccasionDates(preset, fromIso = todayIso()) {
  if (!preset?.month || !preset?.day) return null;
  const year = Number(fromIso.slice(0, 4));
  const iso = (y, d) => `${y}-${String(preset.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const lastDay = preset.endDay || preset.day;
  // A run already under way (Dec 20 during Simbang Gabi) still counts as this year's.
  const y = iso(year, lastDay) >= fromIso ? year : year + 1;
  return { start: iso(y, preset.day), end: preset.endDay ? iso(y, preset.endDay) : '' };
}

/** The day of the week (0 = Sunday) a YYYY-MM-DD date falls on. */
export function dayOfDate(iso) {
  return new Date(`${iso}T00:00`).getDay();
}

/** Older rows (before 0016) say just "Mass": Sunday ones are Regular Masses, the rest Daily. */
export function massType(row) {
  if (row.kind === 'Mass') return row.day_of_week === 0 ? 'Regular Mass' : 'Daily Mass';
  return row.kind;
}

/** Rows on a date: still to come (or under way) on `todayIso`. Weekly rows always are. */
export function isCurrentMass(row, today = todayIso()) {
  if (!row.mass_date) return true;
  return String(row.mass_end_date || row.mass_date).slice(0, 10) >= today;
}

/** Whether `row` is held on the date `iso` (its weekday, or within its dates). */
export function massOnDate(row, iso) {
  if (!row.mass_date) return row.day_of_week === dayOfDate(iso);
  const start = String(row.mass_date).slice(0, 10);
  const end = String(row.mass_end_date || row.mass_date).slice(0, 10);
  return iso >= start && iso <= end;
}

const sameDailyEntry = (a, b) => a.start_time === b.start_time && a.location === b.location && a.language === b.language
  && (a.notes || '') === (b.notes || '') && !!a.published === !!b.published;

/**
 * Daily Mass rows that are one entry (the same time, place, language, note
 * and published state) merged: { ...row, ids, days }, days Monday first.
 * Other rows pass through unchanged.
 */
export function groupDaily(rows) {
  const out = [];
  for (const r of rows) {
    if (massType(r) !== 'Daily Mass') { out.push(r); continue; }
    const entry = out.find((e) => e.days && sameDailyEntry(e, r));
    if (entry) {
      entry.ids.push(r.id);
      entry.rows.push(r);
      entry.days.push(r.day_of_week);
      entry.days.sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    } else {
      out.push({ ...r, kind: 'Daily Mass', ids: [r.id], rows: [r], days: [r.day_of_week] });
    }
  }
  return out;
}

/** Runs of consecutive days, Monday first: [1,2,3,5] → [[1,2,3],[5]]. */
export function dayRuns(days) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const sorted = order.filter((d) => days.includes(d));
  const runs = [];
  for (const d of sorted) {
    const last = runs[runs.length - 1];
    if (last && order.indexOf(d) === order.indexOf(last[last.length - 1]) + 1) last.push(d);
    else runs.push([d]);
  }
  return runs;
}

/** "Mon–Sat", "Mon, Wed, Fri", "Tue–Thu, Sat" with the given day names. */
export function dayList(days, names = DAYS.map((d) => d.slice(0, 3)), sep = '–') {
  return dayRuns(days).map((run) => (run.length > 2 ? `${names[run[0]]}${sep}${names[run[run.length - 1]]}` : run.map((d) => names[d]).join(', '))).join(', ');
}

export const ANNOUNCEMENT_CATEGORIES = ['Parish', 'GKK', 'Ministry', 'Schedule change'];

export const EVENT_TYPES = ['Fiesta', 'Novena', 'Recollection / Retreat', 'GKK Rotation', 'Seminar', 'Meeting', 'Other'];

export const EVENT_TONES = {
  Fiesta: 'gold',
  Novena: 'blue',
  'Recollection / Retreat': 'green',
  'GKK Rotation': 'blue',
  Seminar: 'gray',
  Meeting: 'gray',
  Other: 'gray',
};

/** "17:30:00" or "17:30" → "5:30 PM". */
export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  if (Number.isNaN(h)) return t;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${suffix}`;
}

/** "17:30:00" → "17:30", the value an <input type="time"> expects. */
export function toTimeInput(t) {
  return t ? String(t).slice(0, 5) : '';
}

/** Today as YYYY-MM-DD in the browser's (the parish office's) time zone. */
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** YYYY-MM-DD plus `days`. */
export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The Sunday on or before `iso` (bulletins are filed by the week's Sunday). */
export function sundayOf(iso) {
  const d = new Date(`${iso}T00:00`);
  return addDays(iso, -d.getDay());
}

/** Office hours for a parish that hasn't set them yet: Mon–Fri 8–5 with lunch, Sat 8–12, closed Sunday. */
export function defaultOfficeHours() {
  return DAYS.map((_, i) => {
    if (i === 0) return { closed: true, open: '', close: '', break_from: '', break_to: '' };
    if (i === 6) return { closed: false, open: '08:00', close: '12:00', break_from: '', break_to: '' };
    return { closed: false, open: '08:00', close: '17:00', break_from: '12:00', break_to: '13:00' };
  });
}

/** Saved office hours, padded to 7 days so older or partial data still edits cleanly. */
export function normalizeOfficeHours(saved) {
  if (!Array.isArray(saved) || saved.length !== 7) return defaultOfficeHours();
  return saved.map((d) => ({
    closed: !!d?.closed,
    open: d?.open || '',
    close: d?.close || '',
    break_from: d?.break_from || '',
    break_to: d?.break_to || '',
  }));
}

/** Days an announcement with no end date stays on the website. */
export const ANNOUNCEMENT_DAYS = 30;
/** More pinned announcements than this and a pin stops meaning much; the admin warns. */
export const MAX_PINNED = 2;

/**
 * The last day an announcement shows on the website: its end date, or
 * ANNOUNCEMENT_DAYS after it starts. null for a pinned one with no end date,
 * which stays until it's unpinned.
 */
export function announcementLastDay(a) {
  if (a.expires_on) return a.expires_on;
  if (a.pinned || !a.publish_on) return null;
  return addDays(a.publish_on, ANNOUNCEMENT_DAYS);
}

/** Where an announcement stands today: Draft, Scheduled, Expired or Live. */
export function announcementState(a, today = todayIso()) {
  if (!a.published) return 'Draft';
  if (a.publish_on > today) return 'Scheduled';
  const last = announcementLastDay(a);
  if (last && last < today) return 'Expired';
  return 'Live';
}

export const STATE_TONES = { Draft: 'gray', Scheduled: 'blue', Expired: 'red', Live: 'green', Published: 'green' };

// ---- Office secretary's Messenger (0026 migration) --------------------------

const FB_HOSTS = /^(?:www\.|m\.|web\.|mobile\.)?(?:facebook\.com|fb\.com|messenger\.com|m\.me)$/i;
const FB_NOT_USERNAMES = ['profile.php', 'people', 'pages', 'groups', 'share', 'messages', 't'];
const FB_NAME = /^[A-Za-z0-9.]+$/;

/**
 * The Facebook username (or numeric profile id) in what staff typed: a bare
 * username, "@username", or a facebook.com / fb.com / m.me / messenger.com
 * link. '' when blank, null when it can't be read as one.
 */
export function messengerUsername(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const plain = raw.replace(/^@/, '');
  if (FB_NAME.test(plain)) return plain.replace(/^\.+|\.+$/g, '') || null;
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!FB_HOSTS.test(url.hostname)) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  // facebook.com/profile.php?id=123, facebook.com/people/Name/123, messenger.com/t/name
  if (parts[0] === 'profile.php') return /^\d+$/.test(url.searchParams.get('id') || '') ? url.searchParams.get('id') : null;
  if (parts[0] === 'people') return /^\d+$/.test(parts[2] || '') ? parts[2] : null;
  if (parts[0] === 't') parts.shift();
  const name = parts[0];
  if (!name || FB_NOT_USERNAMES.includes(name.toLowerCase())) return null;
  return FB_NAME.test(name) ? name : null;
}

/** "https://m.me/<username>" for what staff typed, or '' when there's no usable username. */
export function messengerLink(input) {
  const name = messengerUsername(input);
  return name ? `https://m.me/${encodeURIComponent(name)}` : '';
}

/** True when lat/lng are both filled in and inside the valid ranges. */
export function validCoords(lat, lng) {
  const a = Number(lat);
  const b = Number(lng);
  return lat !== '' && lng !== '' && lat != null && lng != null && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !Number.isNaN(a) && !Number.isNaN(b);
}

/** Google Maps embed (iframe src) with a pin on lat/lng. */
export function mapEmbedUrl(lat, lng, zoom = 16) {
  return `https://maps.google.com/maps?q=${Number(lat)},${Number(lng)}&z=${zoom}&output=embed`;
}
