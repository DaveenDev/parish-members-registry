// Small report/display helpers ported from server/src/lib/util.js.

export function initials(first, last) {
  return `${(first || '').charAt(0)}${(last || '').charAt(0)}`.toUpperCase() || '?';
}

export function memberFullName(m) {
  return [m.first_name, m.last_name].filter(Boolean).join(' ');
}

/**
 * "dELA cRUZ" → "Dela Cruz", "santos-reyes" → "Santos-Reyes", "o'neil" → "O'Neil".
 * Capitalizes the first letter of each word (and after a hyphen or apostrophe),
 * lowercases the rest, and tidies whitespace.
 */
export function toNameCase(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

const ROMAN_SUFFIX = /^(i{1,3}|iv|v|vi{1,3}|ix|x)$/i;

/** "jr" → "Jr.", "SR." → "Sr.", "iii" → "III"; anything else is name-cased. */
export function toSuffixCase(value) {
  const s = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  const bare = s.replace(/\.$/, '');
  if (/^jr$/i.test(bare)) return 'Jr.';
  if (/^sr$/i.test(bare)) return 'Sr.';
  if (ROMAN_SUFFIX.test(bare)) return bare.toUpperCase();
  return toNameCase(s);
}

/** "2026-10-01" → local midnight of that day, or null for a blank/invalid value. */
function localDay(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/**
 * True when timestamp `value` falls within the "from"/"to" date inputs
 * ("YYYY-MM-DD", either may be blank), both days included and read in local
 * time — so "to 1 Oct" keeps a registration made on the evening of 1 Oct.
 */
export function inDateRange(value, dateFrom, dateTo) {
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return false;
  const from = localDay(dateFrom);
  if (from && t < from.getTime()) return false;
  const to = localDay(dateTo);
  if (to && t >= new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1).getTime()) return false;
  return true;
}
