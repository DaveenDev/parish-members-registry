// Option lists and helpers for the Requests admin page. Values match the
// check constraints in supabase/migrations/0012_requests.sql.
import { SACRAMENTS } from '../constants.js';
import { todayIso, addDays } from './website.js';

export const CERT_TYPES = [
  { key: 'baptism', label: 'Baptismal certificate', short: 'Baptismal' },
  { key: 'confirmation', label: 'Confirmation certificate', short: 'Confirmation' },
  { key: 'matrimony', label: 'Marriage certificate', short: 'Marriage' },
];
export const certTypeLabel = (key) => CERT_TYPES.find((t) => t.key === key)?.label || key;
export const certTypeShort = (key) => CERT_TYPES.find((t) => t.key === key)?.short || key;

/** The registry sacrament a certificate type is checked against. */
export const certSacrament = (key) => SACRAMENTS.find((s) => s.key === key);

/**
 * Where a certificate request's sacrament stands in the registry, for its
 * row in the list: null (not linked to a member yet), 'none' (the member has
 * no such sacrament on record), 'unverified' (claimed, not checked against
 * the parish register yet) or 'verified'. `r.member.verifications` is the
 * member's sacrament_verifications rows (api.listCertificateRequests).
 */
export function certClaimState(r) {
  const s = certSacrament(r?.cert_type);
  const m = r?.member;
  if (!m || !s) return null;
  if (!m[s.has]) return 'none';
  return (m.verifications || []).some((v) => v.sacrament === s.key) ? 'verified' : 'unverified';
}

export const CLAIM_BADGES = {
  verified: { tone: 'green', label: 'Verified claim' },
  unverified: { tone: 'gold', label: 'Not yet verified claim' },
  none: { tone: 'gray', label: 'No claim on record' },
};

export const CERT_STATUSES = ['Received', 'Being prepared', 'Ready for pick-up', 'Released', 'Cannot issue'];
export const CERT_OPEN = ['Received', 'Being prepared', 'Ready for pick-up'];
export const CERT_FLOW = ['Received', 'Being prepared', 'Ready for pick-up', 'Released'];

export const BLOOD_REQUEST_STATUSES = ['Open', 'Contacting donors', 'Fulfilled', 'Closed'];
export const BLOOD_OPEN = ['Open', 'Contacting donors'];
export const CONTACT_STATUSES = ['Contacted', 'No answer', 'Agreed', 'Declined', 'Donated'];

// Requests to avail of a sacrament (0032 migration), from the website's Ang Simbahan page.
export const SACRAMENT_REQUEST_TYPES = [
  { key: 'ocia', label: 'OCIA', sub: 'Joining the OCIA', tone: 'blue' },
  { key: 'anointing', label: 'Anointing of the Sick', sub: 'Pagdihog sa Masakiton', tone: 'red' },
];
export const sacramentRequestLabel = (key) => SACRAMENT_REQUEST_TYPES.find((t) => t.key === key)?.label || key;
export const SACRAMENT_REQUEST_STATUSES = ['New', 'Contacted', 'Scheduled', 'Done', 'Cancelled'];
export const SACRAMENT_REQUEST_OPEN = ['New', 'Contacted', 'Scheduled'];

export const SOURCES = ['Walk-in', 'Phone'];

export const STATUS_TONES = {
  Received: 'gold',
  'Being prepared': 'blue',
  'Ready for pick-up': 'green',
  Released: 'gray',
  'Cannot issue': 'red',
  New: 'gold',
  Open: 'red',
  'Contacting donors': 'gold',
  Fulfilled: 'green',
  Closed: 'gray',
  Contacted: 'blue',
  'No answer': 'gray',
  Agreed: 'green',
  Declined: 'red',
  Donated: 'green',
  Scheduled: 'green',
  Done: 'gray',
  Cancelled: 'red',
};

/**
 * Donor blood types that can give red cells to a patient of `recipient`
 * type, closest match first.
 */
const COMPATIBLE = {
  'O-': ['O-'],
  'O+': ['O+', 'O-'],
  'A-': ['A-', 'O-'],
  'A+': ['A+', 'A-', 'O+', 'O-'],
  'B-': ['B-', 'O-'],
  'B+': ['B+', 'B-', 'O+', 'O-'],
  'AB-': ['AB-', 'A-', 'B-', 'O-'],
  'AB+': ['AB+', 'AB-', 'A+', 'A-', 'B+', 'B-', 'O+', 'O-'],
};
export const compatibleDonorTypes = (recipient) => COMPATIBLE[recipient] || [];

/** Whole-blood donors rest about three months between donations. */
export const DONOR_REST_DAYS = 90;

/** 'Opted out', 'Resting' (with the date they can give again), or 'Available'. */
export function donorAvailability(d, today = todayIso()) {
  if (d.opted_out_at) return { state: 'Opted out' };
  if (d.last_donated_on) {
    const next = addDays(d.last_donated_on, DONOR_REST_DAYS);
    if (next > today) return { state: 'Resting', until: next };
  }
  return { state: 'Available' };
}

export const AVAILABILITY_TONES = { Available: 'green', Resting: 'gold', 'Opted out': 'gray' };

/**
 * Donors to call for a request: compatible type, not opted out, exact type
 * first, then available before resting. Donors with an unknown blood type
 * are left out; staff can still find them on the Donors tab.
 */
export function matchDonors(request, donors, today = todayIso()) {
  const order = compatibleDonorTypes(request.blood_type);
  return donors
    .filter((d) => !d.opted_out_at && order.includes(d.blood_type))
    .map((d) => ({ ...d, availability: donorAvailability(d, today), rank: order.indexOf(d.blood_type) }))
    .sort((a, b) =>
      (a.availability.state === 'Available' ? 0 : 1) - (b.availability.state === 'Available' ? 0 : 1)
      || a.rank - b.rank
      || a.full_name.localeCompare(b.full_name));
}

/** Digits for tel:/sms: links. A local 09… number becomes +639…. */
export function phoneHref(mobile) {
  const digits = String(mobile || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('09') && digits.length === 11) return `+63${digits.slice(1)}`;
  if (digits.startsWith('63')) return `+${digits}`;
  return digits;
}

export function smsHref(mobile, body) {
  const to = phoneHref(mobile);
  return to ? `sms:${to}?body=${encodeURIComponent(body)}` : '';
}

export function certificateReadySms(r, parishName = 'parokya') {
  return `Maayong adlaw ${r.requester_name || ''}! Andam na ang ${certTypeLabel(r.cert_type).toLowerCase()} (Ref ${r.ref_no}). `
    + `Palihug kuhaa sa opisina sa ${parishName}. Pagdala og ID. Salamat!`;
}

export function bloodCallSms(request, parishName = 'parokya') {
  const when = request.needed_by ? ` sa dili pa ${request.needed_by}` : '';
  return `Maayong adlaw gikan sa ${parishName}! Nanginahanglan og ${request.blood_type} nga dugo (${request.units} bag) `
    + `sa ${request.hospital}${when}. Makahatag ba ka? Palihug tubaga kini nga mensahe. Salamat kaayo!`;
}

/** Text used by search boxes. */
export const certSearchText = (r) => [r.ref_no, r.subject_first_name, r.subject_middle_name, r.subject_last_name, r.requester_name, r.requester_mobile].join(' ');
export const subjectName = (r) => [r.subject_first_name, r.subject_middle_name, r.subject_last_name].filter(Boolean).join(' ');
