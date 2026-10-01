import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { toNameCase, toSuffixCase, initials, inDateRange } from '../src/lib/util.js';

describe('toNameCase', () => {
  test('capitalizes the first letter of each word only', () => {
    assert.equal(toNameCase('dela cruz'), 'Dela Cruz');
    assert.equal(toNameCase('MARIA'), 'Maria');
    assert.equal(toNameCase('dELA cRUZ'), 'Dela Cruz');
    assert.equal(toNameCase('juan'), 'Juan');
  });

  test('capitalizes after hyphens and apostrophes', () => {
    assert.equal(toNameCase('santos-reyes'), 'Santos-Reyes');
    assert.equal(toNameCase("o'neil"), "O'Neil");
  });

  test('keeps abbreviations and accented letters readable', () => {
    assert.equal(toNameCase('ma. luisa'), 'Ma. Luisa');
    assert.equal(toNameCase('peñaflor'), 'Peñaflor');
    assert.equal(toNameCase('ñino'), 'Ñino');
  });

  test('tidies whitespace and tolerates empty input', () => {
    assert.equal(toNameCase('  juan   dela  cruz '), 'Juan Dela Cruz');
    assert.equal(toNameCase(''), '');
    assert.equal(toNameCase(null), '');
    assert.equal(toNameCase(undefined), '');
  });
});

describe('toSuffixCase', () => {
  test('normalizes Jr. and Sr.', () => {
    for (const v of ['jr', 'JR', 'jr.', 'Jr.']) assert.equal(toSuffixCase(v), 'Jr.');
    for (const v of ['sr', 'SR.', 'Sr']) assert.equal(toSuffixCase(v), 'Sr.');
  });

  test('uppercases roman numerals', () => {
    assert.equal(toSuffixCase('iii'), 'III');
    assert.equal(toSuffixCase('iv'), 'IV');
    assert.equal(toSuffixCase('ii.'), 'II');
  });

  test('returns empty for empty input', () => {
    assert.equal(toSuffixCase(''), '');
    assert.equal(toSuffixCase('  '), '');
  });
});

describe('initials', () => {
  test('uses the first letter of each name', () => {
    assert.equal(initials('juan', 'duran'), 'JD');
    assert.equal(initials('', ''), '?');
  });
});

describe('inDateRange', () => {
  const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

  test('includes the whole of the "to" day', () => {
    assert.equal(inDateRange(at(2026, 10, 1, 23, 59), '', '2026-10-01'), true);
    assert.equal(inDateRange(at(2026, 10, 2, 0, 0), '', '2026-10-01'), false);
  });

  test('includes the whole of the "from" day', () => {
    assert.equal(inDateRange(at(2026, 10, 1, 0, 0), '2026-10-01', ''), true);
    assert.equal(inDateRange(at(2026, 9, 30, 23, 59), '2026-10-01', ''), false);
  });

  test('a single-day range keeps that day only', () => {
    assert.equal(inDateRange(at(2026, 10, 1, 9), '2026-10-01', '2026-10-01'), true);
    assert.equal(inDateRange(at(2026, 10, 2, 9), '2026-10-01', '2026-10-01'), false);
  });

  test('blank bounds keep everything; bad timestamps keep nothing', () => {
    assert.equal(inDateRange(at(2020, 1, 1), '', ''), true);
    assert.equal(inDateRange('not a date', '', ''), false);
  });
});
