import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  addMonths, isKaabagChart, mergeSlots, monthChoices, monthDates, monthDays, monthNames, monthOf, monthTitle, monthTitleEn, moved,
  notListed, pickMonth, registryName, rotate, slotsByDate, slotsError, slotsFromSchedule, slotsPayload, sortDirectory, turnsOf,
} from '../src/lib/kaabag.js';

let nextId = 1;
const mass = (over = {}) => ({ id: nextId++, day_of_week: 0, start_time: '07:00:00', kind: 'Regular Mass', location: 'Main church', language: 'Bisaya', published: true, mass_date: null, mass_end_date: null, occasion: null, ...over });
const slot = (date, time, over = {}) => ({ date, time, location: 'Main church', note: '', servers: [], ...over });

describe('months', () => {
  test('month of a date, months before and after, across the year', () => {
    assert.equal(monthOf('2026-11-30'), '2026-11-01');
    assert.equal(addMonths('2026-11-01', 1), '2026-12-01');
    assert.equal(addMonths('2026-12-01', 1), '2027-01-01');
    assert.equal(addMonths('2026-01-01', -1), '2025-12-01');
  });
  test('every day of the month, February in a leap year too', () => {
    assert.equal(monthDates('2026-11-01').length, 30);
    assert.equal(monthDates('2026-11-01')[29], '2026-11-30');
    assert.equal(monthDates('2028-02-01').length, 29);
  });
  test('titles in Bisaya for the website and English for the admin', () => {
    assert.equal(monthTitle('2026-11-01'), 'Nobyembre 2026');
    assert.equal(monthTitleEn('2026-11-01'), 'November 2026');
  });
  test('the admin offers last month to six ahead, and saved months further off', () => {
    const c = monthChoices('2026-11-15', ['2026-03-01']);
    assert.equal(c[0], '2026-03-01');
    assert.ok(c.includes('2026-10-01') && c.includes('2027-05-01'));
    assert.equal(c.length, 9);
  });
});

describe('slotsFromSchedule', () => {
  const rows = [
    mass({ start_time: '06:00:00' }),
    mass({ start_time: '08:00:00', location: 'San Roque Chapel' }),
    mass({ kind: 'Anticipated Mass', day_of_week: 6, start_time: '17:30:00' }),
    mass({ kind: 'Mass', day_of_week: 3, start_time: '06:00:00' }), // a Daily Mass, as old rows are stored
    mass({ kind: 'Special Mass', day_of_week: 2, start_time: '18:00:00', mass_date: '2026-12-08', occasion: 'Immaculate Conception' }),
    mass({ kind: 'Confession', day_of_week: 6, start_time: '15:00:00' }),
    mass({ start_time: '10:00:00', published: false }),
  ];

  test('Sundays and anticipated Masses by default, in order, published only', () => {
    const s = slotsFromSchedule(rows, '2026-11-01');
    // Nov 2026: 5 Sundays (two Masses each) and 4 Saturdays.
    assert.equal(s.length, 14);
    assert.deepEqual(s[0], { date: '2026-11-01', time: '06:00', location: 'Main church', note: '', servers: [] });
    assert.equal(s[1].location, 'San Roque Chapel');
    assert.equal(s[2].date, '2026-11-07');
    assert.equal(s[2].time, '17:30');
    assert.ok(!s.some((x) => x.time === '10:00' || x.time === '15:00'));
  });
  test('a special Mass on its date, named by its occasion', () => {
    const s = slotsFromSchedule(rows, '2026-12-01', { types: ['Special Mass'] });
    assert.deepEqual(s, [{ date: '2026-12-08', time: '18:00', location: 'Main church', note: 'Immaculate Conception', servers: [] }]);
  });
  test('daily Masses and one place only', () => {
    assert.equal(slotsFromSchedule(rows, '2026-11-01', { types: ['Daily Mass'] }).length, 4);
    assert.equal(slotsFromSchedule(rows, '2026-11-01', { location: 'san roque chapel' }).length, 5);
  });
});

