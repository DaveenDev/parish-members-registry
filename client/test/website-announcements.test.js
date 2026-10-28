import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { ANNOUNCEMENT_DAYS, announcementLastDay, announcementState } from '../src/lib/website.js';

describe('announcements drop off the website', () => {
  const base = { published: true, publish_on: '2026-09-01', expires_on: null, pinned: false };

  test('on their end date when they have one', () => {
    assert.equal(announcementLastDay({ ...base, expires_on: '2026-09-10' }), '2026-09-10');
    assert.equal(announcementState({ ...base, expires_on: '2026-09-10' }, '2026-09-10'), 'Live');
    assert.equal(announcementState({ ...base, expires_on: '2026-09-10' }, '2026-09-11'), 'Expired');
  });

  test(`${ANNOUNCEMENT_DAYS} days after they start when they have none`, () => {
    assert.equal(ANNOUNCEMENT_DAYS, 30);
    assert.equal(announcementLastDay(base), '2026-10-01');
    assert.equal(announcementState(base, '2026-10-01'), 'Live');
    assert.equal(announcementState(base, '2026-10-02'), 'Expired');
  });

  test('pinned ones without an end date stay until unpinned', () => {
    assert.equal(announcementLastDay({ ...base, pinned: true }), null);
    assert.equal(announcementState({ ...base, pinned: true }, '2027-06-01'), 'Live');
    // An end date still applies to a pinned one.
    assert.equal(announcementState({ ...base, pinned: true, expires_on: '2026-09-05' }, '2026-09-06'), 'Expired');
  });

  test('drafts and scheduled ones keep their state', () => {
    assert.equal(announcementState({ ...base, published: false }, '2026-12-01'), 'Draft');
    assert.equal(announcementState({ ...base, publish_on: '2026-11-01' }, '2026-10-03'), 'Scheduled');
  });
});
