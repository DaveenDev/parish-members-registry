export const RELATIONSHIPS = [
  'Head of Household', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother',
  'Grandfather', 'Grandmother', 'Grandchild', 'Sibling', 'In-law', 'Household Helper', 'Other',
];

export const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated'];

export const RELIGIONS = ['Roman Catholic', 'Iglesia ni Cristo', 'Protestant', 'Born Again', 'Islam', 'Other'];

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

export function blankMember() {
  return {
    firstName: '', middleName: '', lastName: '', relationship: '', sex: '', dob: '', placeOfBirth: '',
    civilStatus: '', contact: '', email: '', occupation: '', religion: 'Roman Catholic', bloodType: '',
    hasBaptism: false, baptismDate: '', baptismChurch: '',
    hasCommunion: false, communionDate: '', communionChurch: '',
    hasConfirmation: false, confDate: '', confChurch: '', confName: '', confSponsor: '',
    hasMatrimony: false, matDate: '', matChurch: '', matType: '',
    ministries: [],
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
