// Link previews for Facebook, Messenger, Viber, WhatsApp and the like. Their
// preview robots read a page's tags without running the site, so every link
// showed index.html's card. vercel.json sends those robots (by user agent) to
// api/share.js, which fills index.html's tags with the page's own title, text
// and photo from what's worked out here. People and Google get the site as
// before: lib/seo.js sets the same tags once the page loads.

import { canonicalUrl, excerpt, pageDescription } from './seo.js';
import { BIS_DAYS, eventDays, fmtLong, fmtShort, parseIso } from './site.js';
import { songIdFromParam } from './downloads.js';
import { prayerTitle } from './prayers.js';
import { parishTitle } from './parishName.js';

// `parish` below is the name saved in Parish Config (public_office_details), '' for none.

// The preview robots, as vercel.json's rewrite matches them (keep the two the same).
export const PREVIEW_BOTS = ['facebookexternalhit', 'Facebot', 'meta-externalagent', 'Twitterbot', 'WhatsApp', 'TelegramBot', 'Slackbot', 'LinkedInBot', 'Discordbot', 'Viber', 'SkypeUriPreview', 'Pinterest', 'redditbot', 'Embedly'];

// A page with no item of its own: its name in the preview, as in the browser tab.
const PAGE_TITLES = [
  ['/simbahan/pagbasa', 'Mga Pagbasa'],
  ['/simbahan/kasaysayan', 'Kasaysayan'],
  ['/simbahan', 'Ang Simbahan'],
  ['/pahibalo', 'Pahibalo ug Kalihokan'],
  ['/komunidad/artikulo', 'Mga Artikulo'],
  ['/komunidad/pag-ampo', 'Mga Hangyo sa Pag-ampo'],
  ['/komunidad', 'Komunidad'],
  ['/serbisyo/dugo', 'Blood Donor Call'],
  ['/serbisyo/susiha', 'Susiha ang Rehistro'],
  ['/serbisyo/hangyo', 'Paghangyo'],
  ['/serbisyo', 'Mga Serbisyo'],
  ['/downloads', 'Downloads'],
  ['/kontak', 'Kontak'],
];

/**
 * What a shared address shows: { kind, id } for one item (an event,
 * announcement, bulletin, article, GKK, song or prayer request), else
 * { kind: 'page' }.
 */
export function shareTarget(pathname) {
  const p = String(pathname || '/').replace(/\/+$/, '') || '/';
  const parts = p.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  const id = (s) => (/^\d+$/.test(s || '') ? Number(s) : null);
  const [a, b, c] = parts;
  if (parts.length === 3 && a === 'misa' && b === 'kalihokan' && id(c)) return { kind: 'events', id: id(c) };
  if (parts.length === 3 && a === 'pahibalo' && b === 'bulletin' && id(c)) return { kind: 'bulletins', id: id(c) };
  if (parts.length === 3 && ((a === 'pahibalo' && b === 'artikulo') || (a === 'komunidad' && (b === 'artikulo' || b === 'balita'))) && id(c)) return { kind: 'articles', id: id(c) };
  if (parts.length === 2 && a === 'pahibalo' && id(b)) return { kind: 'announcements', id: id(b) };
  if (parts.length === 3 && a === 'komunidad' && b === 'gkk' && c) return { kind: 'gkk', id: c };
  if (parts.length === 3 && a === 'komunidad' && b === 'pag-ampo' && id(c)) return { kind: 'prayers', id: id(c) };
  // A song's address is its id and title: /downloads/kanta/12-ginoo-kaloy-i-kami.
  if (parts.length === 3 && a === 'downloads' && b === 'kanta' && songIdFromParam(c)) return { kind: 'songs', id: songIdFromParam(c) };
  return { kind: 'page' };
}

// As the browser tab names it (SiteLayout): "Kontak · St. Joseph", or the parish alone.
function fullTitle(name, parish) {
  const t = parishTitle(parish);
  return name ? `${name} · ${t.name}` : t.title;
}

/** A main or inner page's preview (no item): its section's name and description. */
export function pagePreview(pathname, parish) {
  const p = String(pathname || '/');
  const hit = PAGE_TITLES.find(([start]) => p === start || p.startsWith(`${start}/`));
  return { title: fullTitle(hit?.[1], parish), description: pageDescription(p, parish), image: null, type: 'website' };
}

