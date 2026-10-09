import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  MEMBERSHIP_STATUSES, MEMBERSHIP_STATUS_LABELS, STATUS_TONES,
  cleanParticipation, suggestStatus, asksParticipation, isYoungChild, censusResponsesPayload, defaultCensusLabel, nextCensusDue, summarizeCensus, registryVsLastYear, matchListToRegistry, nameWords, nameSuffix, listStatus, otherGkkMatches,
  parseLastYearLines, parseLastYearCsv, countLastYearList, dropRepeatedNames,
  normalizeAccessCode, formatAccessCode, portalPayload, diffSubmission,
  DEFAULT_SITE_URL, normalizeSiteUrl, publicSiteUrl, censusLink, codeFromHash, previousCensus, householdsVsPreviousCensus, familiesVsCount, familiesVsPreviousCensus, vsLastYearTable, familiesTable, statusTable, vsLastYearBaseline, unnamedNotYet, registrationAnswers, censusCardPatch,
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
    assert.equal(payload.newMembers[0].family_no, 1, 'a new member joins the first family unless another is chosen');
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

describe('registryVsLastYear (list on: registered = in the registry)', () => {
  const head = (household_id, gkk, first_name, last_name, status = 'Pending') => ({ household_id, household_name: `${last_name} family`, gkk, status, first_name, last_name });
  const gkks = [{ name: 'San Roque', previous_households: 40 }, { name: 'Bethany', previous_households: 2 }, { name: 'Calvary', previous_households: null }];
  const heads = [
    ...Array.from({ length: 12 }, (_, i) => head(100 + i, 'San Roque', 'X', `Y${i}`, i < 9 ? 'Verified' : 'Pending')),
    head(1, 'Bethany', 'Ana', 'Bautista'), head(2, 'Bethany', 'Carlo', 'Diaz'), head(3, 'Bethany', 'Elena', 'Flores', 'Verified'),
    head(4, 'Calvary', 'G', 'H'), head(5, null, 'I', 'J'),
  ];

  test('against the typed count: registered is every household on the queue or verified', () => {
    const { rows } = registryVsLastYear(gkks, heads, []);
    assert.deepEqual(rows.map((r) => r.label), ['Bethany', 'Calvary', 'San Roque', 'No GKK']);
    assert.deepEqual(rows.find((r) => r.label === 'San Roque'),
      { label: 'San Roque', registered: 12, verified: 9, pending: 3, fromList: false, lastYear: 40, notYet: 28, pct: 30 });
    // More households than last year: nothing left, capped at 100%.
    assert.deepEqual(['notYet', 'pct'].map((k) => rows.find((r) => r.label === 'Bethany')[k]), [0, 100]);
    const calvary = rows.find((r) => r.label === 'Calvary');
    assert.deepEqual([calvary.lastYear, calvary.notYet, calvary.pct, calvary.registered], [null, null, null, 1]);
  });

  test('the total covers only GKKs with a baseline; a leader sees only their GKK', () => {
    const { total, hasBaseline } = registryVsLastYear(gkks, heads, []);
    assert.equal(hasBaseline, true);
    assert.deepEqual([total.lastYear, total.registered, total.notYet, total.pct, total.registeredAll], [42, 15, 28, 33, 17]);
    const mine = registryVsLastYear(gkks, heads, [], 'San Roque');
    assert.deepEqual(mine.rows.map((r) => r.label), ['San Roque']);
    assert.equal(mine.total.notYet, 28);
    assert.equal(registryVsLastYear([{ name: 'A' }], [], []).hasBaseline, false);
  });

  test('a GKK with names measures against them; names found in the registry count as registered', () => {
    const list = [
      { id: 1, gkk: 'Bethany', head_name: 'Bautista, Ana', purok: 'P1', status: 'Not yet' }, // on the queue
      { id: 2, gkk: 'Bethany', head_name: 'Zed Zulu', purok: 'P2', status: 'Not yet' },
      { id: 3, gkk: 'Bethany', head_name: 'Ticked Off', purok: 'P1', status: 'Registered' },
      { id: 4, gkk: 'Bethany', head_name: 'Gone Away', purok: '', status: 'Moved away' },
      { id: 5, gkk: 'Bethany', head_name: 'Amy Q', purok: 'P1', note: 'blue gate', status: 'Not yet' },
    ];
    const { rows, notYet, matches } = registryVsLastYear(gkks, heads, list);
    const bethany = rows.find((r) => r.label === 'Bethany');
    assert.deepEqual([bethany.fromList, bethany.lastYear, bethany.notYet, bethany.pct, bethany.registered], [true, 4, 2, 50, 3]);
    assert.deepEqual([...matches.keys()], [1]);
    assert.deepEqual(notYet.map((n) => [n.title, n.detail]), [['Amy Q', 'P1 · blue gate'], ['Zed Zulu', 'P2']]);
  });
});

