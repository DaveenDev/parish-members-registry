// OFW (Overseas Filipino Worker) details and occupation groups on members
// (0121_member_ofw.sql). Pure helpers shared by the forms, lists and reports.
//
// A member's OFW answer is ofw_status ('Abroad' now, 'Returned' back home,
// null = not an OFW) and, abroad now, the year their contract started
// (optional). No country is asked. An OFW household has a current member
// abroad now (households_with_count.ofw_abroad_count).

import {
  OCCUPATION_GROUPS, OCCUPATION_GROUP_HINTS, OFW_STATUSES, SEA_BASED_GROUP, OFW_OCCUPATION_GROUPS, LOCAL_OCCUPATION_GROUPS,
} from '../constants.js';
import { OCCUPATION_GROUP_LABELS, OFW_GROUP_LABELS, LOCAL_GROUP_LABELS } from './bisaya.js';

export const FIRST_OFW_YEAR = 1950;
/** The latest year a form takes: next year (a contract about to start). */
export const lastOfwYear = (today = new Date()) => today.getFullYear() + 1;

const text = (v) => String(v ?? '').trim();

/** An occupation group as the staff pages name it ("Professional (doctor, engineer, lawyer…)"). */
export const occupationGroupLabel = (g) => OCCUPATION_GROUP_HINTS[g] || g || '';
/** …and as the public forms do, in Bisaya. */
export const occupationGroupBis = (g) => OCCUPATION_GROUP_LABELS[g] || g || '';
export const isOccupationGroup = (g) => OCCUPATION_GROUPS.includes(g);

/**
 * The Category list the public forms offer for an OFW answer (0123): the
 * kinds of work OFWs do for someone abroad now or a former OFW, the common
 * kinds of work at home for anyone else ("Dili", or not asked).
 */
export const occupationGroupsFor = (status) => (OFW_STATUSES.includes(status) ? OFW_OCCUPATION_GROUPS : LOCAL_OCCUPATION_GROUPS);
/** A group as that list names it, in Bisaya. */
export const occupationGroupBisFor = (g, status) =>
  (OFW_STATUSES.includes(status) ? OFW_GROUP_LABELS : LOCAL_GROUP_LABELS)[g] || occupationGroupBis(g);

/** Sea-based (seafarers) or land-based (everyone else). */
export const ofwBase = (group) => (group === SEA_BASED_GROUP ? 'Sea-based' : 'Land-based');

/**
 * The OFW answer of a stored member row (snake_case): { status, since } with
 * the contract year as a number (abroad now only), or null when they aren't
 * an OFW.
 */
export function ofwOf(m) {
  const status = OFW_STATUSES.includes(m?.ofw_status) ? m.ofw_status : null;
  if (!status) return null;
  const since = status === 'Abroad' && text(m.ofw_since) ? Number(m.ofw_since) : null;
  return { status, since };
}

/** "OFW", "OFW · since 2019", "Former OFW", or '' (staff pages). */
export function ofwLine(m) {
  const o = ofwOf(m);
  if (!o) return '';
  if (o.status === 'Returned') return 'Former OFW';
  return o.since ? `OFW · since ${o.since}` : 'OFW';
}

/** The same in Bisaya, for the public forms: "OFW · sukad 2019", "Kanhi OFW". */
export function ofwLineBis(m) {
  const o = ofwOf(m);
  if (!o) return '';
  if (o.status === 'Returned') return 'Kanhi OFW';
  return o.since ? `OFW · sukad ${o.since}` : 'OFW';
}

/** A form's member (blankMember() keys) as a stored row's OFW columns, for ofwLine(). */
export const ofwFromForm = (m) => ({ ofw_status: m.ofwStatus, ofw_since: m.ofwSince });

/**
 * What's wrong with the contract year of an OFW answer ({ since }), in
 * English or Bisaya. Only asked of someone abroad now; empty when there's
 * nothing to fix (blank is fine: the year is optional).
 */
export function ofwYearErrors({ status, since }, { lang = 'en', today = new Date() } = {}) {
  if (status !== 'Abroad' || !text(since)) return {};
  const last = lastOfwYear(today);
  if (/^\d{4}$/.test(text(since)) && Number(since) >= FIRST_OFW_YEAR && Number(since) <= last) return {};
  return { since: lang === 'bis' ? `Isulat ang tuig, ${FIRST_OFW_YEAR} hangtod ${last}` : `Enter a year from ${FIRST_OFW_YEAR} to ${last}` };
}

/**
 * A stored member's occupation group and OFW columns as the member window
 * saves them: a contract year only abroad now, as a number. (members_ofw_tidy()
 * does the same in the database.)
 */
