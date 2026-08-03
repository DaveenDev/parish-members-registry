import { randomInt } from 'node:crypto';

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I — safe to read aloud and transcribe
const SUFFIX_LENGTH = 6;
const MAX_ATTEMPTS = 5;

/**
 * Reference numbers are quoted over the phone and written on paper, so they stay
 * short and unambiguous. 32^6 ≈ 1.07 billion combinations keeps collisions
 * negligible; the retry below covers the remainder.
 */
export function genRefNo(year = new Date().getFullYear()) {
  let suffix = '';
  for (let i = 0; i < SUFFIX_LENGTH; i++) suffix += ALPHABET[randomInt(ALPHABET.length)];
  return `OLG-${year}-${suffix}`;
}

const UNIQUE_VIOLATION = '23505';

/**
 * Insert a household, retrying on a ref_no unique violation.
 *
 * `buildQuery(refNo)` must return `{ text, values }` for an INSERT that
 * `RETURNING id`. Runs inside the caller's transaction; a collision is retried
 * with a SAVEPOINT so the surrounding transaction stays usable.
 */
export async function insertHouseholdWithRef(client, buildQuery) {
  let lastError;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { text, values } = buildQuery(genRefNo());
    await client.query('SAVEPOINT ref_attempt');
    try {
      const result = await client.query(text, values);
      await client.query('RELEASE SAVEPOINT ref_attempt');
      return result.rows[0].id;
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT ref_attempt');
      const isRefCollision = err.code === UNIQUE_VIOLATION && String(err.constraint || '').includes('ref_no');
      if (!isRefCollision) throw err;
      lastError = err;
    }
  }

  throw lastError;
}
