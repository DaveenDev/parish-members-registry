// OFW (Overseas Filipino Worker) details and occupation groups on members
// (0121_member_ofw.sql). Pure helpers shared by the forms, lists and reports.
//
// A member's OFW answer is ofw_status ('Abroad' now, 'Returned' back home,
// null = not an OFW), the country, the year the current (or last) contract
// started and, back home, the year they came home. An OFW household has a
// current member abroad now (households_with_count.ofw_abroad_count).

import {
  OCCUPATION_GROUPS, OCCUPATION_GROUP_HINTS, OFW_STATUSES, OFW_COUNTRIES, OFW_OTHER_COUNTRY, SEA_BASED_GROUP,
} from '../constants.js';
import { OCCUPATION_GROUP_LABELS, OFW_COUNTRY_LABELS } from './bisaya.js';

export const FIRST_OFW_YEAR = 1950;
/** The latest year a form takes: next year (a contract about to start). */
export const lastOfwYear = (today = new Date()) => today.getFullYear() + 1;

const text = (v) => String(v ?? '').trim();

/** An occupation group as the staff pages name it ("Professional (doctor, engineer, lawyer…)"). */
export const occupationGroupLabel = (g) => OCCUPATION_GROUP_HINTS[g] || g || '';
/** …and as the public forms do, in Bisaya. */
export const occupationGroupBis = (g) => OCCUPATION_GROUP_LABELS[g] || g || '';
export const isOccupationGroup = (g) => OCCUPATION_GROUPS.includes(g);

/** Sea-based (seafarers) or land-based (everyone else). */
export const ofwBase = (group) => (group === SEA_BASED_GROUP ? 'Sea-based' : 'Land-based');

/** The country's pick on the form: one of OFW_COUNTRIES, "Other" for a typed name, '' for none. */
export function countryChoice(country) {
  const c = text(country);
  if (!c) return '';
  return OFW_COUNTRIES.includes(c) ? c : OFW_OTHER_COUNTRY;
}
export const countryBis = (c) => OFW_COUNTRY_LABELS[c] || c;

/**
 * The OFW answer of a stored member row (snake_case), tidied: { status,
 * country, since, returned } with numbers for the years, or null when they
 * aren't an OFW.
 */
export function ofwOf(m) {
  const status = OFW_STATUSES.includes(m?.ofw_status) ? m.ofw_status : null;
  if (!status) return null;
  const year = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  return {
    status,
    country: text(m.ofw_country) || null,
    since: year(m.ofw_since),
    returned: status === 'Returned' ? year(m.ofw_returned) : null,
  };
}

/** "OFW · Saudi Arabia since 2019", "Former OFW (Qatar, 2015–2022)", or '' (staff pages). */
export function ofwLine(m) {
  const o = ofwOf(m);
  if (!o) return '';
  if (o.status === 'Abroad') {
    return ['OFW', [o.country, o.since && `since ${o.since}`].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  }
  const years = o.since && o.returned ? `${o.since}–${o.returned}` : o.returned ? `back ${o.returned}` : o.since ? `from ${o.since}` : '';
  const inside = [o.country, years].filter(Boolean).join(', ');
  return inside ? `Former OFW (${inside})` : 'Former OFW';
}

/** The same in Bisaya, for the public forms: "OFW · Qatar sukad 2019", "Kanhi OFW (Qatar, 2015–2022)". */
export function ofwLineBis(m) {
  const o = ofwOf(m);
  if (!o) return '';
  const country = o.country && countryBis(o.country);
  if (o.status === 'Abroad') return ['OFW', [country, o.since && `sukad ${o.since}`].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  const years = o.since && o.returned ? `${o.since}–${o.returned}` : o.returned ? `nakauli ${o.returned}` : o.since ? `sukad ${o.since}` : '';
  const inside = [country, years].filter(Boolean).join(', ');
  return inside ? `Kanhi OFW (${inside})` : 'Kanhi OFW';
}

/** A form's member (blankMember() keys) as a stored row's OFW columns, for ofwLine(). */
export const ofwFromForm = (m) => ({
  ofw_status: m.ofwStatus, ofw_country: m.ofwCountry, ofw_since: m.ofwSince, ofw_returned: m.ofwReturned,
});

/**
 * What's wrong with the years of an OFW answer, by field ({ since, returned }),
 * in English or Bisaya. Empty when there's nothing to fix.
 */
export function ofwYearErrors({ status, since, returned }, { lang = 'en', today = new Date() } = {}) {
  const out = {};
  if (!status) return out;
  const last = lastOfwYear(today);
  const bad = (v) => text(v) && !(/^\d{4}$/.test(text(v)) && Number(v) >= FIRST_OFW_YEAR && Number(v) <= last);
  const msg = lang === 'bis'
    ? { year: `Isulat ang tuig, ${FIRST_OFW_YEAR} hangtod ${last}`, order: 'Dili mahimong una sa pagsugod sa kontrata' }
    : { year: `Enter a year from ${FIRST_OFW_YEAR} to ${last}`, order: "Can't be before the contract started" };
  if (bad(since)) out.since = msg.year;
  if (status === 'Returned') {
    if (bad(returned)) out.returned = msg.year;
    else if (text(returned) && text(since) && !out.since && Number(returned) < Number(since)) out.returned = msg.order;
  }
  return out;
}

/**
 * A stored member's OFW columns as the member window saves them: "not an
 * OFW" clears the rest, abroad now clears the year home, years as numbers.
 * (members_ofw_tidy() does the same in the database.)
 */
export function ofwPatch(m) {
  const status = OFW_STATUSES.includes(m.ofw_status) ? m.ofw_status : null;
  const year = (v) => (text(v) ? Number(text(v)) : null);
  return {
    occupation_group: isOccupationGroup(m.occupation_group) ? m.occupation_group : null,
    ofw_status: status,
    ofw_country: status ? text(m.ofw_country).slice(0, 60) || null : null,
    ofw_since: status ? year(m.ofw_since) : null,
    ofw_returned: status === 'Returned' ? year(m.ofw_returned) : null,
  };
}

// ---- Sort occupations (Reports) ------------------------------------------------------

// Words in a typed occupation that suggest its group, English and Bisaya.
// Only a suggestion: the secretary picks the group with a click.
const KEYWORDS = [
  ['Seafarer', /\b(seaman|seafarer|seamen|marino|sea ?based|ship|barko|cruise)\b/],
  ['Household service or caregiver', /\b(caregiver|care ?giver|kasambahay|katabang|helper|housemaid|maid|yaya|nanny|domestic|dh)\b/],
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
    const s = text(m.occupation);
    g.spellings.set(s, (g.spellings.get(s) || 0) + 1);
  }
  return [...byKey.values()]
    .map((g) => {
      const label = [...g.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
      return { key: g.key, label, ids: g.ids, count: g.ids.length, suggestion: suggestOccupationGroup(label) };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
