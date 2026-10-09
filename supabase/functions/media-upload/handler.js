// Photo uploads for the Parish Website (Blog Articles, event covers, GKK
// history photos, the parish History page, the Organization Structure's
// holder photos and the parish photo on the home page), and the video of the
// History page's main article (0080), stored on Cloudflare R2.
//
// The R2 keys must never reach the browser, so this Edge Function hands the
// admin a short-lived signed PUT link instead; the browser then uploads the
// photo straight to R2. index.ts wires it to Deno and R2; this file is plain
// JavaScript with its dependencies passed in, so it can be unit tested under
// Node.
//
// Only signed-in staff who may edit the website (access 'full' or 'website',
// see 0014_roles_activity_trash.sql) can call it, and GKK leaders for their
// own GKK's history photos (0045); a disabled account is refused even while
// its last access token is still valid.

// Same rule as manage-staff: a disabled login is "banned" until far in the
// future. Kept here so this function can be deployed on its own.
const isDisabled = (user, now) => !!user?.banned_until && new Date(user.banned_until) > now;

export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
export const FOLDERS = ['articles', 'events', 'gkks', 'org', 'parish', 'history'];
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
// Videos only for the History page's main article (0080).
const VIDEO_TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };
const VIDEO_FOLDERS = ['history'];
const EXT = { ...TYPES, ...VIDEO_TYPES };
const MEDIA_EXT = Object.values(EXT).join('|');
const EDIT_WEBSITE = ['full', 'website'];
export const NOT_CONFIGURED = "Photo storage isn't set up yet. A staff admin can add the Cloudflare R2 settings under Parish Config (see docs/media-storage.md).";

const R2_FIELDS = ['accountId', 'accessKeyId', 'secretAccessKey', 'bucket', 'publicBase'];
const trimmed = (v) => String(v ?? '').trim();

/**
 * Which R2 settings to use: the ones a staff admin saved under Parish Config
 * (`row`, a media_storage_settings row, 0025 migration) when all five are
 * filled in, otherwise the function's R2_* secrets (`env`). null when
 * neither is complete.
 */
export function r2Settings(row, env = {}) {
  const fromRow = {
    accountId: trimmed(row?.account_id),
    accessKeyId: trimmed(row?.access_key_id),
    secretAccessKey: trimmed(row?.secret_access_key),
    bucket: trimmed(row?.bucket),
    publicBase: trimmed(row?.public_base_url),
  };
  const fromEnv = {
    accountId: trimmed(env.R2_ACCOUNT_ID),
    accessKeyId: trimmed(env.R2_ACCESS_KEY_ID),
    secretAccessKey: trimmed(env.R2_SECRET_ACCESS_KEY),
    bucket: trimmed(env.R2_BUCKET),
    publicBase: trimmed(env.R2_PUBLIC_BASE_URL),
  };
  const complete = (s) => R2_FIELDS.every((k) => s[k]);
  if (complete(fromRow)) return fromRow;
  if (complete(fromEnv)) return fromEnv;
  return null;
}

// Where the connection test writes its throwaway file: outside the photo
// folders, so nothing on the website can ever point at it.
export const TEST_FOLDER = '_connection-test';

const httpOk = (status) => status >= 200 && status < 300;

/**
 * Connection test for R2 settings typed under Parish Config, before they're
 * saved: upload a tiny file, read it back through the Public URL, delete it.
 * `form` has the form's fields (accountId, accessKeyId, secretAccessKey,
 * bucket, publicBaseUrl); a blank secret means the one already saved
 * (`saved`, the media_storage_settings row). `makeR2(settings)` gives
 * { put(key, body, contentType) → HTTP status, remove(key) }; `fetchPublic(url)`
 * gives { status, text }. Returns { passed, steps: [{ step, ok, message }] }.
 */