export function ofwPatch(m) {
  const status = OFW_STATUSES.includes(m.ofw_status) ? m.ofw_status : null;
  return {
    occupation_group: isOccupationGroup(m.occupation_group) ? m.occupation_group : null,
    ofw_status: status,
    ofw_since: status === 'Abroad' && text(m.ofw_since) ? Number(text(m.ofw_since)) : null,
  };
}

// ---- Sort occupations (Reports) ------------------------------------------------------

// Words in a typed occupation that suggest its group, English and Bisaya.
// Only a suggestion: the secretary picks the group with a click.
const KEYWORDS = [
  ['Seafarer', /\b(seaman|seafarer|seamen|marino|sea ?based|ship|barko|cruise)\b/],
  ['Household service or caregiver', /\b(caregiver|care ?giver|kasambahay|katabang|helper|housemaid|maid|yaya|nanny|domestic|dh)\b/],
  ['Hotel, restaurant or cleaning', /\b(hotel|resort|restaurant|restawran|waiter|waitress|cook|chef|kusinero|kusinera|cleaner|housekeeping|housekeeper|room ?attendant|barista|bartender|dishwasher)\b/],
  ['Farming or fishing', /\b(farm\w*|uma|mag-?uuma|nag-?uma|panguma|pagpanguma|mangingisda|mananagat|fisher\w*|pangisda\w*|agri\w*|harvester)\b/],
  ['Teacher', /\b(teacher|magtutudlo|maestr[ao]|instructor|professor|tutor)\b/],
  ['Health worker', /\b(nurse|midwife|caregiver|bhw|health|medtech|pharmac\w*|therapist|hospital)\b/],
  ['Driver or transport', /\b(driver|drayber|habal|tricycle|jeepney|trucker|rider|delivery|conductor|transport)\b/],
  ['Construction or skilled trade', /\b(construction|carpenter|karpintero|mason|welder|electrician|plumber|mechanic|painter|foreman|panday)\b/],
  ['Factory or labourer', /\b(factory|pabrika|labou?rer|trabahante|laborer|worker|helper|porter|janitor|utility)\b/],
  ['Government, police or military', /\b(police|pulis|army|soldier|sundalo|military|government|gobyerno|barangay|kagawad|tanod|lgu|deped|bfp|pnp|afp)\b/],
  ['Office or sales staff', /\b(office|clerk|secretary|cashier|sales\w*|saleslady|accountant|bookkeeper|call ?cent\w*|bpo|admin\w*|staff|encoder)\b/],
  ['Business or vendor', /\b(business\w*|negosyo|negosyante|vendor|tindera|tindero|sari-?sari|store|owner|entrepreneur|seller|baligya\w*)\b/],
  ['Professional', /\b(doctor|engineer|inhenyero|lawyer|abogado|architect|dentist|cpa|pastor|priest)\b/],
  ['Student', /\b(student|estudyante|eskwela|nag-?eskwela|pupil|college|grade ?\d+)\b/],
  ['Homemaker', /\b(housewife|house ?wife|homemaker|naa sa balay|plain housewife|househusband)\b/],
  ['Retired', /\b(retired|retirado|pensioner|senior)\b/],
  ['Looking for work', /\b(unemployed|jobless|walay trabaho|wala trabaho|nangita)\b/],
];

/** The group a typed occupation most likely belongs to, or null. */
export function suggestOccupationGroup(occupation) {
  const t = text(occupation).toLowerCase();
  if (!t) return null;
  const hit = KEYWORDS.find(([, re]) => re.test(t));
  return hit ? hit[0] : null;
}

/** The same occupation typed differently, for grouping: "  Farmer. " → "farmer". */
export const occupationKey = (occupation) => text(occupation).toLowerCase().replace(/[.\s]+$/g, '').replace(/\s+/g, ' ');

/**
 * Members with an occupation typed but no group yet, grouped by what they
 * typed (letter case and spaces aside), most common first: [{ key, label,
 * ids, count, suggestion }]. `label` is the commonest spelling.
 */
export function unsortedOccupations(members) {
  const byKey = new Map();
  for (const m of members || []) {
    if (m.occupation_group || !text(m.occupation)) continue;
    const key = occupationKey(m.occupation);
    if (!byKey.has(key)) byKey.set(key, { key, ids: [], spellings: new Map() });
    const g = byKey.get(key);
    g.ids.push(m.id);
    const s = text(m.occupation).replace(/[.\s]+$/, '');
    g.spellings.set(s, (g.spellings.get(s) || 0) + 1);
  }
  return [...byKey.values()]
    .map((g) => {
      const label = [...g.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      return { key: g.key, label, ids: g.ids, count: g.ids.length, suggestion: suggestOccupationGroup(label) };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
