// Parish census helpers shared by the admin census screen, the printed census
// form and their tests. The database (0007_census.sql) has the same lists and
// suggestion rule — keep the two in sync.

import { PARTICIPATION_ITEMS, PARTICIPATION_LEVELS, ageFromDob } from '../constants.js';

// Keep in sync with census_member_statuses() in the 0007 migration.
export const MEMBERSHIP_STATUSES = ['Active', 'Inactive', 'Moved away', 'Deceased', 'Left the Church'];

// No longer on the household roster; hidden from lists unless asked for.
export const FORMER_STATUSES = ['Moved away', 'Deceased'];

// What the family sees on the printed form.
export const MEMBERSHIP_STATUS_LABELS = {
  Active: 'Aktibo',
  Inactive: 'Dili aktibo',
  'Moved away': 'Nibalhin',
  Deceased: 'Namatay',
  'Left the Church': 'Mibiya sa Simbahan',
};

/**
 * Whether the participation questions apply to a member with this status:
 * only someone active, or whose status is not chosen yet. Inactive, moved,
 * deceased or left members have nothing to answer.
 */
export function asksParticipation(status) {
  return !status || status === 'Active';
}

// Children this age or younger count as Aktibo in the census portal, without
// the participation questions.
export const YOUNG_CHILD_MAX_AGE = 8;

/** True for a member aged YOUNG_CHILD_MAX_AGE or under on `today`; false when the birthday is unknown. */
export function isYoungChild(dob, today = new Date()) {
  const age = ageFromDob(dob, today);
  return age !== null && age >= 0 && age <= YOUNG_CHILD_MAX_AGE;
}

export const CENSUS_SOURCES = ['Paper', 'Staff visit'];

export const STATUS_TONES = {
  Active: 'green',
  Inactive: 'gold',
  'Moved away': 'gray',
  Deceased: 'gray',
  'Left the Church': 'red',
};

const ITEM_KEYS = PARTICIPATION_ITEMS.map(([key]) => key);

/** Only known survey keys with known answers, like census_clean_participation(). */
export function cleanParticipation(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return {};
  const out = {};
  for (const key of ITEM_KEYS) if (PARTICIPATION_LEVELS.includes(p[key])) out[key] = p[key];
  return out;
}

/**
 * The status to pre-select from a member's participation answers, mirroring
 * census_suggest_status() in the 0007 migration:
 *   Active   — Mass is Aktibo, or at least two items are Aktibo / Panagsa
 *   Inactive — something was answered and every answer is Wala
 *   null     — not enough to go on; staff decide
 */
export function suggestStatus(participation) {
  const answers = Object.entries(cleanParticipation(participation));
  if (answers.some(([k, v]) => k === 'mass' && v === 'Aktibo')) return 'Active';
  if (answers.filter(([, v]) => v === 'Aktibo' || v === 'Panagsa').length >= 2) return 'Active';
  if (answers.length && answers.every(([, v]) => v === 'Wala')) return 'Inactive';
  return null;
}

/**
 * Rows for census_record_household(): one per member with a status chosen.
 * `rows` is [{ memberId, status, participation, notes }]; members still
 * without a status are left out (not confirmed yet).
 */
export function censusResponsesPayload(rows) {
  return rows
    .filter((r) => MEMBERSHIP_STATUSES.includes(r.status))
    .map((r) => ({
      memberId: r.memberId,
      status: r.status,
      participation: cleanParticipation(r.participation),
      notes: (r.notes || '').trim(),
    }));
}

/** "2026 Census" for a census starting on `date` (a Date or yyyy-mm-dd). */
export function defaultCensusLabel(date = new Date()) {
  const d = typeof date === 'string' ? new Date(`${date}T00:00`) : date;
  return `${d.getFullYear()} Census`;
}

/**
 * When the next census is due: `intervalMonths` after the latest census
 * started. null when there has never been one.
 */
