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

/** Field names the wizard's member objects use for the wedding rule. */
const WIZARD_KEYS = { relationship: 'relationship', civil: 'civilStatus', fields: WEDDING_FIELDS };

/**
 * Indexes of the members who share the Household Head's wedding: married
 * Spouses, while the head is married. `keys` names the relationship / civil
 * status properties (the wizard and the admin form spell them differently);
 * `headIdx` is the head's position.
 */
export function weddingPartners(members, keys = WIZARD_KEYS, headIdx = 0) {
  const head = members[headIdx];
  if (!head || head[keys.civil] !== 'Married') return [];
  return members.flatMap((m, idx) => (idx !== headIdx && m[keys.relationship] === 'Spouse' && m[keys.civil] === 'Married' ? [idx] : []));
}

/**
 * The head and a married Spouse share one wedding — type, date and parish —
 * so an edit on either side is copied to the other. `source` is the index of
 * the member whose wedding field was just edited; otherwise the head's wedding
 * wins, falling back to a spouse's when the head has none yet. Returns the
 * same array when nothing needs to change.
 */
export function shareWedding(members, source = -1, keys = WIZARD_KEYS, headIdx = 0) {
  const partners = weddingPartners(members, keys, headIdx);
  if (!partners.length) return members;
  const sharing = [headIdx, ...partners];
  const recorded = (m) => keys.fields.some((f) => m[f]);
  const from = sharing.includes(source) ? source : sharing.find((idx) => recorded(members[idx]));
  if (from === undefined) return members;
  const wedding = Object.fromEntries(keys.fields.map((f) => [f, members[from][f]]));
  const next = members.map((m, idx) => (
    sharing.includes(idx) && keys.fields.some((f) => m[f] !== wedding[f]) ? { ...m, ...wedding } : m
  ));
  return next.every((m, idx) => m === members[idx]) ? members : next;
}

/**
 * Keep each Spouse in step with the head (members[0]). A Spouse takes the
 * head's Married / Live-in status (`civilFromHead` marks a value filled in
 * automatically; once edited by hand it's left alone), and shares the head's
 * wedding (see shareWedding). Returns the same member objects when nothing
 * needs to change.
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
  return shareWedding(synced, source);
}
