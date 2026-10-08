import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  sacramentProgressRows, turnaroundRows, registrationsByMonth, monthName, familiesByGkkRows, missingSacrament, candidatesByGkk, churchWeddingCandidates,
  weddingSituation, sacramentsByYear, ageSexRows, breakdownRows, inAgeGroup, celebrationsInMonth, statusChanges, waitingForVerification, volunteerPool,
  helpWayLabel, verificationsByStaff, groupMakeupRows, busyMembers, gkkOfficerRows, parishRoleRows, requestOutcomeRows, parseFee, feesByMonth, peso,
  missingDetails, dataQualityByGkk, householdProblems, censusComparisonRows, statsSections, sectionsCsv, registrationProgress, progressText,
} from '../src/lib/reports.js';
import { HEAD } from '../src/constants.js';

describe('sacramentProgressRows', () => {
  test('counts claims and verifications per GKK, with No GKK last', () => {
    const rows = sacramentProgressRows([
      { household_gkk: 'GKK B', has_baptism: true, baptism_verified: true, has_communion: true },
      { household_gkk: 'GKK B', has_baptism: true },
      { household_gkk: null, has_confirmation: true },
      { household_gkk: 'GKK A' },
    ]);
    assert.deepEqual(rows.map((r) => r.label), ['GKK A', 'GKK B', 'No GKK']);
    const b = rows[1];
    assert.deepEqual([b.members, b.baptism.claimed, b.baptism.verified, b.communion.claimed, b.waiting], [2, 2, 1, 1, 2]);
    assert.equal(rows[2].waiting, 1);
  });
});

describe('turnaroundRows', () => {
  const day = (n) => new Date(Date.UTC(2026, 8, n)).toISOString();
  const reqs = [
    { cert_type: 'baptism', created_at: day(1), released_at: day(3), status: 'Released' },
    { cert_type: 'baptism', created_at: day(2), released_at: day(8), status: 'Released' },
    { cert_type: 'baptism', created_at: day(5), status: 'Received' },
    { cert_type: 'baptism', created_at: day(6), status: 'Cannot issue' },
    { cert_type: 'marriage', created_at: day(20), status: 'Being prepared' },
  ];

  test('average and longest days to release, and open requests', () => {
    const [b, m] = turnaroundRows(reqs, { now: Date.UTC(2026, 8, 25) });
    assert.deepEqual([b.received, b.released, b.avgDays, b.maxDays, b.open, b.oldestOpen], [4, 2, 4, 6, 1, 20]);
    assert.deepEqual([m.received, m.released, m.avgDays, m.open], [1, 0, null, 1]);
  });

  test('only requests received in the date range count', () => {
    const rows = turnaroundRows(reqs, { dateFrom: '2026-09-10', now: Date.UTC(2026, 8, 25) });
    assert.deepEqual(rows.map((r) => r.label), ['marriage']);
  });
});

test('registrationsByMonth groups by month, oldest first', () => {
  const rows = registrationsByMonth([
    { created_at: '2026-03-15T08:00:00', member_count: 4, status: 'Verified' },
    { created_at: '2026-01-02T08:00:00', member_count: 2, status: 'Pending' },
    { created_at: '2026-03-01T08:00:00', member_count: 3, status: 'Pending' },
  ]);
  assert.deepEqual(rows, [
    { month: '2026-01', households: 1, members: 2, verified: 0 },
    { month: '2026-03', households: 2, members: 7, verified: 1 },
  ]);
  assert.equal(monthName('2026-03'), 'March 2026');
});

describe('familiesByGkkRows', () => {
  test('counts households, families and houses with 2+ families per GKK, with No GKK last', () => {
    const rows = familiesByGkkRows([
      { gkk: 'GKK B', family_count: 2, member_count: 7 },
      { gkk: 'GKK B', family_count: 1, member_count: 3 },
      { gkk: null, family_count: null, member_count: 2 },
      { gkk: 'GKK A', family_count: 3, member_count: 9 },
    ]);
    assert.deepEqual(rows.map((r) => [r.label, r.households, r.families, r.multi, r.members]), [
      ['GKK A', 1, 3, 1, 9],
      ['GKK B', 2, 3, 1, 10],
      ['No GKK', 1, 1, 0, 2],
    ]);
  });
});

