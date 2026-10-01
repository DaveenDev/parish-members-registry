import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MEMBERSHIP_STATUSES, MEMBERSHIP_STATUS_LABELS, STATUS_TONES,
  cleanParticipation, suggestStatus, censusResponsesPayload, defaultCensusLabel, nextCensusDue, summarizeCensus,
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
