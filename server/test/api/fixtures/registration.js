/** Payload builders shared by the registration API suites. */

/** The smallest member the public form will accept. */
export const MINIMAL_MEMBER = {
  firstName: 'Ana',
  lastName: 'Reyes',
  relationship: 'Head of Household',
  sex: 'Female',
  dob: '1990-04-02',
  civilStatus: 'Single',
};

/** A complete, valid submission. `patch` replaces parts of it. */
export function registrationPayload(patch = {}) {
  return {
    household: {
      householdName: 'Dela Cruz Family',
      street: '24 Rizal St.',
      barangay: 'Purok 3, Mua-an',
      city: 'Kidapawan City',
      province: 'North Cotabato',
      zip: '9400',
      contact: '0917 555 0142',
      email: 'delacruz.family@example.com',
      gkk: 'GKK San Isidro',
      familyGrouping: 'Grouping 1',
      ...patch.household,
    },
    members: patch.members ?? [
      {
        firstName: 'Juan',
        middleName: 'Santos',
        lastName: 'Dela Cruz',
        relationship: 'Head of Household',
        sex: 'Male',
        dob: '1981-06-14',
        civilStatus: 'Married',
        bloodType: 'O+',
        hasBaptism: true,
        baptismDate: '1981-08-02',
        baptismChurch: 'Our Lady of Guadalupe',
        ministries: ['Choir', 'Lector & Commentator'],
      },
    ],
    volunteer: patch.volunteer ?? 'Yes',
    notifyOptin: patch.notifyOptin ?? true,
    consent: patch.consent ?? true,
  };
}
