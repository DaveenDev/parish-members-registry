import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeDbUrl } from '../../.github/scripts/db-url.mjs';

const GOOD = 'postgresql://postgres.abcd:secret123@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres';

describe('backup: tidying SUPABASE_DB_URL', () => {
  test('a correct connection string passes unchanged', () => {
    assert.deepEqual(normalizeDbUrl(GOOD), { url: GOOD, notes: [] });
  });

  test('copy-paste extras are removed', () => {
    assert.equal(normalizeDbUrl(`  ${GOOD}\n`).url, GOOD);
    assert.equal(normalizeDbUrl(`"${GOOD}"`).url, GOOD);
    assert.equal(normalizeDbUrl(`psql "${GOOD}"`).url, GOOD);
  });

  test('a password with special characters is URL-encoded', () => {
    const r = normalizeDbUrl('postgresql://postgres.abcd:p@ss#w/rd?1@db.example.com:5432/postgres');
    assert.equal(r.url, 'postgresql://postgres.abcd:p%40ss%23w%2Frd%3F1@db.example.com:5432/postgres');
    assert.match(r.notes.join(), /URL-encoded/);
  });

  test('an already encoded password is left as it is', () => {
    const url = 'postgresql://postgres.abcd:p%40ss@db.example.com:5432/postgres';
    assert.deepEqual(normalizeDbUrl(url), { url, notes: [] });
  });

  test('the [ ] from the template are removed', () => {
    assert.equal(normalizeDbUrl('postgresql://postgres.abcd:[secret123]@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres').url, GOOD);
  });

  test('the placeholder, a missing password or another format is refused', () => {
    assert.match(normalizeDbUrl('postgresql://postgres.abcd:[YOUR-PASSWORD]@h:5432/postgres').error, /placeholder/);
    assert.match(normalizeDbUrl('postgresql://postgres.abcd:@h:5432/postgres').error, /password is missing/);
    assert.match(normalizeDbUrl('https://abcd.supabase.co').error, /web address/);
    assert.match(normalizeDbUrl('').error, /empty/);
  });

  test('a name= in front, or a Prisma .env block, is reduced to the connection string', () => {
    assert.equal(normalizeDbUrl(`DATABASE_URL=${GOOD}`).url, GOOD);
    assert.equal(normalizeDbUrl(`export SUPABASE_DB_URL="${GOOD}"`).url, GOOD);
    const prisma = [
      '# Connect to Supabase via connection pooling',
      `DATABASE_URL="${GOOD.replace(':5432', ':6543')}?pgbouncer=true"`,
      '# Direct connection to the database. Used for migrations',
      `DIRECT_URL="${GOOD}"`,
    ].join('\n');
    assert.equal(normalizeDbUrl(prisma).url, GOOD);
    assert.equal(normalizeDbUrl(`${GOOD}?pgbouncer=true&sslmode=require`).url, `${GOOD}?sslmode=require`);
  });

  test("Supabase's other forms of the same connection are turned into the URI", () => {
    const host = 'aws-0-ap-southeast-1.pooler.supabase.com';
    assert.equal(normalizeDbUrl(`postgresql+psycopg2://postgres.abcd:secret123@${host}:5432/postgres`).url, GOOD);
    assert.equal(normalizeDbUrl(`jdbc:postgresql://${host}:5432/postgres?user=postgres.abcd&password=secret123`).url, GOOD);
    assert.equal(normalizeDbUrl(`jdbc:postgresql://${host}:5432/postgres?user=postgres.abcd&password=[p&ss@1]`).url,
      `postgresql://postgres.abcd:p%26ss%401@${host}:5432/postgres`);
    assert.equal(normalizeDbUrl(`user=postgres.abcd password=secret123 host=${host} port=5432 dbname=postgres`).url, GOOD);
    assert.equal(normalizeDbUrl(`user=postgres.abcd\npassword=secret123\nhost=${host}\nport=5432\ndbname=postgres`).url, GOOD);
    assert.equal(normalizeDbUrl(`User Id=postgres.abcd;Password=secret123;Server=${host};Port=5432;Database=postgres`).url, GOOD);
  });

  test('what is wrong is said without repeating the secret', () => {
    for (const bad of ['just-the-password', 'https://abcd.supabase.co', 'postgresql://postgres.abcd@h:5432/postgres',
      'psql -h h -p 5432 -d postgres -U postgres.abcd', 'postgresql://postgres.abcd:secret123']) {
      const { error } = normalizeDbUrl(bad);
      assert.ok(error, bad);
      assert.ok(!error.includes('secret123') && !error.includes('just-the-password') && !error.includes('abcd'), error);
      // GitHub hides scheme://user:password@ in the log, so say it in words.
      assert.doesNotMatch(error, /:\/\/\w+:\w+@/);
    }
    assert.match(normalizeDbUrl('postgresql://postgres.abcd@h:5432/postgres').error, /password is missing/);
    assert.match(normalizeDbUrl('psql -h h -p 5432 -d postgres -U postgres.abcd').error, /leaves the password out/);
  });

  test('the pooler needs the project in the user name', () => {
    assert.match(normalizeDbUrl(GOOD.replace('postgres.abcd', 'postgres')).error, /user name/);
  });

  test('the Direct connection gets a note', () => {
    assert.match(normalizeDbUrl('postgresql://postgres:secret123@db.abcd.supabase.co:5432/postgres').notes.join(), /Direct connection/);
  });

  test('the Transaction pooler port gets a note', () => {
    assert.match(normalizeDbUrl(GOOD.replace(':5432', ':6543')).notes.join(), /Session pooler/);
  });
});
