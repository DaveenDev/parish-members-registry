// Staff account management for the admin panel (Settings → Staff).
//
// Creating, disabling and resetting login accounts needs Supabase's
// service-role key, which must never reach the browser, so this runs as an
// Edge Function. index.ts wires it to Deno; this file is plain JavaScript
// with its dependencies passed in, so it can be unit tested under Node.
//
// Only staff admins (profiles.is_admin, added in 0010_admin_tools.sql) may
// call it, and a disabled account is refused even while its last access
// token is still valid. Guards: nobody can disable or remove admin rights
// from their own account, and the last active admin can't be disabled or
// demoted, so the parish can never lock itself out.

export const MIN_PASSWORD_LENGTH = 10; // same rule as Parish Config → Change password
const DISABLE_FOR = '876000h'; // ~100 years: Supabase's way of disabling a login
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// A password an admin chose (new account or reset) is temporary: the admin
// panel sends the person to "Set a new password" on their next sign-in, and
// changing it clears this. user_metadata, since the person must be able to
// clear it themselves; it only steers the sign-in screen, never access.
const MUST_CHANGE = { must_change_password: true };

const ok = (body) => ({ status: 200, body: { ok: true, ...body } });
const fail = (status, error) => ({ status, body: { error } });

const clean = (v) => (typeof v === 'string' ? v.trim() : '');

// Access levels (profiles.access, added in 0014_roles_activity_trash.sql; clergy in 0087).
export const ACCESS_LEVELS = ['full', 'read_only', 'gkk_leader', 'website', 'clergy'];
const MIGRATION_HINT = 'Run the 0014_roles_activity_trash.sql migration in Supabase to use access levels';

/**
 * { access, access_gkk_id } from a request, or { error }. A GKK leader's GKK
 * is its gkks id (0063), so renaming the GKK keeps it. Staff admins always
 * have full access.
 */
export function accessInput(body) {
  const access = clean(body?.access) || 'full';
  if (!ACCESS_LEVELS.includes(access)) return { error: 'Choose an access level' };
  if (body?.is_admin && access !== 'full') return { error: 'Staff admins need full access' };
  const gkkId = access === 'gkk_leader' ? Number(body?.access_gkk_id) : null;
  if (access === 'gkk_leader' && !(Number.isInteger(gkkId) && gkkId > 0)) return { error: 'Choose the GKK this leader looks after' };
  return { access, access_gkk_id: gkkId };
}

const missingAccessColumn = (error) => /access/.test(error?.message || '') && /column|schema cache/i.test(error?.message || '');

/**
 * Insert or upsert a profile row. Before 0014 there are no access columns:
 * full access is then saved without them, and anything else is refused.
 */
async function saveProfile(admin, method, row) {
  let { error } = await admin.from('profiles')[method](row);
  if (error && missingAccessColumn(error)) {
    if (row.access !== 'full') return { error: { message: MIGRATION_HINT } };
    const { access: _a, access_gkk_id: _g, ...rest } = row;
    ({ error } = await admin.from('profiles')[method](rest));
  }
  return { error };
}

export function isDisabled(user, now = new Date()) {
  return !!user?.banned_until && new Date(user.banned_until) > now;
}