describe('sacrament candidates', () => {
  const m = (o) => ({ household_gkk: 'GKK A', has_baptism: true, has_communion: false, has_confirmation: false, has_matrimony: false, age: 30, ...o });

  test('only members old enough count as missing a sacrament; no birth date still counts', () => {
    assert.equal(missingSacrament(m({ age: 3 }), 'communion'), false);
    assert.equal(missingSacrament(m({ age: 8 }), 'communion'), true);
    assert.equal(missingSacrament(m({ age: null }), 'confirmation'), true);
    assert.equal(missingSacrament(m({ age: 16 }), 'matrimony'), false);
    assert.equal(missingSacrament(m({ has_baptism: false, age: 0 }), 'baptism'), true);
  });

  test('candidatesByGkk counts per GKK with a total', () => {
    const { rows, total } = candidatesByGkk([m({ age: 2 }), m({ age: 10, has_communion: true }), m({ household_gkk: null, has_baptism: false })]);
    assert.deepEqual(rows.map((r) => [r.label, r.members, r.baptism, r.communion, r.confirmation]), [['GKK A', 2, 0, 0, 1], ['No GKK', 1, 1, 1, 1]]);
    assert.deepEqual([total.members, total.baptism, total.communion, total.confirmation], [3, 1, 1, 2]);
  });
});

describe('churchWeddingCandidates', () => {
  const base = { household_id: 1, family_no: 1, household_name: 'Santos', household_gkk: 'GKK A', has_matrimony: false };

  test('pairs a family head with their spouse, and gives anyone else their own row', () => {
    const rows = churchWeddingCandidates([
      { ...base, first_name: 'Juan', last_name: 'Santos', relationship: HEAD, civil_status: 'Live-in', contact: '0917' },
      { ...base, first_name: 'Maria', last_name: 'Cruz', relationship: 'Spouse', civil_status: 'Live-in' },
      { ...base, first_name: 'Pedro', last_name: 'Santos', relationship: 'Son', civil_status: 'Married', mat_type: 'Civil Wedding', mat_date: '2020-02-14' },
    ]);
    assert.deepEqual(rows.map((r) => [r.names, r.situation, r.contact]), [
      ['Juan Santos & Maria Cruz', 'Living together (live-in)', '0917'],
      ['Pedro Santos', 'Civil wedding only', '—'],
    ]);
    assert.equal(rows[1].married, '2020-02-14');
  });

  test('leaves out church weddings, singles, widows and the separated', () => {
    assert.equal(weddingSituation({ civil_status: 'Married', has_matrimony: true }), null);
    assert.equal(weddingSituation({ civil_status: 'Married', mat_type: 'Catholic' }), null);
    assert.equal(weddingSituation({ civil_status: 'Widowed', mat_type: 'Civil Wedding' }), null);
    assert.equal(weddingSituation({ civil_status: 'Single' }), null);
    assert.equal(weddingSituation({ civil_status: 'Married' }), 'Married, no church wedding on record');
    assert.equal(weddingSituation({ mat_type: 'Other Sect Wedding' }), 'Wedding in another church');
  });
});

test('sacramentsByYear counts a wedding once per couple and keeps undated ones apart', () => {
  const { rows, undated } = sacramentsByYear([
    { household_id: 1, family_no: 1, has_baptism: true, baptism_date: '1990-05-01', has_matrimony: true, mat_date: '2015-06-20' },
    { household_id: 1, family_no: 1, has_baptism: true, baptism_date: '2015-01-10', has_matrimony: true, mat_date: '2015-06-20' },
    { household_id: 2, has_baptism: true, has_communion: true, communion_date: '2015-04-01' },
  ]);
  assert.deepEqual(rows, [
    { year: 2015, baptism: 1, communion: 1, confirmation: 0, matrimony: 1 },
    { year: 1990, baptism: 1, communion: 0, confirmation: 0, matrimony: 0 },
  ]);
  assert.equal(undated.baptism, 1);
});

