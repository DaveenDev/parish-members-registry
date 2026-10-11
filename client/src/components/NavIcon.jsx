import React from 'react';

// Line icons for the admin sections, by route, for the icon rail that stands
// in for the sidebar on tablets and small laptops (AdminLayout). 24px grid,
// drawn with the current colour.
const PATHS = {
  '/admin/website': <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" /></>,
  '/admin/census': <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" /></>,
  '/admin': <><rect x="3.5" y="3.5" width="7" height="8" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.5" /><rect x="3.5" y="14.5" width="7" height="6" rx="1.5" /></>,
  '/admin/households': <><path d="M3.5 11L12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5h4v5" /></>,
  '/admin/members': <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .7 3.2 2.4 3.5 5.2" /></>,
  '/admin/sacraments': <><path d="M12 3v18M7 8h10" /><path d="M5 21h14" /></>,
  '/admin/blood': <path d="M12 3.5c3.2 4 6 7.3 6 10.5a6 6 0 0 1-12 0c0-3.2 2.8-6.5 6-10.5z" />,
  '/admin/requests': <><path d="M3.5 13.5l2.7-8a2 2 0 0 1 1.9-1.5h7.8a2 2 0 0 1 1.9 1.5l2.7 8V19a1.5 1.5 0 0 1-1.5 1.5h-14A1.5 1.5 0 0 1 3.5 19z" /><path d="M3.5 13.5H8l1.5 2.5h5l1.5-2.5h4.5" /></>,
  '/admin/ministries': <><path d="M4 6h16M4 12h16M4 18h10" /></>,
  '/admin/organizations': <><circle cx="12" cy="7" r="3" /><circle cx="5" cy="15" r="2.5" /><circle cx="19" cy="15" r="2.5" /><path d="M8.5 20.5c.5-2.6 1.8-4 3.5-4s3 1.4 3.5 4" /></>,
  '/admin/org-structure': <><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><path d="M12 8v4M6 16v-4h12v4" /></>,
  '/admin/reports': <><path d="M4 20V4M4 20h16" /><path d="M8.5 16v-5M13 16V8M17.5 16v-3" /></>,
  '/admin/exports': <><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" /><path d="M4.5 15.5V19a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-3.5" /></>,
  '/admin/settings': <><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0" /><circle cx="16" cy="6" r="2" /><circle cx="10" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>,
  '/admin/settings/notifications': <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  '/admin/settings/organizations': <><path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3a1.4 1.4 0 0 1 0 2l-6.7 6.7a1.4 1.4 0 0 1-2 0z" /><circle cx="8" cy="8" r="1.4" /></>,
  '/admin/settings/staff': <><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z" /><path d="M9 12l2 2 4-4" /></>,
  '/admin/settings/activity': <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  '/admin/settings/trash': <><path d="M4 7h16M9.5 7V4.5h5V7" /><path d="M6 7l1 13h10l1-13M10 11v6M14 11v6" /></>,
};

const DOT = <circle cx="12" cy="12" r="3" />;

export default function NavIcon({ to, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {PATHS[to] || DOT}
    </svg>
  );
}
