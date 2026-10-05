// Photo uploads for the Parish Website (Blog Articles, event covers and GKK
// history photos), stored on Cloudflare R2.
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
export const FOLDERS = ['articles', 'events', 'gkks'];
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
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

const ok = (body) => ({ status: 200, body: { ok: true, ...body } });
const fail = (status, error) => ({ status, body: { error } });

/** "articles/2026/10/<uuid>.jpg" for a new photo. */
export function objectKey(folder, contentType, uuid, now = new Date()) {
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${folder}/${now.getUTCFullYear()}/${mm}/${uuid}.${TYPES[contentType]}`;
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
// article101_1.jpg… and event55_cover.jpg. Events only have a cover.
const NAMED = {
  articles: { folder: 'articles', prefix: 'article', gallery: true },
  events: { folder: 'events', prefix: 'event', gallery: false },
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
  const isPhoto = new RegExp(`^${stem}\\d+\\.(jpg|png|webp)$`);
  let coverSeq = row.cover_seq || 0;
  let photoSeq = row.photo_seq || 0;
  const moves = [];

  const rename = (url, cover) => {
    const key = keyFromUrl(url, base);
    if (!key || !key.startsWith(`${spec.folder}/`) || (cover ? isCover : isPhoto).test(key)) return url;
    const ext = (key.match(/\.(jpg|png|webp)$/) || [])[1] || 'jpg';
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
  patch.cover_seq = coverSeq;
  if (spec.gallery) patch.photo_seq = photoSeq;
  return { moves, patch };
}

/** True when any article, event or GKK history still links to `url` (or when we can't tell). */
async function inUse(admin, url) {
  const checks = await Promise.all([
    admin.from('articles').select('id').eq('photo_url', url).limit(1),
    admin.from('articles').select('id').contains('photos', [{ url }]).limit(1),
    admin.from('events').select('id').eq('photo_url', url).limit(1),
  ]);
  if (checks.some((r) => r.error || r.data?.length)) return true;
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
 * `uuid` and `now` are injectable for tests.
 */
export async function handleMediaRequest({ admin, token, body, r2, uuid = () => crypto.randomUUID(), now = new Date() }) {
  if (!token) return fail(401, 'Please sign in again');
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  const caller = auth?.user;
  if (authError || !caller) return fail(401, 'Please sign in again');
  if (isDisabled(caller, now)) return fail(403, 'This account has been disabled');

  const { data: me } = await admin.from('profiles').select('access, access_gkk').eq('id', caller.id).maybeSingle();
  // No access column yet (before 0014) or no value means full access, like staff_access().
  const access = me?.access || 'full';
  // A GKK leader may only add and remove their own GKK's photos (0045, 0046).
  const leaderGkk = access === 'gkk_leader' ? me?.access_gkk || null : null;
  if (!EDIT_WEBSITE.includes(access) && !leaderGkk) return fail(403, "Your account can't change the website");

  if (!r2?.configured) return fail(503, NOT_CONFIGURED);

  const action = body?.action;
  try {
    if (action === 'sign') {
      const folder = body.folder || 'articles';
      if (!FOLDERS.includes(folder)) return fail(400, 'Unknown photo folder');
      if (leaderGkk && folder !== 'gkks') return fail(403, "Your account can only add photos to your GKK's page");
      if (!TYPES[body.contentType]) return fail(400, 'Only JPG, PNG or WebP photos can be uploaded');
      const size = Number(body.size);
      if (!Number.isFinite(size) || size <= 0) return fail(400, 'That file looks empty');
      if (size > MAX_BYTES) return fail(400, 'That photo is over 10 MB');
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
      const cols = spec.gallery ? 'id, photo_url, photos, cover_seq, photo_seq' : 'id, photo_url, cover_seq';
      const { data: row, error } = await admin.from(body.table).select(cols).eq('id', id).maybeSingle();
      if (error) {
        if (/cover_seq|photo_seq/.test(error.message || '')) return fail(400, 'Run the 0029_photo_file_names.sql migration in Supabase to rename photos');
        throw new Error(error.message);
      }
      if (!row) return fail(404, 'That article or event no longer exists');

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
