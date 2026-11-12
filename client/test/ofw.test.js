import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { blankMember, OCCUPATION_GROUPS, OFW_STATUSES, OFW_COUNTRIES, SEA_BASED_GROUP } from '../src/constants.js';
import { OCCUPATION_GROUP_LABELS, OFW_STATUS_BIS_LABELS } from '../src/lib/bisaya.js';
import { clearForAge, clearOfwForAnswer, toPayloadMember } from '../src/lib/household.js';
import {
  ofwLine, ofwLineBis, ofwOf, ofwPatch, ofwYearErrors, ofwBase, countryChoice, occupationGroupLabel,
  suggestOccupationGroup, unsortedOccupations, ofwFromForm,
} from '../src/lib/ofw.js';
import {
  occupationRows, ofwHouseholdsByGkkRows, ofwByCountryRows, ofwByWorkRows, familiesWithParentAbroad, returnedOfwRows, ofwToCheck,
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
    for (const k of ['occupationGroup', 'ofwStatus', 'ofwCountry', 'ofwSince', 'ofwReturned']) assert.equal(m[k], '', k);
  });

  test('the occupation groups are the database list, each with a Bisaya label', () => {
    const sql = readFileSync(new URL('../../supabase/migrations/0121_member_ofw.sql', import.meta.url), 'utf8');
    const list = sql.slice(sql.indexOf('function public.occupation_groups()'));
    const inSql = [...list.slice(0, list.indexOf('$$;', list.indexOf('$$') + 2)).matchAll(/'([^']+)'/g)].map((x) => x[1]);
    assert.deepEqual(inSql, OCCUPATION_GROUPS);
    for (const g of OCCUPATION_GROUPS) {
      assert.ok(OCCUPATION_GROUP_LABELS[g]?.trim(), `"${g}" has no Bisaya label`);
      assert.ok(g.length <= 60);
    }
    assert.ok(OCCUPATION_GROUPS.includes(SEA_BASED_GROUP));
    for (const s of OFW_STATUSES) assert.ok(OFW_STATUS_BIS_LABELS[s], s);
    assert.equal(OFW_COUNTRIES.at(-1), 'Other');
  });
});

