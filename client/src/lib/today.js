// The Dashboard's "Today" list: what's waiting for staff right now (households
// to verify first), drawn from the sidebar counts, the open census, events and bulletins. Pure, so
// it can be unit tested. Each item: { key, label, detail, n, to, tone }.
import { can } from './access.js';
import { addDays, sundayOf } from './website.js';

export function todayItems({ user, counts, census, events = [], bulletins = [], today }) {
  const items = [];
  const r = counts?.requests;
  const push = (item) => { if (item.n || item.always) items.push(item); };

  if (can(user, 'registry') && counts?.pending_households) {
    push({ key: 'households', label: 'Households awaiting verification', detail: 'New registrations: check the details against the family', n: counts.pending_households, to: '/admin/households?status=Pending', tone: 'gold' });
  }
  if (can(user, 'requests') && r) {
    push({ key: 'ready', label: 'Certificates ready for pick-up', detail: 'Let the requester know, then mark them released', n: r.ready, to: '/admin/requests?view=ready', tone: 'gold' });
    push({ key: 'certs', label: 'Certificate requests to prepare', n: r.certificates, to: '/admin/requests', tone: 'blue' });
    push({ key: 'blood', label: 'Open blood calls', detail: 'Someone needs blood: contact compatible donors', n: r.blood, to: '/admin/requests?tab=blood', tone: 'red' });
    push({ key: 'sacrament-requests', label: 'New OCIA and Anointing requests', detail: 'Call or text the family; urgent anointing requests are listed first', n: r.sacraments, to: '/admin/requests?tab=sacraments', tone: 'blue' });
  }
  if (can(user, 'census') && counts?.census_updates) {
    push({ key: 'census-updates', label: 'Census updates from families to review', n: counts.census_updates, to: '/admin/census?tab=updates', tone: 'gold' });
  }
  if (can(user, 'census') && census) {
    const { label, counts: c } = census;
    const totalHh = (c['Not started'] || 0) + (c['Partly confirmed'] || 0) + (c.Confirmed || 0);
    if (totalHh) {
      items.push({
        key: 'census', label: `${label}: ${c.Confirmed || 0} of ${totalHh} households confirmed`,
        detail: `${c['Partly confirmed'] || 0} partly done · ${c['Not started'] || 0} not started`,
        to: '/admin/census', tone: 'green', progress: (c.Confirmed || 0) / totalHh,
      });
    }
  }
  if (can(user, 'registry') && counts?.sacraments_waiting) {
    push({ key: 'sacraments', label: 'Sacrament claims to verify', detail: 'Check them against certificates or the parish register', n: counts.sacraments_waiting, to: '/admin/sacraments', tone: 'blue' });
  }
  if (can(user, 'website') && today) {
    const weekEnd = addDays(today, 6);
    const thisWeek = events.filter((e) => e.published !== false && e.start_date <= weekEnd && (e.end_date || e.start_date) >= today);
    if (thisWeek.length) {
      items.push({
        key: 'events', label: `${thisWeek.length} event(s) in the next 7 days`,
        detail: thisWeek.slice(0, 3).map((e) => e.title).join(' · '), to: '/admin/website?tab=events', tone: 'green',
      });
    }
    const sunday = sundayOf(today);
    const has = bulletins.some((b) => b.week_of === sunday && b.published);
    if (!has && bulletins.length) {
      items.push({ key: 'bulletin', label: 'This week’s bulletin isn’t published yet', to: '/admin/website?tab=bulletin', tone: 'gold' });
    }
  }
  return items;
}
