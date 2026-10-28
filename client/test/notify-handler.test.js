import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { handleNotifyRequest, isPushEndpoint, pushPayload, contactFor } from '../../supabase/functions/notify-staff/handler.js';
import { encryptPayload, vapidHeader, generateVapidKeys, b64url, fromB64url } from '../../supabase/functions/notify-staff/webpush.js';

const subtle = globalThis.crypto.subtle;
const NOW = new Date('2026-10-03T03:00:00Z');
const FN_URL = 'https://abc.supabase.co/functions/v1/notify-staff';

describe('webpush', () => {
  // RFC 8291, Appendix A: the worked example, byte for byte.
  test('encrypts the RFC 8291 example exactly', async () => {
    const asPublic = fromB64url('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
    const jwk = {
      kty: 'EC', crv: 'P-256',
      d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
      x: b64url(asPublic.slice(1, 33)), y: b64url(asPublic.slice(33)),
    };
    const serverKeys = {
      privateKey: await subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']),
      publicKey: await subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
    };
    const body = await encryptPayload('When I grow up, I want to be a watermelon', {
      p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
      auth: 'BTBZMqHH6r4Tts7J_aSIgg',
    }, { salt: fromB64url('DGv6ra1nlYgDCS1FRnbzlw'), serverKeys });
    assert.equal(b64url(body),
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
  });

  test('signs a VAPID token the push service can check', async () => {
    const keys = await generateVapidKeys();
    const header = await vapidHeader('https://fcm.googleapis.com/fcm/send/xyz', { ...keys, subject: 'mailto:office@parish.ph' }, NOW.getTime());
    const [, token, k] = header.match(/^vapid t=(\S+), k=(\S+)$/);
    assert.equal(k, keys.publicKey);
    const [head, claims, sig] = token.split('.');
    const pub = await subtle.importKey('raw', fromB64url(k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    assert.ok(await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, fromB64url(sig), new TextEncoder().encode(`${head}.${claims}`)));
    const c = JSON.parse(new TextDecoder().decode(fromB64url(claims)));
    assert.deepEqual(c, { aud: 'https://fcm.googleapis.com', exp: NOW.getTime() / 1000 + 12 * 3600, sub: 'mailto:office@parish.ph' });
  });
});

describe('notify-staff helpers', () => {
  test('only calls the browsers’ push services', () => {
    assert.ok(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'));
    assert.ok(isPushEndpoint('https://web.push.apple.com/QX'));
    assert.ok(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x'));
    assert.ok(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=1'));
    assert.ok(!isPushEndpoint('http://fcm.googleapis.com/x'));
    assert.ok(!isPushEndpoint('https://fcm.googleapis.com.evil.test/x'));
    assert.ok(!isPushEndpoint('https://169.254.169.254/latest'));
    assert.ok(!isPushEndpoint('not a url'));
  });

  test('the phone sees the kind and number, never the names', () => {
    const p = pushPayload({ id: 7, kind: 'anointing', title: 'Anointing of the Sick: gravely ill', detail: 'Lola Ising · Purok 3', ref_no: 'SR-2026-ABCDEF', link: '/admin/requests?tab=sacraments', urgent: true });
    assert.deepEqual(p, { title: 'Anointing of the Sick: gravely ill', body: 'SR-2026-ABCDEF · Tap to open', url: '/admin/requests?tab=sacraments', tag: 'staff-7', urgent: true });
    // The morning summary is only counts, so it shows them.
    assert.equal(pushPayload({ id: 8, kind: 'digest', title: 'Good morning', detail: '2 certificates', link: '/admin/requests' }).body, '2 certificates');
  });

  test('contact: the parish email, else the website', () => {
    assert.equal(contactFor('office@olg.ph', 'https://x.vercel.app', FN_URL), 'mailto:office@olg.ph');
    assert.equal(contactFor('', 'https://guadalupe-muaan.vercel.app/admin', FN_URL), 'https://guadalupe-muaan.vercel.app');
    assert.equal(contactFor('nope', 'http://localhost:5173', FN_URL), 'https://abc.supabase.co');
  });
});

/** A small in-memory stand-in for the service-role Supabase client. */
function fakeAdmin({ users = [], config = {}, notifications = [], subs = [], targets = [], parish = {} } = {}) {
  const tables = {
    notify_config: [{ id: 1, hook_secret: 's3cret', function_url: null, vapid_public_key: null, vapid_private_jwk: null, contact: null, ...config }],
    staff_notifications: notifications.map((n) => ({ pushed_at: null, ...n })),
    staff_push_subscriptions: subs,
    parish_settings: [{ id: 1, ...parish }],
  };
  function query(table) {
    const filters = [];
    let op = 'select';
    let patch = null;
    const rows = () => tables[table].filter((r) => filters.every((f) => f(r)));
    const q = {
      select() { return q; },
      eq(col, val) { filters.push((r) => r[col] === val); return q; },
      is(col, val) { filters.push((r) => (r[col] ?? null) === val); return q; },
      update(p) { op = 'update'; patch = p; return q; },
      delete() { op = 'delete'; return q; },
      async maybeSingle() { return { data: rows()[0] || null, error: null }; },
      then(resolve) {
        const hit = rows();
        if (op === 'update') hit.forEach((r) => Object.assign(r, patch));
        if (op === 'delete') tables[table] = tables[table].filter((r) => !hit.includes(r));
        resolve({ data: hit, error: null });
      },
    };
    return q;
  }
  return {
    tables,
    auth: {
      getUser: async (token) => {
        const user = users.find((u) => `token-${u.id}` === token);
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'bad token' } };
      },
    },
    from: query,
    rpc: async (name, args) => ({ data: name === 'notification_push_targets' ? targets.filter((t) => t.for === args.p_id) : null, error: null }),
  };
}

function fakePush(statusFor = () => 201) {
  const calls = [];
  const push = async (sub, payload, vapid, opts) => { calls.push({ endpoint: sub.endpoint, payload, vapid, opts }); return statusFor(sub); };
  return { calls, push };
}

const keys = async () => ({ publicKey: 'PUB', privateJwk: { kty: 'EC', d: 'x' } });

describe('handleNotifyRequest', () => {
  const sub = (id, endpoint, extra = {}) => ({ id, endpoint, p256dh: 'k', auth: 'a', ...extra });

  test('deliver needs the database’s secret', async () => {
    const admin = fakeAdmin({ config: { vapid_public_key: 'PUB' } });
    const { push } = fakePush();
    const r = await handleNotifyRequest({ admin, secret: 'wrong', body: { action: 'deliver', id: 1 }, functionUrl: FN_URL, push, now: NOW });
    assert.equal(r.status, 401);
  });

  test('deliver sends once to each target, and drops devices that are gone', async () => {
    const admin = fakeAdmin({
      config: { vapid_public_key: 'PUB', vapid_private_jwk: { d: 1 }, contact: 'mailto:o@p.ph' },
      notifications: [{ id: 5, kind: 'blood', title: 'Blood request: O+', detail: 'Pedro', ref_no: 'BR-1', link: '/admin/requests?tab=blood', urgent: true }],
      subs: [sub(1, 'https://fcm.googleapis.com/a'), sub(2, 'https://fcm.googleapis.com/gone')],
      targets: [{ for: 5, ...sub(1, 'https://fcm.googleapis.com/a') }, { for: 5, ...sub(2, 'https://fcm.googleapis.com/gone') }, { for: 5, ...sub(3, 'https://evil.test/x') }],
    });
    const { calls, push } = fakePush((s) => (s.endpoint.endsWith('gone') ? 410 : 201));
    const call = () => handleNotifyRequest({ admin, secret: 's3cret', body: { action: 'deliver', id: 5 }, functionUrl: FN_URL, push, now: NOW });

    const r = await call();
    assert.equal(r.status, 200);
    assert.deepEqual({ sent: r.body.sent, removed: r.body.removed, failed: r.body.failed }, { sent: 1, removed: 1, failed: 1 });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].payload.body, 'BR-1 · Tap to open');
    assert.deepEqual(calls[0].opts, { urgent: true });
    assert.equal(calls[0].vapid.subject, 'mailto:o@p.ph');
    assert.deepEqual(admin.tables.staff_push_subscriptions.map((s) => s.id), [1]);
    assert.equal(admin.tables.staff_notifications[0].pushed_at, NOW.toISOString());

    // Called again (a retry): nothing goes out twice.
    const again = await call();
    assert.equal(again.body.already, true);
    assert.equal(calls.length, 2);
  });

  test('setup makes the keys once and records the function’s address', async () => {
    const admin = fakeAdmin({ users: [{ id: 'u1' }], parish: { email: 'office@olg.ph' } });
    let made = 0;
    const generateKeys = async () => { made += 1; return keys(); };
    const call = () => handleNotifyRequest({ admin, token: 'token-u1', body: { action: 'setup', site: 'https://olg.vercel.app' }, functionUrl: FN_URL, push: fakePush().push, generateKeys, now: NOW });

    const r = await call();
    assert.deepEqual(r.body, { ok: true, publicKey: 'PUB' });
    const cfg = admin.tables.notify_config[0];
    assert.equal(cfg.function_url, FN_URL);
    assert.equal(cfg.contact, 'mailto:office@olg.ph');
    await call();
    assert.equal(made, 1);
  });

  test('setup and test are for signed-in, enabled staff', async () => {
    const admin = fakeAdmin({ users: [{ id: 'off', banned_until: '2126-01-01T00:00:00Z' }] });
    const base = { admin, body: { action: 'setup' }, functionUrl: FN_URL, push: fakePush().push, generateKeys: keys, now: NOW };
    assert.equal((await handleNotifyRequest({ ...base, token: '' })).status, 401);
    assert.equal((await handleNotifyRequest({ ...base, token: 'token-nobody' })).status, 401);
    assert.equal((await handleNotifyRequest({ ...base, token: 'token-off' })).status, 403);
    assert.equal((await handleNotifyRequest({ ...base, token: 'token-off', body: { action: 'nope' } })).status, 400);
  });

  test('test goes to the caller’s own device only', async () => {
    const admin = fakeAdmin({
      users: [{ id: 'u1' }],
      config: { vapid_public_key: 'PUB', vapid_private_jwk: {} },
      subs: [sub(1, 'https://fcm.googleapis.com/mine', { user_id: 'u1' }), sub(2, 'https://fcm.googleapis.com/other', { user_id: 'u2' }), sub(3, 'https://web.push.apple.com/mine2', { user_id: 'u1' })],
    });
    const { calls, push } = fakePush();
    const call = (body) => handleNotifyRequest({ admin, token: 'token-u1', body, functionUrl: FN_URL, push, generateKeys: keys, now: NOW });

    const r = await call({ action: 'test', endpoint: 'https://web.push.apple.com/mine2' });
    assert.equal(r.body.sent, 1);
    assert.deepEqual(calls.map((c) => c.endpoint), ['https://web.push.apple.com/mine2']);
    assert.equal(calls[0].payload.title, 'Notifications are on');

    const none = await call({ action: 'test', endpoint: 'https://fcm.googleapis.com/other' });
    assert.equal(none.status, 400);
  });
});
