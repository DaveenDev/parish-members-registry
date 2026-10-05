import { PARTNERED_STATUSES, WEDDING_TYPES, HEAD, FAMILY_HEAD } from '../constants.js';
import { toNameCase, toSuffixCase } from './util.js';

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

// ---- families within a household (0054 migration) ------------------------

/** A member's family number: `familyNo` (forms) or `family_no` (rows), 1 when unset. */
export function familyNoOf(m) {
  const n = Number(m?.familyNo ?? m?.family_no);
  return Number.isInteger(n) && n >= 1 ? n : 1;
}

/**
 * Index of the head of family `familyNo`: the Household Head for family 1,
 * the Head of Family for the others; -1 when it has none. `relKey` is the
 * relationship property ('relationship' in forms and rows).
 */
export function familyHeadIndex(members, familyNo, relKey = 'relationship') {
  const want = familyNo === 1 ? HEAD : FAMILY_HEAD;
  return (members || []).findIndex((m) => familyNoOf(m) === familyNo && m[relKey] === want);
}

/**
 * The families in a household, family 1 first: [{ familyNo, head, headIndex,
 * members, indexes }]. `members` keep their order; `indexes` are their
 * positions in the list given.
 */
export function familiesOf(members, relKey = 'relationship') {
  const byNo = new Map();
  (members || []).forEach((m, index) => {
    const no = familyNoOf(m);
    if (!byNo.has(no)) byNo.set(no, { familyNo: no, head: null, headIndex: -1, members: [], indexes: [] });
    const g = byNo.get(no);
    g.members.push(m);
    g.indexes.push(index);
  });
  for (const g of byNo.values()) {
    g.headIndex = familyHeadIndex(members, g.familyNo, relKey);
    g.head = g.headIndex >= 0 ? members[g.headIndex] : null;
  }
  return [...byNo.values()].sort((a, b) => a.familyNo - b.familyNo);
}

/** The number a new family in this household gets. */
export function nextFamilyNo(members) {
  return Math.max(0, ...(members || []).map(familyNoOf)) + 1;
}

/** A family head's name (database rows or form members), '' without a head. */
export function familyHeadName(head) {
  if (!head) return '';
  return [head.first_name ?? head.firstName, head.last_name ?? head.lastName, head.suffix].filter(Boolean).join(' ');
}

/** A family is called by its head: "Family of Pedro Dela Cruz". */
export function familyTitle(group) {
  const name = familyHeadName(group?.head);
  if (name) return `Family of ${name}`;
  return group?.familyNo === 1 ? 'Household Head’s family' : `Family ${group?.familyNo ?? ''}`.trim();
}

// ---- weddings and spouses --------------------------------------------------

export const WEDDING_FIELDS = ['matType', 'hasMatrimony', 'matDate', 'matChurch'];

/** Field names the wizard's member objects use for the wedding rule. */
const WIZARD_KEYS = { relationship: 'relationship', civil: 'civilStatus', fields: WEDDING_FIELDS };

/**
 * Indexes of the members who share a family head's wedding: married Spouses
 * in the same family, while the head is married. `keys` names the
 * relationship / civil status properties (the wizard and the admin form spell
 * them differently); `headIdx` is the head's position.
 */
export function weddingPartners(members, keys = WIZARD_KEYS, headIdx = 0) {
  const head = members[headIdx];
  if (!head || head[keys.civil] !== 'Married') return [];
  const fam = familyNoOf(head);
  return members.flatMap((m, idx) => (
    idx !== headIdx && familyNoOf(m) === fam && m[keys.relationship] === 'Spouse' && m[keys.civil] === 'Married' ? [idx] : []
  ));
}

/**
 * Every shared wedding in the household, family by family: a Map from a
 * member's index to the indexes of those they share it with (a head → their
 * married spouses, a spouse → their head).
 */
export function weddingCouples(members, keys = WIZARD_KEYS) {
  const out = new Map();
  for (const g of familiesOf(members, keys.relationship)) {
    if (g.headIndex < 0) continue;
    const partners = weddingPartners(members, keys, g.headIndex);
    if (!partners.length) continue;
    out.set(g.headIndex, partners);
    for (const p of partners) out.set(p, [g.headIndex]);
  }
  return out;
}

/**
 * A family head and a married Spouse share one wedding — type, date and
 * parish — so an edit on either side is copied to the other. `source` is the
 * index of the member whose wedding field was just edited; otherwise the
 * head's wedding wins, falling back to a spouse's when the head has none yet.
 * Returns the same array when nothing needs to change.
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
 * Keep each Spouse in step with the head of their own family. A Spouse takes
 * the head's Married / Live-in status (`civilFromHead` marks a value filled
 * in automatically; once edited by hand it's left alone), and shares the
 * head's wedding (see shareWedding). Returns the same member objects when
 * nothing needs to change.
 */
export function syncSpouses(members, source = -1) {
  if (!members.length) return members;
  let synced = members.map((m, idx) => {
    if (m.relationship !== 'Spouse') return m;
    const hi = familyHeadIndex(members, familyNoOf(m));
    if (hi < 0 || hi === idx) return m;
    const head = members[hi];
    if (PARTNERED_STATUSES.includes(head.civilStatus) && (m.civilFromHead || !m.civilStatus) && m.civilStatus !== head.civilStatus) {
      return { ...m, civilStatus: head.civilStatus, civilFromHead: true };
    }
    return m;
  });
  for (const g of familiesOf(synced)) {
    if (g.headIndex >= 0) synced = shareWedding(synced, source, WIZARD_KEYS, g.headIndex);
  }
  return synced;
}

/**
 * What actually gets sent for a member (public wizard and admin New
 * Household): names in Capitalized case, and the wedding type only while
 * Married, where only a Catholic wedding counts as the sacrament.
 */
export function toPayloadMember({ civilFromHead, weddingFromHead, ...m }) {
  const named = {
    ...m,
    firstName: toNameCase(m.firstName), middleName: toNameCase(m.middleName),
    lastName: toNameCase(m.lastName), suffix: toSuffixCase(m.suffix),
  };
  if (m.civilStatus === 'Married') return { ...named, hasMatrimony: m.matType === 'Catholic Marriage' };
  return { ...named, matType: WEDDING_TYPES.includes(m.matType) ? '' : m.matType };
}