describe('matching last year\'s names to the registry', () => {
  const h = (household_id, gkk, first_name, last_name) => ({ household_id, gkk, first_name, last_name });
  const n = (id, gkk, head_name, status = 'Not yet') => ({ id, gkk, head_name, status });

  test('last name words all there, and one first name word, in the same GKK', () => {
    const heads = [h(1, 'A', 'Juan Pedro', 'Dela Cruz'), h(2, 'A', 'María', 'Santos'), h(3, 'B', 'Ana', 'Reyes')];
    const m = matchListToRegistry([
      n(1, 'A', 'Dela Cruz, Juan P.'), n(2, 'A', 'MARIA SANTOS'), n(3, 'A', 'Ana Reyes'), n(4, 'A', 'Juan Cruz'), n(5, 'B', 'Reyes Ana', 'Moved away'),
    ], heads);
    assert.deepEqual([...m.entries()].map(([id, x]) => [id, x.household_id]), [[1, 1], [2, 2]]);
  });

  test('one household per name, and suffixes and initials are ignored', () => {
    const heads = [h(1, 'A', 'Juan', 'Cruz')];
    const m = matchListToRegistry([n(1, 'A', 'Juan Cruz Jr.'), n(2, 'A', 'Juan Cruz Sr.')], heads);
    assert.deepEqual([...m.keys()], [1]);
    assert.deepEqual(nameWords('Ma. Dela Cruz, Jr. (P.)'), ['ma', 'dela', 'cruz']);
    assert.equal(listStatus(n(2, 'A', 'x'), m), 'Not yet');
    assert.equal(listStatus(n(1, 'A', 'x'), m), 'Registered');
  });

  test('a name not yet registered in its GKK but whose head is registered in another GKK', () => {
    const list = [n(1, 'SJB', 'Perfecto Panes Jr.'), n(2, 'SJB', 'Maryann Failano'), n(3, 'SJB', 'Angelito Panes'), n(4, 'SJB', 'Juan Cruz Sr.')];
    const others = [
      { gkk: 'SR', first_name: 'Perfecto', last_name: 'Panes', suffix: 'Jr.' },
      { gkk: 'SR', first_name: 'Juan', last_name: 'Cruz', suffix: 'Jr.' }, // Jr. is not the Sr. on the list
      { gkk: 'SJB', first_name: 'Maryann', last_name: 'Failano' }, // same GKK: that's a match, not a note
    ];
    const matches = new Map([[3, { household_id: 9 }]]); // Angelito is registered in his own GKK
    const m = otherGkkMatches(list, others, matches);
    assert.deepEqual([...m.keys()], [1]);
    assert.equal(m.get(1)[0].gkk, 'SR');
  });
});

