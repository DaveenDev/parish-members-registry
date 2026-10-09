import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { SITE_DESCRIPTION, pageDescription, pageNoindex, excerpt, canonicalUrl, parishJsonLd } from '../src/lib/seo.js';

describe('pageDescription', () => {
  test('each section has its own, inner pages their nearest section’s', () => {
    assert.match(pageDescription('/simbahan'), /Oras sa Misa/);
    assert.match(pageDescription('/simbahan/pagbasa'), /pagbasa/);
    assert.match(pageDescription('/komunidad/artikulo/12'), /artikulo/);
    assert.match(pageDescription('/komunidad/gkk/GKK San Isidro'), /GKK/);
    assert.match(pageDescription('/serbisyo/hangyo/baptism'), /sertipiko/);
    assert.match(pageDescription('/kontak'), /Kontak/);
  });

  test('Home and unknown pages get the site’s', () => {
    assert.equal(pageDescription('/'), SITE_DESCRIPTION);
    assert.equal(pageDescription('/developer'), SITE_DESCRIPTION);
    // A prefix of a section's name isn't that section.
    assert.equal(pageDescription('/kontakx'), SITE_DESCRIPTION);
  });
});

test('pageNoindex: only the status lookup', () => {
  assert.equal(pageNoindex('/serbisyo/susiha'), true);
  assert.equal(pageNoindex('/serbisyo'), false);
  assert.equal(pageNoindex('/'), false);
});

describe('excerpt', () => {
  test('short text stays whole, on one line', () => {
    assert.equal(excerpt('  Misa sa\n\nDomingo  '), 'Misa sa Domingo');
    assert.equal(excerpt(null), '');
  });

  test('long text ends on a whole word with …', () => {
    const text = 'Ang parokya magpahigayon og Misa ug prosesyon alang sa kapistahan. '.repeat(5);
    const out = excerpt(text, 80);
    assert.ok(out.length <= 80, out);
    assert.ok(out.endsWith('…'));
    assert.ok(text.startsWith(out.slice(0, -1)));
    assert.notEqual(out.at(-2), ' ');
  });
});

test('canonicalUrl: no trailing slash, query or hash', () => {
  assert.equal(canonicalUrl('https://parish.org/', '/simbahan/'), 'https://parish.org/simbahan');
  assert.equal(canonicalUrl('https://parish.org', '/'), 'https://parish.org/');
  assert.equal(canonicalUrl('https://parish.org', ''), 'https://parish.org/');
});

describe('parishJsonLd', () => {
  const base = { name: 'Our Lady of Guadalupe Quasi-Parish', url: 'https://parish.org/', address: 'Purok 3, Mua-an', coords: { latitude: '7.04', longitude: 125.16 } };

  test('a Church with address and pin; empty contacts left out', () => {
    const ld = parishJsonLd({ ...base, phone: '', email: null, logo: null });
    assert.equal(ld['@type'], 'Church');
    assert.equal(ld.address.streetAddress, 'Purok 3, Mua-an');
    assert.deepEqual(ld.geo, { '@type': 'GeoCoordinates', latitude: 7.04, longitude: 125.16 });
    assert.equal('telephone' in ld, false);
    assert.equal('email' in ld, false);
    assert.equal('logo' in ld, false);
  });

  test('contacts, Facebook and a web logo when set (not an inline image)', () => {
    const ld = parishJsonLd({ ...base, phone: '0917 000 0000', email: 'office@parish.org', facebook: 'https://facebook.com/olgqp', logo: 'https://parish.org/media/logo.png' });
    assert.equal(ld.telephone, '0917 000 0000');
    assert.deepEqual(ld.sameAs, ['https://facebook.com/olgqp']);
    assert.equal(ld.logo, 'https://parish.org/media/logo.png');
    assert.equal(parishJsonLd({ ...base, logo: 'data:image/png;base64,AAA' }).logo, undefined);
  });
});
