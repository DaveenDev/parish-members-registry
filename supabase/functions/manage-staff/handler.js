// Staff account management for the admin panel (Settings → Staff).
//
// Creating, disabling and resetting login accounts needs Supabase's
// service-role key, which must never reach the browser, so this runs as an
// Edge Function. index.ts wires it to Deno; this file is plain JavaScript
// with its dependencies passed in, so it can be unit tested under Node.
//
// Only staff admins (profiles.is_admin, added in 0007_admin_tools.sql) may
// call it, and a disabled account is refused even while its last access
// token is still valid. Guards: nobody can disable or remove admin rights
// from their own account, and the last active admin can't be disabled or
// demoted, so the parish can never lock itself out.

export const MIN_PASSWORD_LENGTH = 10; // same rule as Parish Config → Change password
const DISABLE_FOR = '876000h'; // ~100 years: Supabase's way of disabling a login
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ok = (body) => ({ status: 200, body: { ok: true, ...body } });
const fail = (status, error) => ({ status, body: { error } });

const clean = (v) => (typeof v === 'string' ? v.trim() : '');

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
  const { data: profiles, error } = await admin.from('profiles').select('id, name, role, is_admin');
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

  const { data: me } = await admin.from('profiles').select('is_admin').eq('id', caller.id).maybeSingle();
  if (!me?.is_admin) return fail(403, 'Only staff admins can manage staff accounts');

  const action = body?.action;
  try {
    if (action === 'list') {
      return ok({ staff: await loadStaff(admin) });
    }

    if (action === 'create') {
      const input = { name: clean(body.name), email: clean(body.email).toLowerCase(), password: body.password };
      const invalid = validateStaffInput(input, { requireEmail: true, requirePassword: true });
      if (invalid) return fail(400, invalid);

      const { data: created, error } = await admin.auth.admin.createUser({
        email: input.email, password: input.password, email_confirm: true,
      });
      if (error) {
        const taken = /already (been )?registered|already exists/i.test(error.message || '');
        return fail(taken ? 409 : 400, taken ? 'An account with this email already exists' : (error.message || 'Could not create the account'));
      }
      const { error: pErr } = await admin.from('profiles').insert({
        id: created.user.id, name: input.name, role: clean(body.role) || 'Parish Staff', is_admin: !!body.is_admin,
      });
      if (pErr) {
        // Don't leave a login without a profile behind.
        await admin.auth.admin.deleteUser(created.user.id);
        return fail(400, pErr.message || 'Could not save the staff profile');
      }
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
      const makeAdmin = !!body.is_admin;
      if (!makeAdmin && target.is_admin) {
        if (isSelf) return fail(400, 'You can’t remove your own admin access. Ask another admin to do it.');
        if (lastAdmin) return fail(400, 'This is the only active admin. Make someone else an admin first.');
      }
      const { error } = await admin.from('profiles').upsert({
        id, name: input.name, role: clean(body.role) || 'Parish Staff', is_admin: makeAdmin,
      });
      if (error) return fail(400, error.message || 'Could not save the changes');
      return ok({});
    }

    if (action === 'reset_password') {
      if (String(body.password || '').length < MIN_PASSWORD_LENGTH) {
        return fail(400, `The password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      }
      const { error } = await admin.auth.admin.updateUserById(id, { password: body.password });
      if (error) return fail(400, error.message || 'Could not reset the password');
      return ok({});
    }

    if (action === 'disable') {
      if (isSelf) return fail(400, 'You can’t disable your own account');
      if (lastAdmin) return fail(400, 'This is the only active admin. Make someone else an admin first.');
      const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: DISABLE_FOR });
      if (error) return fail(400, error.message || 'Could not disable the account');
      return ok({});
    }

    // enable
    const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: 'none' });
    if (error) return fail(400, error.message || 'Could not enable the account');
    return ok({});
  } catch (e) {
    return fail(500, e?.message || 'Something went wrong');
  }
}
