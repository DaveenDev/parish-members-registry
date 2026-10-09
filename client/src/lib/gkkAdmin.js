// Parish Config → Parish GKK: what each GKK still needs, for the filter
// chips above the list, and its census progress line.

/** The filter chips, in order: [key, label, test(gkk)]. A gkk row carries `count` (households). */
export const GKK_ATTENTION = [
  ['address', 'No chapel address', (g) => !String(g.chapel_address || '').trim()],
  ['history', 'History to publish', (g) => !g.history_published && (!!String(g.history || '').trim() || (g.history_photos || []).length > 0)],
  ['coordinator', 'No coordinator', (g) => !String(g.coordinator_name || '').trim()],
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
