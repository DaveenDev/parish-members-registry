// Turns the raw counts from the admin_dashboard_stats / admin_report_stats
// database functions into what the Dashboard and Reports pages draw: labels,
// bar heights and widths, percentages. Pure, so it can be unit tested.
// Member figures leave out members who moved away or died (the census rule);
// the database applies it.

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BLOOD_ORDER = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const GROUP_COLORS = ['#34589c', '#c39b4e', '#2f7a52', '#a13d29', '#7a6a3e', '#8a5fb0'];

const num = (v) => Number(v) || 0;

/** Members-page age filter for a Dashboard bucket label: "20-34" as is, "65+" as "65-200". */
function ageFilterFor(label) {
  const s = String(label || '');
  if (/^\d+-\d+$/.test(s)) return s;
  const plus = /^(\d+)\+$/.exec(s);
  return plus ? `${plus[1]}-200` : null;
}
const pct = (n, of) => `${Math.round((n / Math.max(1, of)) * 100)}%`;

/** Bar heights for a vertical chart: the tallest is 100%, none shorter than 6%. */
function withHeights(items) {
  const max = Math.max(1, ...items.map((b) => b.n));
  return items.map((b) => ({ ...b, h: `${Math.max(6, Math.round((b.n / max) * 100))}%` }));
}

/** Bar widths for a horizontal chart, relative to the largest. */
function withWidths(items) {
  const max = Math.max(1, ...items.map((b) => b.n));
  return items.map((b) => ({ ...b, w: pct(b.n, max) }));
}

export function shapeDashboard(raw = {}) {
  const households = num(raw.households);
  const verified = num(raw.verified);
  const pending = num(raw.pending);
  const sac = raw.sacraments || {};

  return {
    statCards: [
      { label: 'Households', value: households, note: `${verified} verified · ${pending} pending`, accent: '#34589c', to: '/admin/households?status=All' },
      { label: 'Members', value: num(raw.members), note: 'across all households', accent: '#c39b4e', to: '/admin/members' },
      {
        label: 'Active Catholics',
        value: num(raw.active),
        note: `${num(raw.inactive)} inactive · ${num(raw.unassessed)} not yet assessed`,
        accent: '#2f7a52',
        to: '/admin/members?membership=Active',
      },
      { label: 'Verified', value: verified, note: 'households confirmed', accent: '#2f7a52', to: '/admin/households?status=Verified' },
      { label: 'Pending', value: pending, note: 'awaiting verification', accent: '#a13d29', to: '/admin/households?status=Pending' },
      { label: 'GKKs', value: num(raw.gkks), note: 'basic ecclesial communities', accent: '#7a6a3e', to: '/admin/settings?tab=gkk' },
    ],
    regMonths: withHeights((raw.reg_months || []).map((m) => ({
      label: MONTH_NAMES[Number(String(m.month).slice(5, 7)) - 1] || m.month,
      n: num(m.n),
    }))),
    ageBuckets: withHeights((raw.age_buckets || []).map((b) => {
      const age = ageFilterFor(b.label);
      return { label: b.label, n: num(b.n), to: age ? `/admin/members?age=${age}` : null };
    })),
    gkkBreak: withWidths((raw.by_gkk || []).map((g) => ({ label: g.label, n: num(g.n), to: `/admin/households?status=All&gkk=${encodeURIComponent(g.label)}` }))),
    ministryBreak: withWidths((raw.top_groups || []).map((g) => ({ label: g.label, n: num(g.n), to: `/admin/members?ministry=${encodeURIComponent(g.label)}` }))),
    sacStats: [
      { label: 'Baptism', n: num(sac.baptism), to: '/admin/sacraments?baptism=Yes' },
      { label: 'First Communion', n: num(sac.communion), to: '/admin/sacraments?communion=Yes' },
      { label: 'Confirmation', n: num(sac.confirmation), to: '/admin/sacraments?confirmation=Yes' },
      { label: 'Matrimony', n: num(sac.matrimony), to: '/admin/sacraments?matrimony=Yes' },
    ],
    pendingCount: pending,
    duplicateGroups: num(raw.duplicate_groups),
  };
}

export function shapeReport(raw = {}) {
  const members = num(raw.members);
  const sac = raw.sacraments || {};
  const blood = raw.blood || {};

  const regByGkk = (raw.by_gkk || []).map((g) => {
    const v = num(g.verified);
    const p = num(g.pending);
    return { label: g.label, verified: v, pending: p, vw: pct(v, v + p), pw: pct(p, v + p) };
  });

  const sacCompletion = [['Baptism', sac.baptism], ['First Communion', sac.communion], ['Confirmation', sac.confirmation], ['Matrimony', sac.matrimony]]
    .map(([label, n]) => ({ label, n: num(n), missing: members - num(n), w: pct(num(n), members) }));

  const participation = (raw.participation || []).map((g, i) => ({
    label: g.label, n: num(g.n), w: pct(num(g.n), members), color: GROUP_COLORS[i % GROUP_COLORS.length],
  }));

  return {
    totalHH: num(raw.households),
    totalVerified: num(raw.verified),
    totalPending: num(raw.pending),
    totalMembers: members,
    regByGkk,
    sacCompletion,
    participation,
    anyVolunteer: members ? Math.round((num(raw.any_group) / members) * 100) : 0,
    bloodCounts: BLOOD_ORDER.filter((t) => num(blood[t]) > 0).map((label) => ({ label, n: num(blood[label]) })),
    unknownBlood: num(raw.blood_unknown),
    gkkNames: regByGkk.map((g) => g.label),
  };
}
