import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { filterCounts, filterStaff, staffText, sortStaff, gkkCoverage, bulkLeaderEntries, STAFF_CSV_COLUMNS } from '../src/lib/staff.js';

const acct = (over) => ({ id: over.email, name: '', email: 'x@x.test', role: '', is_admin: false, access: 'full', access_gkk_id: null, access_gkk: null, disabled: false, last_sign_in_at: '2026-10-01T00:00:00Z', ...over });
const staff = [
  acct({ name: 'Dave', email: 'dave@x.test', is_admin: true }),
  acct({ name: 'Ana', email: 'ana@x.test', access: 'gkk_leader', access_gkk_id: 2, access_gkk: 'GKK San Jose' }),
  acct({ name: 'Ben', email: 'ben@x.test', access: 'gkk_leader', access_gkk_id: 1, access_gkk: 'GKK Birhen', last_sign_in_at: null }),
  acct({ name: 'Cora', email: 'cora@x.test', access: 'gkk_leader', access_gkk_id: 3, access_gkk: 'GKK San Roque', disabled: true }),
  acct({ name: 'Web', email: 'web@x.test', access: 'website', last_sign_in_at: '2026-10-05T00:00:00Z' }),
  acct({ name: '', email: 'new@x.test', access: 'none', last_sign_in_at: null }),
];

describe('staff list: filters and search', () => {
  test('counts how many accounts each filter matches', () => {
    const c = filterCounts(staff);
    assert.deepEqual([c.all, c.gkk_leader, c.full, c.website, c.read_only, c.none, c.never, c.disabled], [6, 3, 1, 1, 0, 1, 2, 1]);
  });

  test('filterStaff keeps the matching accounts', () => {
    assert.deepEqual(filterStaff(staff, 'gkk_leader').map((s) => s.name), ['Ana', 'Ben', 'Cora']);
    assert.deepEqual(filterStaff(staff, 'never').map((s) => s.email), ['ben@x.test', 'new@x.test']);
    assert.equal(filterStaff(staff, 'nonsense').length, 6);
  });

  test('search text covers name, email, role, access level and GKK', () => {
    assert.match(staffText(staff[1]), /Ana.*ana@x\.test.*GKK leader.*GKK San Jose/);
    assert.match(staffText(staff[0]), /admin/);
  });
});

describe('staff list: sorting', () => {
  const names = (rows) => rows.map((s) => s.name || s.email);

  test('by name, A to Z or back', () => {
    assert.deepEqual(names(sortStaff(staff, 'name')), ['Ana', 'Ben', 'Cora', 'Dave', 'new@x.test', 'Web']);
    assert.deepEqual(names(sortStaff(staff, 'name', 'desc')), ['Web', 'new@x.test', 'Dave', 'Cora', 'Ben', 'Ana']);
  });

  test('by access: levels grouped, a leader\'s GKK within them', () => {
    assert.deepEqual(names(sortStaff(staff, 'access')), ['Dave', 'Web', 'Ben', 'Ana', 'Cora', 'new@x.test']);
  });

  test('by last sign-in, never signed in first', () => {
    assert.deepEqual(names(sortStaff(staff, 'last')).slice(0, 2), ['Ben', 'new@x.test']);
    assert.equal(names(sortStaff(staff, 'last', 'desc'))[0], 'Web');
  });

  test('by status, active before disabled; the input is left alone', () => {
    const copy = [...staff];
    assert.equal(names(sortStaff(staff, 'status')).at(-1), 'Cora');
    assert.deepEqual(staff, copy);
  });
});

describe('staff list: GKK coverage', () => {
  const gkks = [{ id: 1, name: 'GKK Birhen' }, { id: 2, name: 'GKK San Jose' }, { id: 3, name: 'GKK San Roque' }, { id: 4, name: 'GKK Santo Rosario' }];

  test('a GKK is covered by a leader who can sign in', () => {
    const c = gkkCoverage(staff, gkks);
    assert.equal(c.covered, 2);
    // Cora is disabled, so San Roque is uncovered, as is Santo Rosario.
    assert.deepEqual(c.uncovered.map((g) => g.name), ['GKK San Roque', 'GKK Santo Rosario']);
    assert.equal(c.leaders.get(2)[0].name, 'Ana');
  });

  test('two leaders on one GKK are both listed', () => {
    const two = [...staff, acct({ name: 'Dan', email: 'dan@x.test', access: 'gkk_leader', access_gkk_id: 2, access_gkk: 'GKK San Jose' })];
    assert.deepEqual(gkkCoverage(two, gkks).leaders.get(2).map((s) => s.name), ['Ana', 'Dan']);
  });
});

describe('staff list: bulk GKK leaders', () => {
  const g = (id) => ({ id, name: `GKK ${id}` });

  test('blank rows are skipped, complete ones become accounts', () => {
    const { entries, errors } = bulkLeaderEntries([
      { gkk: g(1), name: ' Ana Cruz ', email: ' Ana@Example.com ' },
      { gkk: g(2), name: '', email: '' },
      { gkk: g(3), name: 'Ben', email: 'ben@example.com' },
    ]);
    assert.deepEqual(entries.map((e) => [e.gkk.id, e.name, e.email]), [[1, 'Ana Cruz', 'ana@example.com'], [3, 'Ben', 'ben@example.com']]);
    assert.equal(errors.size, 0);
  });

  test('a half-filled row, a bad email or a repeated email is an error on that row', () => {
    const { entries, errors } = bulkLeaderEntries([
      { gkk: g(1), name: 'Ana', email: '' },
      { gkk: g(2), name: '', email: 'x@example.com' },
      { gkk: g(3), name: 'Cy', email: 'nope' },
      { gkk: g(4), name: 'Di', email: 'di@example.com' },
      { gkk: g(5), name: 'Di Two', email: 'DI@example.com' },
    ]);
    assert.deepEqual([...errors], [[1, 'Enter the email address'], [2, 'Enter the name'], [3, 'Enter a valid email address'], [5, 'This email is on another row']]);
    assert.deepEqual(entries.map((e) => e.gkk.id), [4]);
  });
});

describe('staff list: CSV', () => {
  test('has no password column', () => {
    assert.ok(!STAFF_CSV_COLUMNS.some((c) => /password/i.test(c.label)));
    assert.equal(STAFF_CSV_COLUMNS.find((c) => c.label === 'Access').value(staff[1]), 'GKK leader');
    assert.equal(STAFF_CSV_COLUMNS.find((c) => c.label === 'Last sign-in').value(staff[2]), 'Never');
  });
});
