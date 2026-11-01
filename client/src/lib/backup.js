// The weekly database backup (.github/workflows/backup.yml) records each run
// in backup_runs (0104); staff admins see the latest one under Parish Config →
// Platform Integrations → Database, and a reminder on the Dashboard when it's late.

/** A backup is made every Sunday, so one more than this many days old means a run was missed. */
export const BACKUP_OVERDUE_DAYS = 9;

/** Whole days since the backup was made; 0 for today. */
export function backupAgeDays(takenAt, now = Date.now()) {
  return Math.max(0, Math.floor((now - new Date(takenAt).getTime()) / 86400000));
}

/** "today", "yesterday", "5 days ago". */
export function daysAgoText(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** The same with a capital, to stand alone: "Today", "Yesterday", "5 days ago". */
export function backupAgeText(takenAt, now = Date.now()) {
  const text = daysAgoText(backupAgeDays(takenAt, now));
  return text[0].toUpperCase() + text.slice(1);
}

/** A file size in plain units: "850 KB", "1.2 MB". */
export function fmtFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

/**
 * How the backups stand, from api.backupStatus():
 *   none     no backup is recorded: not set up yet, or 0104 hasn't been run
 *   ok       the latest is recent
 *   overdue  the latest is older than BACKUP_OVERDUE_DAYS
 * with the latest run and its age in days.
 */
export function backupSummary(status, now = Date.now()) {
  const latest = status?.latest;
  if (!latest?.taken_at) return { state: 'none', latest: null, days: null };
  const days = backupAgeDays(latest.taken_at, now);
  return { state: days > BACKUP_OVERDUE_DAYS ? 'overdue' : 'ok', latest, days };
}
