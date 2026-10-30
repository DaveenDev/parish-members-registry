import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TRASH_KINDS, TRASH_FILTERS, trashExpiry, trashDaysLeft, trashDaysLeftText, trashGroup, trashKindLabel,
  trashOpenPath, trashFiles, trashKindHasFiles, trashPurgeMessage, trashRestoredText,
} from '../src/lib/trash.js';

const day = 86400000;

test('an entry is kept for 3 months, the way the database counts them', () => {
  assert.equal(trashExpiry('2026-10-30T04:00:00Z').toISOString(), '2027-01-30T04:00:00.000Z');
  // A short month clamps, as `+ interval '3 months'` does: 30 November + 3 months is 28 February.
  assert.equal(trashExpiry('2026-11-30T10:00:00Z').toISOString(), '2027-02-28T10:00:00.000Z');
  assert.equal(trashExpiry('2027-11-30T10:00:00Z').toISOString(), '2028-02-29T10:00:00.000Z');
  assert.equal(trashExpiry('2026-12-31T00:00:00Z').toISOString(), '2027-03-31T00:00:00.000Z');
});

test('days left counts down to the day it is removed, and never below 0', () => {
  const deleted = '2026-10-30T00:00:00Z';
  const at = (iso) => new Date(iso).getTime();
  assert.equal(trashDaysLeft(deleted, at('2026-10-30T00:00:00Z')), 92);
  assert.equal(trashDaysLeft(deleted, at('2026-12-30T00:00:00Z')), 31);
  assert.equal(trashDaysLeft(deleted, at('2027-01-29T12:00:00Z')), 1);
  assert.equal(trashDaysLeft(deleted, at('2027-01-30T00:00:00Z')), 0);
  assert.equal(trashDaysLeft(deleted, at('2027-03-01T00:00:00Z')), 0);
  assert.equal(trashDaysLeftText(deleted, at('2027-01-29T12:00:00Z')), '1 day left');
  assert.equal(trashDaysLeftText(deleted, at('2026-12-30T00:00:00Z')), '31 days left');
  assert.equal(trashDaysLeftText(deleted, at('2027-02-01T00:00:00Z')), 'Removed for good today');
  assert.ok(trashDaysLeft(new Date(Date.now() - 2 * day).toISOString()) > 85);
});

test('every kind has a name, a filter group the page offers, and a badge colour', () => {
  const filters = TRASH_FILTERS.map(([value]) => value);
  for (const [kind, k] of Object.entries(TRASH_KINDS)) {
    assert.ok(k.label, kind);
    assert.ok(filters.includes(k.group), `${kind} is in a group the filter offers`);
    assert.ok(['gold', 'blue', 'green', 'red', 'gray'].includes(k.tone), kind);
  }
  assert.equal(trashKindLabel('blood_donor'), 'Blood donor');
  assert.equal(trashKindLabel('something_new'), 'something_new');
  assert.equal(trashGroup('certificate_request'), 'request');
  assert.equal(trashGroup('article'), 'website');
});

test('the kinds match the database check on deleted_records (0103)', () => {
  assert.deepEqual(Object.keys(TRASH_KINDS).sort(), [
    'announcement', 'article', 'blood_donor', 'blood_request', 'bulletin', 'certificate_request', 'event', 'history_article',
    'household', 'member', 'prayer_request', 'sacrament_request', 'song',
  ]);
});

test('a restored entry opens where it lives', () => {
  assert.equal(trashOpenPath({ kind: 'household', label: 'Cruz Family' }), '/admin/households?status=All&q=Cruz%20Family');
  assert.equal(trashOpenPath({ kind: 'member', label: 'Juan Cruz' }), '/admin/members?q=Juan%20Cruz');
  assert.equal(trashOpenPath({ kind: 'certificate_request', label: 'CR-2026-ABC · Juan Cruz' }), '/admin/requests?view=all&q=CR-2026-ABC');
  assert.equal(trashOpenPath({ kind: 'sacrament_request', label: 'SR-1 · Ana' }), '/admin/requests?tab=sacraments&view=All&q=SR-1');
  assert.equal(trashOpenPath({ kind: 'prayer_request', label: 'PR-9 · Lola' }), '/admin/requests?tab=prayers&view=all&q=PR-9');
  assert.equal(trashOpenPath({ kind: 'blood_request', label: 'BR-1 · Ana' }), '/admin/requests?tab=blood&view=all');
  assert.equal(trashOpenPath({ kind: 'blood_donor', label: 'Dina' }), '/admin/requests?tab=blood&view=all');
  assert.equal(trashOpenPath({ kind: 'article', label: 'Retreat' }), '/admin/website?tab=articles');
  assert.equal(trashOpenPath({ kind: 'song', label: 'Ave' }), '/admin/website?tab=downloads&kind=songs');
  assert.equal(trashOpenPath({ kind: 'history_article', label: 'Founding' }), '/admin/website?tab=history');
});

test('photos are found in an event, an article and a history chapter, once each', () => {
  assert.deepEqual(trashFiles('event', { photo_url: 'https://i/e.jpg' }), ['https://i/e.jpg']);
  assert.deepEqual(trashFiles('article', { photo_url: 'https://i/a.jpg', photos: [{ url: 'https://i/a.jpg' }, { url: 'https://i/b.jpg' }, null] }), ['https://i/a.jpg', 'https://i/b.jpg']);
  assert.deepEqual(
    trashFiles('history_article', { photo_url: 'https://i/h.jpg', body_photo_url: 'https://i/hb.jpg', video_url: 'https://i/v.mp4', photos: [{ url: 'https://i/g.jpg' }] }),
    ['https://i/h.jpg', 'https://i/hb.jpg', 'https://i/v.mp4', 'https://i/g.jpg'],
  );
  assert.deepEqual(trashFiles('event', { photo_url: null }), []);
  assert.deepEqual(trashFiles('announcement', { photo_url: 'https://i/x.jpg' }), []);
  assert.deepEqual(trashFiles('event', null), []);
  assert.ok(trashKindHasFiles('event') && trashKindHasFiles('article') && trashKindHasFiles('history_article'));
  assert.ok(!trashKindHasFiles('announcement') && !trashKindHasFiles('household'));
});

test('the messages say what happens', () => {
  assert.match(trashPurgeMessage({ kind: 'household' }), /household and its members/);
  assert.match(trashPurgeMessage({ kind: 'member' }), /member is removed/);
  assert.match(trashPurgeMessage({ kind: 'event' }), /with its photos/);
  assert.doesNotMatch(trashPurgeMessage({ kind: 'blood_request' }), /photos/);
  assert.equal(trashRestoredText({ kind: 'household', label: 'Cruz' }), 'Cruz is back in the registry');
  assert.equal(trashRestoredText({ kind: 'blood_donor', label: 'Dina' }), 'Dina is back in Requests');
  assert.equal(trashRestoredText({ kind: 'bulletin', label: 'Week 1' }), 'Week 1 is back under Parish Website');
});
