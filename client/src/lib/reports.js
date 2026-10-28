// Summaries behind Reports → Generate Report's newer report types. Pure,
// so they can be unit tested; api.generateReport fetches the rows.
import { SACRAMENTS, HEAD, HEADS, COMMUNION_MIN_AGE, CONFIRMATION_MIN_AGE, GKK_ROLES, PARTICIPATION_ITEMS, LEGACY_MAT_TYPES } from '../constants.js';
import { inDateRange } from './util.js';
import { CERT_OPEN } from './requests.js';
import { toCsv } from './csv.js';
import { YOUNG_CHILD_MAX_AGE } from './census.js';

const DAY = 86400000;
const round1 = (n) => Math.round(n * 10) / 10;

/** Per GKK: claimed and verified for each sacrament, and how many claims are still waiting. */
export function sacramentProgressRows(members) {
  const byGkk = new Map();
  for (const m of members) {
    const key = m.household_gkk || 'No GKK';
    if (!byGkk.has(key)) byGkk.set(key, { label: key, members: 0, ...Object.fromEntries(SACRAMENTS.map((s) => [s.key, { claimed: 0, verified: 0 }])) });
    const g = byGkk.get(key);
    g.members += 1;
    for (const s of SACRAMENTS) {
      if (m[s.has]) g[s.key].claimed += 1;
      if (m[s.has] && m[`${s.key}_verified`]) g[s.key].verified += 1;
    }
  }
  const rows = [...byGkk.values()].sort((a, b) => (a.label === 'No GKK') - (b.label === 'No GKK') || a.label.localeCompare(b.label));
  return rows.map((g) => ({
    ...g,
    waiting: SACRAMENTS.reduce((n, s) => n + g[s.key].claimed - g[s.key].verified, 0),
  }));
}

/**
 * Per certificate type: requests received in the date range, how many were
 * released, the average and longest days from request to release, and how
 * many are still open. `now` is for the age of open requests.
 */
export function turnaroundRows(requests, { dateFrom, dateTo, typeLabel = (k) => k, now = Date.now() } = {}) {
  const groups = new Map();
  for (const r of requests) {
    if (!inDateRange(r.created_at, dateFrom, dateTo)) continue;
    if (!groups.has(r.cert_type)) groups.set(r.cert_type, { label: typeLabel(r.cert_type), received: 0, released: 0, days: [], open: 0, oldestOpen: 0 });
    const g = groups.get(r.cert_type);
    g.received += 1;
    if (r.released_at) {
      g.released += 1;
      g.days.push((new Date(r.released_at) - new Date(r.created_at)) / DAY);
    } else if (CERT_OPEN.includes(r.status)) {
      g.open += 1;
      g.oldestOpen = Math.max(g.oldestOpen, Math.floor((now - new Date(r.created_at)) / DAY));
    }
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label)).map(({ days, ...g }) => ({
    ...g,
    avgDays: days.length ? round1(days.reduce((a, b) => a + b, 0) / days.length) : null,
    maxDays: days.length ? round1(Math.max(...days)) : null,
  }));
}