describe('last year\'s list', () => {
  test('counts per GKK, with names found in the registry as registered', () => {
    const rows = [{ id: 1, gkk: 'A', status: 'Not yet' }, { id: 2, gkk: 'A', status: 'Not yet' }, { id: 3, gkk: 'A', status: 'Registered' }, { id: 4, gkk: 'A', status: 'Deceased' }];
    assert.deepEqual(countLastYearList(rows).get('A'), { total: 4, notYet: 2, registered: 1, setAside: 1 });
    assert.deepEqual(countLastYearList(rows, new Map([[2, {}]])).get('A'), { total: 4, notYet: 1, registered: 2, setAside: 1 });
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

describe('vsLastYearTable', () => {
  test('list mode: verified and on-the-queue columns, and the total', () => {
    const res = registryVsLastYear([{ name: 'A', previous_households: 4 }], [{ household_id: 1, gkk: 'A', status: 'Verified' }, { household_id: 2, gkk: 'A', status: 'Pending' }], []);
    const t = vsLastYearTable({ mode: 'list', ...res }, { label: '2026 Census' });
    assert.equal(t.title, "2026 Census: households vs last year's list");
    assert.deepEqual(t.rows, [['A', 'Count', 4, 2, 1, 1, 2, '50%'], ['All GKKs', '', 4, 2, 1, 1, 2, '50%']]);
  });

  test('count mode (list off, no earlier census): titled by the household count', () => {
    const res = registryVsLastYear([{ name: 'A', previous_households: 4 }], [{ household_id: 1, gkk: 'A', status: 'Verified' }], []);
    assert.equal(vsLastYearTable({ mode: 'count', ...res }, { label: '2026 Census' }).title, "2026 Census: households vs last year's household count");
  });

  test('with families (0079): four family columns, matched by GKK', () => {
    const gkks = [{ name: 'A', previous_households: 4, previous_families: 6 }, { name: 'B', previous_households: 2 }];
    const res = registryVsLastYear(gkks, [{ household_id: 1, gkk: 'A', status: 'Verified' }, { household_id: 2, gkk: 'B', status: 'Verified' }], []);
    const families = familiesVsCount(gkks, [{ label: 'A', families: 3 }, { label: 'B', families: 1 }]);
    const t = vsLastYearTable({ mode: 'list', ...res, families }, { label: '2026 Census' });
    assert.deepEqual(t.columns.slice(-4), ['Families last year', 'Families registered', 'Families not yet', 'Families %']);
    assert.deepEqual(t.rows.map((r) => r.slice(-4)), [[6, 3, 3, '50%'], ['', 1, '', ''], [6, 3, 3, '50%']]);
    // Without a families baseline, no family columns.
    assert.equal(vsLastYearTable({ mode: 'list', ...res, families: familiesVsCount([{ name: 'A' }], []) }, null).columns.length, 8);
    // The printed households report leaves the families to their own report.
    assert.equal(vsLastYearTable({ mode: 'list', ...res, families }, null, { withFamilies: false }).columns.length, 8);
  });

  test('the families report: one row per GKK and the total', () => {
    const gkks = [{ name: 'A', previous_households: 4, previous_families: 6 }, { name: 'B', previous_households: 2 }];
    const families = familiesVsCount(gkks, [{ label: 'A', families: 3 }, { label: 'B', families: 1 }]);
    const t = familiesTable({ mode: 'list', families }, { label: '2026 Census' });
    assert.equal(t.title, "2026 Census: families vs last year's list");
    assert.deepEqual(t.columns, ['GKK', 'Last year', 'Registered', 'Not yet', 'Registered %']);
    assert.deepEqual(t.rows, [['A', 6, 3, 3, '50%'], ['B', '', 1, '', ''], [t.rows[2][0], 6, 3, 3, '50%']]);
    assert.deepEqual(familiesTable({ mode: 'list', families: familiesVsCount([{ name: 'A' }], []) }, null).rows, []);
  });

  test('the members-per-status report', () => {
    const summary = summarizeCensus([{ gkk: 'A', status: 'Active', members: 3 }, { gkk: 'A', status: 'Not confirmed', members: 1 }]);
    const t = statusTable(summary, { label: '2026 Census' });
    assert.equal(t.title, '2026 Census: members per status');
    assert.deepEqual(t.columns, ['GKK', ...summary.columns, 'Total', 'Confirmed %']);
    assert.equal(t.rows.length, summary.rows.length + 1);
    assert.deepEqual(t.rows.at(-1).slice(-2), [summary.total.total, `${summary.total.pct}%`]);
  });
});

describe('familiesVsCount (0079)', () => {
  const gkks = [{ name: 'B', previous_families: 10 }, { name: 'A', previous_families: 4 }, { name: 'C' }];
  const registered = [{ label: 'A', families: 6 }, { label: 'B', families: 7 }, { label: 'C', families: 2 }];

  test('each GKK against its families last year; not yet never below zero', () => {
    const { rows, total, hasBaseline } = familiesVsCount(gkks, registered);
    assert.deepEqual(rows.map((r) => [r.label, r.lastYear, r.registered, r.notYet, r.pct]), [
      ['A', 4, 6, 0, 100], ['B', 10, 7, 3, 70], ['C', null, 2, null, null],
    ]);
    // The total leaves out C, which has no count.
    assert.deepEqual([total.lastYear, total.registered, total.notYet, total.pct], [14, 13, 3, 79]);
    assert.equal(hasBaseline, true);
  });

  test('a GKK leader sees their own GKK; no counts means no baseline', () => {
    assert.deepEqual(familiesVsCount(gkks, registered, 'B').rows.map((r) => r.label), ['B']);
    const none = familiesVsCount([{ name: 'A' }], registered);
    assert.equal(none.hasBaseline, false);
    assert.equal(none.total.lastYear, null);
  });
});

describe('familiesVsPreviousCensus (0079)', () => {
  const f = (household_id, family_no, gkk, took_part) => ({ household_id, family_no, gkk, took_part });
  test('families that took part before, against now; two families in one house count apart', () => {
    const previous = [f(1, 1, 'A', true), f(1, 2, 'A', true), f(2, 1, 'A', true), f(3, 1, 'B', false), f(4, 1, 'B', true)];
    const current = [f(1, 1, 'A', true), f(1, 2, 'A', false), f(2, 1, 'B', true), f(3, 1, 'B', true), f(5, 1, 'B', true)];
    const { rows, total } = familiesVsPreviousCensus(previous, current);
    // A: 1:1 and 1:2 took part before; 1:2 not yet. Household 2 moved to B and counts there.
    // B: 2:1 (moved here) took part before and now; 4:1 is gone; 3:1 and 5:1 are new.
    assert.deepEqual(rows.map((r) => [r.label, r.lastYear, r.registered, r.notYet, r.pct]), [['A', 2, 1, 1, 50], ['B', 1, 3, 0, 100]]);
    assert.deepEqual([total.lastYear, total.notYet, total.registered, total.pct], [3, 1, 4, 67]);
  });

  test('only one GKK', () => {
    const { rows } = familiesVsPreviousCensus([f(1, 1, 'A', true), f(2, 1, 'B', true)], [f(1, 1, 'A', false), f(2, 1, 'B', true)], 'A');
    assert.deepEqual(rows.map((r) => [r.label, r.lastYear, r.notYet]), [['A', 1, 1]]);
  });
});

describe('the list comes before the typed count (0058)', () => {
  const gkks = [{ name: 'A', previous_households: 25 }, { name: 'B', previous_households: 10 }];
  const heads = [{ household_id: 1, gkk: 'A', status: 'Verified' }, { household_id: 2, gkk: 'B', status: 'Pending' }];
  const list = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, gkk: 'A', head_name: `Name ${i + 1}`, status: i < 2 ? 'Moved away' : 'Not yet' }));

  test("a GKK with names measures against them, not its count; one without uses the count", () => {
    const res = registryVsLastYear(gkks, heads, list);
    const [a, b] = res.rows;
    assert.equal(a.fromList, true);
    assert.equal(a.lastYear, 28); // 30 names, 2 set aside: not the 25 typed
    assert.equal(b.fromList, false);
    assert.equal(b.lastYear, 10);
    assert.equal(res.total.lastYear, 38);
  });

  test('unnamedNotYet: only the GKKs measured by their count, which have no names to list', () => {
    const res = { mode: 'list', ...registryVsLastYear(gkks, heads, list) };
    assert.equal(res.notYet.length, 28);
    assert.equal(unnamedNotYet(res), 9);
    assert.equal(unnamedNotYet({ mode: 'census', rows: [{ lastYear: 5, notYet: 5, fromList: false }] }), 0);
  });

  test('vsLastYearBaseline names what the census is measured against', () => {
    assert.equal(vsLastYearBaseline({ mode: 'list' }), "last year's list");
    assert.equal(vsLastYearBaseline({ mode: 'count' }), "last year's household count");
    assert.equal(vsLastYearBaseline({ mode: 'census', previous: { label: '2025 Census' } }), 'the 2025 Census');
  });
});

describe('matching last year\'s names: suffixes and corrections (0052)', () => {
  const h = (household_id, first_name, last_name, suffix = '', middle_name = '') => ({ household_id, gkk: 'A', first_name, middle_name, last_name, suffix });
  const n = (id, head_name, extra = {}) => ({ id, gkk: 'A', head_name, status: 'Not yet', household_id: null, not_household_ids: [], ...extra });
  const ids = (m) => [...m.entries()].map(([id, x]) => [id, x.household_id, !!x.linked]);

  test('Jr. and Sr. must agree when both have one', () => {
    assert.deepEqual(ids(matchListToRegistry([n(1, 'Perfecto Panes Sr.'), n(2, 'Perfecto Panes Jr.')], [h(9, 'Perfecto', 'Panes', 'Jr.')])), [[2, 9, false]]);
    // Family name alone never matches.
    assert.deepEqual(ids(matchListToRegistry([n(1, 'Perfecto Panes Jr.'), n(2, 'Reyian Panes')], [h(8, 'Reyian', 'Panes')])), [[2, 8, false]]);
    assert.equal(nameSuffix('Juan V. Cruz'), null);
    assert.equal(nameSuffix('Juan Cruz III'), 'iii');
    assert.equal(nameSuffix('Junior'), 'jr');
  });

  test('the closest pair wins, whatever the list order', () => {
    // "Juan Cruz" comes first but "Juan Pedro Cruz" shares the middle name with the head.
    assert.deepEqual(ids(matchListToRegistry([n(1, 'Juan Cruz'), n(2, 'Juan Pedro Cruz')], [h(5, 'Juan', 'Cruz', '', 'Pedro')])), [[2, 5, false]]);
  });

  test('"Not this household" and a household chosen by hand', () => {
    const heads = [h(1, 'Perfecto', 'Panes'), h(2, 'Maria', 'Panes')];
    assert.deepEqual(ids(matchListToRegistry([n(1, 'Perfecto Panes', { not_household_ids: [1] })], heads)), []);
    // Linked to the wife's household: that one, and nobody else gets it.
    const m = matchListToRegistry([n(1, 'Perfecto Panes', { household_id: 2 }), n(2, 'Maria Panes')], heads);
    assert.deepEqual(ids(m), [[1, 2, true]]);
    assert.equal(listStatus(n(1, 'x', { household_id: 2 }), m), 'Registered');
    // A link to a household no longer in the registry is ignored.
    assert.deepEqual(ids(matchListToRegistry([n(1, 'Perfecto Panes', { household_id: 77 })], heads)), []);
  });

  test('a Head of Family on the list is found too (0054)', () => {
    const heads = [h(1, 'Perfecto', 'Panes')];
    const fam = (member_id, household_id, first_name, last_name) => ({ member_id, household_id, first_name, middle_name: '', last_name, suffix: '' });
    // The household head and the head of the second family in the same house both count.
    const m = matchListToRegistry([n(1, 'Perfecto Panes'), n(2, 'Reyian Panes')], heads, [fam(10, 1, 'Reyian', 'Panes')]);
    assert.deepEqual(ids(m), [[1, 1, false], [2, 1, false]]);
    assert.equal(m.get(2).family, true);
    assert.equal(m.get(1).family, undefined);
    // A family head in a house no longer in the registry doesn't count.
    assert.deepEqual(ids(matchListToRegistry([n(1, 'Reyian Panes')], heads, [fam(10, 99, 'Reyian', 'Panes')])), []);
    // "Not this household" skips the house's family heads too.
    assert.deepEqual(ids(matchListToRegistry([n(1, 'Reyian Panes', { not_household_ids: [1] })], heads, [fam(10, 1, 'Reyian', 'Panes')])), []);
    // On a tie the household head wins; each family head matches one name.
    const tie = matchListToRegistry([n(1, 'Juan Cruz'), n(2, 'Juan Cruz')], [h(3, 'Juan', 'Cruz')], [fam(11, 3, 'Juan', 'Cruz')]);
    assert.equal(tie.get(1).family, undefined);
    assert.equal(tie.get(2).family, true);
  });
});

describe('census answers at registration (0055)', () => {
  const adult = { dob: '1980-05-01' };
  test('the status picked, or the one suggested from the answers', () => {
    assert.deepEqual(registrationAnswers({ ...adult, participation: { mass: 'Aktibo', bogus: 'x' } }), { censusStatus: 'Active', participation: { mass: 'Aktibo' } });
    assert.deepEqual(registrationAnswers({ ...adult, participation: { mass: 'Wala', meetings: 'Wala' } }).censusStatus, 'Inactive');
    assert.equal(registrationAnswers({ ...adult, participation: {} }).censusStatus, '');
    assert.equal(registrationAnswers({ ...adult, statusPicked: true, censusStatus: 'Inactive', participation: { mass: 'Aktibo' } }).censusStatus, 'Inactive');
    assert.deepEqual(registrationAnswers({ ...adult, statusPicked: true, censusStatus: 'Left the Church', participation: { mass: 'Aktibo' } }).participation, {});
  });
  test('a young child is Active with nothing to answer', () => {
    const dob = new Date(Date.now() - 3 * 365.25 * 86400000).toISOString().slice(0, 10);
    assert.deepEqual(registrationAnswers({ dob, participation: { mass: 'Wala' } }), { censusStatus: 'Active', participation: {} });
  });
  test('picking a status with no questions clears the answers; clearing it goes back to the suggestion', () => {
    assert.deepEqual(censusCardPatch({}, { censusStatus: 'Inactive' }), { censusStatus: 'Inactive', statusPicked: true, participation: {} });
    assert.deepEqual(censusCardPatch({}, { censusStatus: 'Active' }), { censusStatus: 'Active', statusPicked: true });
    assert.deepEqual(censusCardPatch({}, { censusStatus: '' }), { censusStatus: '', statusPicked: false });
    assert.deepEqual(censusCardPatch({}, { participation: { mass: 'Aktibo' } }), { participation: { mass: 'Aktibo' } });
  });
});
