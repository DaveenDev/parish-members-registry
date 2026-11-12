import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readdirSync } from 'node:fs';
import {
  blankMember, OCCUPATION_GROUPS, OFW_STATUSES, SEA_BASED_GROUP, OFW_OCCUPATION_GROUPS, LOCAL_OCCUPATION_GROUPS,
} from '../src/constants.js';
import { OCCUPATION_GROUP_LABELS, OFW_STATUS_BIS_LABELS, OFW_GROUP_LABELS, LOCAL_GROUP_LABELS } from '../src/lib/bisaya.js';
import { clearForAge, clearOfwForAnswer, toPayloadMember } from '../src/lib/household.js';
import {
  ofwLine, ofwLineBis, ofwOf, ofwPatch, ofwYearErrors, ofwBase, occupationGroupLabel, suggestOccupationGroup, unsortedOccupations, ofwFromForm,
  occupationGroupsFor, occupationGroupBisFor,
} from '../src/lib/ofw.js';
import {
  occupationRows, ofwHouseholdsByGkkRows, ofwByWorkRows, familiesWithParentAbroad, returnedOfwRows, ofwToCheck,
  missingDetails, statsSections,
} from '../src/lib/reports.js';
import { shapeOfw, shapeOccupations, shapeReport } from '../src/lib/stats.js';
import { practiceLevel, PRACTICE_LEVELS, PRACTICE_TONES, PRACTICE_LEVEL_HELP, isRated } from '../src/lib/practice.js';
import { levelMix } from '../src/lib/activeness.js';
import { summarizeCensus } from '../src/lib/census.js';
import { describeActivity } from '../src/lib/activity.js';

const today = new Date('2026-11-12T12:00:00');

describe('the lists', () => {
  test('blankMember() has the occupation group and OFW keys, all blank', () => {
    const m = blankMember();
    for (const k of ['occupationGroup', 'ofwStatus', 'ofwSince']) assert.equal(m[k], '', k);
    assert.ok(!('ofwCountry' in m) && !('ofwReturned' in m), 'no country and no year home are asked');
  });

  test('the occupation groups are the database list, each with a Bisaya label', () => {
    // The latest migration that makes occupation_groups().
    const dir = new URL('../../supabase/migrations/', import.meta.url);
    const latest = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
      .map((f) => readFileSync(new URL(f, dir), 'utf8')).filter((t) => t.includes('function public.occupation_groups()')).pop();
    const list = latest.slice(latest.indexOf('function public.occupation_groups()'));
    const inSql = [...list.slice(0, list.indexOf('$$;', list.indexOf('$$') + 2)).matchAll(/'([^']+)'/g)].map((x) => x[1]);
    assert.deepEqual(inSql, OCCUPATION_GROUPS);
    for (const g of OCCUPATION_GROUPS) {
      assert.ok(OCCUPATION_GROUP_LABELS[g]?.trim(), `"${g}" has no Bisaya label`);
      assert.ok(g.length <= 60);
    }
    assert.ok(OCCUPATION_GROUPS.includes(SEA_BASED_GROUP));
    for (const s of OFW_STATUSES) assert.ok(OFW_STATUS_BIS_LABELS[s], s);
  });

  test('the public Category list follows the OFW answer, each group with a label', () => {
    for (const [list, labels] of [[OFW_OCCUPATION_GROUPS, OFW_GROUP_LABELS], [LOCAL_OCCUPATION_GROUPS, LOCAL_GROUP_LABELS]]) {
      assert.equal(new Set(list).size, list.length, 'no group twice');
      for (const g of list) {
        assert.ok(OCCUPATION_GROUPS.includes(g), `"${g}" is a stored group`);
        assert.ok(labels[g]?.trim(), `"${g}" has a label`);
      }
      assert.ok(list.includes('Other'));
    }
    assert.ok(OCCUPATION_GROUPS.every((g) => OFW_OCCUPATION_GROUPS.includes(g) || LOCAL_OCCUPATION_GROUPS.includes(g)), 'every group on a list');
    assert.equal(occupationGroupsFor('Abroad'), OFW_OCCUPATION_GROUPS);
    assert.equal(occupationGroupsFor('Returned'), OFW_OCCUPATION_GROUPS);
    assert.equal(occupationGroupsFor(''), LOCAL_OCCUPATION_GROUPS);
    assert.equal(occupationGroupsFor(undefined), LOCAL_OCCUPATION_GROUPS);
    for (const g of ['Student', 'Homemaker', 'Farming or fishing', 'Government, police or military']) {
      assert.ok(!OFW_OCCUPATION_GROUPS.includes(g), `"${g}" isn't OFW work`);
    }
    assert.equal(occupationGroupBisFor('Household service or caregiver', 'Abroad'), OFW_GROUP_LABELS['Household service or caregiver']);
    assert.equal(occupationGroupBisFor('Household service or caregiver', ''), LOCAL_GROUP_LABELS['Household service or caregiver']);
    assert.equal(occupationGroupBisFor('Student', 'Abroad'), OCCUPATION_GROUP_LABELS.Student, 'a group given before keeps a label');
  });
});

