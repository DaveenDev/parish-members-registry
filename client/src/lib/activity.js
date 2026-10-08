// Plain-language lines for activity_log entries (0014 migration). Pure, so
// it can be unit tested.
import { SACRAMENTS } from '../constants.js';

const FIELD_LABELS = {
  household_name: 'Household name', street: 'Street', barangay: 'Barangay', city: 'City', province: 'Province', zip: 'ZIP',
  contact: 'Contact', email: 'Email', gkk: 'GKK', family_grouping: 'Family grouping', status: 'Status',
  volunteer: 'Volunteer', notify_optin: 'Notifications', consent: 'Consent', participation: 'Participation', help_ways: 'Ways to help',
  first_name: 'First name', middle_name: 'Middle name', last_name: 'Last name', suffix: 'Suffix', relationship: 'Relationship',
  sex: 'Sex', dob: 'Date of birth', place_of_birth: 'Place of birth', civil_status: 'Civil status', occupation: 'Occupation',
  religion: 'Religion', blood_type: 'Blood type', tribe: 'Tribe', gkk_role: 'GKK role', parish_role: 'Parish role',
  ministries: 'Ministries', organizations: 'Organizations', membership_status: 'Membership status', household_id: 'Household', family_no: 'Family',
  has_baptism: 'Baptized', baptism_date: 'Baptism date', baptism_church: 'Baptism church',
  has_communion: 'First Communion', communion_date: 'First Communion date', communion_church: 'First Communion church',
  has_confirmation: 'Confirmed', conf_date: 'Confirmation date', conf_church: 'Confirmation church', conf_name: 'Confirmation name', conf_sponsor: 'Confirmation sponsor',
  has_matrimony: 'Married in Church', mat_date: 'Wedding date', mat_church: 'Wedding church', mat_type: 'Wedding type',
};
// Bookkeeping the trigger records alongside a real change; not worth a line.
const HIDDEN = new Set(['verified_at', 'verified_by', 'verified_by_name', 'ref_no', 'created_at']);

export function formatValue(v) {
  if (v === null || v === undefined || v === '') return '—';
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') {
    const parts = Object.entries(v).map(([k, x]) => `${k}: ${formatValue(x)}`);
    return parts.length ? parts.join(', ') : '—';
  }
  return String(v);
}

const sacramentLabel = (key) => SACRAMENTS.find((s) => s.key === key)?.label || key;
const what = (e) => (e.table_name === 'households' ? 'household' : 'member');

// Records logged since 0075, beyond households and members: what each is called in a line.
const RECORD_NOUNS = {
  certificate_requests: 'certificate request', sacrament_requests: 'sacrament request', blood_requests: 'blood request', blood_donors: 'blood donor',
  census_cycles: 'census',
  announcements: 'announcement', articles: 'article', bulletins: 'bulletin', events: 'event', mass_schedules: 'Mass time',
  sacrament_guides: 'sacrament guide', history_articles: 'history page',
  parish_settings: 'parish settings', gkks: 'GKK', ministries: 'ministry', organizations: 'organization', parish_positions: 'parish position',
  profiles: 'staff account',
};
// What the Activity log page's "What changed" filter offers: [key, label, tables].
export const ACTIVITY_AREAS = [
  ['households', 'Households', ['households']],
  ['members', 'Members', ['members']],
  ['sacrament_verifications', 'Sacrament verifications', ['sacrament_verifications']],
  ['requests', 'Requests', ['certificate_requests', 'sacrament_requests', 'blood_requests', 'blood_donors']],
  ['census', 'Census', ['census_cycles']],
  ['website', 'Parish website', ['announcements', 'articles', 'bulletins', 'events', 'mass_schedules', 'sacrament_guides', 'history_articles']],
  ['settings', 'Settings and lists', ['parish_settings', 'gkks', 'ministries', 'organizations', 'parish_positions']],
  ['staff', 'Staff accounts', ['profiles']],
  ['org_charts', 'Org charts', ['org_charts']],
];
// Requests and donors added from the public website: nobody signed in.
const ONLINE_TABLES = new Set(['certificate_requests', 'sacrament_requests', 'blood_requests', 'blood_donors']);
const RECORD_FIELD_LABELS = {
  ref_no: 'Reference No.', status: 'Status', staff_notes: 'Staff notes', member_id: 'Linked member', fee: 'Fee', or_number: 'OR No.', released_to: 'Released to',
    released_at: 'Released', public_note: 'Note to requester', scheduled_on: 'Scheduled on', urgent: 'Urgent', title: 'Title', body: 'Text', published: 'Published',
    label: 'Name', starts_on: 'Starts on', ends_on: 'Target end', closed_at: 'Closed', name: 'Name', role: 'Role', is_admin: 'Staff admin', access: 'Access',
    access_gkk: 'GKK', disabled: 'Disabled', email: 'Email', theme: 'Parish theme', maintenance_mode: 'Maintenance mode', maintenance_message: 'Maintenance note',
    logo: 'Logo', hero_image: 'Home page photo', site_url: 'Website address', census_interval_months: 'Census schedule',
};

