// What the host adds around the built site, in one place for both hosts:
// worker/app.js (Cloudflare) uses these directly, and test/hosting.test.js
// checks that client/vercel.json says the same, so the two can't drift apart.

/** On every response. */
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "frame-ancestors 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

/** Photos under /media: their names are never reused (see docs/media-storage.md), so a year. */
export const MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** The staff admin and the census family portal stay out of search engines. */
export const NOINDEX = 'noindex, nofollow';
export const NOINDEX_SOURCE = '/(admin|census)(.*)';

/**
 * The addresses a preview robot gets a preview card for (as a vercel.json
 * `source`): every page of the site, but not files, photos, the admin, the
 * census or registration.
 */
export const PREVIEW_SOURCE = '/((?!api/|assets/|media/|icons/|admin|census|register|sitemap|robots|favicon|sw\\.js).*)';
