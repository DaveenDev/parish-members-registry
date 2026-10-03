// Service worker for staff notifications (Settings → Notifications in the
// admin panel). It only shows pushed notifications and opens the admin page
// they point to; it caches nothing and doesn't touch the public website.
// The payload comes from supabase/functions/notify-staff/handler.js
// (pushPayload): { title, body, url, tag, urgent }.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Parish Registry', {
    body: data.body || '',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    requireInteraction: !!data.urgent,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    vibrate: data.urgent ? [300, 120, 300, 120, 300] : [200],
    data: { url: data.url || '/admin' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/admin', self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const admin = windows.find((w) => new URL(w.url).pathname.startsWith('/admin'));
    if (admin) {
      await admin.focus();
      // The admin page moves to the link itself (AdminLayout), keeping its sign-in.
      admin.postMessage({ type: 'open', url: url.pathname + url.search });
      return;
    }
    await self.clients.openWindow(url.href);
  })());
});
