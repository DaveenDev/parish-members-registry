import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../AuthContext.jsx';
import { HIDE_DAYS, PRO_DEMO_URL, SHOWCASE_KEY, accountAgeDays, pickShowcase } from '../../lib/proPromo.js';
import { ownedModules } from '../../lib/proModules.js';
import { hideFor, markShowcaseShown, readShown, useDismissals } from '../../lib/proStore.js';
import { busyNow } from './busy.js';
import ModuleShot from './ModuleShot.jsx';

const SHOW_AFTER_MS = 1500;
const BTN = 'no-underline appearance-none cursor-pointer inline-flex items-center justify-center px-4 py-2.5 rounded-xl font-bold text-[14px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-parish-blue';

/**
 * The monthly PRO showcase: a dialog (a bottom sheet on phones) on the
 * Dashboard for Full access and Clergy. Every way of closing it, and every
 * button, hides it for 30 days for this account. If a drawer or dialog is
 * open when it is due, it waits for the next time the Dashboard opens.
 */
export default function ProShowcaseDialog() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const d = useDismissals(user);
  const hidden = useRef(d.map);
  hidden.current = d.map;
  const [modules, setModules] = useState(null);
  const box = useRef(null);

  useEffect(() => {
    setModules(null);
    if (!user || !d.ready) return undefined;
    const wait = setTimeout(() => {
      if (busyNow()) return;
      const three = pickShowcase({
        pathname, access: user.access, isDemo: user.isDemo, accountAgeDays: accountAgeDays(user.createdAt, Date.now()),
        owned: ownedModules, dismissals: hidden.current, now: Date.now(), shownThisSession: readShown(user).showcaseShown,
      });
      if (!three) return;
      markShowcaseShown(user);
      setModules(three);
    }, SHOW_AFTER_MS);
    return () => clearTimeout(wait);
  }, [pathname, user, d.ready]);

  const close = () => { hideFor(user, SHOWCASE_KEY, HIDE_DAYS); setModules(null); };

  useEffect(() => {
    if (!modules) return undefined;
    box.current?.querySelector('a, button')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab' || !box.current) return;
      // Keep Tab inside the dialog.
      const items = [...box.current.querySelectorAll('a[href], button')];
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modules]);

  if (!modules) return null;
  return (
    <div className="print:hidden fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-5 bg-parish-scrim/45 backdrop-blur-sm animate-fadeIn" onClick={close}>
      <div
        ref={box} role="dialog" aria-modal="true" aria-labelledby="pro-showcase-title" onClick={(e) => e.stopPropagation()}
        className="relative w-full sm:max-w-[760px] max-h-[92dvh] overflow-y-auto bg-parish-surface rounded-t-2xl sm:rounded-2xl shadow-2xl p-5 sm:p-7 animate-fadeUp"
      >
        <button type="button" onClick={close} aria-label="Close" title="Close" className="absolute top-3 right-3 appearance-none border-none bg-transparent cursor-pointer text-parish-muted hover:text-parish-ink text-[24px] leading-none px-2 py-1">×</button>
        <h2 id="pro-showcase-title" className="font-serif text-[24px] sm:text-[28px] font-semibold text-parish-navy m-0 pr-8 leading-tight">Do more with your registry: PRO modules</h2>
        <p className="m-0 mt-1 text-[13.5px] text-parish-muted">Made by DaveenDev, the developer of this registry.</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-5">
          {modules.map((m) => (
            <div key={m.id} className="min-w-0">
              <ModuleShot module={m} />
              <div className="font-bold text-[14.5px] text-parish-navy mt-2 leading-snug">{m.name}</div>
              <div className="text-[13px] text-parish-text2 leading-snug">{m.short}</div>
            </div>
          ))}
        </div>

        <p className="m-0 mt-5 text-[13.5px] text-parish-text2 leading-relaxed">
          Your current registry stays free. PRO adds to it; it never takes anything away.
        </p>
        <div className="flex flex-wrap items-center gap-2.5 mt-4">
          <Link to="/admin/pro" onClick={close} className={`${BTN} bg-parish-fill text-white shadow-btn`}>See PRO modules</Link>
          <a href={PRO_DEMO_URL} target="_blank" rel="noopener noreferrer" onClick={close} className={`${BTN} border-[1.5px] border-parish-borderStrong text-parish-text2 hover:bg-parish-sunk`}>Try the PRO demo</a>
          <button type="button" onClick={close} className={`${BTN} border-none bg-transparent text-parish-muted hover:text-parish-ink sm:ml-auto`}>Remind me in a month</button>
        </div>
      </div>
    </div>
  );
}
