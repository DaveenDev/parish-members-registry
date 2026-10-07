// Settings → Staff: finding, sorting and checking the coverage of the staff
// accounts (rows from the manage-staff function's `list`: id, email, name,
// role, is_admin, access, access_gkk_id, access_gkk, disabled, last_sign_in_at).
// With a census coordinator (GKK leader) for each of the parish's GKKs the
// list gets long, so the page works from these.

/** The default role given to a GKK leader's account. */
export const LEADER_ROLE = 'Census Coordinator';

/** Access levels in the order the list groups them. */
const ACCESS_ORDER = ['full', 'website', 'read_only', 'gkk_leader', 'none'];
const ACCESS_NAMES = { full: 'Full access', website: 'Website & requests', read_only: 'Read only', gkk_leader: 'GKK leader', none: 'No access' };

/** The filter chips: [key, label, test(row)]. 'all' matches everyone. */
export const STAFF_FILTERS = [
  ['all', 'All accounts', () => true],
  ['gkk_leader', 'GKK leaders', (s) => s.access === 'gkk_leader'],
  ['full', 'Full access', (s) => s.access === 'full'],
  ['website', 'Website & requests', (s) => s.access === 'website'],
  ['read_only', 'Read only', (s) => s.access === 'read_only'],
  ['none', 'No access', (s) => s.access === 'none'],
  ['never', 'Never signed in', (s) => !s.last_sign_in_at],
  ['disabled', 'Disabled', (s) => !!s.disabled],
];
export const STAFF_FILTER_KEYS = STAFF_FILTERS.map(([key]) => key);

/** How many accounts each filter matches, by key. */
export function filterCounts(rows) {
  return Object.fromEntries(STAFF_FILTERS.map(([key, , test]) => [key, rows.filter(test).length]));
}

export function filterStaff(rows, key) {
  const test = STAFF_FILTERS.find(([k]) => k === key)?.[2];
  return test ? rows.filter(test) : rows;
}

/** The text a search matches: name, email, role, access level and the GKK. */
export function staffText(s) {
  return [s.name, s.email, s.role, ACCESS_NAMES[s.access] || s.access, s.access_gkk, s.is_admin ? 'admin' : ''].filter(Boolean).join(' ');
}

const byText = (a, b) => String(a || '').localeCompare(String(b || ''), undefined, { sensitivity: 'base', numeric: true });
const nameOf = (s) => s.name || s.email;

export const STAFF_SORTS = ['name', 'access', 'last', 'status'];

/**
 * `rows` sorted by `key` ('name', 'access': grouped by level, a leader's GKK
 * within it, 'last': last sign-in, never signed in first when ascending,
 * 'status': active before disabled), ties broken by name.
 */
export function sortStaff(rows, key = 'name', dir = 'asc') {
  const compare = {
    name: (a, b) => byText(nameOf(a), nameOf(b)),
    access: (a, b) => (ACCESS_ORDER.indexOf(a.access) - ACCESS_ORDER.indexOf(b.access)) || byText(a.access_gkk, b.access_gkk),
    last: (a, b) => (a.last_sign_in_at ? Date.parse(a.last_sign_in_at) : 0) - (b.last_sign_in_at ? Date.parse(b.last_sign_in_at) : 0),
    status: (a, b) => Number(!!a.disabled) - Number(!!b.disabled),
  }[key] || (() => 0);
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => sign * compare(a, b) || byText(nameOf(a), nameOf(b)));
}

/**
 * Which GKKs have a census coordinator. `gkks` is [{ id, name }]. Only an
 * account that can sign in counts (a disabled leader leaves their GKK
 * uncovered). Returns { covered, uncovered: [gkk…], leaders: Map(gkk id → accounts) }.
 */
export function gkkCoverage(rows, gkks) {
  const leaders = new Map();
  for (const s of rows) {
    if (s.access !== 'gkk_leader' || !s.access_gkk_id || s.disabled) continue;
    leaders.set(s.access_gkk_id, [...(leaders.get(s.access_gkk_id) || []), s]);
  }
  const uncovered = gkks.filter((g) => !leaders.has(g.id));
  return { covered: gkks.length - uncovered.length, uncovered, leaders };
}

/** Columns of the staff CSV (no passwords: they're never kept). */
export const STAFF_CSV_COLUMNS = [
  { label: 'Name', value: 'name' },
  { label: 'Email', value: 'email' },
  { label: 'Role', value: 'role' },
  { label: 'Access', value: (s) => ACCESS_NAMES[s.access] || s.access },
  { label: 'GKK', value: (s) => s.access_gkk || '' },
  { label: 'Admin', value: (s) => (s.is_admin ? 'Yes' : '') },
  { label: 'Status', value: (s) => (s.disabled ? 'Disabled' : 'Active') },
  { label: 'Last sign-in', value: (s) => s.last_sign_in_at || 'Never' },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The bulk "add GKK leaders" sheet: one { gkk, name, email } per GKK. Rows
 * left blank are skipped; a row with only one of the two is an error. Returns
 * { entries: [{ gkk, name, email }], errors: Map(gkk id → message) }.
 */
export function bulkLeaderEntries(sheet) {
  const entries = [];
  const errors = new Map();
  const seen = new Set();
  for (const row of sheet) {
    const name = String(row.name || '').trim();
    const email = String(row.email || '').trim().toLowerCase();
    if (!name && !email) continue;
    if (!name) errors.set(row.gkk.id, 'Enter the name');
    else if (!EMAIL_RE.test(email)) errors.set(row.gkk.id, email ? 'Enter a valid email address' : 'Enter the email address');
    else if (seen.has(email)) errors.set(row.gkk.id, 'This email is on another row');
    else { seen.add(email); entries.push({ gkk: row.gkk, name, email }); }
  }
  return { entries, errors };
}
