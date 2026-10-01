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

/** Indexes of the members who share the head's wedding: married Spouses, while the head is married. */
export function weddingPartners(members) {
  const head = members[0];
  if (!head || head.civilStatus !== 'Married') return [];
  return members.flatMap((m, idx) => (idx > 0 && m.relationship === 'Spouse' && m.civilStatus === 'Married' ? [idx] : []));
}

/**
 * Keep each Spouse in step with the head (members[0]). A Spouse takes the
 * head's Married / Live-in status (`civilFromHead` marks a value filled in
 * automatically; once edited by hand it's left alone). When both are married
 * they share one wedding — type, date and parish — so an edit on either side
 * is copied to the other. `source` is the index of the member just edited;
 * otherwise the head's wedding wins, falling back to a spouse's when the head
 * has none yet. Returns the same member objects when nothing needs to change.
 */
export function syncSpouses(members, source = -1) {
  const head = members[0];
  if (!head) return members;
  const synced = members.map((m, idx) => {
    if (idx === 0 || m.relationship !== 'Spouse') return m;
    if (PARTNERED_STATUSES.includes(head.civilStatus) && (m.civilFromHead || !m.civilStatus) && m.civilStatus !== head.civilStatus) {
      return { ...m, civilStatus: head.civilStatus, civilFromHead: true };
    }
    return m;
  });
  const partners = weddingPartners(synced);
  if (!partners.length) return synced;
  const sharing = [0, ...partners];
  const from = sharing.includes(source) ? source : (head.matType ? 0 : partners.find((idx) => synced[idx].matType));
  if (from === undefined) return synced;
  const wedding = Object.fromEntries(WEDDING_FIELDS.map((f) => [f, synced[from][f]]));
  return synced.map((m, idx) => (
    sharing.includes(idx) && WEDDING_FIELDS.some((f) => m[f] !== wedding[f]) ? { ...m, ...wedding } : m
  ));
}
