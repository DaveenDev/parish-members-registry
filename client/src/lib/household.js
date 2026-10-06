import {
  PARTNERED_STATUSES, WEDDING_TYPES, HEAD, FAMILY_HEAD, ageFromDob,
  COMMUNION_MIN_AGE, CONFIRMATION_MIN_AGE, MATRIMONY_MIN_AGE, ROLE_MIN_AGE,
} from '../constants.js';
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

/**
 * Rows (already sorted by `key`) as consecutive runs: [{ key, rows }].
 * Rows with no value share one group with key = null.
 */
export function groupRuns(rows, key) {
  const groups = [];
  for (const r of rows) {
    const k = r[key] || null;
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.rows.push(r);
    else groups.push({ key: k, rows: [r] });
  }
  return groups;
}

/** A household group's heading: its GKK or Family Grouping, or what's missing. */
export const groupHeading = (key, by) => key || (by === 'gkk' ? 'No GKK' : 'No Family Grouping');

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

/** Badge tones for a household's families, in family order (family 1 first). */
export const FAMILY_TONES = ['green', 'blue', 'gold', 'gray'];

/**
 * Badges for the households that hold two or more families, from the members
 * of those households (database rows): Map household_id → Map family_no →
 * { label, tone }. A family is named by its head's surname ("Dayao Family");
 * when two heads share a surname, by the head's full name; "Family 2" without
 * a head. Each family of a household gets its own tone, the same on every
 * one of its members. Households with a single family are left out.
 */
export function familyBadges(rows) {
  const byHouse = new Map();
  for (const m of rows || []) {
    if (!byHouse.has(m.household_id)) byHouse.set(m.household_id, []);
    byHouse.get(m.household_id).push(m);
  }
  const out = new Map();
  for (const [hid, members] of byHouse) {
    const families = familiesOf(members);
    if (families.length < 2) continue;
    const surname = (g) => String(g.head?.last_name || '').trim();
    const taken = new Map();
    for (const g of families) if (surname(g)) taken.set(surname(g).toLowerCase(), (taken.get(surname(g).toLowerCase()) || 0) + 1);
    const badges = new Map();
    families.forEach((g, i) => {
      const last = surname(g);
      const label = !last ? `Family ${g.familyNo}`
        : taken.get(last.toLowerCase()) > 1 ? `${familyHeadName(g.head)} Family`
        : `${last} Family`;
      badges.set(g.familyNo, { label, tone: FAMILY_TONES[i % FAMILY_TONES.length] });
    });
    out.set(hid, badges);
  }
  return out;
}

/** "Family #2": a member's family, shown beside their name on the registration forms. */
export const familyTag = (m) => `Family #${familyNoOf(m)}`;

/**
 * Renumber the families 1, 2, 3… in the same order, so removing a family
 * from a form leaves no gap. Returns the same array when nothing changes.
 */
export function compactFamilies(members) {
  const nos = [...new Set(members.map(familyNoOf))].sort((a, b) => a - b);
  if (nos.every((n, i) => n === i + 1)) return members;
  const to = new Map(nos.map((n, i) => [n, i + 1]));
  return members.map((m) => ({ ...m, familyNo: to.get(familyNoOf(m)) }));
}

// ---- the same person entered twice -----------------------------------------

const normName = (s) => String(s ?? '').toLowerCase().replace(/[.,]/g, '').replace(/\s+/g, ' ').trim();
const namePart = (m, key, rowKey) => normName(m?.[key] ?? m?.[rowKey]);

/**
 * Whether two members (form members or database rows) are the same person:
 * the same first name, last name and suffix, with no middle name or birthday
 * telling them apart. A father and son of the same name differ by birthday
 * or by "Jr.".
 */
export function samePerson(a, b) {
  const first = namePart(a, 'firstName', 'first_name');
  const last = namePart(a, 'lastName', 'last_name');
  if (!first || !last) return false;
  if (first !== namePart(b, 'firstName', 'first_name') || last !== namePart(b, 'lastName', 'last_name')) return false;
  if (namePart(a, 'suffix', 'suffix') !== namePart(b, 'suffix', 'suffix')) return false;
  const differ = (x, y) => !!x && !!y && x !== y;
  return !differ(namePart(a, 'middleName', 'middle_name'), namePart(b, 'middleName', 'middle_name'))
    && !differ(String(a?.dob || ''), String(b?.dob || ''));
}

/** Index of the member before `i` (the Household Head first) that members[i] repeats, or -1. */
export function repeatedMember(members, i) {
  for (let j = 0; j < i; j++) if (samePerson(members[i], members[j])) return j;
  return -1;
}

/** A Spouse's sex from their family head's: 'Female' for a male head, 'Male' for a female head, '' otherwise. */
export function spouseSex(headSex) {
  if (headSex === 'Male') return 'Female';
  if (headSex === 'Female') return 'Male';
  return '';
}

// ---- what a member is old enough for ---------------------------------------

/**
 * What registration asks of a member at their age: { communion,
 * confirmation, matrimony, roles } (roles: Katungdanan sa GKK / Parish).
 * Everything while the birthday is unknown.
 */
export function askedForAge(dob, today = new Date()) {
  const age = ageFromDob(dob, today);
  const from = (min) => age === null || age >= min;
  return {
    communion: from(COMMUNION_MIN_AGE),
    confirmation: from(CONFIRMATION_MIN_AGE),
    matrimony: from(MATRIMONY_MIN_AGE),
    roles: from(ROLE_MIN_AGE),
  };
}

/** A member with what they're too young for cleared, e.g. a box ticked before the birthday was entered. */
export function clearForAge(m, today = new Date()) {
  const asked = askedForAge(m.dob, today);
  const out = { ...m };
  if (!asked.communion) Object.assign(out, { hasCommunion: false, communionDate: '', communionChurch: '' });
  if (!asked.confirmation) Object.assign(out, { hasConfirmation: false, confDate: '', confChurch: '', confName: '', confSponsor: '' });
  if (!asked.matrimony) Object.assign(out, { hasMatrimony: false, matDate: '', matChurch: '', matType: '' });
  if (!asked.roles) Object.assign(out, { gkkRole: '', parishRole: '' });
  return out;
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
 * Household): names in Capitalized case, nothing the member is too young
 * for (see clearForAge), and the wedding type only while Married, where only
 * a Catholic wedding counts as the sacrament.
 */
export function toPayloadMember({ civilFromHead, weddingFromHead, ...rest }) {
  const m = clearForAge(rest);
  const named = {
    ...m,
    firstName: toNameCase(m.firstName), middleName: toNameCase(m.middleName),
    lastName: toNameCase(m.lastName), suffix: toSuffixCase(m.suffix),
  };
  if (m.civilStatus === 'Married') return { ...named, hasMatrimony: m.matType === 'Catholic Marriage' };
  return { ...named, matType: WEDDING_TYPES.includes(m.matType) ? '' : m.matType };
}
