/**
 * client/src/api.js now talks to a live Supabase client, so the wire-contract
 * tests that used to live here (against a stubbed `fetch`) no longer apply —
 * see supabase/migrations/0001_init.sql for the RLS/RPC contract instead.
 * This covers what's still pure, browser-only logic: CSV building/download.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { toCsv, triggerDownload, downloadCsv, parseCsv } from '../src/lib/csv.js';

describe('toCsv', () => {
  test('renders a header row from column labels', () => {
    const csv = toCsv([{ a: 1 }], [{ label: 'A', value: 'a' }]);
    assert.equal(csv, '﻿A\n1');
  });

  test('starts with a byte-order mark, so Excel reads ñ as ñ', () => {
    const csv = toCsv([{ gkk: 'Sto. Niño' }], [{ label: 'GKK', value: 'gkk' }]);
    assert.equal(csv, '﻿GKK\nSto. Niño');
    assert.deepEqual(parseCsv(csv), [['GKK'], ['Sto. Niño']]);
  });

  test('keeps text a spreadsheet would run as a formula as plain text', () => {
    const cols = [{ label: 'V', value: 'v' }];
    const cell = (v) => toCsv([{ v }], cols).split('\n')[1];
    assert.equal(cell('=HYPERLINK("http://x","y")'), '"\'=HYPERLINK(""http://x"",""y"")"');
    assert.equal(cell('@SUM(A1)'), "'@SUM(A1)");
    assert.equal(cell('+cmd'), "'+cmd");
    assert.equal(cell('-2+3'), "'-2+3");
    // Phone numbers and plain numbers stay as they are.
    assert.equal(cell('+63 912 345 6789'), '+63 912 345 6789');
    assert.equal(cell('-5'), '-5');
    assert.equal(cell(-5), '-5');
    assert.equal(cell('Juan'), 'Juan');
  });

  test('resolves a column value from either a key or a function', () => {
    const csv = toCsv([{ first: 'Ana', last: 'Reyes' }], [
      { label: 'First', value: 'first' },
      { label: 'Full', value: (r) => `${r.first} ${r.last}` },
    ]);
    assert.equal(csv, '﻿First,Full\nAna,Ana Reyes');
  });

  test('quotes values containing commas, quotes, or newlines', () => {
    const csv = toCsv([{ note: 'Says "hi", bye\nend' }], [{ label: 'Note', value: 'note' }]);
    assert.equal(csv, '﻿Note\n"Says ""hi"", bye\nend"');
  });

  test('renders null/undefined as an empty cell', () => {
    const csv = toCsv([{ a: null, b: undefined }], [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }]);
    assert.equal(csv, '﻿A,B\n,');
  });
});

describe('download helpers', () => {
  test('triggerDownload clicks a temporary anchor with the filename and cleans up after itself', () => {
    const dom = installFakeDom();
    try {
      triggerDownload({ __blob: true }, 'blood-directory.csv');
    } finally {
      dom.restore();
    }

    assert.equal(dom.anchor.download, 'blood-directory.csv');
    assert.equal(dom.anchor.href, 'blob:mock-url');
    assert.equal(dom.anchor.clicked, true);
    assert.equal(dom.appended, dom.anchor, 'the anchor must be in the document for Firefox to honour the click');
    assert.equal(dom.anchor.removed, true, 'the anchor was left in the document');
    assert.equal(dom.revoked, 'blob:mock-url', 'the object URL was not revoked');
  });

  test('downloadCsv builds the CSV and hands it to triggerDownload as a blob', () => {
    const dom = installFakeDom();
    const blobs = [];
    const savedBlob = globalThis.Blob;
    globalThis.Blob = class {
      constructor(parts, opts) { blobs.push({ parts, opts }); }
    };
    try {
      downloadCsv('members.csv', [{ name: 'Ana' }], [{ label: 'Name', value: 'name' }]);
    } finally {
      dom.restore();
      globalThis.Blob = savedBlob;
    }

    assert.equal(dom.anchor.download, 'members.csv');
    assert.equal(blobs[0].parts[0], '﻿Name\nAna');
    assert.equal(blobs[0].opts.type, 'text/csv;charset=utf-8');
  });
});

/** Swap in a throwaway document/URL. Call `restore()` when the work is done. */
function installFakeDom() {
  const savedDocument = globalThis.document;
  const savedUrl = globalThis.URL;

  const anchor = {
    href: '',
    download: '',
    clicked: false,
    removed: false,
    click() { this.clicked = true; },
    remove() { this.removed = true; },
  };

  const state = {
    anchor,
    appended: null,
    revoked: null,
    restore() {
      globalThis.document = savedDocument;
      globalThis.URL = savedUrl;
    },
  };

  globalThis.document = {
    createElement: () => anchor,
    body: { appendChild: (el) => { state.appended = el; } },
  };
  globalThis.URL = {
    createObjectURL: () => 'blob:mock-url',
    revokeObjectURL: (url) => { state.revoked = url; },
  };

  return state;
}

describe('parseCsv', () => {
  test('quotes, escaped quotes, commas and newlines inside quotes', () => {
    assert.deepEqual(parseCsv('a,"b, c","say ""hi""","two\nlines"\r\n1,2,3,4\n'), [['a', 'b, c', 'say "hi"', 'two\nlines'], ['1', '2', '3', '4']]);
  });
  test('keeps blank lines so row numbers match, drops the final newline and a BOM', () => {
    assert.deepEqual(parseCsv('\uFEFFx\n\ny\n'), [['x'], [''], ['y']]);
    assert.deepEqual(parseCsv(''), []);
  });
  test('round-trips toCsv', () => {
    const rows = [{ a: 'Cruz, Juan', b: 'He said "ok"' }];
    const cols = [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }];
    assert.deepEqual(parseCsv(toCsv(rows, cols)), [['A', 'B'], ['Cruz, Juan', 'He said "ok"']]);
  });
});
