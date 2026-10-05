import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  syncSpouses, groupByHousehold, groupByGkk, groupRuns, groupHeading, toPayloadMember, familiesOf, familyNoOf, familyHeadIndex, nextFamilyNo, familyHeadName, familyTitle, weddingCouples,
  familyTag, compactFamilies, samePerson, repeatedMember, spouseSex, askedForAge, clearForAge,
} from '../src/lib/household.js';
import { blankMember } from '../src/constants.js';

const head = (over = {}) => ({ ...blankMember(), relationship: 'Head of Household', ...over });
const member = (over = {}) => ({ ...blankMember(), ...over });

describe('groupByHousehold', () => {
  test('groups consecutive rows and keeps households with the same name apart', () => {
    const rows = [
      { id: 1, household_id: 7, household_name: 'Duran Family', household_gkk: 'GKK San Isidro' },
      { id: 2, household_id: 7, household_name: 'Duran Family', household_gkk: 'GKK San Isidro' },
      { id: 3, household_id: 9, household_name: 'Duran Family', household_gkk: 'GKK Sto. Niño' },
    ];
    const groups = groupByHousehold(rows);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map((g) => g.members.map((m) => m.id)), [[1, 2], [3]]);
    assert.equal(groups[1].gkk, 'GKK Sto. Niño');
  });

  test('returns nothing for no rows', () => {
    assert.deepEqual(groupByHousehold([]), []);
  });
});

describe('groupRuns', () => {
  test('groups consecutive household rows by the given column, blanks together', () => {
    const rows = [
      { id: 1, family_grouping: 'FG 1' },
      { id: 2, family_grouping: 'FG 1' },
      { id: 3, family_grouping: 'FG 2' },
      { id: 4, family_grouping: null },
      { id: 5, family_grouping: '' },
    ];
    assert.deepEqual(groupRuns(rows, 'family_grouping').map((g) => [g.key, g.rows.map((r) => r.id)]), [
      ['FG 1', [1, 2]], ['FG 2', [3]], [null, [4, 5]],
    ]);
  });

  test('headings name the group, or what is missing', () => {
    assert.equal(groupHeading('GKK San Isidro', 'gkk'), 'GKK San Isidro');
    assert.equal(groupHeading(null, 'gkk'), 'No GKK');
    assert.equal(groupHeading(null, 'family_grouping'), 'No Family Grouping');
  });
});

describe('groupByGkk', () => {
  test('groups consecutive rows by GKK, with no-GKK members together', () => {
    const rows = [
      { id: 1, household_gkk: 'GKK San Isidro' },
      { id: 2, household_gkk: 'GKK San Isidro' },
      { id: 3, household_gkk: 'GKK Sto. Niño' },
      { id: 4, household_gkk: null },
      { id: 5, household_gkk: '' },
    ];
    const groups = groupByGkk(rows);
    assert.deepEqual(groups.map((g) => [g.gkk, g.members.map((m) => m.id)]), [
      ['GKK San Isidro', [1, 2]], ['GKK Sto. Niño', [3]], [null, [4, 5]],
    ]);
  });
});

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

  test('a married spouse shares the head\'s wedding, and an edit on either side is copied to the other', () => {
    const wedding = { matType: 'Catholic Marriage', hasMatrimony: true, matDate: '2006-02-11', matChurch: 'OLG' };
    const [, spouse] = syncSpouses([head({ civilStatus: 'Married', ...wedding }), member({ relationship: 'Spouse', civilFromHead: true })]);
    assert.deepEqual(
      { matType: spouse.matType, hasMatrimony: spouse.hasMatrimony, matDate: spouse.matDate, matChurch: spouse.matChurch },
      wedding,
    );

    const edited = member({ relationship: 'Spouse', civilStatus: 'Married', matType: 'Civil Wedding', hasMatrimony: false });
    const [h, kept] = syncSpouses([head({ civilStatus: 'Married', ...wedding }), edited], 1);
    assert.equal(kept.matType, 'Civil Wedding');
    assert.equal(h.matType, 'Civil Wedding');
  });
});

describe('toPayloadMember', () => {
  test('tidies names and drops the wizard-only flags', () => {
    const p = toPayloadMember(member({ firstName: 'jUAN', lastName: 'dela cruz', suffix: 'jr', civilFromHead: true, weddingFromHead: true }));
    assert.equal(p.firstName, 'Juan');
    assert.equal(p.lastName, 'Dela Cruz');
    assert.equal(p.suffix, 'Jr.');
    assert.equal('civilFromHead' in p, false);
    assert.equal('weddingFromHead' in p, false);
  });

  test('a married member keeps the wedding; only a Catholic one is the sacrament', () => {
    assert.equal(toPayloadMember(member({ civilStatus: 'Married', matType: 'Catholic Marriage' })).hasMatrimony, true);
    const civil = toPayloadMember(member({ civilStatus: 'Married', matType: 'Civil Wedding', hasMatrimony: true }));
    assert.equal(civil.hasMatrimony, false);
    assert.equal(civil.matType, 'Civil Wedding');
  });

  test('a wedding type is dropped once the member is no longer married', () => {
    assert.equal(toPayloadMember(member({ civilStatus: 'Widowed', matType: 'Civil Wedding' })).matType, '');
  });
});

