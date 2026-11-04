// Run new migrations on each parish's database, one parish at a time.
//
// Every parish (and the demo site) has its own Supabase project, often on
// its own Supabase account. `supabase db push --remote=<url>` reaches each one
// by its connection string, and each database's own migration history decides
// what still has to run, so a parish that is behind gets every migration it
// missed. The connection strings hold the database passwords: they live in
// the root `parishes.json`, which git ignores (`npm run parish -- add`).
// The first parish in the file is the one every migration is tried on first,
// normally the demo site.
//
// Usage:
//   npm run release:db -- status          # what each database still needs
//   npm run release:db -- status sjmv     # just one
//   npm run release:db -- demo            # run them on one parish
//   npm run release:db -- all             # every parish, in the file's order
//
// A database set up by hand (migrations pasted into the SQL Editor) has no
// history of them, so `db push` would run them again from 0001 and fail.
// Check which of them are already there, then record those as applied:
//   npm run release:db -- check demo      # which missing ones are there
//   npm run release:db -- mark demo 0110  # record up to 0110 as applied
//   npm run release:db -- mark demo 0094-0111  # record just 0094 to 0111
//
// See deploy/04-releases.md.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { ROOT, fail, hidePasswords, loadParishes, npx } from './parishes-file.mjs';
import { checkSql, lastDone, migrationMarkers, verdicts, versionOf } from './migration-markers.mjs';

const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');

// Supabase CLI v3 deprecated --db-url (removed in v4) for --remote. The value
// must be joined with "=": --remote takes an optional value, so a separate
// argument would be read as the linked project and the URL as something else.
const remote = (parish) => `--remote=${parish.dbUrl}`;

// What `db push` would run there, without running it.
function pending(parish, parishes) {
  const result = npx(['supabase', 'db', 'push', '--dry-run', '--skip-vault', remote(parish)], { encoding: 'utf8' });
  const output = hidePasswords(`${result.stdout || ''}${result.stderr || ''}`, parishes).trim();
  const files = [...output.matchAll(/\b(\d{4,5}_[\w-]+\.sql)\b/g)].map((m) => m[1]);
  return {
    ok: result.status === 0,
    output,
    files: [...new Set(files)],
    upToDate: result.status === 0 && /up to date/i.test(output),
    outOfOrder: /--include-all/.test(output),
  };
}

function describe(parish, state) {
  const head = `${parish.label} (${parish.name})`;
  if (state.outOfOrder) {
    return `${head}: a migration here is numbered before the last one this database ran. Give it the next free number instead (see deploy/04-releases.md).\n${indent(state.output)}`;
  }
  if (!state.ok) return `${head}: couldn't check.\n${indent(state.output)}`;
  if (state.upToDate) return `${head}: up to date.`;
  if (state.files.length) return `${head}: ${state.files.length} to run\n${state.files.map((f) => `    ${f}`).join('\n')}`;
  return `${head}:\n${indent(state.output)}`;
}

function indent(text) {
  return text.split('\n').map((line) => `    ${line}`).join('\n');
}

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

// Only migrations committed on main go out: another session's half-written
// migration sitting in the folder must not reach a parish.
function migrationsFolderProblem() {
  const branch = git(['branch', '--show-current']);
  if (branch !== 'main') return `This folder is on "${branch || 'no branch'}", not main. Releases go out from main.`;
  const changes = git(['status', '--porcelain', '--', 'supabase/migrations']);
  if (changes === null) return 'Couldn\'t read git status.';
  if (changes) return `supabase/migrations has changes that aren't committed:\n${indent(changes)}\nCommit them (or move them away) first.`;
  return null;
}

function pick(parishes, target) {
  if (!target || target === 'all') return parishes;
  const parish = parishes.find((p) => p.name === target);
  if (!parish) fail(`No parish named "${target}" in parishes.json. Names: ${parishes.map((p) => p.name).join(', ')}.`);
  return [parish];
}

function status(parishes, target) {
  const problem = migrationsFolderProblem();
  if (problem) console.log(`Note: ${problem}\nThe list below includes those files.\n`);
  let failed = false;
  for (const parish of pick(parishes, target)) {
    const state = pending(parish, parishes);
    if (!state.ok) failed = true;
    console.log(describe(parish, state));
  }
  if (failed) process.exitCode = 1;
}

