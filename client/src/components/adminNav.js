import { can } from '../lib/access.js';

/**
 * The admin sidebar, in groups. `need` is the lib/access.js permission a
 * page requires; `badge` names a count from api.navCounts().
 */
export const NAV_GROUPS = [
  {
    label: 'Main',
    items: [
      { to: '/admin/website', label: 'Parish Website', need: 'website' },
    ],
  },
  {
    label: 'Registry',
    items: [
      { to: '/admin', end: true, label: 'Dashboard', need: 'registry' },
      { to: '/admin/households', label: 'Households', need: 'registry', badge: 'pending', badgeLabel: 'awaiting verification' },
      { to: '/admin/members', label: 'Members', need: 'registry' },
      { to: '/admin/sacraments', label: 'Sacraments', need: 'registry', badge: 'sacraments', badgeLabel: 'claims to verify' },
      { to: '/admin/census', label: 'Census', need: 'census', badge: 'census', badgeLabel: 'online updates to review' },
      { to: '/admin/blood', label: 'Blood Types', need: 'registry' },
    ],
  },
  {
    label: 'Parish life',
    items: [
      { to: '/admin/requests', label: 'Requests', need: 'requests', badge: 'requests', badgeLabel: 'waiting' },
      { to: '/admin/ministries', label: 'Ministry rosters', need: 'registry' },
      { to: '/admin/organizations', label: 'Organization rosters', need: 'registry' },
    ],
  },
  {
    label: 'Data',
    items: [
      { to: '/admin/reports', label: 'Reports', need: 'reports' },
      { to: '/admin/exports', label: 'Exports', need: 'exports' },
    ],
  },
  {
    // Kept as the last group of the sidebar.
    label: 'Settings',
    collapsible: true,
    items: [
      { to: '/admin/settings', end: true, label: 'Parish Config' },
      { to: '/admin/settings/notifications', label: 'Notifications' },
      { to: '/admin/settings/organizations', label: 'Ministries & organizations', need: 'manageLists' },
      { to: '/admin/duplicates', label: 'Duplicates', need: 'registry', badge: 'duplicates', badgeLabel: 'groups to review' },
      { to: '/admin/settings/staff', label: 'Staff', adminOnly: true },
      { to: '/admin/settings/activity', label: 'Activity log', need: 'activity' },
      { to: '/admin/settings/trash', label: 'Trash', need: 'trash' },
    ],
  },
];

export function navAllowed(item, user) {
  if (item.adminOnly && !user?.isAdmin) return false;
  return !item.need || can(user, item.need);
}

/** The nav item a path belongs to (the longest matching link), or null. */
export function navItemFor(pathname) {
  let best = null;
  for (const g of NAV_GROUPS) {
    for (const item of g.items) {
      const match = item.end ? pathname === item.to || pathname === `${item.to}/` : pathname === item.to || pathname.startsWith(`${item.to}/`);
      if (match && (!best || item.to.length > best.to.length)) best = item;
    }
  }
  return best;
}

/** Sidebar badge numbers from api.navCounts(). */
export function navBadges(counts) {
  if (!counts) return {};
  const r = counts.requests;
  return {
    pending: counts.pending_households || 0,
    duplicates: counts.duplicate_groups || 0,
    sacraments: counts.sacraments_waiting || 0,
    census: counts.census_updates || 0,
    requests: r ? (r.certificates || 0) + (r.ready || 0) + (r.blood || 0) + (r.sacraments || 0) : 0,
  };
}
