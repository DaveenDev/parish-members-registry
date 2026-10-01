import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { RELATIONSHIPS, CIVIL_STATUSES, RELIGIONS, WEDDING_TYPES } from '../src/constants.js';
import {
  RELATIONSHIP_LABELS, CIVIL_STATUS_LABELS, RELIGION_LABELS, WEDDING_TYPE_LABELS, SEX_LABELS, bis, serverErrorInBisaya,
} from '../src/lib/bisaya.js';

describe('Bisaya labels', () => {
  // A new pick-list value without a label would show up in English on the
  // public wizard, so every stored value must have a translation.
  test('cover every value the wizard offers', () => {
    for (const [name, values, labels] of [
      ['RELATIONSHIPS', RELATIONSHIPS, RELATIONSHIP_LABELS],
      ['CIVIL_STATUSES', CIVIL_STATUSES, CIVIL_STATUS_LABELS],
      ['RELIGIONS', RELIGIONS, RELIGION_LABELS],
      ['WEDDING_TYPES', WEDDING_TYPES, WEDDING_TYPE_LABELS],
      ['sex', ['Male', 'Female'], SEX_LABELS],
    ]) {
      for (const value of values) {
        assert.ok(labels[value]?.trim(), `${name}: "${value}" has no Bisaya label`);
      }
    }
  });

  test('serverErrorInBisaya translates known registration errors', () => {
    assert.match(serverErrorInBisaya('The household name "Duran Family" is already registered. Please choose a different name.'), /Narehistro na/);
    assert.match(serverErrorInBisaya('Please select a GKK from the list'), /GKK/);
    assert.match(serverErrorInBisaya('TypeError: Failed to fetch'), /koneksyon/);
    assert.equal(serverErrorInBisaya('something unexpected'), 'Dili mapadala ang rehistro. Palihug sulayi pag-usab.');
    assert.equal(serverErrorInBisaya(undefined), 'Dili mapadala ang rehistro. Palihug sulayi pag-usab.');
  });

  test('bis falls back to the stored value', () => {
    assert.equal(bis(CIVIL_STATUS_LABELS, 'Married'), 'Minyo');
    assert.equal(bis(CIVIL_STATUS_LABELS, 'Unknown'), 'Unknown');
    assert.equal(bis(CIVIL_STATUS_LABELS, ''), '');
    assert.equal(bis(CIVIL_STATUS_LABELS, undefined), '');
  });
});
