import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { attentionCounts, filterByAttention, gkkProgress } from '../src/lib/gkkAdmin.js';

const rows = [
  { name: 'A', chapel_address: 'Purok 1', coordinator_name: 'X', meeting_schedule: 'Sun', count: 4, history_published: true, history: 'Text' },
  { name: 'B', chapel_address: '', coordinator_name: '', meeting_schedule: '', count: 0, history_published: false, history: 'Draft' },
  { name: 'C', chapel_address: 'Purok 3', coordinator_name: ' ', meeting_schedule: 'Sat', count: 2, history_published: false, history: '', history_photos: ['p.jpg'] },
  { name: 'D', chapel_address: 'Purok 4', coordinator_name: 'Y', meeting_schedule: 'Fri', count: 1, history_published: false, history: '' },
];

describe('Parish GKK attention chips', () => {
  test('counts each gap', () => {
    assert.deepEqual(attentionCounts(rows), { address: 1, history: 2, coordinator: 2, meeting: 1, empty: 1 });
  });

  test('a history counts as a draft only when there is text or a photo and it is not published', () => {
    assert.deepEqual(filterByAttention(rows, 'history').map((r) => r.name), ['B', 'C']);
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
