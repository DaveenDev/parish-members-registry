import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { censusCountdown, daysUntil, eventCountdown, eventsOnDay, guideShortTitle, isRecent, monthCells, readingTime, sortAnnouncements, sortCensusGkks } from '../src/lib/site.js';

describe('monthCells', () => {
  test('pads October 2026 to whole Sunday-first weeks', () => {
    const cells = monthCells('2026-10');
    assert.equal(cells.length, 35);
    assert.deepEqual(cells[0], { iso: '2026-09-27', day: 27, dow: 0, inMonth: false });
    assert.equal(cells.find((c) => c.inMonth).iso, '2026-10-01');
    assert.equal(cells.at(-1).iso, '2026-10-31');
  });

  test('February starting on a Sunday fills exactly four weeks', () => {
    const cells = monthCells('2026-02');
    assert.equal(cells.length, 28);
    assert.ok(cells.every((c) => c.inMonth));
  });
});

describe('eventsOnDay', () => {
  const novena = { id: 1, start_date: '2026-12-03', end_date: '2026-12-11' };
  const fiesta = { id: 2, start_date: '2026-12-05', end_date: null };

  test('includes multi-day events on their middle days, longest first', () => {
    const got = eventsOnDay([fiesta, novena], '2026-12-05', 6);
    assert.deepEqual(got.map((x) => x.e.id), [1, 2]);
    assert.equal(got[0].starts, false);
    assert.equal(got[0].ends, true); // Saturday: the bar breaks at the week's end
    assert.equal(got[1].starts && got[1].ends, true);
  });

  test('a bar starts again on Sunday', () => {
    const [x] = eventsOnDay([novena], '2026-12-06', 0);
    assert.equal(x.starts, true);
    assert.equal(x.ends, false);
  });

  test('skips days outside the event', () => {
    assert.equal(eventsOnDay([novena], '2026-12-12', 6).length, 0);
  });
});

describe('sortCensusGkks', () => {
  const rows = [{ name: 'Sto. Niño -Balabag', pct: 40 }, { name: 'Birhen sa Fatima -Mua-an', pct: null }, { name: 'San Jose -Ginatilan', pct: 90 }, { name: 'Amor -Lumot', pct: null }, { name: 'Santa Monica', pct: 40 }];
  const names = (list) => list.map((r) => r.name);

  test('Pinakataas: highest first, hidden percentages last, ties by name', () => {
    assert.deepEqual(names(sortCensusGkks(rows, 'pct')), ['San Jose -Ginatilan', 'Santa Monica', 'Sto. Niño -Balabag', 'Amor -Lumot', 'Birhen sa Fatima -Mua-an']);
  });

  test('Ngalan: A to Z, and the input is left alone', () => {
    assert.deepEqual(names(sortCensusGkks(rows, 'name')), ['Amor -Lumot', 'Birhen sa Fatima -Mua-an', 'San Jose -Ginatilan', 'Santa Monica', 'Sto. Niño -Balabag']);
    assert.equal(rows[0].name, 'Sto. Niño -Balabag');
  });
});

describe('census countdown', () => {
  test('daysUntil counts whole days, 0 on the last day', () => {
    assert.equal(daysUntil('2026-10-30', '2026-10-02'), 28);
    assert.equal(daysUntil('2026-10-30', '2026-10-30'), 0);
    assert.equal(daysUntil('2026-10-30', '2026-10-31'), -1);
    assert.equal(daysUntil('', '2026-10-02'), null);
  });

  test('censusCountdown only in the last 7 days', () => {
    assert.equal(censusCountdown('2026-10-30', '2026-10-02'), null);
    assert.equal(censusCountdown('2026-10-30', '2026-10-23'), '7 ka adlaw na lang');
    assert.equal(censusCountdown('2026-10-30', '2026-10-29'), 'Ugma na ang katapusan');
    assert.equal(censusCountdown('2026-10-30', '2026-10-30'), 'Karon na ang katapusang adlaw');
    assert.equal(censusCountdown('2026-10-30', '2026-10-31'), null);
    assert.equal(censusCountdown(null, '2026-10-02'), null);
  });
});

describe('eventCountdown', () => {
  // Friday 2 October 2026.
  const TODAY = '2026-10-02';
  const on = (start_date, end_date = '') => eventCountdown({ start_date, end_date }, TODAY);
  test('today, tomorrow, this week, within a month', () => {
    assert.equal(on('2026-10-02'), 'Karon');
    assert.equal(on('2026-10-03'), 'Ugma');
    assert.equal(on('2026-10-04'), 'Karong Domingo');
    assert.equal(on('2026-10-08'), 'Karong Huwebes');
    assert.equal(on('2026-10-09'), '7 days from now');
    assert.equal(on('2026-11-01'), '30 days from now');
  });
  test('which day of a multi-day event is on', () => {
    assert.equal(on('2026-09-30', '2026-10-08'), 'Adlaw 3 sa 9');
    assert.equal(on('2026-10-02', '2026-10-10'), 'Adlaw 1 sa 9');
  });
  test('nothing when far off, over, or without a date', () => {
    assert.equal(on('2026-11-02'), null);
    assert.equal(on('2026-10-01'), null);
    assert.equal(on('2026-09-25', '2026-10-01'), null);
    assert.equal(on(''), null);
  });
});

describe('guideShortTitle', () => {
  test('drops the translation in brackets at the end', () => {
    assert.equal(guideShortTitle('Bunyag (Baptism)'), 'Bunyag');
    assert.equal(guideShortTitle('Unang Kalawat (First Communion)'), 'Unang Kalawat');
    assert.equal(guideShortTitle('OCIA (Pagkahimong Katoliko sa mga Hamtong)'), 'OCIA');
  });
  test('leaves a title without brackets, or only brackets, as it is', () => {
    assert.equal(guideShortTitle('Kumpil'), 'Kumpil');
    assert.equal(guideShortTitle('(Baptism)'), '(Baptism)');
  });
});

describe('readingTime and isRecent', () => {
  test('reading time at about 200 words a minute, at least a minute', () => {
    assert.equal(readingTime('word '.repeat(600)), '3 minutos basahon');
    assert.equal(readingTime('Salamat'), '1 minuto basahon');
    assert.equal(readingTime('  '), null);
  });
  test('recent means posted in the last 3 days', () => {
    assert.equal(isRecent('2026-10-02', '2026-10-02'), true);
    assert.equal(isRecent('2026-09-30', '2026-10-02'), true);
    assert.equal(isRecent('2026-09-29', '2026-10-02'), false);
    assert.equal(isRecent('2026-10-05', '2026-10-02'), false);
    assert.equal(isRecent(null, '2026-10-02'), false);
  });
});

describe('sortAnnouncements', () => {
  test('urgent first, then pinned, then newest', () => {
    const rows = [
      { id: 1, publish_on: '2026-10-01' },
      { id: 2, publish_on: '2026-09-20', pinned: true },
      { id: 3, publish_on: '2026-09-01', urgent: true },
      { id: 4, publish_on: '2026-10-02' },
    ];
    assert.deepEqual(sortAnnouncements(rows).map((r) => r.id), [3, 2, 4, 1]);
    assert.equal(rows[0].id, 1);
  });
});
