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

/** A member's status when the family registers (0055): not Moved away or Deceased. */
export const REGISTRATION_STATUSES = ['Active', 'Inactive', 'Left the Church'];

/**
 * A member's census answers as registration sends them (0055), like the
 * census portal: a young child is Active (unless staff picked another status,
 * e.g. Moved away) with nothing to answer; otherwise
 * the status picked, or the one suggested from the answers. Picking a status
 * with no questions (Inactive, Left the Church) clears the answers on the
 * card; a suggested Inactive keeps them, since they're what it came from.
 * Returns { censusStatus, participation }; censusStatus is '' when there's
 * nothing to go on yet.
 */
export function registrationAnswers(m) {
  if (isYoungChild(m.dob)) return { censusStatus: (m.statusPicked && m.censusStatus) || 'Active', participation: {} };
  const participation = cleanParticipation(m.participation);
  const censusStatus = m.statusPicked ? m.censusStatus || '' : suggestStatus(participation) || '';
  return { censusStatus, participation: censusStatus === 'Left the Church' ? {} : participation };
}

/** What changing a member's census card does to the member (status suggested from answers until one is picked). */
export function censusCardPatch(m, patch) {
  if ('censusStatus' in patch) {
    return asksParticipation(patch.censusStatus)
      ? { censusStatus: patch.censusStatus, statusPicked: !!patch.censusStatus }
      : { censusStatus: patch.censusStatus, statusPicked: true, participation: {} };
  }
  return patch;
}

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

/**
 * Map of GKK → { total, notYet, registered, setAside } from list rows
 * ({ id, gkk, status }). `matches` (matchListToRegistry()) counts a name
 * still "Not yet" as registered once it's found in the registry.
 */
export function countLastYearList(rows, matches = null) {
  const out = new Map();
  for (const r of rows || []) {
    const c = out.get(r.gkk) || { total: 0, notYet: 0, registered: 0, setAside: 0 };
    const status = listStatus(r, matches);
    c.total += 1;
    if (status === 'Not yet') c.notYet += 1;
    else if (status === 'Registered') c.registered += 1;
    else c.setAside += 1;
    out.set(r.gkk, c);
  }
  return out;
}

// Jr./Sr. anywhere in a name; II, III, IV and V only as its last word, so a
// middle initial "V." isn't read as a suffix.
const SUFFIX_WORDS = { jr: 'jr', junior: 'jr', sr: 'sr', senior: 'sr' };
const ROMAN_SUFFIXES = new Set(['ii', 'iii', 'iv', 'v']);
const plainWords = (name) => String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);

/** A name's words for matching: no accents, case, punctuation, initials or suffixes ("Ma. Dela Cruz, Jr." → ma, dela, cruz). */
export function nameWords(name) {
  return plainWords(name).filter((w) => w.length > 1 && !SUFFIX_WORDS[w] && !ROMAN_SUFFIXES.has(w));
}

/** "Perfecto Panes Jr." → 'jr', "Juan Cruz III" → 'iii', "Juan V. Cruz" → null. */
export function nameSuffix(name) {
  const words = plainWords(name);
  const named = words.find((w) => SUFFIX_WORDS[w]);
  if (named) return SUFFIX_WORDS[named];
  const last = words[words.length - 1];
  return ROMAN_SUFFIXES.has(last) ? last : null;
}

/**
 * Which names on last year's list are already in the registry. `heads` is
 * one row per registered household ({ household_id, gkk, first_name,
 * middle_name, last_name, suffix, ... }, its head of household). Returns a
 * Map of list id → head, with `linked: true` when it was chosen by hand.
 *
 * 1. A name linked to a household by hand ("Choose household", 0052) is
 *    that household while it's in the registry.
 * 2. Otherwise a name still "Not yet" is found by its head of household, in
 *    the same GKK: every word of the head's last name and at least one word
 *    of their first name must be in it, so "Dela Cruz, Juan P." finds Juan
 *    Pedro Dela Cruz. When both carry a suffix it must agree, so "Perfecto
 *    Panes Sr." never finds Perfecto Panes Jr. Households marked "Not this
 *    household" for the name (0052) are skipped. The closest pairs are made
 *    first (same suffix, then more first and middle name words in common),
 *    and each head matches one name at most.
 * 3. Last year's paper list sometimes names the head of a second family in
 *    a house (0054) rather than the Household Head. `familyHeads` (one row
 *    per Head of Family: { member_id, household_id, first_name, ... }) are
 *    matched the same way, after the household heads on a tie, and come back
 *    with `family: true` and their household's details. "Not this household"
 *    skips the whole house, its family heads too.
 */