/** Validation for a new or edited account; returns an error message or ''. */
export function validateStaffInput({ name, email, password }, { requireEmail = false, requirePassword = false } = {}) {
  if (!clean(name)) return 'Enter the staff member’s name';
  if (requireEmail && !EMAIL_RE.test(clean(email))) return 'Enter a valid email address';
  if (requirePassword && String(password || '').length < MIN_PASSWORD_LENGTH) {
    return `The password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return '';
}

/** Every login account with its profile, sorted by name. */
async function loadStaff(admin) {
  const users = [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...(data?.users || []));
    if (!data?.users || data.users.length < 1000) break;
  }
  // A leader's GKK by id, with its current name (0063).
  let { data: profiles, error } = await admin.from('profiles').select('id, name, role, is_admin, access, access_gkk_id, gkk:gkks(name)');
  if (error && missingAccessColumn(error)) ({ data: profiles, error } = await admin.from('profiles').select('id, name, role, is_admin'));
  if (error) throw error;
  const byId = new Map((profiles || []).map((p) => [p.id, p]));
  return users
    .map((u) => {
      const p = byId.get(u.id);
      return {
        id: u.id,
        email: u.email || '',
        name: p?.name || '',
        role: p?.role || '',
        is_admin: !!p?.is_admin,
        // A login without a profile or an access level has none (0065).
        access: p?.access || 'none',
        access_gkk_id: p?.access_gkk_id || null,
        access_gkk: p?.gkk?.name || null,
        has_profile: !!p,
        disabled: isDisabled(u),
        last_sign_in_at: u.last_sign_in_at || null,
        created_at: u.created_at || null,
      };
    })
    .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
}

const activeAdmins = (staff) => staff.filter((s) => s.is_admin && !s.disabled);

/**
 * What an edit changes on an account, as the activity log keeps changes:
 * { field: [old, new] }, only the fields that differ. `next` holds name,
 * role, is_admin, access and access_gkk (the GKK's name).
 */
export function staffChanges(target, next) {
  const out = {};
  for (const [field, before] of [['name', target.name], ['role', target.role], ['is_admin', !!target.is_admin], ['access', target.access], ['access_gkk', target.access_gkk]]) {
    const after = next[field] ?? null;
    if ((before ?? null) !== after) out[field] = [before ?? null, after];
  }
  return out;
}

/**
 * One activity log entry (0076) for a change to a staff account, under the
 * admin who made it. Best effort: the change stands even if logging fails
 * (e.g. before 0014 there's no log).
 */
async function logStaff(admin, actor, action, target, changes = null) {
  try {
    await admin.from('activity_log').insert({
      actor: actor.id, actor_name: actor.name, action, table_name: 'profiles',
      record_id: target.id, label: target.name || target.email || null, changes,
    });
  } catch { /* the log is a record, not a gate */ }
}

/** A GKK's name from its id, for the log; null if it can't be read. */
async function gkkName(admin, id) {
  if (!id) return null;
  try {
    const { data } = await admin.from('gkks').select('name').eq('id', id).maybeSingle();
    return data?.name || null;
  } catch {
    return null;
  }
}

/**
 * Handle one request. `admin` is a service-role Supabase client, `token` the
 * caller's access token, `body` the parsed JSON body ({ action, … }).
 * Resolves to { status, body } for index.ts to send back.
 */
export async function handleStaffRequest({ admin, token, body }) {
  if (!token) return fail(401, 'Please sign in again');
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  const caller = auth?.user;
  if (authError || !caller) return fail(401, 'Please sign in again');
  // A disabled account's access token keeps working until it expires (up to
  // an hour), so check the account itself, not just the token.
  if (isDisabled(caller)) return fail(403, 'This account has been disabled');

  const { data: me } = await admin.from('profiles').select('is_admin, name').eq('id', caller.id).maybeSingle();
  if (!me?.is_admin) return fail(403, 'Only staff admins can manage staff accounts');
  // Who the activity log names for each change.
  const actor = { id: caller.id, name: (me.name || '').trim() || caller.email || null };

  const action = body?.action;
  try {
    if (action === 'list') {
      return ok({ staff: await loadStaff(admin) });
    }

    if (action === 'create') {
      const input = { name: clean(body.name), email: clean(body.email).toLowerCase(), password: body.password };
      const invalid = validateStaffInput(input, { requireEmail: true, requirePassword: true });
      if (invalid) return fail(400, invalid);
      const access = accessInput(body);
      if (access.error) return fail(400, access.error);

      const { data: created, error } = await admin.auth.admin.createUser({
        email: input.email, password: input.password, email_confirm: true, user_metadata: MUST_CHANGE,
      });
      if (error) {
        const taken = /already (been )?registered|already exists/i.test(error.message || '');
        return fail(taken ? 409 : 400, taken ? 'An account with this email already exists' : (error.message || 'Could not create the account'));
      }
      // Upsert: since 0020 a trigger on auth.users has already made a bare profile row.
      const { error: pErr } = await saveProfile(admin, 'upsert', {
        id: created.user.id, name: input.name, role: clean(body.role) || 'Parish Staff', is_admin: !!body.is_admin,
        access: access.access, access_gkk_id: access.access_gkk_id,
      });
      if (pErr) {
        // Don't leave a login without a profile behind.
        await admin.auth.admin.deleteUser(created.user.id);
        return fail(400, pErr.message || 'Could not save the staff profile');
      }
      await logStaff(admin, actor, 'insert', { id: created.user.id, name: input.name, email: input.email }, {
        email: input.email, role: clean(body.role) || 'Parish Staff', is_admin: !!body.is_admin,
        access: access.access, access_gkk: await gkkName(admin, access.access_gkk_id),
      });
      return ok({ id: created.user.id });
    }

    const id = clean(body?.id);
    if (!['update', 'reset_password', 'disable', 'enable'].includes(action)) return fail(400, 'Unknown action');
    if (!id) return fail(400, 'Choose a staff account');

    const staff = await loadStaff(admin);
    const target = staff.find((s) => s.id === id);
    if (!target) return fail(404, 'That staff account no longer exists');
    const isSelf = id === caller.id;
    const lastAdmin = target.is_admin && !target.disabled && activeAdmins(staff).length <= 1;

    if (action === 'update') {
      const input = { name: clean(body.name) };
      const invalid = validateStaffInput(input);
      if (invalid) return fail(400, invalid);
      const access = accessInput(body);
      if (access.error) return fail(400, access.error);
      const makeAdmin = !!body.is_admin;
      if (!makeAdmin && target.is_admin) {
        if (isSelf) return fail(400, 'You can’t remove your own admin access. Ask another admin to do it.');
        if (lastAdmin) return fail(400, 'This is the only active admin. Make someone else an admin first.');
      }
      const { error } = await saveProfile(admin, 'upsert', {
        id, name: input.name, role: clean(body.role) || 'Parish Staff', is_admin: makeAdmin,
        access: access.access, access_gkk_id: access.access_gkk_id,
      });
      if (error) return fail(400, error.message || 'Could not save the changes');
      const changes = staffChanges(target, {
        name: input.name, role: clean(body.role) || 'Parish Staff', is_admin: makeAdmin,
        access: access.access, access_gkk: access.access === 'gkk_leader' ? await gkkName(admin, access.access_gkk_id) : null,
      });
      if (Object.keys(changes).length) await logStaff(admin, actor, 'update', target, changes);
      return ok({});
    }

    if (action === 'reset_password') {
      if (String(body.password || '').length < MIN_PASSWORD_LENGTH) {
        return fail(400, `The password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      }
      const { error } = await admin.auth.admin.updateUserById(id, { password: body.password, user_metadata: MUST_CHANGE });
      if (error) return fail(400, error.message || 'Could not reset the password');
      // That it was reset, never the password itself.
      await logStaff(admin, actor, 'update', target, { password_reset: true });
      return ok({});
    }

    if (action === 'disable') {
      if (isSelf) return fail(400, 'You can’t disable your own account');
      if (lastAdmin) return fail(400, 'This is the only active admin. Make someone else an admin first.');
      const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: DISABLE_FOR });
      if (error) return fail(400, error.message || 'Could not disable the account');
      await logStaff(admin, actor, 'update', target, { disabled: [false, true] });
      return ok({});
    }

    // enable
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: 'none' });
    if (error) return fail(400, error.message || 'Could not enable the account');
    await logStaff(admin, actor, 'update', target, { disabled: [true, false] });
    return ok({});
  } catch (e) {
    return fail(500, e?.message || 'Something went wrong');
  }
}
