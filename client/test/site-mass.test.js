import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { massSections, upcomingToday, massKindLabel, massDateLabel } from '../src/lib/site.js';
import { dayList, groupDaily, nextOccasionDates, findOccasion, massType, isCurrentMass } from '../src/lib/website.js';

let nextId = 1;
const row = (over = {}) => ({ id: nextId++, day_of_week: 0, start_time: '07:00:00', kind: 'Regular Mass', location: 'Main church', language: 'Bisaya', notes: null, published: true, mass_date: null, mass_end_date: null, occasion: null, obligation: false, ...over });
// Friday, 2 October 2026, 6 AM.
const FRI = new Date(2026, 9, 2, 6, 0);

describe('dayList', () => {
  test('merges runs of three or more days and lists the rest', () => {
    assert.equal(dayList([1, 2, 3, 4, 5, 6]), 'Mon–Sat');
    assert.equal(dayList([1, 3, 5]), 'Mon, Wed, Fri');
    assert.equal(dayList([2, 3, 4, 6]), 'Tue–Thu, Sat');
    assert.equal(dayList([1, 2]), 'Mon, Tue');
    assert.equal(dayList([4]), 'Thu');
  });
});

describe('groupDaily', () => {
  test('one entry per Daily Mass time, place and language; other rows untouched', () => {
    const daily = [1, 2, 3].map((d) => row({ kind: 'Daily Mass', day_of_week: d, start_time: '06:00:00' }));
    const english = row({ kind: 'Daily Mass', day_of_week: 5, start_time: '06:00:00', language: 'English' });
    const sunday = row();
    const out = groupDaily([...daily, english, sunday]);
    assert.equal(out.length, 3);
    assert.deepEqual(out[0].days, [1, 2, 3]);
    assert.deepEqual(out[0].ids, daily.map((r) => r.id));
    assert.deepEqual(out[1].days, [5]);
    assert.equal(out[2], sunday);
  });

  test('older "Mass" rows on weekdays group as Daily Mass', () => {
    const out = groupDaily([row({ kind: 'Mass', day_of_week: 1 }), row({ kind: 'Mass', day_of_week: 2 })]);
    assert.equal(out.length, 1);
    assert.equal(out[0].kind, 'Daily Mass');
  });
});

describe('massType / massKindLabel', () => {
  test('older "Mass" rows read by their day', () => {
    assert.equal(massType({ kind: 'Mass', day_of_week: 0 }), 'Regular Mass');
    assert.equal(massType({ kind: 'Mass', day_of_week: 3 }), 'Daily Mass');
    assert.equal(massKindLabel({ kind: 'Mass', day_of_week: 0 }), 'Misa sa Domingo');
  });
  test('a Special Mass is called by its occasion', () => {
    assert.equal(massKindLabel({ kind: 'Special Mass', occasion: 'Immaculate Conception' }), 'Immaculate Conception');
    assert.equal(massKindLabel({ kind: 'GKK Mass' }), 'Misa sa GKK');
  });
});

describe('nextOccasionDates', () => {
  test('fills in the next fixed date, rolling over once it has passed', () => {
    const ic = findOccasion('Immaculate Conception');
    assert.equal(ic.obligation, true);
    assert.deepEqual(nextOccasionDates(ic, '2026-10-02'), { start: '2026-12-08', end: '' });
    assert.deepEqual(nextOccasionDates(ic, '2026-12-08'), { start: '2026-12-08', end: '' });
    assert.deepEqual(nextOccasionDates(ic, '2026-12-09'), { start: '2027-12-08', end: '' });
  });
  test('a run like Simbang Gabi gets both ends, and still counts mid-run', () => {
    const sg = findOccasion('simbang gabi');
    assert.deepEqual(nextOccasionDates(sg, '2026-10-02'), { start: '2026-12-16', end: '2026-12-24' });
    assert.deepEqual(nextOccasionDates(sg, '2026-12-20'), { start: '2026-12-16', end: '2026-12-24' });
  });
  test('movable feasts have no fixed date', () => {
    assert.equal(nextOccasionDates(findOccasion('Ash Wednesday'), '2026-10-02'), null);
  });
});

describe('massDateLabel', () => {
  test('one date, a run in one month, and a run across months', () => {
    assert.equal(massDateLabel({ mass_date: '2026-12-08' }), 'Dis 8, Martes');
    assert.equal(massDateLabel({ mass_date: '2026-12-16', mass_end_date: '2026-12-24' }), 'Dis 16 – 24');
    assert.equal(massDateLabel({ mass_date: '2026-12-30', mass_end_date: '2027-01-02' }), 'Dis 30 – Ene 2');
  });
});