export function matchListToRegistry(listRows, heads, familyHeads = []) {
  const byId = new Map((heads || []).map((h) => [h.household_id, h]));
  const out = new Map();
  const taken = new Set(); // 'h<household id>' for a Household Head, 'f<member id>' for a Head of Family
  for (const r of listRows || []) {
    const h = r.household_id != null ? byId.get(r.household_id) : null;
    if (h && !taken.has(`h${h.household_id}`)) { out.set(r.id, { ...h, linked: true }); taken.add(`h${h.household_id}`); }
  }

  // A family head counts only while their household is in the registry.
  const families = (familyHeads || []).filter((f) => byId.has(f.household_id)).map((f) => {
    const { household_name, gkk, status } = byId.get(f.household_id);
    return { ...f, household_name, gkk, status, family: true, key: `f${f.member_id}` };
  });
  const people = [...(heads || []).map((h) => ({ ...h, key: `h${h.household_id}` })), ...families]
    .filter((h) => !taken.has(h.key)).map(({ key, ...h }, order) => ({
      h, key, order, last: nameWords(h.last_name), first: nameWords(h.first_name), middle: nameWords(h.middle_name), suffix: nameSuffix(h.suffix),
    })).filter((p) => p.last.length && p.first.length);

  const pairs = [];
  (listRows || []).forEach((r, index) => {
    if (r.status !== 'Not yet' || r.household_id != null) return;
    const words = new Set(nameWords(r.head_name));
    const suffix = nameSuffix(r.head_name);
    const refused = new Set(r.not_household_ids || []);
    for (const p of people) {
      if (p.h.gkk !== r.gkk || refused.has(p.h.household_id)) continue;
      if (suffix && p.suffix && suffix !== p.suffix) continue;
      if (!p.last.every((w) => words.has(w))) continue;
      const firstHits = p.first.filter((w) => words.has(w)).length;
      if (!firstHits) continue;
      const score = (suffix && suffix === p.suffix ? 100 : 0) + firstHits * 10 + p.middle.filter((w) => words.has(w)).length;
      pairs.push({ r, p, score, index });
    }
  });
  pairs.sort((x, y) => y.score - x.score || x.index - y.index || x.p.order - y.p.order);
  for (const { r, p } of pairs) {
    if (out.has(r.id) || taken.has(p.key)) continue;
    out.set(r.id, p.h);
    taken.add(p.key);
  }
  return out;
}

/**
 * Names still "Not yet" in their own GKK whose head of household is
 * registered in another GKK, by the same name rules as matchListToRegistry():
 * every word of the head's last name and one of their first name in the
 * name, and a suffix that agrees. `others` is lastYearOtherGkkHeads() rows.
 * Returns a Map of list id → [those heads], for a note asking the GKK to
 * report a possible duplicate or wrong GKK to the parish office.
 */
export function otherGkkMatches(listRows, others, matches = null) {
  const people = (others || []).map((h) => ({ h, last: nameWords(h.last_name), first: nameWords(h.first_name), suffix: nameSuffix(h.suffix) }))
    .filter((p) => p.last.length && p.first.length);
  const out = new Map();
  for (const r of listRows || []) {
    if (listStatus(r, matches) !== 'Not yet' || r.household_id != null) continue;
    const words = new Set(nameWords(r.head_name));
    const suffix = nameSuffix(r.head_name);
    const found = people.filter((p) => p.h.gkk !== r.gkk
      && !(suffix && p.suffix && suffix !== p.suffix)
      && p.last.every((w) => words.has(w)) && p.first.some((w) => words.has(w))).map((p) => p.h);
    if (found.length) out.set(r.id, found);
  }
  return out;
}

/** A list name's status, counting a name found in the registry (`matches`) as Registered. */
export function listStatus(row, matches = null) {
  return row.status === 'Not yet' && matches?.has(row.id) ? 'Registered' : row.status;
}

