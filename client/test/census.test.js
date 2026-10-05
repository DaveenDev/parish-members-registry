import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MEMBERSHIP_STATUSES, MEMBERSHIP_STATUS_LABELS, STATUS_TONES,
  cleanParticipation, suggestStatus, asksParticipation, isYoungChild, censusResponsesPayload, defaultCensusLabel, nextCensusDue, summarizeCensus, householdsVsLastYear,
  normalizeAccessCode, formatAccessCode, portalPayload, diffSubmission,
} from '../src/lib/census.js';

describe('suggestStatus', () => {
  test('Mass Aktibo alone is enough for Active', () => {
    assert.equal(suggestStatus({ mass: 'Aktibo' }), 'Active');
    assert.equal(suggestStatus({ mass: 'Aktibo', financial: 'Wala' }), 'Active');
  });

  test('two items Aktibo or Panagsa suggest Active', () => {
    assert.equal(suggestStatus({ mass: 'Panagsa', devotions: 'Panagsa' }), 'Active');
    assert.equal(suggestStatus({ mass: 'Wala', meetings: 'Aktibo', pintakasi: 'Panagsa' }), 'Active');
  });

  test('every answer Wala suggests Inactive', () => {
    assert.equal(suggestStatus({ mass: 'Wala' }), 'Inactive');
    assert.equal(suggestStatus({ mass: 'Wala', devotions: 'Wala', financial: 'Wala' }), 'Inactive');
  });

  test('leaves the decision to staff when the answers are thin or mixed', () => {
    assert.equal(suggestStatus({ mass: 'Panagsa' }), null);
    assert.equal(suggestStatus({ mass: 'Wala', devotions: 'Panagsa' }), null);
    assert.equal(suggestStatus({}), null);
    assert.equal(suggestStatus(null), null);
    assert.equal(suggestStatus(undefined), null);
  });

  test('ignores unknown items and answers, like the database does', () => {
    assert.equal(suggestStatus({ mass: 'Yes', bingo: 'Aktibo', other: 'Aktibo' }), null);
    assert.equal(suggestStatus(['Aktibo']), null);
  });
});

describe('asksParticipation', () => {
  test('only active or undecided members answer the participation questions', () => {
    assert.equal(asksParticipation(''), true);
    assert.equal(asksParticipation('Active'), true);
    for (const s of ['Inactive', 'Moved away', 'Deceased', 'Left the Church']) assert.equal(asksParticipation(s), false);
  });
});

describe('isYoungChild', () => {
  const today = new Date(2026, 9, 2);
  test('8 years old and under counts as a young child', () => {
    assert.equal(isYoungChild('2018-10-02', today), true); // turns 8 today
    assert.equal(isYoungChild('2017-10-03', today), true); // 8, turns 9 tomorrow
    assert.equal(isYoungChild('2026-01-15', today), true);
  });
  test('9 and over, or no birthday, is not', () => {
    assert.equal(isYoungChild('2017-10-02', today), false);
    assert.equal(isYoungChild('', today), false);
    assert.equal(isYoungChild(null, today), false);
  });
});

describe('cleanParticipation', () => {
  test('keeps only known keys with known levels', () => {
    assert.deepEqual(cleanParticipation({ mass: 'Aktibo', devotions: 'maybe', junk: 'Wala' }), { mass: 'Aktibo' });
    assert.deepEqual(cleanParticipation('Aktibo'), {});
  });
});

describe('censusResponsesPayload', () => {
  test('drops members without a status and tidies the rest', () => {
    const payload = censusResponsesPayload([
      { memberId: 1, status: 'Inactive', participation: { mass: 'Wala', x: 'y' }, notes: '  works abroad ' },
      { memberId: 2, status: '', participation: { mass: 'Aktibo' } },
      { memberId: 3, status: 'Deceased' },
    ]);
    assert.deepEqual(payload, [
      { memberId: 1, status: 'Inactive', participation: { mass: 'Wala' }, notes: 'works abroad' },
      { memberId: 3, status: 'Deceased', participation: {}, notes: '' },
    ]);
  });
});

