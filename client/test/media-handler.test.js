import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { handleMediaRequest, keyFromUrl, objectKey, r2Settings, MAX_BYTES, NOT_CONFIGURED } from '../../supabase/functions/media-upload/handler.js';

const BASE = 'https://media.example.org';
const NOW = new Date('2026-10-02T03:00:00Z');

/** Service-role client stand-in: tokens are "token-<user id>". */
function fakeAdmin({ users, profiles }) {
  return {
    auth: {
      getUser: async (token) => {
        const user = users.find((u) => `token-${u.id}` === token);
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'bad token' } };
      },
    },
    from: () => ({
      select: () => ({ eq: (col, val) => ({ maybeSingle: async () => ({ data: profiles.find((p) => p[col] === val) || null, error: null }) }) }),
    }),
  };
}

function fakeR2(configured = true) {
  const calls = [];
  return {
    calls,
    configured,
    publicBase: `${BASE}/`,
    signPut: async (key, type) => { calls.push(['sign', key, type]); return `https://r2.test/${key}?sig=1`; },
    remove: async (key) => { calls.push(['delete', key]); },
  };
}

const admin = fakeAdmin({
  users: [{ id: 'web' }, { id: 'full' }, { id: 'reader' }, { id: 'legacy' }, { id: 'off', banned_until: '2126-01-01T00:00:00Z' }],
  profiles: [{ id: 'web', access: 'website' }, { id: 'full', access: 'full' }, { id: 'reader', access: 'read_only' }, { id: 'legacy' }, { id: 'off', access: 'full' }],
});
const call = (token, body, r2 = fakeR2()) => handleMediaRequest({ admin, token, body, r2, uuid: () => 'abc', now: NOW });
const sign = (extra = {}) => ({ action: 'sign', folder: 'articles', contentType: 'image/jpeg', size: 200_000, ...extra });

describe('who may upload', () => {
  test('no or bad token is refused', async () => {
    assert.equal((await call('', sign())).status, 401);
    assert.equal((await call('token-nobody', sign())).status, 401);
  });
  test('disabled and read-only accounts are refused', async () => {
    assert.equal((await call('token-off', sign())).status, 403);
    assert.equal((await call('token-reader', sign())).status, 403);
  });
  test('website, full and pre-0014 (no access value) accounts are allowed', async () => {
    for (const t of ['token-web', 'token-full', 'token-legacy']) assert.equal((await call(t, sign())).status, 200, t);
  });
  test('says R2 is not set up when the secrets are missing', async () => {
    const res = await call('token-web', sign(), fakeR2(false));
    assert.equal(res.status, 503);
    assert.equal(res.body.error, NOT_CONFIGURED);
  });
});

describe('sign', () => {
  test('returns a signed PUT link and the public URL under articles/YYYY/MM', async () => {
    const r2 = fakeR2();
    const res = await call('token-web', sign(), r2);
    assert.equal(res.body.publicUrl, `${BASE}/articles/2026/10/abc.jpg`);
    assert.equal(res.body.uploadUrl, 'https://r2.test/articles/2026/10/abc.jpg?sig=1');
    assert.deepEqual(r2.calls, [['sign', 'articles/2026/10/abc.jpg', 'image/jpeg']]);
  });
  test('only images, not empty, not over the limit, known folder', async () => {
    assert.equal((await call('token-web', sign({ contentType: 'application/pdf' }))).status, 400);
    assert.equal((await call('token-web', sign({ contentType: 'image/svg+xml' }))).status, 400);
    assert.equal((await call('token-web', sign({ size: 0 }))).status, 400);
    assert.equal((await call('token-web', sign({ size: MAX_BYTES + 1 }))).status, 400);
    assert.equal((await call('token-web', sign({ folder: 'staff' }))).status, 400);
  });
  test('event covers go under events/YYYY/MM', async () => {
    const r2 = fakeR2();
    const res = await call('token-web', sign({ folder: 'events' }), r2);
    assert.equal(res.body.publicUrl, `${BASE}/events/2026/10/abc.jpg`);
  });
  test('webp and png keep their extension', () => {
    assert.equal(objectKey('articles', 'image/webp', 'x', NOW), 'articles/2026/10/x.webp');
    assert.equal(objectKey('articles', 'image/png', 'x', NOW), 'articles/2026/10/x.png');
  });
});

describe('delete', () => {
  test('deletes one of our article photos', async () => {
    const r2 = fakeR2();
    const res = await call('token-web', { action: 'delete', url: `${BASE}/articles/2026/10/abc.jpg` }, r2);
    assert.equal(res.status, 200);
    assert.deepEqual(r2.calls, [['delete', 'articles/2026/10/abc.jpg']]);
  });
  test('refuses URLs outside the bucket or the articles folder', async () => {
    for (const url of ['https://evil.example/articles/a.jpg', `${BASE}/other/a.jpg`, `${BASE}/articles/../secret.jpg`, '']) {
      const r2 = fakeR2();
      assert.equal((await call('token-web', { action: 'delete', url }, r2)).status, 400, url);
      assert.deepEqual(r2.calls, []);
    }
  });
  test('deletes an event cover', async () => {
    const r2 = fakeR2();
    assert.equal((await call('token-web', { action: 'delete', url: `${BASE}/events/2026/10/abc.jpg` }, r2)).status, 200);
    assert.deepEqual(r2.calls, [['delete', 'events/2026/10/abc.jpg']]);
  });
  test('keyFromUrl drops query strings', () => {
    assert.equal(keyFromUrl(`${BASE}/articles/a.jpg?v=2`, BASE), 'articles/a.jpg');
  });
});

describe('r2Settings', () => {
  const row = { account_id: 'acc', access_key_id: 'key', secret_access_key: 'secret', bucket: 'b', public_base_url: 'https://m.example.org' };
  const env = { R2_ACCOUNT_ID: 'eacc', R2_ACCESS_KEY_ID: 'ekey', R2_SECRET_ACCESS_KEY: 'esecret', R2_BUCKET: 'eb', R2_PUBLIC_BASE_URL: 'https://e.example.org' };

  test('the settings saved under Parish Config win when complete', () => {
    assert.deepEqual(r2Settings(row, env), { accountId: 'acc', accessKeyId: 'key', secretAccessKey: 'secret', bucket: 'b', publicBase: 'https://m.example.org' });
  });

  test('falls back to the function secrets when the saved settings are missing or incomplete', () => {
    assert.equal(r2Settings(null, env).accountId, 'eacc');
    assert.equal(r2Settings({ ...row, secret_access_key: '  ' }, env).bucket, 'eb');
  });

  test('null when neither is complete', () => {
    assert.equal(r2Settings({ ...row, bucket: '' }, { ...env, R2_BUCKET: '' }), null);
    assert.equal(r2Settings(undefined, undefined), null);
  });
});
