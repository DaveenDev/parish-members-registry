import test from 'node:test';
import assert from 'node:assert/strict';

import { articleYears, articlesInYear, ARTICLES_PAGE, articlePath } from '../src/lib/site.js';

const articles = [
  { id: 5, held_on: '2026-09-20' }, { id: 4, held_on: '2026-03-01' }, { id: 3, held_on: '2025-12-24' },
  { id: 2, held_on: '2019-06-12' }, { id: 1, held_on: null },
];

test('the years articles were held in, newest first, with counts', () => {
  assert.deepEqual(articleYears(articles), [{ year: '2026', count: 2 }, { year: '2025', count: 1 }, { year: '2019', count: 1 }]);
  assert.deepEqual(articleYears([]), []);
});

test('one year, or every year', () => {
  assert.deepEqual(articlesInYear(articles, '2026').map((a) => a.id), [5, 4]);
  assert.equal(articlesInYear(articles, '').length, 5);
  assert.deepEqual(articlesInYear(articles, '2020'), []);
});

test('the articles page and an article both live under Komunidad', () => {
  assert.equal(ARTICLES_PAGE, '/komunidad/artikulo');
  assert.equal(articlePath(7), '/komunidad/artikulo/7');
});