/**
 * Households registered against last year while the parish uses last year's
 * list (0041, 0048). "Registered" is every household in the registry: on
 * the verification queue (Pending) or Verified. `gkks` is [{ name,
 * previous_households }]; `heads` is one row per household ({ household_id,
 * household_name, gkk, status, first_name, last_name }); `listRows` is the
 * list (listLastYear()).
 *
 * A GKK with names on the list measures against them: last year is the
 * names not set aside, and "not yet" the names neither ticked off nor found
 * in the registry (matchListToRegistry()). A GKK without names but with the
 * household count typed in Parish GKK (0040) measures against that count:
 * "not yet" is the count minus the households registered, never below zero.
 * A GKK with neither has lastYear, notYet and pct null. Pass `onlyGkk` for a
 * GKK leader's own GKK. `familyHeads` also lets a name match a Head of
 * Family (see matchListToRegistry()). Also returns `notYet`: the names to
 * visit, by GKK then purok, as { key, title, detail, gkk, purok, note }.
 */
export function registryVsLastYear(gkks, heads, listRows, onlyGkk = null, familyHeads = []) {
  const share = (done, of) => (of > 0 ? Math.min(Math.round((done / of) * 100), 100) : done ? 100 : 0);
  const mine = (r) => !onlyGkk || r.gkk === onlyGkk;
  const myHeads = (heads || []).filter(mine);
  const myList = (listRows || []).filter(mine);
  const matches = matchListToRegistry(myList, myHeads, familyHeads);
  const lists = countLastYearList(myList, matches);

  const reg = new Map(); // GKK → { registered, verified, pending }
  for (const h of myHeads) {
    const c = reg.get(h.gkk ?? null) || { registered: 0, verified: 0, pending: 0 };
    c.registered += 1;
    if (h.status === 'Verified') c.verified += 1; else c.pending += 1;
    reg.set(h.gkk ?? null, c);
  }

  const row = (label, count, c = { registered: 0, verified: 0, pending: 0 }, list = null) => {
    const base = { label, ...c, fromList: false };
    if (list && list.total - list.setAside > 0) {
      const of = list.total - list.setAside;
      return { ...base, fromList: true, lastYear: of, notYet: list.notYet, pct: share(of - list.notYet, of) };
    }
    if (count == null) return { ...base, lastYear: null, notYet: null, pct: null };
    return { ...base, lastYear: count, notYet: Math.max(count - c.registered, 0), pct: share(c.registered, count) };
  };
  const named = (gkks || []).filter((g) => !onlyGkk || g.name === onlyGkk).sort((a, b) => a.name.localeCompare(b.name));
  const rows = named.map((g) => row(g.name, g.previous_households ?? null, reg.get(g.name), lists.get(g.name)));
  if (!onlyGkk && reg.get(null)) rows.push(row('No GKK', null, reg.get(null)));

  // The total covers only the GKKs with a baseline, so a missing one doesn't read as "not yet".
  const withBase = rows.filter((r) => r.lastYear != null);
  const sum = (k, rs) => rs.reduce((n, r) => n + r[k], 0);
  const lastYear = withBase.length ? sum('lastYear', withBase) : null;
  const notYet = withBase.length ? sum('notYet', withBase) : null;
  const total = {
    label: 'All GKKs', lastYear, notYet, fromList: false,
    registered: sum('registered', withBase), verified: sum('verified', withBase), pending: sum('pending', withBase),
    pct: lastYear == null ? null : share(lastYear - notYet, lastYear),
    registeredAll: sum('registered', rows),
  };

  const byPurok = (a, b) => String(a.gkk).localeCompare(String(b.gkk)) || String(a.purok || '').localeCompare(String(b.purok || ''), undefined, { numeric: true }) || a.title.localeCompare(b.title);
  const visits = myList.filter((r) => listStatus(r, matches) === 'Not yet')
    .map((r) => ({ key: `l${r.id}`, title: r.head_name, detail: [r.purok, r.note].filter(Boolean).join(' · '), gkk: r.gkk, purok: r.purok || '', note: r.note || '' }))
    .sort(byPurok);
  return { rows, total, hasBaseline: withBase.length > 0, notYet: visits, matches };
}

/** The census before `cycle` in `cycles` (newest first, as listCensusCycles() returns them), or null. */
export function previousCensus(cycles, cycle) {
  return (cycles || []).filter((c) => c.id < cycle.id).sort((a, b) => b.id - a.id)[0] || null;
}