export async function testConnection({ form, saved, makeR2, fetchPublic, uuid = () => crypto.randomUUID() }) {
  const settings = {
    accountId: trimmed(form?.accountId),
    accessKeyId: trimmed(form?.accessKeyId),
    secretAccessKey: trimmed(form?.secretAccessKey) || trimmed(saved?.secret_access_key),
    bucket: trimmed(form?.bucket),
    publicBase: trimmed(form?.publicBaseUrl).replace(/\/+$/, ''),
  };
  const steps = [];
  const done = () => ({ passed: steps.every((s) => s.ok || s.step === 'cleanup'), steps });

  const missing = [['accountId', 'Account ID'], ['bucket', 'Bucket name'], ['accessKeyId', 'Access Key ID'], ['secretAccessKey', 'Secret Access Key'], ['publicBase', 'Public URL']]
    .filter(([k]) => !settings[k]).map(([, label]) => label);
  if (missing.length) {
    steps.push({ step: 'settings', ok: false, message: `Fill in: ${missing.join(', ')}.` });
    return done();
  }
  if (!/^https:\/\/[^/\s]+/i.test(settings.publicBase)) {
    steps.push({ step: 'settings', ok: false, message: 'The Public URL must start with https://' });
    return done();
  }

  const r2 = makeR2(settings);
  const key = `${TEST_FOLDER}/${uuid()}.txt`;
  const marker = `parish-registry connection test ${key}`;

  // 1. Upload: checks the account, the keys, the bucket and write permission.
  try {
    const status = await r2.put(key, marker, 'text/plain');
    if (!httpOk(status)) {
      const why = status === 403 || status === 401
        ? 'R2 refused the keys. Check the Access Key ID and Secret Access Key, and that the API token can write to this bucket.'
        : status === 404
          ? 'Bucket not found. Check the Bucket name and the Account ID.'
          : `R2 answered with an error (HTTP ${status}).`;
      steps.push({ step: 'upload', ok: false, message: why });
      return done();
    }
    steps.push({ step: 'upload', ok: true, message: `Uploaded a test file to the “${settings.bucket}” bucket.` });
  } catch (e) {
    steps.push({ step: 'upload', ok: false, message: `Couldn't reach R2. Check the Account ID. (${e?.message || 'no answer'})` });
    return done();
  }

  // 2. Public URL: the address photos are shown from must serve this bucket.
  const publicUrl = `${settings.publicBase}/${key}`;
  try {
    const res = await fetchPublic(publicUrl);
    if (httpOk(res.status) && String(res.text).includes(marker)) {
      steps.push({ step: 'public', ok: true, message: `The Public URL shows files from this bucket (${settings.publicBase}).` });
    } else if (httpOk(res.status)) {
      steps.push({ step: 'public', ok: false, message: 'The Public URL answered, but not with the test file: it seems to show a different bucket or website.' });
    } else {
      steps.push({
        step: 'public',
        ok: false,
        message: `The Public URL didn't find the test file (HTTP ${res.status}). Check the address. If it's the website's /media address, the /media rule for that site's address in client/vercel.json must point at this bucket's public r2.dev address (docs/media-storage.md).`,
      });
    }
  } catch (e) {
    steps.push({ step: 'public', ok: false, message: `Couldn't open the Public URL. Check the address. (${e?.message || 'no answer'})` });
  }

  // 3. Clean up. A leftover test file is harmless, so this never fails the test.
  try {
    await r2.remove(key);
    steps.push({ step: 'cleanup', ok: true, message: 'Removed the test file.' });
  } catch (e) {
    steps.push({ step: 'cleanup', ok: false, message: `Couldn't remove the test file (${key}); it's harmless. The API token may lack delete permission.` });
  }
  return done();
}

const ok = (body) => ({ status: 200, body: { ok: true, ...body } });
const fail = (status, error) => ({ status, body: { error } });

