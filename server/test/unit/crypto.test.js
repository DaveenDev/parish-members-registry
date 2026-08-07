import test, { describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET = 'unit-test-secret-for-credential-encryption';

let crypto;

before(async () => {
  crypto = await import('../../src/lib/crypto.js');
});

beforeEach(() => {
  process.env.CREDENTIALS_SECRET = '';
  process.env.JWT_SECRET = 'unit-test-secret-for-credential-encryption';
  crypto.resetKeyCache();
});

describe('encrypt / decrypt', () => {
  test('round-trips a provider API key', () => {
    const key = 'xkeysib-0123456789abcdef';
    assert.equal(crypto.decrypt(crypto.encrypt(key)), key);
  });

  test('produces different ciphertext each time, so equal keys are not detectable', () => {
    const a = crypto.encrypt('same-key');
    const b = crypto.encrypt('same-key');
    assert.notEqual(a, b);
    assert.equal(crypto.decrypt(a), crypto.decrypt(b));
  });

  test('never leaves the plaintext visible in the stored value', () => {
    assert.ok(!crypto.encrypt('xkeysib-secret').includes('xkeysib'));
  });

  test('treats empty input as nothing stored', () => {
    for (const empty of ['', null, undefined]) assert.equal(crypto.encrypt(empty), null);
  });

  test('returns null rather than throwing for malformed ciphertext', () => {
    for (const bad of [null, '', 'not-ciphertext', 'a.b', 'a.b.c.d', 'AAA.BBB.CCC']) {
      assert.equal(crypto.decrypt(bad), null);
    }
  });

  test('refuses to decrypt under a rotated key instead of returning junk', () => {
    const stored = crypto.encrypt('xkeysib-original');

    process.env.JWT_SECRET = 'a-completely-different-secret-value';
    crypto.resetKeyCache();

    assert.equal(crypto.decrypt(stored), null);
  });

  test('detects tampering with the ciphertext body', () => {
    const [iv, body, tag] = crypto.encrypt('xkeysib-original').split('.');
    const flipped = Buffer.from(body, 'base64url');
    flipped[0] ^= 0xff;
    assert.equal(crypto.decrypt(`${iv}.${flipped.toString('base64url')}.${tag}`), null);
  });

  test('prefers CREDENTIALS_SECRET over JWT_SECRET when both are set', () => {
    process.env.CREDENTIALS_SECRET = 'a-dedicated-credentials-secret-value';
    crypto.resetKeyCache();
    const stored = crypto.encrypt('xkeysib-key');

    // Rotating the signing key must not disturb credentials once a dedicated
    // secret is in use — that is the whole reason the variable exists.
    process.env.JWT_SECRET = 'rotated-signing-key';
    crypto.resetKeyCache();
    assert.equal(crypto.decrypt(stored), 'xkeysib-key');
  });
});

describe('reset tokens', () => {
  test('generates URL-safe tokens with no padding to mangle in an email', () => {
    for (let i = 0; i < 20; i++) {
      assert.match(crypto.randomToken(), /^[A-Za-z0-9_-]+$/);
    }
  });

  test('generates a distinct token every time', () => {
    const seen = new Set(Array.from({ length: 200 }, () => crypto.randomToken()));
    assert.equal(seen.size, 200);
  });

  test('hashes deterministically so a token can be looked up by index', () => {
    assert.equal(crypto.hashToken('abc'), crypto.hashToken('abc'));
    assert.notEqual(crypto.hashToken('abc'), crypto.hashToken('abd'));
    assert.match(crypto.hashToken('abc'), /^[0-9a-f]{64}$/);
  });

  test('the hash does not reveal the token', () => {
    const token = crypto.randomToken();
    assert.ok(!crypto.hashToken(token).includes(token));
  });
});

describe('safeEqualHex', () => {
  test('matches identical digests', () => {
    const digest = crypto.hashToken('token');
    assert.equal(crypto.safeEqualHex(digest, digest), true);
  });

  test('rejects different digests, different lengths and empties', () => {
    assert.equal(crypto.safeEqualHex(crypto.hashToken('a'), crypto.hashToken('b')), false);
    assert.equal(crypto.safeEqualHex('abcd', 'ab'), false);
    assert.equal(crypto.safeEqualHex('', ''), false);
  });
});
