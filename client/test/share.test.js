import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { PREVIEW_BOTS, SITE_TITLE, absoluteImage, escapeHtml, injectMeta, itemPreview, pagePreview, shareTarget } from '../src/lib/share.js';
import { SITEMAP_PAGES, sitemapXml } from '../src/lib/sitemap.js';

const INDEX = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const VERCEL = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

describe('shareTarget', () => {
  test('each kind of item page', () => {
    assert.deepEqual(shareTarget('/misa/kalihokan/12'), { kind: 'events', id: 12 });
    assert.deepEqual(shareTarget('/pahibalo/7'), { kind: 'announcements', id: 7 });
    assert.deepEqual(shareTarget('/pahibalo/bulletin/3'), { kind: 'bulletins', id: 3 });
    assert.deepEqual(shareTarget('/komunidad/artikulo/5/'), { kind: 'articles', id: 5 });
    assert.deepEqual(shareTarget('/pahibalo/artikulo/5'), { kind: 'articles', id: 5 });
    assert.deepEqual(shareTarget('/komunidad/balita/5'), { kind: 'articles', id: 5 });
    assert.deepEqual(shareTarget('/downloads/kanta/9'), { kind: 'songs', id: 9 });
    assert.deepEqual(shareTarget('/downloads/kanta/30-amahan-namo'), { kind: 'songs', id: 30 });
    assert.deepEqual(shareTarget('/komunidad/gkk/GKK%20San%20Isidro'), { kind: 'gkk', id: 'GKK San Isidro' });
  });

  test('anything else is a page', () => {
    for (const p of ['/', '/pahibalo', '/pahibalo/abc', '/komunidad/artikulo', '/misa/kalihokan/x', '/kontak']) {
      assert.deepEqual(shareTarget(p), { kind: 'page' }, p);
    }
  });
});

describe('previews', () => {
  test('a main page by its section name, Home by the parish', () => {
    assert.equal(pagePreview('/').title, SITE_TITLE);
    assert.match(pagePreview('/kontak').title, /^Kontak · /);
    assert.match(pagePreview('/simbahan/pagbasa').title, /^Mga Pagbasa · /);
    assert.match(pagePreview('/simbahan').description, /Oras sa Misa/);
  });

  test('an event says when and where, with its photo', () => {
    const p = itemPreview('events', { title: 'Fiesta', start_date: '2026-12-12', location: 'Simbahan', description: 'Misa ug prosesyon', photo_url: '/media/events/a.jpg' });
    assert.match(p.title, /^Fiesta · /);
    assert.match(p.description, /Sabado, .*12.* · Simbahan · Misa ug prosesyon/);
    assert.equal(p.image, '/media/events/a.jpg');
    assert.equal(p.type, 'article');
  });

  test('an article by its summary, a song by its lyrics', () => {
    assert.equal(itemPreview('articles', { title: 'A', summary: 'Mubo', body: 'Taas nga sulat' }).description, 'Mubo');
    const song = itemPreview('songs', { title: 'Amahan Namo', composer: 'X', lyrics: 'Amahan namo\nnga anaa sa langit' });
    assert.match(song.title, /^Amahan Namo \(Lyrics\)/);
    assert.match(song.description, /ni X\. Amahan namo nga anaa sa langit/);
  });

  test('no row, no preview', () => {
    assert.equal(itemPreview('events', null), null);
  });
});

