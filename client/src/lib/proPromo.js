// The PRO notes in the staff admin panel: which tip card or showcase to show,
// to whom and when. Pure rules, no browser calls, so they're tested
// (client/test/proPromo.test.js). The components (components/promo) read the
// browser's state, pass it in here and show what comes back. To tune or
// remove the notes, this file and AdminLayout.jsx are all that change.
//
// Never on the public website, registration, census, prints or exports: the
// notes render only inside the admin layout.

// Links out, in one place. Prices live on the developer's page so they can
// change without a release; the app never reports who saw or clicked what.
export const PRO_URL = 'https://daveendev.vercel.app/pro';
export const PRO_DEMO_URL = 'https://daveendev.vercel.app/pro#demo';
export const PRO_CONTACT_EMAIL = 'daveendev07@gmail.com';

/**
 * The gate: the PRO notes show only where VITE_PRO_PROMO is "on" (a Vercel
 * environment variable, read when the site is built). Off or unset, an
 * existing parish sees nothing: no cards, no showcase, no PRO modules page.
 * Turn it on for the demo site first, then for a parish once PRO is ready.
 * Changing it needs a redeploy, and it is not a secret: it is built into
 * the page like the other VITE_ settings.
 */
export const promoEnabled = (value) => /^(on|true|1|yes)$/i.test(String(value ?? '').trim());

export const DAY_MS = 86400000;
export const QUIET_DAYS = 21; // nothing for a new account's first 21 days
export const HIDE_DAYS = 30; // "Not now", ✕ and the showcase's buttons
export const HIDE_ALL_DAYS = 90; // "Don't show PRO tips"
export const MAX_TIPS_PER_DAY = 3;

export const SHOWCASE_KEY = 'pro-showcase';
export const ALL_TIPS_KEY = 'pro-tips-all';
export const tipKey = (id) => `pro-tip:${id}`;

/** The PRO modules, in the order they're offered. `folder` is the module's folder in client/src/pro. */
export const MODULES = [
  { id: 'registers', no: '01', name: 'Registers & certificates', short: 'Print from the Libro', text: 'Keep the Baptism, Confirmation, Marriage and Burial books in the app, find an entry by Book, Page and No., and print the certificate with the parish template.' },
  { id: 'intentions', no: '02', name: 'Mass intentions', short: 'Counter entry and the list', text: 'Take Mass intentions at the counter and print the list for each Mass.' },
  { id: 'sms', no: '03', name: 'Texts (SMS)', short: 'To parishioners, GKKs, donors', text: 'Text every household, a GKK or every compatible blood donor at once, from the page you are already on.' },
  { id: 'bookings', no: '04', name: 'Online bookings', short: 'Families book dates online', text: 'Let families book baptism and other sacrament dates online, and see the bookings in one list.' },
  { id: 'cashbook', no: '05', name: 'Cashbook', short: 'Reports for the Finance Council', text: 'Record the parish’s income and expenses, and print a monthly financial report for the Finance Council.' },
];
export const moduleById = (id) => MODULES.find((m) => m.id === id) || null;

/**
 * The tip cards. `path` is the admin page; `tab` the tab the card belongs to
 * (a page's first tab is also what it shows with no ?tab=); `area` is where
 * Website & requests accounts may see it (only the 'requests' ones).
 */
export const TIPS = [
  { id: 'registers-certificates', module: 'registers', area: 'requests', path: '/admin/requests', tab: 'certificates', title: 'Print the certificate straight from the register', text: 'Find the Book/Page/No. entry and print it with the parish template.' },
  { id: 'registers-sacraments', module: 'registers', area: 'registry', path: '/admin/sacraments', title: 'Keep the Baptism, Confirmation, Marriage and Burial books in the app', text: 'Record each entry once and find it again by Book, Page and No.' },
  { id: 'intentions-mass', module: 'intentions', area: 'website', path: '/admin/website', tab: 'mass', title: 'Take Mass intentions and print the list for each Mass', text: 'Counter entry for the office, and a clean list for the priest.' },
  { id: 'sms-blood', module: 'sms', area: 'requests', path: '/admin/requests', tab: 'blood', title: 'Text every compatible donor at once', text: 'When a blood call comes in, reach the donors who can help in one step.' },
  { id: 'sms-announcements', module: 'sms', area: 'website', path: '/admin/website', tab: 'announcements', title: 'Send the announcement by text to every household', text: 'Reach parishioners who don’t open the website.' },
  { id: 'bookings-guides', module: 'bookings', area: 'website', path: '/admin/website', tab: 'sacraments', title: 'Let families book baptism dates online', text: 'Families pick a date from the guide, and the office sees the bookings in one list.' },
  { id: 'cashbook-reports', module: 'cashbook', area: 'reports', path: '/admin/reports', title: 'A monthly financial report for the Finance Council', text: 'Record the parish’s cash once and print the report each month.' },
];
export const tipById = (id) => TIPS.find((t) => t.id === id) || null;

/** The page a card sits on, as the key for "once per page per session". */
export const pageKey = (pathname, tab) => `${trimPath(pathname)}${tab ? `?${tab}` : ''}`;
const trimPath = (p) => (p || '').replace(/\/+$/, '') || '/';

