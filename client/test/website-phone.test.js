import test from 'node:test';
import assert from 'node:assert/strict';

import { isPhoneNumber } from '../src/lib/website.js';

test('isPhoneNumber: a number can be dialled, a name typed in the phone field cannot', () => {
  assert.equal(isPhoneNumber('0917 123 4567'), true);
  assert.equal(isPhoneNumber('(064) 288-1234'), true);
  assert.equal(isPhoneNumber('0918 765 4321 (Fr. Juan)'), true);
  assert.equal(isPhoneNumber('July Moncay'), false);
  assert.equal(isPhoneNumber('123'), false);
  assert.equal(isPhoneNumber(''), false);
  assert.equal(isPhoneNumber(null), false);
});

test('officeDayError: each day needs its hours in order, with a break inside them', async () => {
  const { officeDayError } = await import('../src/lib/website.js');
  const day = (o) => ({ closed: false, open: '08:00', close: '17:00', break_from: '', break_to: '', ...o });
  assert.equal(officeDayError(day()), '');
  assert.equal(officeDayError(day({ break_from: '12:00', break_to: '13:00' })), '');
  assert.equal(officeDayError({ ...day({ open: '' }), closed: true }), '');
  assert.match(officeDayError(day({ open: '' })), /opening and closing/);
  assert.match(officeDayError(day({ close: '07:00' })), /after the opening/);
  assert.match(officeDayError(day({ break_from: '12:00' })), /both ends/);
  assert.match(officeDayError(day({ close: '12:00', break_from: '12:00', break_to: '13:00' })), /inside the office hours/);
});
