import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { anchors, celebrationsBetween, celebrationsOn, easterSunday, liturgicalDay, seasonId, seasonSpan } from '../src/lib/liturgy.js';

const data = JSON.parse(readFileSync(new URL('../src/data/liturgical-calendar.json', import.meta.url), 'utf8'));
const names = (iso) => celebrationsOn(iso, data).map((c) => c.en);
/** The day `en` falls on in `year`, or undefined. */
const dateOf = (en, year) => celebrationsBetween(`${year}-01-01`, `${year}-12-31`, data).find((c) => c.en === en)?.date;

test('Easter Sunday', () => {
  assert.equal(easterSunday(2019), '2019-04-21');
  assert.equal(easterSunday(2024), '2024-03-31');
  assert.equal(easterSunday(2025), '2025-04-20');
  assert.equal(easterSunday(2026), '2026-04-05');
  assert.equal(easterSunday(2027), '2027-03-28');
});

test('the Philippine anchors: Epiphany, Baptism, Santo Niño, Advent, Holy Family', () => {
  assert.deepEqual(anchors(2026), {
    easter: '2026-04-05', advent1: '2026-11-29', epiphany: '2026-01-04', baptism: '2026-01-11', santoNino: '2026-01-18', holyFamily: '2026-12-27',
  });
  assert.equal(anchors(2025).santoNino, '2025-01-19');
  assert.equal(anchors(2024).advent1, '2024-12-01');
  // Epiphany on 7 January: the Baptism is the Monday after.
  assert.equal(anchors(2029).epiphany, '2029-01-07');
  assert.equal(anchors(2029).baptism, '2029-01-08');
  // Christmas on a Sunday: no Sunday in the octave, so 30 December.
  assert.equal(anchors(2022).holyFamily, '2022-12-30');
});

test('Lent, Holy Week and Easter days for 2026', () => {
  assert.deepEqual(names('2026-02-18'), ['Ash Wednesday']);
  assert.deepEqual(names('2026-03-29'), ['Palm Sunday of the Passion of the Lord']);
  assert.deepEqual(names('2026-04-03'), ['Good Friday']);
  assert.deepEqual(names('2026-04-05'), ['Easter Sunday']);
  assert.equal(dateOf('Ascension of the Lord', 2026), '2026-05-17');
  assert.equal(dateOf('Pentecost Sunday', 2026), '2026-05-24');
  assert.equal(dateOf('Christ the King', 2026), '2026-11-22');
});

test('seasons', () => {
  assert.equal(seasonId('2026-01-05'), 'christmas');
  assert.equal(seasonId('2026-01-12'), 'ordinary');
  assert.equal(seasonId('2026-03-01'), 'lent');
  assert.equal(seasonId('2026-03-31'), 'holyweek');
  assert.equal(seasonId('2026-04-10'), 'easter');
  assert.equal(seasonId('2026-10-07'), 'ordinary');
  assert.equal(seasonId('2026-12-01'), 'advent');
  assert.equal(seasonId('2026-12-26'), 'christmas');
  const span = seasonSpan('2026-10-07', data);
  assert.equal(span.ends, '2026-11-28');
  assert.equal(span.next.id, 'advent');
  assert.equal(span.next.starts, '2026-11-29');
});

test('a solemnity on a Sunday of Advent moves to the Monday, without the obligation', () => {
  assert.equal(dateOf('Immaculate Conception', 2024), '2024-12-09');
  const moved = celebrationsOn('2024-12-09', data)[0];
  assert.equal(moved.movedFrom, '2024-12-08');
  assert.equal(moved.obligation, false);
  assert.equal(celebrationsOn('2026-12-08', data)[0].obligation, true);
});

test('solemnities in Holy Week or the Easter Octave move after it; Saint Joseph before Palm Sunday', () => {
  assert.equal(dateOf('Annunciation of the Lord', 2024), '2024-04-08');
  assert.equal(dateOf('Saint Joseph, Spouse of Mary', 2008), '2008-03-15');
  // A Lenten weekday keeps it.
  assert.equal(dateOf('Saint Joseph, Spouse of Mary', 2026), '2026-03-19');
});

test('a solemnity meeting a moveable one moves to the day before', () => {
  // 2022: the Sacred Heart fell on 24 June.
  assert.equal(dateOf('Most Sacred Heart of Jesus', 2022), '2022-06-24');
  assert.equal(dateOf('Nativity of Saint John the Baptist', 2022), '2022-06-23');
});

test('feasts give way to Sundays, except Feasts of the Lord in Ordinary Time', () => {
  // 25 January 2026 is a Sunday.
  assert.equal(dateOf('Conversion of Saint Paul', 2026), undefined);
  // The Transfiguration on Sunday 6 August 2023 is kept.
  assert.equal(dateOf('Transfiguration of the Lord', 2023), '2023-08-06');
  // The Holy Family on 27 December 2026 replaces Saint John.
  assert.deepEqual(names('2026-12-27'), ['The Holy Family']);
});

test('the parish fiesta, Simbang Gabi and the day color', () => {
  const fiesta = celebrationsOn('2026-12-12', data)[0];
  assert.equal(fiesta.parish, true);
  const gabi = celebrationsOn('2026-12-20', data).find((c) => c.rank === 'devotion');
  assert.equal(gabi.day, 5);
  assert.equal(gabi.of, 9);
  // Simbang Gabi shows once in a list of the month.
  assert.equal(celebrationsBetween('2026-12-01', '2026-12-31', data, ['devotion']).length, 1);
  assert.equal(liturgicalDay('2026-10-07', data).color, 'green');
  assert.equal(liturgicalDay('2026-12-13', data).color, 'rose');
  assert.equal(liturgicalDay('2026-03-04', data).color, 'violet');
});