describe('member breakdowns', () => {
  test('ageSexRows buckets by age and sex, with no birth date apart', () => {
    const { rows, total } = ageSexRows([{ age: 3, sex: 'Male' }, { age: 5, sex: 'Female' }, { age: 80, sex: 'Female' }, { age: null }]);
    assert.deepEqual(rows[0], { label: '0–6', male: 1, female: 1, other: 0, total: 2, share: '50%' });
    assert.equal(rows.at(-2).label, '75 and up');
    assert.deepEqual(rows.at(-1), { label: 'No birth date', male: 0, female: 0, other: 1, total: 1, share: '25%' });
    assert.equal(total.total, 4);
  });

  test('breakdownRows sorts by count, Not recorded last, and can leave out children', () => {
    const { rows, total } = breakdownRows([
      { civil_status: 'Married', sex: 'Male', age: 40 }, { civil_status: 'Married', sex: 'Female', age: 38 },
      { civil_status: 'Single', age: 20 }, { civil_status: '', age: 50 }, { civil_status: 'Single', age: 5 },
    ], 'civil_status', { adultsOnly: true });
    assert.deepEqual(rows.map((r) => [r.label, r.total, r.share]), [['Married', 2, '50%'], ['Single', 1, '25%'], ['Not recorded', 1, '25%']]);
    assert.equal(rows[0].male, 1);
    assert.equal(total, 4);
  });

  test('inAgeGroup needs a known age in the range', () => {
    assert.equal(inAgeGroup({ age: 13 }, 'youth'), true);
    assert.equal(inAgeGroup({ age: 60 }, 'seniors'), true);
    assert.equal(inAgeGroup({ age: null }, 'children'), false);
  });
});

describe('celebrationsInMonth', () => {
  const people = [
    { first_name: 'Ana', last_name: 'Reyes', dob: '2000-03-15', household_id: 1, family_no: 1, mat_date: '2020-03-02', has_matrimony: true, household_name: 'Reyes', household_gkk: 'GKK A' },
    { first_name: 'Ben', last_name: 'Reyes', dob: '1998-04-01', household_id: 1, family_no: 1, mat_date: '2020-03-02', has_matrimony: true, household_name: 'Reyes', household_gkk: 'GKK A', contact: '0918' },
    { first_name: 'Cy', last_name: 'Lim', dob: '2010-03-01', household_name: 'Lim' },
  ];

  test('birthdays in the month by day, with the age reached that year', () => {
    const rows = celebrationsInMonth(people, 3, 'birthday', 2026);
    assert.deepEqual(rows.map((r) => [r.day, r.name, r.years]), [[1, 'Cy Lim', 16], [15, 'Ana Reyes', 26]]);
  });

  test('anniversaries are one row per couple', () => {
    const rows = celebrationsInMonth(people, '3', 'anniversary', 2026);
    assert.deepEqual(rows.map((r) => [r.day, r.name, r.years, r.type, r.contact]), [[2, 'Ana Reyes & Ben Reyes', 6, 'Catholic Marriage', '0918']]);
  });
});

test('statusChanges filters by status and by when it was recorded, newest first', () => {
  const list = [
    { first_name: 'A', membership_status: 'Deceased', status_updated_at: '2026-01-05T00:00:00' },
    { first_name: 'B', membership_status: 'Deceased', status_updated_at: '2026-06-05T00:00:00' },
    { first_name: 'C', membership_status: 'Moved away', status_updated_at: '2026-06-01T00:00:00' },
    { first_name: 'D', membership_status: 'Deceased' },
  ];
  assert.deepEqual(statusChanges(list, ['Deceased']).map((m) => m.first_name), ['B', 'A', 'D']);
  assert.deepEqual(statusChanges(list, ['Deceased'], { dateFrom: '2026-02-01' }).map((m) => m.first_name), ['B']);
});

