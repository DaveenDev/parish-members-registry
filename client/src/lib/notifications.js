// Helpers for staff notifications: the bell in the admin panel and the
// phone notifications set up under Settings → Notifications. The list
// itself comes from staff_notifications (0034_staff_notifications.sql).

/** How each kind looks in the bell. */
export const NOTIFICATION_KINDS = {
  anointing: { icon: '✚', tone: 'red', label: 'Anointing of the Sick' },
  blood: { icon: '🩸', tone: 'red', label: 'Blood request' },
  certificate: { icon: '📜', tone: 'blue', label: 'Certificate' },
  ocia: { icon: '✝', tone: 'blue', label: 'OCIA' },
  registration: { icon: '🏠', tone: 'green', label: 'Registration' },
  census: { icon: '📋', tone: 'green', label: 'Census' },
  digest: { icon: '☀', tone: 'gold', label: 'Morning summary' },
};

export const kindStyle = (kind) => NOTIFICATION_KINDS[kind] || { icon: '•', tone: 'blue', label: 'Notice' };

/** What each account wants sent to its devices (staff_notify_prefs.push_level). */
export const PUSH_LEVELS = [
  { key: 'all', label: 'Every new request', note: 'Certificates, OCIA, Anointing of the Sick, blood requests, registrations and census updates, as they come in.' },
  { key: 'urgent', label: 'Urgent ones only', note: 'Anointing of the Sick and blood requests.' },
  { key: 'none', label: 'None', note: 'Nothing as it comes in; the bell in the admin panel still shows everything.' },
];

/** True when `n` arrived after the bell was last opened (`seenAt`, null if never). */
export function isUnread(n, seenAt) {
  if (!seenAt) return true;
  return new Date(n.created_at) > new Date(seenAt);
}

export function unreadCount(list, seenAt) {
  return (list || []).filter((n) => isUnread(n, seenAt)).length;
}

/** "Just now", "5 min ago", "3 hr ago", "Yesterday", "Sep 28". Dates are Philippine time. */
export function timeAgo(iso, now = new Date()) {
  const then = new Date(iso);
  const secs = Math.max(0, (now - then) / 1000);
  if (secs < 60) return 'Just now';
  if (secs < 3600) return `${Math.floor(secs / 60)} min ago`;
  const day = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  if (secs < 12 * 3600 || day(then) === day(now)) return `${Math.floor(secs / 3600)} hr ago`;
  if (day(then) === day(new Date(now - 86400000))) return 'Yesterday';
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
}

/** The browser's applicationServerKey from the base64url public key. */
export function urlBase64ToUint8Array(text) {
  const s = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** "iPhone · Safari", "Android phone · Chrome", "Windows · Edge": to tell the devices apart. */
export function deviceLabel(ua = '') {
  const os = /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android phone' : 'Android tablet')
    : /Windows/.test(ua) ? 'Windows'
    : /Macintosh|Mac OS X/.test(ua) ? 'Mac'
    : /CrOS/.test(ua) ? 'Chromebook'
    : /Linux/.test(ua) ? 'Linux'
    : 'Device';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
    : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /Chrome|CriOS/.test(ua) ? 'Chrome'
    : /Safari/.test(ua) ? 'Safari'
    : '';
  return browser ? `${os} · ${browser}` : os;
}

/**
 * Whether this browser can get notifications:
 *   'ok'           can be turned on
 *   'ios-install'  an iPhone/iPad: add the admin to the Home Screen first
 *   'denied'       notifications are blocked in the browser's settings
 *   'unsupported'  this browser can't
 */
export function pushSupport({ ua = '', standalone = false, hasServiceWorker, hasPush, permission } = {}) {
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && /Mobile\//.test(ua));
  if (ios && !standalone) return 'ios-install';
  if (!hasServiceWorker || !hasPush || permission === undefined) return 'unsupported';
  if (permission === 'denied') return 'denied';
  return 'ok';
}
