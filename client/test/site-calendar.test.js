import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { eventsOnDay, monthCells } from '../src/lib/site.js';

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
