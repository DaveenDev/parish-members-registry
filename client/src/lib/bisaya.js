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
  // Older records from before the wedding-type question (LEGACY_MAT_TYPES).
  Catholic: 'Kasal sa Simbahan (daan nga rekord)',
  Convalidation: 'Gi-convalidate nga Kasal',
};

// Dropdown choices with no stored value of their own: "no blood type on file"
// and the Tribe list's free-text option.
export const BLOOD_UNKNOWN_LABEL = 'Wala mahibal-i';
export const TRIBE_OTHER_LABEL = 'Uban pa…';

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

// Census portal: portal_open/portal_submit answer { ok: false, error } for
// sign-in problems and raise English messages for form problems.
const PORTAL_ERRORS = {
  invalid: 'Sayop ang reference number o ang code. Susiha pag-usab ang inyong census form.',
  locked: 'Daghan na kaayong sayop nga pagsulay. Palihug sulayi pag-usab human sa 15 minutos.',
  closed: 'Wala pay bukas nga census karon. Palihug kontaka ang opisina sa parokya.',
};
const PORTAL_SERVER_ERRORS = [
  [/consent/i, 'Kinahanglan ang inyong pagtugot sa data privacy.'],
  [/not in your household/i, 'Adunay miyembro nga dili sakop sa inyong pamilya. Palihug i-reload ang panid.'],
  [/first and last name/i, 'Ibutang ang pangalan ug apelyido sa matag bag-ong miyembro.'],
  [/relationship is required/i, 'Pilia ang relasyon sa matag bag-ong miyembro.'],
  [/Household Head/i, 'Ang bag-ong miyembro dili mahimong Ulo sa Pamilya.'],
  [/at most/i, 'Sobra na ang gidaghanon sa miyembro.'],
  [/failed to fetch|network/i, 'Walay koneksyon sa internet. Palihug sulayi pag-usab.'],
];

export function portalErrorInBisaya(codeOrMessage) {
  if (PORTAL_ERRORS[codeOrMessage]) return PORTAL_ERRORS[codeOrMessage];
  const hit = PORTAL_SERVER_ERRORS.find(([pattern]) => pattern.test(codeOrMessage || ''));
  return hit ? hit[1] : 'Dili mapadala karon. Palihug sulayi pag-usab.';
}

/** The Bisaya label for a stored value, falling back to the value itself. */
export function bis(labels, value) {
  return (value && labels[value]) || value || '';
}
