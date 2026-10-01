// Bisaya display labels for the public registration wizard.
//
// The values saved to the database stay in English ("Married", "Head of
// Household", "Catholic Marriage", …) because the admin panel's filters,
// reports and the registration RPC match on them. Only what parishioners
// see is translated, via these maps.

export const RELATIONSHIP_LABELS = {
  'Head of Household': 'Ulo sa Pamilya',
  Spouse: 'Asawa',
  Son: 'Anak nga Lalaki',
  Daughter: 'Anak nga Babaye',
  Father: 'Amahan',
  Mother: 'Inahan',
  Grandfather: 'Lolo',
  Grandmother: 'Lola',
  Grandchild: 'Apo',
  Sibling: 'Igsoon',
  'In-law': 'Ugangan / Bayaw / Bilas',
  'Household Helper': 'Katabang sa Balay',
  Other: 'Uban pa',
};

export const SEX_LABELS = { Male: 'Lalaki', Female: 'Babaye' };

export const CIVIL_STATUS_LABELS = {
  Single: 'Ulitawo / Dalaga',
  Married: 'Minyo',
  'Live-in': 'Nag-ipon (Live-in)',
  Widowed: 'Biyudo / Biyuda',
  Separated: 'Nagbulag',
};

export const RELIGION_LABELS = {
  'Roman Catholic': 'Romano Katoliko',
  'Iglesia ni Cristo': 'Iglesia ni Cristo',
  Protestant: 'Protestante',
  'Born Again': 'Born Again',
  Islam: 'Islam',
  Other: 'Uban pa',
};

export const WEDDING_TYPE_LABELS = {
  'Catholic Marriage': 'Kasal sa Simbahang Katoliko',
  'Civil Wedding': 'Kasal sa Huwes (Civil)',
  'Other Sect Wedding': 'Kasal sa Laing Relihiyon',
};

export const VOLUNTEER_LABELS = {
  Yes: 'Oo, malipayon',
  Maybe: 'Basin, palihug kontaka mi',
  No: 'Dili pa karon',
};

// submit_registration raises English messages; the ones a parishioner can
// actually hit get a Bisaya version, everything else a generic retry note.
const SERVER_ERRORS = [
  [/already registered/i, 'Narehistro na kini nga ngalan sa pamilya. Palihug pilia og laing ngalan.'],
  [/select a GKK/i, 'Palihug pilia ang inyong GKK gikan sa listahan.'],
  [/consent/i, 'Kinahanglan ang inyong pagtugot sa data privacy.'],
  [/at most 30/i, 'Hangtod 30 ka miyembro lamang ang usa ka pamilya.'],
  [/Household Head/i, 'Kinahanglan adunay usa ka Ulo sa Pamilya.'],
  [/failed to fetch|network/i, 'Walay koneksyon sa internet. Palihug sulayi pag-usab.'],
];

export function serverErrorInBisaya(message) {
  const hit = SERVER_ERRORS.find(([pattern]) => pattern.test(message || ''));
  return hit ? hit[1] : 'Dili mapadala ang rehistro. Palihug sulayi pag-usab.';
}

/** The Bisaya label for a stored value, falling back to the value itself. */
export function bis(labels, value) {
  return (value && labels[value]) || value || '';
}
