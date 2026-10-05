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
