import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { participationPoints, sacramentPoints, involvementPoints, practiceLevel, scoreMember, trendText, expectedSacraments } from '../src/lib/practice.js';

const ALL = (v) => ({ mass: v, bible_service: v, devotions: v, meetings: v, pintakasi: v, financial: v });

describe('participationPoints', () => {
  test('Aktibo counts in full, Panagsa half, Wala nothing, out of 60', () => {
    assert.equal(participationPoints(ALL('Aktibo')), 60);
    assert.equal(participationPoints(ALL('Panagsa')), 30);
    assert.equal(participationPoints(ALL('Wala')), 0);
  });
  test('Mass weighs most', () => {
    const massOnly = { ...ALL('Wala'), mass: 'Aktibo' };
    const financialOnly = { ...ALL('Wala'), financial: 'Aktibo' };
    assert.equal(participationPoints(massOnly), 24);
    assert.equal(participationPoints(financialOnly), 7);
  });
  test('scored over the items answered; null with none; unknown keys ignored', () => {
    assert.equal(participationPoints({ mass: 'Aktibo' }), 60);
    assert.equal(participationPoints({}), null);
    assert.equal(participationPoints({ other: 'Aktibo', mass: 'Maybe' }), null);
    assert.equal(participationPoints(null), null);
  });
});

describe('sacramentPoints', () => {
  const sac = (b, c, cf) => ({ has_baptism: b, has_communion: c, has_confirmation: cf });
  test('expects Baptism always, First Communion from 9, Confirmation from 14', () => {
    assert.deepEqual(expectedSacraments(5), ['baptism']);
    assert.deepEqual(expectedSacraments(10), ['baptism', 'communion']);
    assert.deepEqual(expectedSacraments(40), ['baptism', 'communion', 'confirmation']);
    assert.deepEqual(expectedSacraments(null), ['baptism']);
  });
  test('the share of expected sacraments, out of 25', () => {
    assert.equal(sacramentPoints(40, sac(true, true, true)), 25);
    assert.equal(sacramentPoints(40, sac(true, true, false)), 16.7);
    assert.equal(sacramentPoints(10, sac(true, true, false)), 25);
    assert.equal(sacramentPoints(10, sac(false, false, false)), 0);
  });
});

describe('involvementPoints', () => {
  test('15 for any ministry, organization or role', () => {
    assert.equal(involvementPoints({ ministries: ['Lector'] }), 15);
    assert.equal(involvementPoints({ organizations: [], gkk_role: 'Secretary' }), 15);
    assert.equal(involvementPoints({ parish_role: '  ' }), 0);
    assert.equal(involvementPoints({}), 0);
  });
});

describe('practiceLevel', () => {
  test('score bands', () => {
    assert.equal(practiceLevel({ score: 70, participation: 40, age: 30 }), 'Aktibo');
    assert.equal(practiceLevel({ score: 69.9, participation: 40, age: 30 }), 'Panagsa');
    assert.equal(practiceLevel({ score: 40, participation: 20, age: 30 }), 'Panagsa');
    assert.equal(practiceLevel({ score: 39, participation: 0, age: 30 }), 'Dili aktibo');
  });
  test('unrated members', () => {
    assert.equal(practiceLevel({ score: null, participation: null, age: 30 }), 'Wala pa matino');
    assert.equal(practiceLevel({ score: 90, participation: 60, age: 5 }), 'Bata pa');
    assert.equal(practiceLevel({ score: 90, participation: 60, age: 30, religion: 'Islam' }), 'Dili Katoliko');
    assert.equal(practiceLevel({ score: 90, participation: 60, age: 30, isCurrent: false }), null);
  });
});

describe('scoreMember', () => {
  test('adds the three parts', () => {
    const m = { has_baptism: true, has_communion: true, has_confirmation: true, ministries: ['Choir'], religion: 'Roman Catholic' };
    assert.deepEqual(scoreMember(m, ALL('Aktibo'), 35), { participation: 60, sacraments: 25, involvement: 15, score: 100, level: 'Aktibo' });
    const s = scoreMember({ ...m, ministries: [] }, { ...ALL('Wala'), mass: 'Panagsa' }, 35);
    assert.equal(s.score, 37);
    assert.equal(s.level, 'Dili aktibo');
  });
  test('no answers: not yet assessed, no score', () => {
    const s = scoreMember({ has_baptism: true }, {}, 30);
    assert.equal(s.score, null);
    assert.equal(s.level, 'Wala pa matino');
  });
});

describe('trendText', () => {
  test('arrow and rounded change; nothing for no or tiny change', () => {
    assert.equal(trendText(6.2), '↑ 6');
    assert.equal(trendText(-12), '↓ 12');
    assert.equal(trendText(0.2), '');
    assert.equal(trendText(null), '');
  });
});
