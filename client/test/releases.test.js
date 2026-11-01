import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { anchor, feedXml, githubReleaseBody, markdown, migrationRange, pageHtml, parseNotes, sortReleases } from '../../scripts/releases-lib.mjs';

const notes = (head, body = 'Some notes.') => `---\n${head}\n---\n${body}\n`;
const HEAD = 'version: 1.1.0\ndate: 2026-11-20\ntitle: Photos\nsummary: Announcements get photos.\nmigrations: 0115\nfunctions: media-upload, manage-staff';

test('notes: the header and the body', () => {
  const r = parseNotes(notes(HEAD, '## New\n\n- One'));
  assert.equal(r.version, '1.1.0');
  assert.equal(r.migrations, '0115');
  assert.deepEqual(r.functions, ['media-upload', 'manage-staff']);
  assert.equal(r.body, '## New\n\n- One');
  assert.deepEqual(parseNotes(notes(HEAD.replace('media-upload, manage-staff', 'none'))).functions, []);
});

test('notes: a missing or malformed header is refused, saying what to fix', () => {
  assert.throws(() => parseNotes('no header'), /--- header/);
  assert.throws(() => parseNotes(notes(HEAD.replace('summary: Announcements get photos.\n', ''))), /missing summary/);
  assert.throws(() => parseNotes(notes(HEAD.replace('1.1.0', 'v1.1'))), /version/);
  assert.throws(() => parseNotes(notes(HEAD.replace('0115', '115'))), /migrations/);
  assert.throws(() => parseNotes(notes(HEAD.replace('title: Photos', 'title: <a short name for this release>'))), /placeholders/);
  assert.throws(() => parseNotes(notes(HEAD, '<What changed, for the office.>')), /placeholders/);
  // A comment may hold anything.
  assert.doesNotThrow(() => parseNotes(notes(HEAD, '<!-- <What changed> -->\nDone.')));
});

test('newest first, by version number not by text', () => {
  const v = (version) => ({ version });
  assert.deepEqual(sortReleases([v('1.2.0'), v('1.10.0'), v('1.9.3'), v('2.0.0')]).map((r) => r.version), ['2.0.0', '1.10.0', '1.9.3', '1.2.0']);
});

test('the migrations a release adds come after the release before it', () => {
  assert.deepEqual(migrationRange({ migrations: '0112' }, null), { from: null, to: '0112' });
  assert.deepEqual(migrationRange({ migrations: '0115' }, { migrations: '0112' }), { from: '0112', to: '0115' });
});

test('markdown: headings, nested lists, paragraphs, bold, code and links, with HTML escaped', () => {
  const html = markdown('## New\n\n- **Bold** and `code`\n  - nested [link](https://x.test)\n- next\nline that runs on\n\nA <b>para</b>\ngoes on.\n\n[bad](javascript:alert(1))\n<!-- hidden -->');
  assert.equal(html, '<h3>New</h3><ul><li><strong>Bold</strong> and <code>code</code><ul><li>nested <a href="https://x.test">link</a></li></ul></li><li>next</li></ul><p>line that runs on</p><p>A &lt;b&gt;para&lt;/b&gt; goes on.</p><p>bad</p>');
});

test('the page, the feed and the GitHub Release text', () => {
  const older = parseNotes(notes(HEAD.replace('1.1.0', '1.0.0').replace('0115', '0112').replace('2026-11-20', '2026-11-01')));
  const newer = parseNotes(notes(HEAD, '## Fixed\n\n- A bug\nthat wrapped'));
  const releases = [newer, older];
  const page = pageHtml(releases, 'body{}');
  assert.match(page, new RegExp(`id="${anchor('1.1.0')}"`));
  assert.match(page, /Latest/);
  assert.match(page, /After <code>0112<\/code>, up to <code>0115<\/code>/);
  assert.match(page, /Every migration up to <code>0112<\/code>/);
  assert.match(page, /href="feed\.xml"/);

  const feed = feedXml(releases);
  assert.match(feed, /<entry>\s*<title>v1\.1\.0: Photos<\/title>/);
  assert.equal(feed.match(/<entry>/g).length, 2);
  assert.ok(!/<ul>/.test(feed), 'HTML in the feed is escaped');

  const body = githubReleaseBody(newer, older);
  assert.match(body, /- \*\*Migrations:\*\* after 0112, up to 0115/);
  assert.match(body, /- A bug that wrapped/);
  assert.match(body, /#v1-1-0/);
});

test('every notes file in the repository is valid and named for its version', () => {
  const dir = new URL('../../releases/notes/', import.meta.url);
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  assert.ok(files.includes('1.0.0.md'));
  for (const f of files) assert.equal(`${parseNotes(readFileSync(new URL(f, dir), 'utf8'), f).version}.md`, f);
});