export function nextCensusDue(lastStartsOn, intervalMonths) {
  if (!lastStartsOn || !intervalMonths) return null;
  const d = new Date(`${String(lastStartsOn).slice(0, 10)}T00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const due = new Date(d.getFullYear(), d.getMonth() + Number(intervalMonths), d.getDate());
  const pad = (n) => String(n).padStart(2, '0');
  return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
}

/**
 * Pivot census_summary() rows ({ gkk, status, members }) into one row per
 * GKK with a count per status, a total and the share confirmed, plus a
 * parish-wide total row. Households without a GKK are grouped as "No GKK".
 */
export function summarizeCensus(rows) {
  const columns = [...MEMBERSHIP_STATUSES, 'Not confirmed'];
  const blank = () => Object.fromEntries(columns.map((c) => [c, 0]));
  const byGkk = new Map();
  for (const r of rows || []) {
    const key = r.gkk || 'No GKK';
    if (!byGkk.has(key)) byGkk.set(key, blank());
    const counts = byGkk.get(key);
    if (r.status in counts) counts[r.status] += r.members;
  }
  const finish = (label, counts) => {
    const total = columns.reduce((n, c) => n + counts[c], 0);
    const confirmed = total - counts['Not confirmed'];
    return { label, counts, total, confirmed, pct: total ? Math.round((confirmed / total) * 100) : 0 };
  };
  const gkks = [...byGkk.keys()].sort((a, b) => (a === 'No GKK') - (b === 'No GKK') || a.localeCompare(b));
  const out = gkks.map((g) => finish(g, byGkk.get(g)));
  const all = blank();
  for (const r of out) for (const c of columns) all[c] += r.counts[c];
  return { columns, rows: out, total: finish('All GKKs', all) };
}

// ---- last year's household list (0041 migration) -------------------------

// Keep in sync with census_last_year_list's status check.
export const LAST_YEAR_STATUSES = ['Not yet', 'Registered', 'Moved away', 'Deceased', 'Duplicate'];
// Names set aside: they no longer count toward last year's households.
export const LAST_YEAR_SET_ASIDE = ['Moved away', 'Deceased', 'Duplicate'];
export const LAST_YEAR_STATUS_TONES = { 'Not yet': 'gold', Registered: 'green', 'Moved away': 'gray', Deceased: 'gray', Duplicate: 'gray' };

const clip = (v, n) => String(v ?? '').trim().slice(0, n);

/**
 * Names typed or pasted one household per line: "Head name, Purok, note".
 * Only the name is needed; extra commas stay in the note. Blank lines are
 * skipped. Returns [{ head_name, purok, note }].
 */
export function parseLastYearLines(text) {
  return String(text || '').split(/\r?\n/).map((line) => {
    const [name, purok, ...rest] = line.split(',');
    return { head_name: clip(name, 200), purok: clip(purok, 200), note: clip(rest.join(','), 500) };
  }).filter((r) => r.head_name);
}

// Header names a spreadsheet might use for each column (lowercased, spaces and punctuation dropped).
const CSV_HEADERS = {
  gkk: ['gkk', 'bec'],
  head_name: ['headname', 'headofhousehold', 'head', 'name', 'householdhead', 'pangalan', 'ngalan'],
  purok: ['purok', 'sitio', 'puroksitio', 'zone'],
  note: ['note', 'notes', 'remarks', 'address'],
};

/**
 * Rows from an uploaded spreadsheet (parseCsv() output). A header row names
 * the columns (GKK, Head of household, Purok, Note, in any order); without
 * one the columns are read as name, purok, note. Rows without a GKK go to
 * `defaultGkk`. GKK names are matched to `gkkNames` ignoring case. Returns
 * { rows: [{ gkk, head_name, purok, note }], skipped: [{ line, reason }] }.
 */
export function parseLastYearCsv(csvRows, { defaultGkk = null, gkkNames = [] } = {}) {
  const norm = (h) => String(h || '').toLowerCase().replace(/[^a-z]/g, '');
  const header = (csvRows[0] || []).map(norm);
  const col = Object.fromEntries(Object.entries(CSV_HEADERS).map(([k, names]) => [k, header.findIndex((h) => names.includes(h))]));
  const hasHeader = col.head_name >= 0;
  if (!hasHeader) Object.assign(col, { gkk: -1, head_name: 0, purok: 1, note: 2 });
  const byLower = new Map(gkkNames.map((g) => [g.toLowerCase(), g]));
  const rows = [];
  const skipped = [];
  csvRows.slice(hasHeader ? 1 : 0).forEach((r, i) => {
    const line = i + (hasHeader ? 2 : 1);
    if (!r.some((c) => c.trim())) return; // blank line
    const get = (k) => (col[k] >= 0 ? r[col[k]] : '');
    const head_name = clip(get('head_name'), 200);
    if (!head_name) { skipped.push({ line, reason: 'No name' }); return; }
    const typed = clip(get('gkk'), 200);
    const gkk = typed ? byLower.get(typed.toLowerCase()) : defaultGkk;
    if (!gkk) { skipped.push({ line, reason: typed ? `Unknown GKK “${typed}”` : 'No GKK' }); return; }
    rows.push({ gkk, head_name, purok: clip(get('purok'), 200), note: clip(get('note'), 500) });
  });
  return { rows, skipped };
}

/**
 * Leave out names already on the list (same GKK, name and purok, ignoring
 * case and spacing) or repeated within `rows`, so uploading the same
 * spreadsheet twice adds nothing. Returns { fresh, repeated }.
 */
export function dropRepeatedNames(rows, existing) {
  const key = (r) => [r.gkk, r.head_name, r.purok].map((v) => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim()).join('|');
  const seen = new Set((existing || []).map(key));
  const fresh = [];
  let repeated = 0;
  for (const r of rows || []) {
    const k = key(r);
    if (seen.has(k)) { repeated += 1; continue; }
    seen.add(k);
    fresh.push(r);
  }
  return { fresh, repeated };
}

/** Map of GKK → { total, notYet, registered, setAside } from list rows ({ gkk, status }). */
export function countLastYearList(rows) {
  const out = new Map();
  for (const r of rows || []) {
    const c = out.get(r.gkk) || { total: 0, notYet: 0, registered: 0, setAside: 0 };
    c.total += 1;
    if (r.status === 'Not yet') c.notYet += 1;
    else if (r.status === 'Registered') c.registered += 1;
    else c.setAside += 1;
    out.set(r.gkk, c);
  }
  return out;
}

/**
 * Households registered in this census against each GKK's households last
 * year. `gkks` is [{ name, previous_households }]; `counts` is a Map of GKK
 * name (null for no GKK) → { started, confirmed } from
 * censusGkkHouseholdCounts(); `lists` is countLastYearList() output.
 * "Registered" is every household with at least one member confirmed.
 *
 * A GKK with last year's list (0041) uses it: last year is the names not
 * set aside, and "not yet" the names not yet ticked off. Otherwise the
 * typed count (gkks.previous_households, 0040) is the baseline and "not yet"
 * is that count minus those registered, never below zero (new households can
 * push a GKK past it). A GKK with neither has lastYear, notYet and pct null.
 * Pass `onlyGkk` for a GKK leader's own GKK.
 */
export function householdsVsLastYear(gkks, counts, onlyGkk = null, lists = null) {
  const share = (done, of) => (of > 0 ? Math.min(Math.round((done / of) * 100), 100) : done ? 100 : 0);
  const row = (label, lastYear, c = {}, list = null) => {
    const registered = c.started || 0;
    const base = { label, registered, confirmed: c.confirmed || 0, fromList: false };
    if (list && list.total) {
      const of = list.total - list.setAside;
      return { ...base, fromList: true, lastYear: of, notYet: list.notYet, pct: share(of - list.notYet, of) };
    }
    if (lastYear == null) return { ...base, lastYear: null, notYet: null, pct: null };
    return { ...base, lastYear, notYet: Math.max(lastYear - registered, 0), pct: share(registered, lastYear) };
  };
  const list = (gkks || []).filter((g) => !onlyGkk || g.name === onlyGkk).sort((a, b) => a.name.localeCompare(b.name));
  const rows = list.map((g) => row(g.name, g.previous_households ?? null, counts?.get(g.name), lists?.get(g.name)));
  const none = counts?.get(null);
  if (!onlyGkk && none && none.started) rows.push(row('No GKK', null, none));
  // The total covers only the GKKs with a baseline, so a missing one doesn't read as "not yet".
  const withBase = rows.filter((r) => r.lastYear != null);
  const sum = (k, rs) => rs.reduce((n, r) => n + r[k], 0);
  const lastYear = withBase.length ? sum('lastYear', withBase) : null;
  const notYet = withBase.length ? sum('notYet', withBase) : null;
  const total = {
    label: 'All GKKs', lastYear, notYet, fromList: false,
    registered: sum('registered', withBase), confirmed: sum('confirmed', withBase),
    pct: lastYear == null ? null : share(lastYear - notYet, lastYear),
    registeredAll: sum('registered', rows),
  };
  return { rows, total, hasBaseline: withBase.length > 0 };
}

// ---- family portal (0008 migration) -------------------------------------

/** "ab3k-77xq " → "AB3K77XQ" (what census_normalize_code() compares). */
export function normalizeAccessCode(code) {
  return String(code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** "AB3K77XQ" → "AB3K-77XQ" for printing and display. */
export function formatAccessCode(code) {
  const c = normalizeAccessCode(code);
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

// ---- census link and QR code on printed sheets (0042 migration) ---------

/** Where printed links point when Parish Config has no public website address. */
export const DEFAULT_SITE_URL = 'https://olgqp-registry.vercel.app';

/**
 * " Parish.org/ " → "https://parish.org": what Parish Config saves as the
 * public website address. Blank stays blank (use the default); anything that
 * isn't a web address throws.
 */
export function normalizeSiteUrl(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    throw new Error('Enter a web address like https://olgqp.org');
  }
  if (!/^https?:$/.test(url.protocol) || (!url.hostname.includes('.') && url.hostname !== 'localhost')) {
    throw new Error('Enter a web address like https://olgqp.org');
  }
  return (url.origin + url.pathname).replace(/\/+$/, '');
}

/**
 * The address printed on census sheets: the one saved in Parish Config, not
 * the page staff print from, so a sheet printed from a preview link or a
 * laptop still sends families to the real site.
 */
export function publicSiteUrl(settings) {
  try {
    return normalizeSiteUrl(settings?.site_url) || DEFAULT_SITE_URL;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

/**
 * The link in a household's QR code. The code goes after "#", which browsers
 * never send to the server (so it stays out of the host's logs), and the
 * census page clears it from the address bar once it has read it.
 */
export function censusLink(site, refNo, code) {
  const link = `${site}/census?ref=${encodeURIComponent(String(refNo || '').trim())}`;
  const c = normalizeAccessCode(code);
  return c ? `${link}#code=${c}` : link;
}

/** "#code=AB3K77XQ" → "AB3K77XQ"; '' when the link carried no code. */
export function codeFromHash(hash) {
  const value = new URLSearchParams(String(hash || '').replace(/^#/, '')).get('code');
  return normalizeAccessCode(value);
}

// The fields a family can correct online (keys as stored in the database).
export const PORTAL_HOUSEHOLD_FIELDS = [
  ['street', 'Street / Purok'], ['barangay', 'Barangay'], ['city', 'City / Municipality'], ['province', 'Province'],
  ['zip', 'ZIP code'], ['contact', 'Contact no.'], ['email', 'Email'],
];
export const PORTAL_MEMBER_FIELDS = [
  ['first_name', 'First name'], ['middle_name', 'Middle name'], ['last_name', 'Last name'], ['suffix', 'Suffix'],
  ['relationship', 'Relationship'], ['sex', 'Sex'], ['dob', 'Date of birth'], ['civil_status', 'Civil status'],
  ['contact', 'Contact no.'],
];

const blankToNull = (v) => {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
};

function pickFields(source, fields) {
  return Object.fromEntries(fields.map(([k]) => [k, blankToNull(source?.[k])]));
}

/**
 * What the portal form sends to portal_submit(). New-member rows left
 * completely empty are dropped; everything else goes to the server, which
 * has the final say on what is valid.
 */
export function portalPayload({ household, members, newMembers, message, consent }) {
  const answer = (m) => ({
    status: MEMBERSHIP_STATUSES.includes(m.status) ? m.status : null,
    participation: cleanParticipation(m.participation),
    notes: blankToNull(m.notes),
  });
  return {
    household: pickFields(household, PORTAL_HOUSEHOLD_FIELDS),
    members: (members || []).map((m) => ({ id: m.id, ...pickFields(m, PORTAL_MEMBER_FIELDS), ...answer(m) })),
    newMembers: (newMembers || [])
      .filter((m) => PORTAL_MEMBER_FIELDS.some(([k]) => blankToNull(m[k])))
      .map((m) => ({ ...pickFields(m, PORTAL_MEMBER_FIELDS), ...answer(m) })),
    message: blankToNull(message),
    consent: !!consent,
  };
}

/**
 * What a family's online update would change, for the staff review panel:
 * household fields and member fields that differ from what was on record
 * when the family sent it, the census answers, and any new members.
 */
export function diffSubmission({ before, proposed }) {
  const changed = (fields, from = {}, to = {}) => fields
    .filter(([k]) => blankToNull(from[k]) !== blankToNull(to[k]))
    .map(([key, label]) => ({ key, label, from: blankToNull(from[key]), to: blankToNull(to[key]) }));
  const fullName = (f = {}) => [f.first_name, f.middle_name, f.last_name, f.suffix].filter(Boolean).join(' ');

  const household = changed(PORTAL_HOUSEHOLD_FIELDS, before?.household, proposed?.household);
  const members = (proposed?.members || []).map((m) => {
    const was = before?.members?.[String(m.id)] || {};
    return {
      id: m.id,
      name: fullName(was) || fullName(m.fields),
      changes: changed(PORTAL_MEMBER_FIELDS, was, m.fields),
      status: m.status || null,
      participation: m.participation || {},
      notes: m.notes || null,
    };
  });
  const newMembers = (proposed?.newMembers || []).map((m) => ({
    name: fullName(m.fields),
    fields: m.fields || {},
    status: m.status || null,
    participation: m.participation || {},
    notes: m.notes || null,
  }));
  const changeCount = household.length + members.reduce((n, m) => n + m.changes.length, 0) + newMembers.length;
  return { household, members, newMembers, changeCount };
}
