// Search engines and link previews for the public website. The site is a
// single-page app, so every URL is served the same index.html (with the
// parish's default title, description and preview card); Google runs the app
// and reads what's set here per page: the title, description, canonical
// address, robots rule, the Open Graph tags and, on Home, the parish's
// structured data. The pure parts are tested; applyPageMeta() writes the tags.
//
// `parish` below is the parish's name as saved in Parish Config ("sa
// parokya" when none is given).

const sa = (parish) => String(parish || '').trim() || 'parokya';

/** The default description: the site's own pages, with the parish's name. */
export const siteDescription = (parish) => `${String(parish || '').trim() || 'Ang parokya'}: oras sa Misa, pahibalo ug kalihokan, mga GKK, ug rehistro sa mga pamilya sa parokya.`;

// Each page's description, by its address (the longest matching start wins).
const DESCRIPTIONS = [
  ['/simbahan/pagbasa', (p) => `Mga pagbasa sa Misa karong adlawa ug sa umaabot nga Domingo, gikan sa ${sa(p)}.`],
  ['/simbahan/kasaysayan', (p) => `Ang kasaysayan sa ${sa(p)}.`],
  ['/simbahan', (p) => `Oras sa Misa, mga sakramento ug unsaon pagpangandam alang niini sa ${sa(p)}.`],
  ['/misa', (p) => `Oras sa Misa ug mga kalihokan sa ${sa(p)}.`],
  ['/pahibalo', (p) => `Mga pahibalo, bulletin ug kalihokan sa ${sa(p)}.`],
  ['/komunidad/artikulo', (p) => `Mga artikulo ug balita gikan sa ${sa(p)}.`],
  ['/komunidad/pag-ampo', (p) => `Mga hangyo sa pag-ampo gikan sa mga parokyano sa ${sa(p)}: mag-ampo kita alang sa usag usa.`],
  ['/komunidad/gkk', (p) => `Usa sa mga GKK (Gagmayng Kristohanong Katilingban) sa ${sa(p)}.`],
  ['/komunidad', (p) => `Ang mga GKK, mga artikulo, mga hangyo sa pag-ampo ug kinabuhi sa komunidad sa ${sa(p)}.`],
  ['/serbisyo/dugo', (p) => `Blood Donor Call sa ${sa(p)}: mga nanginahanglan og dugo ug unsaon pagtabang.`],
  ['/serbisyo/hangyo', (p) => `Paghangyo og sertipiko, sakramento o pag-ampo sa ${sa(p)}, online.`],
  ['/serbisyo', (p) => `Mga serbisyo sa parokya: sertipiko, sakramento, rehistro sa pamilya ug Blood Donor Call sa ${sa(p)}.`],
  ['/downloads/kanta', (p) => `Song lyrics, libre: liriko sa kanta gikan sa ${sa(p)}.`],
  ['/downloads', (p) => `Mga porma sa GKK, census ug uban pa gikan sa opisina sa ${sa(p)}: i-download ug i-print. Ug free Bisaya Catholic song lyrics sa Kasaulogan sa GKK, Bible Service ug Misa.`],
  ['/kontak', (p) => `Kontak, oras sa opisina ug direksyon padulong sa ${sa(p)}.`],
];

// Pages search engines shouldn't list: a status lookup with nothing to read.
const NOINDEX = ['/serbisyo/susiha'];

/** The description for a page with no text of its own (`pathname` without the query). */
export function pageDescription(pathname, parish) {
  const p = String(pathname || '/');
  const hit = DESCRIPTIONS.find(([start]) => p === start || p.startsWith(`${start}/`));
  return hit ? hit[1](parish) : siteDescription(parish);
}

/** Whether search engines should leave a page out of their results. */
export const pageNoindex = (pathname) => NOINDEX.some((start) => pathname === start || String(pathname).startsWith(`${start}/`));

/**
 * A page's own text cut to a search-result description (about 160
 * characters): one line, ending on a whole word with "…" when cut.
 * '' for no text.
 */
export function excerpt(text, max = 160) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

/** The page's own address for search engines: no query or hash, no trailing slash (but "/"). */
export function canonicalUrl(origin, pathname) {
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';
  return `${String(origin).replace(/\/+$/, '')}${path}`;
}

/**
 * The parish as structured data (schema.org Church) for Google's local
 * results: name, address, map pin and contact, from the office details in
 * Parish Website → Office (with the built-in address and pin until set).
 */
export function parishJsonLd({ name, url, logo, address, coords, mapUrl, phone, email, facebook }) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Church',
    name,
    url,
    address: { '@type': 'PostalAddress', streetAddress: address, addressCountry: 'PH' },
    geo: coords ? { '@type': 'GeoCoordinates', latitude: Number(coords.latitude), longitude: Number(coords.longitude) } : undefined,
    hasMap: mapUrl || undefined,
    logo: logo && /^https?:/.test(logo) ? logo : undefined,
    image: logo && /^https?:/.test(logo) ? logo : undefined,
    telephone: phone || undefined,
    email: email || undefined,
    sameAs: facebook ? [facebook] : undefined,
  };
  return JSON.parse(JSON.stringify(data)); // drops the undefined ones
}

// ---- writing the tags -----------------------------------------------------

/** The element in <head> matching `selector`, made with `make()` when there's none. */
function headTag(selector, make) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = make();
    document.head.appendChild(el);
  }
  return el;
}

/** Set <meta {attr}="{key}" content="…">, or remove it for no content. */
function setMeta(attr, key, content) {
  const selector = `meta[${attr}="${key}"]`;
  if (!content) {
    document.head.querySelector(selector)?.remove();
    return;
  }
  headTag(selector, () => {
    const el = document.createElement('meta');
    el.setAttribute(attr, key);
    return el;
  }).setAttribute('content', content);
}

/**
 * Leaving the website for a page outside it (registration, the census
 * portal, the admin): the parish's title and the site's description, and
 * nothing that named a website page (canonical, robots, address, structured data).
 */
export function resetPageMeta(title, parish) {
  document.title = title;
  setMeta('name', 'description', siteDescription(parish));
  setMeta('property', 'og:url', '');
  setMeta('name', 'robots', '');
  document.head.querySelector('link[rel="canonical"]')?.remove();
  document.head.querySelector('script[data-seo="jsonld"]')?.remove();
}

// index.html's preview image, for pages without a photo of their own.
let defaultImage;

/**
 * Write one page's tags: the tab title, description, canonical link, robots
 * rule and Open Graph title, description, address and image (the page's
 * photo, else index.html's). `jsonLd` (an object) is set as the page's
 * structured data; null removes it.
 */
export function applyPageMeta({ title, description, url, image, noindex = false, jsonLd = null }) {
  if (defaultImage === undefined) defaultImage = document.head.querySelector('meta[property="og:image"]')?.getAttribute('content') || '';
  document.title = title;
  setMeta('name', 'description', description);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', url);
  setMeta('property', 'og:image', image || defaultImage);
  setMeta('name', 'robots', noindex ? 'noindex' : '');
  headTag('link[rel="canonical"]', () => Object.assign(document.createElement('link'), { rel: 'canonical' })).setAttribute('href', url);
  if (jsonLd) {
    headTag('script[data-seo="jsonld"]', () => {
      const s = document.createElement('script');
      s.type = 'application/ld+json';
      s.dataset.seo = 'jsonld';
      return s;
    }).textContent = JSON.stringify(jsonLd);
  } else {
    document.head.querySelector('script[data-seo="jsonld"]')?.remove();
  }
}
