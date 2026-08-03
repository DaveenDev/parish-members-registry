/**
 * `npm run db:reset` — clear parishioner records so the parish can start on a
 * clean register.
 *
 * By default this removes households and members but keeps the staff accounts,
 * parish profile, and the GKK/ministry/organization pick-lists, so the app is
 * immediately usable. `--all` additionally wipes those and re-seeds the stock
 * defaults, returning the database to a just-installed state.
 */
import { pool } from './pool.js';
import { seedReferenceData, seedAdminUser } from './defaults.js';
import { parseFlags, describeTarget, countParishData, requireConfirmation, runScript } from './cli.js';

const flags = parseFlags();
const wipeEverything = flags.has('--all');

async function main() {
  const target = describeTarget();
  const counts = await countParishData(pool);

  requireConfirmation(flags, {
    action: wipeEverything
      ? 'delete ALL data — households, members, staff accounts, parish profile and pick-lists — and re-seed the stock defaults'
      : 'permanently delete every household and member',
    target,
    counts,
    command: 'db:reset',
    extraFlags: wipeEverything ? '--all' : '',
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Members are removed by the ON DELETE CASCADE from households.
    await client.query('TRUNCATE households RESTART IDENTITY CASCADE');

    if (wipeEverything) {
      await client.query('TRUNCATE admin_users, gkks, ministries, organizations RESTART IDENTITY CASCADE');
      await client.query('DELETE FROM parish_settings');
      await seedReferenceData(client);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  console.log(`Removed ${counts.households} household(s) and ${counts.members} member(s) from ${target}.`);

  if (wipeEverything) {
    // Outside the transaction: bcrypt hashing is slow and needs no rollback.
    const admin = await seedAdminUser(pool);
    console.log('Parish profile and pick-lists restored to defaults.');
    console.log(`Staff account: ${admin.email} / ${admin.password}`);
  } else {
    console.log('Staff accounts, parish profile and pick-lists were kept.');
  }

  console.log('\nThe register is now empty. Load samples any time with: npm run db:demo');
}

runScript(pool, main);
