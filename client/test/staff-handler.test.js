import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { handleStaffRequest, validateStaffInput, isDisabled, accessInput } from '../../supabase/functions/manage-staff/handler.js';

/**
 * In-memory stand-in for a service-role Supabase client: just the calls the
 * handler makes. Tokens are "token-<user id>".
 */
function fakeAdmin({ users, profiles, legacySchema = false }) {
  const calls = [];
  // Before 0014 there are no access columns: writing them fails like PostgREST does.
  const columnError = (row) => (legacySchema && 'access' in row ? { message: "Could not find the 'access' column of 'profiles' in the schema cache" } : null);
  const findUser = (id) => users.find((u) => u.id === id);
  const profilesTable = {
    select() {
      const rows = profiles.map((p) => ({ ...p }));
      return {
        eq: (col, val) => ({
          maybeSingle: async () => ({ data: rows.find((r) => r[col] === val) || null, error: null }),
        }),
        then: (resolve) => resolve({ data: rows, error: null }),
      };
    },
    async insert(row) {
      if (columnError(row)) return { error: columnError(row) };
      calls.push(['profiles.insert', row]);
      profiles.push({ ...row });
      return { error: null };
    },
    async upsert(row) {
      if (columnError(row)) return { error: columnError(row) };
      calls.push(['profiles.upsert', row]);
      const i = profiles.findIndex((p) => p.id === row.id);
      if (i >= 0) profiles[i] = { ...profiles[i], ...row };
      else profiles.push({ ...row });
      return { error: null };
    },
  };
  return {
    calls,
    from: (table) => {
      assert.equal(table, 'profiles');
      return profilesTable;
    },
    auth: {
      async getUser(token) {
        const user = findUser(String(token).replace(/^token-/, ''));
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: 'bad token' } };
      },
      admin: {
        async listUsers() {
          return { data: { users: users.map((u) => ({ ...u })) }, error: null };
        },
        async createUser({ email, password, email_confirm }) {
          calls.push(['createUser', { email, password, email_confirm }]);
          if (users.some((u) => u.email === email)) return { data: null, error: { message: 'A user with this email address has already been registered' } };
          const user = { id: `u${users.length + 1}`, email };
          users.push(user);
          return { data: { user }, error: null };
        },
        async updateUserById(id, attrs) {
          calls.push(['updateUserById', id, attrs]);
          const u = findUser(id);
          if (attrs.ban_duration === 'none') u.banned_until = null;
          else if (attrs.ban_duration) u.banned_until = '2999-01-01T00:00:00Z';
          return { data: { user: u }, error: null };
        },
        async deleteUser(id) {
          calls.push(['deleteUser', id]);
          return { error: null };
        },
      },
    },
  };
}

let users;
let profiles;
let admin;
const call = (as, body) => handleStaffRequest({ admin, token: as && `token-${as}`, body });

beforeEach(() => {
  users = [
    { id: 'u1', email: 'admin@parish.test', last_sign_in_at: '2026-09-30T00:00:00Z' },
    { id: 'u2', email: 'staff@parish.test' },
  ];
  profiles = [
    { id: 'u1', name: 'Ma. Assumpta', role: 'Parish Secretary', is_admin: true },
    { id: 'u2', name: 'Pedro', role: 'Encoder', is_admin: false },
  ];
  admin = fakeAdmin({ users, profiles });
});

describe('manage-staff: who may call it', () => {
  test('no token or a bad token is rejected', async () => {
    assert.equal((await call(null, { action: 'list' })).status, 401);
    assert.equal((await handleStaffRequest({ admin, token: 'token-nobody', body: { action: 'list' } })).status, 401);
  });

  test('regular staff are refused', async () => {
    const res = await call('u2', { action: 'list' });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /Only staff admins/);
  });

  test('an admin gets the list with profiles joined', async () => {
    const res = await call('u1', { action: 'list' });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.staff.map((s) => [s.email, s.name, s.is_admin, s.disabled]), [
      ['admin@parish.test', 'Ma. Assumpta', true, false],
      ['staff@parish.test', 'Pedro', false, false],
    ]);
  });

  test('unknown actions are rejected', async () => {
    assert.equal((await call('u1', { action: 'drop_everything', id: 'u2' })).status, 400);
  });
});

describe('manage-staff: create', () => {
  test('creates a confirmed login and its profile', async () => {
    const res = await call('u1', { action: 'create', name: ' Juan ', email: 'Juan@Parish.test ', password: 'temp-pass-123', role: 'Encoder', is_admin: false });
    assert.equal(res.status, 200);
    assert.deepEqual(admin.calls[0], ['createUser', { email: 'juan@parish.test', password: 'temp-pass-123', email_confirm: true }]);
    assert.deepEqual(profiles.at(-1), { id: res.body.id, name: 'Juan', role: 'Encoder', is_admin: false, access: 'full', access_gkk: null });
  });

  test('validates name, email and password length', async () => {
    assert.match((await call('u1', { action: 'create', name: '', email: 'a@b.co', password: 'x'.repeat(10) })).body.error, /name/);
    assert.match((await call('u1', { action: 'create', name: 'A', email: 'nope', password: 'x'.repeat(10) })).body.error, /email/);
    assert.match((await call('u1', { action: 'create', name: 'A', email: 'a@b.co', password: 'short' })).body.error, /at least 10/);
    assert.equal(admin.calls.length, 0);
  });

  test('an email already in use is a 409', async () => {
    const res = await call('u1', { action: 'create', name: 'Dup', email: 'staff@parish.test', password: 'x'.repeat(12) });
    assert.equal(res.status, 409);
  });
});

