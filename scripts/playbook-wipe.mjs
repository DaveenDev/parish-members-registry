// Empty the registry on the TEST Supabase project before a playbook run
// (.claude/playbooks/staff-journey-playbook.md §1 step 2).
//
// Same effect as that step's SQL, but over the REST API with the secret
// (service-role) key, so it needs no Postgres connection string. Keeps
// profiles of real accounts, parish settings, the stock pick-lists and the
// seeded sacrament guides; removes what earlier runs added (rows and pick-list
// names tagged " SV<runid>", staff.sv…@example.test logins).
//
// Usage (root .env must hold SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and
// PLAYBOOK_TEST_PROJECT=yes):
//   npm run db:wipe-test -- --yes
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in a root .env before running this script.');
  process.exit(1);
}
if (process.env.PLAYBOOK_TEST_PROJECT !== 'yes') {
  console.error('Refusing: PLAYBOOK_TEST_PROJECT=yes is not set. Only ever run this against a disposable test project.');
  process.exit(1);
}
if (!process.argv.includes('--yes')) {
  console.error(`This deletes every household, member, request, census and website row in ${SUPABASE_URL}.`);
  console.error('Re-run with --yes to go ahead.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Children before parents. Each entry names a column that is never null, so
// "not null" matches every row (PostgREST refuses an unfiltered delete).
const TABLES = [
  ['blood_request_contacts', 'request_id'],
  ['blood_requests', 'id'],
  ['blood_donors', 'id'],
  ['certificate_requests', 'id'],
  ['prayer_requests', 'id'],
  ['census_submissions', 'id'],
  ['census_member_responses', 'cycle_id'],
  ['census_household_snapshots', 'cycle_id'],
  ['household_access_codes', 'household_id'],
  ['sacrament_verifications', 'member_id'],
  ['duplicate_dismissals', 'member_ids'],
  ['members', 'id'],
  ['households', 'id'],
  ['census_cycles', 'id'],
  ['mass_schedules', 'id'],
  ['announcements', 'id'],
  ['bulletins', 'id'],
  ['events', 'id'],
  ['articles', 'id'],
  ['public_request_log', 'kind'],
];

const PICK_LISTS = ['gkks', 'ministries', 'organizations', 'parish_positions'];
const RUN_TAG = ' SV[0-9]{4}';
const TEST_LOGIN = /^(staff|leak|nobody)\.sv[0-9-]+@example\.test$/i;

for (const [table, col] of TABLES) {
  const { error, count } = await supabase.from(table).delete({ count: 'exact' }).not(col, 'is', null);
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`${table.padEnd(28)} ${count ?? 0} deleted`);
}

for (const table of PICK_LISTS) {
  const { error, count } = await supabase.from(table).delete({ count: 'exact' }).filter('name', 'match', RUN_TAG);
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`${table.padEnd(28)} ${count ?? 0} run-tagged deleted`);
}

let removed = 0;
for (let page = 1; ; page++) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw new Error(`auth users: ${error.message}`);
  for (const u of data.users) {
    if (!TEST_LOGIN.test(u.email || '')) continue;
    const { error: dErr } = await supabase.auth.admin.deleteUser(u.id); // cascades to profiles
    if (dErr) throw new Error(`delete ${u.email}: ${dErr.message}`);
    removed++;
  }
  if (data.users.length < 200) break;
}
console.log(`${'test staff logins'.padEnd(28)} ${removed} deleted`);
console.log('Registry is empty. Sequences are not reset, so new ids continue from where they were.');
