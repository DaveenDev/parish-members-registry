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
  for (const h of DEMO_HOUSEHOLDS) {
    const { data: household, error } = await supabase
      .from('households')
      .insert({
        household_name: h.householdName,
        street: h.street,
        barangay: h.barangay,
        city: h.city,
        province: h.province,
        zip: h.zip,
        contact: h.contact || null,
        email: h.email || null,
        gkk: h.gkk || null,
        family_grouping: h.familyGrouping || null,
        status: h.status,
        volunteer: h.volunteer || null,
        notify_optin: !!h.notifyOptin,
        consent: true,
      })
      .select('id')
      .single();
    if (error) throw error;

    const rows = h.members.map((m) => ({
      household_id: household.id,
      first_name: m.firstName,
      middle_name: m.middleName || null,
      last_name: m.lastName,
      relationship: m.relationship || null,
      sex: m.sex || null,
      dob: m.dob || null,
      place_of_birth: m.placeOfBirth || null,
      civil_status: m.civilStatus || null,
      contact: m.contact || null,
      email: m.email || null,
      occupation: m.occupation || null,
      blood_type: m.bloodType || null,
      has_baptism: !!m.hasBaptism, baptism_date: m.baptismDate || null, baptism_church: m.baptismChurch || null,
      has_communion: !!m.hasCommunion, communion_date: m.communionDate || null, communion_church: m.communionChurch || null,
      has_confirmation: !!m.hasConfirmation, conf_date: m.confDate || null, conf_church: m.confChurch || null,
      conf_name: m.confName || null, conf_sponsor: m.confSponsor || null,
      has_matrimony: !!m.hasMatrimony, mat_date: m.matDate || null, mat_church: m.matChurch || null, mat_type: m.matType || null,
      ministries: m.ministries || [],
      organizations: m.organizations || [],
    }));
    const { error: mErr } = await supabase.from('members').insert(rows);
    if (mErr) throw mErr;
  }
  console.log(`Seeded ${DEMO_HOUSEHOLDS.length} demo households.`);
}

const cmd = process.argv[2];
if (cmd === 'demo') await demo();
else if (cmd === 'reset') await reset();
else {
  console.error('Usage: node scripts/supabase-seed.mjs <demo|reset>');
  process.exit(1);
}
