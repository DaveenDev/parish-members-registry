import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { handleMediaRequest, keyFromUrl, namePlan, objectKey, r2Settings, testConnection, MAX_BYTES, MAX_VIDEO_BYTES, NOT_CONFIGURED, TEST_FOLDER } from '../../supabase/functions/media-upload/handler.js';

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
  test('website and full accounts are allowed', async () => {
    for (const t of ['token-web', 'token-full']) assert.equal((await call(t, sign())).status, 200, t);
  });
  test('an account without an access level, or without a profile, is refused (0065)', async () => {
    assert.equal((await call('token-legacy', sign())).status, 403);
    const noProfile = fakeAdmin({ users: [{ id: 'new' }], profiles: [] });
    assert.equal((await handleMediaRequest({ admin: noProfile, token: 'token-new', body: sign(), r2: fakeR2(), uuid: () => 'abc', now: NOW })).status, 403);
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
  test('GKK history photos go under gkks/YYYY/MM and can be deleted', async () => {
    const r2 = fakeR2();
    const res = await call('token-web', sign({ folder: 'gkks' }), r2);
    assert.equal(res.body.publicUrl, `${BASE}/gkks/2026/10/abc.jpg`);
    assert.equal((await call('token-web', { action: 'delete', url: `${BASE}/gkks/2026/10/abc.jpg` }, r2)).status, 200);
  });
  test('Organization Structure photos go under org/YYYY/MM and can be deleted', async () => {
    const r2 = fakeR2();
    const res = await call('token-web', sign({ folder: 'org' }), r2);
    assert.equal(res.body.publicUrl, `${BASE}/org/2026/10/abc.jpg`);
    assert.equal((await call('token-web', { action: 'delete', url: `${BASE}/org/2026/10/abc.jpg` }, r2)).status, 200);
  });
  test('the parish photo goes under parish/YYYY/MM and can be deleted', async () => {
    const r2 = fakeR2();
    const res = await call('token-web', sign({ folder: 'parish' }), r2);
    assert.equal(res.body.publicUrl, `${BASE}/parish/2026/10/abc.jpg`);
    assert.equal((await call('token-web', { action: 'delete', url: `${BASE}/parish/2026/10/abc.jpg` }, r2)).status, 200);
  });
  test('History page photos go under history/YYYY/MM and can be deleted', async () => {
    const r2 = fakeR2();
    const res = await call('token-web', sign({ folder: 'history' }), r2);
    assert.equal(res.body.publicUrl, `${BASE}/history/2026/10/abc.jpg`);
    assert.equal((await call('token-web', { action: 'delete', url: `${BASE}/history/2026/10/abc.jpg` }, r2)).status, 200);
  });
  test('a History page video (0080) is signed with its own type, up to 200 MB', async () => {
    const r2 = fakeR2();
    const res = await call('token-web', sign({ folder: 'history', contentType: 'video/mp4', size: 150 * 1024 * 1024 }), r2);
    assert.equal(res.status, 200);
    assert.equal(res.body.publicUrl, `${BASE}/history/2026/10/abc.mp4`);
    assert.deepEqual(r2.calls, [['sign', 'history/2026/10/abc.mp4', 'video/mp4']]);
    assert.equal(objectKey('history', 'video/quicktime', 'x', NOW), 'history/2026/10/x.mov');
    assert.equal(objectKey('history', 'video/webm', 'x', NOW), 'history/2026/10/x.webm');
    assert.equal((await call('token-web', sign({ folder: 'history', contentType: 'video/mp4', size: MAX_VIDEO_BYTES + 1 }))).status, 400);
    assert.equal((await call('token-web', { action: 'delete', url: `${BASE}/history/2026/10/abc.mp4` }, r2)).status, 200);
  });
  test('videos only for the History page', async () => {
    assert.equal((await call('token-web', sign({ contentType: 'video/mp4' }))).status, 400);
    assert.equal((await call('token-web', sign({ folder: 'events', contentType: 'video/mp4' }))).status, 400);
    assert.equal((await call('token-web', sign({ folder: 'history', contentType: 'video/x-matroska' }))).status, 400);
  });
  test('webp and png keep their extension', () => {
    assert.equal(objectKey('articles', 'image/webp', 'x', NOW), 'articles/2026/10/x.webp');
    assert.equal(objectKey('articles', 'image/png', 'x', NOW), 'articles/2026/10/x.png');
  });
});