/** When an event is, as its page says it: "Sabado, 18 Oktubre 2026" or "18 Okt – 20 Okt". */
function eventWhen(e) {
  if (!e.start_date) return '';
  return eventDays(e) > 1 ? `${fmtShort(e.start_date)} – ${fmtShort(e.end_date)}` : `${BIS_DAYS[parseIso(e.start_date).getDay()]}, ${fmtLong(e.start_date)}`;
}

/**
 * One item's preview, as its page describes it (<PageMeta> in Details.jsx,
 * Komunidad.jsx, Prayers.jsx and Downloads.jsx). `row` is the item (for a GKK, its
 * directory row with the page's photo_url); null when there's none.
 */
export function itemPreview(kind, row, parish) {
  if (!row) return null;
  const article = (description, image) => ({ title: fullTitle(row.title, parish), description, image: image || null, type: 'article' });
  switch (kind) {
    case 'events':
      return article(excerpt([eventWhen(row), row.location, row.description].filter(Boolean).join(' · ')), row.photo_url);
    case 'announcements':
      return article(excerpt(row.body), row.photo_url);
    case 'bulletins':
      return article(excerpt(row.body) || (row.week_of ? `Bulletin sa semana sa ${fmtLong(row.week_of)}` : ''), row.photo_url);
    case 'articles':
      return article(excerpt(row.summary || row.body), row.photo_url);
    case 'songs':
      return {
        title: fullTitle(`${row.title} (Lyrics)`, parish),
        description: excerpt(`Lyrics: ${row.title}${row.composer ? `, ni ${row.composer}` : ''}. ${String(row.lyrics || '').replace(/\s+/g, ' ')}`),
        image: null,
        type: 'article',
      };
    // As public_prayer_request() (0100) gives it: never a contact detail, the name only if they chose.
    case 'prayers':
      return { title: fullTitle(`Hangyo sa pag-ampo: ${prayerTitle(row)}`, parish), description: excerpt(row.intention), image: null, type: 'article' };
    case 'gkk':
      return {
        title: fullTitle(row.name, parish),
        description: excerpt([`${row.name}, usa sa mga GKK sa ${parish || 'parokya'}`, row.puroks, row.chapel_address && `Kapilya: ${row.chapel_address}`, row.meeting_schedule && `Bible-sharing: ${row.meeting_schedule}`].filter(Boolean).join(' · ')),
        image: row.photo_url || null,
        type: 'website',
      };
    default:
      return null;
  }
}

/** Text safe inside an HTML attribute or element. */
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** A photo address made whole (a /media/… one gets the site's origin); null for none or an inline image. */
export function absoluteImage(image, origin) {
  if (!image || /^data:/.test(image)) return null;
  try { return new URL(image, origin).href; } catch { return null; }
}

/**
 * index.html with the preview's tags in place of its own: the title,
 * description, Open Graph tags and canonical address, and the site's name
 * when `parish` (Parish Config's) is given. A photo of the page's own drops
 * index.html's 512×512 icon size and asks for the large card.
 */
export function injectMeta(html, { title, description, image, type = 'website' }, { origin, pathname, parish = '' }) {
  const url = canonicalUrl(origin, pathname);
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  let out = String(html)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${d}" />`)
    .replace(/<meta property="og:type" content="[^"]*"\s*\/?>/, `<meta property="og:type" content="${escapeHtml(type)}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${t}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${d}" />`)
    .replace(/<meta property="og:image:alt" content="[^"]*"\s*\/?>/, `<meta property="og:image:alt" content="${t}" />`);
  if (parish) out = out.replace(/<meta property="og:site_name" content="[^"]*"\s*\/?>/, `<meta property="og:site_name" content="${escapeHtml(parish)}" />`);
  if (image) {
    out = out
      .replace(/<meta property="og:image" content="[^"]*"\s*\/?>/, `<meta property="og:image" content="${escapeHtml(image)}" />`)
      .replace(/\s*<meta property="og:image:(width|height)" content="[^"]*"\s*\/?>/g, '')
      .replace(/<meta name="twitter:card" content="[^"]*"\s*\/?>/, '<meta name="twitter:card" content="summary_large_image" />');
  }
  const extra = `<meta property="og:url" content="${escapeHtml(url)}" />\n  <link rel="canonical" href="${escapeHtml(url)}" />\n`;
  return out.replace('</head>', `  ${extra}</head>`);
}
