import test from 'node:test';
import assert from 'node:assert/strict';

import { FALLBACK_PARISH_NAME, parishTitle } from '../src/lib/parishName.js';

test('parishTitle: a trailing (Quasi-)Parish and the place after it go on the small line', () => {
  assert.deepEqual(parishTitle('Our Lady of Guadalupe Quasi-Parish, Mua-an'), {
    name: 'Our Lady of Guadalupe', sub: 'Quasi-Parish · Mua-an', full: 'Our Lady of Guadalupe Quasi-Parish, Mua-an',
    title: 'Our Lady of Guadalupe Quasi-Parish · Mua-an', saved: 'Our Lady of Guadalupe Quasi-Parish, Mua-an',
  });
  const p = parishTitle(' St. Joseph Parish ');
  assert.equal(p.name, 'St. Joseph');
  assert.equal(p.sub, 'Parish');
  assert.equal(p.title, 'St. Joseph Parish');
  assert.equal(parishTitle('San Isidro Parish · Makilala').sub, 'Parish · Makilala');
});

test('parishTitle: any other name stays whole', () => {
  assert.deepEqual(parishTitle('Our Lady of Guadalupe'), { name: 'Our Lady of Guadalupe', sub: '', full: 'Our Lady of Guadalupe', title: 'Our Lady of Guadalupe', saved: 'Our Lady of Guadalupe' });
  assert.equal(parishTitle('Parish of the Holy Cross').name, 'Parish of the Holy Cross');
});

test('parishTitle: no saved name gives the neutral fallback, never a parish', () => {
  for (const none of ['', '  ', null, undefined]) {
    const p = parishTitle(none);
    assert.equal(p.full, FALLBACK_PARISH_NAME);
    assert.equal(p.title, FALLBACK_PARISH_NAME);
    assert.equal(p.saved, '');
  }
  assert.doesNotMatch(FALLBACK_PARISH_NAME, /guadalupe/i);
});
