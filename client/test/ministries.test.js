import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { menOnlyBlocked, isMale, menOnlyMessage } from '../src/lib/ministries.js';

describe('men-only ministries', () => {
  const menOnly = new Set(['Kaabag']);

  test('only men may join Kaabag', () => {
    assert.ok(!menOnlyBlocked('Kaabag', 'Male', menOnly));
    assert.ok(menOnlyBlocked('Kaabag', 'Female', menOnly));
    assert.ok(menOnlyBlocked('Kaabag', '', menOnly));
    assert.ok(menOnlyBlocked('Kaabag', null, menOnly));
  });

  test('other ministries are open to everyone', () => {
    assert.ok(!menOnlyBlocked('Choir', 'Female', menOnly));
    assert.ok(!menOnlyBlocked('Kaabag', 'Female', new Set()));
    assert.ok(!menOnlyBlocked('Kaabag', 'Female', null));
  });

  test('someone already on it can still be taken off', () => {
    assert.ok(!menOnlyBlocked('Kaabag', 'Female', menOnly, true));
  });

  test('helpers', () => {
    assert.ok(isMale('Male'));
    assert.ok(!isMale('male'));
    assert.equal(menOnlyMessage('Kaabag'), 'Kaabag is for men only.');
  });
});
