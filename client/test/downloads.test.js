import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cleanLyrics, downloadFilePath, downloadFileType, DOWNLOAD_MAX_BYTES, fileKindLabel, fileMatches, firstLine,
  groupFiles, languageCode, opensInBrowser, orderCategories, slugify, songByline, songFileName, songIdFromParam, songJsonLd,
  songMatches, songPath, songText, sortSongs, stanzas, SONG_CATEGORIES,
} from '../src/lib/downloads.js';

test('PDFs, Word, Excel and photos are accepted, by type or by extension', () => {
  assert.equal(downloadFileType({ name: 'form.pdf', type: 'application/pdf', size: 10 }), 'application/pdf');
  assert.equal(downloadFileType({ name: 'census.XLSX', type: '', size: 10 }), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  assert.equal(downloadFileType({ name: 'gkk.doc', type: '', size: 10 }), 'application/msword');
  assert.equal(downloadFileType({ name: 'scan.jpeg', type: '', size: 10 }), 'image/jpeg');
});

test('other files, empty files and files over 20 MB are refused', () => {
  assert.throws(() => downloadFileType({ name: 'song.mp3', type: 'audio/mpeg', size: 10 }), /isn't a PDF, Word, Excel or photo/);
  assert.throws(() => downloadFileType({ name: 'a.pdf', type: 'application/pdf', size: 0 }), /empty/);
  assert.throws(() => downloadFileType({ name: 'a.pdf', type: 'application/pdf', size: DOWNLOAD_MAX_BYTES + 1 }), /over 20 MB/);
});

test('files are stored by id with their extension, and labelled by kind', () => {
  assert.equal(downloadFilePath('application/pdf', 'abc'), 'abc.pdf');
  assert.equal(downloadFilePath('image/jpeg', 'x'), 'x.jpg');
  assert.equal(fileKindLabel('application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'Word');
  assert.equal(fileKindLabel('application/zip', 'old.zip'), 'ZIP');
  assert.equal(opensInBrowser('application/pdf'), true);
  assert.equal(opensInBrowser('image/png'), true);
  assert.equal(opensInBrowser('application/msword'), false);
});

test('pasted lyrics are tidied: line ends, Windows breaks, extra blank lines', () => {
  const pasted = '\r\n\r\nGinoo, kaloy-i kami  \r\nGinoo, kaloy-i kami\r\n\r\n\r\n\r\nKristo, kaloy-i kami\t\n\n';
  assert.equal(cleanLyrics(pasted), 'Ginoo, kaloy-i kami\nGinoo, kaloy-i kami\n\nKristo, kaloy-i kami');
  assert.deepEqual(stanzas(pasted), ['Ginoo, kaloy-i kami\nGinoo, kaloy-i kami', 'Kristo, kaloy-i kami']);
  assert.equal(firstLine(pasted), 'Ginoo, kaloy-i kami');
});

test('a song is found by any words of its title, note or lyrics, accents or not', () => {
  const song = { title: 'Santo Niño', note: 'Pagsulod', lyrics: 'Halad namo kanimo\nGinóong Hesus' };
  assert.equal(songMatches(song, ''), true);
  assert.equal(songMatches(song, 'santo nino'), true);
  assert.equal(songMatches(song, 'ginoong   halad'), true);
  assert.equal(songMatches(song, 'pagsulod'), true);
  assert.equal(songMatches(song, 'gloria'), false);
});

test('a file is found by its title, category, description or file name', () => {
  const file = { title: 'Census form', category: 'Manual Census Forms', description: 'Para sa GKK', file_name: 'census-2026.pdf' };
  assert.equal(fileMatches(file, 'manual'), true);
  assert.equal(fileMatches(file, '2026'), true);
  assert.equal(fileMatches(file, 'kasal'), false);
});

test('categories: the suggested ones first, then the rest A–Z, no repeats', () => {
  assert.deepEqual(
    orderCategories(['Pasko', 'bible service', 'Kasaulogan sa GKK', ' ', 'Bible Service', 'Adbiyento'], SONG_CATEGORIES),
    ['Kasaulogan sa GKK', 'bible service', 'Adbiyento', 'Pasko'],
  );
});

test('songs A–Z by title, numbers in order', () => {
  const titles = sortSongs([{ title: 'b' }, { title: 'Song 10' }, { title: 'A' }, { title: 'Song 2' }]).map((s) => s.title);
  assert.deepEqual(titles, ['A', 'b', 'Song 2', 'Song 10']);
});

test('Other Forms comes last, after the categories staff added', () => {
  const groups = groupFiles([
    { title: 'A', category: 'Other Forms' },
    { title: 'B', category: 'Sacrament Forms' },
    { title: 'C', category: 'GKK Forms' },
    { title: 'D', category: 'Ministry Forms' },
  ]);
  assert.deepEqual(groups.map((g) => g.category), ['GKK Forms', 'Ministry Forms', 'Sacrament Forms', 'Other Forms']);
});

test('files are grouped by category, suggested categories first, each A–Z', () => {
  const groups = groupFiles([
    { title: 'Z', category: 'Sacraments' },
    { title: 'Census form', category: 'Manual Census Forms' },
    { title: 'Officers form', category: 'GKK Forms' },
    { title: 'Attendance', category: 'gkk forms ' },
  ]);
  assert.deepEqual(groups.map((g) => [g.category, g.files.map((f) => f.title)]), [
    ['GKK Forms', ['Attendance', 'Officers form']],
    ['Manual Census Forms', ['Census form']],
    ['Sacraments', ['Z']],
  ]);
});

test('a song page address carries its title; the number alone still finds it', () => {
  assert.equal(slugify('Ginoo, Kaloy-i Kami!'), 'ginoo-kaloy-i-kami');
  assert.equal(slugify('Santo Niño'), 'santo-nino');
  assert.equal(songPath({ id: 12, title: 'Ginoo, Kaloy-i Kami!' }), '/downloads/kanta/12-ginoo-kaloy-i-kami');
  assert.equal(songPath({ id: 3, title: '???' }), '/downloads/kanta/3');
  assert.equal(songIdFromParam('12-ginoo-kaloy-i-kami'), 12);
  assert.equal(songIdFromParam('12'), 12);
  assert.equal(songIdFromParam('ginoo'), null);
  assert.equal(songIdFromParam('12abc'), null);
});

test('the byline names the composer, and the language when it isn’t Bisaya', () => {
  assert.equal(songByline({ composer: 'Fr. Juan', language: 'Bisaya' }), 'Fr. Juan');
  assert.equal(songByline({ composer: '', language: 'English' }), 'English');
  assert.equal(songByline({ composer: 'A', language: 'Latin' }), 'A · Latin');
  assert.equal(languageCode('Bisaya'), 'ceb');
  assert.equal(languageCode('Klingon'), undefined);
});

test('the downloaded lyrics: title, composer, stanzas and where they came from', () => {
  const song = { title: 'Halad', composer: 'Fr. Juan', lyrics: 'Una\nlinya\n\n\n\nIkaduha' };
  assert.equal(songText(song, 'https://x.ph/downloads/kanta/1-halad'), 'Halad\nComposer: Fr. Juan\n\nUna\nlinya\n\nIkaduha\n\nFrom https://x.ph/downloads/kanta/1-halad\n');
  assert.equal(songText({ title: 'A', lyrics: 'b' }), 'A\n\nb\n');
  assert.equal(songFileName({ title: 'Kanta: Una/Ikaduha?' }), 'Kanta UnaIkaduha.txt');
});

test('search engines are told it is a song with its lyrics, composer and language', () => {
  const ld = songJsonLd({ song: { title: 'Halad', composer: 'Fr. Juan', language: 'Bisaya', categories: ['Bible Service'], lyrics: 'Una\n\nIkaduha' }, url: 'https://x.ph/k', parishName: 'OLG' });
  assert.equal(ld['@type'], 'MusicComposition');
  assert.equal(ld.composer.name, 'Fr. Juan');
  assert.equal(ld.inLanguage, 'ceb');
  assert.equal(ld.lyrics.text, 'Una\n\nIkaduha');
  assert.equal(ld.keywords, 'Bible Service');
  const bare = songJsonLd({ song: { title: 'X', lyrics: 'y' }, url: 'u' });
  assert.equal('composer' in bare || 'inLanguage' in bare || 'publisher' in bare, false);
});
