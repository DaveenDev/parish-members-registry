import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  positionRows, formalName, displayName, birthdateText, maxText, structureProblem, savePayload, structureChanges, otherPositions, statusText,
} from '../src/lib/gkkStructure.js';

const positions = [
  { id: 1, parentId: null, title: 'GKK President', max: 1 },
  { id: 3, parentId: 1, title: 'Worship Ministry Head', max: 1 },
  { id: 2, parentId: 1, title: 'Secretary', max: 1 },
  { id: 4, parentId: 3, title: 'Lectors', max: null },
  { id: 5, parentId: 1, title: 'Business Manager', max: 2 },
];

describe('GKK structure', () => {
  test('positions come top to bottom, each followed by the ones under it', () => {
    const rows = positionRows(positions);
    assert.deepEqual(rows.map((r) => [r.title, r.depth]), [
      ['GKK President', 0], ['Worship Ministry Head', 1], ['Lectors', 2], ['Secretary', 1], ['Business Manager', 1],
    ]);
    assert.equal(rows[0].hasChildren, true);
    assert.equal(rows[2].hasChildren, false);
  });

  test('a position under a missing one, or in a loop, still shows', () => {
    const rows = positionRows([{ id: 1, parentId: 9, title: 'A' }, { id: 2, parentId: 3, title: 'B' }, { id: 3, parentId: 2, title: 'C' }]);
    assert.deepEqual(rows.map((r) => r.title).sort(), ['A', 'B', 'C']);
  });

  test('names read as on the form: surname, given name, middle initial', () => {
    assert.equal(formalName({ firstName: 'Analiza', middleName: 'Lopez', lastName: 'Padua' }), 'Padua, Analiza L.');
    assert.equal(formalName({ firstName: 'Ramon', lastName: 'Laput', suffix: 'Jr.' }), 'Laput Jr., Ramon');
    assert.equal(formalName({ name: '  Lawag,  Mary Joy T. ' }), 'Lawag, Mary Joy T.');
    assert.equal(displayName({ firstName: 'Analiza', lastName: 'Padua' }), 'Analiza Padua');
    assert.equal(displayName({ name: 'Analiza Padua', firstName: 'X' }), 'Analiza Padua');
  });

  test('birthdates and limits read in words', () => {
    assert.equal(birthdateText('1972-01-18'), 'January 18, 1972');
    assert.equal(birthdateText(null), '');
    assert.equal(maxText(1), 'one person');
    assert.equal(maxText(2), 'up to 2');
    assert.equal(maxText(null), 'any number');
  });

  test('problems are found before saving', () => {
    assert.equal(structureProblem(positions, [{ nodeId: 4, memberId: 1 }, { nodeId: 4, name: 'Juan Cruz' }]), '');
    assert.match(structureProblem(positions, [{ nodeId: 2, name: ' ' }]), /Type the full name for Secretary/);
    assert.match(structureProblem(positions, [{ nodeId: 1, memberId: 1, name: 'A B' }, { nodeId: 1, memberId: 2, name: 'C D' }]), /GKK President takes one person/);
    assert.match(structureProblem(positions, [{ nodeId: 4, name: 'Juan Cruz' }, { nodeId: 4, name: 'juan  cruz' }]), /twice/);
    assert.match(structureProblem(positions, [{ nodeId: 99, name: 'X' }]), /no longer on the GKK Structure/);
    assert.equal(structureProblem(positions, [{ nodeId: 5, name: 'A' }, { nodeId: 5, name: 'B' }]), '');
  });

  test('the save keeps each position\'s people in order, positions top to bottom', () => {
    const payload = savePayload(positions, [
      { nodeId: 5, name: 'Idul, Nelly M.' }, { nodeId: 1, memberId: 7, name: 'Analiza Padua', note: '' }, { nodeId: 4, name: 'B' }, { nodeId: 4, name: 'A' },
    ]);
    assert.deepEqual(payload, [
      { nodeId: 1, memberId: 7, name: 'Analiza Padua', note: null },
      { nodeId: 4, memberId: null, name: 'B', note: null },
      { nodeId: 4, memberId: null, name: 'A', note: null },
      { nodeId: 5, memberId: null, name: 'Idul, Nelly M.', note: null },
    ]);
  });

  test('the changes a draft makes, for the parish office', () => {
    const live = [{ nodeId: 1, memberId: 7, name: 'Analiza Padua' }, { nodeId: 4, name: 'Felix Labado' }];
    const draft = [{ nodeId: 1, memberId: 7, name: 'Analiza Padua' }, { nodeId: 4, name: 'Richel Penaso' }, { nodeId: 2, memberId: 9, name: 'Maria Villar' }];
    assert.deepEqual(structureChanges(positions, live, draft), [
      { id: 4, title: 'Lectors', added: ['Richel Penaso'], removed: ['Felix Labado'] },
      { id: 2, title: 'Secretary', added: ['Maria Villar'], removed: [] },
    ]);
  });

  test('someone in several positions is shown the others', () => {
    const officers = [{ nodeId: 1, memberId: 7, name: 'Analiza Padua' }, { nodeId: 4, memberId: 7, name: 'Analiza Padua' }, { nodeId: 4, name: 'Juan' }];
    const others = otherPositions(positions, officers);
    assert.deepEqual(others(officers[0]), ['Lectors']);
    assert.deepEqual(others(officers[1]), ['GKK President']);
    assert.deepEqual(others(officers[2]), []);
  });

  test('the status reads plainly', () => {
    assert.equal(statusText(null), 'Not sent yet');
    assert.equal(statusText({ status: null, approvedAt: '2026-10-09' }), 'Approved, on the website');
    assert.equal(statusText({ status: 'submitted' }), 'Sent, waiting for the parish office');
    assert.equal(statusText({ status: 'returned' }), 'Sent back by the parish office');
  });
});
