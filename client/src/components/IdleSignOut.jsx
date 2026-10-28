import React, { useEffect, useRef, useState } from 'react';
import { Modal } from './admin.jsx';
import { PrimaryButton, GhostButton } from './ui.jsx';
import { idleState, LAST_ACTIVE_KEY, IDLE_LIMIT_MINUTES } from '../lib/idle.js';

const read = () => { try { return Number(localStorage.getItem(LAST_ACTIVE_KEY)) || 0; } catch { return 0; } };
const write = (t) => { try { localStorage.setItem(LAST_ACTIVE_KEY, String(t)); } catch { /* this tab only */ } };

/**
 * Watches for activity while the admin panel is open. After a minute's
 * warning with nothing done, it calls onSignOut. Activity in any tab counts.
 */
export default function IdleSignOut({ onSignOut }) {
  const [warning, setWarning] = useState(null); // seconds left, while warning
  const local = useRef(Date.now());
  const lastWrite = useRef(0);
  // The latest callback, so a re-render of the layout doesn't restart the clock.
  const signOut = useRef(onSignOut);
  signOut.current = onSignOut;

  useEffect(() => {
    const now = Date.now();
    local.current = now;
    write(now);
    const touch = () => {
      const t = Date.now();
      local.current = t;
      // At most every 10 s: mousemove fires constantly.
      if (t - lastWrite.current > 10000) { lastWrite.current = t; write(t); }
    };
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove', 'wheel'];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true, capture: true }));
    const timer = setInterval(() => {
      const last = Math.max(read(), local.current);
      const s = idleState(last, Date.now());
      if (s.state === 'expired') { clearInterval(timer); signOut.current(); }
      else setWarning(s.state === 'warning' ? s.secondsLeft : null);
    }, 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, touch, { capture: true }));
      clearInterval(timer);
    };
  }, []);

  if (warning === null) return null;
  const stay = () => { const t = Date.now(); local.current = t; write(t); setWarning(null); };
  return (
    <Modal title="Still there?" onClose={stay} z="z-[95]" maxWidth={420}>
      <p className="text-[14px] text-parish-text2 m-0 mb-5" role="alert">
        To protect member records, you'll be signed out in <strong className="text-parish-navy">{warning} second{warning === 1 ? '' : 's'}</strong> after {IDLE_LIMIT_MINUTES} minutes without activity.
      </p>
      <div className="flex gap-2.5 justify-end">
        <GhostButton onClick={onSignOut} className="px-5 py-2.5 text-[14px]">Sign out now</GhostButton>
        <PrimaryButton onClick={stay} className="px-6 py-2.5 text-[14px]">Stay signed in</PrimaryButton>
      </div>
    </Modal>
  );
}
