// Phone and computer notifications for this browser (Web Push). The
// service worker is public/sw.js; the sending side is the notify-staff Edge
// Function. Turning them on asks the browser's permission, so it must start
// from a tap or click.
import { api } from '../api.js';
import { pushSupport, urlBase64ToUint8Array, deviceLabel } from './notifications.js';

/** This browser's support, see pushSupport(). */
export function browserPushSupport() {
  if (typeof window === 'undefined') return 'unsupported';
  return pushSupport({
    ua: navigator.userAgent,
    standalone: window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true,
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPush: 'PushManager' in window,
    permission: typeof Notification === 'undefined' ? undefined : Notification.permission,
  });
}

async function registration() {
  return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

/** This browser's push subscription, or null. */
export async function currentSubscription() {
  if (browserPushSupport() !== 'ok') return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Ask permission, subscribe and save it for this account. Returns the subscription. */
export async function enablePush() {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(permission === 'denied'
      ? 'Notifications are blocked for this site. Allow them in the browser’s site settings, then try again.'
      : 'Notifications were not allowed.');
  }
  const key = await api.pushPublicKey();
  const reg = await registration();
  await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  // A subscription made with an older key can't receive anything: start over.
  if (sub && sub.options?.applicationServerKey) {
    const had = new Uint8Array(sub.options.applicationServerKey);
    const want = urlBase64ToUint8Array(key);
    if (had.length !== want.length || had.some((b, i) => b !== want[i])) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
  await api.savePushSubscription(sub, deviceLabel(navigator.userAgent));
  return sub;
}

/** Stop notifications on this browser. */
export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  await api.removePushDevice({ endpoint: sub.endpoint }).catch(() => {});
  await sub.unsubscribe();
}

/** Keep the service worker registered on admin pages, so notification taps open the right page. */
export function keepServiceWorker() {
  if (browserPushSupport() !== 'ok' || Notification.permission !== 'granted') return;
  registration().catch(() => {});
}
