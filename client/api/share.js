// Vercel Function: a shared link as Facebook, Messenger, Viber and other
// preview robots see it. vercel.json sends only those robots here (by user
// agent), with the address asked for in ?path=. The answer is the site's own
// index.html with that page's title, text and photo in its tags
// (lib/share.js); the robots don't run the site, so without this every link
// showed the parish's default card. Anything that goes wrong gives
// index.html's own tags, as before.
//
// It reads the database with the public (anon) key, as the site does, from
// the project's VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY settings.

import { absoluteImage, injectMeta, itemPreview, pagePreview, shareTarget } from '../src/lib/share.js';
import { plainLetters } from '../src/lib/util.js';

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || '';

async function rest(path, init = {}) {
  if (!SUPABASE_URL || !ANON_KEY) return null;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(4000),
  });
  return res.ok ? res.json() : null;
}

const rpc = (fn, args = {}) => rest(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

/** The item a shared address is about, as its page reads it (published only: the anon key's rules). */
async function loadItem({ kind, id }) {
  if (kind === 'gkk') {
    const [dir, page] = await Promise.all([rpc('public_gkk_directory'), rpc('public_gkk_page', { p_name: id }).catch(() => null)]);
    const row = Array.isArray(dir) ? dir.find((g) => g.name === id) : null;
    return row && { ...row, photo_url: page?.photo_url || null };
  }
  // Only what the wall shows (0100): no contact details, and null once it's no longer shown.
  if (kind === 'prayers') return rpc('public_prayer_request', { p_id: Number(id), p_visitor: null });
  const rows = await rest(`${kind}?select=*&published=eq.true&id=eq.${Number(id)}&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : null;
  // As the site shows it: Facebook's "bold" math letters as plain ones (listPublished).
  return row ? Object.fromEntries(Object.entries(row).map(([k, v]) => [k, plainLetters(v)])) : null;
}

export async function GET(request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const pathname = (url.searchParams.get('path') || '/').split(/[?#]/)[0] || '/';
  const html = await fetch(`${origin}/index.html`, { signal: AbortSignal.timeout(4000) }).then((r) => (r.ok ? r.text() : null)).catch(() => null);
  if (!html) return new Response('Try again shortly', { status: 503, headers: { 'Retry-After': '60' } });

  // The parish's name as saved in Parish Config, for the titles and descriptions.
  const parish = String((await rpc('public_office_details').catch(() => null))?.name || '').trim();
  let preview = pagePreview(pathname, parish);
  try {
    const target = shareTarget(pathname);
    if (target.kind !== 'page') preview = itemPreview(target.kind, await loadItem(target), parish) || preview;
    // No photo of its own: the parish photo, when it's one a robot can fetch (on R2, not inline).
    if (!preview.image) preview = { ...preview, image: await rpc('public_parish_hero_image').catch(() => null) };
  } catch {
    // The page's section tags, as above.
  }
  const image = absoluteImage(preview.image, origin);

  return new Response(injectMeta(html, { ...preview, image }, { origin, pathname, parish }), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Robots ask again and again; an edit shows in previews within ten minutes.
      'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600',
    },
  });
}