describe('a member\'s OFW answer', () => {
  test('only abroad now keeps the contract year', () => {
    const m = { ...blankMember(), ofwSince: '2019' };
    assert.equal(clearOfwForAnswer({ ...m, ofwStatus: '' }).ofwSince, '');
    assert.equal(clearOfwForAnswer({ ...m, ofwStatus: 'Returned' }).ofwSince, '');
    assert.equal(clearOfwForAnswer({ ...m, ofwStatus: 'Abroad' }).ofwSince, '2019');
  });

  test('the forms\' payload: no year for a "Dili", no OFW answer under 18, no group under 15', () => {
    const adult = { ...blankMember(), firstName: 'Jose', lastName: 'Cruz', dob: '1980-01-01', occupationGroup: 'Seafarer' };
    const dili = toPayloadMember({ ...adult, ofwStatus: '', ofwSince: '2020' });
    assert.equal(dili.ofwSince, '');
    assert.equal(dili.occupationGroup, 'Seafarer');
    const teen = clearForAge({ ...adult, dob: '2010-06-01', ofwStatus: 'Abroad', ofwSince: '2024' }, today);
    assert.equal(teen.ofwStatus, '');
    assert.equal(teen.ofwSince, '');
    assert.equal(teen.occupationGroup, 'Seafarer', 'asked from 15');
    const child = clearForAge({ ...adult, dob: '2014-06-01' }, today);
    assert.equal(child.occupationGroup, '');
  });

  test('ofwOf reads a stored row: the year only abroad now, as a number', () => {
    assert.equal(ofwOf({ ofw_status: null }), null);
    assert.equal(ofwOf({ ofw_status: 'Maybe' }), null);
    assert.deepEqual(ofwOf({ ofw_status: 'Abroad', ofw_since: '2019' }), { status: 'Abroad', since: 2019 });
    assert.deepEqual(ofwOf({ ofw_status: 'Abroad', ofw_since: null }), { status: 'Abroad', since: null });
    assert.deepEqual(ofwOf({ ofw_status: 'Returned', ofw_since: 2019 }), { status: 'Returned', since: null });
  });

  test('the staff line and the Bisaya line', () => {
    assert.equal(ofwLine({ ofw_status: 'Abroad', ofw_since: 2019 }), 'OFW · since 2019');
    assert.equal(ofwLine({ ofw_status: 'Abroad' }), 'OFW');
    assert.equal(ofwLine({ ofw_status: 'Returned' }), 'Former OFW');
    assert.equal(ofwLine({}), '');
    assert.equal(ofwLineBis({ ofw_status: 'Abroad', ofw_since: 2024 }), 'OFW · sukad 2024');
    assert.equal(ofwLineBis({ ofw_status: 'Returned' }), 'Kanhi OFW');
    assert.deepEqual(ofwFromForm({ ofwStatus: 'Abroad', ofwSince: '2024' }), { ofw_status: 'Abroad', ofw_since: '2024' });
  });

  test('the contract year: optional, 1950 to next year, only abroad now', () => {
    assert.deepEqual(ofwYearErrors({ status: '', since: '1800' }), {});
    assert.deepEqual(ofwYearErrors({ status: 'Returned', since: '1800' }), {});
    assert.deepEqual(ofwYearErrors({ status: 'Abroad', since: '' }), {}, 'blank is fine');
    assert.deepEqual(ofwYearErrors({ status: 'Abroad', since: '2027' }, { today }), {});
    assert.match(ofwYearErrors({ status: 'Abroad', since: '2028' }, { today }).since, /1950 to 2027/);
    assert.match(ofwYearErrors({ status: 'Abroad', since: '19' }, { today, lang: 'bis' }).since, /Isulat ang tuig, 1950 hangtod 2027/);
  });

  test('the member window saves the answer whole', () => {
    assert.deepEqual(ofwPatch({ occupation_group: 'Teacher', ofw_status: '', ofw_since: '2019' }),
      { occupation_group: 'Teacher', ofw_status: null, ofw_since: null });
    assert.deepEqual(ofwPatch({ occupation_group: 'Astronaut', ofw_status: 'Abroad', ofw_since: '2019' }),
      { occupation_group: null, ofw_status: 'Abroad', ofw_since: 2019 });
    assert.deepEqual(ofwPatch({ ofw_status: 'Returned', ofw_since: 2015 }), { occupation_group: null, ofw_status: 'Returned', ofw_since: null });
    assert.equal(ofwPatch({ ofw_status: 'Abroad', ofw_since: '' }).ofw_since, null);
  });

  test('sea-based is the seafarers; the rest land-based', () => {
    assert.equal(ofwBase('Seafarer'), 'Sea-based');
    assert.equal(ofwBase('Household service or caregiver'), 'Land-based');
    assert.equal(occupationGroupLabel('Professional'), 'Professional (doctor, engineer, lawyer…)');
  });
});

