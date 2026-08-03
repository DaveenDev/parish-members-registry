import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../AuthContext.jsx';
import { api } from '../../api.js';
import { ThemePickerPopover } from '../../components/ThemePicker.jsx';

const NAV_MAIN = [
  { to: '/admin', end: true, label: 'Dashboard' },
  { to: '/admin/households', label: 'Households' },
  { to: '/admin/members', label: 'Members' },
  { to: '/admin/sacraments', label: 'Sacraments' },
  { to: '/admin/organizations', label: 'Organizations' },
  { to: '/admin/ministries', label: 'Ministries' },
  { to: '/admin/reports', label: 'Reports' },
  { to: '/admin/exports', label: 'Exports' },
];

const NAV_SETTINGS = [
  { to: '/admin/settings', label: 'Parish Config' },
  { to: '/admin/settings/ministries', label: 'Ministries' },
  { to: '/admin/settings/organizations', label: 'Organizations' },
];

function NavItem({ to, end, label, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        `relative flex items-center gap-3 px-3.5 py-2.5 rounded-xl font-semibold text-[14.5px] text-left transition ${
          isActive ? 'bg-white/12 text-white' : 'text-white/70 hover:text-white hover:bg-white/5'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded" style={{ background: isActive ? 'var(--p-gold-light)' : 'transparent' }} />
          {label}
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
  const [parish, setParish] = useState(null);

  useEffect(() => { api.getSettings().then((r) => setParish(r.settings)).catch(() => {}); }, []);

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

  const nameInitials = (user?.name || '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  const sidebar = (
    <>
      <div className="px-5 py-[22px] flex items-center gap-3 border-b border-white/10">
        <div className="w-[42px] h-[42px] rounded-xl bg-[var(--p-gold-light)]/[.16] flex items-center justify-center flex-none text-[var(--p-gold-light)] overflow-hidden">
          {parish?.logo ? (
            <img src={parish.logo} alt="" className="w-full h-full object-cover" />
          ) : (
            <svg viewBox="0 0 40 40" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden><path d="M20 6l1.9 5.7h6l-4.9 3.5 1.9 5.7-4.9-3.5-4.9 3.5 1.9-5.7-4.9-3.5h6z" /><path d="M20 24v9M15.5 28.5h9" /></svg>
          )}
        </div>
        <div className="min-w-0">
          <div className="font-serif text-[18px] font-semibold leading-tight truncate">{parish?.name || 'OLG Quasi-Parish'}</div>
          <div className="text-[11px] tracking-[.1em] uppercase text-[var(--p-gold-light)]/85">Members Registry</div>
        </div>
      </div>

      <nav className="px-3 py-3.5 flex flex-col gap-0.5 flex-1 overflow-auto" aria-label="Admin sections">
        {NAV_MAIN.map((n) => <NavItem key={n.to} {...n} />)}
        <div className="mx-3.5 mt-3.5 mb-1 font-bold text-[10.5px] tracking-[.15em] uppercase text-[var(--p-gold-light)]/70">Settings</div>
        {NAV_SETTINGS.map((n) => <NavItem key={n.to} {...n} />)}
      </nav>

      <div className="px-4 py-2.5">
        <ThemePickerPopover align="left" placement="up" dark />
      </div>

      <div className="px-4 py-3.5 border-t border-white/10 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-[var(--p-gold-light)] text-parish-navy flex items-center justify-center font-bold text-[14px] flex-none" aria-hidden>{nameInitials}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis">{user?.name}</div>
          <div className="text-[11.5px] text-white/60">{user?.role}</div>
        </div>
        <button onClick={onLogout} title="Sign out" aria-label="Sign out" className="appearance-none border-none bg-white/10 cursor-pointer text-white w-8 h-8 rounded-lg flex items-center justify-center flex-none">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></svg>
        </button>
      </div>

      <a
        href="https://github.com/DaveenDev"
        target="_blank"
        rel="noopener noreferrer"
        className="px-4 py-2 text-center text-[10.5px] font-medium text-white/40 hover:text-white/70 transition"
      >
        Built by DaveenDev
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
          <div className="absolute inset-0 bg-parish-navy/50 backdrop-blur-sm" onClick={() => setDrawerOpen(false)} />
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
            className="appearance-none border-[1.5px] border-parish-borderSoft bg-white cursor-pointer w-10 h-10 rounded-xl flex items-center justify-center text-parish-navy flex-none"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
          <span className="font-serif text-[19px] font-semibold text-parish-navy truncate">{parish?.name || 'Parish Registry'}</span>
        </div>

        <Outlet />
      </main>
    </div>
  );
}
