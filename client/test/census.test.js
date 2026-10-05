import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MEMBERSHIP_STATUSES, MEMBERSHIP_STATUS_LABELS, STATUS_TONES,
  cleanParticipation, suggestStatus, asksParticipation, isYoungChild, censusResponsesPayload, defaultCensusLabel, nextCensusDue, summarizeCensus, householdsVsLastYear,
  parseLastYearLines, parseLastYearCsv, countLastYearList, dropRepeatedNames,
  normalizeAccessCode, formatAccessCode, portalPayload, diffSubmission,
  DEFAULT_SITE_URL, normalizeSiteUrl, publicSiteUrl, censusLink, codeFromHash, previousCensus, householdsVsPreviousCensus,
} from '../src/lib/census.js';
import { parseCsv } from '../src/lib/csv.js';

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
    assert.deepEqual(roque, { label: 'San Roque', lastYear: 40, registered: 12, confirmed: 9, notYet: 28, pct: 30, fromList: false });
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
    // Share of last year's households no longer outstanding: Bethany's extra households don't offset San Roque's.
    assert.equal(total.pct, 44);
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

describe('last year\'s list', () => {
  test('a GKK with a list uses it in place of the typed count', () => {
    const lists = countLastYearList([
      ...Array(30).fill({ gkk: 'San Roque', status: 'Not yet' }),
      ...Array(8).fill({ gkk: 'San Roque', status: 'Registered' }),
      { gkk: 'San Roque', status: 'Moved away' }, { gkk: 'San Roque', status: 'Duplicate' },
    ]);
    assert.deepEqual(lists.get('San Roque'), { total: 40, notYet: 30, registered: 8, setAside: 2 });
    const gkks = [{ name: 'San Roque', previous_households: 99 }, { name: 'Bethany', previous_households: 10 }];
    const counts = new Map([['San Roque', { started: 12, confirmed: 9 }], ['Bethany', { started: 4, confirmed: 4 }]]);
    const { rows, total } = householdsVsLastYear(gkks, counts, null, lists);
    const roque = rows.find((r) => r.label === 'San Roque');
    assert.equal(roque.fromList, true);
    assert.equal(roque.lastYear, 38);
    assert.equal(roque.notYet, 30);
    assert.equal(roque.registered, 12);
    assert.equal(roque.pct, 21);
    assert.equal(rows.find((r) => r.label === 'Bethany').fromList, false);
    assert.equal(total.lastYear, 48);
    assert.equal(total.notYet, 36);
  });

  test('names already on the list or repeated are left out', () => {
    const existing = [{ gkk: 'A', head_name: 'Juan  Cruz', purok: 'Purok 1' }];
    const { fresh, repeated } = dropRepeatedNames([
      { gkk: 'A', head_name: 'juan cruz', purok: 'purok 1' },
      { gkk: 'A', head_name: 'Juan Cruz', purok: 'Purok 2' },
      { gkk: 'B', head_name: 'Juan Cruz', purok: 'Purok 1' },
      { gkk: 'B', head_name: 'Juan Cruz', purok: 'Purok 1 ' },
    ], existing);
    assert.equal(repeated, 2);
    assert.deepEqual(fresh.map((r) => `${r.gkk}/${r.purok}`), ['A/Purok 2', 'B/Purok 1']);
  });

  test('typed lines: name, purok, note', () => {
    assert.deepEqual(parseLastYearLines('Juan Dela Cruz, Purok 3, near the chapel, blue gate\n\n  Maria Santos  \r\n'), [
      { head_name: 'Juan Dela Cruz', purok: 'Purok 3', note: 'near the chapel, blue gate' },
      { head_name: 'Maria Santos', purok: '', note: '' },
    ]);
  });

  test('spreadsheet with a header row', () => {
    const csv = parseCsv('\uFEFFPurok,Head of Household,GKK,Remarks\r\nP-1,"Cruz, Juan",san roque,\r\nP-2,Ana Reyes,,widow\nP-3,Pedro,Nowhere,\n,,,\nP-4,,San Roque,\n');
    const { rows, skipped } = parseLastYearCsv(csv, { defaultGkk: 'Bethany', gkkNames: ['San Roque', 'Bethany'] });
    assert.deepEqual(rows, [
      { gkk: 'San Roque', head_name: 'Cruz, Juan', purok: 'P-1', note: '' },
      { gkk: 'Bethany', head_name: 'Ana Reyes', purok: 'P-2', note: 'widow' },
    ]);
    assert.deepEqual(skipped, [{ line: 4, reason: 'Unknown GKK “Nowhere”' }, { line: 6, reason: 'No name' }]);
  });

  test('spreadsheet without a header row needs a chosen GKK', () => {
    const csv = parseCsv('Juan Dela Cruz,Purok 1\nMaria,Purok 2,new house');
    assert.equal(parseLastYearCsv(csv, { defaultGkk: 'Bethany', gkkNames: ['Bethany'] }).rows.length, 2);
    assert.equal(parseLastYearCsv(csv, { gkkNames: ['Bethany'] }).skipped.length, 2);
  });
});