/** Households registered per month (YYYY-MM), oldest first, with how many of them are verified now. */
export function registrationsByMonth(households, { dateFrom, dateTo } = {}) {
  const months = new Map();
  for (const h of households) {
    if (!inDateRange(h.created_at, dateFrom, dateTo)) continue;
    const d = new Date(h.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!months.has(key)) months.set(key, { month: key, households: 0, members: 0, verified: 0 });
    const m = months.get(key);
    m.households += 1;
    m.members += Number(h.member_count) || 0;
    if (h.status === 'Verified') m.verified += 1;
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** "2026-03" as "March 2026". */
export function monthName(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Per GKK: households, families (0054; a household counts at least one),
 * households with more than one family, and members. `households` are
 * households_with_count rows; No GKK last.
 */
export function familiesByGkkRows(households) {
  const byGkk = new Map();
  for (const h of households) {
    const key = h.gkk || 'No GKK';
    if (!byGkk.has(key)) byGkk.set(key, { label: key, households: 0, families: 0, multi: 0, members: 0 });
    const g = byGkk.get(key);
    const families = Math.max(1, Number(h.family_count) || 1);
    g.households += 1;
    g.families += families;
    if (families > 1) g.multi += 1;
    g.members += Number(h.member_count) || 0;
  }
  return [...byGkk.values()].sort((a, b) => (a.label === 'No GKK') - (b.label === 'No GKK') || a.label.localeCompare(b.label));
}

// ---- shared ---------------------------------------------------------------

const NO_GKK = 'No GKK';
const byGkkLabel = (a, b) => (a === NO_GKK) - (b === NO_GKK) || a.localeCompare(b);
const gkkOf = (m) => m.household_gkk || NO_GKK;
const share = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : '—');
/** A sort comparator: by GKK (`gkkOf(row)`, no GKK last), then by `then`. */
export const byGkk = (gkkOf, then = () => 0) => (a, b) => byGkkLabel(gkkOf(a) || NO_GKK, gkkOf(b) || NO_GKK) || then(a, b);
const blank = (v) => v === null || v === undefined || String(v).trim() === '';

/** "Juan Dela Cruz Jr." */
export const personName = (m) => [m.first_name, m.last_name, m.suffix].filter(Boolean).join(' ');

/** Month (1–12) and day of a "YYYY-MM-DD" date, without time-zone shifts. */
function ymd(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

// ---- sacraments -----------------------------------------------------------

/**
 * The youngest age a member counts as "not yet received" for each sacrament:
 * registration's own limits for First Communion and Confirmation
 * (constants.js), and 18 for Matrimony. Members without a birth date can't
 * be ruled out, so they count.
 */
export const SACRAMENT_MIN_AGE = { baptism: 0, communion: COMMUNION_MIN_AGE, confirmation: CONFIRMATION_MIN_AGE, matrimony: 18 };

export const oldEnoughFor = (m, key) => m.age === null || m.age === undefined || m.age >= SACRAMENT_MIN_AGE[key];

/** True when `m` hasn't received sacrament `key` ('baptism'…) and is old enough to. */
export function missingSacrament(m, key) {
  const s = SACRAMENTS.find((x) => x.key === key);
  return !!s && !m[s.has] && oldEnoughFor(m, key);
}

/**
 * Per GKK: members still to receive Baptism, First Communion and
 * Confirmation (old enough for it), with a total row: where catechism
 * classes are needed.
 */
export function candidatesByGkk(members) {
  const keys = ['baptism', 'communion', 'confirmation'];
  const make = (label) => ({ label, members: 0, ...Object.fromEntries(keys.map((k) => [k, 0])) });
  const byGkk = new Map();
  const total = make('All GKKs');
  for (const m of members) {
    const key = gkkOf(m);
    if (!byGkk.has(key)) byGkk.set(key, make(key));
    for (const row of [byGkk.get(key), total]) {
      row.members += 1;
      for (const k of keys) if (missingSacrament(m, k)) row[k] += 1;
    }
  }
  return { rows: [...byGkk.keys()].sort(byGkkLabel).map((k) => byGkk.get(k)), total };
}

const WEDDING_SITUATIONS = {
  'Live-in': 'Living together (live-in)',
  'Civil Wedding': 'Civil wedding only',
  'Other Sect Wedding': 'Wedding in another church',
  Married: 'Married, no church wedding on record',
};
const CHURCH_WEDDINGS = ['Catholic Marriage', ...LEGACY_MAT_TYPES];

/**
 * Why a member could still be married in church, or null when they
 * couldn't: already married in church, or single, widowed or separated.
 */
export function weddingSituation(m) {
  if (m.has_matrimony) return null;
  if (m.civil_status === 'Live-in') return WEDDING_SITUATIONS['Live-in'];
  if (!blank(m.civil_status) && m.civil_status !== 'Married') return null;
  if (m.mat_type === 'Civil Wedding' || m.mat_type === 'Other Sect Wedding') return WEDDING_SITUATIONS[m.mat_type];
  if (m.civil_status === 'Married' && !CHURCH_WEDDINGS.includes(m.mat_type)) return WEDDING_SITUATIONS.Married;
  return null;
}

/**
 * Couples who could be married in church (a parish mass wedding): living
 * together, married only in a civil or another church's wedding, or married
 * with no church wedding recorded. A family's head and their spouse make one
 * row; anyone else (a married son, an in-law) has a row of their own.
 */
export function churchWeddingCandidates(members) {
  const fams = new Map();
  for (const m of members) {
    if (!weddingSituation(m)) continue;
    const key = `${m.household_id}:${m.family_no || 1}`;
    if (!fams.has(key)) fams.set(key, []);
    fams.get(key).push(m);
  }
  const rows = [];
  for (const list of fams.values()) {
    const head = list.find((m) => HEADS.includes(m.relationship));
    const spouse = head && list.find((m) => m.relationship === 'Spouse');
    const couple = [head, spouse].filter(Boolean);
    const groups = [...(couple.length ? [couple] : []), ...list.filter((m) => !couple.includes(m)).map((m) => [m])];
    for (const g of groups) {
      const first = g[0];
      rows.push({
        names: g.map(personName).join(' & '),
        situation: weddingSituation(first),
        married: g.map((m) => m.mat_date).find(Boolean) || '',
        household: first.household_name,
        gkk: first.household_gkk || '—',
        contact: g.map((m) => m.contact).find((c) => !blank(c)) || '—',
      });
    }
  }
  return rows.sort((a, b) => byGkkLabel(a.gkk === '—' ? NO_GKK : a.gkk, b.gkk === '—' ? NO_GKK : b.gkk) || a.household.localeCompare(b.household));
}

/**
 * Young children (YOUNG_CHILD_MAX_AGE and under, the census's "Bata pa")
 * with no Baptism on record, for a follow-up visit: each with the head of
 * their family in the house (and the head's spouse) and a number to call.
 * Children of another religion, or with no birth date, are left out. By
 * GKK, household, then oldest first (the longest wait).
 */
export function unbaptizedChildren(members) {
  const catholic = (m) => (String(m.religion || '').trim() || 'Roman Catholic') === 'Roman Catholic';
  const family = (m) => `${m.household_id}:${m.family_no || 1}`;
  const parentsOf = new Map();
  for (const m of members) {
    if (HEADS.includes(m.relationship) || m.relationship === 'Spouse') {
      if (!parentsOf.has(family(m))) parentsOf.set(family(m), []);
      parentsOf.get(family(m)).push(m);
    }
  }
  return members
    .filter((m) => m.age != null && m.age >= 0 && m.age <= YOUNG_CHILD_MAX_AGE && !m.has_baptism && catholic(m))
    .map((m) => {
      // The family head first, then their spouse.
      const parents = (parentsOf.get(family(m)) || []).filter((p) => p.id !== m.id)
        .sort((a, b) => HEADS.includes(b.relationship) - HEADS.includes(a.relationship));
      return {
        name: personName(m), age: m.age, dob: m.dob || '', household: m.household_name, gkk: m.household_gkk || '—',
        parents: parents.map(personName).join(' & ') || '—',
        contact: [...parents, m].map((p) => p.contact).find((c) => !blank(c)) || '—',
      };
    })
    .sort((a, b) => byGkkLabel(a.gkk === '—' ? NO_GKK : a.gkk, b.gkk === '—' ? NO_GKK : b.gkk)
      || a.household.localeCompare(b.household) || b.age - a.age);
}

/**
 * Sacraments received per year, from the dates on members' records, newest
 * first. A wedding counts once per couple (same family and date). `undated`
 * is how many received a sacrament with no date on record.
 */
export function sacramentsByYear(members) {
  const years = new Map();
  const undated = { baptism: 0, communion: 0, confirmation: 0, matrimony: 0 };
  const weddings = new Set();
  const row = (y) => {
    if (!years.has(y)) years.set(y, { year: y, baptism: 0, communion: 0, confirmation: 0, matrimony: 0 });
    return years.get(y);
  };
  for (const m of members) {
    for (const s of SACRAMENTS) {
      if (!m[s.has]) continue;
      const d = ymd(m[s.date]);
      if (!d) { undated[s.key] += 1; continue; }
      if (s.key === 'matrimony') {
        const key = `${m.household_id}:${m.family_no || 1}:${m[s.date]}`;
        if (weddings.has(key)) continue;
        weddings.add(key);
      }
      row(d.y)[s.key] += 1;
    }
  }
  return { rows: [...years.values()].sort((a, b) => b.year - a.year), undated };
}

// ---- members --------------------------------------------------------------

export const AGE_GROUPS = [
  { key: 'children', label: 'Children (0–12)', lo: 0, hi: 12 },
  { key: 'youth', label: 'Youth (13–30)', lo: 13, hi: 30 },
  { key: 'adults', label: 'Adults (31–59)', lo: 31, hi: 59 },
  { key: 'seniors', label: 'Seniors (60 and up)', lo: 60, hi: 200 },
];

export const inAgeGroup = (m, key) => {
  const g = AGE_GROUPS.find((x) => x.key === key);
  return !!g && m.age !== null && m.age !== undefined && m.age >= g.lo && m.age <= g.hi;
};

const PYRAMID = [[0, 6], [7, 12], [13, 17], [18, 30], [31, 45], [46, 59], [60, 74], [75, 200]];

/** Members per age group and sex, youngest first, with "No birth date" and a total row. */
export function ageSexRows(members) {
  const make = (label) => ({ label, male: 0, female: 0, other: 0, total: 0 });
  const rows = PYRAMID.map(([lo, hi]) => ({ ...make(hi >= 200 ? `${lo} and up` : `${lo}–${hi}`), lo, hi }));
  const unknown = make('No birth date');
  const total = make('All ages');
  for (const m of members) {
    const has = m.age !== null && m.age !== undefined;
    const r = has ? rows.find((x) => m.age >= x.lo && m.age <= x.hi) : unknown;
    const col = m.sex === 'Male' ? 'male' : m.sex === 'Female' ? 'female' : 'other';
    for (const x of [r, total]) { x[col] += 1; x.total += 1; }
  }
  const out = [...rows.map(({ lo, hi, ...r }) => r), ...(unknown.total ? [unknown] : [])];
  return { rows: out.map((r) => ({ ...r, share: share(r.total, total.total) })), total: { ...total, share: total.total ? '100%' : '—' } };
}

/**
 * Members counted by one field (civil status, tribe, religion), most first,
 * "Not recorded" last, split by sex. `adultsOnly` leaves out members under
 * 18 (children are all single).
 */
export function breakdownRows(members, field, { adultsOnly = false, label = (v) => v } = {}) {
  const groups = new Map();
  let total = 0;
  for (const m of members) {
    if (adultsOnly && m.age !== null && m.age !== undefined && m.age < 18) continue;
    const key = blank(m[field]) ? '' : String(m[field]).trim();
    if (!groups.has(key)) groups.set(key, { label: key ? label(key) : 'Not recorded', male: 0, female: 0, total: 0, none: !key });
    const g = groups.get(key);
    if (m.sex === 'Male') g.male += 1;
    if (m.sex === 'Female') g.female += 1;
    g.total += 1;
    total += 1;
  }
  const rows = [...groups.values()].sort((a, b) => a.none - b.none || b.total - a.total || a.label.localeCompare(b.label));
  return { rows: rows.map(({ none, ...r }) => ({ ...r, share: share(r.total, total) })), total };
}

/**
 * Birthdays (`kind` 'birthday') or wedding anniversaries ('anniversary') in
 * month 1–12, by day. Ages and years are the ones reached in `year`. An
 * anniversary is one row per couple.
 */
export function celebrationsInMonth(members, month, kind, year = new Date().getFullYear()) {
  const rows = [];
  if (kind === 'birthday') {
    for (const m of members) {
      const d = ymd(m.dob);
      if (!d || d.m !== Number(month)) continue;
      rows.push({ day: d.d, name: personName(m), years: year - d.y, household: m.household_name, gkk: m.household_gkk || '—', contact: m.contact || '—' });
    }
  } else {
    const couples = new Map();
    for (const m of members) {
      const d = ymd(m.mat_date);
      if (!d || d.m !== Number(month)) continue;
      const key = `${m.household_id}:${m.family_no || 1}:${m.mat_date}`;
      if (!couples.has(key)) couples.set(key, { day: d.d, names: [], years: year - d.y, type: m.mat_type || (m.has_matrimony ? 'Catholic Marriage' : ''), household: m.household_name, gkk: m.household_gkk || '—', contact: '' });
      const c = couples.get(key);
      c.names.push(personName(m));
      if (!c.contact && !blank(m.contact)) c.contact = m.contact;
    }
    for (const c of couples.values()) rows.push({ ...c, name: c.names.join(' & '), contact: c.contact || '—' });
  }
  return rows.sort((a, b) => a.day - b.day || a.name.localeCompare(b.name));
}

/** Members whose status is one of `statuses`, changed in the date range, newest first. */
export function statusChanges(members, statuses, { dateFrom, dateTo } = {}) {
  const ranged = dateFrom || dateTo;
  return members
    .filter((m) => statuses.includes(m.membership_status))
    .filter((m) => !ranged || (m.status_updated_at && inDateRange(m.status_updated_at, dateFrom, dateTo)))
    .sort((a, b) => String(b.status_updated_at || '').localeCompare(String(a.status_updated_at || '')) || personName(a).localeCompare(personName(b)));
}

// ---- households -----------------------------------------------------------

/** Pending households, longest waiting first, with whole days since they registered. */
export function waitingForVerification(households, now = Date.now()) {
  return households
    .filter((h) => h.status === 'Pending')
    .map((h) => ({ ...h, days: Math.max(0, Math.floor((now - new Date(h.created_at)) / DAY)) }))
    .sort((a, b) => b.days - a.days || a.household_name.localeCompare(b.household_name));
}

// Short names for the "ways I can help" answers (HELP_WAYS keys).
const HELP_SHORT = Object.fromEntries(PARTICIPATION_ITEMS.map(([k, label]) => [k, label]));
HELP_SHORT.sunday_mass = 'Sunday Mass';
export const helpWayLabel = (key) => HELP_SHORT[key] || key;

/** Households that said Yes or Maybe to volunteering (`only` narrows it to one), Yes first. */
export function volunteerPool(households, only = 'All') {
  const wanted = only === 'All' ? ['Yes', 'Maybe'] : [only];
  return households
    .filter((h) => wanted.includes(h.volunteer))
    .sort((a, b) => (a.volunteer === 'Maybe') - (b.volunteer === 'Maybe') || byGkkLabel(a.gkk || NO_GKK, b.gkk || NO_GKK) || a.household_name.localeCompare(b.household_name));
}

/**
 * Households verified per month and staff member, newest month first, with
 * the average days from registration to verification.
 */
export function verificationsByStaff(households, { dateFrom, dateTo } = {}) {
  const groups = new Map();
  for (const h of households) {
    if (!h.verified_at || !inDateRange(h.verified_at, dateFrom, dateTo)) continue;
    const d = new Date(h.verified_at);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const staff = h.verified_by_name || 'Not recorded';
    const key = `${month}|${staff}`;
    if (!groups.has(key)) groups.set(key, { month, staff, verified: 0, days: [] });
    const g = groups.get(key);
    g.verified += 1;
    g.days.push(Math.max(0, (d - new Date(h.created_at)) / DAY));
  }
  return [...groups.values()]
    .sort((a, b) => b.month.localeCompare(a.month) || b.verified - a.verified || a.staff.localeCompare(b.staff))
    .map(({ days, ...g }) => ({ ...g, avgDays: round1(days.reduce((a, b) => a + b, 0) / days.length) }));
}

// ---- ministries & organizations -------------------------------------------

const groupsOf = (m) => [...(m.ministries || []), ...(m.organizations || [])];

/**
 * Per ministry or organization (`groups`: [{ name, kind }]), its members by
 * sex and age, and how many GKKs they come from. Groups with no members are
 * kept, so empty ones show.
 */
export function groupMakeupRows(members, groups) {
  const rows = new Map(groups.map((g) => [g.name, { name: g.name, kind: g.kind, members: 0, male: 0, female: 0, under18: 0, y18: 0, y31: 0, y60: 0, noAge: 0, gkks: new Set() }]));
  for (const m of members) {
    for (const name of new Set(groupsOf(m))) {
      const r = rows.get(name);
      if (!r) continue;
      r.members += 1;
      if (m.sex === 'Male') r.male += 1;
      if (m.sex === 'Female') r.female += 1;
      if (m.age === null || m.age === undefined) r.noAge += 1;
      else if (m.age < 18) r.under18 += 1;
      else if (m.age <= 30) r.y18 += 1;
      else if (m.age <= 59) r.y31 += 1;
      else r.y60 += 1;
      if (m.household_gkk) r.gkks.add(m.household_gkk);
    }
  }
  return [...rows.values()]
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
    .map(({ gkks, ...r }) => ({ ...r, gkks: gkks.size }));
}

/** Members in at least `min` ministries and organizations together, busiest first. */
export function busyMembers(members, min = 3) {
  return members
    .map((m) => ({ ...m, groups: [...new Set(groupsOf(m))] }))
    .filter((m) => m.groups.length >= min)
    .sort((a, b) => b.groups.length - a.groups.length || personName(a).localeCompare(personName(b)));
}

const roleKey = (v) => String(v || '').trim().toLowerCase();

/**
 * Each GKK's officers: every usual role (GKK_ROLES) with whoever holds it,
 * or "Vacant", then any other role typed in. `gkks` are the GKK names to
 * show.
 */
export function gkkOfficerRows(members, gkks) {
  const rows = [];
  for (const gkk of gkks) {
    const here = members.filter((m) => m.household_gkk === gkk && !blank(m.gkk_role));
    for (const role of GKK_ROLES) {
      const holders = here.filter((m) => roleKey(m.gkk_role) === roleKey(role));
      if (!holders.length) rows.push({ gkk, role, name: 'Vacant', contact: '—', vacant: true });
      for (const m of holders) rows.push({ gkk, role, name: personName(m), contact: m.contact || '—', vacant: false });
    }
    const usual = new Set(GKK_ROLES.map(roleKey));
    for (const m of here.filter((x) => !usual.has(roleKey(x.gkk_role))).sort((a, b) => a.gkk_role.localeCompare(b.gkk_role))) {
      rows.push({ gkk, role: m.gkk_role.trim(), name: personName(m), contact: m.contact || '—', vacant: false });
    }
  }
  return rows;
}

/** Members with a parish role (Katungdanan sa Parish), by role. */
export function parishRoleRows(members) {
  return members
    .filter((m) => !blank(m.parish_role))
    .map((m) => ({ role: m.parish_role.trim(), name: personName(m), gkk: m.household_gkk || '—', contact: m.contact || '—' }))
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
}

// ---- requests -------------------------------------------------------------

/**
 * Outcomes of a request queue in the date range (by when each was
 * received), per `groupOf(request)`: received, done, closed without being
 * done, still open, and the average days to done. `doneAt(request)` is when
 * it was done; `units(request)` adds a count of units asked for.
 */
export function requestOutcomeRows(requests, { dateFrom, dateTo, groupOf, labelOf = (k) => k, done, closed, open, doneAt = (r) => r.status_changed_at, units, now = Date.now() }) {
  const groups = new Map();
  for (const r of requests) {
    if (!inDateRange(r.created_at, dateFrom, dateTo)) continue;
    const key = groupOf(r);
    if (!groups.has(key)) groups.set(key, { label: labelOf(key), received: 0, units: 0, done: 0, closed: 0, open: 0, oldestOpen: 0, days: [] });
    const g = groups.get(key);
    g.received += 1;
    if (units) g.units += Number(units(r)) || 0;
    if (r.status === done) {
      g.done += 1;
      const at = doneAt(r);
      if (at) g.days.push(Math.max(0, (new Date(at) - new Date(r.created_at)) / DAY));
    } else if (closed.includes(r.status)) g.closed += 1;
    else if (open.includes(r.status)) {
      g.open += 1;
      g.oldestOpen = Math.max(g.oldestOpen, Math.floor((now - new Date(r.created_at)) / DAY));
    }
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label)).map(({ days, ...g }) => ({
    ...g,
    avgDays: days.length ? round1(days.reduce((a, b) => a + b, 0) / days.length) : null,
  }));
}

/** A fee typed as "₱150", "150.00" or "P 1,200" as a number; null when there's no amount. */
export function parseFee(value) {
  const s = String(value ?? '').replace(/,/g, '');
  const m = /\d+(\.\d+)?/.exec(s);
  return m ? Number(m[0]) : null;
}

/**
 * Certificates released per month (by release date, in the date range),
 * newest first: how many, how many with a fee, the fees' total, and how
 * many released without an OR number.
 */
export function feesByMonth(requests, { dateFrom, dateTo } = {}) {
  const months = new Map();
  for (const r of requests) {
    if (!r.released_at || !inDateRange(r.released_at, dateFrom, dateTo)) continue;
    const d = new Date(r.released_at);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!months.has(month)) months.set(month, { month, released: 0, paid: 0, total: 0, noOr: 0 });
    const g = months.get(month);
    g.released += 1;
    const fee = parseFee(r.fee);
    if (fee) { g.paid += 1; g.total += fee; }
    if (blank(r.or_number)) g.noOr += 1;
  }
  return [...months.values()].sort((a, b) => b.month.localeCompare(a.month));
}

/** "₱1,250.00" */
export const peso = (n) => `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---- data quality ---------------------------------------------------------

export const MISSING_FIELDS = [
  { key: 'dob', label: 'Birth date', test: (m) => blank(m.dob) },
  { key: 'sex', label: 'Sex', test: (m) => blank(m.sex) },
  // Children are all single; only adults need a civil status.
  { key: 'civil_status', label: 'Civil status', test: (m) => blank(m.civil_status) && m.age !== null && m.age !== undefined && m.age >= 18 },
  // The household's head is who the parish calls.
  { key: 'contact', label: 'Contact (household head)', test: (m) => blank(m.contact) && m.relationship === HEAD },
  { key: 'blood_type', label: 'Blood type', test: (m) => blank(m.blood_type), blood: true },
];

/** Labels of what `m` is missing. `blood: false` leaves blood type out (GKK leaders can't see it). */
export function missingDetails(m, { blood = true } = {}) {
  return MISSING_FIELDS.filter((f) => (blood || !f.blood) && f.test(m)).map((f) => f.label);
}

/** Per GKK: how many members are missing each detail, and the share with nothing missing; a total row. */
export function dataQualityByGkk(members, { blood = true } = {}) {
  const fields = MISSING_FIELDS.filter((f) => blood || !f.blood);
  const make = (label) => ({ label, members: 0, complete: 0, ...Object.fromEntries(fields.map((f) => [f.key, 0])) });
  const byGkk = new Map();
  const total = make('All GKKs');
  for (const m of members) {
    const key = gkkOf(m);
    if (!byGkk.has(key)) byGkk.set(key, make(key));
    const missing = fields.filter((f) => f.test(m));
    for (const row of [byGkk.get(key), total]) {
      row.members += 1;
      if (!missing.length) row.complete += 1;
      for (const f of missing) row[f.key] += 1;
    }
  }
  const finish = (r) => ({ ...r, completePct: share(r.complete, r.members) });
  return { fields, rows: [...byGkk.keys()].sort(byGkkLabel).map((k) => finish(byGkk.get(k))), total: finish(total) };
}

/**
 * Households that need fixing: no GKK, no members, no current Head of
 * Household, or no contact number anywhere (theirs or a member's).
 * `members` are the households' members ({ household_id, relationship,
 * contact, is_current }).
 */
export function householdProblems(households, members) {
  const byHouse = new Map();
  for (const m of members) {
    if (!byHouse.has(m.household_id)) byHouse.set(m.household_id, []);
    byHouse.get(m.household_id).push(m);
  }
  const rows = [];
  for (const h of households) {
    const list = byHouse.get(h.id) || [];
    const problems = [];
    if (blank(h.gkk)) problems.push('No GKK');
    if (!list.length) problems.push('No members');
    else if (!list.some((m) => m.relationship === HEAD && m.is_current !== false)) problems.push('No Head of Household');
    if (blank(h.contact) && !list.some((m) => !blank(m.contact))) problems.push('No contact number');
    if (problems.length) rows.push({ ...h, problems });
  }
  return rows.sort((a, b) => byGkkLabel(a.gkk || NO_GKK, b.gkk || NO_GKK) || a.household_name.localeCompare(b.household_name));
}

// ---- census ---------------------------------------------------------------

/**
 * Per GKK, members counted in the census before (`prev`) and this one
 * (`cur`), both summarizeCensus() results. "Counted" is confirmed members
 * still in the parish (not Moved away or Deceased); this census's Deceased,
 * Moved away and Left the Church show what changed.
 */
export function censusComparisonRows(prev, cur) {
  const counted = (r) => (r ? r.confirmed - (r.counts['Moved away'] || 0) - (r.counts.Deceased || 0) : 0);
  const prevOf = new Map((prev?.rows || []).map((r) => [r.label, r]));
  const curOf = new Map((cur?.rows || []).map((r) => [r.label, r]));
  const labels = [...new Set([...prevOf.keys(), ...curOf.keys()])].sort(byGkkLabel);
  const row = (label, p, c) => ({
    label,
    before: counted(p),
    now: counted(c),
    change: counted(c) - counted(p),
    deceased: c?.counts.Deceased || 0,
    movedAway: c?.counts['Moved away'] || 0,
    left: c?.counts['Left the Church'] || 0,
    notConfirmed: c?.counts['Not confirmed'] || 0,
  });
  return { rows: labels.map((l) => row(l, prevOf.get(l), curOf.get(l))), total: row('All GKKs', prev?.total, cur?.total) };
}

// ---- Report Stats print and CSV --------------------------------------------

/**
 * Registration against the households expected, from api.censusVsLastYear()
 * (last year's list, last year's household count, or the census before, as
 * the switch on Census -> Last year's list says), as the Census page and Parish GKK
 * show it: `total` and `byGkk` (GKK name -> row) with { expected, done, pct,
 * notYet, fromList }, null for a GKK with no baseline. `against` names the
 * baseline ("last year's list"). Null when no GKK has a baseline.
 */
export function registrationProgress(baseline, againstText) {
  if (!baseline?.hasBaseline) return null;
  const of = (r) => (r.lastYear == null ? null : { expected: r.lastYear, done: r.lastYear - r.notYet, pct: r.pct, notYet: r.notYet, fromList: !!r.fromList });
  return {
    mode: baseline.mode,
    against: againstText,
    total: of(baseline.total),
    byGkk: new Map(baseline.rows.map((r) => [r.label, of(r)])),
  };
}

/** "20 of 30 expected households registered (67%), against last year's list". */
export function progressText(p) {
  if (!p?.total) return '';
  const what = p.mode === 'census' ? 'households have taken part' : 'expected households registered';
  return `${p.total.done} of ${p.total.expected} ${what} (${p.total.pct}%), against ${p.against}`;
}

/**
 * The Report Stats tab as printable sections ({ title, meta, columns, rows: [{ cells }] }).
 * With `progress` (registrationProgress()), registration also shows against the households expected.
 */
export function statsSections(stats, { blood = true, progress = null } = {}) {
  const t = (title, meta, columns, rows) => ({ title, meta, columns, rows: rows.map((cells) => ({ cells })) });
  const status = `${stats.totalVerified} verified · ${stats.totalPending} pending of ${stats.totalHH} households`;
  const sections = [
    progress
      ? t('Registration status by GKK', `${progressText(progress)} · ${status}`,
        ['GKK', 'Verified', 'Pending', 'Households', 'Expected', 'Registered of expected', 'Registered %'],
        stats.regByGkk.map((g) => {
          const p = progress.byGkk.get(g.label);
          return [g.label, g.verified, g.pending, g.verified + g.pending, p ? p.expected : '', p ? p.done : '', p ? `${p.pct}%` : ''];
        }))
      : t('Registration status by GKK', status,
        ['GKK', 'Verified', 'Pending', 'Households'], stats.regByGkk.map((g) => [g.label, g.verified, g.pending, g.verified + g.pending])),
  ];
  if (stats.totalFamilies !== null && stats.totalFamilies !== undefined) {
    sections.push(t('Families in households', `${stats.totalFamilies} families in ${stats.totalHH} households`,
      ['GKK', 'Families', 'Households', 'Households with 2+ families'], stats.regByGkk.map((g) => [g.label, g.families || 0, g.verified + g.pending, g.multi || 0])));
  }
  sections.push(
    t('Sacramental completion', `${stats.totalMembers} current members`,
      ['Sacrament', 'Received', 'Not yet (old enough)', 'Share'], stats.sacCompletion.map((s) => [s.label, s.n, s.missing, s.w])),
    t('Ministry & organization participation', `${stats.anyVolunteer}% of members serve in at least one`,
      ['Ministry / organization', 'Members', 'Share of members'], stats.participation.map((p) => [p.label, p.n, p.w])),
  );
  if (blood) {
    sections.push(t('Blood types', `${stats.unknownBlood} member(s) have no blood type on file`,
      ['Blood type', 'Members'], stats.bloodCounts.map((b) => [b.label, b.n])));
  }
  return sections;
}

/** Several tables in one CSV file: each section's title, its header and rows, then a blank line. */
export function sectionsCsv(sections) {
  return `\uFEFF${sections.map((s) => {
    const cols = s.columns.map((label, i) => ({ label, value: (cells) => cells[i] }));
    const title = toCsv([], [{ label: s.title }]).replace(/^\uFEFF/, '').trim();
    return `${title}\n${toCsv(s.rows.map((r) => r.cells), cols).replace(/^\uFEFF/, '')}`;
  }).join('\n\n')}\n`;
}
