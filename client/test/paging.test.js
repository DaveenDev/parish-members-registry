import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { pageWindow, searchAndPage } from '../src/lib/paging.js';

describe('pageWindow', () => {
  test('shows every page when there are only a few', () => {
    assert.deepEqual(pageWindow(1, 1), [1]);
    assert.deepEqual(pageWindow(2, 5), [1, 2, 3, 4, 5]);
  });

  test('collapses long ranges around the current page', () => {
    assert.deepEqual(pageWindow(30, 60), [1, 'gap', 29, 30, 31, 'gap', 60]);
    assert.deepEqual(pageWindow(1, 60), [1, 2, 'gap', 60]);
    assert.deepEqual(pageWindow(60, 60), [1, 'gap', 59, 60]);
  });

  test('never shows "…" in place of a single page', () => {
    assert.deepEqual(pageWindow(3, 60), [1, 2, 3, 4, 'gap', 60]);
    assert.deepEqual(pageWindow(4, 7), [1, 2, 3, 4, 5, 6, 7]);
  });

  test('stays short no matter how many pages there are', () => {
    assert.ok(pageWindow(500, 1000).length <= 7);
  });
});

describe('searchAndPage', () => {
  const people = Array.from({ length: 25 }, (_, i) => ({ name: `Person ${i + 1}`, gkk: i % 2 ? 'San Isidro' : 'Sto. Niño' }));
  const toText = (p) => `${p.name} ${p.gkk}`;

  test('pages through everything when there is no query', () => {
    const r = searchAndPage(people, { toText, page: 3, pageSize: 10 });
    assert.equal(r.total, 25);
    assert.equal(r.rows.length, 5);
    assert.equal(r.rows[0].name, 'Person 21');
  });

  test('matches every word, case-insensitively', () => {
    const r = searchAndPage(people, { query: 'person 1 isidro', toText, pageSize: 50 });
    assert.ok(r.rows.every((p) => p.gkk === 'San Isidro' && p.name.startsWith('Person 1')));
    assert.ok(r.total > 0);
  });

  test('clamps the page when results shrink', () => {
    const r = searchAndPage(people, { query: 'Person 25', toText, page: 3, pageSize: 10 });
    assert.equal(r.page, 1);
    assert.equal(r.rows.length, 1);
  });

  test('handles an empty list', () => {
    assert.deepEqual(searchAndPage([], { page: 4 }), { rows: [], total: 0, page: 1 });
  });
});