describe('GKK leaders (0045)', () => {
  // Profiles plus a gkks table whose history_photos say who uses a photo.
  const leaderAdmin = (gkks) => {
    const base = fakeAdmin({ users: [{ id: 'lead' }, { id: 'lost' }], profiles: [{ id: 'lead', access: 'gkk_leader', gkk: { name: 'San Jose' } }, { id: 'lost', access: 'gkk_leader' }] });
    return {
      auth: base.auth,
      from: (name) => (name === 'gkks'
        ? {
          select: () => ({
            contains: async (col, [want]) => ({ data: gkks.filter((g) => (g[col] || []).some((p) => p.url === want.url)), error: null }),
            eq: async (col, val) => ({ data: gkks.filter((g) => g[col] === val), error: null }),
          }),
        }
        : base.from()),
    };
  };
  const run = (token, body, gkks = [], r2 = fakeR2()) => handleMediaRequest({ admin: leaderAdmin(gkks), token, body, r2, uuid: () => 'abc', now: NOW });
  const mine = `${BASE}/gkks/2026/10/mine.jpg`;
  const theirs = `${BASE}/gkks/2026/10/theirs.jpg`;
  const theirMain = `${BASE}/gkks/2026/10/their-main.jpg`;
  const theirGallery = `${BASE}/gkks/2026/10/their-gallery.jpg`;
  const gkks = [
    { name: 'San Jose', history_photos: [{ url: mine }] },
    { name: 'Sto. Niño', history_photos: [{ url: theirs }], photo_url: theirMain, photos: [{ url: theirGallery }] },
  ];

  test('may upload history photos, nothing else', async () => {
    assert.equal((await run('token-lead', sign({ folder: 'gkks' }))).status, 200);
    assert.equal((await run('token-lead', sign())).status, 403);
    assert.equal((await run('token-lead', sign({ folder: 'events' }))).status, 403);
  });
  test('a leader without a GKK is refused', async () => {
    assert.equal((await run('token-lost', sign({ folder: 'gkks' }))).status, 403);
  });
  test("may delete their own or an unused GKK photo, not another GKK's or an article's", async () => {
    assert.equal((await run('token-lead', { action: 'delete', url: mine }, gkks)).status, 200);
    assert.equal((await run('token-lead', { action: 'delete', url: `${BASE}/gkks/2026/10/new.jpg` }, gkks)).status, 200);
    const r2 = fakeR2();
    assert.equal((await run('token-lead', { action: 'delete', url: theirs }, gkks, r2)).status, 403);
    assert.equal((await run('token-lead', { action: 'delete', url: theirMain }, gkks, r2)).status, 403);
    assert.equal((await run('token-lead', { action: 'delete', url: theirGallery }, gkks, r2)).status, 403);
    assert.equal((await run('token-lead', { action: 'delete', url: `${BASE}/articles/2026/10/a.jpg` }, gkks, r2)).status, 403);
    assert.deepEqual(r2.calls, []);
  });
  test('may not rename photos', async () => {
    assert.equal((await run('token-lead', { action: 'name', table: 'articles', id: 1 })).status, 403);
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

describe('namePlan', () => {
  test('cover, then gallery photos numbered after the counters', () => {
    const row = { id: 101, cover_seq: 0, photo_seq: 2, photo_url: `${BASE}/articles/2026/10/c.jpg`, photos: [{ url: `${BASE}/articles/article101_1.jpg`, caption: 'a' }, { url: `${BASE}/articles/2026/10/x.jpg`, caption: 'b' }] };
    const { moves, patch } = namePlan('articles', row, BASE);
    assert.deepEqual(moves.map((m) => [m.from, m.to]), [
      ['articles/2026/10/c.jpg', 'articles/article101_cover.jpg'],
      ['articles/2026/10/x.jpg', 'articles/article101_3.jpg'],
    ]);
    assert.equal(patch.photo_url, `${BASE}/articles/article101_cover.jpg`);
    assert.deepEqual(patch.photos, [{ url: `${BASE}/articles/article101_1.jpg`, caption: 'a' }, { url: `${BASE}/articles/article101_3.jpg`, caption: 'b' }]);
    assert.equal(patch.cover_seq, 1);
    assert.equal(patch.photo_seq, 3);
  });
  test('a replaced cover gets the next cover number', () => {
    const { moves } = namePlan('articles', { id: 7, cover_seq: 1, photo_url: `${BASE}/articles/2026/10/n.jpg`, photos: [] }, BASE);
    assert.equal(moves[0].to, 'articles/article7_cover_2.jpg');
  });
  test('already named photos and links outside the bucket are left alone', () => {
    const row = { id: 7, cover_seq: 2, photo_seq: 1, photo_url: `${BASE}/articles/article7_cover_2.jpg`, photos: [{ url: 'https://old.r2.dev/articles/2026/10/q.jpg' }, { url: `${BASE}/articles/article7_1.jpg` }] };
    const { moves, patch } = namePlan('articles', row, BASE);
    assert.deepEqual(moves, []);
    assert.equal(patch.photos[0].url, 'https://old.r2.dev/articles/2026/10/q.jpg');
  });
  test("another row's photo is copied to this row's name", () => {
    const { moves, patch } = namePlan('events', { id: 56, cover_seq: 0, photo_url: `${BASE}/events/event55_cover.jpg` }, BASE);
    assert.deepEqual(moves.map((m) => [m.from, m.to]), [['events/event55_cover.jpg', 'events/event56_cover.jpg']]);
    assert.deepEqual(patch, { photo_url: `${BASE}/events/event56_cover.jpg`, cover_seq: 1 });
  });
});

/** Profiles plus in-memory articles/events tables for the "name" action. */
function fakeDb(tables) {
  const base = fakeAdmin({ users: [{ id: 'web' }], profiles: [{ id: 'web', access: 'website' }] });
  const updates = [];
  const query = (name) => {
    const filters = [];
    let patch = null;
    const rows = () => (tables[name] || []).filter((r) => filters.every((f) => f(r)));
    const q = {
      select: () => q,
      eq: (col, val) => { filters.push((r) => r[col] === val); return q; },
      contains: (col, [want]) => { filters.push((r) => (r[col] || []).some((p) => p.url === want.url)); return q; },
      limit: (n) => Promise.resolve({ data: rows().slice(0, n), error: null }),
      update: (p) => { patch = p; return q; },
      maybeSingle: async () => ({ data: rows()[0] || null, error: null }),
      single: async () => {
        const [row] = rows();
        if (patch) { Object.assign(row, patch); updates.push([name, row.id, patch]); }
        return { data: row, error: null };
      },
    };
    return q;
  };
  return { updates, auth: base.auth, from: (name) => (name === 'profiles' ? base.from() : query(name)) };
}

describe('name', () => {
  const r2WithCopy = () => { const r2 = fakeR2(); r2.copy = async (from, to) => { r2.calls.push(['copy', from, to]); }; return r2; };
  const run = (db, body, r2) => handleMediaRequest({ admin: db, token: 'token-web', body: { action: 'name', ...body }, r2, now: NOW });

  test('renames an article\'s photos, saves the row and deletes the old files', async () => {
    const db = fakeDb({ articles: [{ id: 101, cover_seq: 0, photo_seq: 0, photo_url: `${BASE}/articles/2026/10/c.jpg`, photos: [{ url: `${BASE}/articles/2026/10/p.jpg`, caption: '' }] }], events: [] });
    const r2 = r2WithCopy();
    const res = await run(db, { table: 'articles', id: 101 }, r2);
    assert.equal(res.status, 200);
    assert.equal(res.body.row.photo_url, `${BASE}/articles/article101_cover.jpg`);
    assert.deepEqual(r2.calls, [
      ['copy', 'articles/2026/10/c.jpg', 'articles/article101_cover.jpg'],
      ['copy', 'articles/2026/10/p.jpg', 'articles/article101_1.jpg'],
      ['delete', 'articles/2026/10/c.jpg'],
      ['delete', 'articles/2026/10/p.jpg'],
    ]);
  });
  test('renames a History page article to history<ID>_cover.jpg, history<ID>_1.jpg (0068)', async () => {
    const db = fakeDb({ articles: [], events: [], history_articles: [{ id: 3, cover_seq: 0, photo_seq: 0, photo_url: `${BASE}/history/2026/10/c.jpg`, photos: [{ url: `${BASE}/history/2026/10/p.jpg`, caption: 'Ang kapilya' }], body_photo_url: `${BASE}/history/2026/10/b.jpg` }] });
    const r2 = r2WithCopy();
    const res = await run(db, { table: 'history_articles', id: 3 }, r2);
    assert.equal(res.status, 200);
    assert.equal(res.body.row.photo_url, `${BASE}/history/history3_cover.jpg`);
    assert.deepEqual(res.body.row.photos, [{ url: `${BASE}/history/history3_1.jpg`, caption: 'Ang kapilya' }]);
    // The photo inside the main article (0069) is numbered after the gallery.
    assert.equal(res.body.row.body_photo_url, `${BASE}/history/history3_2.jpg`);
    assert.equal(res.body.row.photo_seq, 2);
    assert.deepEqual(r2.calls.map((c) => c[0]), ['copy', 'copy', 'copy', 'delete', 'delete', 'delete']);
  });
  test('renames the main article\'s video (0080) with the gallery, keeping its extension', async () => {
    const db = fakeDb({ articles: [], events: [], history_articles: [{ id: 3, cover_seq: 1, photo_seq: 4, photo_url: `${BASE}/history/history3_cover.jpg`, photos: [], body_photo_url: `${BASE}/history/history3_4.jpg`, video_url: `${BASE}/history/2026/10/v.mov` }] });
    const r2 = r2WithCopy();
    const res = await run(db, { table: 'history_articles', id: 3 }, r2);
    assert.equal(res.body.row.video_url, `${BASE}/history/history3_5.mov`);
    assert.equal(res.body.row.photo_seq, 5);
    assert.deepEqual(r2.calls, [['copy', 'history/2026/10/v.mov', 'history/history3_5.mov'], ['delete', 'history/2026/10/v.mov']]);
    // Once named, it's left alone.
    assert.deepEqual(namePlan('history_articles', res.body.row, BASE).moves, []);
  });
  test("keeps a cover another event still uses (Duplicate)", async () => {
    const shared = `${BASE}/events/event55_cover.jpg`;
    const db = fakeDb({ articles: [], events: [{ id: 55, cover_seq: 1, photo_url: shared }, { id: 56, cover_seq: 0, photo_url: shared }] });
    const r2 = r2WithCopy();
    await run(db, { table: 'events', id: 56 }, r2);
    assert.deepEqual(r2.calls, [['copy', 'events/event55_cover.jpg', 'events/event56_cover.jpg']]);
  });
  test('nothing to do when the photos are already named', async () => {
    const db = fakeDb({ articles: [], events: [{ id: 5, cover_seq: 1, photo_url: `${BASE}/events/event5_cover.jpg` }] });
    const r2 = r2WithCopy();
    const res = await run(db, { table: 'events', id: 5 }, r2);
    assert.equal(res.body.row, null);
    assert.deepEqual(r2.calls, []);
    assert.deepEqual(db.updates, []);
  });
  test('unknown table or id is refused', async () => {
    const db = fakeDb({ articles: [], events: [] });
    assert.equal((await run(db, { table: 'profiles', id: 1 }, r2WithCopy())).status, 400);
    assert.equal((await run(db, { table: 'articles', id: 'x' }, r2WithCopy())).status, 400);
    assert.equal((await run(db, { table: 'articles', id: 9 }, r2WithCopy())).status, 404);
  });
});

describe('connection test (Parish Config → Platform Integrations)', () => {
  const FORM = { accountId: 'acc', accessKeyId: 'key', secretAccessKey: 'secret', bucket: 'parish-media', publicBaseUrl: 'https://media.example.org/' };

  /** An R2 bucket and its public address: what's put can be read back unless `publicServes` is false. */
  function fakeStorage({ putStatus = 200, putThrows = false, publicStatus, publicServes = true, removeThrows = false } = {}) {
    const files = new Map();
    const calls = [];
    return {
      calls,
      makeR2: (settings) => {
        calls.push(['settings', settings]);
        return {
          put: async (key, body) => {
            calls.push(['put', key]);
            if (putThrows) throw new Error('getaddrinfo failed');
            if (putStatus === 200) files.set(key, body);
            return putStatus;
          },
          remove: async (key) => {
            calls.push(['remove', key]);
            if (removeThrows) throw new Error('403');
            files.delete(key);
          },
        };
      },
      fetchPublic: async (url) => {
        calls.push(['get', url]);
        const key = url.replace('https://media.example.org/', '');
        if (publicStatus) return { status: publicStatus, text: '' };
        if (!publicServes) return { status: 200, text: '<html>a website</html>' };
        return files.has(key) ? { status: 200, text: files.get(key) } : { status: 404, text: '' };
      },
    };
  }
  const run = (storage, form = FORM, saved = null) => testConnection({ form, saved, ...storage, uuid: () => 'u1' });
  const steps = (res) => res.steps.map((s) => `${s.step}:${s.ok ? 'ok' : 'fail'}`);

  test('good settings: upload, read back through the Public URL, clean up', async () => {
    const storage = fakeStorage();
    const res = await run(storage);
    assert.equal(res.passed, true);
    assert.deepEqual(steps(res), ['upload:ok', 'public:ok', 'cleanup:ok']);
    assert.deepEqual(storage.calls.slice(1), [
      ['put', `${TEST_FOLDER}/u1.txt`],
      ['get', `https://media.example.org/${TEST_FOLDER}/u1.txt`],
      ['remove', `${TEST_FOLDER}/u1.txt`],
    ]);
  });

  test('a blank secret uses the saved one; missing fields stop before anything is sent', async () => {
    const storage = fakeStorage();
    await run(storage, { ...FORM, secretAccessKey: '' }, { secret_access_key: 'saved-secret' });
    assert.equal(storage.calls[0][1].secretAccessKey, 'saved-secret');

    const empty = fakeStorage();
    const res = await run(empty, { ...FORM, bucket: '', secretAccessKey: '' });
    assert.equal(res.passed, false);
    assert.deepEqual(steps(res), ['settings:fail']);
    assert.match(res.steps[0].message, /Bucket name, Secret Access Key/);
    assert.deepEqual(empty.calls, []);
  });

  test('the Public URL must be https', async () => {
    const res = await run(fakeStorage(), { ...FORM, publicBaseUrl: 'http://media.example.org' });
    assert.deepEqual(steps(res), ['settings:fail']);
  });

  test('wrong keys, wrong bucket or an unreachable account stop at the upload', async () => {
    for (const [opts, pattern] of [[{ putStatus: 403 }, /Access Key ID/], [{ putStatus: 404 }, /Bucket not found/], [{ putThrows: true }, /Account ID/]]) {
      const storage = fakeStorage(opts);
      const res = await run(storage);
      assert.equal(res.passed, false);
      assert.deepEqual(steps(res), ['upload:fail']);
      assert.match(res.steps[0].message, pattern);
      assert.ok(!storage.calls.some(([c]) => c === 'get'), 'no public check after a failed upload');
    }
  });

  test('a Public URL that misses the file, or shows something else, fails but still cleans up', async () => {
    const missing = await run(fakeStorage({ publicStatus: 404 }));
    assert.equal(missing.passed, false);
    assert.deepEqual(steps(missing), ['upload:ok', 'public:fail', 'cleanup:ok']);
    assert.match(missing.steps[1].message, /HTTP 404/);

    const elsewhere = await run(fakeStorage({ publicServes: false }));
    assert.deepEqual(steps(elsewhere), ['upload:ok', 'public:fail', 'cleanup:ok']);
  });

  test('a test file that cannot be removed is only a warning', async () => {
    const res = await run(fakeStorage({ removeThrows: true }));
    assert.equal(res.passed, true);
    assert.deepEqual(steps(res), ['upload:ok', 'public:ok', 'cleanup:fail']);
  });

  test('only staff admins may run it, even before R2 is set up', async () => {
    const db = fakeAdmin({
      users: [{ id: 'boss' }, { id: 'web' }],
      profiles: [{ id: 'boss', access: 'full', is_admin: true }, { id: 'web', access: 'website' }],
    });
    const storage = fakeStorage();
    const ask = (token) => handleMediaRequest({ admin: db, token, body: { action: 'test', ...FORM }, r2: fakeR2(false), ...storage, uuid: () => 'u1', now: NOW });
    assert.equal((await ask('token-web')).status, 403);
    const res = await ask('token-boss');
    assert.equal(res.status, 200);
    assert.equal(res.body.passed, true);
  });
});