/** A requests, census, website, settings or staff entry (0075). */
function describeRecord(e, c) {
  const noun = RECORD_NOUNS[e.table_name];
  if (e.table_name === 'profiles') {
    if (e.action === 'insert') {
      return { title: 'Added the staff account', lines: [c.email && `Email: ${c.email}`, c.access && `Access: ${c.access}${c.access_gkk ? ` (${c.access_gkk})` : ''}`].filter(Boolean) };
    }
    if (c.password_reset) return { title: 'Reset the password', lines: [] };
    if (c.disabled) return { title: c.disabled[1] ? 'Disabled the staff account' : 'Enabled the staff account', lines: [] };
  }
  if (e.action === 'insert') return { title: `Added the ${noun}`, lines: [] };
  if (e.action === 'delete') return { title: `Deleted the ${noun}`, lines: [] };
  const lines = Object.entries(c).map(([k, v]) => {
    const [from, to] = Array.isArray(v) && v.length === 2 ? v : [undefined, v];
    return `${RECORD_FIELD_LABELS[k] || FIELD_LABELS[k] || k}: ${formatValue(from)} → ${formatValue(to)}`;
  });
  if (c.status) return { title: `Set the ${noun} to ${formatValue(c.status[1])}`, lines: lines.filter((l) => !l.startsWith('Status:')) };
  return { title: e.table_name === 'parish_settings' ? 'Changed the parish settings' : `Updated the ${noun}`, lines };
}

/** An Organization Structure chart (0057): created, saved, renamed, published, an officer set. */
function describeOrgChart(e, c) {
  if (e.action === 'insert') return { title: 'Added the org chart', lines: [] };
  if (e.action === 'delete') return { title: 'Deleted the org chart', lines: c.positions ? [`With ${c.positions} position(s)`] : [] };
  if (c.gkk) {
    const [from, to] = c.holder || [];
    return { title: `Set an officer of ${c.gkk}`, lines: [`${c.position}: ${from || 'from the registry'} → ${to || 'from the registry'}`] };
  }
  if (c.published) return { title: c.published[1] ? 'Published the org chart' : 'Took the org chart off the website', lines: [] };
  if (c.title) return { title: 'Renamed the org chart', lines: [`Title: ${formatValue(c.title[0])} → ${formatValue(c.title[1])}`] };
  const [from, to] = c.positions || [];
  return { title: 'Saved the org chart', lines: c.positions ? [`Positions: ${from} → ${to}`] : [] };
}

/** { title, lines } for one entry. `lines` lists each changed field as "Label: old → new". */
export function describeActivity(e) {
  const c = e.changes || {};
  if (e.table_name === 'org_charts') return describeOrgChart(e, c);
  if (RECORD_NOUNS[e.table_name]) return describeRecord(e, c);
  if (e.action === 'merge') {
    return { title: 'Merged in a duplicate record', lines: [c.merged && `${c.merged}${c.household ? ` (${c.household})` : ''}, now in the Trash`].filter(Boolean) };
  }
  if (e.table_name === 'sacrament_verifications') {
    const sac = sacramentLabel(c.sacrament);
    if (e.action === 'delete') return { title: `Removed the ${sac} verification`, lines: [] };
    return {
      title: `${e.action === 'update' ? 'Changed the' : 'Verified'} ${sac}${e.action === 'update' ? ' verification' : ''}`,
      lines: [c.source && `Source: ${c.source}${c.reference ? ` (${c.reference})` : ''}`].filter(Boolean),
    };
  }
  if (e.action === 'insert') return { title: `Added the ${what(e)}`, lines: [] };
  if (e.action === 'delete') return { title: `Deleted the ${what(e)}`, lines: [] };
  if (e.action === 'trash') {
    return { title: `Moved the ${what(e)} to the trash`, lines: c.members ? [`With ${c.members} member(s)`] : [] };
  }
  if (e.action === 'restore') return { title: `Restored the ${what(e)} from the trash`, lines: [] };

  const lines = Object.entries(c)
    .filter(([k]) => !HIDDEN.has(k))
    .map(([k, [from, to]]) => `${FIELD_LABELS[k] || k}: ${formatValue(from)} → ${formatValue(to)}`);
  if (c.status && c.status[1] === 'Verified') return { title: 'Verified the household', lines: lines.filter((l) => !l.startsWith('Status:')) };
  return { title: `Updated the ${what(e)}`, lines };
}

/** Who made the change: a staff name, or the family themselves online. */
export function activityActor(e) {
  if (e.actor_name) return e.actor_name;
  return ONLINE_TABLES.has(e.table_name) ? 'Sent from the website' : 'The family (online)';
}
