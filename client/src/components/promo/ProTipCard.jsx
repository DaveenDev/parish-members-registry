import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../AuthContext.jsx';
import { HIDE_DAYS, accountAgeDays, moduleById, pageKey, pickTip, tipKey } from '../../lib/proPromo.js';
import { ownedModules } from '../../lib/proModules.js';
import { hideFor, markPageSkipped, markTipShown, readShown, useDismissals } from '../../lib/proStore.js';
import { busyNow, somethingOpen } from './busy.js';

const SHOW_AFTER_MS = 4000;
const AWAY_AFTER_MS = 20000;

/**
 * One small PRO tip card on the page that fits it (lib/proPromo.js decides
 * which, and whether at all). A computer: slides in at the bottom right about
 * 4 seconds after the page opens. A phone or tablet: the same card at the
 * bottom of the page, never over content. Goes away by itself after 20
 * seconds, and the moment a drawer or dialog opens; not printed.
 */
export default function ProTipCard() {
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const tab = new URLSearchParams(search).get('tab') || undefined;
  const d = useDismissals(user);
  const hidden = useRef(d.map);
  hidden.current = d.map;
  const [tip, setTip] = useState(null);

  useEffect(() => {
    setTip(null);
    if (!user || !d.ready) return undefined;
    const pick = () => {
      const shown = readShown(user);
      return pickTip({
        pathname, tab, access: user.access, isDemo: user.isDemo, accountAgeDays: accountAgeDays(user.createdAt, Date.now()),
        owned: ownedModules, dismissals: hidden.current, now: Date.now(), ...shown,
      });
    };
    if (!pick()) return undefined;
    let away;
    const page = pageKey(pathname, tab);
    const wait = setTimeout(() => {
      // Something has the person's attention: no card on this page this session.
      if (busyNow()) { markPageSkipped(user, page); return; }
      const t = pick();
      if (!t) return;
      markTipShown(user, page, t.id);
      setTip(t);
      away = setTimeout(() => setTip(null), AWAY_AFTER_MS);
    }, SHOW_AFTER_MS);
    return () => { clearTimeout(wait); clearTimeout(away); };
  }, [pathname, tab, user, d.ready]);

  // A drawer or dialog opens while the card shows: it goes away.
  useEffect(() => {
    if (!tip) return undefined;
    const watch = new MutationObserver(() => { if (somethingOpen()) setTip(null); });
    watch.observe(document.body, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [tip]);

  if (!tip) return null;
  const m = moduleById(tip.module);
  const hide = () => { hideFor(user, tipKey(tip.id), HIDE_DAYS); setTip(null); };

  return (
    <aside
      role="complementary" aria-label="PRO tip"
      className="print:hidden animate-fadeUp mx-4 mb-4 md:mx-0 md:mb-0 md:fixed md:bottom-5 md:right-5 md:w-[320px] md:z-[35] rounded-2xl border border-[var(--p-blue-border)] bg-parish-surface shadow-card p-4"
    >
      <div className="flex items-center gap-2">
        <span className="text-[10.5px] font-bold tracking-[.12em] uppercase text-parish-blue">PRO tip</span>
        <button
          type="button" onClick={hide} aria-label="Hide this tip" title="Hide this tip"
          className="ml-auto appearance-none border-none bg-transparent cursor-pointer text-parish-muted hover:text-parish-ink text-[20px] leading-none px-1"
        >×</button>
      </div>
      <div className="font-serif text-[17px] font-semibold text-parish-navy leading-snug mt-1">{tip.title}</div>
      <p className="m-0 mt-1 text-[13px] text-parish-text2 leading-snug">{tip.text}</p>
      <div className="flex items-center gap-3 mt-3">
        <Link
          to={`/admin/pro#${m?.id || ''}`} onClick={() => setTip(null)}
          className="no-underline px-3.5 py-2 rounded-lg bg-parish-fill text-white font-bold text-[13px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-parish-blue"
        >See how it works</Link>
        <button type="button" onClick={hide} className="appearance-none border-none bg-transparent cursor-pointer text-[13px] font-semibold text-parish-muted hover:text-parish-ink">Not now</button>
      </div>
    </aside>
  );
}

