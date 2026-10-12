// Sample Downloads for the TRAINING site (0096, 0097): 50 small but real
// forms (PDF, Word, Excel, photos) and some song lyrics, to see how the
// Downloads page looks when it's full. `npm run db:seed-downloads` writes
// the files and their SQL to supabase/seed/downloads-sample/ (gitignored),
// uploads the files to the training project's "downloads" bucket under
// sample/, and inserts the rows; running it again replaces them.
// `npm run db:clean-downloads` takes them all out again. Both name the
// training project, never live, and need the Supabase CLI signed in.
//
// The songs are public-domain hymns, prayer texts used at Mass, and short
// sample songs written for this demo, so nothing here is anyone's lyrics.
//
//   node scripts/sample-downloads.mjs          only write the files and SQL
//   node scripts/sample-downloads.mjs seed     write, upload and insert (training)
//   node scripts/sample-downloads.mjs clean    take them out of training again
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';

// The training project, always named: the CLI may be linked to live.
const TRAINING = 'qyoyuukpdjrwfhovtrwd';
const MODE = process.argv[2] || 'write';
const OUT = 'supabase/seed/downloads-sample';
const FILES = `${OUT}/files`;
const CLEAN_SQL = 'supabase/seed/downloads-sample-clean.sql';

/** `npx supabase <args>` against the training project. */
function supabase(args, { quiet = false } = {}) {
  execFileSync('npx', ['supabase', ...args, '--project-ref', TRAINING, '--linked'], { stdio: quiet ? 'pipe' : 'inherit', shell: true });
}

