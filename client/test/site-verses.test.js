import test from 'node:test';
import assert from 'node:assert/strict';

import { dailyIndex } from '../src/lib/site.js';
import { PARTS, VERSES } from '../src/lib/verses.js';

test('one verse a day, the same all day, going round all of them', () => {
  assert.equal(dailyIndex('2026-10-05', 100), dailyIndex('2026-10-05', 100));
  assert.equal((dailyIndex('2026-10-05', 100) + 1) % 100, dailyIndex('2026-10-06', 100));
  // Across a year end and a leap day.
  assert.equal((dailyIndex('2026-12-31', 100) + 1) % 100, dailyIndex('2027-01-01', 100));
  assert.equal((dailyIndex('2028-02-28', 100) + 2) % 100, dailyIndex('2028-03-01', 100));
  assert.equal(new Set(Array.from({ length: 100 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 0, 1 + i));
    return dailyIndex(d.toISOString().slice(0, 10), 100);
  })).size, 100);
  assert.equal(dailyIndex('2026-10-05', 0), 0);
});

test('100 verses, each with its Catechism teaching', () => {
  assert.equal(VERSES.length, 100);
  assert.equal(new Set(VERSES.map((v) => v.ref)).size, 100);
  for (const v of VERSES) {
    assert.ok(v.text.length > 10 && v.explain.length > 60, v.ref);
    assert.ok(PARTS[v.part], `${v.ref}: part ${v.part}`);
    assert.match(v.ccc, /^\d{1,4}(–\d{1,4})?(, \d{1,4}(–\d{1,4})?)*$/, v.ref);
    assert.ok(v.ccc.match(/\d+/g).every((n) => Number(n) >= 1 && Number(n) <= 2865), v.ref);
    assert.doesNotMatch(v.text, /Yahweh/, v.ref);
    assert.match(v.text, /^[“‘]?[A-Z]/, v.ref);
  }
});
