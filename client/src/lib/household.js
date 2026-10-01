import { PARTNERED_STATUSES } from '../constants.js';

/**
 * Group member rows (from members_with_household, already sorted by
 * household) into consecutive runs: [{ householdId, name, gkk, members }].
 */
export function groupByHousehold(rows) {
  const groups = [];
  for (const m of rows) {
    const last = groups[groups.length - 1];
    if (last && last.householdId === m.household_id) last.members.push(m);
    else groups.push({ householdId: m.household_id, name: m.household_name, gkk: m.household_gkk, members: [m] });
  }
  return groups;
}

/**
 * Group member rows (already sorted by GKK) into consecutive runs:
 * [{ gkk, members }]. Members whose household has no GKK share one group
 * with gkk = null.
 */
export function groupByGkk(rows) {
  const groups = [];
  for (const m of rows) {
    const gkk = m.household_gkk || null;
    const last = groups[groups.length - 1];
    if (last && last.gkk === gkk) last.members.push(m);
    else groups.push({ gkk, members: [m] });
  }
  return groups;
}

export const WEDDING_FIELDS = ['matType', 'hasMatrimony', 'matDate', 'matChurch'];

/**
 * Keep each Spouse in step with the head (members[0]): they share the head's
 * Married / Live-in status and, when both are married, the same wedding. The
 * `civilFromHead` / `weddingFromHead` flags mark values that were filled in
 * automatically; once the spouse's own answer is edited by hand it's left
 * alone. Returns the same member objects when nothing needs to change.
 */
export function syncSpouses(members) {
  const head = members[0];
  if (!head) return members;
  return members.map((m, idx) => {
    if (idx === 0 || m.relationship !== 'Spouse') return m;
    let next = m;
    if (PARTNERED_STATUSES.includes(head.civilStatus) && (m.civilFromHead || !m.civilStatus) && m.civilStatus !== head.civilStatus) {
      next = { ...next, civilStatus: head.civilStatus, civilFromHead: true };
    }
    if (head.civilStatus === 'Married' && next.civilStatus === 'Married' && head.matType && (next.weddingFromHead || !next.matType)) {
      const differs = WEDDING_FIELDS.some((f) => next[f] !== head[f]);
      if (differs) next = { ...next, ...Object.fromEntries(WEDDING_FIELDS.map((f) => [f, head[f]])), weddingFromHead: true };
    }
    return next;
  });
}