describe('manage-staff: guards against locking the parish out', () => {
  test('cannot disable yourself', async () => {
    const res = await call('u1', { action: 'disable', id: 'u1' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /your own account/);
  });

  test('cannot remove your own admin access', async () => {
    const res = await call('u1', { action: 'update', id: 'u1', name: 'Ma. Assumpta', is_admin: false });
    assert.match(res.body.error, /your own admin access/);
  });

  test('a disabled admin is refused even with a still-valid token', async () => {
    profiles[1].is_admin = true;
    users[0].banned_until = '2999-01-01T00:00:00Z'; // u1 was disabled, but still holds a token
    const res = await call('u1', { action: 'update', id: 'u2', name: 'Pedro', is_admin: false });
    assert.equal(res.status, 403);
    assert.match(res.body.error, /disabled/);
    assert.equal(profiles[1].is_admin, true);
  });

  test('disable and enable set and clear the ban', async () => {
    assert.equal((await call('u1', { action: 'disable', id: 'u2' })).status, 200);
    assert.deepEqual(admin.calls.at(-1), ['updateUserById', 'u2', { ban_duration: '876000h' }]);
    assert.equal(isDisabled(users[1]), true);
    assert.equal((await call('u1', { action: 'enable', id: 'u2' })).status, 200);
    assert.deepEqual(admin.calls.at(-1), ['updateUserById', 'u2', { ban_duration: 'none' }]);
    assert.equal(isDisabled(users[1]), false);
  });
});

describe('manage-staff: edit and reset', () => {
  test('promotes another member of staff', async () => {
    const res = await call('u1', { action: 'update', id: 'u2', name: 'Pedro S.', role: 'Encoder', is_admin: true });
    assert.equal(res.status, 200);
    assert.deepEqual(profiles[1], { id: 'u2', name: 'Pedro S.', role: 'Encoder', is_admin: true, access: 'full', access_gkk: null });
  });

  test('resets a password, enforcing the minimum length', async () => {
    assert.equal((await call('u1', { action: 'reset_password', id: 'u2', password: 'short' })).status, 400);
    assert.equal((await call('u1', { action: 'reset_password', id: 'u2', password: 'new-temp-pass-1' })).status, 200);
    assert.deepEqual(admin.calls.at(-1), ['updateUserById', 'u2', { password: 'new-temp-pass-1' }]);
  });

  test('an id that no longer exists is a 404', async () => {
    assert.equal((await call('u1', { action: 'disable', id: 'gone' })).status, 404);
  });
});

describe('validateStaffInput', () => {
  test('only checks what is required', () => {
    assert.equal(validateStaffInput({ name: 'A' }), '');
    assert.match(validateStaffInput({ name: 'A', email: 'x' }, { requireEmail: true }), /email/);
  });
});

describe('manage-staff: access levels', () => {
  test('saves a GKK leader with their GKK', async () => {
    const res = await call('u1', { action: 'update', id: 'u2', name: 'Pedro', access: 'gkk_leader', access_gkk: 'GKK San Isidro' });
    assert.equal(res.status, 200);
    assert.equal(profiles[1].access, 'gkk_leader');
    assert.equal(profiles[1].access_gkk, 'GKK San Isidro');
    const list = await call('u1', { action: 'list' });
    assert.deepEqual(list.body.staff.map((s) => s.access), ['full', 'gkk_leader']);
  });

  test('a GKK leader needs a GKK, and admins need full access', async () => {
    assert.match((await call('u1', { action: 'update', id: 'u2', name: 'Pedro', access: 'gkk_leader' })).body.error, /GKK/);
    assert.match((await call('u1', { action: 'update', id: 'u2', name: 'Pedro', is_admin: true, access: 'read_only' })).body.error, /full access/);
    assert.match((await call('u1', { action: 'update', id: 'u2', name: 'Pedro', access: 'owner' })).body.error, /access level/);
  });

  test('before the 0014 migration, full access still saves and other levels explain why not', async () => {
    admin = fakeAdmin({ users, profiles, legacySchema: true });
    assert.equal((await call('u1', { action: 'update', id: 'u2', name: 'Pedro S.' })).status, 200);
    assert.equal(profiles[1].name, 'Pedro S.');
    const res = await call('u1', { action: 'update', id: 'u2', name: 'Pedro', access: 'read_only' });
    assert.equal(res.status, 400);
    assert.match(res.body.error, /0014/);
  });

  test('accessInput defaults to full and drops the GKK for other levels', () => {
    assert.deepEqual(accessInput({}), { access: 'full', access_gkk: null });
    assert.deepEqual(accessInput({ access: 'website', access_gkk: 'GKK X' }), { access: 'website', access_gkk: null });
  });
});