async function release(parishes, target) {
  const problem = migrationsFolderProblem();
  if (problem) fail(problem);

  const first = parishes[0];
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const parish of pick(parishes, target)) {
      console.log(`\n=== ${parish.label} (${parish.name}) ===`);
      const state = pending(parish, parishes);
      console.log(describe(parish, state));
      if (state.upToDate) continue;
      if (!state.ok || state.outOfOrder) fail(`Stopped at ${parish.label}. Nothing was run there.`);

      // The first one already there means they were run by hand and aren't
      // in its history: db push would run them again and fail (often 0001).
      const { checked } = checkPending(parish, parishes);
      if (checked[0]?.verdict === 'done') {
        const last = lastDone(checked);
        fail(`Stopped at ${parish.label}: ${checked[0].file} is already there, run by hand, so it isn't in its history and db push would fail on it. Nothing was run.\n`
          + `Record the ones already there first:\n    npm run release:db -- check ${parish.name}\n    npm run release:db -- mark ${parish.name} ${last}\n`
          + `then run this again. (deploy/04-releases.md, "A database whose migrations were run by hand")`);
      }

      if (parish !== first) {
        const firstState = pending(first, parishes);
        if (!firstState.upToDate) {
          fail(`Stopped: ${first.label} still has migrations to run. Run and try them there first: npm run release:db -- ${first.name}`);
        }
      }

      if (parish.backup !== false) {
        const backup = (await rl.question(`Has ${parish.label}'s backup run today (GitHub → Actions → Encrypted database backup → Run workflow)? [y/N] `)).trim().toLowerCase();
        if (backup !== 'y' && backup !== 'yes') fail(`Stopped at ${parish.label}. Run its backup, then try again.`);
      }
      const typed = (await rl.question(`Type "${parish.name}" to run these on ${parish.label}: `)).trim();
      if (typed !== parish.name) fail(`Stopped at ${parish.label}. Nothing was run there.`);

      const result = npx(['supabase', 'db', 'push', '--skip-vault', '--yes', remote(parish)], { encoding: 'utf8' });
      const output = hidePasswords(`${result.stdout || ''}${result.stderr || ''}`, parishes).trim();
      if (output) console.log(indent(output));
      if (result.status !== 0) {
        fail(`${parish.label} failed. The migrations before the failed one have run there; the parishes after it weren't touched. Fix it with a new migration, then run this again.`);
      }
      console.log(`${parish.label}: done. Now push its website, and deploy any changed Edge Function from its own folder.`);
    }
  } finally {
    rl.close();
  }
}

