// Practicing Catholic status: the same rules as the practice_* functions in
// supabase/migrations/0017_practicing_status.sql — keep the two in sync. The
// database works out each member's current score (so the Members list can
// filter and sort on it); this copy scores past census answers for a
// member's history and explains the parts.

import { cleanParticipation } from './census.js';

/** Points for each participation item, out of 60 in all. Mass weighs most. */
export const PARTICIPATION_WEIGHTS = { mass: 24, bible_service: 8, devotions: 7, meetings: 7, pintakasi: 7, financial: 7 };
const ANSWER_SHARE = { Aktibo: 1, Panagsa: 0.5, Wala: 0 };

export const PRACTICE_MAX = { participation: 60, sacraments: 25, involvement: 15 };

/** Levels, best first, then the unrated ones. */
export const PRACTICE_LEVELS = ['Aktibo', 'Panagsa', 'Dili aktibo', 'Wala pa matino', 'Bata pa', 'Dili Katoliko'];
export const RATED_LEVELS = ['Aktibo', 'Panagsa', 'Dili aktibo'];

export const PRACTICE_TONES = {
  Aktibo: 'green',
  Panagsa: 'gold',
  'Dili aktibo': 'red',
  'Wala pa matino': 'gray',
  'Bata pa': 'blue',
  'Dili Katoliko': 'gray',
};

/** What each level means, for tooltips and the filter. */
export const PRACTICE_LEVEL_HELP = {
  Aktibo: 'Score 70 or more',
  Panagsa: 'Score 40–69',
  'Dili aktibo': 'Score below 40',
  'Wala pa matino': 'No participation answers yet',
  'Bata pa': 'Under 7, not rated',
  'Dili Katoliko': 'Another religion, not rated',
};

const round1 = (n) => Math.round(n * 10) / 10;

/** Participation points out of 60 over the items answered, or null with no answers. */
export function participationPoints(p) {
  const answers = Object.entries(cleanParticipation(p));
  if (!answers.length) return null;
  const weight = answers.reduce((s, [k]) => s + PARTICIPATION_WEIGHTS[k], 0);
  const got = answers.reduce((s, [k, v]) => s + PARTICIPATION_WEIGHTS[k] * ANSWER_SHARE[v], 0);
  return round1((60 * got) / weight);
}

/** The sacraments expected at this age: Baptism always, First Communion from 9, Confirmation from 14. */
export function expectedSacraments(age) {
  const a = age ?? 0;
  return ['baptism', ...(a >= 9 ? ['communion'] : []), ...(a >= 14 ? ['confirmation'] : [])];
}

/** Sacrament points out of 25: the share of the expected sacraments received. */
export function sacramentPoints(age, { has_baptism, has_communion, has_confirmation }) {
  const have = { baptism: has_baptism, communion: has_communion, confirmation: has_confirmation };
  const expected = expectedSacraments(age);
  return round1((25 * expected.filter((s) => have[s]).length) / expected.length);
}

/** 15 for any ministry, organization, GKK role or parish role, else 0. */
export function involvementPoints(m) {
  const any = (m.ministries || []).length || (m.organizations || []).length || String(m.gkk_role || '').trim() || String(m.parish_role || '').trim();
  return any ? 15 : 0;
}

/** The level from a score; null for members no longer on the roster. */
export function practiceLevel({ score, participation, age, religion, isCurrent = true }) {
  if (!isCurrent) return null;
  if ((String(religion || '').trim() || 'Roman Catholic') !== 'Roman Catholic') return 'Dili Katoliko';
  if (age != null && age < 7) return 'Bata pa';
  if (participation == null) return 'Wala pa matino';
  if (score >= 70) return 'Aktibo';
  if (score >= 40) return 'Panagsa';
  return 'Dili aktibo';
}

/**
 * A member's score from a set of participation answers (theirs from a census,
 * or the household's): { participation, sacraments, involvement, score, level }.
 */
export function scoreMember(m, participationAnswers, age = m.age ?? null) {
  const participation = participationPoints(participationAnswers);
  const sacraments = sacramentPoints(age, m);
  const involvement = involvementPoints(m);
  const score = participation == null ? null : round1(participation + sacraments + involvement);
  const isCurrent = !['Moved away', 'Deceased'].includes(m.membership_status);
  return { participation, sacraments, involvement, score, level: practiceLevel({ score, participation, age, religion: m.religion, isCurrent }) };
}

/** Whether a level has a score worth showing. */
export const isRated = (level) => RATED_LEVELS.includes(level);

/** "↑ 6", "↓ 12" or '' for a change in score since the census before. */
export function trendText(trend) {
  if (trend == null || Math.abs(trend) < 0.5) return '';
  return `${trend > 0 ? '↑' : '↓'} ${Math.round(Math.abs(trend))}`;
}

/** Where a member's score comes from, in a sentence. */
export function practiceSourceText(m) {
  if (m.practice_source === 'census') return `From their own answers in the ${m.practice_source_label || 'latest census'}`;
  if (m.practice_source === 'household') return "From the household's registration survey (an estimate until their first census)";
  return 'No participation answers yet';
}
