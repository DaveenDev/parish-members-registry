import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { toNameCase, toSuffixCase, initials, inDateRange, generateTempPassword, adminReturnPath, plainLetters } from '../src/lib/util.js';

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

describe('generateTempPassword', () => {
  test('is 12 characters from the readable alphabet by default', () => {
    const pw = generateTempPassword();
    assert.equal(pw.length, 12);
    assert.match(pw, /^[A-HJ-NP-Za-km-np-z2-9]+$/);
    assert.doesNotMatch(pw, /[0O1lI]/);
  });

  test('passes the staff minimum of 10 characters and differs each time', () => {
    const seen = new Set(Array.from({ length: 50 }, () => generateTempPassword()));
    assert.equal(seen.size, 50);
    for (const pw of seen) assert.ok(pw.length >= 10);
  });

  test('skips biased bytes instead of wrapping them', () => {
    // 255 is above the rejection limit, so only the 0s are used.
    const pw = generateTempPassword(4, (n) => new Uint8Array(n).map((_, i) => (i % 2 ? 255 : 0)));
    assert.equal(pw, 'AAAA');
  });
});

describe('adminReturnPath', () => {
  test('returns the admin page the person asked for, with its query and hash', () => {
    assert.equal(adminReturnPath('/admin/members'), '/admin/members');
    assert.equal(adminReturnPath('/admin/requests?tab=donors'), '/admin/requests?tab=donors');
    assert.equal(adminReturnPath('/admin'), '/admin');
    assert.equal(adminReturnPath('/admin?x=1#top'), '/admin?x=1#top');
  });

  test('falls back to the Dashboard for anything else', () => {
    assert.equal(adminReturnPath(undefined), '/admin');
    assert.equal(adminReturnPath(null), '/admin');
    assert.equal(adminReturnPath({ pathname: '/admin/members' }), '/admin');
    assert.equal(adminReturnPath('/admin/login'), '/admin');
    assert.equal(adminReturnPath('/admin/login?next=1'), '/admin');
    assert.equal(adminReturnPath('/administrator'), '/admin');
    assert.equal(adminReturnPath('/register'), '/admin');
    assert.equal(adminReturnPath('https://evil.example/admin'), '/admin');
    assert.equal(adminReturnPath('//evil.example/admin'), '/admin');
  });
});

describe('plainLetters', () => {
  test('turns math bold and italic letters and digits into plain ones', () => {
    assert.equal(plainLetters('𝐀 𝐁𝐥𝐞𝐬𝐬𝐞𝐝 𝟓𝟗𝐭𝐡 𝐁𝐢𝐫𝐭𝐡𝐝𝐚𝐲'), 'A Blessed 59th Birthday');
    assert.equal(plainLetters('𝘏𝘦𝘭𝘭𝘰'), 'Hello');
  });
  test('leaves emoji, accents and non-strings alone', () => {
    assert.equal(plainLetters('Sto. Niño!🎉🩵'), 'Sto. Niño!🎉🩵');
    assert.equal(plainLetters(null), null);
    assert.equal(plainLetters(5), 5);
  });
});
