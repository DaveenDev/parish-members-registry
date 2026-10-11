import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../AuthContext.jsx';
import { api } from '../../api.js';
import { ThemePickerPopover } from '../../components/ThemePicker.jsx';
import { useAdminColorMode } from '../../ThemeContext.jsx';
import { PageHeader, PageBody, EmptyState, LoadingState, Panel } from '../../components/admin.jsx';
import { PrimaryButton } from '../../components/ui.jsx';
import CommandPalette, { useCommandPaletteShortcut } from '../../components/CommandPalette.jsx';
import IdleSignOut from '../../components/IdleSignOut.jsx';
import NotificationBell, { useStaffNotifications } from '../../components/NotificationBell.jsx';
import { NAV_GROUPS, censusMenuShown, navAllowed, navCollapsible, navItemFor, navBadges, navLabel } from '../../components/adminNav.js';
import { accessLabel } from '../../lib/access.js';
import { keepServiceWorker } from '../../lib/push.js';
import ChurchEmblem from '../../components/ChurchEmblem.jsx';
import NavIcon from '../../components/NavIcon.jsx';

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

/**
 * The sidebar folded to an icon rail, for tablets and small laptops (md up to
 * 1400px), so the page keeps the width a table or chart needs. Each section
 * is an icon with its name in a tooltip; `onExpand` opens the full menu over
 * the page. `groups` is the visible nav, as the full sidebar shows it.
 */
