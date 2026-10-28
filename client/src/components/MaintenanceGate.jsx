import React, { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

// Whether this browser last found the site open (not in maintenance).
const OPEN_KEY = 'olg.site-open';
const OPEN = { on: false, message: null, parish: '' };
const wasOpen = () => { try { return localStorage.getItem(OPEN_KEY) === '1'; } catch { return false; } };
const remember = (open) => { try { localStorage.setItem(OPEN_KEY, open ? '1' : '0'); } catch { /* checks each time */ } };

/**
 * Wraps the public pages (website, /register, /census). With maintenance mode
 * on (Parish Config), visitors see a notice instead of the page. Signed-in
 * staff still see the site, under a warning bar at the very top, so they can
 * check their changes.
 *
 * A browser that found the site open last time opens it straight away, while
 * the setting is checked: waiting for it left the page blank for a second or
 * two on every visit. Maintenance is rare, so it's the rare visit that sees
 * the page and then the notice. A first visit, or one after the notice, still
 * waits for both the setting and the sign-in.
 */
export default function MaintenanceGate() {
  const { user, ready } = useAuth();
  const [state, setState] = useState(() => (wasOpen() ? OPEN : null));

  useEffect(() => {
    let live = true;
    api.publicMaintenance().then((s) => {
      remember(!s.on);
      if (live) setState(s);
    });
    return () => { live = false; };
  }, []);

  if (!state) return null;
  if (!state.on) return <Outlet />;
  if (!ready) return null;
  if (!state.on) return <Outlet />;
  if (user) {
    return (
      <>
        <div role="status" className="sticky top-0 z-[70] bg-[#c2410c] text-white text-[13px] font-semibold text-center px-4 py-2">
          Maintenance mode is on: only signed-in staff can see the website; the public sees the maintenance notice.{' '}
          <Link to="/admin/settings?tab=config" className="text-white underline">Turn it off</Link>
        </div>
        <Outlet />
      </>
    );
  }
  return <MaintenanceNotice parish={state.parish} message={state.message} />;
}

function MaintenanceNotice({ parish, message }) {
  return (
    <main className="min-h-screen bg-parish-bg flex items-center justify-center px-4 py-10 font-sans">
      <div className="max-w-[520px] w-full bg-parish-surface border border-parish-border rounded-[20px] shadow-card px-6 py-9 sm:px-9 text-center">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="var(--p-gold-deep, #a07c2c)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-4" aria-hidden>
          <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" />
        </svg>
        {parish && <div className="font-bold text-[11.5px] tracking-[.14em] uppercase text-parish-muted mb-2">{parish}</div>}
        <h1 className="font-serif font-semibold text-[clamp(26px,6vw,34px)] text-parish-navy m-0 mb-3 leading-tight">Ginaayo pa ang website</h1>
        <p className="text-[15.5px] text-parish-text2 leading-relaxed m-0">
          Pasayloa, dili sa pagkakaron maablihan ang website samtang among ginaayo. Balik lang unya.
        </p>
        {message && <p className="text-[15px] text-parish-ink leading-relaxed mt-4 mb-0 whitespace-pre-line">{message}</p>}
        <Link to="/admin/login" className="inline-block mt-7 text-[12.5px] text-parish-muted underline">Staff sign in</Link>
      </div>
    </main>
  );
}
