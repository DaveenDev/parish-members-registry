import test from 'node:test';
import assert from 'node:assert/strict';

import { autoFill, SINGLE_UNDER_AGE } from '../src/lib/household.js';

const today = new Date('2026-10-12T12:00:00');

test('a son is Male, a daughter Female, and so on', () => {
  assert.deepEqual(autoFill({}, 'relationship', 'Son'), { sex: 'Male' });
  assert.deepEqual(autoFill({ sex: 'Male' }, 'relationship', 'Daughter'), { sex: 'Female' });
  assert.deepEqual(autoFill({}, 'relationship', 'Father'), { sex: 'Male' });
  assert.deepEqual(autoFill({}, 'relationship', 'Mother'), { sex: 'Female' });
  assert.deepEqual(autoFill({}, 'relationship', 'Grandfather'), { sex: 'Male' });
  assert.deepEqual(autoFill({}, 'relationship', 'Grandmother'), { sex: 'Female' });
});

test('a Spouse is the other sex from their family head; other relationships leave the sex alone', () => {
  assert.deepEqual(autoFill({}, 'relationship', 'Spouse', { headSex: 'Male' }), { sex: 'Female' });
  assert.deepEqual(autoFill({}, 'relationship', 'Spouse', { headSex: 'Female' }), { sex: 'Male' });
  assert.deepEqual(autoFill({}, 'relationship', 'Spouse'), {});
  for (const rel of ['Grandchild', 'Sibling', 'In-law', 'Household Helper', 'Other', '']) {
    assert.deepEqual(autoFill({ sex: 'Female' }, 'relationship', rel), {}, rel);
  }
});

test('changed from Spouse, the head\'s Married filled in for them goes; one picked by hand stays', () => {
  assert.deepEqual(autoFill({ relationship: 'Spouse', civilStatus: 'Married', civilFromHead: true }, 'relationship', 'Son'), { sex: 'Male', civilStatus: '' });
  assert.deepEqual(autoFill({ relationship: 'Spouse', civilStatus: 'Married', civilFromHead: false }, 'relationship', 'Son'), { sex: 'Male' });
  assert.deepEqual(autoFill({ relationship: 'Son', civilStatus: 'Married', civilFromHead: true }, 'relationship', 'Sibling'), {});
});

test('under 18 is Single (Ulitawo / Dalaga) when no status is picked yet', () => {
  assert.equal(SINGLE_UNDER_AGE, 18);
  assert.deepEqual(autoFill({}, 'dob', '2015-04-01', { today }), { civilStatus: 'Single', civilFromAge: true });
  // 17, a day before their 18th birthday.
  assert.deepEqual(autoFill({}, 'dob', '2008-10-13', { today }), { civilStatus: 'Single', civilFromAge: true });
  // 18 today: left to them.
  assert.deepEqual(autoFill({}, 'dob', '2008-10-12', { today }), {});
  assert.deepEqual(autoFill({}, 'dob', '1980-01-01', { today }), {});
});

test('a status picked by hand stays; a Single from the birthday follows the birthday', () => {
  assert.deepEqual(autoFill({ civilStatus: 'Married' }, 'dob', '2015-04-01', { today }), {});
  assert.deepEqual(autoFill({ civilStatus: 'Single', civilFromAge: true }, 'dob', '1990-04-01', { today }), { civilStatus: '', civilFromAge: false });
  assert.deepEqual(autoFill({ civilStatus: 'Single' }, 'dob', '1990-04-01', { today }), {});
  assert.deepEqual(autoFill({ civilStatus: 'Single', civilFromAge: true }, 'civilStatus', 'Single'), { civilFromAge: false });
  // A birthday cleared or half typed takes an automatic Single back.
  assert.deepEqual(autoFill({ civilStatus: 'Single', civilFromAge: true }, 'dob', '', { today }), { civilStatus: '', civilFromAge: false });
});

test('other fields fill nothing in', () => {
  assert.deepEqual(autoFill({}, 'firstName', 'Ana'), {});
  assert.deepEqual(autoFill({}, 'sex', 'Female'), {});
});
