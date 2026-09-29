// Small report/display helpers ported from server/src/lib/util.js.

export function initials(first, last) {
  return `${(first || '').charAt(0)}${(last || '').charAt(0)}`.toUpperCase() || '?';
}

export function memberFullName(m) {
  return [m.first_name, m.last_name].filter(Boolean).join(' ');
}
