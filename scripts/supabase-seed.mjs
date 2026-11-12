// Seed or clear demo households/members directly against a Supabase project.
//
// Replaces the old `db:demo` / `db:reset` scripts, which used to talk to a
// local `pg` connection. This uses the service-role key, so it bypasses RLS —
// never expose that key to the browser bundle, only run this from a trusted
// machine with a local, gitignored `.env`.
//
// Usage:
//   node scripts/supabase-seed.mjs demo    # insert the sample households
//   node scripts/supabase-seed.mjs reset   # delete every household (and, via
//                                          # cascade, every member)
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { DEMO_HOUSEHOLDS } from './demo-data.mjs';
import { insertDemoHouseholds } from './supabase-seed-lib.mjs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in a root .env before running this script.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function reset() {
  const { error } = await supabase.from('households').delete().not('id', 'is', null);
  if (error) throw error;
  console.log('All households (and their members, via cascade) were deleted.');
}

async function demo() {
  await insertDemoHouseholds(supabase, DEMO_HOUSEHOLDS);
}

const cmd = process.argv[2];
if (cmd === 'demo') await demo();
else if (cmd === 'reset') await reset();
else {
  console.error('Usage: node scripts/supabase-seed.mjs <demo|reset>');
  process.exit(1);
}
