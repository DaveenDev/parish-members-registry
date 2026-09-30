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
