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
  ministries: 'Ministries', organizations: 'Organizations', membership_status: 'Membership status', household_id: 'Household',
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

/** { title, lines } for one entry. `lines` lists each changed field as "Label: old → new". */
export function describeActivity(e) {
  const c = e.changes || {};
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
  return e.actor_name || 'The family (online)';
}
