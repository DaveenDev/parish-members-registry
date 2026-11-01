import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { allSundays, firstMassDay, firstSunday, groupDays, groupMonths, isKaabagGroup, massDay, massDaysIn, massRule, monthChoices, monthName, monthOf,
  monthTitle, nextAutoRun, nextMonth, openingMonth, peopleLines, placesShort, servedDays, setDay, setMassRule, validServers, isKaabagChart,
  unnamedCount } from '../src/lib/kaabag.js';
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

  test('groups Masses by day and days by month, in order', () => {
    const days = groupDays(rows);
    assert.deepEqual(days.map((s) => [s.date, s.masses.length]), [['2026-11-29', 2], ['2026-12-06', 1], ['2026-12-13', 1]]);
    assert.deepEqual(groupMonths(days).map((m) => [m.month, m.days.length]), [['2026-11-01', 1], ['2026-12-01', 2]]);
  });

  test('the admin rows group by their own date field', () => {
    assert.equal(groupDays([{ service_date: '2026-12-06' }, { service_date: '2026-12-06' }], 'service_date').length, 1);
  });

  test('a Saturday is a day of its own, and the website stops saying "sa Domingo"', () => {
    const days = groupDays([{ date: '2026-12-05', time: '17:00' }, { date: '2026-12-06', time: '06:00' }]);
    assert.deepEqual(days.map((d) => d.date), ['2026-12-05', '2026-12-06']);
    assert.ok(!allSundays(days));
    assert.ok(allSundays(groupDays(rows)));
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

describe('the Kaabag schedule: Saturday and weekday Masses (0116)', () => {
  const masses = [
    { id: 1, day_of_week: 0, start_time: '06:00' }, { id: 2, day_of_week: 0, start_time: '08:00' },
    { id: 3, day_of_week: 6, start_time: '17:00' }, { id: 4, day_of_week: 3, start_time: '06:00' },
  ];

  test('Sundays only until another day is ticked', () => {
    assert.deepEqual(servedDays(masses, { days: [] }), [0]);
    assert.deepEqual(servedDays(masses, {}), [0], 'a database before 0116');
    assert.deepEqual(servedDays(masses, { days: [6, 3] }), [0, 3, 6]);
  });

  test('a day whose only Mass is left out has no Kaabag', () => {
    assert.deepEqual(servedDays(masses, { days: [3, 6], mass_rules: { 4: { skip: true } } }), [0, 6]);
    assert.deepEqual(servedDays(masses, { days: [3], mass_rules: { 1: { skip: true }, 2: { skip: true } } }), [3]);
  });

  test('a day ticked with no Mass on it adds nothing', () => {
    assert.deepEqual(servedDays(masses, { days: [1] }), [0]);
  });

  test('a Mass from before 0116 is a Sunday\'s', () => {
    assert.equal(massDay({ id: 1 }), 0);
    assert.equal(massDay({ day_of_week: 6 }), 6);
  });

  test('ticks a day on and off, in order', () => {
    assert.deepEqual(setDay([], 6, true), [6]);
    assert.deepEqual(setDay([6], 3, true), [3, 6]);
    assert.deepEqual(setDay([3, 6], 6, false), [3]);
    assert.deepEqual(setDay([3], 3, true), [3]);
  });

  test('the dates of a month on the days served', () => {
    assert.deepEqual(massDaysIn('2026-12-01', [0]), ['2026-12-06', '2026-12-13', '2026-12-20', '2026-12-27']);
    assert.deepEqual(massDaysIn('2026-12-01', [3]).slice(0, 2), ['2026-12-02', '2026-12-09']);
    assert.equal(massDaysIn('2026-12-01', [0, 3, 6]).length, 4 + 5 + 4);
    assert.deepEqual(massDaysIn('2026-12-01', []), massDaysIn('2026-12-01', [0]), 'none means Sundays');
  });

  test('the first Mass day can come before the first Sunday', () => {
    assert.equal(firstMassDay('2026-12-01'), '2026-12-06');
    assert.equal(firstMassDay('2026-12-01', [0, 6]), '2026-12-05');
    assert.equal(firstMassDay('2027-01-01', [0, 6]), '2027-01-02');
  });

  test('the automatic run is 7 days before it, as the database has it', () => {
    assert.deepEqual(nextAutoRun('2026-12-01', ['2026-12-05'], [0, 6]), { on: '2026-12-26', month: '2027-01-01' });
    assert.deepEqual(nextAutoRun('2026-12-01', ['2026-12-06'], [0]), { on: '2026-12-27', month: '2027-01-01' });
  });

  test('a month with only a Wednesday left is still a choice', () => {
    assert.deepEqual(monthChoices('2026-12-28', [], 2, [0]), ['2027-01-01', '2027-02-01']);
    assert.deepEqual(monthChoices('2026-12-28', [], 2, [0, 3]), ['2026-12-01', '2027-01-01'], 'Wednesday 30 December');
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

  test('names the other days ticked, not their numbers', () => {
    const d = describeActivity({ table_name: 'kaabag_settings', action: 'update', changes: { days: [[], [3, 6]] } });
    assert.deepEqual(d.lines, ['Other days with Kaabag: — → Wednesday, Saturday']);
  });

  test('says when someone agreed to be shown', () => {
    const d = describeActivity({ table_name: 'kaabag_roster', action: 'update', changes: { show_publicly: [false, true], consent_on: [null, '2026-11-01'] } });
    assert.equal(d.title, 'Updated the name on the Kaabag list');
    assert.deepEqual(d.lines, ['Show on the website: No → Yes', 'Agreed on: — → 2026-11-01']);
  });
});

describe('the directory and the structure chart (0115)', () => {
  test('counts those on the list who are not named, because they have not agreed', () => {
    assert.equal(unnamedCount({ total: 12, people: new Array(8).fill({}) }), 4);
    assert.equal(unnamedCount({ total: 3, people: [{}, {}, {}] }), 0);
    assert.equal(unnamedCount({ total: 0, people: [] }), 0);
    assert.equal(unnamedCount(null), 0);
    assert.equal(unnamedCount(undefined), 0);
  });
  test('the Kaabag Structure is known by its slug, whatever it is called', () => {
    assert.ok(isKaabagChart({ slug: 'kaabag-structure', title: 'Mga Opisyal sa Kaabag' }));
    assert.ok(!isKaabagChart({ slug: 'church-structure', title: 'Kaabag Structure' }));
    assert.ok(!isKaabagChart(null));
  });
});