describe('household reports', () => {
  const now = Date.UTC(2026, 9, 8);
  test('waitingForVerification: pending only, longest waiting first', () => {
    const rows = waitingForVerification([
      { household_name: 'A', status: 'Pending', created_at: '2026-10-01T00:00:00Z' },
      { household_name: 'B', status: 'Verified', created_at: '2026-01-01T00:00:00Z' },
      { household_name: 'C', status: 'Pending', created_at: '2026-09-08T00:00:00Z' },
    ], now);
    assert.deepEqual(rows.map((h) => [h.household_name, h.days]), [['C', 30], ['A', 7]]);
  });

  test('volunteerPool: Yes before Maybe, and the help ways get short names', () => {
    const rows = volunteerPool([
      { household_name: 'A', volunteer: 'Maybe', gkk: 'GKK A' }, { household_name: 'B', volunteer: 'Yes', gkk: 'GKK B' }, { household_name: 'C', volunteer: 'No' },
    ]);
    assert.deepEqual(rows.map((h) => h.household_name), ['B', 'A']);
    assert.deepEqual(volunteerPool(rows, 'Maybe').map((h) => h.household_name), ['A']);
    assert.equal(helpWayLabel('sunday_mass'), 'Sunday Mass');
    assert.equal(helpWayLabel('pintakasi'), 'Pintakasi');
  });

  test('verificationsByStaff: per month and staff member, with average days', () => {
    const rows = verificationsByStaff([
      { created_at: '2026-09-01T00:00:00', verified_at: '2026-09-03T00:00:00', verified_by_name: 'Liza' },
      { created_at: '2026-09-01T00:00:00', verified_at: '2026-09-05T00:00:00', verified_by_name: 'Liza' },
      { created_at: '2026-08-01T00:00:00', verified_at: '2026-08-02T00:00:00' },
      { created_at: '2026-08-01T00:00:00' },
    ]);
    assert.deepEqual(rows, [
      { month: '2026-09', staff: 'Liza', verified: 2, avgDays: 3 },
      { month: '2026-08', staff: 'Not recorded', verified: 1, avgDays: 1 },
    ]);
  });
});

describe('ministries and roles', () => {
  const members = [
    { first_name: 'A', last_name: 'X', sex: 'Male', age: 15, household_gkk: 'GKK A', ministries: ['Choir', 'Lector'], organizations: ['CFC'] },
    { first_name: 'B', last_name: 'Y', sex: 'Female', age: null, household_gkk: 'GKK B', ministries: ['Choir'], organizations: [] },
  ];

  test('groupMakeupRows keeps empty groups and counts sex, age and GKKs', () => {
    const rows = groupMakeupRows(members, [{ name: 'Choir', kind: 'Ministry' }, { name: 'Ushers', kind: 'Ministry' }, { name: 'CFC', kind: 'Organization' }]);
    const choir = rows.find((r) => r.name === 'Choir');
    assert.deepEqual([choir.members, choir.male, choir.female, choir.under18, choir.noAge, choir.gkks], [2, 1, 1, 1, 1, 2]);
    assert.equal(rows.find((r) => r.name === 'Ushers').members, 0);
    assert.deepEqual(rows.map((r) => r.name), ['Choir', 'Ushers', 'CFC']);
  });

  test('busyMembers lists members in at least three groups', () => {
    assert.deepEqual(busyMembers(members).map((m) => [m.first_name, m.groups.length]), [['A', 3]]);
  });

  test('gkkOfficerRows shows vacant usual roles and any other role typed in', () => {
    const rows = gkkOfficerRows([
      { first_name: 'P', last_name: 'Q', household_gkk: 'GKK A', gkk_role: ' gkk president ' },
      { first_name: 'R', last_name: 'S', household_gkk: 'GKK A', gkk_role: 'Auditor' },
    ], ['GKK A']);
    assert.deepEqual(rows[0], { gkk: 'GKK A', role: 'GKK President', name: 'P Q', contact: '—', vacant: false });
    assert.equal(rows.filter((r) => r.vacant).length, 4);
    assert.equal(rows.at(-1).role, 'Auditor');
  });

  test('parishRoleRows sorts by role', () => {
    const rows = parishRoleRows([{ first_name: 'Z', parish_role: 'Treasurer' }, { first_name: 'Y', parish_role: 'Chair' }, { first_name: 'X' }]);
    assert.deepEqual(rows.map((r) => r.role), ['Chair', 'Treasurer']);
  });
});

