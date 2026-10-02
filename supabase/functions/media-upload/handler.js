// Photo uploads for the Parish Website (Blog Articles), stored on Cloudflare R2.
//
// The R2 keys must never reach the browser, so this Edge Function hands the
// admin a short-lived signed PUT link instead; the browser then uploads the
// photo straight to R2. index.ts wires it to Deno and R2; this file is plain
// JavaScript with its dependencies passed in, so it can be unit tested under
// Node.
//
// Only signed-in staff who may edit the website (access 'full' or 'website',
// see 0014_roles_activity_trash.sql) can call it, and a disabled account is
// refused even while its last access token is still valid.

// Same rule as manage-staff: a disabled login is "banned" until far in the
// future. Kept here so this function can be deployed on its own.
const isDisabled = (user, now) => !!user?.banned_until && new Date(user.banned_until) > now;

export const MAX_BYTES = 10 * 1024 * 1024;
export const FOLDERS = ['articles'];
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const EDIT_WEBSITE = ['full', 'website'];
export const NOT_CONFIGURED = "Photo storage isn't set up yet. Add the Cloudflare R2 settings to the media-upload function (see docs/media-storage.md).";

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

/**
 * `r2` is { configured, publicBase, signPut(key, contentType) → url, remove(key) → void }.
 * `uuid` and `now` are injectable for tests.
 */
export async function handleMediaRequest({ admin, token, body, r2, uuid = () => crypto.randomUUID(), now = new Date() }) {
  if (!token) return fail(401, 'Please sign in again');
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  const caller = auth?.user;
  if (authError || !caller) return fail(401, 'Please sign in again');
  if (isDisabled(caller, now)) return fail(403, 'This account has been disabled');

  const { data: me } = await admin.from('profiles').select('access').eq('id', caller.id).maybeSingle();
  // No access column yet (before 0014) or no value means full access, like staff_access().
  if (!EDIT_WEBSITE.includes(me?.access || 'full')) return fail(403, "Your account can't change the website");

  if (!r2?.configured) return fail(503, NOT_CONFIGURED);

  const action = body?.action;
  try {
    if (action === 'sign') {
      const folder = body.folder || 'articles';
      if (!FOLDERS.includes(folder)) return fail(400, 'Unknown photo folder');
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
      await r2.remove(key);
      return ok({});
    }

    return fail(400, 'Unknown action');
  } catch (e) {
    return fail(502, e?.message || 'Photo storage did not respond');
  }
}
