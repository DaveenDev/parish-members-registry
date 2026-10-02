// Membership Activeness analysis (Reports → Analysis Report): how active the
// parish's members are, built on each member's Practicing Catholic status
// (0017_practicing_status.sql, lib/practice.js). Pure functions over the rows
// api.activenessData() loads, so the whole report is easy to test.

import { PARTICIPATION_ITEMS } from '../constants.js';
import { cleanParticipation } from './census.js';
import { PRACTICE_MAX, RATED_LEVELS } from './practice.js';

export const AGE_GROUPS = [
  ['youth', '7–17', 7, 17],
  ['young', '18–39', 18, 39],
  ['middle', '40–59', 40, 59],
  ['senior', '60 and over', 60, 200],
];

// A GKK or age group needs this many rated members before it's singled out as best or weakest.
const MIN_GROUP = 3;

const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);
const avg = (xs) => (xs.length ? Math.round((10 * xs.reduce((s, x) => s + x, 0)) / xs.length) / 10 : null);
const rated = (m) => RATED_LEVELS.includes(m.practice_level);

/** Counts and shares of the three rated levels among `members`, plus the average score. */
export function levelMix(members) {
  const r = members.filter(rated);
  const n = (level) => r.filter((m) => m.practice_level === level).length;
  const aktibo = n('Aktibo');
  const panagsa = n('Panagsa');
  const dili = n('Dili aktibo');
  return {
    members: members.length,
    rated: r.length,
    aktibo, panagsa, dili,
    aktiboPct: pct(aktibo, r.length),
    panagsaPct: pct(panagsa, r.length),
    diliPct: pct(dili, r.length),
    unassessed: members.filter((m) => m.practice_level === 'Wala pa matino').length,
    avgScore: avg(r.map((m) => Number(m.practice_score) || 0)),
  };
}

/** Which age group a member falls in, or null (unknown age, or under 7). */
export function ageGroupOf(age) {
  if (age == null) return null;
  const g = AGE_GROUPS.find(([, , lo, hi]) => age >= lo && age <= hi);
  return g ? g[0] : null;
}

/** The six participation items: how many members answered Aktibo / Panagsa / Wala for each. */
export function activityBreakdown(members, answersFor) {
  return PARTICIPATION_ITEMS.map(([key, label]) => {
    const tally = { Aktibo: 0, Panagsa: 0, Wala: 0 };
    for (const m of members) {
      const v = cleanParticipation(answersFor(m))[key];
      if (v) tally[v] += 1;
    }
    const answered = tally.Aktibo + tally.Panagsa + tally.Wala;
    return { key, label, answered, ...tally, aktiboPct: pct(tally.Aktibo, answered), panagsaPct: pct(tally.Panagsa, answered), walaPct: pct(tally.Wala, answered) };
  });
}

/**
 * The full analysis. `members` are current members from members_with_household
 * (with the practice_* columns); `answersFor(member)` gives the participation
 * answers behind their score (their latest census answers, or the household's
 * survey). Returns every section the report shows.
 */
export function analyzeActiveness(members, answersFor = () => ({})) {
  const ratedMembers = members.filter(rated);
  const summary = {
    ...levelMix(members),
    children: members.filter((m) => m.practice_level === 'Bata pa').length,
    otherReligion: members.filter((m) => m.practice_level === 'Dili Katoliko').length,
    estimated: ratedMembers.filter((m) => m.practice_source === 'household').length,
    ownAnswers: ratedMembers.filter((m) => m.practice_source === 'census').length,
  };

  // By GKK, weakest average first so the places needing attention lead.
  const gkkNames = [...new Set(members.map((m) => m.household_gkk || null))];
  const byGkk = gkkNames
    .map((g) => ({ gkk: g, ...levelMix(members.filter((m) => (m.household_gkk || null) === g)) }))
    .sort((a, b) => (a.avgScore ?? 999) - (b.avgScore ?? 999) || String(a.gkk).localeCompare(String(b.gkk)));

  const byAge = AGE_GROUPS.map(([key, label]) => ({ key, label, ...levelMix(members.filter((m) => ageGroupOf(m.age) === key)) }));

  // The three parts of the score, as a share of their maximum.
  const parts = [
    ['participation', 'Participation', 'Mass, devotions, meetings and support (own census answers or the household survey)'],
    ['sacraments', 'Sacraments for their age', 'Baptism; First Communion from 9; Confirmation from 14'],
    ['involvement', 'Involvement', 'A ministry, organization, or GKK / parish role'],
  ].map(([key, label, note]) => {
    const values = ratedMembers.map((m) => Number(m[`practice_${key}`]) || 0);
    const average = avg(values);
    return { key, label, note, max: PRACTICE_MAX[key], average, sharePct: average == null ? 0 : pct(average, PRACTICE_MAX[key]) };
  });
  const involvedPct = pct(ratedMembers.filter((m) => Number(m.practice_involvement) > 0).length, ratedMembers.length);

  const activities = activityBreakdown(ratedMembers, answersFor);

  const withTrend = ratedMembers.filter((m) => m.practice_trend != null);
  const trend = {
    compared: withTrend.length,
    improved: withTrend.filter((m) => m.practice_trend >= 0.5).length,
    declined: withTrend.filter((m) => m.practice_trend <= -0.5).length,
  };
  trend.same = trend.compared - trend.improved - trend.declined;

  // Where the census status staff chose and the score disagree.
  const mismatches = ratedMembers.filter((m) => (m.membership_status === 'Active' && m.practice_level === 'Dili aktibo')
    || (m.membership_status === 'Inactive' && m.practice_level === 'Aktibo'));

  // Pastoral follow-up: the least active first.
  const followUp = ratedMembers
    .filter((m) => m.practice_level === 'Dili aktibo')
    .sort((a, b) => (Number(a.practice_score) || 0) - (Number(b.practice_score) || 0));

  return { summary, byGkk, byAge, parts, involvedPct, activities, trend, mismatches, followUp, findings: keyFindings({ summary, byGkk, byAge, parts, involvedPct, activities, trend, mismatches }) };
}