describe('request reports', () => {
  test('requestOutcomeRows: done, closed, open and the average days to done', () => {
    const rows = requestOutcomeRows([
      { sacrament: 'ocia', status: 'Done', created_at: '2026-09-01T00:00:00Z', status_changed_at: '2026-09-11T00:00:00Z' },
      { sacrament: 'ocia', status: 'Cancelled', created_at: '2026-09-01T00:00:00Z' },
      { sacrament: 'anointing', status: 'New', created_at: '2026-10-01T00:00:00Z' },
    ], { groupOf: (r) => r.sacrament, done: 'Done', closed: ['Cancelled'], open: ['New', 'Contacted', 'Scheduled'], now: Date.UTC(2026, 9, 8) });
    assert.deepEqual(rows.map((r) => [r.label, r.received, r.done, r.closed, r.open, r.avgDays, r.oldestOpen]), [
      ['anointing', 1, 0, 0, 1, null, 7],
      ['ocia', 2, 1, 1, 0, 10, 0],
    ]);
  });

  test('parseFee reads typed amounts', () => {
    assert.equal(parseFee('₱150'), 150);
    assert.equal(parseFee('P 1,200.50'), 1200.5);
    assert.equal(parseFee('free'), null);
    assert.equal(parseFee(null), null);
  });

  test('feesByMonth totals released certificates per month', () => {
    const rows = feesByMonth([
      { released_at: '2026-09-02T00:00:00', fee: '100', or_number: '123' },
      { released_at: '2026-09-20T00:00:00', fee: '₱50' },
      { released_at: '2026-08-20T00:00:00', fee: '' , or_number: '9' },
      { fee: '100' },
    ]);
    assert.deepEqual(rows, [
      { month: '2026-09', released: 2, paid: 2, total: 150, noOr: 1 },
      { month: '2026-08', released: 1, paid: 0, total: 0, noOr: 0 },
    ]);
    assert.equal(peso(1250), '₱1,250.00');
  });
});

describe('data quality', () => {
  test('missingDetails: civil status for adults, contact for the household head, blood type when allowed', () => {
    const m = { relationship: HEAD, age: 40, sex: 'Male', dob: '1986-01-01' };
    assert.deepEqual(missingDetails(m), ['Civil status', 'Contact (household head)', 'Blood type']);
    assert.deepEqual(missingDetails({ ...m, relationship: 'Son', age: 10 }, { blood: false }), []);
    assert.deepEqual(missingDetails({ relationship: 'Son', age: null }, { blood: false }), ['Birth date', 'Sex']);
  });

  test('dataQualityByGkk counts what is missing and the complete share', () => {
    const { rows, total } = dataQualityByGkk([
      { household_gkk: 'GKK A', dob: '2000-01-01', sex: 'Male', age: 26, civil_status: 'Single', blood_type: 'O+' },
      { household_gkk: 'GKK A', sex: 'Female', blood_type: 'A+' },
    ]);
    assert.deepEqual([rows[0].members, rows[0].dob, rows[0].complete, rows[0].completePct], [2, 1, 1, '50%']);
    assert.equal(total.members, 2);
  });

  test('householdProblems finds no GKK, no head, no members and no contact', () => {
    const rows = householdProblems([
      { id: 1, household_name: 'A', gkk: 'GKK A', contact: '0917' },
      { id: 2, household_name: 'B', gkk: null, contact: '' },
      { id: 3, household_name: 'C', gkk: 'GKK A' },
    ], [
      { household_id: 1, relationship: HEAD, is_current: true },
      { household_id: 3, relationship: 'Son', contact: '0918' },
    ]);
    assert.deepEqual(rows.map((h) => [h.household_name, h.problems]), [
      ['C', ['No Head of Household']],
      ['B', ['No GKK', 'No members', 'No contact number']],
    ]);
  });
});

