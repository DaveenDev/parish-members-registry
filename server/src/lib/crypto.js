import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

/**
 * Encryption for provider credentials held in the database (currently the
 * outbound email API key). The parish admin edits these in the UI, so they
 * cannot live in environment variables — but a database backup should not hand
 * over the ability to send mail as the parish.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const SALT = 'parish-registry-credentials-v1';

let cachedKey = null;

/**
 * CREDENTIALS_SECRET if set, otherwise JWT_SECRET — one fewer variable to
 * configure, at the cost of tying ciphertext to the signing key. Rotating
 * JWT_SECRET therefore makes stored credentials unreadable; decrypt() turns
 * that into a "re-enter it" message rather than a crash.
 */
function key() {
  if (cachedKey) return cachedKey;
  const secret = process.env.CREDENTIALS_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('CREDENTIALS_SECRET or JWT_SECRET must be set to store provider credentials');
  }
  cachedKey = scryptSync(secret, SALT, 32);
  return cachedKey;
}

/** Test seam — the key is derived once and cached for the process lifetime. */
export function resetKeyCache() {
  cachedKey = null;
}

/** Returns "iv.ciphertext.tag", all base64url. */
export function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return null;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return [iv, enc, cipher.getAuthTag()].map((b) => b.toString('base64url')).join('.');
}

/**
 * Returns null for anything that will not decrypt — absent, malformed, or
 * encrypted under a different key. Callers treat null as "no credential
 * stored", which is the safe reading in every case.
 */
export function decrypt(payload) {
  if (!payload) return null;
  const parts = String(payload).split('.');
  if (parts.length !== 3) return null;

  try {
    const [iv, enc, tag] = parts.map((p) => Buffer.from(p, 'base64url'));
    if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) return null;
    const decipher = createDecipheriv(ALGORITHM, key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** A URL-safe secret for password reset links. */
export function randomToken() {
  return randomBytes(32).toString('base64url');
}

/**
 * Reset tokens are stored hashed. SHA-256 without a salt is right here where
 * bcrypt would be wrong: the input is 256 bits of entropy we generated, so
 * there is nothing to brute-force, and lookup must be a single indexed query.
 */
export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/** Constant-time compare for hex digests of equal length. */
export function safeEqualHex(a, b) {
  const bufA = Buffer.from(String(a), 'hex');
  const bufB = Buffer.from(String(b), 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}
