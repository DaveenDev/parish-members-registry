// Parish census helpers shared by the admin census screen, the printed census
// form and their tests. The database (0007_census.sql) has the same lists and
// suggestion rule — keep the two in sync.

import { PARTICIPATION_ITEMS, PARTICIPATION_LEVELS } from '../constants.js';

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
