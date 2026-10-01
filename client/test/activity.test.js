import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { describeActivity, formatValue, activityActor } from '../src/lib/activity.js';

describe('describeActivity', () => {
  test('lists each changed field in plain words', () => {
    const d = describeActivity({ action: 'update', table_name: 'households', changes: { street: ['5 Bonifacio St.', 'Purok 9'], gkk: [null, 'GKK San Isidro'] } });
    assert.equal(d.title, 'Updated the household');
    assert.deepEqual(d.lines, ['Street: 5 Bonifacio St. → Purok 9', 'GKK: — → GKK San Isidro']);
  });

  test('verifying a household reads as such, without the bookkeeping fields', () => {
    const d = describeActivity({ action: 'update', table_name: 'households', changes: { status: ['Pending', 'Verified'], verified_at: [null, 'x'], verified_by_name: [null, 'Ana'] } });
    assert.deepEqual(d, { title: 'Verified the household', lines: [] });
  });

  test('sacrament verifications, trash and restore', () => {
    assert.deepEqual(describeActivity({ action: 'insert', table_name: 'sacrament_verifications', changes: { sacrament: 'baptism', source: 'Parish register entry', reference: 'Book 1' } }),
      { title: 'Verified Baptism', lines: ['Source: Parish register entry (Book 1)'] });
    assert.equal(describeActivity({ action: 'delete', table_name: 'sacrament_verifications', changes: { sacrament: 'matrimony' } }).title, 'Removed the Matrimony verification');
    assert.deepEqual(describeActivity({ action: 'trash', table_name: 'households', changes: { members: 3 } }), { title: 'Moved the household to the trash', lines: ['With 3 member(s)'] });
    assert.equal(describeActivity({ action: 'restore', table_name: 'members' }).title, 'Restored the member from the trash');
    assert.equal(describeActivity({ action: 'insert', table_name: 'members' }).title, 'Added the member');
  });
});

test('formatValue and activityActor', () => {
  assert.equal(formatValue(true), 'Yes');
  assert.equal(formatValue(['Choir', 'Lectors']), 'Choir, Lectors');
  assert.equal(formatValue([]), '—');
  assert.equal(formatValue({ mass: 'Aktibo' }), 'mass: Aktibo');
  assert.equal(activityActor({ actor_name: null }), 'The family (online)');
  assert.equal(activityActor({ actor_name: 'Ana' }), 'Ana');
});
