import test from 'node:test';
import assert from 'node:assert/strict';

import { BACKUP_OVERDUE_DAYS, backupAgeDays, backupAgeText, backupSummary, fmtFileSize } from '../src/lib/backup.js';
import { todayItems } from '../src/lib/today.js';

const at = (iso) => new Date(iso).getTime();
const NOW = at('2026-11-10T09:00:00Z');

test('the age of a backup in days, and in words', () => {
  assert.equal(backupAgeDays('2026-11-10T01:00:00Z', NOW), 0);
  assert.equal(backupAgeDays('2026-11-09T01:00:00Z', NOW), 1);
  assert.equal(backupAgeDays('2026-11-01T02:41:00Z', NOW), 9);
  assert.equal(backupAgeDays('2026-11-11T09:00:00Z', NOW), 0, 'a clock a little ahead is not negative');
  assert.equal(backupAgeText('2026-11-10T01:00:00Z', NOW), 'Today');
  assert.equal(backupAgeText('2026-11-09T01:00:00Z', NOW), 'Yesterday');
  assert.equal(backupAgeText('2026-11-05T01:00:00Z', NOW), '5 days ago');
});

test('file sizes in plain units', () => {
  assert.equal(fmtFileSize(900), '900 B');
  assert.equal(fmtFileSize(870 * 1024), '870 KB');
  assert.equal(fmtFileSize(1.2 * 1024 * 1024), '1.2 MB');
  assert.equal(fmtFileSize(35 * 1024 * 1024), '35 MB');
  assert.equal(fmtFileSize(null), '');
  assert.equal(fmtFileSize(-1), '');
});

test('a weekly backup is late only after the slack of a couple of days', () => {
  assert.equal(BACKUP_OVERDUE_DAYS, 9);
  const status = (taken_at) => ({ latest: { taken_at, file_name: 'parish-backup.tar.gz.gpg', size_bytes: 1000 }, count: 3 });
  assert.equal(backupSummary(status('2026-11-08T02:41:00Z'), NOW).state, 'ok');
  assert.equal(backupSummary(status('2026-11-01T02:41:00Z'), NOW).state, 'ok', '9 days is the Sunday before last: still on time');
  const late = backupSummary(status('2026-10-31T02:41:00Z'), NOW);
  assert.equal(late.state, 'overdue');
  assert.equal(late.days, 10);
  assert.equal(late.latest.file_name, 'parish-backup.tar.gz.gpg');
  assert.deepEqual(backupSummary({ latest: null, count: 0 }, NOW), { state: 'none', latest: null, days: null });
  assert.equal(backupSummary(null, NOW).state, 'none');
  assert.equal(backupSummary(undefined, NOW).state, 'none');
});

test('the Dashboard reminds a staff admin when the backup is late, and nobody else', () => {
  const counts = { requests: {} };
  const late = backupSummary({ latest: { taken_at: '2026-10-25T02:41:00Z' } }, NOW);
  const fresh = backupSummary({ latest: { taken_at: '2026-11-08T02:41:00Z' } }, NOW);
  const none = backupSummary({ latest: null }, NOW);

  const items = todayItems({ user: { access: 'full', isAdmin: true }, counts, backup: late });
  const item = items.find((i) => i.key === 'backup');
  assert.ok(item, 'a late backup shows up');
  assert.equal(item.label, 'The weekly database backup is late');
  assert.match(item.detail, /16 days ago/);
  assert.equal(item.to, '/admin/settings?tab=integrations');
  assert.equal(item.tone, 'red');

  assert.ok(!todayItems({ user: { access: 'full', isAdmin: true }, counts, backup: fresh }).some((i) => i.key === 'backup'));
  assert.ok(!todayItems({ user: { access: 'full', isAdmin: true }, counts, backup: none }).some((i) => i.key === 'backup'), 'nothing recorded is not a warning');
  assert.ok(!todayItems({ user: { access: 'full', isAdmin: false }, counts, backup: late }).some((i) => i.key === 'backup'), 'only staff admins');
  assert.ok(!todayItems({ user: { access: 'full', isAdmin: true }, counts }).some((i) => i.key === 'backup'), 'not loaded yet');
});