describe('mergeSlots and slotsError', () => {
  test('a Mass already there (same day, time and place) is not added again', () => {
    const have = [slot('2026-11-01', '06:00', { servers: [1] })];
    const out = mergeSlots(have, [slot('2026-11-01', '6:00'), slot('2026-11-01', '06:00', { location: 'Chapel' }), slot('2026-10-31', '17:30')]);
    assert.equal(out.length, 3);
    assert.deepEqual(out.map((s) => [s.date, s.time, s.location]), [['2026-10-31', '17:30', 'Main church'], ['2026-11-01', '06:00', 'Chapel'], ['2026-11-01', '06:00', 'Main church']]);
    assert.deepEqual(out[2].servers, [1]);
  });
  test('refuses a missing time, another month and two of the same Mass', () => {
    assert.equal(slotsError([slot('2026-11-01', '06:00')], '2026-11-01'), '');
    assert.match(slotsError([slot('2026-11-01', '')], '2026-11-01'), /time/);
    assert.match(slotsError([slot('2026-12-01', '06:00')], '2026-11-01'), /isn't in November 2026/);
    assert.match(slotsError([slot('2026-11-01', '06:00'), slot('2026-11-01', '06:00', { location: ' main church ' })], '2026-11-01'), /two Masses/);
  });
  test('the payload is sorted, trimmed and has each Kaabag once', () => {
    const p = slotsPayload([slot('2026-11-08', '08:00', { note: ' Fiesta ', servers: [2, 2, 3] }), slot('2026-11-01', '06:00')]);
    assert.equal(p[0].date, '2026-11-01');
    assert.deepEqual(p[1], { date: '2026-11-08', time: '08:00', location: 'Main church', note: 'Fiesta', servers: [2, 3] });
  });
});

describe('rotate and turnsOf', () => {
  test('everyone serves before anyone serves twice; Masses with Kaabag keep them', () => {
    const slots = [slot('2026-11-01', '06:00'), slot('2026-11-01', '08:00', { servers: [9] }), slot('2026-11-08', '06:00'), slot('2026-11-08', '08:00')];
    const out = rotate(slots, [1, 2, 3], 2);
    assert.deepEqual(out.map((s) => s.servers), [[1, 2], [9], [3, 1], [2, 3]]);
    assert.deepEqual([...turnsOf(out)].sort(), [[1, 2], [2, 2], [3, 2], [9, 1]]);
  });
  test('never more per Mass than there are Kaabag, and nobody to hand out leaves it as it is', () => {
    assert.deepEqual(rotate([slot('2026-11-01', '06:00')], [5], 3)[0].servers, [5]);
    const slots = [slot('2026-11-01', '06:00')];
    assert.equal(rotate(slots, [], 2), slots);
  });
});

describe('the website', () => {
  const months = [
    { month: '2026-10-01', services: [] },
    { month: '2026-11-01', services: [
      { date: '2026-11-08', time: '08:00:00', servers: [{ name: 'Pedro' }] },
      { date: '2026-11-01', time: '06:00:00', servers: [{ name: 'Juan' }, { name: 'Pedro' }] },
      { date: '2026-11-01', time: '08:00:00', servers: [{ name: 'Andres' }] },
    ] },
    { month: '2026-12-01', services: [] },
  ];
  test('opens on this month, else the next, else the latest', () => {
    assert.equal(pickMonth(months, '2026-11-20').month, '2026-11-01');
    assert.equal(pickMonth([months[0], months[2]], '2026-11-20').month, '2026-12-01');
    assert.equal(pickMonth([months[0]], '2026-11-20').month, '2026-10-01');
    assert.equal(pickMonth([], '2026-11-20'), null);
  });
  test('days in order, and one Kaabag\'s turns only', () => {
    const days = monthDays(months[1]);
    assert.deepEqual(days.map((d) => [d.date, d.slots.map((s) => s.time)]), [['2026-11-01', ['06:00', '08:00']], ['2026-11-08', ['08:00']]]);
    assert.deepEqual(monthDays(months[1], 'Pedro').map((d) => d.date), ['2026-11-01', '2026-11-08']);
    assert.deepEqual(monthDays(months[1], 'Andres').map((d) => d.slots.length), [1]);
    assert.deepEqual(monthNames(months[1]), ['Andres', 'Juan', 'Pedro']);
  });
  test('slotsByDate groups a day\'s Masses together', () => {
    assert.deepEqual(slotsByDate([slot('2026-11-08', '06:00'), slot('2026-11-01', '08:00'), slot('2026-11-01', '06:00')]).map((d) => d.slots.length), [2, 1]);
  });
  test('the Kaabag Structure is known by its slug, whatever it is called', () => {
    assert.ok(isKaabagChart({ slug: 'kaabag-structure', title: 'Mga Opisyal sa Kaabag' }));
    assert.ok(!isKaabagChart({ slug: 'church-structure' }));
    assert.ok(!isKaabagChart(null));
  });
});

describe('the directory', () => {
  test('a registry member\'s name with the middle initial and suffix', () => {
    assert.equal(registryName({ first_name: 'Juan', middle_name: 'dela Paz', last_name: 'Cruz', suffix: 'Jr.' }), 'Juan D. Cruz Jr.');
    assert.equal(registryName({ first_name: 'Pedro', middle_name: '', last_name: 'Santos', suffix: null }), 'Pedro Santos');
  });
  test('the registry\'s Kaabag not listed yet, without those no longer in the parish', () => {
    const registry = [
      { id: 1, first_name: 'Juan', last_name: 'Cruz' },
      { id: 2, first_name: 'Ana', last_name: 'Bautista', membership_status: 'Deceased' },
      { id: 3, first_name: 'Ramon', last_name: 'Abad' },
      { id: 4, first_name: 'Luis', last_name: 'Zamora', membership_status: 'Active' },
    ];
    assert.deepEqual(notListed(registry, [{ member_id: 1 }, { member_id: null }]).map((m) => m.id), [3, 4]);
  });
  test('in its order, then by name; moving one swaps it with its neighbour', () => {
    const rows = [{ id: 1, name: 'Zed', sort_order: 0 }, { id: 2, name: 'Abe', sort_order: 0 }, { id: 3, name: 'Max', sort_order: 1 }];
    assert.deepEqual(sortDirectory(rows).map((r) => r.id), [2, 1, 3]);
    assert.deepEqual(moved(rows, 1, 1), [2, 3, 1]);
    assert.deepEqual(moved(rows, 0, -1), [2, 1, 3]);
  });
});
