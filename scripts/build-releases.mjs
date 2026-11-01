// Build the releases page from releases/notes/*.md into releases/_site/:
// index.html, feed.xml (Atom, for feed readers) and releases.json (for the
// workflow that makes a GitHub Release of each). The releases-site workflow
// runs this and publishes it on GitHub Pages; git ignores the output.
//
// Usage:
//   npm run releases:build              # then open releases/_site/index.html
//   npm run releases:new -- 1.1.0       # start the notes for a new release
//
// See deploy/04-releases.md, "Release notes".
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail } from './parishes-file.mjs';
import { feedXml, githubReleaseBody, pageHtml, parseNotes, sortReleases } from './releases-lib.mjs';

const NOTES = join(ROOT, 'releases', 'notes');
const OUT = join(ROOT, 'releases', '_site');

function readReleases() {
  const releases = readdirSync(NOTES).filter((f) => f.endsWith('.md')).map((file) => {
    let r;
    try {
      r = parseNotes(readFileSync(join(NOTES, file), 'utf8'), `releases/notes/${file}`);
    } catch (e) {
      fail(e.message);
    }
    if (`${r.version}.md` !== file) fail(`releases/notes/${file}: its version is ${r.version}, so name it ${r.version}.md.`);
    return r;
  });
  if (!releases.length) fail('No release notes in releases/notes.');
  return sortReleases(releases);
}

function build() {
  const releases = readReleases();
  mkdirSync(OUT, { recursive: true });
  const css = readFileSync(join(ROOT, 'releases', 'site.css'), 'utf8');
  writeFileSync(join(OUT, 'index.html'), pageHtml(releases, css));
  writeFileSync(join(OUT, 'feed.xml'), feedXml(releases));
  writeFileSync(join(OUT, 'releases.json'), `${JSON.stringify(releases.map((r, i) => ({
    version: r.version, date: r.date, title: r.title, body: githubReleaseBody(r, releases[i + 1]),
  })), null, 2)}\n`);
  writeFileSync(join(OUT, '.nojekyll'), '');
  console.log(`Built ${releases.length} release${releases.length === 1 ? '' : 's'} (latest v${releases[0].version}) into releases/_site.`);
}

const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

// A notes file for `version`, with the migrations and functions changed
// since the last release filled in, to finish by hand.
function startNotes(version) {
  if (!/^\d+\.\d+\.\d+$/.test(version || '')) fail('Usage: npm run releases:new -- <version>, e.g. 1.1.0');
  const file = join(NOTES, `${version}.md`);
  if (existsSync(file)) fail(`releases/notes/${version}.md already exists.`);
  const [last] = readReleases();
  const migrations = readdirSync(join(ROOT, 'supabase', 'migrations')).filter((f) => f.endsWith('.sql')).sort();
  const newer = migrations.filter((f) => f.split('_')[0] > last.migrations);
  const lastMigration = newer.length ? newer[newer.length - 1].split('_')[0] : last.migrations;

  // Functions changed since the commit that added the last release's notes.
  const since = git(['log', '-1', '--format=%H', '--', `releases/notes/${last.version}.md`]);
  const changed = since
    ? [...new Set(git(['diff', '--name-only', since, 'HEAD', '--', 'supabase/functions'])
      .split('\n').map((p) => p.split('/')[2]).filter(Boolean))].sort()
    : [];
  const today = new Date().toISOString().slice(0, 10);
  const commits = since ? git(['log', '--format=- %s', `${since}..HEAD`]) : '';

  writeFileSync(file, `---
version: ${version}
date: ${today}
title: <a short name for this release>
summary: <one sentence: what parishes get>
migrations: ${lastMigration}
functions: ${changed.length ? changed.join(', ') : 'none'}
---

<What changed, for the parish office and for devs updating a copy. Group
it under ## headings (## New, ## Changed, ## Fixed) and drop the empty ones.>

${newer.length ? `Migrations to run: ${newer.map((f) => `\`${f}\``).join(', ')}.\n\n` : ''}## New

## Changed

## Fixed

<!-- Commits since v${last.version}, to work from (delete this block):
${commits || '(none)'}
-->
`);
  console.log(`Started releases/notes/${version}.md (after v${last.version}): ${newer.length} new migration${newer.length === 1 ? '' : 's'}, functions: ${changed.join(', ') || 'none'}.`);
  console.log('Fill it in, check it with npm run releases:build, then commit it with the release.');
}

const [command, arg] = process.argv.slice(2);
if (!command || command === 'build') build();
else if (command === 'new') startNotes(arg);
else fail('Usage: npm run releases:build   |   npm run releases:new -- <version>');
