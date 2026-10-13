// The website's sitemap.xml (api/sitemap.js): the main pages, then every
// published event, announcement, bulletin, article, GKK page and song, so
// search engines find each one without following links to it.

import { canonicalUrl } from './seo.js';
import { songPath } from './downloads.js';

// The main pages, as public/sitemap.xml listed them.
export const SITEMAP_PAGES = [
  ['/', 'daily', '1.0'],
  ['/simbahan', 'weekly', '0.9'],
  ['/pahibalo', 'daily', '0.9'],
  ['/komunidad', 'weekly', '0.8'],
  ['/komunidad/artikulo', 'weekly', '0.7'],
  ['/serbisyo', 'monthly', '0.8'],
  ['/downloads', 'weekly', '0.7'],
  ['/kontak', 'monthly', '0.8'],
  ['/simbahan/pagbasa', 'daily', '0.6'],
  ['/simbahan/kasaysayan', 'yearly', '0.6'],
  ['/serbisyo/dugo', 'weekly', '0.5'],
  ['/register', 'yearly', '0.5'],
];

// Each kind of item: its address and how often it's likely to change.
const ITEM_PATHS = {
  events: (r) => `/misa/kalihokan/${r.id}`,
  announcements: (r) => `/pahibalo/${r.id}`,
  bulletins: (r) => `/pahibalo/bulletin/${r.id}`,
  articles: (r) => `/komunidad/artikulo/${r.id}`,
  songs: songPath, // with its title, as the site links it
  gkks: (r) => `/komunidad/gkk/${encodeURIComponent(r.name)}`,
};

const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

/** A row's last change as YYYY-MM-DD, or '' when it has none. */
const lastmod = (r) => {
  const d = r.updated_at || r.created_at;
  return d && !Number.isNaN(Date.parse(d)) ? new Date(d).toISOString().slice(0, 10) : '';
};

/** One <url> entry. */
function entry(loc, { changefreq, priority, mod } = {}) {
  return `  <url><loc>${xml(loc)}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ''}${changefreq ? `<changefreq>${changefreq}</changefreq>` : ''}${priority ? `<priority>${priority}</priority>` : ''}</url>`;
}

/** sitemap.xml for `origin`: the main pages, then `items` ({ events: rows, articles: rows, gkks: rows… }). */
export function sitemapXml(origin, items = {}) {
  const lines = SITEMAP_PAGES.map(([path, changefreq, priority]) => entry(canonicalUrl(origin, path), { changefreq, priority }));
  for (const [kind, toPath] of Object.entries(ITEM_PATHS)) {
    for (const r of items[kind] || []) {
      if (kind === 'gkks' ? !r?.name : !r?.id) continue;
      lines.push(entry(canonicalUrl(origin, toPath(r)), { mod: lastmod(r), priority: '0.6' }));
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${lines.join('\n')}\n</urlset>\n`;
}