/**
 * Households registered in this census against the previous census in the
 * registry, for a parish that doesn't use last year's list (0048). Both
 * arguments are census_household_progress() rows ({ household_id,
 * household_name, head_name, ref_no, gkk, progress }). Last year is the
 * households that took part in the previous census (at least one member
 * confirmed); "not yet" is those of them with nobody confirmed in this one;
 * "registered" is every household with at least one member confirmed now.
 * A household counts under its GKK today. A GKK with nobody in the previous
 * census has no baseline (lastYear, notYet and pct null). Same shape as
 * householdsVsLastYear(), plus `notYetHouseholds` (by GKK, then name) for
 * the house visits.
 */
export function householdsVsPreviousCensus(previousRows, currentRows, onlyGkk = null) {
  const share = (done, of) => (of > 0 ? Math.min(Math.round((done / of) * 100), 100) : 0);
  const mine = (r) => !onlyGkk || r.gkk === onlyGkk;
  const took = (r) => r.progress && r.progress !== 'Not started';
  const now = new Map((currentRows || []).filter(mine).map((r) => [r.household_id, r]));
  const before = (previousRows || []).filter(mine).filter(took).filter((r) => now.has(r.household_id));

  const byGkk = new Map();
  const at = (gkk) => {
    if (!byGkk.has(gkk)) byGkk.set(gkk, { lastYear: 0, notYet: 0, registered: 0, confirmed: 0 });
    return byGkk.get(gkk);
  };
  for (const r of now.values()) {
    const c = at(r.gkk ?? null);
    if (took(r)) c.registered += 1;
    if (r.progress === 'Confirmed') c.confirmed += 1;
  }
  const notYetHouseholds = [];
  for (const r of before) {
    const today = now.get(r.household_id);
    const c = at(today.gkk ?? null);
    c.lastYear += 1;
    if (!took(today)) { c.notYet += 1; notYetHouseholds.push(today); }
  }

  const rows = [...byGkk.entries()]
    .sort(([a], [b]) => (a === null) - (b === null) || String(a).localeCompare(String(b)))
    .map(([gkk, c]) => ({
      label: gkk ?? 'No GKK', fromList: false, registered: c.registered, confirmed: c.confirmed,
      ...(c.lastYear
        ? { lastYear: c.lastYear, notYet: c.notYet, pct: share(c.lastYear - c.notYet, c.lastYear) }
        : { lastYear: null, notYet: null, pct: null }),
    }));
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
  notYetHouseholds.sort((a, b) => String(a.gkk ?? '').localeCompare(String(b.gkk ?? '')) || String(a.household_name).localeCompare(String(b.household_name)));
  return { rows, total, hasBaseline: withBase.length > 0, notYetHouseholds };
}

// ---- families (0079) -------------------------------------------------------
// A household can hold more than one family (0054). The census measures each
// GKK's families too, in the same row shape as the households: { label,
// lastYear, registered, notYet, pct } per GKK and an 'All GKKs' total over
// the GKKs with a baseline (lastYear, notYet and pct null without one).

const familyShare = (done, of) => (of > 0 ? Math.min(Math.round((done / of) * 100), 100) : 0);

/** The 'All GKKs' row and hasBaseline for family rows. */
function familyTotals(rows) {
  const withBase = rows.filter((r) => r.lastYear != null);
  const sum = (k) => withBase.reduce((n, r) => n + r[k], 0);
  const lastYear = withBase.length ? sum('lastYear') : null;
  const notYet = withBase.length ? sum('notYet') : null;
  return {
    rows,
    total: { label: 'All GKKs', lastYear, notYet, registered: sum('registered'), pct: lastYear == null ? null : familyShare(lastYear - notYet, lastYear) },
    hasBaseline: withBase.length > 0,
  };
}

/**
 * Families registered against the count typed in Parish GKK -> Families last
 * year (gkks.previous_families). `gkks` are the GKK rows; `registered` is
 * family_stats().by_gkk ([{ label, families }]), the families in the
 * registry per GKK. "Not yet" is the count minus those, never below zero.
 */
export function familiesVsCount(gkks, registered, onlyGkk = null) {
  const reg = new Map((registered || []).map((g) => [g.label, Number(g.families) || 0]));
  const rows = (gkks || [])
    .filter((g) => !onlyGkk || g.name === onlyGkk)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((g) => {
      const n = reg.get(g.name) || 0;
      const of = g.previous_families ?? null;
      return of == null
        ? { label: g.name, registered: n, lastYear: null, notYet: null, pct: null }
        : { label: g.name, registered: n, lastYear: of, notYet: Math.max(of - n, 0), pct: familyShare(n, of) };
    });
  return familyTotals(rows);
}

