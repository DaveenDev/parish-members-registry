// The Cloudflare Worker in front of the built site (dist/), doing what
// vercel.json and api/ do on Vercel:
//
// - /media/*      photos and videos from the R2 bucket's r2.dev address
//                 (MEDIA_ORIGIN in wrangler.jsonc), fetched here so internet
//                 providers that block r2.dev don't matter, cached a year;
// - /sitemap.xml  made fresh from what's published (server/sitemap.js);
// - /robots.txt   public/robots.txt, its Sitemap: line on this site's address;
// - preview robots (Facebook, Messenger, Viber, ...) get the page's own
//                 title, text and photo (server/share.js);
// - every other address is the site itself (index.html for deep links like
//   /pahibalo/12), with the security headers and noindex on /admin and /census.
//
// worker/index.js gives it the Supabase settings; tests call handle() directly.

import { PREVIEW_BOTS } from '../src/lib/share.js';
import { shareResponse } from '../server/share.js';
import { sitemapResponse } from '../server/sitemap.js';
import { MEDIA_CACHE_CONTROL, NOINDEX, NOINDEX_SOURCE, PREVIEW_SOURCE, SECURITY_HEADERS } from '../server/rules.js';

const PREVIEW_UA = new RegExp(`(${PREVIEW_BOTS.join('|')})`);
const PREVIEW_PATH = new RegExp(`^${PREVIEW_SOURCE}$`);
const NOINDEX_PATH = new RegExp(`^${NOINDEX_SOURCE}$`);
// What a photo or video request passes on to R2: ranges, so videos can seek.
const MEDIA_REQUEST_HEADERS = ['range', 'if-none-match', 'if-modified-since', 'if-range'];

const isRead = (request) => request.method === 'GET' || request.method === 'HEAD';
const on = (value) => /^(1|true|yes|on)$/i.test(String(value ?? '').trim());

async function media(request, env, url) {
  const origin = String(env.MEDIA_ORIGIN || '').replace(/\/+$/, '');
  if (!origin) return new Response('Photo storage is not set up', { status: 404 });
  if (!isRead(request)) return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
  const headers = new Headers();
  for (const h of MEDIA_REQUEST_HEADERS) if (request.headers.has(h)) headers.set(h, request.headers.get(h));
  let upstream;
  try {
    upstream = await fetch(`${origin}${url.pathname.slice('/media'.length)}${url.search}`, {
      method: request.method,
      headers,
      // Kept at Cloudflare's edge where it can; never a missing photo, so a new upload shows at once.
      cf: { cacheTtlByStatus: { '200-299': 31536000, '300-599': 0 } },
    });
  } catch {
    return new Response('Photo storage is not reachable', { status: 502 });
  }
  const res = new Response(upstream.body, upstream);
  res.headers.delete('set-cookie');
  if (upstream.ok || upstream.status === 304) res.headers.set('Cache-Control', MEDIA_CACHE_CONTROL);
  return res;
}

async function robots(request, env, url) {
  const res = await env.ASSETS.fetch(request);
  if (!res.ok) return res;
  const text = (await res.text()).replace(/^Sitemap:.*$/m, `Sitemap: ${url.origin}/sitemap.xml`);
  const out = new Response(text, res);
  out.headers.delete('content-length');
  out.headers.delete('etag');
  return out;
}

async function route(request, env, url, supabase) {
  const { pathname } = url;
  if (pathname === '/media' || pathname.startsWith('/media/')) return media(request, env, url);
  if (pathname === '/sitemap.xml') return sitemapResponse({ origin: url.origin, supabase });
  if (pathname === '/robots.txt') return robots(request, env, url);
  if (isRead(request) && PREVIEW_UA.test(request.headers.get('user-agent') || '') && PREVIEW_PATH.test(pathname)) {
    return shareResponse({
      origin: url.origin,
      pathname,
      guide: url.searchParams.get('guide') || '',
      indexHtml: () => env.ASSETS.fetch(new URL('/', url)).then((r) => (r.ok ? r.text() : null)),
      supabase,
    });
  }
  // The site's own files; any other address is index.html (single-page-application in wrangler.jsonc).
  return env.ASSETS.fetch(request);
}

/** One request. `supabase` is { url, anonKey }, the site's public settings. */
export async function handle(request, env, supabase) {
  const url = new URL(request.url);
  const routed = await route(request, env, url, supabase);
  const res = new Response(routed.body, routed); // a copy whose headers can be changed
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  // NOINDEX in wrangler.jsonc keeps the whole site out of search engines (a demo or test copy).
  if (on(env.NOINDEX) || NOINDEX_PATH.test(url.pathname)) res.headers.set('X-Robots-Tag', NOINDEX);
  return res;
}
