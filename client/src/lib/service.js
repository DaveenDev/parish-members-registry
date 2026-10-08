// A member's past service (member_service, 0071_member_service_history.sql):
// the ministries, organizations and parish / GKK responsibilities they used
// to be in, by year. Removing one from a member records it automatically;
// staff add older service by hand.

export const SERVICE_KINDS = [
  { key: 'ministry', label: 'Ministry' },
  { key: 'organization', label: 'Organization' },
  { key: 'parish', label: 'Parish position' },
  { key: 'gkk', label: 'GKK responsibility' },
];

export const serviceKindLabel = (key) => SERVICE_KINDS.find((k) => k.key === key)?.label || key;

export const MIN_YEAR = 1900;
export const MAX_YEAR = 2100;

/** A year field's value ('' / '2015' / 2015) as a number, or null when blank. */
export function toYear(value) {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  return Number(value);
}

/** "2015–2019", "Since 2015", "Until 2026", or '' with no years. */
export function yearsText({ from_year: from, to_year: to } = {}) {
  if (from && to) return from === to ? String(from) : `${from}–${to}`;
  if (from) return `Since ${from}`;
  if (to) return `Until ${to}`;
  return '';
}

/** Most recent first: by last year, then first year (no years last), then name. */
export function sortService(rows) {
  const year = (v) => (v == null ? -Infinity : v);
  return [...(rows || [])].sort((a, b) =>
    year(b.to_year ?? b.from_year) - year(a.to_year ?? a.from_year)
    || year(b.from_year) - year(a.from_year)
    || String(a.name).localeCompare(String(b.name)));
}

/** What's wrong with an entry before it's saved (the database checks the same), or ''. */
export function serviceError({ kind, name, from_year, to_year }) {
  if (!SERVICE_KINDS.some((k) => k.key === kind)) return 'Choose what kind of service it was';
  if (!String(name || '').trim()) return 'Choose what they served in';
  const from = toYear(from_year);
  const to = toYear(to_year);
  for (const y of [from, to]) {
    if (y !== null && (!Number.isInteger(y) || y < MIN_YEAR || y > MAX_YEAR)) return `Years are between ${MIN_YEAR} and ${MAX_YEAR}`;
  }
  if (from !== null && to !== null && from > to) return 'The first year comes before the last year';
  return '';
}
