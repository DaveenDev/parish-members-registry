// Vercel Function: /sitemap.xml (vercel.json), made fresh from what's
// published (lib/sitemap.js), with the public (anon) key as the site reads it.
// If the database can't be reached, it still lists the main pages.

import { sitemapXml } from '../src/lib/sitemap.js';

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';
const TABLES = ['events', 'announcements', 'bulletins', 'articles', 'songs'];

async function rest(path, init = {}) {
  if (!SUPABASE_URL || !ANON_KEY) return [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json', ...init.headers },
      signal: AbortSignal.timeout(5000),
    });
    const data = res.ok ? await res.json() : [];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function GET(request) {
  const { origin } = new URL(request.url);
  const lists = await Promise.all([
    ...TABLES.map((t) => rest(`${t}?select=id,created_at,updated_at&published=eq.true&order=id`)),
    rest('rpc/public_gkk_directory', { method: 'POST', body: '{}' }),
  ]);
  const items = Object.fromEntries(TABLES.map((t, i) => [t, lists[i]]));
  items.gkks = lists[TABLES.length];
  return new Response(sitemapXml(origin, items), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
