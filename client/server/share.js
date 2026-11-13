// A shared link as Facebook, Messenger, Viber and other preview robots see
// it. The host sends only those robots here (by user agent: vercel.json on
// Vercel, worker/index.js on Cloudflare), with the address they asked for.
// The answer is the site's own index.html with that page's title, text and
// photo in its tags (src/lib/share.js); the robots don't run the site, so
// without this every link showed the parish's default card. Anything that
// goes wrong gives index.html's own tags.

import { absoluteImage, injectMeta, itemPreview, pagePreview, previewPath, shareTarget } from '../src/lib/share.js';
import { plainLetters } from '../src/lib/util.js';
import { supabaseReader } from './supabase.js';

/** The item a shared address is about, as its page reads it (published only: the anon key's rules). */
async function loadItem({ rest, rpc }, { kind, id }) {
  if (kind === 'gkk') {
    const [dir, page] = await Promise.all([rpc('public_gkk_directory'), rpc('public_gkk_page', { p_name: id }).catch(() => null)]);
    const row = Array.isArray(dir) ? dir.find((g) => g.name === id) : null;
    return row && { ...row, photo_url: page?.photo_url || null };
  }
  if (kind === 'guides') {
    const rows = await rest(`sacrament_guides?select=*&published=eq.true&key=eq.${encodeURIComponent(id)}&limit=1`);
    return Array.isArray(rows) ? rows[0] || null : null;
  }
  // Only what the wall shows (0100): no contact details, and null once it's no longer shown.
  if (kind === 'prayers') return rpc('public_prayer_request', { p_id: Number(id), p_visitor: null });
  const rows = await rest(`${kind}?select=*&published=eq.true&id=eq.${Number(id)}&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : null;
  // As the site shows it: Facebook's "bold" math letters as plain ones (listPublished).
  return row ? Object.fromEntries(Object.entries(row).map(([k, v]) => [k, plainLetters(v)])) : null;
}

/**
 * The preview page for `pathname` on the site at `origin`. `pathname` may carry
 * its query, and a sacrament guide's ?guide= (guidePath) comes in `guide` or there.
 * `indexHtml()` gives the built index.html as text (null if it can't be read);
 * `supabase` is { url, anonKey }.
 */
export async function shareResponse({ origin, pathname, guide: askedGuide, indexHtml, supabase }) {
  const asked = String(pathname || '/');
  const path = asked.split(/[?#]/)[0] || '/';
  const guide = askedGuide || new URLSearchParams(asked.split('?')[1] || '').get('guide') || '';
  const html = await Promise.resolve().then(indexHtml).catch(() => null);
  if (!html) return new Response('Try again shortly', { status: 503, headers: { 'Retry-After': '60' } });

  const db = supabaseReader(supabase);
  // The parish's name as saved in Parish Config, for the titles and descriptions.
  const parish = String((await db.rpc('public_office_details').catch(() => null))?.name || '').trim();
  let preview = pagePreview(path, parish);
  let target = { kind: 'page' };
  try {
    target = shareTarget(path, guide);
    if (target.kind !== 'page') preview = itemPreview(target.kind, await loadItem(db, target), parish) || preview;
    // No photo of its own: the parish photo, when it's one a robot can fetch (on R2, not inline).
    if (!preview.image) preview = { ...preview, image: await db.rpc('public_parish_hero_image').catch(() => null) };
  } catch {
    // The page's section tags, as above.
  }
  const image = absoluteImage(preview.image, origin);

  return new Response(injectMeta(html, { ...preview, image }, { origin, pathname: previewPath(path, target), parish }), {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Robots ask again and again; an edit shows in previews within ten minutes.
      'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600',
    },
  });
}