test('censusComparisonRows compares members counted in two censuses', () => {
  const sum = (counts) => {
    const all = { Active: 0, Inactive: 0, 'Moved away': 0, Deceased: 0, 'Left the Church': 0, 'Not confirmed': 0, ...counts };
    const total = Object.values(all).reduce((a, b) => a + b, 0);
    const r = { label: 'GKK A', counts: all, total, confirmed: total - all['Not confirmed'] };
    return { rows: [r], total: { ...r, label: 'All GKKs' } };
  };
  const { rows, total } = censusComparisonRows(sum({ Active: 10 }), sum({ Active: 8, Deceased: 1, 'Moved away': 2, 'Not confirmed': 3 }));
  assert.deepEqual(rows[0], { label: 'GKK A', before: 10, now: 8, change: -2, deceased: 1, movedAway: 2, left: 0, notConfirmed: 3 });
  assert.equal(total.label, 'All GKKs');
});

test('statsSections and sectionsCsv put the Report Stats tables in one file', () => {
  const stats = {
    totalHH: 2, totalVerified: 1, totalPending: 1, totalMembers: 5, totalFamilies: null, anyVolunteer: 40, unknownBlood: 1,
    regByGkk: [{ label: 'GKK A', verified: 1, pending: 1 }],
    sacCompletion: [{ label: 'Baptism', n: 4, missing: 1, w: '80%' }],
    participation: [{ label: 'Choir', n: 2, w: '40%' }],
    bloodCounts: [{ label: 'O+', n: 4 }],
  };
  const sections = statsSections(stats, { blood: false });
  assert.deepEqual(sections.map((s) => s.title), ['Registration status by GKK', 'Sacramental completion', 'Ministry & organization participation']);
  const csv = sectionsCsv(sections);
  assert.ok(csv.startsWith('\uFEFFRegistration status by GKK\nGKK,Verified,Pending,Households\nGKK A,1,1,2\n\nSacramental completion\n'));
  assert.equal(csv.match(/\uFEFF/g).length, 1);
});

test('registrationProgress: registration against the households expected, per GKK', () => {
  assert.equal(registrationProgress(null, 'x'), null);
  assert.equal(registrationProgress({ hasBaseline: false, rows: [], total: {} }, 'x'), null);
  const baseline = {
    mode: 'list', hasBaseline: true,
    rows: [
      { label: 'GKK A', lastYear: 30, notYet: 10, pct: 67, fromList: true },
      { label: 'GKK B', lastYear: null, notYet: null, pct: null },
    ],
    total: { label: 'All GKKs', lastYear: 30, notYet: 10, pct: 67 },
  };
  const p = registrationProgress(baseline, "last year's list");
  assert.deepEqual(p.total, { expected: 30, done: 20, pct: 67, notYet: 10, fromList: false });
  assert.deepEqual(p.byGkk.get('GKK A'), { expected: 30, done: 20, pct: 67, notYet: 10, fromList: true });
  assert.equal(p.byGkk.get('GKK B'), null);
  assert.equal(progressText(p), "20 of 30 expected households registered (67%), against last year's list");

  const stats = {
    totalHH: 26, totalVerified: 20, totalPending: 6, totalMembers: 90, totalFamilies: null, anyVolunteer: 0, unknownBlood: 0,
    regByGkk: [{ label: 'GKK A', verified: 15, pending: 6 }, { label: 'GKK B', verified: 5, pending: 0 }],
    sacCompletion: [], participation: [], bloodCounts: [],
  };
  const [reg] = statsSections(stats, { blood: false, progress: p });
  assert.deepEqual(reg.columns, ['GKK', 'Verified', 'Pending', 'Households', 'Expected', 'Registered of expected', 'Registered %']);
  assert.deepEqual(reg.rows.map((r) => r.cells), [['GKK A', 15, 6, 21, 30, 20, '67%'], ['GKK B', 5, 0, 5, '', '', '']]);
  assert.match(reg.meta, /^20 of 30 expected households registered \(67%\)/);
});
