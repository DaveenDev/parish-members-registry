// What each staff access level may do in the admin panel (profiles.access,
// from 0014_roles_activity_trash.sql). The database enforces the same rules;
// this only decides which pages, buttons and links to show.

export const ACCESS_LEVELS = [
  { key: 'full', label: 'Full access', note: 'Everything in the admin panel.' },
  { key: 'read_only', label: 'Read only', note: 'Sees the registry, census, requests, website and activity log, and changes nothing. No exports, census codes, GKK documents or trash.' },
  { key: 'gkk_leader', label: 'GKK leader', note: 'Sees and updates the households and members of one GKK (not their blood types), records their census and reviews their online updates, and gets or renews their census codes. Dashboard, reports and duplicates cover that GKK only.' },
  { key: 'website', label: 'Website & requests', note: 'Runs the Parish Website (including the office and contact details) and the Requests queues; views the registry and blood types but not the census.' },
];

// 'none': signed in without a staff profile (0062); never offered when setting up an account.
export const accessLabel = (key) => (key === 'none' ? 'No access' : ACCESS_LEVELS.find((a) => a.key === key)?.label || 'Full access');

const RULES = {
  // see
  registry: ['full', 'read_only', 'gkk_leader', 'website'],
  requests: ['full', 'read_only', 'website'],
  website: ['full', 'read_only', 'website'],
  census: ['full', 'read_only', 'gkk_leader'], // GKK leaders: their GKK only (0024)
  reports: ['full', 'read_only', 'gkk_leader'],
  // Whole-registry downloads (the Exports page, Households and Members CSV): full access only.
  exports: ['full'],
  // Members' blood types: the Blood Types page, the field, filter and report (not GKK leaders, 0050).
  bloodTypes: ['full', 'read_only', 'website'],
  activity: ['full', 'read_only'],
  // change
  editRegistry: ['full', 'gkk_leader'],
  editRequests: ['full', 'website'],
  editWebsite: ['full', 'website'],
  // Record answers and review online updates (GKK leaders: their GKK, 0024).
  editCensus: ['full', 'gkk_leader'],
  // Start, close or reopen a census and set its schedule: the whole parish.
  manageCensus: ['full'],
  // Open one GKK's census results as its GKK leader sees them (Census → Results by GKK).
  censusGkkView: ['full'],
  // Get or renew a household's census access code (0023: GKK leaders, for their GKK).
  censusCodes: ['full', 'gkk_leader'],
  verify: ['full'],
  deleteRecords: ['full'],
  manageLists: ['full'],
  settings: ['full'],
  trash: ['full'],
};

/** A GKK leader's GKK, whose records are all they see; null for everyone else. */
export const leaderGkk = (user) => (user?.access === 'gkk_leader' && user.accessGkk) || null;

/** True when `user` (from useAuth) may do `what` (a RULES key). Unknown users get full access, as before 0014. */
export function can(user, what) {
  const level = user?.access || 'full';
  return (RULES[what] || []).includes(level);
}
