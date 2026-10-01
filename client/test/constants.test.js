import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  RELATIONSHIPS,
  CIVIL_STATUSES,
  RELIGIONS,
  BLOOD_TYPES,
  HEAD,
  TRIBES,
  FAMILY_GROUPINGS,
  WEDDING_TYPES,
  PARTICIPATION_ITEMS,
  PARTICIPATION_LEVELS,
  HELP_WAYS,
  DEFAULT_ADDRESS,
  blankMember,
  fmtDate,
  ageFromDob,
} from '../src/constants.js';

describe('pick-lists', () => {
  test('have no blanks or duplicates', () => {
    for (const [label, list] of Object.entries({ RELATIONSHIPS, CIVIL_STATUSES, RELIGIONS, BLOOD_TYPES, TRIBES })) {
      assert.ok(list.length > 0, `${label} is empty`);
      assert.equal(new Set(list).size, list.length, `${label} has duplicates`);
      assert.ok(list.every((v) => typeof v === 'string' && v.trim()), `${label} has a blank entry`);
    }
  });

  test('cover the values the wizard and admin filters rely on', () => {
    assert.ok(RELATIONSHIPS.includes('Head of Household'));
    assert.ok(RELATIONSHIPS.includes('Spouse'));
    assert.deepEqual(CIVIL_STATUSES, ['Single', 'Married', 'Widowed', 'Separated']);
    assert.equal(RELIGIONS[0], 'Roman Catholic', 'the default religion must be first in the list');
    assert.deepEqual(BLOOD_TYPES, ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
    assert.ok(RELATIONSHIPS.includes(HEAD), 'the wizard pins members[0] to HEAD, which must be a real relationship');
  });

  test('wedding types include the one that counts as the sacrament', () => {
    assert.ok(WEDDING_TYPES.includes('Catholic Marriage'));
    assert.equal(new Set(WEDDING_TYPES).size, WEDDING_TYPES.length);
  });
});

describe('participation survey', () => {
  // These keys are whitelisted in submit_registration (0002 migration) — a
  // rename here without the SQL would silently drop the answer.
  test('uses the keys the registration RPC accepts', () => {
    assert.deepEqual(PARTICIPATION_ITEMS.map(([k]) => k), ['mass', 'bible_service', 'devotions', 'meetings', 'pintakasi', 'financial']);
    assert.deepEqual(HELP_WAYS.map(([k]) => k), ['sunday_mass', 'bible_service', 'devotions', 'meetings', 'pintakasi', 'financial']);
    assert.deepEqual(PARTICIPATION_LEVELS, ['Aktibo', 'Panagsa', 'Wala']);
  });

  test('has a label for every entry', () => {
    for (const [key, label] of [...PARTICIPATION_ITEMS, ...HELP_WAYS]) {
      assert.ok(typeof label === 'string' && label.trim(), `${key} has no label`);
    }
  });
});

describe('FAMILY_GROUPINGS', () => {
  test('runs FG 1 through FG 10', () => {
    assert.equal(FAMILY_GROUPINGS.length, 10);
    assert.equal(FAMILY_GROUPINGS[0], 'FG 1');
    assert.equal(FAMILY_GROUPINGS[9], 'FG 10');
  });
});

describe('DEFAULT_ADDRESS', () => {
  test('prefills Kidapawan', () => {
    assert.deepEqual(DEFAULT_ADDRESS, { city: 'Kidapawan City', province: 'North Cotabato', zip: '9400' });
  });
});

describe('blankMember', () => {
  test('starts every text field empty and every sacrament unticked', () => {
    const m = blankMember();

    assert.equal(m.firstName, '');
    assert.equal(m.lastName, '');
    assert.equal(m.relationship, '');
    assert.equal(m.dob, '');
    assert.equal(m.hasBaptism, false);
    assert.equal(m.hasCommunion, false);
    assert.equal(m.hasConfirmation, false);
    assert.equal(m.hasMatrimony, false);
    assert.deepEqual(m.ministries, []);
    assert.deepEqual(m.organizations, []);
  });

  test('defaults religion to Roman Catholic', () => {
    assert.equal(blankMember().religion, 'Roman Catholic');
  });

  test('returns a fresh object each time — editing one member must not touch another', () => {
    const a = blankMember();
    const b = blankMember();

    a.firstName = 'Juan';
    a.ministries.push('Choir');

    assert.equal(b.firstName, '');
    assert.deepEqual(b.ministries, []);
    assert.notEqual(a.ministries, b.ministries);
  });

  test('carries every field the API expects for a member', () => {
    const keys = Object.keys(blankMember());
    for (const required of ['firstName', 'lastName', 'suffix', 'relationship', 'sex', 'dob', 'tribe', 'civilStatus', 'gkkRole']) {
      assert.ok(keys.includes(required), `blankMember is missing ${required}`);
    }
  });
});

describe('fmtDate', () => {
  test('formats an ISO date for display', () => {
    assert.match(fmtDate('2026-01-09'), /Jan\w*\s+9,?\s+2026/);
  });

  test('does not shift the day — the bug a bare new Date() would introduce', () => {
    // Parsed as local midnight, so the calendar day is the one that was typed
    // regardless of the viewer's timezone.
    assert.match(fmtDate('2026-01-01'), /Jan\w*\s+1,?\s+2026/);
    assert.match(fmtDate('2025-12-31'), /Dec\w*\s+31,?\s+2025/);
  });

  test('returns an empty string for a missing date', () => {
    assert.equal(fmtDate(''), '');
    assert.equal(fmtDate(null), '');
    assert.equal(fmtDate(undefined), '');
  });

  test('never throws on junk', () => {
    assert.doesNotThrow(() => fmtDate('not-a-date'));
  });
});

describe('ageFromDob', () => {
  /** An ISO date `years` before today, shifted by `dayOffset` days. */
  function isoBirthday(years, dayOffset = 0) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    d.setDate(d.getDate() + dayOffset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  test('matches the server calculation, turning over on the birthday', () => {
    assert.equal(ageFromDob(isoBirthday(30)), 30);
    assert.equal(ageFromDob(isoBirthday(30, 1)), 29);
    assert.equal(ageFromDob(isoBirthday(0, -1)), 0);
  });

  test('returns null rather than NaN for missing or unparseable dates', () => {
    for (const value of [null, undefined, '', 'not-a-date']) {
      assert.equal(ageFromDob(value), null);
    }
  });
});
