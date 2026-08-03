import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../AuthContext.jsx';
import { ThemePickerPopover } from '../../components/ThemePicker.jsx';

const NAV_MAIN = [
  { to: '/admin', end: true, label: 'Dashboard', icon: (p) => <rect x="3" y="3" width="7" height="7" rx="1" {...p} /> },
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

function NavItem({ to, end, label }) {
  return (
    <NavLink
      to={to}
      end={end}
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

  function onLogout() {
    logout();
    navigate('/admin/login', { replace: true });
  }

  const nameInitials = (user?.name || '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="flex min-h-screen font-sans">
      <aside className="flex-none w-[208px] text-white flex flex-col sticky top-0 h-screen" style={{ background: 'linear-gradient(180deg,var(--p-sidebar-a),var(--p-sidebar-b))' }}>
        <div className="px-5 py-[22px] flex items-center gap-3 border-b border-white/10" style={{ padding: '22px 20px' }}>
          <div className="w-[42px] h-[42px] rounded-xl bg-[var(--p-gold-light)]/[.16] flex items-center justify-center flex-none text-[var(--p-gold-light)]">
            <svg viewBox="0 0 40 40" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round"><path d="M20 6l1.9 5.7h6l-4.9 3.5 1.9 5.7-4.9-3.5-4.9 3.5 1.9-5.7-4.9-3.5h6z" /><path d="M20 24v9M15.5 28.5h9" /></svg>
          </div>
          <div className="min-w-0">
            <div className="font-serif text-[18px] font-semibold leading-tight">OLG Quasi-Parish</div>
            <div className="text-[11px] tracking-[.1em] uppercase text-[var(--p-gold-light)]/85">Mua-an Registry</div>
          </div>
        </div>
        <nav className="px-3 py-3.5 flex flex-col gap-0.5 flex-1 overflow-auto">
          {NAV_MAIN.map((n) => <NavItem key={n.to} {...n} />)}
          <div className="mx-3.5 mt-3.5 mb-1 font-bold text-[10.5px] tracking-[.15em] uppercase text-[var(--p-gold-light)]/70">Settings</div>
          {NAV_SETTINGS.map((n) => <NavItem key={n.to} {...n} />)}
        </nav>
        <div className="px-4 py-2.5">
          <ThemePickerPopover align="left" placement="up" dark />
        </div>
        <div className="px-4 py-3.5 border-t border-white/10 flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-[var(--p-gold-light)] text-parish-navy flex items-center justify-center font-bold text-[14px] flex-none">{nameInitials}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold whitespace-nowrap overflow-hidden text-ellipsis">{user?.name}</div>
            <div className="text-[11.5px] text-white/60">{user?.role}</div>
          </div>
          <button onClick={onLogout} title="Sign out" className="appearance-none border-none bg-white/10 cursor-pointer text-white w-8 h-8 rounded-lg flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></svg>
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
      </aside>

      <main className="flex-1 min-w-0 flex flex-col bg-parish-bg">
        <Outlet />
      </main>
    </div>
  );
}