describe('Sort occupations', () => {
  test('a suggestion from the words, never a guess for something unknown', () => {
    assert.equal(suggestOccupationGroup('Farmer'), 'Farming or fishing');
    assert.equal(suggestOccupationGroup('nag-uma'), 'Farming or fishing');
    assert.equal(suggestOccupationGroup('Mag-uuma'), 'Farming or fishing');
    assert.equal(suggestOccupationGroup('Seaman'), 'Seafarer');
    assert.equal(suggestOccupationGroup('Caregiver in Taiwan'), 'Household service or caregiver');
    assert.equal(suggestOccupationGroup('Public school teacher'), 'Teacher');
    assert.equal(suggestOccupationGroup('Nurse at Davao Doctors'), 'Health worker');
    assert.equal(suggestOccupationGroup('Tindera sa merkado'), 'Business or vendor');
    assert.equal(suggestOccupationGroup('housewife'), 'Homemaker');
    assert.equal(suggestOccupationGroup('Estudyante'), 'Student');
    assert.equal(suggestOccupationGroup('Waiter sa Dubai'), 'Hotel, restaurant or cleaning');
    assert.equal(suggestOccupationGroup('Cook sa cruise ship'), 'Seafarer');
    assert.equal(suggestOccupationGroup('xyz'), null);
    assert.equal(suggestOccupationGroup(''), null);
  });

  test('the same words typed differently are one answer, most common first; sorted ones are left out', () => {
    const rows = unsortedOccupations([
      { id: 1, occupation: 'Farmer' }, { id: 2, occupation: 'farmer ' }, { id: 3, occupation: 'Farmer.' },
      { id: 4, occupation: 'Driver' }, { id: 5, occupation: 'Teacher', occupation_group: 'Teacher' }, { id: 6, occupation: '  ' },
    ]);
    assert.deepEqual(rows.map((r) => [r.label, r.count, r.suggestion]), [['Farmer', 3, 'Farming or fishing'], ['Driver', 1, 'Driver or transport']]);
    assert.deepEqual(rows[0].ids, [1, 2, 3]);
  });
});

