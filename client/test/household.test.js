import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { syncSpouses } from '../src/lib/household.js';
import { blankMember } from '../src/constants.js';

const head = (over = {}) => ({ ...blankMember(), relationship: 'Head of Household', ...over });
const member = (over = {}) => ({ ...blankMember(), ...over });

describe('syncSpouses', () => {
  test('a spouse takes the head\'s Married or Live-in status', () => {
    for (const status of ['Married', 'Live-in']) {
      const [, spouse] = syncSpouses([head({ civilStatus: status }), member({ relationship: 'Spouse', civilFromHead: true })]);
      assert.equal(spouse.civilStatus, status);
    }
  });

  test('fills an empty status even without the flag', () => {
    const [, spouse] = syncSpouses([head({ civilStatus: 'Married' }), member({ relationship: 'Spouse' })]);
    assert.equal(spouse.civilStatus, 'Married');
  });

  test('follows the head when the head changes, while still auto-filled', () => {
    let ms = syncSpouses([head({ civilStatus: 'Married' }), member({ relationship: 'Spouse', civilFromHead: true })]);
    ms = syncSpouses([{ ...ms[0], civilStatus: 'Live-in' }, ms[1]]);
    assert.equal(ms[1].civilStatus, 'Live-in');
  });

  test('leaves a status the spouse chose by hand', () => {
    const [, spouse] = syncSpouses([head({ civilStatus: 'Married' }), member({ relationship: 'Spouse', civilStatus: 'Separated', civilFromHead: false })]);
    assert.equal(spouse.civilStatus, 'Separated');
  });

  test('does nothing when the head is not partnered, or for other relationships', () => {
    const single = syncSpouses([head({ civilStatus: 'Single' }), member({ relationship: 'Spouse', civilFromHead: true })]);
    assert.equal(single[1].civilStatus, '');
    const child = member({ relationship: 'Son' });
    const ms = syncSpouses([head({ civilStatus: 'Married' }), child]);
    assert.equal(ms[1], child, 'non-spouse members are returned untouched');
  });

  test('a married spouse shares the head\'s wedding until edited by hand', () => {
    const wedding = { matType: 'Catholic Marriage', hasMatrimony: true, matDate: '2006-02-11', matChurch: 'OLG' };
    const [, spouse] = syncSpouses([head({ civilStatus: 'Married', ...wedding }), member({ relationship: 'Spouse', civilFromHead: true })]);
    assert.deepEqual(
      { matType: spouse.matType, hasMatrimony: spouse.hasMatrimony, matDate: spouse.matDate, matChurch: spouse.matChurch },
      wedding,
    );

    const edited = member({ relationship: 'Spouse', civilStatus: 'Married', matType: 'Civil Wedding', weddingFromHead: false });
    const [, kept] = syncSpouses([head({ civilStatus: 'Married', ...wedding }), edited]);
    assert.equal(kept.matType, 'Civil Wedding');
  });
});