// The migrations `db push` would run on `parish`, each checked against its
// database: is what it adds already there?
function checkPending(parish, parishes) {
  const state = pending(parish, parishes);
  if (!state.ok) fail(describe(parish, state));
  if (state.upToDate) return { state, checked: [] };
  const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
    .map((file) => ({ file, sql: readFileSync(join(MIGRATIONS_DIR, file), 'utf8') }));
  // In the order db push would run them.
  const byFile = new Map(migrationMarkers(all).map((e) => [e.file, e]));
  const entries = state.files.map((f) => byFile.get(f)).filter(Boolean);

  // A file, not an argument: a hundred migrations' checks are too long for a command line.
  const dir = mkdtempSync(join(tmpdir(), 'release-db-'));
  try {
    const file = join(dir, 'check.sql');
    writeFileSync(file, checkSql(entries));
    // --read-only: the check only reads, and CLI v3 refuses a hosted query
    // without it (or --yes) when it can't prompt, as with json output.
    const result = npx(['supabase', 'db', 'query', '--read-only', remote(parish), '--output-format', 'json', '--file', file], { encoding: 'utf8' });
    if (result.status !== 0) fail(`Couldn't check ${parish.label}:\n${indent(hidePasswords(`${result.stdout || ''}${result.stderr || ''}`, parishes).trim())}`);
    let rows;
    try {
      rows = JSON.parse(result.stdout).rows || [];
    } catch {
      fail(`Couldn't read the check's answer from ${parish.label}:\n${indent(hidePasswords(result.stdout || '', parishes).trim())}`);
    }
    return { state, checked: verdicts(entries, rows) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const VERDICT_TEXT = { done: 'there', 'not run': 'NOT there', partly: 'PARTLY there', unknown: "can't tell (only changes earlier ones)" };

function check(parishes, target) {
  if (!target || target === 'all') fail('Which parish? npm run release:db -- check <name>');
  const [parish] = pick(parishes, target);
  const { checked } = checkPending(parish, parishes);
  if (!checked.length) {
    console.log(`${parish.label} (${parish.name}): up to date, nothing to check.`);
    return;
  }
  console.log(`${parish.label} (${parish.name}): ${checked.length} not in its history. What each adds:`);
  for (const c of checked) {
    console.log(`    ${c.file.padEnd(44)} ${VERDICT_TEXT[c.verdict]}`);
    if (c.verdict === 'partly') console.log(`        missing: ${c.missing.join(', ')}`);
  }
  const last = lastDone(checked);
  if (!last) {
    console.log(`\nThe first of them isn't there: nothing to mark. Run them: npm run release:db -- ${parish.name}`);
  } else {
    const rest = checked.length - checked.findIndex((c) => c.version === last) - 1;
    console.log(`\nAlready there up to ${last}. Record those as applied:\n    npm run release:db -- mark ${parish.name} ${last}`);
    console.log(rest ? `Then run the ${rest} after it: npm run release:db -- ${parish.name}` : 'Then it is up to date.');
  }
}

const MARK_USAGE = 'Usage: npm run release:db -- mark <parish> <last version already there>, e.g. mark demo 0110, or a range: mark demo 0094-0111';

// "0110" is every pending one up to 0110; "0094-0111" only those from 0094 to 0111.
function parseVersions(arg) {
  const match = /^(\d{4,5})(?:-(\d{4,5}))?$/.exec(arg || '');
  if (!match) fail(MARK_USAGE);
  const [, a, b] = match;
  if (b === undefined) return { from: null, to: Number(a) };
  if (Number(a) > Number(b)) fail(`${a}-${b}: the first version comes after the second. Did you mean ${b}-${a}?`);
  return { from: Number(a), to: Number(b) };
}

async function mark(parishes, target, versions) {
  if (!target || target === 'all' || !versions) fail(MARK_USAGE);
  const { from, to } = parseVersions(versions);
  const [parish] = pick(parishes, target);
  const { checked } = checkPending(parish, parishes);
  let marking;
  if (from === null) {
    const end = checked.findIndex((c) => Number(c.version) === to);
    if (end < 0) fail(`${versions} isn't one of ${parish.label}'s migrations still to run. See: npm run release:db -- check ${parish.name}`);
    marking = checked.slice(0, end + 1);
  } else {
    marking = checked.filter((c) => Number(c.version) >= from && Number(c.version) <= to);
    if (!marking.length) fail(`None of ${parish.label}'s migrations still to run are in ${versions}. See: npm run release:db -- check ${parish.name}`);
  }
  // Pending ones before the range stay unrecorded: a gap db push refuses.
  const skipped = checked.slice(0, checked.indexOf(marking[0]));
  const absent = marking.filter((c) => c.verdict === 'not run' || c.verdict === 'partly');
  if (absent.length) {
    fail(`Not marked: ${absent.map((c) => c.file).join(', ')} ${absent.length === 1 ? 'isn\'t' : 'aren\'t'} fully there on ${parish.label}. Mark only up to before the first of them (npm run release:db -- check ${parish.name}).`);
  }
  console.log(`${parish.label} (${parish.name}): recording ${marking.length} as applied, without running them:`);
  console.log(marking.map((c) => `    ${c.file}`).join('\n'));
  if (skipped.length) {
    console.log(`Warning: ${skipped.length} before them still aren't recorded (${skipped[0].version}${skipped.length > 1 ? `–${skipped.at(-1).version}` : ''}). `
      + 'With that gap in its history, db push will refuse until they are recorded or run (deploy/04-releases.md).');
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const typed = (await rl.question(`Type "${parish.name}" to record them: `)).trim();
    if (typed !== parish.name) fail('Nothing was recorded.');
  } finally {
    rl.close();
  }
  // --yes: the typed parish name above is the confirmation; the CLI can't prompt here.
  const result = npx(['supabase', 'migration', 'repair', '--status', 'applied', '--yes', remote(parish), ...marking.map((c) => c.version)], { encoding: 'utf8' });
  const output = hidePasswords(`${result.stdout || ''}${result.stderr || ''}`, parishes).trim();
  if (result.status !== 0) fail(`Couldn't record them:\n${indent(output)}`);
  console.log(`Recorded. Now:\n${indent(describe(parish, pending(parish, parishes)))}`);
}

const [command, target, extra] = process.argv.slice(2);
if (!command) {
  fail('Usage: npm run release:db -- status [parish]   |   <parish|all>   |   check <parish>   |   mark <parish> <version|from-to>');
}
const parishes = loadParishes();
if (command === 'status') status(parishes, target);
else if (command === 'check') check(parishes, target);
else if (command === 'mark') await mark(parishes, target, extra);
else await release(parishes, command);