describe('families within a household', () => {
  const rows = [
    { id: 1, relationship: 'Head of Household', family_no: 1, first_name: 'Juan', last_name: 'Dela Cruz' },
    { id: 2, relationship: 'Spouse', family_no: 1 },
    { id: 3, relationship: 'Son', family_no: 1 },
    { id: 4, relationship: 'Head of Family', family_no: 2, first_name: 'Pedro', last_name: 'Dela Cruz' },
    { id: 5, relationship: 'Daughter', family_no: 2 },
    { id: 6, relationship: 'Son' }, // no family number yet: the first family
  ];

  test('familiesOf groups members by family, family 1 first, with each head', () => {
    const groups = familiesOf([rows[3], rows[0], rows[4], rows[1], rows[5]]);
    assert.deepEqual(groups.map((g) => [g.familyNo, g.head?.id, g.members.map((m) => m.id), g.indexes]), [
      [1, 1, [1, 2, 6], [1, 3, 4]],
      [2, 4, [4, 5], [0, 2]],
    ]);
  });

  test('familyNoOf reads forms and rows, 1 when unset', () => {
    assert.equal(familyNoOf({ familyNo: 3 }), 3);
    assert.equal(familyNoOf({ family_no: 2 }), 2);
    assert.equal(familyNoOf({}), 1);
    assert.equal(familyNoOf({ family_no: 'x' }), 1);
  });

  test('familyHeadIndex: the Household Head heads family 1, a Head of Family the others', () => {
    assert.equal(familyHeadIndex(rows, 1), 0);
    assert.equal(familyHeadIndex(rows, 2), 3);
    assert.equal(familyHeadIndex(rows, 3), -1);
  });

  test('nextFamilyNo and familyHeadName', () => {
    assert.equal(nextFamilyNo(rows), 3);
    assert.equal(nextFamilyNo([]), 1);
    assert.equal(familyHeadName(rows[3]), 'Pedro Dela Cruz');
    assert.equal(familyHeadName({ firstName: 'Ana', lastName: 'Cruz', suffix: '' }), 'Ana Cruz');
    assert.equal(familyHeadName(null), '');
  });

  test('familyTitle names a family by its head', () => {
    const [first, second] = familiesOf(rows);
    assert.equal(familyTitle(second), 'Family of Pedro Dela Cruz');
    assert.equal(familyTitle({ ...first, head: null }), 'Household Head’s family');
    assert.equal(familyTitle({ familyNo: 3, head: null }), 'Family 3');
  });

  test('a spouse in the second family follows their own head, not the Household Head', () => {
    const ms = syncSpouses([
      head({ civilStatus: 'Widowed' }),
      member({ relationship: 'Head of Family', familyNo: 2, civilStatus: 'Married' }),
      member({ relationship: 'Spouse', familyNo: 2, civilFromHead: true }),
    ]);
    assert.equal(ms[2].civilStatus, 'Married');
  });

  test('each family head shares a wedding only with the spouse in their family', () => {
    const w1 = { matType: 'Catholic Marriage', hasMatrimony: true, matDate: '1990-01-01', matChurch: 'OLG' };
    const w2 = { matType: 'Catholic Marriage', hasMatrimony: true, matDate: '2018-06-09', matChurch: 'San Isidro' };
    const ms = syncSpouses([
      head({ civilStatus: 'Married', ...w1 }),
      member({ relationship: 'Spouse', civilStatus: 'Married' }),
      member({ relationship: 'Head of Family', familyNo: 2, civilStatus: 'Married', ...w2 }),
      member({ relationship: 'Spouse', familyNo: 2, civilStatus: 'Married' }),
    ]);
    assert.equal(ms[1].matDate, '1990-01-01');
    assert.equal(ms[3].matDate, '2018-06-09');
    const couples = weddingCouples(ms);
    assert.deepEqual([...couples.entries()], [[0, [1]], [1, [0]], [2, [3]], [3, [2]]]);
  });
});

