export const RELATIONSHIPS = [
  'Head of Household', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother',
  'Grandfather', 'Grandmother', 'Grandchild', 'Sibling', 'In-law', 'Household Helper', 'Other',
];

export const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated'];

export const RELIGIONS = ['Roman Catholic', 'Iglesia ni Cristo', 'Protestant', 'Born Again', 'Islam', 'Other'];

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export const HEAD = 'Head of Household';

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
    civilStatus: '', contact: '', email: '', occupation: '', religion: 'Roman Catholic', bloodType: '', gkkRole: '',
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
