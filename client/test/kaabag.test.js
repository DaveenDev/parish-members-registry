import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  firstSunday, groupMonths, groupSundays, isKaabagGroup, massRule, monthChoices, monthName, monthOf, monthTitle, nextAutoRun, nextMonth,
  openingMonth, peopleLines, placesShort, setMassRule, validServers,
} from '../src/lib/kaabag.js';
import { describeActivity } from '../src/lib/activity.js';

describe('the Kaabag schedule: dates', () => {
  test('a month is its first day', () => {
    assert.equal(monthOf('2026-12-27'), '2026-12-01');
    assert.equal(nextMonth('2026-11-01'), '2026-12-01');
    assert.equal(nextMonth('2026-12-01'), '2027-01-01');
  });

  test('names a month for staff and for the website', () => {
    assert.equal(monthName('2026-12-01'), 'December 2026');
    assert.equal(monthTitle('2026-12-01'), 'Disyembre 2026');
  });

  test('finds the first Sunday, when the 1st is itself a Sunday too', () => {
    assert.equal(firstSunday('2026-11-01'), '2026-11-01');
    assert.equal(firstSunday('2026-12-15'), '2026-12-06');
    assert.equal(firstSunday('2027-02-01'), '2027-02-07');
  });

  test('the months to choose from start at the next one with a Sunday left', () => {
    assert.deepEqual(monthChoices('2026-11-01'), ['2026-11-01', '2026-12-01', '2027-01-01']);
    assert.deepEqual(monthChoices('2026-11-29'), ['2026-11-01', '2026-12-01', '2027-01-01'], 'on the last Sunday itself');
    assert.deepEqual(monthChoices('2026-11-30'), ['2026-12-01', '2027-01-01', '2027-02-01'], 'none left in November');
  });

  test('a month with a schedule stays a choice, even with no Sunday left', () => {
    assert.deepEqual(monthChoices('2026-11-30', ['2026-11-29']), ['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']);
  });

  test('opens on the next scheduled Sunday, else the next month to make', () => {
    const choices = ['2026-11-01', '2026-12-01', '2027-01-01'];
    assert.equal(openingMonth(['2026-12-06'], choices, '2026-11-20'), '2026-12-01');
    assert.equal(openingMonth([], choices, '2026-11-20'), '2026-11-01');
    assert.equal(openingMonth(['2026-11-01'], choices, '2026-11-20'), '2026-11-01');
  });
});

describe('the Kaabag schedule: the next automatic run', () => {
  test('is 7 days before the first Sunday, the last Sunday of the month before', () => {
    assert.deepEqual(nextAutoRun('2026-11-02', ['2026-11-01']), { on: '2026-11-29', month: '2026-12-01' });
    assert.deepEqual(nextAutoRun('2027-01-05', ['2027-01-03']), { on: '2027-01-31', month: '2027-02-01' });
  });

  test('a month already made is skipped', () => {
    assert.deepEqual(nextAutoRun('2026-11-02', ['2026-11-01', '2026-12-06']), { on: '2026-12-27', month: '2027-01-01' });
  });

  test('a missed run tries again each morning, up to the first Sunday', () => {
    assert.deepEqual(nextAutoRun('2026-11-30', ['2026-11-01']), { on: '2026-12-01', month: '2026-12-01' });
    assert.deepEqual(nextAutoRun('2026-12-06', ['2026-11-01']), { on: '2026-12-27', month: '2027-01-01' }, 'too late for December');
  });
});

describe('the Kaabag schedule: laying it out', () => {
  const rows = [
    { date: '2026-11-29', time: '06:00' }, { date: '2026-11-29', time: '08:00' },
    { date: '2026-12-06', time: '06:00' }, { date: '2026-12-13', time: '06:00' },
  ];

  test('groups Masses by Sunday and Sundays by month, in order', () => {
    const sundays = groupSundays(rows);
    assert.deepEqual(sundays.map((s) => [s.date, s.masses.length]), [['2026-11-29', 2], ['2026-12-06', 1], ['2026-12-13', 1]]);
    assert.deepEqual(groupMonths(sundays).map((m) => [m.month, m.sundays.length]), [['2026-11-01', 1], ['2026-12-01', 2]]);
  });

  test('the admin rows group by their own date field', () => {
    assert.equal(groupSundays([{ service_date: '2026-12-06' }, { service_date: '2026-12-06' }], 'service_date').length, 1);
  });

  test('anyone who has not agreed is only counted, never named', () => {
    assert.deepEqual(peopleLines(['Juan Cruz', 'Pedro Reyes']), ['Juan Cruz', 'Pedro Reyes']);
    assert.deepEqual(peopleLines(['Juan Cruz', null, null]), ['Juan Cruz', 'ug 2 pa ka Kaabag']);
    assert.deepEqual(peopleLines([null, null]), ['2 ka Kaabag']);
    assert.deepEqual(peopleLines([]), []);
  });

  test('counts the places still to fill', () => {
    assert.equal(placesShort({ needed: 3, people: [{}] }), 2);
    assert.equal(placesShort({ needed: 2, people: [{}, {}, {}] }), 0, 'someone added by hand beyond the number');
  });

  test('knows the Kaabag ministry by name, as the database does', () => {
    assert.ok(isKaabagGroup('Kaabag'));
    assert.ok(isKaabagGroup(' kaabag sa Pari'));
    assert.ok(!isKaabagGroup('Choir'));
    assert.ok(!isKaabagGroup(null));
  });
});

describe('the Kaabag schedule: rules for a Mass', () => {
  test('a Mass with nothing special is left out', () => {
    assert.deepEqual(setMassRule({}, 3, { skip: false, servers: undefined }), {});
    assert.deepEqual(setMassRule({ 3: { skip: true } }, 3, { skip: false }), {});
  });

  test('keeps the other Masses and the rest of this one', () => {
    const rules = { 3: { servers: 4 }, 4: { skip: true } };
    assert.deepEqual(setMassRule(rules, 3, { skip: true }), { 3: { servers: 4, skip: true }, 4: { skip: true } });
    assert.deepEqual(massRule(rules, 3), { servers: 4 });
    assert.deepEqual(massRule(rules, 9), {});
    assert.deepEqual(massRule(null, 9), {});
  });

  test('a number of Kaabag is a whole number from 1 to 12', () => {
    assert.ok(validServers(1) && validServers(12));
    assert.ok(!validServers(0) && !validServers(13) && !validServers(1.5) && !validServers(Number.NaN));
  });
});

describe('the Kaabag schedule: the activity log', () => {
  test('a schedule being made is one line, with how it went', () => {
    const summary = { masses: 12, places: 24, filled: 22 };
    assert.deepEqual(describeActivity({ table_name: 'kaabag_services', action: 'insert', changes: summary }), {
      title: 'Made the Kaabag schedule', lines: ['22 of 24 places filled at 12 Masses'],
    });
    assert.equal(describeActivity({ table_name: 'kaabag_services', action: 'update', changes: summary }).title, 'Redid the Kaabag schedule');
  });

  test('says when someone agreed to be shown', () => {
    const d = describeActivity({ table_name: 'kaabag_roster', action: 'update', changes: { show_publicly: [false, true], consent_on: [null, '2026-11-01'] } });
    assert.equal(d.title, 'Updated the name on the Kaabag list');
    assert.deepEqual(d.lines, ['Show on the website: No → Yes', 'Agreed on: — → 2026-11-01']);
  });
});