describe('massSections', () => {
  const rows = [
    row({ start_time: '09:00:00' }),
    row({ start_time: '06:00:00' }),
    ...[1, 2, 3, 4, 5, 6].map((d) => row({ kind: 'Daily Mass', day_of_week: d, start_time: '06:30:00' })),
    row({ kind: 'Special Mass', occasion: 'Immaculate Conception', obligation: true, mass_date: '2026-12-08', day_of_week: 2, start_time: '18:00:00' }),
    row({ kind: 'Special Mass', occasion: 'Immaculate Conception', obligation: true, mass_date: '2026-12-08', day_of_week: 2, start_time: '06:00:00' }),
    row({ kind: 'Special Mass', occasion: 'Simbang Gabi', mass_date: '2026-12-16', mass_end_date: '2026-12-24', day_of_week: 3, start_time: '04:00:00' }),
    row({ kind: 'Special Mass', occasion: 'Nativity of Mary', mass_date: '2026-09-08', day_of_week: 2 }),
    row({ kind: 'Anticipated Mass', day_of_week: 6, start_time: '18:00:00' }),
    row({ kind: 'GKK Mass', location: 'GKK San Isidro', day_of_week: 3, start_time: '18:00:00' }),
    row({ kind: 'GKK Mass', location: 'GKK Sto. Niño', mass_date: '2026-09-30', day_of_week: 3 }),
    row({ kind: 'Confession', day_of_week: 6, start_time: '16:00:00', language: 'English' }),
  ];

  test('Sunday, daily, special and other, in that order', () => {
    const s = massSections(rows, {}, FRI);
    assert.deepEqual(s.map((x) => x.key), ['sunday', 'daily', 'special', 'other']);
    assert.deepEqual(s[0].rows.map((r) => r.start_time), ['06:00:00', '09:00:00']);
    assert.equal(s[1].rows.length, 1);
    assert.equal(s[1].rows[0].when, 'Lunes – Sabado');
    assert.equal(s[1].today, true);
  });

  test('a feast with two times is one block; past dates drop off', () => {
    const special = massSections(rows, {}, FRI).find((x) => x.key === 'special');
    assert.deepEqual(special.blocks.map((b) => b.occasion), ['Immaculate Conception', 'Simbang Gabi']);
    const ic = special.blocks[0];
    assert.equal(ic.obligation, true);
    assert.equal(ic.when, 'Dis 8, Martes');
    assert.deepEqual(ic.rows.map((r) => r.start_time), ['06:00:00', '18:00:00']);
    const other = massSections(rows, {}, FRI).find((x) => x.key === 'other');
    assert.equal(other.rows.some((r) => r.location === 'GKK Sto. Niño'), false);
    assert.deepEqual(other.rows.map((r) => r.when), ['Miyerkules', 'Sabado', 'Sabado']);
  });

  test('Simbang Gabi is still listed mid-run', () => {
    const dec20 = new Date(2026, 11, 20, 3, 0);
    const special = massSections(rows, {}, dec20).find((x) => x.key === 'special');
    assert.deepEqual(special.blocks.map((b) => b.occasion), ['Simbang Gabi']);
    assert.equal(special.today, true);
  });

  test('the language filter applies to every section', () => {
    const s = massSections(rows, { language: 'English' }, FRI);
    assert.deepEqual(s.map((x) => x.key), ['other']);
    assert.equal(s[0].rows[0].kind, 'Confession');
  });

  test('older "Mass" rows land in the Sunday and daily sections', () => {
    const s = massSections([row({ kind: 'Mass', day_of_week: 0 }), row({ kind: 'Mass', day_of_week: 2 })], {}, FRI);
    assert.deepEqual(s.map((x) => x.key), ['sunday', 'daily']);
  });
});

describe('upcomingToday', () => {
  test('dated rows only count on their dates, weekly ones on their day', () => {
    const friday = row({ kind: 'Daily Mass', day_of_week: 5, start_time: '18:00:00' });
    const feastToday = row({ kind: 'Special Mass', occasion: 'First Friday Mass', mass_date: '2026-10-02', day_of_week: 5, start_time: '19:00:00' });
    const feastLater = row({ kind: 'Special Mass', occasion: 'First Friday Mass', mass_date: '2026-11-06', day_of_week: 5, start_time: '17:00:00' });
    const ids = upcomingToday([friday, feastToday, feastLater], FRI).map((r) => r.id);
    assert.deepEqual(ids, [friday.id, feastToday.id]);
  });
  test('each day of a run counts', () => {
    const sg = row({ kind: 'Special Mass', occasion: 'Simbang Gabi', mass_date: '2026-12-16', mass_end_date: '2026-12-24', day_of_week: 3, start_time: '04:00:00' });
    assert.equal(upcomingToday([sg], new Date(2026, 11, 19, 2, 0)).length, 1);
    assert.equal(upcomingToday([sg], new Date(2026, 11, 25, 2, 0)).length, 0);
  });
});

describe('isCurrentMass', () => {
  test('weekly rows always are; dated ones until their last day', () => {
    assert.equal(isCurrentMass(row(), '2030-01-01'), true);
    assert.equal(isCurrentMass(row({ mass_date: '2026-12-16', mass_end_date: '2026-12-24' }), '2026-12-24'), true);
    assert.equal(isCurrentMass(row({ mass_date: '2026-12-16', mass_end_date: '2026-12-24' }), '2026-12-25'), false);
  });
});
