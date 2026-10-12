// Parish Config → Parish GKK: what each GKK still needs, for the filter
// chips above the list, and its census progress line.

import { gkkParts } from './site.js';

/**
 * The filter chips, in order: [key, label, test(gkk)]. A gkk row carries
 * `count` (households) and `coordinators`: the names of its GKK leader
 * accounts that can sign in (0098), or null when they couldn't be read.
 */
export const GKK_ATTENTION = [
  // Required (0089): registration lists the barangays, and reference numbers use them.
  ['barangay', 'No barangay', (g) => !String(g.barangay || '').trim() && !gkkParts(g.name).area],
  ['address', 'No chapel address', (g) => !String(g.chapel_address || '').trim()],
  ['history', 'History to publish', (g) => !g.history_published && (!!String(g.history || '').trim() || (g.history_photos || []).length > 0)],
  // A GKK leader account (Staff accounts), not the old coordinator_name nothing fills any more.
  ['coordinator', 'No coordinator', (g) => Array.isArray(g.coordinators) && !g.coordinators.length],
  ['meeting', 'No meeting schedule', (g) => !String(g.meeting_schedule || '').trim()],
  ['empty', 'No households yet', (g) => !g.count],
];

/** How many GKKs each chip matches: { address: 2, … }. */
export function attentionCounts(rows) {
  return Object.fromEntries(GKK_ATTENTION.map(([key, , test]) => [key, (rows || []).filter(test).length]));
}

/** The rows a chip shows; 'all' (or an unknown key) shows every row. */
export function filterByAttention(rows, key) {
  const chip = GKK_ATTENTION.find(([k]) => k === key);
  return chip ? (rows || []).filter(chip[2]) : rows || [];
}

/**
 * One GKK's families progress (0079) from api.censusVsLastYear()'s
 * `families`: { done, of, pct, notYet }, or null without a families baseline.
 */
export function gkkFamilyProgress(families, name) {
  const r = (families?.rows || []).find((p) => p.label === name);
  if (!r || r.lastYear == null) return null;
  return { done: r.lastYear - r.notYet, of: r.lastYear, pct: r.pct, notYet: r.notYet };
}

/**
 * One GKK's census progress from api.censusVsLastYear() rows (by label):
 * { done, of, pct, notYet } against its baseline, or { registered } alone
 * when it has no baseline; null when there's no progress row for it.
 */
export function gkkProgress(progressRows, name) {
  const r = (progressRows || []).find((p) => p.label === name);
  if (!r) return null;
  if (r.lastYear == null) return { registered: r.registered || 0 };
  return { done: r.lastYear - r.notYet, of: r.lastYear, pct: r.pct, notYet: r.notYet, fromList: !!r.fromList };
}

/**
 * What the Census column measures, in words, from api.censusVsLastYear()'s
 * `mode` and `previous`: the verb for a household counted ("answered" the
 * census, or "registered" in the registry) and what it's counted out of.
 */
export function censusWords(res) {
  if (res?.mode === 'census') {
    return { verb: 'answered', baseline: res.previous ? `that answered the ${res.previous.label}` : 'from the census before' };
  }
  return { verb: 'registered', baseline: res?.mode === 'count' ? 'counted last year (Last year in the GKK panel)' : "on last year's list" };
}

/**
 * The sentence above the Parish GKK table that says what the Census column
 * shows, e.g. "2026 Census: households (and families) that answered it, out
 * of those that answered the 2025 Census." '' while nothing is loaded.
 */
export function censusColumnNote(res, cycle) {
  if (!res) return '';
  const { verb, baseline } = censusWords(res);
  const name = cycle?.label || 'The census';
  const fam = res.families?.hasBaseline ? ' (and families)' : '';
  if (!res.hasBaseline) return `${name}: households ${verb} so far. No GKK has a count from last year to compare with yet.`;
  return `${name}: households${fam} ${verb === 'answered' ? 'that answered it' : 'registered in the registry'}, out of those ${baseline}.`;
}
