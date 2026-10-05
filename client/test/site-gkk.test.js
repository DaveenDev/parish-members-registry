import test from 'node:test';
import assert from 'node:assert/strict';

import { barangayCodeSuggestion, filterGkks, gkkBarangays, gkkParts } from '../src/lib/site.js';

const gkks = [
  { name: 'Sto. Niño -Ginatilan', puroks: 'Purok 1, Purok 2' },
  { name: 'Sr. San Roque -Meohao', chapel_address: 'Sitio Lumot' },
  { name: 'San Isidro -Meohao' },
];

test('the patron and the barangay come from the GKK name', () => {
  assert.deepEqual(gkkParts('Sto. Niño -Ginatilan'), { patron: 'Sto. Niño', area: 'Ginatilan' });
  assert.deepEqual(gkkParts('Kapilya'), { patron: 'Kapilya', area: '' });
});

test('a barangay\'s default reference code matches the database\'s', () => {
  assert.equal(barangayCodeSuggestion('Meohao'), 'MEO');
  assert.equal(barangayCodeSuggestion('Mua-an'), 'MUA');
  assert.equal(barangayCodeSuggestion('Birada Center'), 'BRC');
  assert.equal(barangayCodeSuggestion('Birada Martinez'), 'BRM');
  assert.equal(barangayCodeSuggestion('Sto. Niño'), 'STN');
  assert.equal(barangayCodeSuggestion('A'), 'AXX');
  assert.equal(barangayCodeSuggestion(''), 'XXX');
});

test('the barangays come from the GKK names, once each, A–Z', () => {
  assert.deepEqual(gkkBarangays(gkks.map((g) => g.name)), ['Ginatilan', 'Meohao']);
  assert.deepEqual(gkkBarangays(['Kapilya', 'San Jose -Balabag']), ['Balabag']);
  assert.deepEqual(gkkBarangays(undefined), []);
});

test('every GKK in one list, in the order given, not grouped by barangay', () => {
  assert.deepEqual(filterGkks(gkks).map((g) => g.name), gkks.map((g) => g.name));
  assert.equal(filterGkks(gkks)[1].patron, 'Sr. San Roque');
});

test('search matches the name (with its barangay), puroks and chapel', () => {
  assert.deepEqual(filterGkks(gkks, ' meohao ').map((g) => g.patron), ['Sr. San Roque', 'San Isidro']);
  assert.deepEqual(filterGkks(gkks, 'purok 2').map((g) => g.patron), ['Sto. Niño']);
  assert.deepEqual(filterGkks(gkks, 'lumot').map((g) => g.patron), ['Sr. San Roque']);
  assert.deepEqual(filterGkks(gkks, 'nowhere'), []);
});