function NavRail({ groups, badges, bell, nameInitials, userName, onExpand, onSearch, onLogout }) {
  const [tip, setTip] = useState(null);
  const tipProps = (label) => ({
    onMouseEnter: (e) => setTip({ label, top: e.currentTarget.getBoundingClientRect().top + e.currentTarget.offsetHeight / 2 }),
    onFocus: (e) => setTip({ label, top: e.currentTarget.getBoundingClientRect().top + e.currentTarget.offsetHeight / 2 }),
    onMouseLeave: () => setTip(null),
    onBlur: () => setTip(null),
  });
  const btn = 'relative appearance-none border-none cursor-pointer w-11 h-10 rounded-xl flex items-center justify-center flex-none transition';
  const quiet = `${btn} bg-transparent text-white/70 hover:text-white hover:bg-white/10`;

  return (
    <aside className="hidden md:flex min-[1400px]:hidden flex-none w-[72px] text-white flex-col items-center sticky top-0 h-screen z-30" style={{ background: 'linear-gradient(180deg,var(--p-sidebar-a),var(--p-sidebar-b))' }} aria-label="Admin menu">
      <div className="w-full flex flex-col items-center gap-1.5 pt-3.5 pb-3 border-b border-white/10">
        <button type="button" onClick={onExpand} {...tipProps('Full menu')} aria-label="Open the full menu" className={quiet}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M4 6h16M4 12h10M4 18h16" /><path d="M17 9.5l2.5 2.5-2.5 2.5" /></svg>
        </button>
        <button type="button" onClick={onSearch} {...tipProps('Search (Ctrl K)')} aria-label="Search" className={`${btn} border border-white/15 bg-white/5 hover:bg-white/10 text-white/80`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
        </button>
        <NotificationBell bell={bell} dark className="!w-11" />
      </div>

      <nav onScroll={() => setTip(null)} className="w-full flex-1 overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex flex-col items-center py-2" aria-label="Admin sections">
        {groups.map((g, gi) => (
          <div key={g.label} role="group" aria-label={g.label} className="w-full flex flex-col items-center gap-0.5">
            {gi > 0 && <div className="w-8 h-px bg-white/15 my-1.5" aria-hidden />}
            {g.items.map((n) => {
              const count = n.badge ? badges[n.badge] || 0 : 0;
              const label = count > 0 ? `${n.label} (${count} ${n.badgeLabel || 'waiting'})` : n.label;
              return (
                <NavLink
                  key={n.to} to={n.to} end={n.end} aria-label={label} {...tipProps(label)}
                  className={({ isActive }) => `${btn} !h-9 ${isActive ? 'bg-white/[.14] text-white' : 'text-white/65 hover:text-white hover:bg-white/[.07]'}`}
                >
                  {({ isActive }) => (
                    <>
                      <span className="absolute -left-[14px] top-1.5 bottom-1.5 w-[3px] rounded" style={{ background: isActive ? 'var(--p-gold-light)' : 'transparent' }} />
                      <NavIcon to={n.whileCensusOpen ? '/admin/census' : n.to} />
                      {count > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--p-gold-light)] text-parish-navy text-[10.5px] font-bold leading-[18px] text-center shadow" aria-hidden>
                          {count > 99 ? '99+' : count}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );
            })}
            {g.folded && (
              <button type="button" onClick={g.onToggle} aria-expanded={false} aria-label={`${g.label}: show its pages`} {...tipProps(g.label)} className={`${quiet} !h-9`}>
                <NavIcon to="/admin/settings" />
                {g.badge > 0 && <span className="absolute top-1.5 right-2 w-2 h-2 rounded-full bg-[var(--p-gold-light)]" aria-hidden />}
              </button>
            )}
          </div>
        ))}
      </nav>

      <div className="w-full flex flex-col items-center gap-2 py-2.5 border-t border-white/10">
        <button type="button" onClick={onExpand} {...tipProps(`${userName || 'Account'}: theme and account`)} aria-label="Account and theme" className="appearance-none border-none cursor-pointer w-9 h-9 rounded-full bg-[var(--p-gold-light)] text-parish-navy flex items-center justify-center font-bold text-[13px]">
          {nameInitials}
        </button>
        <button type="button" onClick={onLogout} {...tipProps('Sign out')} aria-label="Sign out" className={`${btn} !w-9 !h-9 bg-white/10 hover:bg-white/15 text-white`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></svg>
        </button>
      </div>

      {tip && (
        <div role="tooltip" className="fixed left-[80px] z-[75] -translate-y-1/2 pointer-events-none px-2.5 py-1.5 rounded-lg bg-parish-navy text-white text-[12.5px] font-semibold whitespace-nowrap shadow-card animate-fadeIn" style={{ top: tip.top }}>
          {tip.label}
        </div>
      )}
    </aside>
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
  const [openCensus, setOpenCensus] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState({});
  const openSearch = useCallback(() => { setDrawerOpen(false); setSearchOpen(true); }, []);
  useCommandPaletteShortcut(openSearch);

  useEffect(() => { api.getSettings().then((r) => setParish(r.settings)).catch(() => {}); }, []);

  // What's waiting, for the sidebar badges: refreshed on every page change
  // and whenever a page changes something counted (refreshNavCounts). Fails
  // quietly, leaving the badges off. The open census, if any, for the CENSUS
  // shortcut under Main, is checked with them.
  const refreshNavCounts = useCallback(() => {
    api.navCounts().then(setNavCounts).catch(() => {});
    api.openCensus().then(setOpenCensus).catch(() => {});
  }, []);
  useEffect(refreshNavCounts, [location.pathname, refreshNavCounts]);
  const bell = useStaffNotifications({ onNew: refreshNavCounts });
  useAdminAppLinks();
  useNotificationTaps(navigate);
  const badges = navBadges(navCounts);
  const showCensusMenu = censusMenuShown(parish, openCensus);
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

  // The nav this account sees, for the sidebar and the icon rail.
  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((n) => navAllowed(n, user) && (!n.whileCensusOpen || showCensusMenu)).map((n) => ({ ...n, label: navLabel(n, user) })),
  })).filter((g) => g.items.length);
  const groupOpen = (g) => !navCollapsible(g, user) || (openGroups[g.label] ?? g.items.some((n) => n === current || n.to === current?.to));
  const toggleGroup = (g) => setOpenGroups((o) => ({ ...o, [g.label]: !groupOpen(g) }));
  const railGroups = visibleGroups.map((g) => (groupOpen(g) ? g : {
    ...g, items: [], folded: true, onToggle: () => toggleGroup(g),
    badge: g.items.reduce((s, n) => s + (n.badge ? badges[n.badge] || 0 : 0), 0),
  }));

  const nameInitials = (user?.name || '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  const sidebar = (
    <>
      <div className="px-5 py-[22px] flex items-center gap-3 border-b border-white/10">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-none text-[var(--p-gold-light)] overflow-hidden ${parish?.logo ? 'bg-parish-surface p-1' : 'bg-[var(--p-gold-light)]/[.16]'}`}>
          {parish?.logo ? (
            <img src={parish.logo} alt={`${parish.name || 'Parish'} logo`} className="w-full h-full object-contain" />
          ) : (
            <ChurchEmblem size={24} strokeWidth={1.9} />
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
          <kbd className={`text-[10.5px] font-semibold text-white/55 border border-white/20 rounded px-1.5 py-px ${bell.available ? 'min-[1400px]:hidden' : ''}`}>Ctrl K</kbd>
        </button>
        {/* On phones the bell is in the top bar instead, on tablets in the icon rail. */}
        <NotificationBell bell={bell} dark className="hidden min-[1400px]:flex" />
      </div>

      <nav className="px-3 py-1.5 flex flex-col flex-1 overflow-auto" aria-label="Admin sections">
        {visibleGroups.map((g) => {
          const { items } = g;
          if (navCollapsible(g, user)) {
            // Collapsed by default; opens on its own while one of its pages is showing.
            const open = groupOpen(g);
            const groupBadge = items.reduce((s, n) => s + (n.badge ? badges[n.badge] || 0 : 0), 0);
            const toggle = () => toggleGroup(g);
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

      <Link
        to="/developer"
        className="px-4 py-2 text-center text-[10.5px] font-medium text-white/40 hover:text-white/70 transition"
      >
        Built For Free by DaveenDev
      </Link>
    </>
  );

  const sidebarBg = { background: 'linear-gradient(180deg,var(--p-sidebar-a),var(--p-sidebar-b))' };

  return (
    <div className="flex min-h-screen font-sans">
      {/* Desktop sidebar, from 1400px */}
      <aside className="hidden min-[1400px]:flex flex-none w-[208px] text-white flex-col sticky top-0 h-screen" style={sidebarBg}>
        {sidebar}
      </aside>

      {/* Tablets and small laptops (768–1399px): the sidebar folds to icons. */}
      <NavRail
        groups={railGroups} badges={badges} bell={bell} nameInitials={nameInitials} userName={user?.name}
        onExpand={() => setDrawerOpen(true)} onSearch={openSearch} onLogout={onLogout}
      />

      {/* The full menu over the page: phones, and the rail's "full menu" */}
      {drawerOpen && (
        <div className="min-[1400px]:hidden fixed inset-0 z-[70] flex" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 bg-parish-scrim/50 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
          <aside className="relative w-[248px] max-w-[82vw] text-white flex flex-col h-full shadow-2xl animate-fadeUp" style={sidebarBg}>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 flex flex-col bg-parish-bg">
        {/* Phone top bar */}
        <div className="md:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-3 border-b border-parish-border bg-parish-bg/95 backdrop-blur-md">
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
        ) : user?.access === 'none' ? (
          <WaitingForAccess email={user.email} onSignOut={onLogout} />
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

/**
 * What a login without an access level sees (0065): a new account, or one a
 * staff admin hasn't set up yet. The account is re-read when the person comes
 * back to the tab, so this goes away once an admin gives it access.
 */
function WaitingForAccess({ email, onSignOut }) {
  return (
    <>
      <PageHeader title="Waiting for access" />
      <PageBody>
        <Panel className="max-w-[560px] mx-auto p-6 sm:p-8 text-center">
          <div className="font-serif text-[22px] text-parish-navy mb-2">Your account is waiting for access</div>
          <p className="text-[14px] text-parish-text2 leading-relaxed m-0">
            You're signed in as <strong>{email}</strong>, but a staff admin hasn't given this account an access level yet.
            Ask the parish office to set it in <strong>Settings → Staff</strong>. Once they have, come back to this page.
          </p>
          <p className="text-[13px] text-parish-muted leading-relaxed mt-3 mb-5">
            Until then you can change your password under My Account.
          </p>
          <PrimaryButton type="button" onClick={onSignOut} className="px-5 py-2.5 text-[14px]">Sign out</PrimaryButton>
        </Panel>
      </PageBody>
    </>
  );
}
