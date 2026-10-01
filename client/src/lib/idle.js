// Signing staff out of the admin panel after a stretch without activity, so
// a shared parish-office computer isn't left open on member records. The
// last activity time is shared through localStorage, so working in one tab
// keeps the others signed in too.

export const IDLE_LIMIT_MINUTES = 20;
export const IDLE_WARNING_SECONDS = 60;
export const LAST_ACTIVE_KEY = 'pmr_last_active';

/** 'active', 'warning' (with seconds left) or 'expired', for a last activity time. */
export function idleState(lastActive, now, { limitMs = IDLE_LIMIT_MINUTES * 60000, warnMs = IDLE_WARNING_SECONDS * 1000 } = {}) {
  const idle = now - lastActive;
  if (idle >= limitMs) return { state: 'expired', secondsLeft: 0 };
  if (idle >= limitMs - warnMs) return { state: 'warning', secondsLeft: Math.ceil((limitMs - idle) / 1000) };
  return { state: 'active', secondsLeft: Math.ceil((limitMs - idle) / 1000) };
}