describe('a member\'s OFW answer', () => {
  test('"Dili" clears the rest, abroad now clears the year home', () => {
    const m = { ...blankMember(), ofwStatus: '', ofwCountry: 'Qatar', ofwSince: '2019', ofwReturned: '2022' };
    assert.deepEqual(ofwFromForm(clearOfwForAnswer(m)), { ofw_status: '', ofw_country: '', ofw_since: '', ofw_returned: '' });
    const abroad = clearOfwForAnswer({ ...m, ofwStatus: 'Abroad' });
    assert.equal(abroad.ofwCountry, 'Qatar');
    assert.equal(abroad.ofwReturned, '');
    const home = clearOfwForAnswer({ ...m, ofwStatus: 'Returned' });
    assert.equal(home.ofwReturned, '2022');
  });

  test('the forms\' payload: no OFW answer for a "Dili", none under 18, no group under 15', () => {
    const adult = { ...blankMember(), firstName: 'Jose', lastName: 'Cruz', dob: '1980-01-01', occupationGroup: 'Seafarer' };
    const dili = toPayloadMember({ ...adult, ofwStatus: '', ofwCountry: 'Japan', ofwSince: '2020' });
    assert.equal(dili.ofwCountry, '');
    assert.equal(dili.ofwSince, '');
    assert.equal(dili.occupationGroup, 'Seafarer');
    const teen = clearForAge({ ...adult, dob: '2010-06-01', ofwStatus: 'Abroad', ofwCountry: 'Japan' }, today);
    assert.equal(teen.ofwStatus, '');
    assert.equal(teen.ofwCountry, '');
    assert.equal(teen.occupationGroup, 'Seafarer', 'asked from 15');
    const child = clearForAge({ ...adult, dob: '2014-06-01' }, today);
    assert.equal(child.occupationGroup, '');
  });

  test('ofwOf reads a stored row, numbers for the years', () => {
    assert.equal(ofwOf({ ofw_status: null }), null);
    assert.equal(ofwOf({ ofw_status: 'Maybe' }), null);
    assert.deepEqual(ofwOf({ ofw_status: 'Abroad', ofw_country: ' Qatar ', ofw_since: '2019', ofw_returned: 2020 }),
      { status: 'Abroad', country: 'Qatar', since: 2019, returned: null });
  });

  test('the staff line and the Bisaya line', () => {
    assert.equal(ofwLine({ ofw_status: 'Abroad', ofw_country: 'Saudi Arabia', ofw_since: 2019 }), 'OFW · Saudi Arabia since 2019');
    assert.equal(ofwLine({ ofw_status: 'Abroad' }), 'OFW');
    assert.equal(ofwLine({ ofw_status: 'Returned', ofw_country: 'Qatar', ofw_since: 2015, ofw_returned: 2022 }), 'Former OFW (Qatar, 2015–2022)');
    assert.equal(ofwLine({ ofw_status: 'Returned' }), 'Former OFW');
    assert.equal(ofwLine({}), '');
    assert.equal(ofwLineBis({ ofw_status: 'Abroad', ofw_country: 'At sea (seafarer)', ofw_since: 2024 }), 'OFW · Sa dagat (seaman) sukad 2024');
    assert.equal(ofwLineBis({ ofw_status: 'Returned', ofw_country: 'Qatar', ofw_since: 2015, ofw_returned: 2022 }), 'Kanhi OFW (Qatar, 2015–2022)');
  });

  test('years: 1950 to next year, and home not before the contract', () => {
    assert.deepEqual(ofwYearErrors({ status: '', since: '1800' }), {});
    assert.deepEqual(ofwYearErrors({ status: 'Abroad', since: '2027' }, { today }), {});
    assert.match(ofwYearErrors({ status: 'Abroad', since: '2028' }, { today }).since, /1950 to 2027/);
    assert.match(ofwYearErrors({ status: 'Abroad', since: '19' }, { today }).since, /year/);
    assert.deepEqual(ofwYearErrors({ status: 'Abroad', since: '2019', returned: '2010' }, { today }), {}, 'the year home is not asked of someone abroad');
    assert.match(ofwYearErrors({ status: 'Returned', since: '2019', returned: '2010' }, { today }).returned, /before the contract/);
    assert.match(ofwYearErrors({ status: 'Returned', since: '2019', returned: '2010' }, { today, lang: 'bis' }).returned, /kontrata/);
  });

  test('the member window saves the answer whole', () => {
    assert.deepEqual(ofwPatch({ occupation_group: 'Teacher', ofw_status: '', ofw_country: 'Qatar', ofw_since: '2019', ofw_returned: '2021' }),
      { occupation_group: 'Teacher', ofw_status: null, ofw_country: null, ofw_since: null, ofw_returned: null });
    assert.deepEqual(ofwPatch({ occupation_group: 'Astronaut', ofw_status: 'Abroad', ofw_country: ' Qatar ', ofw_since: '2019', ofw_returned: '2021' }),
      { occupation_group: null, ofw_status: 'Abroad', ofw_country: 'Qatar', ofw_since: 2019, ofw_returned: null });
    assert.equal(ofwPatch({ ofw_status: 'Returned', ofw_since: 2015, ofw_returned: '2022' }).ofw_returned, 2022);
  });

  test('the country pick: a listed one, "Other" for a typed one', () => {
    assert.equal(countryChoice('Qatar'), 'Qatar');
    assert.equal(countryChoice('Brunei'), 'Other');
    assert.equal(countryChoice(''), '');
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

  test('by country: abroad now, then back home; "Not given" last', () => {
    const rows = ofwByCountryRows([
      m({ ofw_status: 'Abroad', ofw_country: 'Qatar' }), m({ ofw_status: 'Returned', ofw_country: 'Qatar' }),
      m({ ofw_status: 'Abroad', ofw_country: 'Japan' }), m({ ofw_status: 'Abroad', ofw_country: 'Japan' }),
      m({ ofw_status: 'Abroad' }), m({}),
    ]);
    assert.deepEqual(rows, [{ country: 'Japan', abroad: 2, returned: 0 }, { country: 'Qatar', abroad: 1, returned: 1 }, { country: 'Not given', abroad: 1, returned: 0 }]);
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
      m({ household_id: 1, relationship: 'Head of Household', first_name: 'Jose', last_name: 'Cruz', ofw_status: 'Abroad', ofw_country: 'Qatar' }),
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
    assert.deepEqual([rows[0].household, rows[0].abroad, rows[0].children, rows[0].contact], ['Cruz', 'Jose Cruz (Qatar)', 2, '0917']);
  });

  test('returned OFWs, the latest home first', () => {
    const rows = returnedOfwRows([m({ ofw_status: 'Returned', ofw_returned: 2019, first_name: 'A' }), m({ ofw_status: 'Abroad' }), m({ ofw_status: 'Returned', ofw_returned: 2024, first_name: 'B' })]);
    assert.deepEqual(rows.map((r) => r.first_name), ['B', 'A']);
  });

  test('details to check: abroad with no country, or 15+ years with no answer in 2 years', () => {
    const rows = ofwToCheck([
      m({ first_name: 'A', ofw_status: 'Abroad' }),
      m({ first_name: 'B', ofw_status: 'Abroad', ofw_country: 'Qatar', ofw_since: 2005, ofw_updated_at: '2023-01-01' }),
      m({ first_name: 'C', ofw_status: 'Abroad', ofw_country: 'Qatar', ofw_since: 2005, ofw_updated_at: '2026-03-01' }),
      m({ first_name: 'D', ofw_status: 'Abroad', ofw_country: 'Qatar', ofw_since: 2020 }),
      m({ first_name: 'E', ofw_status: 'Returned' }),
    ], today);
    assert.deepEqual(rows.map((r) => [r.m.first_name, r.issue]), [['A', 'No country'], ['B', 'Abroad over 15 years, not confirmed in 2 years']]);
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
      by_country: [{ country: 'Qatar', abroad: 3, returned: 1 }],
    },
    occupation_groups: [{ group: 'Teacher', members: 6 }, { group: 'Professional', members: 2 }],
    occupation_not_sorted: 1, occupation_not_given: 1,
  };

  test('the OFW numbers and occupation groups, none before 0121', () => {
    assert.equal(shapeOfw(undefined), null);
    assert.equal(shapeOccupations({}), null);
    const o = shapeOfw(raw.ofw);
    assert.deepEqual([o.householdsAbroad, o.membersAbroad, o.byGkk[1].gkk], [3, 4, 'No GKK']);
    const oc = shapeOccupations(raw);
    assert.equal(oc.total, 10);
    assert.deepEqual(oc.rows.map((r) => [r.label, r.members, r.share]),
      [['Teacher', 6, '60%'], ['Professional (doctor, engineer, lawyer…)', 2, '20%'], ['Not sorted yet', 1, '10%'], ['Not given', 1, '10%']]);
  });

  test('printed and exported with the rest', () => {
    const stats = shapeReport({ households: 5, members: 10, ...raw });
    const titles = statsSections(stats).map((s) => s.title);
    assert.ok(titles.includes('OFW households') && titles.includes('OFWs by country') && titles.includes('Occupation groups'));
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
      ofw_status: [null, 'Abroad'], ofw_country: [null, 'Qatar'], ofw_since: [null, 2019], occupation_group: [null, 'Professional'],
    } });
    assert.deepEqual(d.lines, [
      'OFW: Not an OFW → Abroad now', 'OFW country: — → Qatar', 'OFW since: — → 2019', 'Occupation group: — → Professional (doctor, engineer, lawyer…)',
    ]);
    const home = describeActivity({ action: 'update', table_name: 'members', changes: { ofw_status: ['Abroad', 'Returned'], ofw_returned: [null, 2026] } });
    assert.deepEqual(home.lines, ['OFW: Abroad now → Former OFW (back home)', 'OFW returned: — → 2026']);
  });
});
