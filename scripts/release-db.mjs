// Run new migrations on each parish's database, one parish at a time.
//
// Every parish (and the demo site) has its own Supabase project, often on
// its own Supabase account. `supabase db push --db-url` reaches each one by
// its connection string, and each database's own migration history decides
// what still has to run, so a parish that is behind gets every migration it
// missed. The connection strings hold the database passwords: they live in
// the root `parishes.json`, which git ignores (copy `parishes.example.json`).
// The first parish in the file is the one every migration is tried on first,
// normally the demo site.
//
// Usage:
//   npm run release:db -- status          # what each database still needs
//   npm run release:db -- status sjmv     # just one
//   npm run release:db -- demo            # run them on one parish
//   npm run release:db -- all             # every parish, in the file's order
//
// See deploy/04-releases.md.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PARISHES_FILE = join(ROOT, 'parishes.json');

function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

function loadParishes() {
  if (!existsSync(PARISHES_FILE)) {
    fail('No parishes.json in the repository root. Copy parishes.example.json to parishes.json and fill in each database\'s connection string.');
  }
  let parishes;
  try {
    parishes = JSON.parse(readFileSync(PARISHES_FILE, 'utf8'));
  } catch (err) {
    fail(`parishes.json isn't valid JSON: ${err.message}`);
  }
  if (!Array.isArray(parishes) || parishes.length === 0) fail('parishes.json must be a list of parishes.');
  const names = new Set();
  for (const p of parishes) {
    if (!p.name || !/^[a-z0-9-]+$/.test(p.name)) fail(`Each parish needs a "name" of lower-case letters, digits or dashes (got ${JSON.stringify(p.name)}).`);
    if (p.name === 'all' || p.name === 'status') fail(`"${p.name}" can't be a parish name.`);
    if (names.has(p.name)) fail(`Two parishes are named "${p.name}".`);
    names.add(p.name);
    if (!/^postgres(ql)?:\/\//.test(p.dbUrl || '') || p.dbUrl.includes('[YOUR-PASSWORD]') || p.dbUrl.includes('<')) {
      fail(`${p.name}: "dbUrl" must be the Session pooler connection string with the password filled in.`);
    }
    p.label = p.label || p.name;
  }
  return parishes;
}

// npx is a .cmd file on Windows, which Node only starts through cmd.exe, and
// cmd.exe would mangle the % and & in a connection string. Run npm's own
// npx script with node instead.
function npx(args, options) {
  if (process.platform === 'win32') {
    const cli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
    if (existsSync(cli)) return spawnSync(process.execPath, [cli, ...args], { cwd: ROOT, ...options });
  }
  return spawnSync('npx', args, { cwd: ROOT, ...options });
}

// Never echo a connection string: it carries the database password.
function hidePasswords(text, parishes) {
  let out = text;
  for (const p of parishes) out = out.split(p.dbUrl).join(`<${p.name} database>`);
  return out.replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/g, '$1****@');
}

// What `db push` would run there, without running it.
function pending(parish, parishes) {
  const result = npx(['supabase', 'db', 'push', '--dry-run', '--skip-vault', '--db-url', parish.dbUrl], { encoding: 'utf8' });
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

      const result = npx(['supabase', 'db', 'push', '--skip-vault', '--yes', '--db-url', parish.dbUrl], { encoding: 'utf8' });
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

const [command, target] = process.argv.slice(2);
if (!command) {
  fail('Usage: npm run release:db -- status [parish]   or   npm run release:db -- <parish|all>');
}
const parishes = loadParishes();
if (command === 'status') status(parishes, target);
else await release(parishes, command);
