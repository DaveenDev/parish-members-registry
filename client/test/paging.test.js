import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { pageWindow, searchAndPage, fetchAllPages } from '../src/lib/paging.js';

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

describe('fetchAllPages', () => {
  const source = (n) => Array.from({ length: n }, (_, i) => i);
  const pager = (rows, calls = []) => async (from, to) => {
    calls.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  };

  test('reads past the per-request cap until a short page', async () => {
    const calls = [];
    const { data, error } = await fetchAllPages(pager(source(2500), calls), 1000);
    assert.equal(error, null);
    assert.equal(data.length, 2500);
    assert.deepEqual(data.slice(998, 1002), [998, 999, 1000, 1001]);
    assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
  });

  test('asks once more when the total is an exact multiple of the chunk', async () => {
    const calls = [];
    const { data } = await fetchAllPages(pager(source(2000), calls), 1000);
    assert.equal(data.length, 2000);
    assert.equal(calls.length, 3);
  });

  test('handles an empty table', async () => {
    const { data } = await fetchAllPages(pager([]), 1000);
    assert.deepEqual(data, []);
  });

  test('stops and returns the error from a failed page', async () => {
    const boom = { message: 'boom' };
    let n = 0;
    const { data, error } = await fetchAllPages(async () => (n++ ? { data: null, error: boom } : { data: source(10), error: null }), 10);
    assert.equal(data, null);
    assert.equal(error, boom);
  });
});