/** "articles/2026/10/<uuid>.jpg" for a new photo, "history/2026/10/<uuid>.mp4" for a video. */
export function objectKey(folder, contentType, uuid, now = new Date()) {
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${folder}/${now.getUTCFullYear()}/${mm}/${uuid}.${EXT[contentType]}`;
}

/** The R2 key behind one of our public photo URLs, or null if it isn't one we may delete. */
export function keyFromUrl(url, publicBase) {
  const base = String(publicBase || '').replace(/\/+$/, '');
  const u = String(url || '');
  if (!base || !u.startsWith(`${base}/`)) return null;
  const key = decodeURIComponent(u.slice(base.length + 1).split(/[?#]/)[0]);
  if (key.includes('..') || !FOLDERS.some((f) => key.startsWith(`${f}/`))) return null;
  return key;
}

// Readable names once a row is saved (0029 migration): article101_cover.jpg,
// article101_1.jpg…, event55_cover.jpg, and history3_cover.jpg, history3_1.jpg…
// for the History page (0068), whose photo inside the main article (0069) and
// video (0080, history3_4.mp4) are numbered with the gallery. Events only have
// a cover.
const NAMED = {
  articles: { folder: 'articles', prefix: 'article', gallery: true },
  events: { folder: 'events', prefix: 'event', gallery: false },
  history_articles: { folder: 'history', prefix: 'history', gallery: true, inside: ['body_photo_url', 'video_url'] },
};

/**
 * How to rename the photos of `row` (a row of `table`) to their readable
 * names: `moves` lists the R2 copies to make, `patch` is the row's new photo
 * URLs and counters. Photos already named for this row are left alone, and
 * so are links that aren't in our bucket (e.g. an old public address).
 * Numbers continue from the row's counters, so a name is never reused.
 */
export function namePlan(table, row, publicBase) {
  const spec = NAMED[table];
  const base = String(publicBase || '').replace(/\/+$/, '');
  const stem = `${spec.folder}/${spec.prefix}${row.id}_`;
  const isCover = new RegExp(`^${stem}cover(_\\d+)?\\.(jpg|png|webp)$`);
  const isPhoto = new RegExp(`^${stem}\\d+\\.(${MEDIA_EXT})$`);
  let coverSeq = row.cover_seq || 0;
  let photoSeq = row.photo_seq || 0;
  const moves = [];

  const rename = (url, cover) => {
    const key = keyFromUrl(url, base);
    if (!key || !key.startsWith(`${spec.folder}/`) || (cover ? isCover : isPhoto).test(key)) return url;
    const ext = (key.match(new RegExp(`\\.(${MEDIA_EXT})$`)) || [])[1] || 'jpg';
    let to;
    if (cover) {
      coverSeq += 1;
      to = `${stem}cover${coverSeq === 1 ? '' : `_${coverSeq}`}.${ext}`;
    } else {
      photoSeq += 1;
      to = `${stem}${photoSeq}.${ext}`;
    }
    const newUrl = `${base}/${to}`;
    moves.push({ from: key, to, oldUrl: url, newUrl });
    return newUrl;
  };

  const patch = {};
  if (row.photo_url) patch.photo_url = rename(row.photo_url, true);
  if (spec.gallery) patch.photos = (row.photos || []).map((p) => (p?.url ? { ...p, url: rename(p.url, false) } : p));
  for (const field of spec.inside || []) {
    if (row[field]) patch[field] = rename(row[field], false);
  }
  patch.cover_seq = coverSeq;
  if (spec.gallery) patch.photo_seq = photoSeq;
  return { moves, patch };
}

/** True when any article, event, History page article or GKK history still links to `url` (or when we can't tell). */
async function inUse(admin, url) {
  const checks = await Promise.all([
    admin.from('articles').select('id').eq('photo_url', url).limit(1),
    admin.from('articles').select('id').contains('photos', [{ url }]).limit(1),
    admin.from('events').select('id').eq('photo_url', url).limit(1),
  ]);
  if (checks.some((r) => r.error || r.data?.length)) return true;
  // Before 0068 there's no History table, so it uses nothing.
  const history = await Promise.all([
    admin.from('history_articles').select('id').eq('photo_url', url).limit(1),
    admin.from('history_articles').select('id').contains('photos', [{ url }]).limit(1),
    admin.from('history_articles').select('id').eq('body_photo_url', url).limit(1),
    admin.from('history_articles').select('id').eq('video_url', url).limit(1),
  ]);
  // Nor, before 0069 and 0080, a photo or video inside the main article.
  const noTable = (e) => ['42P01', 'PGRST205', '42703'].includes(e?.code);
  if (history.some((r) => (r.error && !noTable(r.error)) || r.data?.length)) return true;
  const gkks = await gkksUsing(admin, url);
  return gkks.error || gkks.names.length > 0;
}

/**
 * The GKKs whose history, main photo or gallery use `url`: { names, error }.
 * A column a migration hasn't added yet (0044, 0046) uses nothing.
 */
async function gkksUsing(admin, url) {
  const checks = await Promise.all([
    admin.from('gkks').select('name').contains('history_photos', [{ url }]),
    admin.from('gkks').select('name').contains('photos', [{ url }]),
    admin.from('gkks').select('name').eq('photo_url', url),
  ]);
  const noColumn = (e) => ['42703', 'PGRST204'].includes(e?.code) || /history_photos|photo_url|photos/.test(e?.message || '');
  return {
    error: checks.some((r) => r.error && !noColumn(r.error)),
    names: [...new Set(checks.flatMap((r) => (r.error ? [] : (r.data || []).map((g) => g.name))))],
  };
}

/**
 * `r2` is { configured, publicBase, signPut(key, contentType) → url, copy(from, to) → void, remove(key) → void }.
 * For the connection test: `saved` is the media_storage_settings row, and
 * `makeR2` / `fetchPublic` are as in testConnection.
 * `uuid` and `now` are injectable for tests.
 */
export async function handleMediaRequest({ admin, token, body, r2, saved = null, makeR2, fetchPublic, uuid = () => crypto.randomUUID(), now = new Date() }) {
  if (!token) return fail(401, 'Please sign in again');
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  const caller = auth?.user;
  if (authError || !caller) return fail(401, 'Please sign in again');
  if (isDisabled(caller, now)) return fail(403, 'This account has been disabled');

  // A GKK leader's GKK by id, with its current name (0063).
  const { data: me } = await admin.from('profiles').select('access, is_admin, gkk:gkks(name)').eq('id', caller.id).maybeSingle();

  // Testing R2 settings (Parish Config → Platform Integrations) is for staff
  // admins, like the settings themselves, and works before any are saved.
  if (body?.action === 'test') {
    if (!me?.is_admin) return fail(403, 'Only staff admins can test the photo storage settings');
    if (!makeR2 || !fetchPublic) return fail(500, 'The connection test is not available');
    return ok(await testConnection({ form: body, saved, makeR2, fetchPublic, uuid }));
  }

  // No profile or no access level means no access, like staff_access() (0065).
  const access = me?.access || 'none';
  // A GKK leader may only add and remove their own GKK's photos (0045, 0046).
  const leaderGkk = access === 'gkk_leader' ? me?.gkk?.name || null : null;
  if (!EDIT_WEBSITE.includes(access) && !leaderGkk) return fail(403, "Your account can't change the website");

  if (!r2?.configured) return fail(503, NOT_CONFIGURED);

  const action = body?.action;
  try {
    if (action === 'sign') {
      const folder = body.folder || 'articles';
      if (!FOLDERS.includes(folder)) return fail(400, 'Unknown photo folder');
      if (leaderGkk && folder !== 'gkks') return fail(403, "Your account can only add photos to your GKK's page");
      const video = !!VIDEO_TYPES[body.contentType];
      if (video && !VIDEO_FOLDERS.includes(folder)) return fail(400, 'Videos can only be added to the History page');
      if (!video && !TYPES[body.contentType]) return fail(400, 'Only JPG, PNG or WebP photos can be uploaded');
      const size = Number(body.size);
      if (!Number.isFinite(size) || size <= 0) return fail(400, 'That file looks empty');
      if (video && size > MAX_VIDEO_BYTES) return fail(400, 'That video is over 200 MB. Trim it, or save it at a lower quality.');
      if (!video && size > MAX_BYTES) return fail(400, 'That photo is over 10 MB');
      const key = objectKey(folder, body.contentType, uuid(), now);
      const uploadUrl = await r2.signPut(key, body.contentType);
      return ok({ uploadUrl, publicUrl: `${String(r2.publicBase).replace(/\/+$/, '')}/${key}` });
    }

    if (action === 'delete') {
      const key = keyFromUrl(body.url, r2.publicBase);
      if (!key) return fail(400, "That photo isn't one of the website's uploads");
      if (leaderGkk) {
        // Only GKK photos, and none that another GKK uses.
        const refused = fail(403, "Your account can only remove your own GKK's photos");
        if (!key.startsWith('gkks/')) return refused;
        const users = await gkksUsing(admin, body.url);
        if (users.error || users.names.some((n) => n !== leaderGkk)) return refused;
      }
      await r2.remove(key);
      return ok({});
    }

    // After an article or event is saved: give its photos their readable
    // names (copy on R2, update the row, then delete the old files that no
    // row uses any more; a duplicated event can share its original's cover).
    if (action === 'name') {
      if (leaderGkk) return fail(403, "Your account can't change the website");
      const spec = NAMED[body.table];
      const id = Number(body.id);
      if (!spec || !Number.isInteger(id) || id <= 0) return fail(400, 'Unknown article or event');
      // Every column: which photo columns there are depends on the table and its migrations.
      const { data: row, error } = await admin.from(body.table).select('*').eq('id', id).maybeSingle();
      if (error) {
        if (/cover_seq|photo_seq/.test(error.message || '')) return fail(400, 'Run the 0029_photo_file_names.sql migration in Supabase to rename photos');
        if (/history_articles/.test(error.message || '')) return fail(400, 'Run the 0068_parish_history.sql migration in Supabase to rename History photos');
        throw new Error(error.message);
      }
      if (!row) return fail(404, 'That article or event no longer exists');
      if (!('cover_seq' in row)) return fail(400, 'Run the 0029_photo_file_names.sql migration in Supabase to rename photos');

      const { moves, patch } = namePlan(body.table, row, r2.publicBase);
      if (!moves.length) return ok({ row: null });
      for (const m of moves) await r2.copy(m.from, m.to);
      const { data: saved, error: saveError } = await admin.from(body.table).update(patch).eq('id', id).select().single();
      if (saveError) throw new Error(saveError.message);
      for (const m of moves) {
        if (!(await inUse(admin, m.oldUrl))) await r2.remove(m.from).catch(() => {});
      }
      return ok({ row: saved });
    }

    return fail(400, 'Unknown action');
  } catch (e) {
    return fail(502, e?.message || 'Photo storage did not respond');
  }
}
