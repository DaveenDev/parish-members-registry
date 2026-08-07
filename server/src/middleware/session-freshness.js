/**
 * Sessions are stateless JWTs with a seven-day life, so changing a password
 * cannot revoke the tokens already issued under the old one. Without the check
 * here, a volunteer who leaves keeps a working admin session for up to a week
 * after the secretary "locks them out" — which is exactly the situation a
 * password change is meant to resolve.
 *
 * admin_users.password_changed_at is the cutoff: any token issued before it is
 * refused.
 */

const CACHE_TTL_MS = 30_000;

const cache = new Map(); // userId -> { changedAt: epoch seconds, expires: epoch ms }

async function lookupFromDatabase(userId) {
  const { pool } = await import('../db/pool.js');
  const { rows } = await pool.query('SELECT password_changed_at FROM admin_users WHERE id = $1', [userId]);
  if (!rows[0]) return null;
  return Math.floor(new Date(rows[0].password_changed_at).getTime() / 1000);
}

let lookup = lookupFromDatabase;

/** Test seam — replace the database lookup. Pass nothing to restore it. */
export function setFreshnessLookup(fn) {
  lookup = fn || lookupFromDatabase;
  cache.clear();
}

/**
 * Call after changing a password so the new cutoff takes effect immediately
 * rather than after the cache TTL. Render's free plan runs a single instance,
 * so an in-process cache is coherent; this would need Redis behind more.
 */
export function forgetUser(userId) {
  cache.delete(userId);
}

export function clearFreshnessCache() {
  cache.clear();
}

/**
 * Resolves to true when the token is still valid, false when the account's
 * password changed after it was issued or the account no longer exists.
 * Throws if the cutoff cannot be read, so callers fail closed.
 */
export async function isSessionCurrent(userId, issuedAtSeconds) {
  if (!userId) return false;

  const now = Date.now();
  const hit = cache.get(userId);
  let changedAt;

  if (hit && hit.expires > now) {
    changedAt = hit.changedAt;
  } else {
    changedAt = await lookup(userId);
    cache.set(userId, { changedAt, expires: now + CACHE_TTL_MS });
  }

  // The account was deleted.
  if (changedAt === null || changedAt === undefined) return false;

  // A token minted in the same second as the change is the one just handed
  // back by the reset flow, so compare with strict inequality: only tokens
  // issued strictly before the change are refused.
  return Number(issuedAtSeconds) >= Number(changedAt);
}