// Who sees what (the plan's table). Demo signs in as 'full' on the demo site
// (AuthContext) and 'demo' is listed too, for safety.
const AUDIENCE = {
  full: { tips: 'all', showcase: true },
  demo: { tips: 'all', showcase: true },
  clergy: { tips: 'all', showcase: true },
  website: { tips: 'requests', showcase: false },
};
const NOBODY = { tips: false, showcase: false };

/** What an access level may see: `tips` is 'all', 'requests' (only the Requests pages) or false. */
export const audienceFor = (access) => AUDIENCE[access] || NOBODY;

/** Whether an account may open the in-app PRO page (and so see its sidebar item). */
export const seesPro = (access) => !!audienceFor(access).tips;

/** Whole days since the account was created, or null when that isn't known. */
export function accountAgeDays(createdAt, now) {
  const t = Date.parse(createdAt);
  return Number.isFinite(t) ? Math.floor((now - t) / DAY_MS) : null;
}

/** A hidden-until time for `days` from now. */
export const hiddenUntil = (now, days) => now + days * DAY_MS;

/** True while `key` is hidden: `dismissals` is { key: hidden-until in ms }. Hidden up to, not including, the day it ends. */
export const isHidden = (dismissals, key, now) => (dismissals?.[key] ?? 0) > now;

// A new account gets a quiet start, so setup and training aren't interrupted.
// The shared demo login is exempt: it exists for people trying the app.
function tooNew(ctx) {
  if (ctx.isDemo) return false;
  const age = ctx.accountAgeDays;
  return age == null || age < QUIET_DAYS;
}

/** The modules this parish doesn't have yet, in order. */
export const missingModules = (owned = []) => MODULES.filter((m) => !owned.includes(m.id));

/**
 * The tip card for this page, or null.
 *   ctx: { pathname, tab, access, isDemo, accountAgeDays, owned: [module ids],
 *          dismissals, now, shownPages: [pageKey], shownToday, lastShown: { tipId: ms } }
 * One card at a time, at most 3 a day, once per page per session; hidden
 * cards and "Don't show PRO tips" are respected; PRO parishes only see cards
 * for modules they don't have.
 */
export function pickTip(ctx) {
  if (ctx.enabled === false) return null;
  const who = audienceFor(ctx.access);
  if (!who.tips || tooNew(ctx)) return null;
  if (isHidden(ctx.dismissals, ALL_TIPS_KEY, ctx.now)) return null;
  if ((ctx.shownToday || 0) >= MAX_TIPS_PER_DAY) return null;
  const path = trimPath(ctx.pathname);
  if (ctx.shownPages?.includes(pageKey(path, ctx.tab))) return null;

  let candidates;
  if (path === '/admin') {
    // The Dashboard shows one of the others; Website & requests never sees it there.
    if (who.tips !== 'all') return null;
    candidates = TIPS;
  } else {
    // A page's first tab is its default, so no ?tab= means that tab.
    const here = TIPS.filter((t) => t.path === path);
    const firstTab = { '/admin/requests': 'certificates', '/admin/website': 'announcements' }[path];
    const tab = ctx.tab || firstTab;
    candidates = here.filter((t) => !t.tab || t.tab === tab);
  }
  const ok = candidates.filter((t) => (who.tips === 'all' || t.area === who.tips)
    && !ctx.owned?.includes(t.module) && !isHidden(ctx.dismissals, tipKey(t.id), ctx.now));
  if (!ok.length) return null;
  // The one shown least recently goes first; never shown counts as longest ago.
  return [...ok].sort((a, b) => (ctx.lastShown?.[a.id] || 0) - (ctx.lastShown?.[b.id] || 0))[0];
}

/**
 * The monthly showcase's three modules on the Dashboard, or null.
 *   ctx: { pathname, access, isDemo, accountAgeDays, owned, dismissals, now, shownThisSession }
 * Not for PRO parishes, nor read only, GKK leader or Website & requests
 * accounts; not within 30 days of hiding it, nor twice in a session.
 */
export function pickShowcase(ctx) {
  if (ctx.enabled === false) return null;
  if (trimPath(ctx.pathname) !== '/admin') return null;
  if (!audienceFor(ctx.access).showcase || tooNew(ctx)) return null;
  if (ctx.owned?.length) return null;
  if (ctx.shownThisSession || isHidden(ctx.dismissals, SHOWCASE_KEY, ctx.now)) return null;
  const three = missingModules(ctx.owned).slice(0, 3);
  return three.length ? three : null;
}

/** The "Ask about PRO" email: the parish's name and the ticked modules already in it. */
export function askMailto(parishName, moduleIds) {
  const names = MODULES.filter((m) => moduleIds.includes(m.id)).map((m) => `- ${m.name}`);
  const body = [
    'Hello, we would like to know more about PRO for our parish.',
    '',
    `Parish: ${parishName || '(please add)'}`,
    names.length ? `Modules we are interested in:\n${names.join('\n')}` : 'Modules we are interested in: (none picked yet)',
  ].join('\n');
  return `mailto:${PRO_CONTACT_EMAIL}?subject=${encodeURIComponent(`PRO for ${parishName || 'our parish'}`)}&body=${encodeURIComponent(body)}`;
}
