import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../AuthContext.jsx';
import { api } from '../../api.js';
import { ThemePickerPopover } from '../../components/ThemePicker.jsx';
import { useAdminColorMode } from '../../ThemeContext.jsx';
import { PageHeader, PageBody, EmptyState, LoadingState } from '../../components/admin.jsx';
import CommandPalette, { useCommandPaletteShortcut } from '../../components/CommandPalette.jsx';
import IdleSignOut from '../../components/IdleSignOut.jsx';
import NotificationBell, { useStaffNotifications } from '../../components/NotificationBell.jsx';
import { NAV_GROUPS, navAllowed, navCollapsible, navItemFor, navBadges, navLabel } from '../../components/adminNav.js';
import { accessLabel } from '../../lib/access.js';
import { keepServiceWorker } from '../../lib/push.js';

// Lets a phone add the admin panel to its Home Screen (needed on iPhone for
// notifications). Only on admin pages, so the public website isn't offered
// as an app.
const APP_LINKS = [
  ['link', { rel: 'manifest', href: '/admin.webmanifest' }],
  ['link', { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' }],
  ['meta', { name: 'apple-mobile-web-app-capable', content: 'yes' }],
  ['meta', { name: 'apple-mobile-web-app-title', content: 'Parish Admin' }],
  ['meta', { name: 'theme-color', content: '#1a2b4a' }],
];

function useAdminAppLinks() {
  useEffect(() => {
    const added = APP_LINKS.map(([tag, attrs]) => {
      const el = document.createElement(tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      document.head.appendChild(el);
      return el;
    });
    return () => added.forEach((el) => el.remove());
  }, []);
}

/** A tapped phone notification, when the admin is already open: go to its page here. */
function useNotificationTaps(navigate) {
  useEffect(() => {
    keepServiceWorker();
    if (!('serviceWorker' in navigator)) return undefined;
    const onMessage = (e) => {
      if (e.data?.type === 'open' && typeof e.data.url === 'string' && e.data.url.startsWith('/admin')) navigate(e.data.url);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate]);
}

function NavItem({ to, end, label, count, badgeLabel, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `relative flex items-center gap-3 pl-7 pr-3.5 py-[5px] rounded-lg font-semibold text-[14px] leading-snug text-left transition ${
          isActive ? 'bg-white/12 text-white' : 'text-white/70 hover:text-white hover:bg-white/5'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded" style={{ background: isActive ? 'var(--p-gold-light)' : 'transparent' }} />
          {label}
          {count > 0 && (
            <span className="ml-auto min-w-[22px] px-1.5 py-px rounded-full bg-[var(--p-gold-light)] text-parish-navy text-[11.5px] font-bold text-center" aria-label={`${count} ${badgeLabel || 'waiting'}`}>
              {count > 99 ? '99+' : count}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  useAdminColorMode();
  const [parish, setParish] = useState(null);

  const [navCounts, setNavCounts] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const openSearch = useCallback(() => { setDrawerOpen(false); setSearchOpen(true); }, []);
  useCommandPaletteShortcut(openSearch);

  useEffect(() => { api.getSettings().then((r) => setParish(r.settings)).catch(() => {}); }, []);

  // What's waiting, for the sidebar badges: refreshed on every page change
  // and whenever a page changes something counted (refreshNavCounts). Fails
  // quietly, leaving the badges off.
  const refreshNavCounts = useCallback(() => {
    api.navCounts().then(setNavCounts).catch(() => {});
  }, []);
  useEffect(refreshNavCounts, [location.pathname, refreshNavCounts]);
  const bell = useStaffNotifications({ onNew: refreshNavCounts });
  useAdminAppLinks();
  useNotificationTaps(navigate);
  const badges = navBadges(navCounts);
  const requestCounts = navCounts?.requests || null;
  const current = navItemFor(location.pathname);
  const allowed = !current || navAllowed(current, user);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e) => e.key === 'Escape' && setDrawerOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  function onLogout() {
    logout();
    navigate('/admin/login', { replace: true });
  }
  const onIdle = useCallback(() => {
    logout();
    navigate('/admin/login', { replace: true, state: { reason: 'idle' } });
  }, [logout, navigate]);

  const nameInitials = (user?.name || '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  const sidebar = (
    <>
      <div className="px-5 py-[22px] flex items-center gap-3 border-b border-white/10">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-none text-[var(--p-gold-light)] overflow-hidden ${parish?.logo ? 'bg-parish-surface p-1' : 'bg-[var(--p-gold-light)]/[.16]'}`}>
          {parish?.logo ? (
            <img src={parish.logo} alt={`${parish.name || 'Parish'} logo`} className="w-full h-full object-contain" />
          ) : (
            <svg viewBox="0 0 40 40" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden><path d="M20 6l1.9 5.7h6l-4.9 3.5 1.9 5.7-4.9-3.5-4.9 3.5 1.9-5.7-4.9-3.5h6z" /><path d="M20 24v9M15.5 28.5h9" /></svg>
          )}
        </div>
        <div className="min-w-0">
          <div className="font-serif text-[18px] font-semibold leading-tight truncate">{parish?.name || 'Parish Registry'}</div>
          <div className="text-[11px] tracking-[.1em] uppercase text-[var(--p-gold-light)]/85">Members Registry</div>
        </div>
      </div>

      <div className="px-3 pt-3 flex gap-2">
        <button
          type="button" onClick={openSearch}
          className="flex-1 min-w-0 appearance-none cursor-pointer flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-white/75 text-[13.5px] font-semibold text-left"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <span className="flex-1">Search</span>
          <kbd className={`text-[10.5px] font-semibold text-white/55 border border-white/20 rounded px-1.5 py-px ${bell.available ? 'lg:hidden' : ''}`}>Ctrl K</kbd>
        </button>
        {/* On phones the bell is in the top bar instead. */}
        <NotificationBell bell={bell} dark className="hidden lg:flex" />
      </div>

      <nav className="px-3 py-1.5 flex flex-col flex-1 overflow-auto" aria-label="Admin sections">
        {NAV_GROUPS.map((g) => {
          const items = g.items.filter((n) => navAllowed(n, user)).map((n) => ({ ...n, label: navLabel(n, user) }));
          if (!items.length) return null;
          if (navCollapsible(g, user)) {
            // Collapsed by default; opens on its own while one of its pages is showing.
            const hasCurrent = items.some((n) => n === current || n.to === current?.to);
            const open = openGroups[g.label] ?? hasCurrent;
            const groupBadge = items.reduce((s, n) => s + (n.badge ? badges[n.badge] || 0 : 0), 0);
            const toggle = () => setOpenGroups((o) => ({ ...o, [g.label]: !open }));
            return (
              <div key={g.label} role="group" aria-label={g.label} className="flex flex-col">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={toggle}
                  className="appearance-none border-none bg-transparent cursor-pointer mx-3.5 mt-2 mb-px flex items-center gap-1.5 text-left font-bold text-[10px] tracking-[.15em] uppercase text-[var(--p-gold-light)]/70 hover:text-[var(--p-gold-light)]"
                >
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}><path d="M9 5l7 7-7 7" /></svg>
                  {g.label}
                  {!open && groupBadge > 0 && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--p-gold-light)]" aria-label={`${groupBadge} waiting`} />}
                </button>
                {open && items.map((n) => <NavItem key={n.to} {...n} count={n.badge ? badges[n.badge] : 0} />)}
              </div>
            );
          }
          return (
            <div key={g.label} role="group" aria-label={g.label} className="flex flex-col">
              <div className="mx-3.5 mt-2 mb-px font-bold text-[10px] tracking-[.15em] uppercase text-[var(--p-gold-light)]/70" aria-hidden>{g.label}</div>
              {items.map((n) => <NavItem key={n.to} {...n} count={n.badge ? badges[n.badge] : 0} />)}
            </div>
          );
        })}
      </nav>

      <div className="px-4 py-2.5">
        <ThemePickerPopover align="left" placement="up" dark showMode />
      </div>

      <div className="px-4 py-3.5 border-t border-white/10 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-[var(--p-gold-light)] text-parish-navy flex items-center justify-center font-bold text-[14px] flex-none" aria-hidden>{nameInitials}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis">{user?.name}</div>
          <div className="text-[11.5px] text-white/60 truncate" title={user?.access && user.access !== 'full' ? accessLabel(user.access) : undefined}>
            {user?.role}{user?.access && user.access !== 'full' ? ` · ${accessLabel(user.access)}` : ''}
          </div>
        </div>
        <button onClick={onLogout} title="Sign out" aria-label="Sign out" className="appearance-none border-none bg-white/10 cursor-pointer text-white w-8 h-8 rounded-lg flex items-center justify-center flex-none">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></svg>
        </button>
      </div>

      <a
        href="https://daveendev.vercel.app/"
        target="_blank"
        rel="noopener noreferrer"
        className="px-4 py-2 text-center text-[10.5px] font-medium text-white/40 hover:text-white/70 transition"
      >
        Built For Free by DaveenDev
      </a>
    </>
  );

  const sidebarBg = { background: 'linear-gradient(180deg,var(--p-sidebar-a),var(--p-sidebar-b))' };

  return (
    <div className="flex min-h-screen font-sans">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-none w-[208px] text-white flex-col sticky top-0 h-screen" style={sidebarBg}>
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-[70] flex" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-parish-scrim/50 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="relative w-[248px] max-w-[82vw] text-white flex flex-col h-full shadow-2xl animate-fadeUp" style={sidebarBg}>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 flex flex-col bg-parish-bg">
        {/* Mobile top bar */}
        <div className="lg:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-parish-border bg-parish-bg/95 backdrop-blur-md">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={drawerOpen}
            className="appearance-none border-[1.5px] border-parish-borderSoft bg-parish-surface cursor-pointer w-10 h-10 rounded-xl flex items-center justify-center text-parish-navy flex-none"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
          {parish?.logo && (
            <img src={parish.logo} alt="" className="w-[30px] h-[30px] object-contain rounded-md bg-parish-surface flex-none" />
          )}
          <span className="font-serif text-[19px] font-semibold text-parish-navy truncate flex-1 min-w-0">{parish?.name || 'Parish Registry'}</span>
          <NotificationBell bell={bell} />
        </div>

        {/* Pages that change parish settings (logo, name) push them back here so the sidebar updates without a reload. */}
        {/* Each admin page loads on first visit (App.jsx): the sidebar stays while it does. */}
        {allowed ? (
          <Suspense fallback={<LoadingState label="Loading the page…" />}>
            <Outlet context={{ parish, setParish, requestCounts, navCounts, refreshRequestCounts: refreshNavCounts, refreshNavCounts, bell }} />
          </Suspense>
        ) : (
          <>
            <PageHeader title={navLabel(current, user)} />
            <PageBody>
              <EmptyState title="Not available for your account" subtitle={`Your access level is ${accessLabel(user?.access)}. Ask a staff admin if you need this page.`} />
            </PageBody>
          </>
        )}
      </main>
      {searchOpen && <CommandPalette onClose={() => setSearchOpen(false)} />}
      <IdleSignOut onSignOut={onIdle} />
    </div>
  );
}
