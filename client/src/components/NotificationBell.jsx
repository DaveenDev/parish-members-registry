import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useToast } from '../ToastContext.jsx';
import { isUnread, unreadCount, timeAgo, kindStyle } from '../lib/notifications.js';

const TONES = {
  red: 'bg-parish-errorBg text-parish-error',
  blue: 'bg-[var(--p-blue-tint)] text-parish-blue',
  gold: 'bg-[var(--p-gold-tint)] text-[var(--p-gold-deep)]',
  green: 'bg-parish-okBg text-parish-ok',
};

/** A short two-note chime from the browser itself (no sound file). Quiet if the browser won't play. */
function chime(urgent) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const notes = urgent ? [880, 660, 880, 660] : [660, 880];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const at = ctx.currentTime + i * 0.18;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 0.32);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch { /* no sound, still shown */ }
}

/**
 * The bell's data for the admin layout: the latest notifications, live
 * (Supabase Realtime) and reloaded whenever the tab comes back into view.
 * `available` is false before the 0034 migration, which hides the bell.
 */
export function useStaffNotifications({ onNew } = {}) {
  const toast = useToast();
  const navigate = useNavigate();
  const [state, setState] = useState({ available: false, items: [], seenAt: null });
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;
  // Pages that want to hear each new notification too (useLiveRefresh).
  const listeners = useRef(new Set());
  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => { listeners.current.delete(fn); };
  }, []);

  const reload = useCallback(() => {
    api.listNotifications().then((r) => {
      if (!r) return setState((s) => ({ ...s, available: false }));
      setState({ available: true, items: r.items, seenAt: r.prefs.seen_at });
    }).catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    const unsubscribe = api.subscribeNotifications((n) => {
      setState((s) => (s.items.some((x) => x.id === n.id) ? s : { ...s, available: true, items: [n, ...s.items].slice(0, 30) }));
      chime(n.urgent);
      toast.success(n.title, { action: { label: 'Open', onClick: () => navigate(n.link || '/admin') } });
      onNewRef.current?.(n);
      listeners.current.forEach((fn) => fn(n));
    });
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { unsubscribe(); document.removeEventListener('visibilitychange', onVisible); };
  }, [reload]); // eslint-disable-line react-hooks/exhaustive-deps

  const unread = unreadCount(state.items, state.seenAt);

  // "(2) Requests · Parish Registry": new requests show on the browser tab too.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, '');
    document.title = unread ? `(${unread > 9 ? '9+' : unread}) ${base}` : base;
  }, [unread]);

  const markSeen = useCallback(() => {
    setState((s) => ({ ...s, seenAt: new Date().toISOString() }));
    api.markNotificationsSeen().then((t) => setState((s) => ({ ...s, seenAt: t }))).catch(() => {});
  }, []);

  return { ...state, unread, reload, markSeen, subscribe };
}

function BellIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/** One notification, as a link to where it's handled. `unread` highlights it. */
export function NotificationRow({ n, unread, onOpen, now }) {
  const style = kindStyle(n.kind);
  return (
    <Link
      to={n.link || '/admin'}
      onClick={onOpen}
      className={`flex gap-3 px-4 py-3 no-underline text-inherit transition hover:bg-parish-hover ${unread ? 'bg-[var(--p-gold-tint)]' : ''}`}
    >
      <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-none text-[16px] ${TONES[style.tone]}`} aria-hidden>{style.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={`text-[14px] leading-snug ${unread ? 'font-bold text-parish-ink' : 'font-semibold text-parish-text2'}`}>{n.title}</span>
          {n.urgent && n.kind !== 'digest' && <span className="text-[10.5px] font-bold uppercase tracking-wide text-parish-error flex-none">Urgent</span>}
        </span>
        {n.detail && <span className="block text-[13px] text-parish-muted leading-snug mt-0.5 break-words">{n.detail}</span>}
        <span className="block text-[12px] text-parish-faint mt-1">
          {timeAgo(n.created_at, now)}{n.ref_no ? ` · ${n.ref_no}` : ''}
        </span>
      </span>
      {unread && <span className="w-2 h-2 rounded-full bg-parish-error flex-none mt-2" aria-label="New" />}
    </Link>
  );
}

/**
 * The bell button and its list. `dark` for the navy sidebar. The list opens
 * in a portal so the sidebar's edges don't clip it; opening it marks
 * everything as seen (the new ones stay highlighted while it's open).
 */
export default function NotificationBell({ bell, dark = false, className = '' }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [highlightAfter, setHighlightAfter] = useState(null);
  const [pos, setPos] = useState(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  const place = useCallback(() => {
    const r = buttonRef.current?.getBoundingClientRect();
    if (!r) return;
    const wide = window.innerWidth >= 640;
    setPos(wide
      ? { top: r.bottom + 8, left: Math.min(r.left, window.innerWidth - 392), width: 380 }
      : { top: r.bottom + 8, left: 12, width: window.innerWidth - 24 });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); } };
    const onDown = (e) => {
      if (panelRef.current?.contains(e.target) || buttonRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  if (!bell?.available) return null;

  function toggle() {
    if (!open) {
      setHighlightAfter(bell.seenAt);
      if (bell.unread) bell.markSeen();
    }
    setOpen(!open);
  }

  const now = new Date();
  const label = bell.unread ? `Notifications, ${bell.unread} new` : 'Notifications';

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notifications"
        className={`relative appearance-none cursor-pointer w-10 h-10 rounded-xl flex items-center justify-center flex-none transition ${
          dark
            ? 'border border-white/15 bg-white/5 hover:bg-white/10 text-white/80'
            : 'border-[1.5px] border-parish-borderSoft bg-parish-surface text-parish-navy hover:bg-parish-hover'
        } ${className}`}
      >
        <BellIcon />
        {bell.unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-[19px] h-[19px] px-1 rounded-full bg-parish-error text-white text-[11px] font-bold leading-[19px] text-center shadow" aria-hidden>
            {bell.unread > 9 ? '9+' : bell.unread}
          </span>
        )}
      </button>
      {open && pos && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Notifications"
          className="fixed z-[80] bg-parish-surface border border-parish-border rounded-2xl shadow-card overflow-hidden flex flex-col animate-fadeIn"
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: `min(560px, calc(100vh - ${pos.top + 16}px))` }}
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b border-parish-line">
            <div className="font-serif text-[18px] font-semibold text-parish-navy flex-1">Notifications</div>
            <Link
              to="/admin/settings/notifications"
              onClick={() => setOpen(false)}
              className="text-[13px] font-semibold text-parish-blue no-underline hover:underline"
            >
              Settings
            </Link>
          </div>
          <div className="overflow-auto flex-1 divide-y divide-parish-line">
            {bell.items.length === 0 && (
              <div className="px-5 py-10 text-center text-[14px] text-parish-muted">
                Nothing yet. Requests from the website will show up here as they come in.
              </div>
            )}
            {bell.items.map((n) => (
              <NotificationRow key={n.id} n={n} now={now} unread={isUnread(n, highlightAfter)} onOpen={() => setOpen(false)} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => { setOpen(false); navigate('/admin/settings/notifications'); }}
            className="appearance-none border-0 border-t border-parish-line bg-parish-sunk cursor-pointer px-4 py-2.5 text-[13px] font-semibold text-parish-text2 hover:text-parish-navy text-center"
          >
            Get these on your phone
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
