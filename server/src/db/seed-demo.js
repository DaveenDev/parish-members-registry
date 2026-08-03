/**
 * `npm run db:demo` — load sample households so the admin panel has something
 * to show. Safe by default: refuses to run if parishioner records already
 * exist, so it cannot quietly mix demo data into a real register.
 */
import { pool } from './pool.js';
import { insertHouseholdWithRef } from '../lib/ref-no.js';
import { DEMO_HOUSEHOLDS } from './demo-data.js';
import { parseFlags, describeTarget, countParishData, requireConfirmation, runScript } from './cli.js';

const flags = parseFlags();

async function insertHousehold(client, h) {
  const householdId = await insertHouseholdWithRef(client, (refNo) => ({
    text: `INSERT INTO households
             (household_name, street, barangay, city, province, zip, contact, email,
              gkk, family_grouping, status, volunteer, notify_optin, consent, ref_no)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,$14)
           RETURNING id`,
    values: [
      h.householdName, h.street, h.barangay, h.city, h.province, h.zip,
      h.contact || null, h.email || null, h.gkk || null, h.familyGrouping || null,
      h.status || 'Pending', h.volunteer || null, !!h.notifyOptin, refNo,
    ],
  }));

  for (const m of h.members) {
    await client.query(
      `INSERT INTO members
         (household_id, first_name, middle_name, last_name, relationship, sex, dob,
          place_of_birth, civil_status, contact, email, occupation, religion, blood_type,
          has_baptism, baptism_date, baptism_church,
          has_communion, communion_date, communion_church,
          has_confirmation, conf_date, conf_church, conf_name, conf_sponsor,
          has_matrimony, mat_date, mat_church, mat_type,
          ministries, organizations)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
               $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)`,
      [
        householdId, m.firstName, m.middleName || null, m.lastName,
        m.relationship || null, m.sex || null, m.dob || null,
        m.placeOfBirth || null, m.civilStatus || null, m.contact || null,
        m.email || null, m.occupation || null, m.religion || 'Roman Catholic', m.bloodType || null,
        !!m.hasBaptism, m.baptismDate || null, m.baptismChurch || null,
        !!m.hasCommunion, m.communionDate || null, m.communionChurch || null,
        !!m.hasConfirmation, m.confDate || null, m.confChurch || null, m.confName || null, m.confSponsor || null,
        !!m.hasMatrimony, m.matDate || null, m.matChurch || null, m.matType || null,
        m.ministries || [], m.organizations || [],
      ]
    );
  }

  return householdId;
}

async function main() {
  const target = describeTarget();
  const existing = await countParishData(pool);
  const memberCount = DEMO_HOUSEHOLDS.reduce((n, h) => n + h.members.length, 0);

  if (existing.households > 0 && !flags.has('--replace')) {
    console.error(`${target} already holds ${existing.households} household(s) and ${existing.members} member(s).`);
    console.error('\nRefusing to add demo data on top of existing records.');
    console.error('  npm run db:demo -- --replace --yes   replace what is there with the demo set');
    console.error('  npm run db:reset -- --yes            clear it and keep an empty register');
    process.exit(1);
  }

  if (flags.has('--replace') && existing.households > 0) {
    requireConfirmation(flags, {
      action: 'delete every household and member, then load demo data',
      target,
      counts: existing,
      command: 'db:demo',
      extraFlags: '--replace',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (flags.has('--replace')) {
      await client.query('TRUNCATE households RESTART IDENTITY CASCADE');
    }
    for (const h of DEMO_HOUSEHOLDS) await insertHousehold(client, h);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log(`Loaded ${DEMO_HOUSEHOLDS.length} demo household(s) and ${memberCount} member(s) into ${target}.`);
  console.log('Sign in to the admin panel to browse them. To clear: npm run db:reset -- --yes');
}

runScript(pool, main);