describe('census link on printed sheets', () => {
  test('normalizeSiteUrl tidies what staff type and rejects non-addresses', () => {
    assert.equal(normalizeSiteUrl(' Parish.org/ '), 'https://parish.org');
    assert.equal(normalizeSiteUrl('http://www.olgqp.org//'), 'http://www.olgqp.org');
    assert.equal(normalizeSiteUrl('https://example.org/registry/'), 'https://example.org/registry');
    assert.equal(normalizeSiteUrl(''), '');
    assert.equal(normalizeSiteUrl(null), '');
    assert.throws(() => normalizeSiteUrl('not an address'));
    assert.throws(() => normalizeSiteUrl('parish'));
    assert.throws(() => normalizeSiteUrl('ftp://parish.org'));
  });

  test('publicSiteUrl falls back to the Vercel address', () => {
    assert.equal(publicSiteUrl(null), DEFAULT_SITE_URL);
    assert.equal(publicSiteUrl({ site_url: '' }), DEFAULT_SITE_URL);
    assert.equal(publicSiteUrl({ site_url: 'bad address' }), DEFAULT_SITE_URL);
    assert.equal(publicSiteUrl({ site_url: 'olgqp.org' }), 'https://olgqp.org');
  });

  test('censusLink puts the ref in the query and the code after #', () => {
    assert.equal(censusLink('https://olgqp.org', 'OLG-2026-000123', 'ab3k-77xq'), 'https://olgqp.org/census?ref=OLG-2026-000123#code=AB3K77XQ');
    assert.equal(censusLink('https://olgqp.org', 'OLG 1', ''), 'https://olgqp.org/census?ref=OLG%201');
  });

  test('codeFromHash reads the code back', () => {
    assert.equal(codeFromHash('#code=AB3K77XQ'), 'AB3K77XQ');
    assert.equal(codeFromHash('#code=ab3k-77xq'), 'AB3K77XQ');
    assert.equal(codeFromHash(''), '');
    assert.equal(codeFromHash('#other=1'), '');
    const link = censusLink(DEFAULT_SITE_URL, 'OLG-1', 'AB3K77XQ');
    assert.equal(codeFromHash(new URL(link).hash), 'AB3K77XQ');
    assert.equal(new URL(link).searchParams.get('ref'), 'OLG-1');
  });
});

describe('householdsVsPreviousCensus (0048: no last year list)', () => {
  const h = (household_id, gkk, progress, household_name = `H${household_id}`) => ({ household_id, gkk, progress, household_name });
  const previous = [h(1, 'A', 'Confirmed'), h(2, 'A', 'Partly confirmed'), h(3, 'A', 'Not started'), h(4, 'B', 'Confirmed'), h(9, 'B', 'Confirmed')];
  const current = [h(1, 'A', 'Confirmed'), h(2, 'A', 'Not started'), h(3, 'A', 'Partly confirmed'), h(4, 'A', 'Not started'), h(5, 'C', 'Confirmed')];

  test('last year is who took part before; not yet is who of them has nobody confirmed now', () => {
    const { rows, total, notYetHouseholds } = householdsVsPreviousCensus(previous, current);
    const a = rows.find((r) => r.label === 'A');
    // 1, 2 took part before; 4 moved from B to A since; 3 never took part.
    assert.deepEqual([a.lastYear, a.notYet, a.registered, a.confirmed, a.pct], [3, 2, 2, 1, 33]);
    // C had nobody in the previous census: no baseline, not in the total.
    assert.deepEqual(rows.find((r) => r.label === 'C'), { label: 'C', fromList: false, registered: 1, confirmed: 1, lastYear: null, notYet: null, pct: null });
    assert.deepEqual([total.lastYear, total.notYet, total.pct, total.registeredAll], [3, 2, 33, 3]);
    assert.deepEqual(notYetHouseholds.map((r) => r.household_id), [2, 4]);
  });

  test('a household deleted since is left out; a GKK leader sees only their GKK', () => {
    assert.ok(!householdsVsPreviousCensus(previous, current).rows.some((r) => r.label === 'B'));
    const { rows } = householdsVsPreviousCensus(previous, current, 'C');
    assert.deepEqual(rows.map((r) => r.label), ['C']);
    assert.equal(householdsVsPreviousCensus(previous, current, 'C').hasBaseline, false);
  });

  test('the previous census is the one before, whatever order the list is in', () => {
    const cycles = [{ id: 7 }, { id: 3 }, { id: 5 }];
    assert.equal(previousCensus(cycles, { id: 7 }).id, 5);
    assert.equal(previousCensus(cycles, { id: 3 }), null);
  });
});
