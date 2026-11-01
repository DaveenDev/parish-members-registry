import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manilaNow, manilaToday } from '../src/lib/manila.js';
import { officeOpenNow } from '../src/lib/site.js';

test('manilaToday: the Philippine date, wherever the visitor is', () => {
  // 01:00 on 31 Oct in Manila is still 30 Oct in Riyadh and New York.
  assert.equal(manilaToday(new Date('2026-10-30T17:00:00Z')), '2026-10-31');
  assert.equal(manilaToday(new Date('2026-10-30T15:59:00Z')), '2026-10-30');
});

test('manilaNow: getters read Manila\'s wall clock', () => {
  const d = manilaNow(new Date('2026-10-30T23:30:00Z')); // Sat 31 Oct, 07:30 in Manila
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 9);
  assert.equal(d.getDate(), 31);
  assert.equal(d.getDay(), 6);
  assert.equal(d.getHours(), 7);
  assert.equal(d.getMinutes(), 30);
});

test('manilaNow: midnight reads as hour 0', () => {
  assert.equal(manilaNow(new Date('2026-10-30T16:00:00Z')).getHours(), 0);
});

test('office hours go by Manila time for a visitor abroad', () => {
  const hours = Array.from({ length: 7 }, () => ({ open: '08:00', close: '17:00' }));
  // 09:00 in Manila is 01:00 UTC: open, whatever the visitor's own clock says.
  assert.equal(officeOpenNow(hours, manilaNow(new Date('2026-10-30T01:00:00Z'))), true);
  // 20:00 in Manila: closed.
  assert.equal(officeOpenNow(hours, manilaNow(new Date('2026-10-30T12:00:00Z'))), false);
});
