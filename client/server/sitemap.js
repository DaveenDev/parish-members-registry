// /sitemap.xml, made fresh from what's published (src/lib/sitemap.js), with
// the public (anon) key as the site reads it. If the database can't be
// reached, it still lists the main pages. Served by api/sitemap.js on Vercel
// and worker/index.js on Cloudflare.

import { sitemapXml } from '../src/lib/sitemap.js';
import { supabaseReader } from './supabase.js';

const TABLES = ['events', 'announcements', 'bulletins', 'articles', 'songs'];

/** The sitemap of the site at `origin`; `supabase` is { url, anonKey }. */
export async function sitemapResponse({ origin, supabase }) {
  const { rest } = supabaseReader({ ...supabase, timeoutMs: 5000 });
  const list = (path, init) => rest(path, init).then((d) => (Array.isArray(d) ? d : []), () => []);
  const lists = await Promise.all([
    ...TABLES.map((t) => list(`${t}?select=id,${t === 'songs' ? 'title,' : ''}created_at,updated_at&published=eq.true&order=id`)),
    list('rpc/public_gkk_directory', { method: 'POST', body: '{}' }),
    list('sacrament_guides?select=key,created_at,updated_at&published=eq.true&order=sort,id'),
  ]);
  const items = Object.fromEntries(TABLES.map((t, i) => [t, lists[i]]));
  items.gkks = lists[TABLES.length];
  items.guides = lists[TABLES.length + 1];
  return new Response(sitemapXml(origin, items), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
