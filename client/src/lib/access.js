// What each staff access level may do in the admin panel (profiles.access,
// from 0014_roles_activity_trash.sql). The database enforces the same rules;
// this only decides which pages, buttons and links to show.

export const ACCESS_LEVELS = [
  { key: 'full', label: 'Full access', note: 'Everything in the admin panel.' },
  { key: 'read_only', label: 'Read only', note: 'Sees every record, changes nothing.' },
  { key: 'gkk_leader', label: 'GKK leader', note: 'Sees and updates the households and members of one GKK, records their census and reviews their online updates, and gets or renews their census codes.' },
  { key: 'website', label: 'Website & requests', note: 'Runs the Parish Website and the Requests queues; can look up members.' },
];

export const accessLabel = (key) => ACCESS_LEVELS.find((a) => a.key === key)?.label || 'Full access';

const RULES = {
  // see
  registry: ['full', 'read_only', 'gkk_leader', 'website'],
  requests: ['full', 'read_only', 'website'],
  website: ['full', 'read_only', 'website'],
  census: ['full', 'read_only', 'gkk_leader'], // GKK leaders: their GKK only (0024)
  reports: ['full', 'read_only', 'gkk_leader'],
  exports: ['full', 'read_only'],
  activity: ['full', 'read_only'],
  // change
  editRegistry: ['full', 'gkk_leader'],
  editRequests: ['full', 'website'],
  editWebsite: ['full', 'website'],
  // Record answers and review online updates (GKK leaders: their GKK, 0024).
  editCensus: ['full', 'gkk_leader'],
  // Start, close or reopen a census and set its schedule: the whole parish.
  manageCensus: ['full'],
  // Get or renew a household's census access code (0023: GKK leaders, for their GKK).
  censusCodes: ['full', 'gkk_leader'],
  verify: ['full'],
  deleteRecords: ['full'],
  manageLists: ['full'],
  settings: ['full'],
  trash: ['full'],
};

/** True when `user` (from useAuth) may do `what` (a RULES key). Unknown users get full access, as before 0014. */
export function can(user, what) {
  const level = user?.access || 'full';
  return (RULES[what] || []).includes(level);
}
