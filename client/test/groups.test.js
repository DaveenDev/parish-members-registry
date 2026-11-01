import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS_PAGE, groupInterestPath, groupKindLabel, groupPath } from '../src/lib/groups.js';

test('a group has its own address and a sign-up link carrying its name and kind', () => {
  assert.equal(GROUPS_PAGE, '/komunidad/grupo');
  assert.equal(groupPath({ kind: 'ministry', id: 3 }), '/komunidad/grupo/ministry/3');
  assert.equal(groupPath({ kind: 'organization', id: 8 }), '/komunidad/grupo/organization/8');
  assert.equal(groupInterestPath({ kind: 'organization', name: "Catholic Women's League" }), "/serbisyo/hangyo/interesado?groupName=Catholic%20Women's%20League&groupKind=organization");
  assert.equal(groupInterestPath({ kind: 'other', name: 'A & B' }), '/serbisyo/hangyo/interesado?groupName=A%20%26%20B&groupKind=ministry');
});

test('groupKindLabel: Ministry or Organisasyon', () => {
  assert.equal(groupKindLabel('ministry'), 'Ministry');
  assert.equal(groupKindLabel('organization'), 'Organisasyon');
});
