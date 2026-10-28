import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { attentionCounts, censusColumnNote, censusWords, filterByAttention, gkkProgress, gkkFamilyProgress } from '../src/lib/gkkAdmin.js';

describe('gkkFamilyProgress (0079)', () => {
  const families = { rows: [{ label: 'A', lastYear: 15, notYet: 3, pct: 80, registered: 12 }, { label: 'B', lastYear: null, notYet: null, pct: null, registered: 4 }] };
  test('against the families baseline; nothing without one', () => {
    assert.deepEqual(gkkFamilyProgress(families, 'A'), { done: 12, of: 15, pct: 80, notYet: 3 });
    assert.equal(gkkFamilyProgress(families, 'B'), null);
    assert.equal(gkkFamilyProgress(null, 'A'), null);
  });
});

const rows = [
  { name: 'A', barangay: 'Meohao', chapel_address: 'Purok 1', coordinators: ['X'], meeting_schedule: 'Sun', count: 4, history_published: true, history: 'Text' },
  { name: 'B', barangay: ' ', chapel_address: '', coordinators: [], meeting_schedule: '', count: 0, history_published: false, history: 'Draft' },
  { name: 'C -Balabag', chapel_address: 'Purok 3', coordinators: [], meeting_schedule: 'Sat', count: 2, history_published: false, history: '', history_photos: ['p.jpg'] },
  { name: 'D', barangay: 'Mua-an', chapel_address: 'Purok 4', coordinators: ['Y', 'Z'], meeting_schedule: 'Fri', count: 1, history_published: false, history: '' },
];

describe('Parish GKK attention chips', () => {
  test('counts each gap', () => {
    assert.deepEqual(attentionCounts(rows), { barangay: 1, address: 1, history: 2, coordinator: 2, meeting: 1, empty: 1 });
  });

  test('no coordinator: no GKK leader account (0098), whatever the old coordinator_name says', () => {
    assert.deepEqual(filterByAttention(rows, 'coordinator').map((r) => r.name), ['B', 'C -Balabag']);
    assert.deepEqual(filterByAttention([{ name: 'E', coordinators: [], coordinator_name: 'Old name' }], 'coordinator').map((r) => r.name), ['E']);
  });

  test("no coordinator isn't claimed when the accounts couldn't be read (before 0098)", () => {
    assert.deepEqual(filterByAttention([{ name: 'F', coordinators: null }, { name: 'G' }], 'coordinator'), []);
  });

  test('no barangay: none saved and none at the end of the name (0089)', () => {
    assert.deepEqual(filterByAttention(rows, 'barangay').map((r) => r.name), ['B']);
  });

  test('a history counts as a draft only when there is text or a photo and it is not published', () => {
    assert.deepEqual(filterByAttention(rows, 'history').map((r) => r.name), ['B', 'C -Balabag']);
  });

  test('"all" and unknown keys show every GKK', () => {
    assert.equal(filterByAttention(rows, 'all').length, 4);
    assert.equal(filterByAttention(rows, 'nope').length, 4);
    assert.deepEqual(filterByAttention(null, 'all'), []);
  });
});

describe('gkkProgress', () => {
  const progress = [
    { label: 'A', lastYear: 10, notYet: 4, pct: 60, registered: 6, fromList: true },
    { label: 'B', lastYear: null, notYet: null, pct: null, registered: 3 },
  ];
  test('against a baseline', () => {
    assert.deepEqual(gkkProgress(progress, 'A'), { done: 6, of: 10, pct: 60, notYet: 4, fromList: true });
  });
  test('without a baseline, just the households registered', () => {
    assert.deepEqual(gkkProgress(progress, 'B'), { registered: 3 });
  });
  test('no row, no progress', () => {
    assert.equal(gkkProgress(progress, 'Z'), null);
    assert.equal(gkkProgress(null, 'A'), null);
  });
});

describe('the Census column in words', () => {
  test('the note says which census and what it is measured against', () => {
    const cycle = { label: '2026 Census' };
    assert.equal(
      censusColumnNote({ mode: 'census', previous: { label: '2025 Census' }, hasBaseline: true, families: { hasBaseline: true } }, cycle),
      '2026 Census: households (and families) that answered it, out of those that answered the 2025 Census.',
    );
    assert.equal(
      censusColumnNote({ mode: 'list', hasBaseline: true }, cycle),
      "2026 Census: households registered in the registry, out of those on last year's list.",
    );
    assert.match(censusColumnNote({ mode: 'count', hasBaseline: true }, null), /^The census: households registered in the registry, out of those counted last year/);
    assert.match(censusColumnNote({ mode: 'count', hasBaseline: false }, cycle), /No GKK has a count from last year/);
    assert.equal(censusColumnNote(null, cycle), '');
  });
  test('the verb follows the baseline', () => {
    assert.equal(censusWords({ mode: 'census', previous: null }).verb, 'answered');
    assert.equal(censusWords({ mode: 'list' }).verb, 'registered');
  });
});
