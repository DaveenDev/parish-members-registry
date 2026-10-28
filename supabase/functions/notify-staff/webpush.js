// Web Push with nothing but WebCrypto, so the same code runs in the Edge
// Function (Deno) and in the unit tests (Node):
//   * VAPID (RFC 8292): a signed token that says which server sends
//   * aes128gcm payload encryption (RFC 8291): only the phone can read it

const subtle = globalThis.crypto.subtle;
const utf8 = new TextEncoder();

export function b64url(bytes) {
  let s = '';
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(text) {
  const s = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** A new VAPID key pair: the public key as the browser wants it, the private key as a JWK. */
export async function generateVapidKeys() {
  const pair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const raw = new Uint8Array(await subtle.exportKey('raw', pair.publicKey));
  const jwk = await subtle.exportKey('jwk', pair.privateKey);
  return { publicKey: b64url(raw), privateJwk: jwk };
}

/** The Authorization header for one push service (`endpoint`'s origin), valid 12 hours. */
export async function vapidHeader(endpoint, { publicKey, privateJwk, subject }, now = Date.now()) {
  const head = b64url(utf8.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(utf8.encode(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + 12 * 3600,
    sub: subject,
  })));
  const key = await subtle.importKey('jwk', { ...privateJwk, key_ops: ['sign'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8.encode(`${head}.${claims}`));
  return `vapid t=${head}.${claims}.${b64url(sig)}, k=${publicKey}`;
}

async function hkdf(salt, ikm, info, bytes) {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/**
 * `plaintext` encrypted for one browser subscription ({ p256dh, auth },
 * base64url), as the aes128gcm body a push service expects. `salt` and
 * `serverKeys` are only passed in by tests.
 */
export async function encryptPayload(plaintext, { p256dh, auth }, { salt, serverKeys } = {}) {
  const uaPublic = fromB64url(p256dh);
  const authSecret = fromB64url(auth);
  salt = salt || globalThis.crypto.getRandomValues(new Uint8Array(16));
  const server = serverKeys || await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await subtle.exportKey('raw', server.publicKey));

  const uaKey = await subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaKey }, server.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(utf8.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, utf8.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8.encode('Content-Encoding: nonce\0'), 12);

  const data = typeof plaintext === 'string' ? utf8.encode(plaintext) : plaintext;
  const padded = concat(data, new Uint8Array([2])); // a single, last record
  const aes = await subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const sealed = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, padded));

  const recordSize = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return concat(salt, recordSize, new Uint8Array([asPublic.length]), asPublic, sealed);
}

/**
 * Send `payload` (an object, sent as JSON) to one subscription
 * ({ endpoint, p256dh, auth }). Returns the push service's HTTP status:
 * 201 delivered, 404/410 the subscription is gone.
 */
export async function sendPush(subscription, payload, vapid, { urgent = false, ttl = 24 * 3600, fetchImpl = fetch } = {}) {
  const body = await encryptPayload(JSON.stringify(payload), subscription);
  const res = await fetchImpl(subscription.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidHeader(subscription.endpoint, vapid),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: urgent ? 'high' : 'normal',
    },
    body,
  });
  return res.status;
}