describe('labels and dates', () => {
  test('every status has a Bisaya label and a tone', () => {
    for (const s of MEMBERSHIP_STATUSES) {
      assert.ok(MEMBERSHIP_STATUS_LABELS[s], s);
      assert.ok(STATUS_TONES[s], s);
    }
  });

  test('defaultCensusLabel uses the year', () => {
    assert.equal(defaultCensusLabel('2026-10-01'), '2026 Census');
    assert.equal(defaultCensusLabel(new Date(2027, 0, 5)), '2027 Census');
  });

  test('nextCensusDue adds the interval to the last start date', () => {
    assert.equal(nextCensusDue('2026-10-01', 12), '2027-10-01');
    assert.equal(nextCensusDue('2026-10-01', 24), '2028-10-01');
    assert.equal(nextCensusDue('2026-10-01T00:00:00Z', 6), '2027-04-01');
    assert.equal(nextCensusDue(null, 12), null);
    assert.equal(nextCensusDue('2026-10-01', 0), null);
  });
});

describe('summarizeCensus', () => {
  test('pivots status counts per GKK with totals', () => {
    const { columns, rows, total } = summarizeCensus([
      { gkk: 'GKK San Isidro', status: 'Active', members: 3 },
      { gkk: 'GKK San Isidro', status: 'Inactive', members: 1 },
      { gkk: 'GKK San Isidro', status: 'Not confirmed', members: 4 },
      { gkk: null, status: 'Not confirmed', members: 2 },
      { gkk: 'GKK Sto. Niño', status: 'Deceased', members: 1 },
    ]);
    assert.deepEqual(columns, [...MEMBERSHIP_STATUSES, 'Not confirmed']);
    assert.deepEqual(rows.map((r) => r.label), ['GKK San Isidro', 'GKK Sto. Niño', 'No GKK']);
    assert.equal(rows[0].total, 8);
    assert.equal(rows[0].confirmed, 4);
    assert.equal(rows[0].pct, 50);
    assert.equal(rows[2].pct, 0);
    assert.equal(total.total, 11);
    assert.equal(total.counts.Active, 3);
    assert.equal(total.counts['Not confirmed'], 6);
  });

  test('handles an empty census', () => {
    const { rows, total } = summarizeCensus([]);
    assert.deepEqual(rows, []);
    assert.equal(total.total, 0);
    assert.equal(total.pct, 0);
  });
});

describe('access codes', () => {
  test('normalize ignores case, dashes and spaces', () => {
    assert.equal(normalizeAccessCode(' ab3k-77xq '), 'AB3K77XQ');
    assert.equal(normalizeAccessCode(null), '');
  });

  test('format splits eight characters in two', () => {
    assert.equal(formatAccessCode('ab3k77xq'), 'AB3K-77XQ');
    assert.equal(formatAccessCode('AB3'), 'AB3');
  });
});

describe('portalPayload', () => {
  test('keeps only portal fields, blanks become null, empty new rows are dropped', () => {
    const payload = portalPayload({
      household: { street: ' 24 Rizal St. ', email: '', gkk: 'ignored', contact: '0917' },
      members: [{ id: 1, first_name: 'Juan', middle_name: '', blood_type: 'O+', status: 'Inactive', participation: { mass: 'Wala', x: 'y' }, notes: ' ' }],
      newMembers: [
        { first_name: '', last_name: '', status: '' },
        { first_name: 'Baby', last_name: 'Dela Cruz', relationship: 'Grandchild', status: 'Active' },
      ],
      message: '  ',
      consent: true,
    });
    assert.equal(payload.household.street, '24 Rizal St.');
    assert.equal(payload.household.email, null);
    assert.equal('gkk' in payload.household, false);
    assert.equal(payload.members[0].middle_name, null);
    assert.equal('blood_type' in payload.members[0], false);
    assert.deepEqual(payload.members[0].participation, { mass: 'Wala' });
    assert.equal(payload.members[0].notes, null);
    assert.equal(payload.newMembers.length, 1);
    assert.equal(payload.newMembers[0].first_name, 'Baby');
    assert.equal(payload.message, null);
    assert.equal(payload.consent, true);
  });

  test('an unknown status is sent as null', () => {
    const payload = portalPayload({ members: [{ id: 2, status: 'Maybe' }] });
    assert.equal(payload.members[0].status, null);
  });
});

