import React, { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

// A signed-in staff member who chose "view the site anyway", for this tab only.
const PREVIEW_KEY = 'maintenance-staff-preview';
function readPreview() {
  try { return sessionStorage.getItem(PREVIEW_KEY) === '1'; } catch { return false; }
}
function writePreview(on) {
  try { if (on) sessionStorage.setItem(PREVIEW_KEY, '1'); else sessionStorage.removeItem(PREVIEW_KEY); } catch { /* storage blocked */ }
}

/**
 * Wraps the public pages (website, /register, /census). With maintenance mode
 * on (Parish Config), everyone sees a notice instead of the page, staff
 * included. Signed-in staff get a button on the notice to look at the site
 * anyway, under a reminder bar. Nothing shows until both the setting and the
 * sign-in are known, so the site never flashes open or closed.
 */
export default function MaintenanceGate() {
  const { user, ready } = useAuth();
  const [state, setState] = useState(null);
  const [preview, setPreview] = useState(readPreview);

  useEffect(() => {
    let live = true;
    api.publicMaintenance().then((s) => { if (live) setState(s); });
    return () => { live = false; };
  }, []);

  if (!state || !ready) return null;
  if (!state.on) return <Outlet />;
  if (user && preview) {
    return (
      <>
        <div className="sticky top-0 z-[70] bg-[#c2410c] text-white text-[13px] font-semibold text-center px-4 py-2">
          Maintenance mode is on: the public sees the maintenance notice, not this page.{' '}
          <button type="button" onClick={() => { writePreview(false); setPreview(false); }} className="appearance-none border-none bg-transparent p-0 cursor-pointer text-white underline font-semibold">Show the notice</button>
          {' · '}
          <Link to="/admin/settings?tab=config" className="text-white underline">Turn it off</Link>
        </div>
        <Outlet />
      </>
    );
  }
  return (
    <MaintenanceNotice
      parish={state.parish}
      message={state.message}
      onPreview={user ? () => { writePreview(true); setPreview(true); } : null}
    />
  );
}

function MaintenanceNotice({ parish, message, onPreview }) {
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
        {onPreview ? (
          <div className="mt-7 pt-5 border-t border-parish-border text-[13px] text-parish-muted">
            You're signed in as staff.{' '}
            <button type="button" onClick={onPreview} className="appearance-none border-none bg-transparent p-0 cursor-pointer font-semibold text-parish-blue underline">View the site anyway</button>
            {' · '}
            <Link to="/admin/settings?tab=config" className="font-semibold text-parish-blue underline">Turn maintenance off</Link>
          </div>
        ) : (
          <Link to="/admin/login" className="inline-block mt-7 text-[12.5px] text-parish-muted underline">Staff sign in</Link>
        )}
      </div>
    </main>
  );
}
