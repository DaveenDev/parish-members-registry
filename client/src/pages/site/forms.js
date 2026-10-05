// The public request forms: steps, fields and how the answers become the
// payload each 0012 submit function expects. Option values are what the
// database stores; labels are what visitors read.
import { api } from '../../api.js';
import { BLOOD_TYPES } from '../../constants.js';

const consent = {
  k: 'consent', type: 'check', req: true,
  label: 'Mouyon ko nga gamiton sa parokya kini nga impormasyon para lang niini nga hangyo, sumala sa Data Privacy Act of 2012.',
};
const mobile = (k, label = 'Mobile number', req = true) => ({ k, type: 'tel', req, mobile: true, label, ph: '09XX XXX XXXX' });
const opts = (list) => list.map((v) => (Array.isArray(v) ? v : [v, v]));

export const FORMS = {
  sertipiko: {
    title: 'Pangayo og Sertipiko',
    short: 'Sertipiko',
    intro: 'Para sa sertipiko sa Bunyag, Kumpil o Kasal nga nahimo dinhi sa parokya.',
    who: 'Ang kawani sa opisina sa parokya lang ang makakita niini.',
    notes: ['Kinahanglan og ID inig kuha.', 'Mo-text ang opisina kung andam na kuhaon.'],
    steps: [
      { title: 'Unsang sertipiko?', fields: [
        { k: 'certType', type: 'choice', req: true, label: 'Klase sa sertipiko', opts: opts([['baptism', 'Bunyag (Baptismal)'], ['confirmation', 'Kumpil (Confirmation)'], ['matrimony', 'Kasal (Marriage)']]) },
      ] },
      { title: 'Detalye sa rekord', fields: [
        { k: 'subjectFirstName', type: 'text', req: true, label: 'Pangalan (first name) sa tawo sa rekord', hint: 'Sama sa pagkasulat sa sertipiko.' },
        { k: 'subjectMiddleName', type: 'text', label: 'Middle name (opsyonal)' },
        { k: 'subjectLastName', type: 'text', req: true, label: 'Apelyido' },
        { k: 'sacramentYear', type: 'number', req: true, label: 'Tuig sa sakramento (gibana-bana)', ph: 'e.g. 1998', im: 'numeric' },
        { k: 'sacramentDate', type: 'date', label: 'Eksaktong petsa (kung nahibal-an)' },
        { k: 'sacramentPlace', type: 'text', label: 'Simbahan o lugar', def: 'Our Lady of Guadalupe Quasi-Parish' },
        { k: 'fatherName', type: 'text', req: true, label: 'Ngalan sa amahan', show: (v) => v.certType === 'baptism' },
        { k: 'motherName', type: 'text', req: true, label: 'Ngalan sa inahan (apelyido sa pagkadalaga)', show: (v) => v.certType === 'baptism' },
        { k: 'spouseName', type: 'text', req: true, label: 'Ngalan sa kapikas', show: (v) => v.certType === 'matrimony' },
      ] },
      { title: 'Para asa ug pila?', fields: [
        { k: 'purpose', type: 'choice', req: true, label: 'Para asa', opts: opts(['Eskwelahan', 'Trabaho', 'Kasal', 'Uban pa']) },
        { k: 'copies', type: 'select', label: 'Pila ka kopya', opts: opts(['1', '2', '3', '4', '5']), def: '1' },
      ] },
      { title: 'Kinsa ang nangayo?', fields: [
        { k: 'requesterName', type: 'text', req: true, label: 'Imong ngalan' },
        mobile('requesterMobile'),
        { k: 'requesterEmail', type: 'email', label: 'Email (opsyonal)' },
        { k: 'relationship', type: 'select', req: true, label: 'Relasyon sa tawo sa rekord', opts: opts(['Ako mismo', 'Ginikanan', 'Kapikas', 'Anak', 'Uban pa']) },
        consent,
      ] },
    ],
    next: ['Susihon sa kawani ang rekord.', 'Mo-text mi kung andam na kuhaon.', 'Dad-a ang ID ug kini nga reference number.'],
    track: true,
    submit: (v) => api.submitCertificateRequest(v),
  },

  // "Request to avail" on the Ang Simbahan page (0032 submit_sacrament_request).
  ocia: {
    title: 'Moapil sa OCIA',
    short: 'OCIA',
    intro: 'Para sa mga hamtong nga gustong mahimong Katoliko, o nabunyagan na apan wala pa makadawat sa ubang mga sakramento. Kontakon ka sa opisina bahin sa sunod nga klase.',
    who: 'Ang kawani sa opisina sa parokya lang ang makakita niini.',
    steps: [
      { title: 'Kinsa ang moapil?', fields: [
        { k: 'personName', type: 'text', req: true, label: 'Ngalan sa moapil' },
        { k: 'baptismStatus', type: 'choice', req: true, label: 'Nabunyagan na ba?', opts: opts([
          ['Not baptized', 'Wala pa mabunyagi'],
          ['Baptized in another church', 'Nabunyagan sa laing simbahan'],
          ['Baptized Catholic, not yet confirmed', 'Katoliko na, wala pa makumpil o makakalawat'],
        ]) },
        { k: 'location', type: 'text', label: 'Puy-anan o GKK (opsyonal)' },
        { k: 'message', type: 'area', label: 'Pangutana o mensahe (opsyonal)' },
      ] },
      { title: 'Kinsa among kontakon?', fields: [
        { k: 'requesterName', type: 'text', req: true, label: 'Imong ngalan' },
        mobile('requesterMobile'),
        { k: 'relationship', type: 'select', req: true, label: 'Relasyon sa moapil', opts: opts(['Ako mismo', 'Ginikanan', 'Kapikas', 'Anak', 'Higala', 'Uban pa']) },
        consent,
      ] },
    ],
    next: ['Kontakon ka sa opisina sulod sa pipila ka adlaw.', 'Ipahibalo namo ang iskedyul sa sunod nga klase sa OCIA.'],
    track: true,
    submit: (v) => api.submitSacramentRequest({ ...v, sacrament: 'ocia' }),
  },

  // Also "Pangayo ug Dihog Iskedyul" on Mga Serbisyo.
  pagdihog: {
    title: 'Pangayo ug Dihog Iskedyul',
    short: 'Dihog Iskedyul',
    intro: 'Mangayo nga duawon sa pari ang masakiton o tigulang aron dihogan ug ampoan.',
    sickCall: true,
    who: 'Ang kawani sa opisina ug ang pari lang ang makakita niini.',
    steps: [
      { title: 'Ang masakiton', fields: [
        { k: 'personName', type: 'text', req: true, label: 'Ngalan sa masakiton' },
        { k: 'location', type: 'text', req: true, label: 'Asa siya karon', hint: 'Address sa balay, o ospital ug numero sa kwarto.' },
        { k: 'urgent', type: 'choice', req: true, label: 'Unsa ang kahimtang?', opts: opts([['no', 'Pwede iskedyul ang pagbisita'], ['yes', 'Grabe na ang kahimtang']]), def: 'no' },
        { k: 'preferredDate', type: 'date', label: 'Gusto nga petsa (opsyonal)' },
        { k: 'message', type: 'area', label: 'Dugang detalye (opsyonal)', ph: 'e.g. ang sakit, ug kanus-a pwede mobisita' },
      ] },
      { title: 'Kinsa among kontakon?', fields: [
        { k: 'requesterName', type: 'text', req: true, label: 'Imong ngalan' },
        mobile('requesterMobile'),
        { k: 'relationship', type: 'select', req: true, label: 'Relasyon sa masakiton', opts: opts(['Anak', 'Kapikas', 'Ginikanan', 'Igsoon', 'Apo', 'Higala', 'Uban pa']) },
        consent,
      ] },
    ],
    next: ['Kontakon ka sa opisina aron iskedyul ang pagbisita sa pari.', 'Kung mograbe ang kahimtang, tawagi dayon ang sick call sa parokya.'],
    track: true,
    submit: (v) => api.submitSacramentRequest({ ...v, urgent: v.urgent === 'yes', sacrament: 'anointing' }),
  },

  dugo: {
    title: 'Nanginahanglan og Dugo',
    short: 'Nanginahanglan og dugo',
    intro: 'Ipahibalo kanamo ang gikinahanglan sa pasyente.',
    who: 'Ang among kawani ang mokontak sa mga donor nga mohaum, sa pribado.',
    steps: [
      { title: 'Ang pasyente', fields: [
        { k: 'bloodType', type: 'choice', grid: true, req: true, label: 'Blood type sa pasyente', opts: opts(BLOOD_TYPES) },
        { k: 'patientName', type: 'text', req: true, label: 'Ngalan sa pasyente', hint: 'Para sa kawani lang. Dili gyud ipakita sa publiko.' },
        { k: 'hospital', type: 'text', req: true, label: 'Ospital', ph: 'e.g. Kidapawan Doctors Hospital' },
        { k: 'units', type: 'select', label: 'Pila ka bag (units)', opts: opts(['1', '2', '3', '4', '5', '6', '8', '10']), def: '1' },
        { k: 'neededBy', type: 'date', req: true, label: 'Kanus-a kinahanglan' },
      ] },
      { title: 'Kinsa among kontakon?', fields: [
        { k: 'contactName', type: 'text', req: true, label: 'Ngalan sa kontak nga tawo' },
        mobile('contactMobile'),
        { k: 'relationship', type: 'text', label: 'Relasyon sa pasyente (opsyonal)' },
        { k: 'allowPublic', type: 'check', label: 'Ipakita sa website ang blood type ug ospital isip urgent call. Dili ipakita ang ngalan sa pasyente.' },
        consent,
      ] },
    ],
    next: ['Pangitaon sa kawani ang mga donor nga mohaum.', 'Kontakon ka namo sa mobile.'],
    submit: (v) => api.submitBloodRequest(v),
  },

  donor: {
    title: 'Gusto ko Mo-donate',
    short: 'Mo-donate og dugo',
    intro: 'Kontakon ka lang kung adunay nanginahanglan nga mohaum sa imong blood type.',
    who: 'Dili gyud ipakita sa publiko ang imong ngalan o blood type.',
    steps: [
      { title: 'Imong detalye', fields: [
        { k: 'fullName', type: 'text', req: true, label: 'Imong ngalan' },
        mobile('mobile'),
        { k: 'bloodType', type: 'select', label: 'Blood type (kung nahibal-an)', opts: opts([['', 'Wala kahibalo'], ...BLOOD_TYPES]), def: '', noBlank: true },
        { k: 'gkk', type: 'select', label: 'Imong GKK (opsyonal)', opts: 'gkks' },
        { ...consent, label: 'Mouyon ko nga kontakon sa parokya para sa blood call. Pwede ko mohunong bisan kanus-a pinaagi sa pag-text sa opisina.' },
      ] },
    ],
    next: ['Idugang ka namo sa pribado nga lista sa mga donor.', 'Kontakon ka lang kung adunay mohaum nga hangyo.'],
    noRef: true,
    submit: (v) => api.registerBloodDonor(v),
  },
};
