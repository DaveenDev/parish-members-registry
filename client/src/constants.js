export const RELATIONSHIPS = [
  'Head of Household', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother',
  'Grandfather', 'Grandmother', 'Grandchild', 'Sibling', 'In-law', 'Household Helper', 'Other',
];

export const CIVIL_STATUSES = ['Single', 'Married', 'Live-in', 'Widowed', 'Separated'];

// Civil statuses where a Spouse member shares the head's status by default.
export const PARTNERED_STATUSES = ['Married', 'Live-in'];

export const RELIGIONS = ['Roman Catholic', 'Iglesia ni Cristo', 'Protestant', 'Born Again', 'Islam', 'Other'];

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const HEAD = 'Head of Household';

// Sacraments and the member columns that hold each claim. `key` is what
// sacrament_verifications.sacrament stores (0005 migration).
export const SACRAMENTS = [
  { key: 'baptism', label: 'Baptism', has: 'has_baptism', date: 'baptism_date', church: 'baptism_church', defaultSource: 'Baptismal certificate' },
  { key: 'communion', label: 'First Communion', has: 'has_communion', date: 'communion_date', church: 'communion_church', defaultSource: 'First Communion certificate' },
  { key: 'confirmation', label: 'Confirmation', has: 'has_confirmation', date: 'conf_date', church: 'conf_church', defaultSource: 'Confirmation certificate' },
  { key: 'matrimony', label: 'Matrimony', has: 'has_matrimony', date: 'mat_date', church: 'mat_church', defaultSource: 'Marriage contract / certificate' },
];

// Keep in sync with sacrament_verification_sources() in the 0005 migration.
export const VERIFICATION_SOURCES = [
  'Baptismal certificate', 'First Communion certificate', 'Confirmation certificate',
  'Marriage contract / certificate', 'Parish register entry', 'Other document',
];

export const FAMILY_GROUPINGS = Array.from({ length: 10 }, (_, i) => `FG ${i + 1}`);

// Tribe pick-list (members.tribe stays free text, so "Other…" can hold anything else).
export const TRIBES = [
  'Bisaya', 'Illongo', 'Bol-anon', 'Waray', 'Karay-a', 'Bagobo', "T'boli", "B'laan", 'Manobo', 'Subanon',
  'Mandaya', 'Higaonon', 'Teduray', 'Maranao', 'Maguindanaon', 'Tausug', 'Yakan', 'Badjao',
];

// Suggestions for "Katungdanan sa GKK" (members.gkk_role stays free text, so
// anything else can still be typed in).
export const GKK_ROLES = ['GKK President', 'Vice-President', 'Secretary', 'Treasurer', 'Business Manager'];

// Head / spouse marriage type. Only a Catholic marriage counts as the
// sacrament of Matrimony (has_matrimony). 'Catholic' and 'Convalidation' are
// the older values admins may still see on existing records.
export const WEDDING_TYPES = ['Catholic Marriage', 'Civil Wedding', 'Other Sect Wedding'];
export const LEGACY_MAT_TYPES = ['Catholic', 'Convalidation'];

// Household participation survey. Keys are what's stored in
// households.participation / households.help_ways (and whitelisted in
// submit_registration), labels are what the parishioner sees.
export const PARTICIPATION_ITEMS = [
  ['mass', 'Mass (Misa)'],
  ['bible_service', 'Bible Service (Kasaulogan)'],
  ['devotions', 'Devotions / Rosary'],
  ['meetings', 'Meetings / Seminars'],
  ['pintakasi', 'Pintakasi'],
  ['financial', 'Suporta Pinansyal'],
];
export const PARTICIPATION_LEVELS = ['Aktibo', 'Panagsa', 'Wala'];
export const HELP_WAYS = [
  ['sunday_mass', 'Kanunay nga pagsimba sa adlawng domingo.'],
  ['bible_service', 'Pagtambong sa mga bible service ug kasaulogan.'],
  ['devotions', 'Pagtambong sa mga devotions ug rosary.'],
  ['meetings', 'Pagtambong sa mga meetings ug seminars.'],
  ['pintakasi', 'Pag-apil sa pintakasi.'],
  ['financial', 'Paghatag sa suporta pinansyal.'],
];

export const DEFAULT_ADDRESS = { city: 'Kidapawan City', province: 'North Cotabato', zip: '9400' };

export function blankMember() {
  return {
    firstName: '', middleName: '', lastName: '', suffix: '', relationship: '', sex: '', dob: '', placeOfBirth: '', tribe: '',
    civilStatus: '', contact: '', email: '', occupation: '', religion: 'Roman Catholic', bloodType: '', gkkRole: '', parishRole: '',
    hasBaptism: false, baptismDate: '', baptismChurch: '',
    hasCommunion: false, communionDate: '', communionChurch: '',
    hasConfirmation: false, confDate: '', confChurch: '', confName: '', confSponsor: '',
    hasMatrimony: false, matDate: '', matChurch: '', matType: '',
    ministries: [], organizations: [],
  };
}

export function fmtDate(d) {
  if (!d) return '';
  try {
    return new Date(`${d}T00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return d;
  }
}

/** A timestamp (created_at, verified_at, …) as "Oct 1, 2026, 9:30 PM", or the date alone with `time: false`. */
export function fmtDateTime(ts, { time = true } = {}) {
  const d = ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    ...(time ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

/** "today", "yesterday", "3 days ago" — calendar days in local time. */
export function daysAgo(ts, now = new Date()) {
  const d = ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function ageFromDob(dob) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}
