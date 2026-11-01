// Deploy the Edge Functions to each parish's Supabase project, one parish at
// a time, as scripts/release-db.mjs runs the migrations.
//
// The functions are the same for every parish (manage-staff's Demo access
// rule names the demo project, not a parish), so they all go from this
// folder. Each project is reached by its ref in the root `parishes.json`;
// a project on another Supabase account needs that account's access token
// there (`npm run parish -- token <name>`), otherwise this computer's own
// `npx supabase login` is used. --use-api builds them without Docker.
//
// Usage:
//   npm run release:functions -- status          # what each project has deployed
//   npm run release:functions -- status sjmv     # just one
//   npm run release:functions -- demo            # deploy them all to one parish
//   npm run release:functions -- demo media-upload   # just one function
//   npm run release:functions -- all             # every parish, in the file's order
//
// See deploy/04-releases.md.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { ROOT, fail, hidePasswords, loadParishes, npx } from './parishes-file.mjs';

const FUNCTIONS_DIR = join(ROOT, 'supabase', 'functions');

// Every function folder with an index.ts (folders starting with _ are shared code).
function functionNames() {
  return readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('_') && existsSync(join(FUNCTIONS_DIR, d.name, 'index.ts')))
    .map((d) => d.name)
    .sort();
}

// Functions with verify_jwt = false in supabase/config.toml (notify-staff:
// the database calls it without a user's token).
function noJwtFunctions(toml = readFileSync(join(ROOT, 'supabase', 'config.toml'), 'utf8')) {
  const names = [];
  for (const [, name, body] of toml.matchAll(/^\[functions\.([\w-]+)\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/gm)) {
    if (/^\s*verify_jwt\s*=\s*false\b/m.test(body)) names.push(name);
  }
  return names;
}

function supabase(parish, args, parishes) {
  const env = { ...process.env };
  if (parish.accessToken) env.SUPABASE_ACCESS_TOKEN = parish.accessToken;
  const result = npx(['supabase', ...args], { encoding: 'utf8', env });
  return { ok: result.status === 0, output: hidePasswords(`${result.stdout || ''}${result.stderr || ''}`, parishes).trim() };
}

function indent(text) {
  return text.split('\n').map((line) => `    ${line}`).join('\n');
}

function accessHint(parish) {
  return parish.accessToken
    ? `The token for ${parish.name} may have expired or be for another account: npm run parish -- token ${parish.name}`
    : `No token for ${parish.name}, so this computer's \`npx supabase login\` was used. If that account isn't a member of the project, add one: npm run parish -- token ${parish.name}`;
}

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

// As for migrations: only functions committed on main go out.
function functionsFolderProblem() {
  const branch = git(['branch', '--show-current']);
  if (branch !== 'main') return `This folder is on "${branch || 'no branch'}", not main. Releases go out from main.`;
  const changes = git(['status', '--porcelain', '--', 'supabase/functions', 'supabase/config.toml']);
  if (changes === null) return 'Couldn\'t read git status.';
  if (changes) return `supabase/functions has changes that aren't committed:\n${indent(changes)}\nCommit them (or move them away) first.`;
  return null;
}

function pick(parishes, target) {
  if (!target || target === 'all') return parishes;
  const parish = parishes.find((p) => p.name === target);
  if (!parish) fail(`No parish named "${target}" in parishes.json. Names: ${parishes.map((p) => p.name).join(', ')}.`);
  return [parish];
}

function status(parishes, target) {
  let failed = false;
  for (const parish of pick(parishes, target)) {
    const { ok, output } = supabase(parish, ['functions', 'list', '--project-ref', parish.projectRef], parishes);
    console.log(`${parish.label} (${parish.name}, ${parish.projectRef})${parish.accessToken ? '' : ', with this computer\'s login'}:`);
    console.log(indent(output || '(nothing)'));
    if (!ok) {
      failed = true;
      console.log(indent(accessHint(parish)));
    }
  }
  if (failed) process.exitCode = 1;
}

async function release(parishes, target, only) {
  const problem = functionsFolderProblem();
  if (problem) fail(problem);
  const all = functionNames();
  if (only && !all.includes(only)) fail(`No function named "${only}". Functions: ${all.join(', ')}.`);
  const names = only ? [only] : all;
  const noJwt = noJwtFunctions();

  const first = parishes[0];
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const parish of pick(parishes, target)) {
      console.log(`\n=== ${parish.label} (${parish.name}, ${parish.projectRef}) ===`);
      console.log(`To deploy: ${names.join(', ')}`);
      if (parish !== first) {
        const tried = (await rl.question(`Were these tried on ${first.label} first (npm run release:functions -- ${first.name})? [y/N] `)).trim().toLowerCase();
        if (tried !== 'y' && tried !== 'yes') fail(`Stopped at ${parish.label}. Deploy and try them on ${first.label} first.`);
      }
      const typed = (await rl.question(`Type "${parish.name}" to deploy them to ${parish.label}: `)).trim();
      if (typed !== parish.name) fail(`Stopped at ${parish.label}. Nothing was deployed there.`);

      for (const name of names) {
        const args = ['functions', 'deploy', name, '--project-ref', parish.projectRef, '--use-api'];
        if (noJwt.includes(name)) args.push('--no-verify-jwt');
        console.log(`  ${name}...`);
        const { ok, output } = supabase(parish, args, parishes);
        if (!ok) {
          if (output) console.log(indent(output));
          fail(`${name} failed on ${parish.label}. The functions before it were deployed there; the parishes after it weren't touched.\n${accessHint(parish)}`);
        }
      }
      console.log(`${parish.label}: deployed.`);
    }
  } finally {
    rl.close();
  }
}

const [command, arg] = process.argv.slice(2);
if (!command) {
  fail('Usage: npm run release:functions -- status [parish]   or   npm run release:functions -- <parish|all> [function]');
}
const parishes = loadParishes();
if (command === 'status') status(parishes, arg);
else await release(parishes, command, arg);