describe('diffSubmission', () => {
  const before = {
    household: { street: '24 Rizal St.', contact: '0917', email: null },
    members: { 1: { first_name: 'Juan', last_name: 'Dela Cruz', civil_status: 'Married', middle_name: null } },
  };

  test('lists only what changed, plus answers and new members', () => {
    const d = diffSubmission({
      before,
      proposed: {
        household: { street: '24 Rizal St.', contact: '0999', email: '' },
        members: [{ id: 1, fields: { first_name: 'Juan', last_name: 'Dela Cruz', civil_status: 'Widowed', middle_name: '' }, status: 'Inactive', participation: { mass: 'Wala' } }],
        newMembers: [{ fields: { first_name: 'Baby', last_name: 'Dela Cruz' }, status: 'Active' }],
      },
    });
    assert.deepEqual(d.household, [{ key: 'contact', label: 'Contact no.', from: '0917', to: '0999' }]);
    assert.equal(d.members[0].name, 'Juan Dela Cruz');
    assert.deepEqual(d.members[0].changes, [{ key: 'civil_status', label: 'Civil status', from: 'Married', to: 'Widowed' }]);
    assert.equal(d.members[0].status, 'Inactive');
    assert.equal(d.newMembers[0].name, 'Baby Dela Cruz');
    assert.equal(d.changeCount, 3);
  });

  test('no changes', () => {
    const d = diffSubmission({ before, proposed: { household: before.household, members: [], newMembers: [] } });
    assert.equal(d.changeCount, 0);
  });
});

describe('householdsVsLastYear', () => {
  const gkks = [{ name: 'San Roque', previous_households: 40 }, { name: 'Bethany', previous_households: 10 }, { name: 'Calvary', previous_households: null }];
  const counts = new Map([['San Roque', { started: 12, confirmed: 9 }], ['Bethany', { started: 13, confirmed: 13 }], ['Calvary', { started: 5, confirmed: 2 }], [null, { started: 2, confirmed: 1 }]]);

  test('registered and not yet per GKK against last year', () => {
    const { rows } = householdsVsLastYear(gkks, counts);
    assert.deepEqual(rows.map((r) => r.label), ['Bethany', 'Calvary', 'San Roque', 'No GKK']);
    const roque = rows.find((r) => r.label === 'San Roque');
    assert.deepEqual(roque, { label: 'San Roque', lastYear: 40, registered: 12, confirmed: 9, notYet: 28, pct: 30 });
    // More households than last year: nothing left, capped at 100%.
    const bethany = rows.find((r) => r.label === 'Bethany');
    assert.equal(bethany.notYet, 0);
    assert.equal(bethany.pct, 100);
  });

  test('a GKK without a baseline has no not-yet or share', () => {
    const calvary = householdsVsLastYear(gkks, counts).rows.find((r) => r.label === 'Calvary');
    assert.equal(calvary.lastYear, null);
    assert.equal(calvary.notYet, null);
    assert.equal(calvary.pct, null);
    assert.equal(calvary.registered, 5);
  });

  test('the total covers only GKKs with a baseline', () => {
    const { total, hasBaseline } = householdsVsLastYear(gkks, counts);
    assert.equal(hasBaseline, true);
    assert.equal(total.lastYear, 50);
    assert.equal(total.registered, 25);
    assert.equal(total.notYet, 28);
    assert.equal(total.pct, 50);
    assert.equal(total.registeredAll, 32);
  });

  test('a GKK leader sees only their GKK', () => {
    const { rows, total } = householdsVsLastYear(gkks, counts, 'San Roque');
    assert.deepEqual(rows.map((r) => r.label), ['San Roque']);
    assert.equal(total.notYet, 28);
  });

  test('no baselines entered', () => {
    const { hasBaseline, total } = householdsVsLastYear([{ name: 'A' }], new Map());
    assert.equal(hasBaseline, false);
    assert.equal(total.lastYear, null);
    assert.equal(total.notYet, null);
  });
});
