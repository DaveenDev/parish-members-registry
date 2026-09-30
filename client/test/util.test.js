import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { toNameCase, toSuffixCase, initials } from '../src/lib/util.js';

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
