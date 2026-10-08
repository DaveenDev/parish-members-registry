import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { shapeDashboard, shapeReport, multiFamilyNote } from '../src/lib/stats.js';

describe('shapeDashboard', () => {
  const raw = {
    households: 1500, verified: 1000, pending: 500, members: 3200, gkks: 4, active: 2800, inactive: 300, unassessed: 100,
    reg_months: [{ month: '2026-05', n: 0 }, { month: '2026-06', n: 50 }, { month: '2026-10', n: 100 }],
    age_buckets: [{ label: '0-9', n: 10 }, { label: '10-19', n: 40 }],
    by_gkk: [{ label: 'GKK Sto. Niño', n: 20 }, { label: 'GKK San Isidro', n: 10 }],
    top_groups: [{ label: 'Choir', n: 8 }, { label: 'CFC', n: 2 }],
    sacraments: { baptism: 3000, communion: 2000, confirmation: 1000, matrimony: 500 },
    duplicate_groups: 3,
  };

  test('stat cards carry the totals and link to filtered lists', () => {
    const { statCards } = shapeDashboard(raw);
    const byLabel = Object.fromEntries(statCards.map((c) => [c.label, c]));
    assert.equal(byLabel.Households.value, 1500);
    assert.equal(byLabel.Households.note, '1000 verified · 500 pending');
    assert.equal(byLabel.Members.value, 3200);
    assert.equal(byLabel.Pending.to, '/admin/households?status=Pending');
    assert.equal(byLabel.Verified.to, '/admin/households?status=Verified');
  });

  test('the census card counts active members and links to them', () => {
    const card = shapeDashboard(raw).statCards.find((c) => c.label === 'Active Catholics');
    assert.equal(card.value, 2800);
    assert.equal(card.note, '300 inactive · 100 not yet assessed');
    assert.equal(card.to, '/admin/members?membership=Active');
  });

  test('month labels and bar heights (tallest 100%, none under 6%)', () => {
    const { regMonths } = shapeDashboard(raw);
    assert.deepEqual(regMonths.map((m) => m.label), ['May', 'Jun', 'Oct']);
    assert.deepEqual(regMonths.map((m) => m.h), ['6%', '50%', '100%']);
  });

  test('breakdown widths are relative to the largest, GKK bars link to households', () => {
    const { gkkBreak, ministryBreak } = shapeDashboard(raw);
    assert.deepEqual(gkkBreak.map((g) => g.w), ['100%', '50%']);
    assert.equal(gkkBreak[0].to, '/admin/households?status=All&gkk=GKK%20Sto.%20Ni%C3%B1o');
    assert.deepEqual(ministryBreak.map((g) => g.w), ['100%', '25%']);
  });

  test('age bars and top ministry rows link to the filtered members list', () => {
    const { ageBuckets, ministryBreak } = shapeDashboard({
      ...raw,
      age_buckets: [{ label: '0-9', n: 10 }, { label: '65+', n: 4 }, { label: 'odd', n: 1 }],
    });
    assert.deepEqual(ageBuckets.map((b) => b.to), ['/admin/members?age=0-9', '/admin/members?age=65-200', null]);
    assert.equal(ministryBreak[0].to, '/admin/members?ministry=Choir');
  });

  test('sacrament tiles and the action counts', () => {
    const d = shapeDashboard(raw);
    assert.deepEqual(d.sacStats.map((s) => s.n), [3000, 2000, 1000, 500]);
    assert.equal(d.sacStats[0].to, '/admin/sacraments?baptism=Yes');
    assert.equal(d.pendingCount, 500);
    assert.equal(d.duplicateGroups, 3);
  });

  test('an empty registry shapes without dividing by zero', () => {
    const d = shapeDashboard({});
    assert.equal(d.statCards[0].value, 0);
    assert.deepEqual(d.regMonths, []);
    assert.equal(d.duplicateGroups, 0);
  });
});

describe('shapeReport', () => {
  const raw = {
    households: 10, verified: 6, pending: 4, members: 40,
    by_gkk: [{ label: 'GKK A', verified: 3, pending: 1 }],
    sacraments: { baptism: 30, communion: 20, confirmation: 10, matrimony: 0 },
    participation: [{ label: 'Choir', n: 10 }, { label: 'CFC', n: 4 }],
    any_group: 12,
    blood: { 'O+': 5, 'A-': 2 },
    blood_unknown: 33,
  };

  test('totals and per-GKK split', () => {
    const r = shapeReport(raw);
    assert.equal(r.totalHH, 10);
    assert.equal(r.totalMembers, 40);
    assert.deepEqual(r.regByGkk[0], { label: 'GKK A', verified: 3, pending: 1, vw: '75%', pw: '25%' });
    assert.deepEqual(r.gkkNames, ['GKK A']);
  });

  test('sacrament completion and participation are shares of all members', () => {
    const r = shapeReport(raw);
    assert.deepEqual(r.sacCompletion[0], { label: 'Baptism', n: 30, missing: 10, of: 40, w: '75%' });
    assert.equal(r.participation[0].w, '25%');
    assert.equal(r.anyVolunteer, 30);
  });

  test('with 0070, sacraments count against members old enough for them', () => {
    const r = shapeReport({
      ...raw,
      sacrament_eligible: { baptism: 40, communion: 30, confirmation: 30, matrimony: 20 },
      sacrament_missing: { baptism: 10, communion: 12, confirmation: 15, matrimony: 15 },
    });
    assert.deepEqual(r.sacCompletion[2], { label: 'Confirmation', n: raw.sacraments.confirmation, missing: 15, of: 30, w: '50%' });
  });

  test('blood counts come out in the usual order, skipping types nobody has', () => {
    const r = shapeReport(raw);
    assert.deepEqual(r.bloodCounts, [{ label: 'A-', n: 2 }, { label: 'O+', n: 5 }]);
    assert.equal(r.unknownBlood, 33);
  });

  test('no members means 0%, not NaN', () => {
    assert.equal(shapeReport({}).anyVolunteer, 0);
  });
});

describe('family figures (0054)', () => {
  const family_stats = { families: 14, multi_family_households: 3, by_gkk: [{ label: 'GKK A', households: 4, families: 6, multi: 2 }] };

  test('the Dashboard gets a Families card after Households, opening the Families reports', () => {
    const cards = shapeDashboard({ households: 11, family_stats }).statCards;
    assert.deepEqual(cards.slice(0, 2).map((c) => c.label), ['Households', 'Families']);
    assert.equal(cards[1].value, 14);
    assert.equal(cards[1].note, '3 houses with 2+ families');
    assert.equal(cards[1].to, '/admin/reports?tab=gen&source=Families');
  });

  test('no Families card before the migration', () => {
    assert.equal(shapeDashboard({}).statCards.some((c) => c.label === 'Families'), false);
  });

  test('Reports get the totals and each GKK\'s families', () => {
    const r = shapeReport({ households: 11, by_gkk: [{ label: 'GKK A', verified: 3, pending: 1 }, { label: 'GKK B', verified: 1, pending: 0 }], family_stats });
    assert.equal(r.totalFamilies, 14);
    assert.equal(r.multiFamilyHouseholds, 3);
    assert.deepEqual([r.regByGkk[0].families, r.regByGkk[0].multi], [6, 2]);
    assert.deepEqual([r.regByGkk[1].families, r.regByGkk[1].multi], [0, 0]);
    assert.equal(shapeReport({}).totalFamilies, null);
  });

  test('multiFamilyNote', () => {
    assert.equal(multiFamilyNote(0), 'one family in each household');
    assert.equal(multiFamilyNote(1), '1 house with 2+ families');
  });
});
