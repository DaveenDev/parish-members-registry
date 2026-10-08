import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { yearsText, sortService, serviceError, serviceKindLabel, toYear } from '../src/lib/service.js';

describe('service history', () => {
  test('years read as a range, a start or an end', () => {
    assert.equal(yearsText({ from_year: 2015, to_year: 2019 }), '2015–2019');
    assert.equal(yearsText({ from_year: 2019, to_year: 2019 }), '2019');
    assert.equal(yearsText({ from_year: 2015, to_year: null }), 'Since 2015');
    assert.equal(yearsText({ from_year: null, to_year: 2026 }), 'Until 2026');
    assert.equal(yearsText({}), '');
  });

  test('most recent service comes first', () => {
    const rows = [
      { name: 'Choir', from_year: 2001, to_year: 2005 },
      { name: 'Couples for Christ (CFC)', from_year: null, to_year: null },
      { name: 'Kaabag', from_year: null, to_year: 2026 },
      { name: 'PPC Secretary', from_year: 2018, to_year: 2021 },
      { name: 'Lector & Commentator', from_year: 2010, to_year: 2021 },
    ];
    assert.deepEqual(sortService(rows).map((r) => r.name),
      ['Kaabag', 'PPC Secretary', 'Lector & Commentator', 'Choir', 'Couples for Christ (CFC)']);
    assert.equal(rows[0].name, 'Choir', 'leaves the list it was given as it was');
    assert.deepEqual(sortService(null), []);
  });

  test('an entry needs a kind and a name', () => {
    assert.equal(serviceError({ kind: 'ministry', name: 'Kaabag' }), '');
    assert.match(serviceError({ kind: '', name: 'Kaabag' }), /kind/);
    assert.match(serviceError({ kind: 'organization', name: '  ' }), /served in/);
  });

  test('years are checked as the database checks them', () => {
    assert.equal(serviceError({ kind: 'parish', name: 'PPC President', from_year: '2015', to_year: '2019' }), '');
    assert.equal(serviceError({ kind: 'parish', name: 'PPC President', from_year: '', to_year: '2019' }), '');
    assert.match(serviceError({ kind: 'parish', name: 'PPC President', from_year: '2020', to_year: '2019' }), /first year/);
    assert.match(serviceError({ kind: 'parish', name: 'PPC President', from_year: '1850' }), /between/);
    assert.match(serviceError({ kind: 'parish', name: 'PPC President', to_year: '2015.5' }), /between/);
  });

  test('labels and year values', () => {
    assert.equal(serviceKindLabel('parish'), 'Parish position');
    assert.equal(serviceKindLabel('gkk'), 'GKK responsibility');
    assert.equal(toYear(''), null);
    assert.equal(toYear(null), null);
    assert.equal(toYear('2015'), 2015);
  });
});
