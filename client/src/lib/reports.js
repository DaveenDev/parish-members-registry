// Summaries behind Reports → Generate Report's newer report types. Pure,
// so they can be unit tested; api.generateReport fetches the rows.
import { SACRAMENTS } from '../constants.js';
import { inDateRange } from './util.js';
import { CERT_OPEN } from './requests.js';

const DAY = 86400000;
const round1 = (n) => Math.round(n * 10) / 10;

/** Per GKK: claimed and verified for each sacrament, and how many claims are still waiting. */
export function sacramentProgressRows(members) {
  const byGkk = new Map();
  for (const m of members) {
    const key = m.household_gkk || 'No GKK';
    if (!byGkk.has(key)) byGkk.set(key, { label: key, members: 0, ...Object.fromEntries(SACRAMENTS.map((s) => [s.key, { claimed: 0, verified: 0 }])) });
    const g = byGkk.get(key);
    g.members += 1;
    for (const s of SACRAMENTS) {
      if (m[s.has]) g[s.key].claimed += 1;
      if (m[s.has] && m[`${s.key}_verified`]) g[s.key].verified += 1;
    }
  }
  const rows = [...byGkk.values()].sort((a, b) => (a.label === 'No GKK') - (b.label === 'No GKK') || a.label.localeCompare(b.label));
  return rows.map((g) => ({
    ...g,
    waiting: SACRAMENTS.reduce((n, s) => n + g[s.key].claimed - g[s.key].verified, 0),
  }));
}

/**
 * Per certificate type: requests received in the date range, how many were
 * released, the average and longest days from request to release, and how
 * many are still open. `now` is for the age of open requests.
 */
export function turnaroundRows(requests, { dateFrom, dateTo, typeLabel = (k) => k, now = Date.now() } = {}) {
  const groups = new Map();
  for (const r of requests) {
    if (!inDateRange(r.created_at, dateFrom, dateTo)) continue;
    if (!groups.has(r.cert_type)) groups.set(r.cert_type, { label: typeLabel(r.cert_type), received: 0, released: 0, days: [], open: 0, oldestOpen: 0 });
    const g = groups.get(r.cert_type);
    g.received += 1;
    if (r.released_at) {
      g.released += 1;
      g.days.push((new Date(r.released_at) - new Date(r.created_at)) / DAY);
    } else if (CERT_OPEN.includes(r.status)) {
      g.open += 1;
      g.oldestOpen = Math.max(g.oldestOpen, Math.floor((now - new Date(r.created_at)) / DAY));
    }
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label)).map(({ days, ...g }) => ({
    ...g,
    avgDays: days.length ? round1(days.reduce((a, b) => a + b, 0) / days.length) : null,
    maxDays: days.length ? round1(Math.max(...days)) : null,
  }));
}

/** Households registered per month (YYYY-MM), oldest first, with how many of them are verified now. */
export function registrationsByMonth(households, { dateFrom, dateTo } = {}) {
  const months = new Map();
  for (const h of households) {
    if (!inDateRange(h.created_at, dateFrom, dateTo)) continue;
    const d = new Date(h.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!months.has(key)) months.set(key, { month: key, households: 0, members: 0, verified: 0 });
    const m = months.get(key);
    m.households += 1;
    m.members += Number(h.member_count) || 0;
    if (h.status === 'Verified') m.verified += 1;
  }
  return [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** "2026-03" as "March 2026". */
export function monthName(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Per GKK: households, families (0054; a household counts at least one),
 * households with more than one family, and members. `households` are
 * households_with_count rows; No GKK last.
 */
export function familiesByGkkRows(households) {
  const byGkk = new Map();
  for (const h of households) {
    const key = h.gkk || 'No GKK';
    if (!byGkk.has(key)) byGkk.set(key, { label: key, households: 0, families: 0, multi: 0, members: 0 });
    const g = byGkk.get(key);
    const families = Math.max(1, Number(h.family_count) || 1);
    g.households += 1;
    g.families += families;
    if (families > 1) g.multi += 1;
    g.members += Number(h.member_count) || 0;
  }
  return [...byGkk.values()].sort((a, b) => (a.label === 'No GKK') - (b.label === 'No GKK') || a.label.localeCompare(b.label));
}
