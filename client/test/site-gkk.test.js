import test from 'node:test';
import assert from 'node:assert/strict';

import { barangayCodeSuggestion, barangayPatch, filterGkks, gkkBarangayOf, gkkBarangays, gkkParts, gkksByBarangay, isListedBarangay } from '../src/lib/site.js';

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

// ---- each GKK's own barangay (0089) ----------------------------------------

const names = ['Sto. Niño -Balabag', 'San Isidro -Meohao', 'Kapilya sa Bukid', 'San Roque -Meohao'];
// Kapilya sa Bukid's name has no barangay: it's saved for it.
const saved = new Map([['Kapilya sa Bukid', 'Meohao']]);

test('gkkBarangayOf: the saved barangay, else the end of the name', () => {
  assert.equal(gkkBarangayOf('Kapilya sa Bukid', saved), 'Meohao');
  assert.equal(gkkBarangayOf('Sto. Niño -Balabag', saved), 'Balabag');
  assert.equal(gkkBarangayOf('Kapilya sa Bukid'), '');
  // A saved barangay wins over the name's.
  assert.equal(gkkBarangayOf('Sto. Niño -Balabag', new Map([['Sto. Niño -Balabag', 'Ilomavis']])), 'Ilomavis');
});

test('gkkBarangays with saved barangays: each once, ignoring case', () => {
  assert.deepEqual(gkkBarangays(names, saved), ['Balabag', 'Meohao']);
  assert.deepEqual(gkkBarangays(['A -meohao', 'B -Meohao']), ['meohao']);
});

test('isListedBarangay ignores case and spaces at the ends', () => {
  assert.equal(isListedBarangay(' meohao ', ['Balabag', 'Meohao']), true);
  assert.equal(isListedBarangay('Poblacion', ['Balabag', 'Meohao']), false);
  assert.equal(isListedBarangay('', ['Meohao']), false);
});

test('gkksByBarangay: that barangay’s GKKs first, the rest still there', () => {
  assert.deepEqual(gkksByBarangay(names, 'meohao', saved), {
    here: ['Kapilya sa Bukid', 'San Isidro -Meohao', 'San Roque -Meohao'],
    others: ['Sto. Niño -Balabag'],
  });
  // No barangay, or one outside the parish: one list.
  assert.deepEqual(gkksByBarangay(names, '', saved).here, []);
  assert.equal(gkksByBarangay(names, 'Poblacion', saved).others.length, 4);
});

test('barangayPatch picks a barangay’s only GKK, but never replaces a chosen one', () => {
  assert.deepEqual(barangayPatch({ gkk: '' }, 'Balabag', names, saved), { barangay: 'Balabag', gkk: 'Sto. Niño -Balabag' });
  assert.deepEqual(barangayPatch({ gkk: 'San Isidro -Meohao' }, 'Balabag', names, saved), { barangay: 'Balabag' });
  assert.deepEqual(barangayPatch({ gkk: '' }, 'Meohao', names, saved), { barangay: 'Meohao' });
  assert.deepEqual(barangayPatch({ gkk: '' }, 'Poblacion', names, saved), { barangay: 'Poblacion' });
});