if (MODE === 'clean') {
  supabase(['db', 'query', '-f', CLEAN_SQL]);
  supabase(['storage', 'rm', '-r', 'ss:///downloads/sample', '--experimental', '--yes']);
  console.log('Sample downloads taken out of the training site.');
  process.exit(0);
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(FILES, { recursive: true });

const PARISH = 'Our Lady of Guadalupe Quasi-Parish, Mua-an';

// ---- file makers ----------------------------------------------------------

/** A one-page PDF: the title, the parish, and the form's lines. */
function pdf(title, lines) {
  const esc = (s) => String(s).replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '');
  const text = [
    `BT /F1 20 Tf 56 770 Td (${esc(title)}) Tj ET`,
    `BT /F1 11 Tf 56 748 Td (${esc(PARISH)}) Tj ET`,
    ...lines.map((l, i) => `BT /F1 12 Tf 56 ${700 - i * 30} Td (${esc(l)}) Tj ET`),
    `BT /F1 9 Tf 56 40 Td (Sample form for the training site) Tj ET`,
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** A ZIP of `entries` ({ name: text }), stored without compression: enough for Word and Excel files. */
function zip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const data = Buffer.from(text, 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(20, 6); head.writeUInt16LE(0, 8); head.writeUInt16LE(0, 10);
    head.writeUInt32LE(0, 12); head.writeUInt32LE(crc, 16); head.writeUInt32LE(data.length, 20); head.writeUInt32LE(data.length, 24);
    head.writeUInt16LE(nameBuf.length, 28); head.writeUInt32LE(offset, 42);
    parts.push(local, nameBuf, data);
    central.push(head, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  const count = Object.keys(entries).length;
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

const xml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const RELS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** A Word file: the title, the parish, then a paragraph per line. */
function docx(title, lines) {
  const para = (t, bold = false) => `<w:p><w:r>${bold ? '<w:rPr><w:b/><w:sz w:val="36"/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(t)}</w:t></w:r></w:p>`;
  return zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RELS}/officeDocument" Target="word/document.xml"/></Relationships>`,
    'word/document.xml': `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${para(title, true)}${para(PARISH)}${lines.map((l) => para(l)).join('')}${para('Sample form for the training site')}</w:body></w:document>`,
  });
}

/** An Excel file: one sheet, the given header row and a few blank numbered rows. */
function xlsx(title, headers, blankRows = 15) {
  const col = (i) => String.fromCharCode(65 + i);
  const cell = (r, i, v) => `<c r="${col(i)}${r}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`;
  const rows = [
    `<row r="1">${cell(1, 0, title)}</row>`,
    `<row r="2">${cell(2, 0, PARISH)}</row>`,
    `<row r="4">${headers.map((h, i) => cell(4, i, h)).join('')}</row>`,
    ...Array.from({ length: blankRows }, (_, n) => `<row r="${n + 5}">${cell(n + 5, 0, String(n + 1))}</row>`),
  ];
  return zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RELS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${RELS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${RELS}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.join('')}</sheetData></worksheet>`,
  });
}

/** A PNG "poster": a navy-to-gold band picture, `seed` varying the colours. */
function png(seed) {
  const w = 600; const h = 400;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const t = (x + y + seed * 37) / (w + h);
      const band = Math.floor((y / h) * 6 + seed) % 2;
      raw[row + 1 + x * 3] = Math.round(26 + t * 170 + band * 20);
      raw[row + 2 + x * 3] = Math.round(43 + t * 112);
      raw[row + 3 + x * 3] = Math.round(74 + (1 - t) * 90);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---- the 50 forms -----------------------------------------------------------

const BLANKS = ['Pangalan: ______________________________', 'GKK: ______________________________', 'Petsa: ______________________________', 'Pirma: ______________________________'];
const TYPES = {
  pdf: ['application/pdf', (f) => pdf(f.title, f.lines || BLANKS)],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', (f) => docx(f.title, f.lines || BLANKS)],
  xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', (f) => xlsx(f.title, f.headers || ['No.', 'Pangalan', 'GKK', 'Kontak'])],
  png: ['image/png', (f, i) => png(i)],
};

const FORMS = [
  // [category, title, type, description]
  ['GKK Forms', 'GKK Officers Form', 'pdf', 'Ilista ang mga opisyal sa GKK ug ihatag sa opisina sa parokya.'],
  ['GKK Forms', 'GKK Attendance Sheet', 'xlsx', 'Para sa matag Kasaulogan ug Bible Service.'],
  ['GKK Forms', 'GKK Monthly Report', 'docx', 'Ireport ang mga kalihokan sa GKK matag bulan.'],
  ['GKK Forms', 'Kasaulogan Schedule Template', 'docx', null],
  ['GKK Forms', 'GKK Membership List', 'xlsx', 'Lista sa mga pamilya sakop sa GKK.'],
  ['GKK Forms', 'Bible Service Leaders Roster', 'xlsx', null],
  ['GKK Forms', 'GKK Financial Report', 'xlsx', 'Kita ug gasto sa GKK, matag bulan.'],
  ['GKK Forms', 'GKK Activity Proposal', 'pdf', 'Para sa mga kalihokan nga nanginahanglan og pagtugot sa parokya.'],
  ['GKK Forms', 'GKK Pledge Form', 'pdf', null],
  ['GKK Forms', 'GKK Visitation Log', 'pdf', 'Rekord sa pagbisita sa mga masakiton ug tigulang.'],
  ['GKK Forms', 'Chapel Inventory Sheet', 'xlsx', 'Mga butang sa kapilya: lingkuranan, sound system, ug uban pa.'],
  ['GKK Forms', 'GKK Meeting Minutes Template', 'docx', null],
  ['GKK Forms', 'Lay Minister Nomination', 'pdf', 'Irekomenda ang usa ka sakop alang sa Lay Minister.'],
  ['GKK Forms', 'Coordinator Turnover Form', 'pdf', null],
  ['Parish Forms', 'Household Census Form 2026', 'pdf', 'Ang papel nga porma sa census para sa mga pamilya nga walay internet.'],
  ['Parish Forms', 'Member Census Sheet', 'pdf', 'Usa ka panid matag sakop sa pamilya.'],
  ['Parish Forms', 'Census Summary per GKK', 'xlsx', 'Para sa GKK leader: ihap sa mga pamilya nga nakatubag.'],
  ['Parish Forms', 'Census Instructions for GKK Leaders', 'pdf', 'Unsaon pagpuno ug pagdala sa mga porma sa census.'],
  ['Parish Forms', 'Census Correction Form', 'pdf', null],
  ['Parish Forms', 'New Household Registration (Paper)', 'pdf', 'Para sa bag-ong pamilya nga dili makarehistro online.'],
  ['Parish Forms', 'Census Tally Sheet', 'xlsx', null],
  ['Parish Forms', 'Census Data Privacy Consent', 'pdf', 'Pagtugot sumala sa Data Privacy Act of 2012.'],
  ['Sacrament & Ministry Forms', 'Baptism Application Form', 'pdf', 'Dad-a uban ang birth certificate sa bata.'],
  ['Sacrament & Ministry Forms', 'Confirmation Application Form', 'pdf', null],
  ['Sacrament & Ministry Forms', 'Marriage Interview Form', 'pdf', 'Para sa canonical interview sa magtiayon.'],
  ['Sacrament & Ministry Forms', 'Pre-Cana Seminar Registration', 'pdf', null],
  ['Sacrament & Ministry Forms', 'Certificate Request Form', 'pdf', 'Bunyag, Kumpil o Kasal: pun-a ug dad-a sa opisina.'],
  ['Sacrament & Ministry Forms', 'Anointing of the Sick Request', 'pdf', null],
  ['Sacrament & Ministry Forms', 'Funeral Mass Request', 'pdf', 'Ipahibalo daan sa opisina ang petsa ug oras.'],
  ['Sacrament & Ministry Forms', 'First Communion Registration', 'docx', null],
  ['Sacrament & Ministry Forms', 'Godparent Certification Request', 'pdf', 'Para sa ninong ug ninang gikan sa laing parokya.'],
  ['Sacrament & Ministry Forms', 'Mass Intention Form', 'pdf', null],
  ['Sacrament & Ministry Forms', 'Lector Schedule', 'xlsx', 'Iskedyul sa mga lector matag Domingo.'],
  ['Sacrament & Ministry Forms', 'Altar Server Application', 'pdf', null],
  ['Sacrament & Ministry Forms', 'Choir Membership Form', 'pdf', 'Para sa gustong moapil sa koro sa parokya.'],
  ['Sacrament & Ministry Forms', 'Ministry Volunteer Form', 'docx', null],
  ['Sacrament & Ministry Forms', 'Lay Minister Schedule', 'xlsx', null],
  ['Sacrament & Ministry Forms', 'Youth Ministry Registration', 'pdf', 'Para sa mga batan-on 13 hangtod 30 anyos.'],
  ['Sacrament & Ministry Forms', 'Catechist Application', 'pdf', null],
  ['Sacrament & Ministry Forms', 'Ushers and Collectors Roster', 'xlsx', null],
  ['Other Forms', 'Parish Event Proposal', 'docx', 'Para sa mga kalihokan sa tibuok parokya.'],
  ['Other Forms', 'Facility Reservation Form', 'pdf', 'Pag-reserba sa simbahan, kapilya o hall.'],
  ['Other Forms', 'Donation Pledge Form', 'pdf', null],
  ['Other Forms', 'Blood Donor Registration (Paper)', 'pdf', 'Alang sa Blood Donor Call sa parokya.'],
  ['Other Forms', 'Bulletin Announcement Submission', 'docx', 'Ipadala sa opisina sa dili pa ang Huwebes.'],
  ['Other Forms', 'Prayer Request Form', 'pdf', null],
  ['Other Forms', 'Parish Map', 'png', 'Mapa sa parokya ug sa mga GKK.'],
  ['Other Forms', 'Office Hours Poster', 'png', null],
  ['Other Forms', 'Mass Schedule Poster', 'png', 'I-print ug ipapilit sa kapilya.'],
  ['Other Forms', 'Feast Day Program Template', 'docx', null],
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const q = (s) => (s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const uploads = [];
const fileRows = FORMS.map(([category, title, ext, description], i) => {
  const [contentType, make] = TYPES[ext];
  const name = `${slug(title)}.${ext}`;
  const data = make({ title }, i);
  fs.writeFileSync(path.join(FILES, name), data);
  uploads.push([name, contentType]);
  return `(${q(title)}, ${q(category)}, ${q(description)}, ${q(`sample/${name}`)}, ${q(name)}, ${q(contentType)}, ${data.length}, true)`;
});

// ---- songs ------------------------------------------------------------------

// [title, composer, language, categories, note, lyrics]
const SONGS = [
  ['Ginoo, Kaloy-i Kami', null, 'Bisaya', ['Kasaulogan sa GKK', 'Bible Service'], 'Kyrie',
    'Ginoo, kaloy-i kami.\nGinoo, kaloy-i kami.\n\nKristo, kaloy-i kami.\nKristo, kaloy-i kami.\n\nGinoo, kaloy-i kami.\nGinoo, kaloy-i kami.'],
  ['Amahan Namo', null, 'Bisaya', ['Kasaulogan sa GKK', 'Bible Service', 'Kasagarang Kanta'], 'Ang pag-ampo nga gitudlo ni Hesus',
    'Amahan namo, nga anaa sa mga langit,\npagdaygon ang imong ngalan.\nMoabot kanamo ang imong gingharian.\nMatuman ang imong kabubut-on,\ndinhi sa yuta maingon sa langit.\n\nAng kalan-on namo sa matag adlaw\nihatag kanamo karong adlawa.\nUg pasayloa kami sa among mga sala,\nmaingon nga nagapasaylo kami\nsa mga nakasala kanamo.\n\nUg dili mo kami itugyan sa panulay,\nhinonoa luwasa kami sa dautan.'],
  ['Magtigom Kita', 'Sample nga kanta', 'Bisaya', ['Kasaulogan sa GKK'], 'Pagsulod',
    'Magtigom kita, mga igsoon,\nsa balay sa Ginoo nga maloloy-on.\nAng atong kasingkasing ablihan,\nsa iyang pulong kita magpaminaw.\n\nKORO:\nDayegon ta, dayegon ta\nang Dios nga nagtigom kanato.\nDayegon ta, dayegon ta\nsa awit ug sa pag-ampo.\n\nGikan sa matag balay ug dalan,\nmiabot kita nga usa ka panon.\nSa iyang gugma kita gipundok,\nusa ka pamilya sa Ginoo.'],
  ['Dayegon Ta ang Ginoo', 'Sample nga kanta', 'Bisaya', ['Kasaulogan sa GKK', 'Kasagarang Kanta'], 'Gloria / Pagdayeg',
    'Dayegon ta ang Ginoo,\nkay siya maayo.\nAng iyang gugma walay katapusan,\nhangtod sa kahangtoran.\n\nAng langit ug yuta mag-awit,\nang kabukiran ug kadagatan.\nAng tanang buhing binuhat\nmodayeg sa iyang ngalan.\n\nDayegon ta ang Ginoo,\nkay siya maayo.'],
  ['Halad sa Among Kinabuhi', 'Sample nga kanta', 'Bisaya', ['Kasaulogan sa GKK', 'Bible Service'], 'Halad',
    'Kining tinapay ug bino,\nbunga sa yuta ug sa among kamot,\namo karong ihalad kanimo,\nGinoo sa tanan.\n\nDawata, Ginoo, ang among halad,\nang among kapoy ug kalipay.\nDawata, Ginoo, ang among kinabuhi,\nkay imo man kini tanan.'],
  ['Sa Imong Pulong', 'Sample nga kanta', 'Bisaya', ['Bible Service'], 'Sa dili pa ang Ebanghelyo',
    'Sa imong pulong, Ginoo,\nkami magpaminaw.\nIablihi ang among dunggan\nug ang among kasingkasing.\n\nAleluya, aleluya,\nang imong pulong kahayag.\nAleluya, aleluya,\nsa among dalan, Ginoo.'],
  ['Salamat, Ginoo', 'Sample nga kanta', 'Bisaya', ['Kasaulogan sa GKK', 'Kasagarang Kanta'], 'Pagpasalamat',
    'Salamat, Ginoo, sa adlaw nga kini,\nsa pamilya ug sa silingan.\nSalamat sa kalan-on sa lamesa,\nsa kahimsog ug kalinaw.\n\nSalamat, Ginoo, sa imong pagbantay,\nsa among GKK nga nagkahiusa.\nPadayon kami sa imong dalan,\nhangtod sa among pagbalik.'],
  ['Amazing Grace', 'John Newton (1779)', 'English', ['Kasagarang Kanta'], null,
    'Amazing grace! How sweet the sound\nThat saved a wretch like me!\nI once was lost, but now am found;\nWas blind, but now I see.\n\n’Twas grace that taught my heart to fear,\nAnd grace my fears relieved;\nHow precious did that grace appear\nThe hour I first believed.\n\nThrough many dangers, toils and snares,\nI have already come;\n’Tis grace hath brought me safe thus far,\nAnd grace will lead me home.'],
  ['Holy, Holy, Holy', 'Reginald Heber (1826)', 'English', ['Kasagarang Kanta'], 'Pagsulod',
    'Holy, holy, holy! Lord God Almighty!\nEarly in the morning our song shall rise to thee;\nHoly, holy, holy, merciful and mighty!\nGod in three Persons, blessed Trinity!\n\nHoly, holy, holy! All the saints adore thee,\nCasting down their golden crowns around the glassy sea;\nCherubim and seraphim falling down before thee,\nWhich wert, and art, and evermore shalt be.'],
  ['Silent Night', 'Joseph Mohr (1818), tr. John F. Young', 'English', ['Pasko'], null,
    'Silent night, holy night,\nAll is calm, all is bright\nRound yon virgin mother and child.\nHoly infant so tender and mild,\nSleep in heavenly peace,\nSleep in heavenly peace.\n\nSilent night, holy night,\nShepherds quake at the sight;\nGlories stream from heaven afar,\nHeavenly hosts sing Alleluia!\nChrist the Saviour is born,\nChrist the Saviour is born!'],
  ['O Come, All Ye Faithful', 'tr. Frederick Oakeley (1841)', 'English', ['Pasko'], null,
    'O come, all ye faithful, joyful and triumphant,\nO come ye, O come ye to Bethlehem;\nCome and behold him, born the King of angels:\n\nO come, let us adore him,\nO come, let us adore him,\nO come, let us adore him, Christ the Lord.'],
  ['Salve Regina', null, 'Latin', ['Marian'], 'Pagkahuman sa Misa',
    'Salve, Regina, Mater misericordiae,\nvita, dulcedo, et spes nostra, salve.\nAd te clamamus, exsules filii Hevae,\nad te suspiramus, gementes et flentes\nin hac lacrimarum valle.\n\nEia, ergo, advocata nostra,\nillos tuos misericordes oculos ad nos converte;\net Iesum, benedictum fructum ventris tui,\nnobis post hoc exsilium ostende.\nO clemens, O pia, O dulcis Virgo Maria.'],
  ['Ave Maria', null, 'Latin', ['Marian', 'Kasagarang Kanta'], null,
    'Ave Maria, gratia plena,\nDominus tecum.\nBenedicta tu in mulieribus,\net benedictus fructus ventris tui, Iesus.\n\nSancta Maria, Mater Dei,\nora pro nobis peccatoribus,\nnunc et in hora mortis nostrae.\nAmen.'],
  ['Tantum Ergo', 'St. Thomas Aquinas', 'Latin', ['Kasagarang Kanta'], 'Benediction',
    'Tantum ergo Sacramentum\nveneremur cernui:\net antiquum documentum\nnovo cedat ritui:\npraestet fides supplementum\nsensuum defectui.\n\nGenitori, Genitoque\nlaus et iubilatio,\nsalus, honor, virtus quoque\nsit et benedictio:\nprocedenti ab utroque\ncompar sit laudatio.\nAmen.'],
];

const arr = (xs) => `array[${xs.map(q).join(', ')}]::text[]`;
const dollar = (s) => `$lyrics$${s}$lyrics$`;
const songRows = SONGS.map(([title, composer, language, cats, note, lyrics]) => `(${q(title)}, ${q(composer)}, ${q(language)}, ${arr(cats)}, ${q(note)}, ${dollar(lyrics)}, true)`);

const sql = `-- Generated by scripts/sample-downloads.mjs: sample Downloads for the training site.
-- Takes out an earlier run first (supabase/seed/downloads-sample-clean.sql does the same).
begin;
delete from download_files where file_path like 'sample/%';
delete from songs where title in (${SONGS.map(([t]) => q(t)).join(', ')});

insert into download_files (title, category, description, file_path, file_name, content_type, size_bytes, published) values
${fileRows.join(',\n')};

insert into songs (title, composer, language, categories, note, lyrics, published) values
${songRows.join(',\n')};
commit;
`;
fs.writeFileSync(path.join(OUT, 'rows.sql'), sql);

const clean = `-- Takes the sample Downloads out of the training site (scripts/sample-downloads.mjs).
-- The files go with: npx supabase storage rm -r ss:///downloads/sample --project-ref qyoyuukpdjrwfhovtrwd --experimental
begin;
delete from download_files where file_path like 'sample/%';
delete from songs where title in (${SONGS.map(([t]) => q(t)).join(', ')});
commit;
`;
fs.writeFileSync(CLEAN_SQL, clean);

console.log(`${FORMS.length} files and ${SONGS.length} songs written to ${OUT}`);

if (MODE === 'seed') {
  // Files from an earlier run are replaced; the bucket only takes the types 0096 allows, so each is named.
  try { supabase(['storage', 'rm', '-r', 'ss:///downloads/sample', '--experimental', '--yes'], { quiet: true }); } catch { /* none yet */ }
  for (const [n, [name, type]] of uploads.entries()) {
    supabase(['storage', 'cp', `${FILES}/${name}`, `ss:///downloads/sample/${name}`, '--content-type', type, '--experimental'], { quiet: true });
    process.stdout.write(`\rUploaded ${n + 1} of ${uploads.length}`);
  }
  console.log('');
  supabase(['db', 'query', '-f', `${OUT}/rows.sql`], { quiet: true });
  console.log(`Training site: ${FORMS.length} sample forms and ${SONGS.length} songs published under Downloads.`);
}
