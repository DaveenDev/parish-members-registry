// A throwaway LOCAL dev database (Postgres + auth + REST) for the role playbooks.
//
// It is the Supabase local stack in Docker: every migration in
// supabase/migrations is applied, the database listens on
// postgresql://postgres:postgres@127.0.0.1:54322/postgres and the API on
// http://127.0.0.1:54321. Nothing here touches the demo or live projects.
//
// Usage (needs Docker running):
//   npm run db:dev:up       start the stack, apply every migration
//   npm run db:dev:seed     sample households + the playbook staff accounts,
//                           and point the local app at it
//   npm run db:dev:reset    wipe the local db, re-apply migrations, re-seed
//   npm run db:dev:status   show URLs and whether it is running
//   npm run db:dev:down     stop it (data is kept in the Docker volume)
//
// `seed` is safe to run twice: households are only added to an empty
// database, accounts are only created when missing.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { DEMO_HOUSEHOLDS } from './demo-data.mjs';
import { insertDemoHouseholds } from './supabase-seed-lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ACCOUNTS_FILE = join(ROOT, '.claude/playbooks/accounts.local.json');
const CLIENT_ENV = join(ROOT, 'client/.env.local');

// The accounts every staff playbook signs in as (see accounts.example.json).
const ACCOUNTS = [
  { key: 'staff-admin', email: 'pb.admin@example.test', name: 'PB Staff Admin', access: 'full', is_admin: true },
  { key: 'full-access', email: 'pb.full@example.test', name: 'PB Full Access', access: 'full' },
  { key: 'read-only', email: 'pb.readonly@example.test', name: 'PB Read Only', access: 'read_only' },
  { key: 'gkk-leader', email: 'pb.leader@example.test', name: 'PB GKK Leader', access: 'gkk_leader' },
  { key: 'website-staff', email: 'pb.website@example.test', name: 'PB Website', access: 'website' },
  { key: 'clergy', email: 'pb.clergy@example.test', name: 'PB Clergy', access: 'clergy' },
  { key: 'no-access', email: 'pb.noaccess@example.test', name: 'PB No Access', access: null },
];

function supabase(args, opts = {}) {
  return execFileSync('npx', ['supabase', ...args], { cwd: ROOT, encoding: 'utf8', ...opts });
}

function requireDocker() {
  const r = spawnSync('docker', ['info'], { stdio: 'ignore' });
  if (r.status !== 0) {
    console.error('Docker is not running (or not installed). The local dev database runs in Docker:');
    console.error('start Docker Desktop (or the docker daemon) and run this again.');
    process.exit(1);
  }
}