describe('the OFW reports', () => {
  const m = (patch) => ({ id: Math.random(), household_id: 1, family_no: 1, household_name: 'Cruz', household_gkk: 'GKK A', sex: 'Male', age: 40, ...patch });

  test('by occupation: 15 and over, groups first, then "Not sorted yet" and "Not given"', () => {
    const { rows, total } = occupationRows([
      m({ occupation_group: 'Teacher', sex: 'Female' }), m({ occupation_group: 'Teacher' }), m({ occupation_group: 'Seafarer' }),
      m({ occupation: 'nag-uma' }), m({}), m({ age: 10, occupation_group: 'Student' }), m({ age: null, occupation: '' }),
    ]);
    assert.equal(total, 6);
    assert.deepEqual(rows.map((r) => [r.label, r.total]), [['Teacher', 2], ['Seafarer', 1], ['Not sorted yet', 1], ['Not given', 2]]);
    assert.deepEqual([rows[0].male, rows[0].female, rows[0].share], [1, 1, '33%']);
  });

  test('OFW households by GKK: households with a member abroad, the share, the members abroad', () => {
    const { rows, total } = ofwHouseholdsByGkkRows([
      { gkk: 'GKK B', ofw_abroad_count: 0 }, { gkk: 'GKK A', ofw_abroad_count: 2 }, { gkk: 'GKK A', ofw_abroad_count: 0 },
      { gkk: null, ofw_abroad_count: 1 },
    ]);
    assert.deepEqual(rows.map((r) => [r.label, r.households, r.ofwHouseholds, r.share, r.membersAbroad]),
      [['GKK A', 2, 1, '50%', 2], ['GKK B', 1, 0, '0%', 0], ['No GKK', 1, 1, '100%', 1]]);
    assert.deepEqual([total.households, total.ofwHouseholds, total.membersAbroad], [4, 2, 3]);
  });

  test('by kind of work: abroad now only, land or sea', () => {
    const { rows, total, seaBased } = ofwByWorkRows([
      m({ ofw_status: 'Abroad', occupation_group: 'Seafarer' }), m({ ofw_status: 'Abroad', occupation_group: 'Household service or caregiver' }),
      m({ ofw_status: 'Abroad', occupation_group: 'Household service or caregiver' }), m({ ofw_status: 'Abroad', occupation: 'welder' }),
      m({ ofw_status: 'Returned', occupation_group: 'Seafarer' }),
    ]);
    assert.equal(total, 4);
    assert.equal(seaBased, 1);
    assert.deepEqual(rows.map((r) => [r.label, r.base, r.members]),
      [['Household service or caregiver', 'Land-based', 2], ['Seafarer', 'Sea-based', 1], ['Not sorted yet', '—', 1]]);
  });

  test('families with a parent abroad: only with children under 18, counted per family', () => {
    const rows = familiesWithParentAbroad([
      m({ household_id: 1, relationship: 'Head of Household', first_name: 'Jose', last_name: 'Cruz', ofw_status: 'Abroad', ofw_since: 2019 }),
      m({ household_id: 1, relationship: 'Spouse', contact: '0917', ofw_status: null }),
      m({ household_id: 1, relationship: 'Son', age: 10 }), m({ household_id: 1, relationship: 'Daughter', age: 7 }),
      m({ household_id: 1, relationship: 'Son', age: 20 }),
      // A second family in the house, its head abroad but no children.
      m({ household_id: 1, family_no: 2, relationship: 'Head of Family', ofw_status: 'Abroad' }),
      // A son abroad isn't a parent.
      m({ household_id: 2, household_name: 'Reyes', relationship: 'Son', ofw_status: 'Abroad', age: 25 }), m({ household_id: 2, relationship: 'Grandchild', age: 3 }),
      // Back home: not abroad now.
      m({ household_id: 3, household_name: 'Santos', relationship: 'Head of Household', ofw_status: 'Returned' }), m({ household_id: 3, relationship: 'Son', age: 5 }),
    ]);
    assert.equal(rows.length, 1);
    assert.deepEqual([rows[0].household, rows[0].abroad, rows[0].children, rows[0].contact], ['Cruz', 'Jose Cruz (since 2019)', 2, '0917']);
  });

  test('returned OFWs, by GKK and name', () => {
    const rows = returnedOfwRows([m({ ofw_status: 'Returned', first_name: 'B' }), m({ ofw_status: 'Abroad' }), m({ ofw_status: 'Returned', first_name: 'A' })]);
    assert.deepEqual(rows.map((r) => r.first_name), ['A', 'B']);
  });

  test('details to check: abroad with no answer in 2 years, longest abroad first', () => {
    const rows = ofwToCheck([
      m({ first_name: 'A', ofw_status: 'Abroad' }),
      m({ first_name: 'B', ofw_status: 'Abroad', ofw_since: 2005, ofw_updated_at: '2023-01-01' }),
      m({ first_name: 'C', ofw_status: 'Abroad', ofw_since: 2005, ofw_updated_at: '2026-03-01' }),
      m({ first_name: 'D', ofw_status: 'Abroad', ofw_since: 2020, ofw_updated_at: '2024-01-01' }),
      m({ first_name: 'E', ofw_status: 'Returned' }),
    ], today);
    assert.deepEqual(rows.map((r) => [r.m.first_name, r.issue]), [
      ['B', 'Not confirmed in 2 years; abroad 21 years'], ['D', 'Not confirmed in 2 years'], ['A', 'Not confirmed in 2 years'],
    ]);
  });

  test('missing details: the occupation group from 15, only once the migration gives the column', () => {
    assert.ok(missingDetails({ age: 30, occupation_group: null }).includes('Occupation group'));
    assert.ok(!missingDetails({ age: 12, occupation_group: null }).includes('Occupation group'));
    assert.ok(!missingDetails({ age: 30 }).includes('Occupation group'));
  });
});