/** Plain-language findings, most important first. */
export function keyFindings({ summary, byGkk, byAge, parts, involvedPct, activities, trend, mismatches }) {
  const out = [];
  if (!summary.rated) {
    out.push(summary.members
      ? `None of the ${summary.members} member(s) in scope can be scored yet: they have no participation answers. Recording a census will give each member their own.`
      : 'There are no current members in this scope.');
    return out;
  }
  out.push(`${summary.aktiboPct}% of the ${summary.rated} rated member(s) are Aktibo, ${summary.panagsaPct}% Panagsa and ${summary.diliPct}% Dili aktibo; the average score is ${Math.round(summary.avgScore)}%.`);

  const gkks = byGkk.filter((g) => g.rated >= MIN_GROUP && g.gkk);
  if (gkks.length >= 2) {
    const low = gkks[0];
    const high = gkks[gkks.length - 1];
    out.push(`${high.gkk} is the most active GKK (average ${Math.round(high.avgScore)}%, ${high.aktiboPct}% Aktibo); ${low.gkk} needs the most attention (average ${Math.round(low.avgScore)}%, ${low.diliPct}% Dili aktibo).`);
  }

  const weakest = [...parts].sort((a, b) => a.sharePct - b.sharePct)[0];
  if (weakest.key === 'involvement') out.push(`Involvement is the weakest part of the score: only ${involvedPct}% of rated members serve in a ministry, organization or role.`);
  else if (weakest.key === 'sacraments') out.push(`Sacraments are the weakest part of the score (${weakest.sharePct}% of the expected sacraments recorded). Some may simply not be recorded yet; catechesis for First Communion and Confirmation may help.`);
  else out.push(`Participation is the weakest part of the score (${weakest.sharePct}% of the possible points).`);

  const answered = activities.filter((a) => a.answered);
  const mass = answered.find((a) => a.key === 'mass');
  const others = answered.filter((a) => a.key !== 'mass');
  const lowest = [...others].sort((a, b) => a.aktiboPct - b.aktiboPct)[0];
  if (mass && lowest) out.push(`${mass.aktiboPct}% attend Mass regularly (Aktibo); the least attended other activity is ${lowest.label} (${lowest.aktiboPct}% Aktibo, ${lowest.walaPct}% Wala).`);
  else if (mass) out.push(`${mass.aktiboPct}% attend Mass regularly (Aktibo).`);
  else if (lowest) out.push(`The least attended activity is ${lowest.label} (${lowest.aktiboPct}% Aktibo).`);

  const ages = byAge.filter((a) => a.rated >= MIN_GROUP);
  if (ages.length >= 2) {
    const lowAge = [...ages].sort((a, b) => a.avgScore - b.avgScore)[0];
    out.push(`By age, the ${lowAge.label} group is the least active (average ${Math.round(lowAge.avgScore)}%).`);
  }

  if (trend.compared) out.push(`Since the census before, ${trend.improved} member(s) became more active and ${trend.declined} less active (${trend.compared} compared).`);
  if (summary.estimated) out.push(`${summary.estimated} score(s) are estimates from the household's registration survey; their own census answers will make them exact.`);
  if (summary.unassessed) out.push(`${summary.unassessed} member(s) have no participation answers yet and aren't counted above.`);
  if (mismatches.length) out.push(`${mismatches.length} member(s) have a census status that disagrees with their score — worth a second look.`);
  return out;
}
