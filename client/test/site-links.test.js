import test from 'node:test';
import assert from 'node:assert/strict';

import { textLinks } from '../src/lib/site.js';

const links = (text) => textLinks(text).filter((p) => p.href).map((p) => p.href);

test('an address on its own line becomes a link, the text around it stays', () => {
  const form = 'https://docs.google.com/forms/d/e/1FAIpQLScn-hF4919wyrjjooSgFoGrGwXARTjGTBK3Fwxdr3pMc394QQ/viewform';
  const text = `Non-Catholics, Guests & Visitor Runners: just click the link below⬇️\n${form}`;
  assert.deepEqual(textLinks(text), [
    { text: 'Non-Catholics, Guests & Visitor Runners: just click the link below⬇️\n' },
    { text: form, href: form },
  ]);
});

test('the parts join back into the text exactly', () => {
  const text = 'Tan-awa (https://example.ph/a_(b)) ug www.parish.ph/fun-run. Email info@parish.ph, salamat!';
  assert.equal(textLinks(text).map((p) => p.text).join(''), text);
});

test('punctuation after an address stays with the sentence', () => {
  assert.deepEqual(links('Register at https://x.ph/form.'), ['https://x.ph/form']);
  assert.deepEqual(links('(see https://x.ph/form)'), ['https://x.ph/form']);
  assert.deepEqual(links('Wiki: https://en.wikipedia.org/wiki/Fun_(run)'), ['https://en.wikipedia.org/wiki/Fun_(run)']);
  assert.deepEqual(links('"https://x.ph/a", https://x.ph/b; https://x.ph/c!'), ['https://x.ph/a', 'https://x.ph/b', 'https://x.ph/c']);
});

test('www. addresses open over https; email addresses as mailto', () => {
  assert.deepEqual(links('www.olgqp.ph/events and parish.office@gmail.com.'), ['https://www.olgqp.ph/events', 'mailto:parish.office@gmail.com']);
});

test('nothing but http(s) and mailto links, and no text is no parts', () => {
  assert.deepEqual(links('javascript:alert(1) ftp://x.ph/file data:text/html,hi'), []);
  assert.deepEqual(textLinks(''), []);
  assert.deepEqual(textLinks(null), []);
  assert.deepEqual(textLinks('No links here.'), [{ text: 'No links here.' }]);
});
