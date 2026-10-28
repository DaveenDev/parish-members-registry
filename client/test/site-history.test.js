import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { chapterAnchor, historyWhen, openingParagraph, parseYear, sortChapters } from '../src/lib/history.js';

describe('History page (0068)', () => {
  test('chapters run oldest first, the main article left out', () => {
    const rows = [
      { id: 1, is_main: true, year: null },
      { id: 4, year: 1985 },
      { id: 2, year: 1952 },
      { id: 3, year: 1985 },
    ];
    assert.deepEqual(sortChapters(rows).map((r) => r.id), [2, 3, 4]);
  });
  test('a chapter shows its own date label, else its year', () => {
    assert.equal(historyWhen({ year: 1952, date_label: '  Hunyo 1952 ' }), 'Hunyo 1952');
    assert.equal(historyWhen({ year: 1952, date_label: '' }), '1952');
    assert.equal(historyWhen({ year: null }), '');
  });
  test('the excerpt is the opening paragraph', () => {
    assert.equal(openingParagraph('Sa sinugdanan…\nikaduhang linya\n\nSunod nga parapo'), 'Sa sinugdanan…\nikaduhang linya');
    assert.equal(openingParagraph(''), '');
    assert.equal(openingParagraph(null), '');
  });
  test('years are four digits from 1000 to 2999', () => {
    assert.equal(parseYear('1952'), 1952);
    assert.equal(parseYear(' 2026 '), 2026);
    assert.equal(parseYear('52'), null);
    assert.equal(parseYear('3001'), null);
    assert.equal(parseYear('19a2'), null);
    assert.equal(parseYear(''), null);
  });
  test('each chapter has its own anchor', () => {
    assert.equal(chapterAnchor({ id: 12 }), 'tuig-12');
  });
});
