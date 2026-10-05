import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { sacramentProgressRows, turnaroundRows, registrationsByMonth, monthName, familiesByGkkRows } from '../src/lib/reports.js';

describe('sacramentProgressRows', () => {
  test('counts claims and verifications per GKK, with No GKK last', () => {
    const rows = sacramentProgressRows([
      { household_gkk: 'GKK B', has_baptism: true, baptism_verified: true, has_communion: true },
      { household_gkk: 'GKK B', has_baptism: true },
      { household_gkk: null, has_confirmation: true },
      { household_gkk: 'GKK A' },
    ]);
    assert.deepEqual(rows.map((r) => r.label), ['GKK A', 'GKK B', 'No GKK']);
    const b = rows[1];
    assert.deepEqual([b.members, b.baptism.claimed, b.baptism.verified, b.communion.claimed, b.waiting], [2, 2, 1, 1, 2]);
    assert.equal(rows[2].waiting, 1);
  });
});

describe('turnaroundRows', () => {
  const day = (n) => new Date(Date.UTC(2026, 8, n)).toISOString();
  const reqs = [
    { cert_type: 'baptism', created_at: day(1), released_at: day(3), status: 'Released' },
    { cert_type: 'baptism', created_at: day(2), released_at: day(8), status: 'Released' },
    { cert_type: 'baptism', created_at: day(5), status: 'Received' },
    { cert_type: 'baptism', created_at: day(6), status: 'Cannot issue' },
    { cert_type: 'marriage', created_at: day(20), status: 'Being prepared' },
  ];

  test('average and longest days to release, and open requests', () => {
    const [b, m] = turnaroundRows(reqs, { now: Date.UTC(2026, 8, 25) });
    assert.deepEqual([b.received, b.released, b.avgDays, b.maxDays, b.open, b.oldestOpen], [4, 2, 4, 6, 1, 20]);
    assert.deepEqual([m.received, m.released, m.avgDays, m.open], [1, 0, null, 1]);
  });

  test('only requests received in the date range count', () => {
    const rows = turnaroundRows(reqs, { dateFrom: '2026-09-10', now: Date.UTC(2026, 8, 25) });
    assert.deepEqual(rows.map((r) => r.label), ['marriage']);
  });
});

test('registrationsByMonth groups by month, oldest first', () => {
  const rows = registrationsByMonth([
    { created_at: '2026-03-15T08:00:00', member_count: 4, status: 'Verified' },
    { created_at: '2026-01-02T08:00:00', member_count: 2, status: 'Pending' },
    { created_at: '2026-03-01T08:00:00', member_count: 3, status: 'Pending' },
  ]);
  assert.deepEqual(rows, [
    { month: '2026-01', households: 1, members: 2, verified: 0 },
    { month: '2026-03', households: 2, members: 7, verified: 1 },
  ]);
  assert.equal(monthName('2026-03'), 'March 2026');
});

describe('familiesByGkkRows', () => {
  test('counts households, families and houses with 2+ families per GKK, with No GKK last', () => {
    const rows = familiesByGkkRows([
      { gkk: 'GKK B', family_count: 2, member_count: 7 },
      { gkk: 'GKK B', family_count: 1, member_count: 3 },
      { gkk: null, family_count: null, member_count: 2 },
      { gkk: 'GKK A', family_count: 3, member_count: 9 },
    ]);
    assert.deepEqual(rows.map((r) => [r.label, r.households, r.families, r.multi, r.members]), [
      ['GKK A', 1, 3, 1, 9],
      ['GKK B', 2, 3, 1, 10],
      ['No GKK', 1, 1, 0, 2],
    ]);
  });
});