describe('injectMeta', () => {
  const at = { origin: 'https://example.org', pathname: '/komunidad/artikulo/5' };

  test('index.html carries the page’s title, text, address and photo', () => {
    const html = injectMeta(INDEX, { title: 'Pista <2026>', description: 'Ang "pista"', image: 'https://example.org/media/a.jpg', type: 'article' }, at);
    assert.match(html, /<title>Pista &lt;2026&gt;<\/title>/);
    assert.match(html, /<meta property="og:title" content="Pista &lt;2026&gt;" \/>/);
    assert.match(html, /<meta property="og:description" content="Ang &quot;pista&quot;" \/>/);
    assert.match(html, /<meta name="description" content="Ang &quot;pista&quot;" \/>/);
    assert.match(html, /<meta property="og:image" content="https:\/\/example.org\/media\/a.jpg" \/>/);
    assert.match(html, /<meta property="og:type" content="article" \/>/);
    assert.match(html, /<meta property="og:url" content="https:\/\/example.org\/komunidad\/artikulo\/5" \/>/);
    assert.match(html, /<link rel="canonical" href="https:\/\/example.org\/komunidad\/artikulo\/5" \/>/);
    assert.match(html, /summary_large_image/);
    assert.doesNotMatch(html, /og:image:width/);
  });

  test('without a photo, index.html’s image and size stay', () => {
    const html = injectMeta(INDEX, { title: 'Kontak', description: 'D', image: null }, at);
    assert.match(html, /og:image:width/);
    assert.match(html, /icon-512\.png/);
  });

  test('index.html still has every tag it replaces', () => {
    for (const re of [/<title>/, /<meta name="description"/, /<meta property="og:type"/, /<meta property="og:title"/, /<meta property="og:description"/, /<meta property="og:image"/, /<meta name="twitter:card"/]) {
      assert.match(INDEX, re);
    }
  });

  test('escapeHtml and absoluteImage', () => {
    assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    assert.equal(absoluteImage('/media/a.jpg', 'https://example.org'), 'https://example.org/media/a.jpg');
    assert.equal(absoluteImage('data:image/png;base64,AAA', 'https://example.org'), null);
    assert.equal(absoluteImage('', 'https://example.org'), null);
  });
});

test('vercel.json sends the same preview robots to api/share as lib/share.js names', () => {
  const rule = VERCEL.rewrites.find((r) => r.destination.startsWith('/api/share'));
  const ua = rule.has.find((h) => h.key === 'user-agent').value;
  const names = ua.match(/\(([^)]*)\)/)[1].split('|');
  assert.deepEqual(names, PREVIEW_BOTS);
  const source = new RegExp(`^${rule.source}$`);
  assert.ok(source.test('/komunidad/artikulo/5'));
  assert.ok(source.test('/'));
  for (const p of ['/api/share', '/assets/index.js', '/media/a.jpg', '/admin', '/admin/members', '/census', '/register', '/sitemap.xml', '/robots.txt']) {
    assert.ok(!source.test(p), p);
  }
  // Before the catch-all, which would otherwise take the robots too.
  const i = VERCEL.rewrites.indexOf(rule);
  assert.ok(i < VERCEL.rewrites.findIndex((r) => r.source === '/(.*)'));
});

describe('sitemapXml', () => {
  test('the main pages, then each item by its own address', () => {
    const xml = sitemapXml('https://example.org/', {
      events: [{ id: 4, updated_at: '2026-10-01T05:00:00Z' }],
      articles: [{ id: 2, created_at: '2026-09-02T00:00:00Z' }],
      songs: [{ id: 9, title: 'Amahan Namo' }],
      gkks: [{ name: 'GKK San Isidro & Sta. Ana' }],
      bulletins: [{}],
    });
    assert.match(xml, /^<\?xml/);
    assert.equal((xml.match(/<url>/g) || []).length, SITEMAP_PAGES.length + 4);
    assert.match(xml, /<loc>https:\/\/example.org\/<\/loc>/);
    assert.match(xml, /<loc>https:\/\/example.org\/misa\/kalihokan\/4<\/loc><lastmod>2026-10-01<\/lastmod>/);
    assert.match(xml, /<loc>https:\/\/example.org\/komunidad\/artikulo\/2<\/loc><lastmod>2026-09-02<\/lastmod>/);
    assert.match(xml, /<loc>https:\/\/example.org\/downloads\/kanta\/9-amahan-namo<\/loc><priority>/);
    assert.match(xml, /komunidad\/gkk\/GKK%20San%20Isidro%20%26%20Sta\.%20Ana/);
  });

  test('with no database, the main pages alone', () => {
    assert.equal((sitemapXml('https://example.org').match(/<url>/g) || []).length, SITEMAP_PAGES.length);
  });
});