describe('Report Stats', () => {
  const raw = {
    ofw: {
      households_abroad: 3, households_returned: 1, members_abroad: 4, members_returned: 2,
      by_gkk: [{ gkk: 'GKK A', households: 2, members: 3 }, { gkk: null, households: 1, members: 1 }],
      by_work: [{ group: 'Seafarer', members: 3 }, { group: null, members: 1 }],
    },
    occupation_groups: [{ group: 'Teacher', members: 6 }, { group: 'Professional', members: 2 }],
    occupation_not_sorted: 1, occupation_not_given: 1,
  };

  test('the OFW numbers and occupation groups, none before 0121', () => {
    assert.equal(shapeOfw(undefined), null);
    assert.equal(shapeOccupations({}), null);
    const o = shapeOfw(raw.ofw);
    assert.deepEqual([o.householdsAbroad, o.membersAbroad, o.byGkk[1].gkk], [3, 4, 'No GKK']);
    assert.deepEqual(o.byWork.map((w) => [w.label, w.members]), [['Seafarer', 3], ['Not sorted or not given', 1]]);
    const oc = shapeOccupations(raw);
    assert.equal(oc.total, 10);
    assert.deepEqual(oc.rows.map((r) => [r.label, r.members, r.share]),
      [['Teacher', 6, '60%'], ['Professional (doctor, engineer, lawyer…)', 2, '20%'], ['Not sorted yet', 1, '10%'], ['Not given', 1, '10%']]);
  });

  test('printed and exported with the rest', () => {
    const stats = shapeReport({ households: 5, members: 10, ...raw });
    const titles = statsSections(stats).map((s) => s.title);
    assert.ok(titles.includes('OFW households') && titles.includes('OFWs by kind of work') && titles.includes('Occupation groups'));
    assert.ok(!statsSections(shapeReport({ households: 5 })).some((s) => /OFW|Occupation/.test(s.title)));
  });
});

describe('a member abroad in the practice score and the census', () => {
  test('"Abroad" is a level of its own, not rated', () => {
    assert.ok(PRACTICE_LEVELS.includes('Abroad'));
    assert.ok(PRACTICE_TONES.Abroad && PRACTICE_LEVEL_HELP.Abroad);
    assert.equal(isRated('Abroad'), false);
    assert.equal(practiceLevel({ score: 80, participation: 60, age: 40, abroad: true }), 'Abroad');
    assert.equal(practiceLevel({ score: 80, participation: 60, age: 40, abroad: true, isCurrent: false }), null);
  });

  test('left out of the practice percentages', () => {
    const mix = levelMix([{ practice_level: 'Aktibo', practice_score: 80 }, { practice_level: 'Abroad', practice_score: null }]);
    assert.deepEqual([mix.members, mix.rated, mix.aktiboPct], [2, 1, 100]);
  });

  test('the census counts a member abroad with no answer as "Abroad", accounted for', () => {
    const s = summarizeCensus([{ gkk: 'A', status: 'Active', members: 3 }, { gkk: 'A', status: 'Abroad', members: 1 }, { gkk: 'A', status: 'Not confirmed', members: 1 }]);
    assert.ok(s.columns.includes('Abroad'));
    assert.deepEqual([s.total.total, s.total.confirmed, s.total.counts.Abroad], [5, 4, 1]);
    assert.ok(!summarizeCensus([{ gkk: 'A', status: 'Active', members: 3 }]).columns.includes('Abroad'), 'no column when nobody is abroad');
  });
});

describe('the activity log', () => {
  test('names the new fields, the group and the answer as words', () => {
    const d = describeActivity({ action: 'update', table_name: 'members', changes: {
      ofw_status: [null, 'Abroad'], ofw_since: [null, 2019], occupation_group: [null, 'Professional'],
    } });
    assert.deepEqual(d.lines, [
      'OFW: Not an OFW → Abroad now', 'OFW contract since: — → 2019', 'Occupation group: — → Professional (doctor, engineer, lawyer…)',
    ]);
    const home = describeActivity({ action: 'update', table_name: 'members', changes: { ofw_status: ['Abroad', 'Returned'], ofw_since: [2019, null] } });
    assert.deepEqual(home.lines, ['OFW: Abroad now → Former OFW (back home)', 'OFW contract since: 2019 → —']);
  });
});
