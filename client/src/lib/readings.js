// Ang Simbahan page: the day's Mass readings, from Universalis
// (universalis.com, Philippine calendar). Universalis lets websites show its
// readings by loading its JSONP feed in the visitor's browser, as long as the
// page links back to it and shows the copyright notice it sends
// (universalis.com/n-jsonp-technical.htm). It serves dates from a few days
// back to about a week ahead (DAY_RANGE).
//
// The texts arrive as HTML, so cleanHtml() keeps only a few formatting tags
// and drops every attribute before any of it goes on the page.
// Pure functions, so they're easy to test (client/test/readings.test.js).

export const UNIVERSALIS_CALENDAR = 'Asia.Philippines';
export const UNIVERSALIS_PAGE = `https://universalis.com/${UNIVERSALIS_CALENDAR}/mass.htm`;

/** Days before and after today the visitor can move to. */
export const DAY_RANGE = { min: -3, max: 7 };

/** The readings in Mass order, with their Bisaya names. Weekdays have no second reading. */
export const READING_PARTS = [
  ['Mass_R1', 'Unang Pagbasa'],
  ['Mass_Ps', 'Salmo'],
  ['Mass_R2', 'Ikaduhang Pagbasa'],
  ['Mass_G', 'Ebanghelyo'],
];

/** Today in the Philippines, as YYYY-MM-DD, wherever the visitor is. */
export function manilaToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** The JSONP address for one day's readings. */
export function universalisUrl(iso, callback) {
  return `https://universalis.com/${UNIVERSALIS_CALENDAR}/${iso.replaceAll('-', '')}/jsonpmass.js?callback=${encodeURIComponent(callback)}`;
}

const KEEP = new Set(['div', 'p', 'br', 'i', 'em', 'b', 'strong', 'span', 'sup', 'sub', 'small']);

/**
 * Universalis HTML made safe to put on the page: only the KEEP tags survive,
 * with no attributes. A little layout is kept as data attributes on a div or
 * p: data-line for a line of verse (a negative, hanging indent), data-indent
 * for a paragraph whose first line is indented, and data-gap for the first
 * line of a new stanza (a top margin). Every other tag goes, and any stray <
 * or > in the text is escaped, so nothing can turn into a new tag.
 */
export function cleanHtml(html) {
  const src = String(html || '');
  const text = (s) => s.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let out = '';
  let last = 0;
  for (const m of src.matchAll(/<[^>]*>/g)) {
    out += text(src.slice(last, m.index));
    last = m.index + m[0].length;
    const tag = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(m[0]);
    // Not a tag at all ("a < b > c"): it's text.
    if (!tag) { out += text(m[0]); continue; }
    const name = tag[2].toLowerCase();
    if (!KEEP.has(name)) continue;
    if (tag[1]) { if (name !== 'br') out += `</${name}>`; continue; }
    const block = name === 'div' || name === 'p';
    const indent = block ? /text-indent\s*:\s*(-?)\s*[1-9]/i.exec(m[0]) : null;
    const line = indent ? (indent[1] ? ' data-line' : ' data-indent') : '';
    const gap = block && /margin-top/i.test(m[0]) ? ' data-gap' : '';
    out += `<${name}${line}${gap}>`;
  }
  return out + text(src.slice(last));
}

/** Plain text from Universalis HTML (for labels and alt text): tags gone, common entities decoded. */
export function plainText(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// A psalm starts with its response, in italics, on a line of its own.
const RESPONSE = /^\s*<(div|p)[^>]*>\s*<i>([\s\S]*?)<\/i>\s*<\/\1>/i;

/**
 * One day's Universalis data → { day, readings, copyright }. Each reading is
 * { key, label, source, heading, html }; the psalm adds `response` and the
 * Gospel `acclamation` ({ source, html }). All HTML is already cleaned.
 * Universalis sometimes sends only a reading's reference (seen with the
 * psalm): it stays, with an empty `html`.
 */
export function toReadings(data) {
  if (!data || typeof data !== 'object') return { day: '', readings: [], copyright: '' };
  const readings = [];
  for (const [key, label] of READING_PARTS) {
    const r = data[key];
    if (!r || !(r.text || r.source)) continue;
    const reading = { key, label, source: plainText(r.source), heading: plainText(r.heading), html: cleanHtml(r.text) };
    if (key === 'Mass_Ps' && r.text) {
      const m = RESPONSE.exec(r.text);
      if (m) {
        reading.response = plainText(m[2]);
        reading.html = cleanHtml(r.text.slice(m[0].length));
      }
    }
    if (key === 'Mass_G' && data.Mass_GA?.text) {
      reading.acclamation = { source: plainText(data.Mass_GA.source), html: cleanHtml(data.Mass_GA.text) };
    }
    readings.push(reading);
  }
  const copyright = typeof data.copyright === 'object' ? data.copyright?.text : data.copyright;
  return { day: plainText(data.day), readings, copyright: plainText(copyright) };
}
