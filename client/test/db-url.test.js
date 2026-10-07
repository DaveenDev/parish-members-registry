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
    assert.match(normalizeDbUrl('https://abcd.supabase.co').error, /doesn't look like/);
    assert.match(normalizeDbUrl('').error, /empty/);
  });

  test('the Transaction pooler port gets a note', () => {
    assert.match(normalizeDbUrl(GOOD.replace(':5432', ':6543')).notes.join(), /Session pooler/);
  });
});
