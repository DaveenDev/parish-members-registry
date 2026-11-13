import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { handle } from '../worker/app.js';
import { PREVIEW_BOTS } from '../src/lib/share.js';
import { MEDIA_CACHE_CONTROL, NOINDEX, NOINDEX_SOURCE, PREVIEW_SOURCE, SECURITY_HEADERS } from '../server/rules.js';

const VERCEL = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const headersOf = (source) => Object.fromEntries(VERCEL.headers.find((h) => h.source === source && !h.has).headers.map((h) => [h.key, h.value]));

describe('vercel.json and the Cloudflare Worker say the same', () => {
  test('security headers, photo cache and noindex', () => {
    assert.deepEqual(headersOf('/(.*)'), SECURITY_HEADERS);
    assert.equal(headersOf('/media/(.*)')['Cache-Control'], MEDIA_CACHE_CONTROL);
    assert.equal(headersOf(NOINDEX_SOURCE)['X-Robots-Tag'], NOINDEX);
  });

  test('preview robots and the addresses they get a card for', () => {
    const rule = VERCEL.rewrites.find((r) => r.destination.startsWith('/api/share'));
    assert.equal(rule.source, PREVIEW_SOURCE);
    const ua = rule.has.find((h) => h.key === 'user-agent').value;
    assert.deepEqual(ua.match(/\(([^)]*)\)/)[1].split('|'), PREVIEW_BOTS);
  });
});

// A stand-in for the built site and R2.
const ASSETS = {
  fetch: async (req) => {
    const { pathname } = new URL(req.url || req);
    if (pathname === '/robots.txt') return new Response('User-agent: *\nSitemap: https://old.example/sitemap.xml\n');
    return new Response('<html><head><title>Site</title></head></html>', { headers: { 'Content-Type': 'text/html' } });
  },
};
const ENV = { ASSETS, MEDIA_ORIGIN: 'https://pub-x.r2.dev/' };
const SUPABASE = { url: '', anonKey: '' };
const get = (path, init, env = ENV) => handle(new Request(`https://site.example${path}`, init), env, SUPABASE);

describe('worker', () => {
  test('every response carries the security headers; admin and census are noindex', async () => {
    const res = await get('/pahibalo/12');
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) assert.equal(res.headers.get(k), v);
    assert.equal(res.headers.get('x-robots-tag'), null);
    assert.equal((await get('/admin/members')).headers.get('x-robots-tag'), NOINDEX);
    assert.equal((await get('/census')).headers.get('x-robots-tag'), NOINDEX);
    assert.equal((await get('/', undefined, { ...ENV, NOINDEX: '1' })).headers.get('x-robots-tag'), NOINDEX);
  });

  test('photos come from the bucket, cached a year', async () => {
    const real = globalThis.fetch;
    let asked;
    globalThis.fetch = async (u, init) => { asked = { u: String(u), range: init.headers.get('range') }; return new Response('img', { status: 200 }); };
    try {
      const res = await get('/media/articles/a.jpg', { headers: { range: 'bytes=0-9' } });
      assert.equal(asked.u, 'https://pub-x.r2.dev/articles/a.jpg');
      assert.equal(asked.range, 'bytes=0-9');
      assert.equal(res.headers.get('cache-control'), MEDIA_CACHE_CONTROL);
      globalThis.fetch = async () => new Response('no', { status: 404 });
      assert.notEqual((await get('/media/missing.jpg')).headers.get('cache-control'), MEDIA_CACHE_CONTROL);
      assert.equal((await get('/media/a.jpg', { method: 'POST' })).status, 405);
    } finally {
      globalThis.fetch = real;
    }
  });

  test('robots.txt names this site’s sitemap', async () => {
    assert.match(await (await get('/robots.txt')).text(), /^Sitemap: https:\/\/site\.example\/sitemap\.xml$/m);
  });

  test('sitemap.xml is served even with no database', async () => {
    const res = await get('/sitemap.xml');
    assert.match(res.headers.get('content-type'), /xml/);
    assert.match(await res.text(), /<loc>https:\/\/site\.example\/<\/loc>/);
  });

  test('preview robots get a card; people and the admin get the site', async () => {
    const bot = { headers: { 'user-agent': 'facebookexternalhit/1.1' } };
    assert.match(await (await get('/kontak', bot)).text(), /<title>Kontak · /);
    assert.doesNotMatch(await (await get('/admin', bot)).text(), /Kontak/);
    assert.doesNotMatch(await (await get('/kontak', { headers: { 'user-agent': 'Mozilla/5.0' } })).text(), /Kontak/);
  });
});