/**
 * Families in this census against the families that took part in the
 * previous one, for a parish not using last year's list. Both arguments are
 * census_family_progress() rows ({ household_id, family_no, gkk, took_part }).
 * Like householdsVsPreviousCensus(): last year is the families that took
 * part before and still exist; "not yet" is those of them with nobody
 * answering now; a family counts under its household's GKK today.
 */
export function familiesVsPreviousCensus(previousRows, currentRows, onlyGkk = null) {
  const key = (r) => `${r.household_id}:${r.family_no}`;
  const mine = (r) => !onlyGkk || r.gkk === onlyGkk;
  const now = new Map((currentRows || []).filter(mine).map((r) => [key(r), r]));
  const byGkk = new Map();
  const at = (gkk) => {
    if (!byGkk.has(gkk)) byGkk.set(gkk, { lastYear: 0, notYet: 0, registered: 0 });
    return byGkk.get(gkk);
  };
  for (const r of now.values()) if (r.took_part) at(r.gkk ?? null).registered += 1;
  for (const r of (previousRows || []).filter(mine)) {
    const today = r.took_part && now.get(key(r));
    if (!today) continue;
    const c = at(today.gkk ?? null);
    c.lastYear += 1;
    if (!today.took_part) c.notYet += 1;
  }
  const rows = [...byGkk.entries()]
    .sort(([a], [b]) => (a === null) - (b === null) || String(a).localeCompare(String(b)))
    .map(([gkk, c]) => ({
      label: gkk ?? 'No GKK', registered: c.registered,
      ...(c.lastYear
        ? { lastYear: c.lastYear, notYet: c.notYet, pct: familyShare(c.lastYear - c.notYet, c.lastYear) }
        : { lastYear: null, notYet: null, pct: null }),
    }));
  return familyTotals(rows);
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
export const DEFAULT_SITE_URL = 'https://guadalupe-muaan.vercel.app';

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
      // Which of the house's families the new member joins (0054); the server checks it.
      .map((m) => ({ ...pickFields(m, PORTAL_MEMBER_FIELDS), family_no: Number(m.family_no) || 1, ...answer(m) })),
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

/**
 * Households not yet registered in the GKKs measured by their household
 * count (Parish GKK) rather than names, so they can't be on the visit list:
 * the sum of those GKKs' "not yet". 0 when comparing with a census.
 */
export function unnamedNotYet(res) {
  if (!res || res.mode === 'census') return 0;
  return (res.rows || []).filter((r) => r.lastYear != null && !r.fromList).reduce((n, r) => n + r.notYet, 0);
}

/** What a census is measured against, for titles and notes. */
export function vsLastYearBaseline(res) {
  if (res?.mode === 'census') return res.previous ? `the ${res.previous.label}` : 'no earlier census';
  return res?.mode === 'count' ? "last year's household count" : "last year's list";
}

/**
 * Which baseline a census is measured against (api.censusVsLastYearInputs()):
 * 'census' once an earlier census was held in the registry (the households
 * that answered it, whatever last year's list switch says); for the first
 * census, 'list' (last year's paper list, while the switch is on) or 'count'
 * (each GKK's households last year, typed in Parish GKK).
 */
export function censusBaselineMode(cycles, cycle, listOn) {
  if (cycle && previousCensus(cycles, cycle)) return 'census';
  return listOn ? 'list' : 'count';
}

/**
 * The households (and families) against last year or the previous census,
 * from api.censusVsLastYearInputs(), for the whole parish or one GKK
 * (`ownGkk`). Pure, so every GKK's results come from one fetch when a
 * census's results are kept (0082). All give { mode, previous, rows, total,
 * hasBaseline, notYet: [{ key, title, detail, gkk, purok, note }], families }.
 * - list: registryVsLastYear(): each GKK's names on last year's list (or its
 *   typed count) against the households in the registry, queued or verified;
 * - count: registryVsLastYear() on the counts typed in Parish GKK alone
 *   (`noPrevious` when no GKK has one);
 * - census: householdsVsPreviousCensus(): the households that answered the
 *   census before against this one. Online updates count once approved.
 */
export function censusVsLastYearFrom(inputs, ownGkk = null) {
  const familiesTyped = () => (inputs.familyStats ? familiesVsCount(inputs.gkks, inputs.familyStats, ownGkk) : null);
  if (inputs.mode === 'list' || inputs.mode === 'count') {
    const list = inputs.mode === 'list';
    // `matches` (a Map) is for last year's list itself, not the results.
    const { matches: _matches, ...res } = registryVsLastYear(inputs.gkks, inputs.heads, list ? inputs.list : [], ownGkk, list ? inputs.familyHeads : []);
    return { mode: inputs.mode, previous: null, ...(list ? {} : { noPrevious: !res.hasBaseline }), ...res, families: familiesTyped() };
  }
  const { notYetHouseholds, ...res } = householdsVsPreviousCensus(inputs.before, inputs.now, ownGkk);
  const notYet = notYetHouseholds.map((h) => ({
    key: `h${h.household_id}`, title: h.household_name, detail: [h.head_name, h.ref_no].filter(Boolean).join(' · '), gkk: h.gkk, purok: '', note: [h.head_name, h.ref_no].filter(Boolean).join(' · '),
  }));
  const families = inputs.famBefore && inputs.famNow ? familiesVsPreviousCensus(inputs.famBefore, inputs.famNow, ownGkk) : null;
  return { mode: 'census', previous: inputs.previous, ...res, notYet, families };
}

/**
 * The households-vs-last-year table (api.censusVsLastYear() result) as
 * { title, columns, rows } for a CSV or report, one row per GKK and the total.
 */
export function vsLastYearTable(res, cycle, { withFamilies = true } = {}) {
  const census = res.mode === 'census';
  const from = (r) => (r.lastYear == null || r === res.total ? '' : census ? res.previous.label : r.fromList ? 'List' : 'Count');
  const pct = (r) => (r.pct == null ? '' : `${r.pct}%`);
  const columns = census
    ? ['GKK', 'Last census', 'Answered', 'Fully confirmed', 'Not yet', 'Answered %']
    : ['GKK', 'Last year from', 'Last year', 'Registered', 'Verified', 'On the queue', 'Not yet', 'Registered %'];
  const cells = (r) => (census
    ? [r.label, r.lastYear ?? '', r.registered, r.confirmed, r.notYet ?? '', pct(r)]
    : [r.label, from(r), r.lastYear ?? '', r.registered, r.verified, r.pending, r.notYet ?? '', pct(r)]);
  // Families (0079), matched by GKK; blank for a GKK with no families baseline.
  const fam = withFamilies && res.families?.hasBaseline ? res.families : null;
  const famOf = new Map(fam ? [...fam.rows, fam.total].map((r) => [r.label, r]) : []);
  const famCells = (r) => {
    const f = famOf.get(r.label);
    return !f || f.lastYear == null ? ['', f ? f.registered : '', '', ''] : [f.lastYear, f.registered, f.notYet, `${f.pct}%`];
  };
  return {
    title: `${cycle?.label || 'Census'}: households vs ${vsLastYearBaseline(res)}`,
    columns: fam
      ? [...columns, ...(census ? ['Families last census', 'Families answered'] : ['Families last year', 'Families registered']), 'Families not yet', 'Families %']
      : columns,
    rows: res.hasBaseline ? [...res.rows, res.total].map((r) => (fam ? [...cells(r), ...famCells(r)] : cells(r))) : [],
  };
}

/**
 * The families-vs-last-year table (0079, api.censusVsLastYear().families) as
 * { title, columns, rows }, one row per GKK and the total; no rows without a baseline.
 */
export function familiesTable(res, cycle) {
  const fam = res?.families;
  const pct = (r) => (r.pct == null ? '' : `${r.pct}%`);
  return {
    title: `${cycle?.label || 'Census'}: families vs ${vsLastYearBaseline(res)}`,
    columns: res?.mode === 'census' ? ['GKK', 'Last census', 'Answered', 'Not yet', 'Answered %'] : ['GKK', 'Last year', 'Registered', 'Not yet', 'Registered %'],
    rows: fam?.hasBaseline ? [...fam.rows, fam.total].map((r) => [r.label, r.lastYear ?? '', r.registered, r.notYet ?? '', pct(r)]) : [],
  };
}

/** Members per census status (summarizeCensus()) as { title, columns, rows }, one row per GKK and the total. */
export function statusTable(summary, cycle) {
  return {
    title: `${cycle?.label || 'Census'}: members per status`,
    columns: ['GKK', ...summary.columns, 'Total', 'Confirmed %'],
    rows: [...summary.rows, summary.total].map((r) => [r.label, ...summary.columns.map((c) => r.counts[c]), r.total, `${r.pct}%`]),
  };
}
