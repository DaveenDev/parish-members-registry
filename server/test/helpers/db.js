/**
 * Test-database plumbing for the API suites.
 *
 * The API tests talk to a real PostgreSQL database, because most of what is
 * worth testing in the routes *is* the SQL. To make that safe:
 *
 *  - the connection string must come from TEST_DATABASE_URL, never from the
 *    DATABASE_URL a developer has pointed at their working database;
 *  - the database name must contain "test", so a mistyped variable cannot
 *    truncate a real register;
 *  - suites are skipped (not failed) when TEST_DATABASE_URL is unset, so
 *    `npm test` still works on a machine without PostgreSQL.
 *
 * See docs/testing.md for the one-time setup.
 */

const url = process.env.TEST_DATABASE_URL || '';

function databaseName(connectionString) {
  try {
    return new URL(connectionString).pathname.replace(/^\//, '');
  } catch {
    return '';
  }
}

export const dbConfigured = Boolean(url);
export const skipReason = 'TEST_DATABASE_URL is not set — see docs/testing.md';

if (dbConfigured) {
  const name = databaseName(url);
  if (!/test/i.test(name)) {
    throw new Error(
      `Refusing to run tests against "${name || url}": the database name must contain "test".`
    );
  }
  // pool.js reads these at import time, so they have to be in place before any
  // test file dynamically imports the server modules.
  process.env.DATABASE_URL = url;
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-production';
  process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || '';
}

/** Lazily import the pool so the env above is applied first. */
export async function getPool() {
  const { pool } = await import('../../src/db/pool.js');
  return pool;
}

/**
 * Empty the register. Reference data (GKKs, ministries, organizations, staff
 * accounts, parish profile) is left alone — suites that change it clean up
 * after themselves.
 */
export async function resetRegistry(pool) {
  await pool.query('TRUNCATE members, households RESTART IDENTITY CASCADE');
}

/** Reference rows the API suites assume exist. Idempotent. */
export async function ensureReferenceData(pool) {
  for (const name of TEST_GKKS) {
    await pool.query('INSERT INTO gkks (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
  }
  for (const name of TEST_MINISTRIES) {
    await pool.query('INSERT INTO ministries (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
  }
  for (const name of TEST_ORGS) {
    await pool.query('INSERT INTO organizations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [name]);
  }
}

export const TEST_GKKS = ['GKK San Isidro', 'GKK Sto. Niño'];
export const TEST_MINISTRIES = ['Choir', 'Lector & Commentator'];
export const TEST_ORGS = ['Youth Ministry'];

let refCounter = 0;

/**
 * Insert a household (and optional members) directly, bypassing the API.
 * Returns `{ id, refNo }`. Used to arrange state for read/update/delete tests
 * without depending on the endpoints under test.
 */
export async function insertHousehold(pool, household = {}, members = []) {
  const refNo = household.ref_no || `TEST-${Date.now()}-${++refCounter}`;
  const {
    household_name = 'Test Family',
    street = '1 Test St.',
    barangay = 'Test Barangay',
    city = 'Test City',
    province = 'Test Province',
    zip = '9400',
    contact = null,
    email = null,
    gkk = null,
    family_grouping = null,
    status = 'Pending',
  } = household;

  const { rows } = await pool.query(
    `INSERT INTO households
       (household_name, street, barangay, city, province, zip, contact, email, gkk, family_grouping, status, ref_no)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [household_name, street, barangay, city, province, zip, contact, email, gkk, family_grouping, status, refNo]
  );
  const id = rows[0].id;

  const memberIds = [];
  for (const m of members) {
    const inserted = await pool.query(
      `INSERT INTO members
         (household_id, first_name, middle_name, last_name, relationship, sex, dob, civil_status,
          contact, email, occupation, blood_type,
          has_baptism, has_communion, has_confirmation, has_matrimony, ministries, organizations)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING id`,
      [
        id,
        m.first_name ?? 'Test',
        m.middle_name ?? null,
        m.last_name ?? 'Member',
        m.relationship ?? 'Head of Household',
        m.sex ?? 'Female',
        m.dob ?? '1990-01-01',
        m.civil_status ?? 'Single',
        m.contact ?? null,
        m.email ?? null,
        m.occupation ?? null,
        m.blood_type ?? null,
        m.has_baptism ?? false,
        m.has_communion ?? false,
        m.has_confirmation ?? false,
        m.has_matrimony ?? false,
        m.ministries ?? [],
        m.organizations ?? [],
      ]
    );
    memberIds.push(inserted.rows[0].id);
  }

  return { id, refNo, memberIds };
}
