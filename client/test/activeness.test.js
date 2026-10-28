import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeActiveness, levelMix, ageGroupOf, activityBreakdown } from '../src/lib/activeness.js';

let id = 1;
const m = (o = {}) => ({
  id: id++, first_name: 'M', last_name: 'T', household_id: 1, household_name: 'T Family', household_gkk: 'GKK A', age: 40,
  practice_level: 'Aktibo', practice_score: 80, practice_participation: 45, practice_sacraments: 25, practice_involvement: 15,
  practice_source: 'census', practice_trend: null, membership_status: null, ...o,
});

describe('levelMix', () => {
  test('shares are of rated members only; unrated are counted apart', () => {
    const mix = levelMix([
      m(), m({ practice_level: 'Aktibo', practice_score: 90 }),
      m({ practice_level: 'Panagsa', practice_score: 50 }),
      m({ practice_level: 'Dili aktibo', practice_score: 20 }),
      m({ practice_level: 'Wala pa matino', practice_score: null }),
      m({ practice_level: 'Bata pa', practice_score: 67 }),
    ]);
    assert.equal(mix.members, 6);
    assert.equal(mix.rated, 4);
    assert.deepEqual([mix.aktiboPct, mix.panagsaPct, mix.diliPct], [50, 25, 25]);
    assert.equal(mix.unassessed, 1);
    assert.equal(mix.avgScore, 60);
  });
  test('no rated members: zero shares and no average', () => {
    const mix = levelMix([m({ practice_level: 'Wala pa matino', practice_score: null })]);
    assert.equal(mix.rated, 0);
    assert.equal(mix.avgScore, null);
    assert.equal(mix.aktiboPct, 0);
  });
});

describe('ageGroupOf', () => {
  test('groups from 9 up; children of 8 and under (Bata pa) and unknown ages are left out', () => {
    assert.equal(ageGroupOf(8), null);
    assert.equal(ageGroupOf(9), 'youth');
    assert.equal(ageGroupOf(39), 'young');
    assert.equal(ageGroupOf(40), 'middle');
    assert.equal(ageGroupOf(75), 'senior');
    assert.equal(ageGroupOf(null), null);
  });
});

describe('activityBreakdown', () => {
  test('tallies each activity over the members who answered it', () => {
    const members = [m(), m(), m()];
    const answers = [{ mass: 'Aktibo', pintakasi: 'Wala' }, { mass: 'Panagsa', pintakasi: 'Wala' }, { mass: 'Aktibo' }];
    const rows = activityBreakdown(members, (x) => answers[members.indexOf(x)]);
    const mass = rows.find((r) => r.key === 'mass');
    assert.deepEqual([mass.answered, mass.Aktibo, mass.Panagsa, mass.aktiboPct], [3, 2, 1, 67]);
    const pintakasi = rows.find((r) => r.key === 'pintakasi');
    assert.deepEqual([pintakasi.answered, pintakasi.walaPct], [2, 100]);
    assert.equal(rows.find((r) => r.key === 'financial').answered, 0);
  });
});

describe('analyzeActiveness', () => {
  const members = [
    ...[1, 2, 3].map(() => m({ household_gkk: 'GKK A', practice_score: 85 })),
    ...[1, 2, 3].map(() => m({ household_gkk: 'GKK B', practice_level: 'Dili aktibo', practice_score: 25, practice_involvement: 0, practice_participation: 20, contact: '0917' })),
    m({ household_gkk: 'GKK B', practice_level: 'Panagsa', practice_score: 55, practice_trend: 10, practice_source: 'household' }),
    m({ household_gkk: 'GKK A', practice_level: 'Aktibo', practice_score: 75, practice_trend: -8, membership_status: 'Inactive' }),
    m({ household_gkk: 'GKK B', practice_level: 'Dili aktibo', practice_score: 10, practice_involvement: 0, membership_status: 'Active' }),
    m({ age: 4, practice_level: 'Bata pa' }),
  ];
  const a = analyzeActiveness(members, () => ({ mass: 'Aktibo' }));

  test('summary counts', () => {
    assert.equal(a.summary.members, 10);
    assert.equal(a.summary.rated, 9);
    assert.equal(a.summary.children, 1);
    assert.equal(a.summary.estimated, 1);
  });

  test('GKKs come weakest first', () => {
    assert.deepEqual(a.byGkk.map((g) => g.gkk), ['GKK B', 'GKK A']);
    assert.equal(a.byGkk[1].aktiboPct, 100);
  });

  test('follow-up is the Dili aktibo members, least active first', () => {
    assert.equal(a.followUp.length, 4);
    assert.equal(a.followUp[0].practice_score, 10);
  });

  test('mismatches: Active but Dili aktibo, Inactive but Aktibo', () => {
    assert.equal(a.mismatches.length, 2);
  });

  test('trend counts members compared across two censuses', () => {
    assert.deepEqual([a.trend.compared, a.trend.improved, a.trend.declined, a.trend.same], [2, 1, 1, 0]);
  });

  test('findings name the most and least active GKK and the weakest part', () => {
    const text = a.findings.join(' ');
    assert.match(a.findings[0], /% of the 9 rated member\(s\) are Aktibo/);
    assert.match(text, /GKK A is the most active GKK/);
    assert.match(text, /GKK B needs the most attention/);
    assert.match(text, /Involvement is the weakest part/);
    assert.match(text, /2 member\(s\) have a census status that disagrees/);
  });

  test('Mass and the least attended other activity', () => {
    const b = analyzeActiveness([m(), m(), m()], () => ({ mass: 'Aktibo', meetings: 'Wala', financial: 'Panagsa' }));
    assert.ok(b.findings.some((f) => /100% attend Mass regularly \(Aktibo\); the least attended other activity is Meetings/.test(f)));
    const massOnly = analyzeActiveness([m()], () => ({ mass: 'Aktibo' }));
    assert.ok(massOnly.findings.some((f) => f === '100% attend Mass regularly (Aktibo).'));
  });

  test('finding cards: one per finding, with a chart kind, a tone and the same sentence', () => {
    assert.equal(a.cards.length, a.findings.length);
    assert.deepEqual(a.cards.map((c) => c.text), a.findings);
    const byKey = Object.fromEntries(a.cards.map((c) => [c.key, c]));
    assert.equal(byKey.overview.kind, 'overview');
    assert.equal(byKey.overview.mix.aktibo + byKey.overview.mix.panagsa + byKey.overview.mix.dili, 9);
    assert.deepEqual([byKey.gkk.high.name, byKey.gkk.low.name], ['GKK A', 'GKK B']);
    assert.equal(byKey.gkk.tone, 'bad'); // GKK B averages below 40%
    assert.equal(byKey.parts.weakest, 'involvement');
    assert.deepEqual([byKey.trend.improved, byKey.trend.declined, byKey.trend.tone], [1, 1, 'info']);
    assert.deepEqual(a.cards.filter((c) => c.kind === 'note').map((c) => c.key), ['estimated', 'mismatches']);
    for (const c of a.cards) assert.ok(['good', 'warn', 'bad', 'info'].includes(c.tone), c.key);
  });

  test('nobody rated: a single explanatory finding', () => {
    const none = analyzeActiveness([m({ practice_level: 'Wala pa matino', practice_score: null })]);
    assert.equal(none.findings.length, 1);
    assert.match(none.findings[0], /can be scored yet/);
  });
});
