// The root `parishes.json`: every parish's Supabase project and database
// connection string, used by scripts/release-db.mjs, release-functions.mjs
// and parish.mjs, and optionally a Supabase access token for deploying Edge
// Functions to a project on another account. It holds the database
// passwords and tokens, so git ignores it; parishes.example.json
// shows its shape.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const PARISHES_FILE = join(ROOT, 'parishes.json');
const LINKED_REF_FILE = join(ROOT, 'supabase', '.temp', 'project-ref');

export function fail(message) {
  console.error(`\n${message}`);
  process.exit(1);
}

// The project ref is in the pooler string's user name: postgres.<ref>
export function refFromDbUrl(dbUrl) {
  const match = /^postgres(?:ql)?:\/\/postgres\.([a-z]{20}):/.exec(dbUrl || '');
  return match ? match[1] : null;
}

export function passwordFromDbUrl(dbUrl) {
  const match = /^postgres(?:ql)?:\/\/[^:\s]+:([^@\s]+)@/.exec(dbUrl || '');
  return match ? decodeURIComponent(match[1]) : null;
}

// The parishes, as written, without checking them (empty when there's no file).
export function readParishes() {
  if (!existsSync(PARISHES_FILE)) return [];
  let parishes;
  try {
    parishes = JSON.parse(readFileSync(PARISHES_FILE, 'utf8'));
  } catch (err) {
    fail(`parishes.json isn't valid JSON: ${err.message}`);
  }
  if (!Array.isArray(parishes)) fail('parishes.json must be a list of parishes.');
  return parishes;
}

export function writeParishes(parishes) {
  writeFileSync(PARISHES_FILE, `${JSON.stringify(parishes, null, 2)}\n`);
}

export function checkName(name) {
  if (!name || !/^[a-z0-9-]+$/.test(name)) return 'a name of lower-case letters, digits or dashes';
  if (['all', 'status', 'list', 'add', 'link', 'token'].includes(name)) return `a name other than "${name}"`;
  return null;
}

// The parishes, checked: every one has a usable name and connection string.
export function loadParishes() {
  if (!existsSync(PARISHES_FILE)) {
    fail('No parishes.json in the repository root. Add each parish with `npm run parish -- add`, or copy parishes.example.json to parishes.json and fill it in.');
  }
  const parishes = readParishes();
  if (parishes.length === 0) fail('parishes.json has no parishes. Add one with `npm run parish -- add`.');
  const names = new Set();
  for (const p of parishes) {
    const nameProblem = checkName(p.name);
    if (nameProblem) fail(`Each parish needs ${nameProblem} (got ${JSON.stringify(p.name)}).`);
    if (names.has(p.name)) fail(`Two parishes are named "${p.name}".`);
    names.add(p.name);
    if (!/^postgres(ql)?:\/\//.test(p.dbUrl || '') || p.dbUrl.includes('[YOUR-PASSWORD]') || p.dbUrl.includes('<')) {
      fail(`${p.name}: "dbUrl" must be the Session pooler connection string with the password filled in.`);
    }
    const ref = refFromDbUrl(p.dbUrl);
    if (p.projectRef && ref && p.projectRef !== ref) {
      fail(`${p.name}: "projectRef" is ${p.projectRef} but its connection string is for ${ref}.`);
    }
    if (p.accessToken !== undefined && !ACCESS_TOKEN.test(p.accessToken)) {
      fail(`${p.name}: "accessToken" must be a Supabase access token (sbp_…), or left out.`);
    }
    p.projectRef = p.projectRef || ref;
    p.label = p.label || p.name;
  }
  return parishes;
}

// The project this folder's --linked commands reach, if any.
export function linkedRef() {
  if (!existsSync(LINKED_REF_FILE)) return null;
  return readFileSync(LINKED_REF_FILE, 'utf8').trim() || null;
}

// npx is a .cmd file on Windows, which Node only starts through cmd.exe, and
// cmd.exe would mangle the % and & in a connection string. Run npm's own
// npx script with node instead.
export function npx(args, options) {
  if (process.platform === 'win32') {
    const cli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
    if (existsSync(cli)) return spawnSync(process.execPath, [cli, ...args], { cwd: ROOT, ...options });
  }
  return spawnSync('npx', args, { cwd: ROOT, ...options });
}

// Never echo a connection string or an access token: they carry the keys.
export function hidePasswords(text, parishes) {
  let out = text;
  for (const p of parishes) {
    out = out.split(p.dbUrl).join(`<${p.name} database>`);
    if (p.accessToken) out = out.split(p.accessToken).join(`<${p.name} token>`);
  }
  return out.replace(/(postgres(?:ql)?:\/\/[^:\s]+:)[^@\s]+@/g, '$1****@').replace(/\bsbp_\w{8,}/g, 'sbp_****');
}

// Supabase → Account → Access Tokens: "sbp_" and a long string of letters and digits.
export const ACCESS_TOKEN = /^sbp_\w{20,}$/;