function stackEnv() {
  let out;
  try {
    out = supabase(['status', '-o', 'env'], { stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    console.error('The local stack is not running. Run: npm run db:dev:up');
    process.exit(1);
  }
  const env = {};
  for (const line of out.split('\n')) {
    const m = /^([A-Z_]+)="?(.*?)"?$/.exec(line.trim());
    if (m) env[m[1]] = m[2];
  }
  return { url: env.API_URL, anon: env.ANON_KEY, service: env.SERVICE_ROLE_KEY, db: env.DB_URL };
}

function up() {
  requireDocker();
  console.log('Starting the local Supabase stack (first run pulls images; a few minutes)...');
  spawnSync('npx', ['supabase', 'start', '-x', 'mailpit,studio,vector,imgproxy'], { cwd: ROOT, stdio: 'inherit' });
  status();
}

function status() {
  const s = stackEnv();
  console.log(`API       ${s.url}`);
  console.log(`Postgres  ${s.db}`);
}

async function seed() {
  const s = stackEnv();
  const db = createClient(s.url, s.service, { auth: { persistSession: false } });

  // 1. Households and members: only into an empty database.
  const { count, error: cErr } = await db.from('households').select('id', { count: 'exact', head: true });
  if (cErr) throw cErr;
  if (count === 0) {
    await insertDemoHouseholds(db, DEMO_HOUSEHOLDS);
  } else {
    console.log(`Households already present (${count}); not adding more.`);
  }

  // 2. A GKK for the leader account to coordinate.
  const { data: gkks, error: gErr } = await db.from('gkks').select('id, name').order('id').limit(1);
  if (gErr) throw gErr;
  const gkk = gkks?.[0] || (await db.from('gkks').insert({ name: 'GKK San Isidro' }).select('id, name').single()).data;

  // 3. Staff accounts. Passwords are made here and written only to the
  //    gitignored accounts.local.json, never printed.
  const file = existsSync(ACCOUNTS_FILE) ? JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf8')) : {};
  const { data: existing } = await db.auth.admin.listUsers({ perPage: 1000 });
  for (const a of ACCOUNTS) {
    let user = existing?.users?.find((u) => u.email === a.email);
    let password = file[a.key]?.email === a.email ? file[a.key].password : '';
    if (!user) {
      password = 'Pb-' + randomBytes(9).toString('base64url');
      const { data, error } = await db.auth.admin.createUser({
        email: a.email, password, email_confirm: true, user_metadata: { name: a.name },
      });
      if (error) throw error;
      user = data.user;
    }
    if (a.access) {
      const patch = { name: a.name, access: a.access, is_admin: !!a.is_admin };
      if (a.access === 'gkk_leader') Object.assign(patch, { access_gkk: gkk.name, access_gkk_id: gkk.id });
      const { error } = await db.from('profiles').update(patch).eq('id', user.id);
      if (error) throw error;
    }
    file[a.key] = {
      ...(file[a.key] || {}), email: a.email, password,
      ...(a.access ? { access: a.access } : {}),
      ...(a.is_admin ? { is_admin: true } : {}),
      ...(a.access === 'gkk_leader' ? { gkk: gkk.name } : {}),
    };
  }
  writeFileSync(ACCOUNTS_FILE, JSON.stringify(file, null, 2) + '\n');
  console.log(`Staff accounts ready; sign-in details are in ${ACCOUNTS_FILE.replace(ROOT + '/', '')} (gitignored).`);

  // 4. Point the local app at this database: client/.env.local, keeping any
  //    other lines (VITE_DEMO_*). The previous URL/key are kept as comments.
  const keys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];
  const old = existsSync(CLIENT_ENV) ? readFileSync(CLIENT_ENV, 'utf8').split('\n') : [];
  const kept = old.filter((l) => l.trim() && !keys.some((k) => l.startsWith(k + '=')));
  const saved = old.filter((l) => keys.some((k) => l.startsWith(k + '='))).map((l) => '# before db:dev:seed: ' + l);
  const already = old.some((l) => l.startsWith('VITE_SUPABASE_URL=' + s.url));
  if (!already) {
    writeFileSync(CLIENT_ENV, [...kept.filter((l) => !l.startsWith('# before db:dev:seed')), ...saved, `VITE_SUPABASE_URL=${s.url}`, `VITE_SUPABASE_ANON_KEY=${s.anon}`].join('\n') + '\n');
  }
  console.log('client/.env.local now points the local app at the dev database.');
}

function reset() {
  requireDocker();
  stackEnv();
  spawnSync('npx', ['supabase', 'db', 'reset', '--local'], { cwd: ROOT, stdio: 'inherit' });
}

function down() {
  spawnSync('npx', ['supabase', 'stop'], { cwd: ROOT, stdio: 'inherit' });
}

const cmd = process.argv[2];
if (cmd === 'up') up();
else if (cmd === 'seed') await seed();
else if (cmd === 'reset') { reset(); await seed(); }
else if (cmd === 'status') status();
else if (cmd === 'down') down();
else {
  console.error('Usage: node scripts/dev-db.mjs <up|seed|reset|status|down>');
  process.exit(1);
}
