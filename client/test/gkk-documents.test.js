import test from 'node:test';
import assert from 'node:assert/strict';

import { fmtFileSize, gkkDocumentPath, gkkDocumentType, titleFromFileName, GKK_DOCUMENT_MAX_BYTES } from '../src/lib/gkkDocuments.js';

test('PDFs, photos and Word files are accepted, by type or by extension', () => {
  assert.equal(gkkDocumentType({ name: 'title.pdf', type: 'application/pdf', size: 10 }), 'application/pdf');
  assert.equal(gkkDocumentType({ name: 'scan.JPEG', type: '', size: 10 }), 'image/jpeg');
  assert.equal(gkkDocumentType({ name: 'deed.docx', type: '', size: 10 }), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
});

test('other files, empty files and files over 20 MB are refused', () => {
  assert.throws(() => gkkDocumentType({ name: 'list.xlsx', type: 'application/vnd.ms-excel', size: 10 }), /isn't a PDF/);
  assert.throws(() => gkkDocumentType({ name: 'a.pdf', type: 'application/pdf', size: 0 }), /empty/);
  assert.throws(() => gkkDocumentType({ name: 'a.pdf', type: 'application/pdf', size: GKK_DOCUMENT_MAX_BYTES + 1 }), /over 20 MB/);
});

test('files go in the GKK’s own folder', () => {
  assert.equal(gkkDocumentPath(12, 'application/pdf', 'abc'), '12/abc.pdf');
  assert.equal(gkkDocumentPath(3, 'image/jpeg', 'x'), '3/x.jpg');
});

test('a title from the file name, and readable sizes', () => {
  assert.equal(titleFromFileName('TCT_1234  scan.pdf'), 'TCT 1234 scan');
  assert.equal(fmtFileSize(500), '500 B');
  assert.equal(fmtFileSize(1536), '1.5 KB');
  assert.equal(fmtFileSize(2_500_000), '2.4 MB');
});
