import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { ageFromDob, initials, memberFullName, toCsv } from '../../src/lib/util.js';

/** An ISO date `years` before today, shifted by `dayOffset` days. */
function isoBirthday(years, dayOffset = 0) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() + dayOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('ageFromDob', () => {
  test('counts full years, turning over on the birthday', () => {
    assert.equal(ageFromDob(isoBirthday(30)), 30, 'birthday is today');
    assert.equal(ageFromDob(isoBirthday(30, -1)), 30, 'birthday was yesterday');
    assert.equal(ageFromDob(isoBirthday(30, 1)), 29, 'birthday is tomorrow');
  });

  test('handles newborns and the very old', () => {
    assert.equal(ageFromDob(isoBirthday(0, -1)), 0);
    assert.equal(ageFromDob(isoBirthday(103)), 103);
  });

  test('returns null for missing or unparseable dates', () => {
    for (const value of [null, undefined, '', 'not-a-date', '2020-13-45']) {
      assert.equal(ageFromDob(value), null);
    }
  });

  test('accepts Date objects as well as ISO strings', () => {
    const iso = isoBirthday(41);
    assert.equal(ageFromDob(new Date(`${iso}T00:00:00`)), 41);
  });
});

describe('initials', () => {
  test('takes the first letter of each name, upper-cased', () => {
    assert.equal(initials('juan', 'dela cruz'), 'JD');
    assert.equal(initials('Maria', 'Reyes'), 'MR');
  });

  test('copes with a missing half', () => {
    assert.equal(initials('Juan', ''), 'J');
    assert.equal(initials('', 'Reyes'), 'R');
    assert.equal(initials(null, undefined), '?');
    assert.equal(initials('', ''), '?');
  });
});

describe('memberFullName', () => {
  test('joins first and last name', () => {
    assert.equal(memberFullName({ first_name: 'Juan', last_name: 'Dela Cruz' }), 'Juan Dela Cruz');
  });

  test('drops blanks rather than leaving a stray space', () => {
    assert.equal(memberFullName({ first_name: 'Juan', last_name: '' }), 'Juan');
    assert.equal(memberFullName({ first_name: null, last_name: 'Dela Cruz' }), 'Dela Cruz');
    assert.equal(memberFullName({}), '');
  });
});

describe('toCsv', () => {
  const columns = [
    { label: 'Name', value: 'name' },
    { label: 'Age', value: (r) => r.age },
  ];

  test('writes a header row followed by one row per record', () => {
    const csv = toCsv([{ name: 'Juan', age: 44 }, { name: 'Maria', age: 41 }], columns);
    assert.equal(csv, 'Name,Age\nJuan,44\nMaria,41');
  });

  test('emits just the header for an empty set', () => {
    assert.equal(toCsv([], columns), 'Name,Age\n');
  });

  test('renders null and undefined as empty cells', () => {
    const csv = toCsv([{ name: null, age: undefined }], columns);
    assert.equal(csv, 'Name,Age\n,');
  });

  test('quotes cells containing a comma, a quote or a newline', () => {
    const rows = [
      { name: 'Dela Cruz, Juan', age: 1 },
      { name: 'He said "hello"', age: 2 },
      { name: 'Line one\nLine two', age: 3 },
    ];
    const csv = toCsv(rows, columns);
    const lines = csv.split('\n');

    assert.equal(lines[0], 'Name,Age');
    assert.equal(lines[1], '"Dela Cruz, Juan",1');
    assert.equal(lines[2], '"He said ""hello""",2');
    // The embedded newline stays inside the quoted field.
    assert.equal(`${lines[3]}\n${lines[4]}`, '"Line one\nLine two",3');
  });

  test('quotes labels that need it too', () => {
    const csv = toCsv([], [{ label: 'Last, First', value: 'name' }]);
    assert.equal(csv, '"Last, First"\n');
  });

  test('does not let a formula-looking cell change the field count', () => {
    // Spreadsheet formula injection is a separate concern, but the escaping
    // must at least keep the row shape intact.
    const csv = toCsv([{ name: '=SUM(A1,A2)', age: 5 }], columns);
    assert.equal(csv.split('\n')[1], '"=SUM(A1,A2)",5');
  });
});
