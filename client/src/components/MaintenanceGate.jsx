import React, { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

/**
 * Wraps the public pages (website, /register, /census). With maintenance mode
 * on (Parish Config), visitors see a notice instead of the page; signed-in
 * staff still see the site, under a reminder bar, so they can check it.
 * Nothing shows until the setting is known, so the site never flashes open.
 */
export default function MaintenanceGate() {
  const { user, ready } = useAuth();
  const [state, setState] = useState(null);

  useEffect(() => {
    let live = true;
    api.publicMaintenance().then((s) => { if (live) setState(s); });
    return () => { live = false; };
  }, []);

  if (!state || !ready) return null;
  if (!state.on) return <Outlet />;
  if (user) {
    return (
      <>
        <div className="sticky top-0 z-[70] bg-[#c2410c] text-white text-[13px] font-semibold text-center px-4 py-2">
          Maintenance mode is on: the public can't see the website.{' '}
          <Link to="/admin/settings?tab=config" className="text-white underline">Turn it off in Parish Config</Link>
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
