/**
 * Staff sign-in, session lookup and password change.
 *
 * The login limiter is covered separately in rate-limit.test.js — the test
 * client gives each request its own simulated client IP, so the attempts below
 * are not counted against one another.
 */
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

import { dbConfigured, skipReason, getPool } from '../helpers/db.js';
import { startTestServer, staffToken } from '../helpers/http.js';

const EMAIL = 'api-auth-test@parishregistry.test';
const PASSWORD = 'CorrectHorse123!';

let server;
let pool;
let adminId;

describe('auth API', { skip: dbConfigured ? false : skipReason }, () => {
  before(async () => {
    pool = await getPool();
    server = await startTestServer();

    await pool.query('DELETE FROM admin_users WHERE email = $1', [EMAIL]);
    const { rows } = await pool.query(
      `INSERT INTO admin_users (email, password_hash, name, role) VALUES ($1,$2,$3,$4) RETURNING id`,
      [EMAIL, await bcrypt.hash(PASSWORD, 10), 'Test Secretary', 'Parish Secretary']
    );
    adminId = rows[0].id;
  });

  after(async () => {
    await pool?.query('DELETE FROM admin_users WHERE email = $1', [EMAIL]);
    await server?.close();
    await pool?.end();
  });

  describe('POST /api/auth/login', () => {
    test('returns a token and the staff profile', async () => {
      const res = await server.request('/api/auth/login', {
        method: 'POST',
        body: { email: EMAIL, password: PASSWORD },
      });

      assert.equal(res.status, 200);
      assert.equal(typeof res.body.token, 'string');
      assert.deepEqual(res.body.user, {
        id: adminId,
        email: EMAIL,
        name: 'Test Secretary',
        role: 'Parish Secretary',
      });
      assert.equal(res.body.user.password_hash, undefined, 'password hash returned to the browser');
    });

    test('accepts the email in any case, and ignores surrounding whitespace', async () => {
      const res = await server.request('/api/auth/login', {
        method: 'POST',
        body: { email: `  ${EMAIL.toUpperCase()}  `, password: PASSWORD },
      });

      assert.equal(res.status, 200);
    });

    test('gives the same answer for a wrong password and an unknown account', async () => {
      const wrongPassword = await server.request('/api/auth/login', {
        method: 'POST',
        body: { email: EMAIL, password: 'not-the-password' },
      });
      const unknownEmail = await server.request('/api/auth/login', {
        method: 'POST',
        body: { email: 'nobody@parishregistry.test', password: PASSWORD },
      });

      assert.equal(wrongPassword.status, 401);
      assert.equal(unknownEmail.status, 401);
      assert.deepEqual(wrongPassword.body, { error: 'Invalid email or password' });
      assert.deepEqual(unknownEmail.body, { error: 'Invalid email or password' });
    });

    test('rejects missing or non-string credentials with 400', async () => {
      const cases = [
        [{}, 'Email is required'],
        [{ email: EMAIL }, 'Password is required'],
        [{ email: { toLowerCase: 'nope' }, password: PASSWORD }, 'Email is required'],
      ];

      for (const [body, message] of cases) {
        const res = await server.request('/api/auth/login', { method: 'POST', body });
        assert.equal(res.status, 400, `${JSON.stringify(body)} was not rejected`);
        assert.equal(res.body.error, message);
      }
    });
  });

  describe('GET /api/auth/me', () => {
    test('echoes the claims from the token', async () => {
      const login = await server.request('/api/auth/login', {
        method: 'POST',
        body: { email: EMAIL, password: PASSWORD },
      });
      const res = await server.request('/api/auth/me', { token: login.body.token });

      assert.equal(res.status, 200);
      assert.equal(res.body.user.id, adminId);
      assert.equal(res.body.user.email, EMAIL);
      assert.equal(res.body.user.role, 'Parish Secretary');
    });
  });

  describe('POST /api/auth/change-password', () => {
    const NEW_PASSWORD = 'EvenBetterPassphrase42';

    /** A token for the seeded test account. */
    const token = () => staffToken({ id: adminId, email: EMAIL, name: 'Test Secretary' });

    test('rejects a new password shorter than 10 characters', async () => {
      const res = await server.request('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword: PASSWORD, newPassword: 'short1!' },
        token: await token(),
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'New password must be at least 10 characters');
    });

    test('rejects reusing the current password', async () => {
      const res = await server.request('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword: PASSWORD, newPassword: PASSWORD },
        token: await token(),
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'New password must be different from the current one');
    });

    test('rejects a wrong current password with 401', async () => {
      const res = await server.request('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword: 'wrong-password', newPassword: NEW_PASSWORD },
        token: await token(),
      });

      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'Current password is incorrect');
    });

    test('requires both fields', async () => {
      const res = await server.request('/api/auth/change-password', {
        method: 'POST',
        body: { newPassword: NEW_PASSWORD },
        token: await token(),
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Current password is required');
    });

    test('changes the password, and the new one is what works afterwards', async () => {
      const changed = await server.request('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD },
        token: await token(),
      });
      assert.equal(changed.status, 200);
      assert.deepEqual(changed.body, { ok: true });

      const withNew = await server.request('/api/auth/login', {
        method: 'POST',
        body: { email: EMAIL, password: NEW_PASSWORD },
      });
      assert.equal(withNew.status, 200, 'the new password does not work');

      const withOld = await server.request('/api/auth/login', {
        method: 'POST',
        body: { email: EMAIL, password: PASSWORD },
      });
      assert.equal(withOld.status, 401, 'the old password still works');

      // The stored hash is bcrypt, never the password itself.
      const { rows } = await pool.query('SELECT password_hash FROM admin_users WHERE id = $1', [adminId]);
      assert.match(rows[0].password_hash, /^\$2[aby]\$\d{2}\$/);
      assert.doesNotMatch(rows[0].password_hash, new RegExp(NEW_PASSWORD));
    });
  });
});