describe('families on the registration forms', () => {
  test('familyTag names a member\'s family by number', () => {
    assert.equal(familyTag(member()), 'Family #1');
    assert.equal(familyTag(member({ familyNo: 3 })), 'Family #3');
  });

  test('compactFamilies closes the gap a removed family leaves', () => {
    const ms = [head(), member({ familyNo: 1 }), member({ familyNo: 3, relationship: 'Head of Family' }), member({ familyNo: 4 })];
    assert.deepEqual(compactFamilies(ms).map(familyNoOf), [1, 1, 2, 3]);
    const tidy = [head(), member({ familyNo: 2 })];
    assert.equal(compactFamilies(tidy), tidy);
  });
});

describe('the same person entered twice', () => {
  const pedro = head({ firstName: 'Pedro', lastName: 'Dela Cruz', dob: '1970-03-01' });

  test('the Household Head entered again as a member is the same person', () => {
    assert.ok(samePerson(member({ firstName: ' pedro ', lastName: 'dela  cruz' }), pedro));
    assert.ok(samePerson(member({ firstName: 'Pedro', lastName: 'Dela Cruz', dob: '1970-03-01' }), pedro));
    assert.equal(repeatedMember([pedro, member({ firstName: 'Maria', lastName: 'Dela Cruz' }), member({ firstName: 'Pedro', lastName: 'Dela Cruz' })], 2), 0);
  });

  test('a son of the same name differs by birthday, suffix or middle name', () => {
    assert.equal(samePerson(member({ firstName: 'Pedro', lastName: 'Dela Cruz', dob: '1999-05-05' }), pedro), false);
    assert.equal(samePerson(member({ firstName: 'Pedro', lastName: 'Dela Cruz', suffix: 'Jr.' }), pedro), false);
    assert.equal(samePerson(member({ firstName: 'Pedro', lastName: 'Dela Cruz', middleName: 'Santos' }), { ...pedro, middleName: 'Reyes' }), false);
    assert.ok(samePerson(member({ firstName: 'Pedro', lastName: 'Dela Cruz', suffix: 'Jr' }), { ...pedro, suffix: 'Jr.' }));
  });

  test('a form member is compared with database rows', () => {
    const row = { first_name: 'Pedro', last_name: 'Dela Cruz', suffix: null, dob: '1970-03-01', relationship: 'Head of Household' };
    assert.ok(samePerson({ firstName: 'Pedro', lastName: 'Dela Cruz', suffix: '', dob: '' }, row));
  });

  test('blank names never match', () => {
    assert.equal(samePerson(member(), member()), false);
    assert.equal(repeatedMember([head()], 0), -1);
  });
});

test('spouseSex is the other sex from the family head', () => {
  assert.equal(spouseSex('Male'), 'Female');
  assert.equal(spouseSex('Female'), 'Male');
  assert.equal(spouseSex(''), '');
});

describe('what a member is old enough for', () => {
  const today = new Date('2026-10-05T12:00:00');

  test('First Communion and Confirmation from 7, Matrimony and roles from 12', () => {
    assert.deepEqual(askedForAge('2022-01-01', today), { communion: false, confirmation: false, matrimony: false, roles: false });
    assert.deepEqual(askedForAge('2019-01-01', today), { communion: true, confirmation: true, matrimony: false, roles: false });
    assert.deepEqual(askedForAge('2014-01-01', today), { communion: true, confirmation: true, matrimony: true, roles: true });
  });

  test('everything is asked while the birthday is unknown', () => {
    assert.deepEqual(askedForAge('', today), { communion: true, confirmation: true, matrimony: true, roles: true });
  });

  test('clearForAge drops what a child is too young for', () => {
    const child = member({
      dob: '2021-02-02', hasBaptism: true, baptismDate: '2021-05-01',
      hasCommunion: true, communionChurch: 'OLG', hasConfirmation: true, confName: 'Jose', hasMatrimony: true, matType: 'Civil Wedding',
      gkkRole: 'Secretary', parishRole: 'PPC Officer',
    });
    const out = clearForAge(child, today);
    assert.equal(out.hasBaptism, true);
    assert.equal(out.baptismDate, '2021-05-01');
    assert.equal(out.hasCommunion, false);
    assert.equal(out.communionChurch, '');
    assert.equal(out.hasConfirmation, false);
    assert.equal(out.confName, '');
    assert.equal(out.hasMatrimony, false);
    assert.equal(out.matType, '');
    assert.equal(out.gkkRole, '');
    assert.equal(out.parishRole, '');
  });

  test('toPayloadMember sends nothing a young child is too young for', () => {
    const p = toPayloadMember(member({ firstName: 'ana', lastName: 'cruz', dob: '2023-01-01', hasCommunion: true, gkkRole: 'Secretary' }));
    assert.equal(p.firstName, 'Ana');
    assert.equal(p.hasCommunion, false);
    assert.equal(p.gkkRole, '');
  });
});
