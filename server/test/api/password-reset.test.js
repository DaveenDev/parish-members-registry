/**
 * Forgotten-password recovery, end to end against the database.
 *
 * The provider call is stubbed at `globalThis.fetch`, which is what
 * lib/email.js uses — so everything up to and including the JSON body sent to
 * Brevo is the real code path, and the reset link is read out of the captured
 * message exactly as a staff member would read it out of their inbox.
 */
import test, { describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';

import { dbConfigured, skipReason, getPool } from '../helpers/db.js';
import { startTestServer } from '../helpers/http.js';

const EMAIL = 'reset-test@parishregistry.test';
const PASSWORD = 'OriginalPassword1!';
const NEW_PASSWORD = 'BrandNewPassword1!';
const APP_URL = 'https://parish.test';

let server;
let pool;
let adminId;
let sent;
let realFetch;

/** Capture what would have gone to the email provider. */
function stubProvider({ ok = true, status = 201 } = {}) {
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('api.brevo.com') || String(url).includes('api.resend.com')) {
      sent.push({ url: String(url), headers: options.headers, body: JSON.parse(options.body) });
      return new Response(JSON.stringify(ok ? { messageId: 'stub' } : { message: 'rejected' }), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }
    return realFetch(url, options);
  };
}

/** Pull the reset token out of the captured email, the way a recipient would. */
function tokenFromEmail(message) {
  const match = message.body.textContent.match(/reset-password\?token=([^\s]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function forgot(email = EMAIL) {
  return server.request('/api/auth/forgot-password', { method: 'POST', body: { email } });
}

describe('password reset API', { skip: dbConfigured ? false : skipReason }, () => {
  before(async () => {
    process.env.PUBLIC_APP_URL = APP_URL;
    pool = await getPool();
    server = await startTestServer();
    realFetch = globalThis.fetch;

    // Configure a working sender so the routes take the happy path.
    const { encrypt } = await import('../../src/lib/crypto.js');
    await pool.query('INSERT INTO email_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
    await pool.query(
      `UPDATE email_settings
          SET provider='brevo', api_key_enc=$1, sender_email='parish@gmail.test',
              sender_name='Test Parish', enabled=true
        WHERE id = 1`,
      [encrypt('xkeysib-test-key')]
    );
  });

  after(async () => {
    globalThis.fetch = realFetch;
    delete process.env.PUBLIC_APP_URL;
    await pool?.query('DELETE FROM admin_users WHERE email = $1', [EMAIL]);
    await pool?.query('UPDATE email_settings SET enabled=false, api_key_enc=NULL WHERE id = 1');
    await server?.close();
    await pool?.end();
  });

  beforeEach(async () => {
    sent = [];
    stubProvider();
    await pool.query('DELETE FROM admin_users WHERE email = $1', [EMAIL]);
    const { rows } = await pool.query(
      `INSERT INTO admin_users (email, password_hash, name, role)
       VALUES ($1,$2,'Reset Tester','Parish Secretary') RETURNING id`,
      [EMAIL, await bcrypt.hash(PASSWORD, 10)]
    );
    adminId = rows[0].id;
  });

  describe('POST /api/auth/forgot-password', () => {
    test('emails a reset link to a known account', async () => {
      const res = await forgot();

      assert.equal(res.status, 200);
      assert.equal(sent.length, 1, 'no email was sent');
      assert.equal(sent[0].body.to[0].email, EMAIL);
      assert.equal(sent[0].body.sender.email, 'parish@gmail.test');
      assert.ok(tokenFromEmail(sent[0]), 'the email carries no reset token');
      assert.ok(sent[0].body.textContent.includes(APP_URL), 'the link does not point at the client');
    });

    test('sends the provider credential in the header, never in the body', async () => {
      await forgot();
      assert.equal(sent[0].headers['api-key'], 'xkeysib-test-key');
      assert.ok(!JSON.stringify(sent[0].body).includes('xkeysib'));
    });

    test('answers identically for an unknown address, and sends nothing', async () => {
      const known = await forgot();
      sent = [];
      const unknown = await forgot('nobody@parishregistry.test');

      // Any difference here turns the endpoint into a way to enumerate which
      // parish staff emails exist.
      assert.equal(unknown.status, known.status);
      assert.deepEqual(unknown.body, known.body);
      assert.equal(sent.length, 0);
    });

    test('stores only a hash of the token, never the token itself', async () => {
      await forgot();
      const token = tokenFromEmail(sent[0]);

      const { rows } = await pool.query('SELECT token_hash FROM password_reset_tokens WHERE user_id = $1', [adminId]);
      assert.equal(rows.length, 1);
      assert.notEqual(rows[0].token_hash, token);
      assert.match(rows[0].token_hash, /^[0-9a-f]{64}$/);
    });

    test('still answers 200 when the provider rejects the message', async () => {
      stubProvider({ ok: false, status: 401 });
      const res = await forgot();

      // Surfacing the failure would also confirm the account exists.
      assert.equal(res.status, 200);
    });

    test('invalidates an earlier link when a new one is requested', async () => {
      await forgot();
      const first = tokenFromEmail(sent[0]);
      await forgot();
      const second = tokenFromEmail(sent[1]);

      const stale = await server.request('/api/auth/reset-password', {
        method: 'POST',
        body: { token: first, newPassword: NEW_PASSWORD },
      });
      assert.equal(stale.status, 400, 'a superseded link still worked');

      const fresh = await server.request('/api/auth/reset-password', {
        method: 'POST',
        body: { token: second, newPassword: NEW_PASSWORD },
      });
      assert.equal(fresh.status, 200);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    async function currentToken() {
      await forgot();
      return tokenFromEmail(sent[sent.length - 1]);
    }

    test('sets the new password and the old one stops working', async () => {
      const res = await server.request('/api/auth/reset-password', {
        method: 'POST',
        body: { token: await currentToken(), newPassword: NEW_PASSWORD },
      });
      assert.equal(res.status, 200);

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
    });

    test('refuses to reuse a token', async () => {
      const token = await currentToken();
      const first = await server.request('/api/auth/reset-password', {
        method: 'POST',
        body: { token, newPassword: NEW_PASSWORD },
      });
      assert.equal(first.status, 200);

      const second = await server.request('/api/auth/reset-password', {
        method: 'POST',
        body: { token, newPassword: 'YetAnotherPassword1!' },
      });
      assert.equal(second.status, 400);
    });

    test('refuses an expired token', async () => {
      const token = await currentToken();
      await pool.query("UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute' WHERE user_id = $1", [
        adminId,
      ]);

      const res = await server.request('/api/auth/reset-password', {
        method: 'POST',
        body: { token, newPassword: NEW_PASSWORD },
      });
      assert.equal(res.status, 400);
    });

    test('refuses a forged or unknown token', async () => {
      for (const token of ['not-a-real-token', '', 'a'.repeat(43)]) {
        const res = await server.request('/api/auth/reset-password', {
          method: 'POST',
          body: { token, newPassword: NEW_PASSWORD },
        });
        assert.ok(res.status >= 400, `token ${JSON.stringify(token)} was accepted`);
      }
    });

    test('enforces the minimum password length', async () => {
      const res = await server.request('/api/auth/reset-password', {
        method: 'POST',
        body: { token: await currentToken(), newPassword: 'short' },
      });
      assert.equal(res.status, 400);
      assert.match(res.body.error, /at least 10/);
    });

    test('gives the same answer for an expired token as for a forged one', async () => {
      const token = await currentToken();
      await pool.query("UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'");
      const expired = await server.request('/api/auth/reset-password', {
        method: 'POST',
        body: { token, newPassword: NEW_PASSWORD },
      });
      const forged = await server.request('/api/auth/reset-password', {
        method: 'POST',
        body: { token: 'definitely-not-issued', newPassword: NEW_PASSWORD },
      });

      assert.deepEqual(expired.body, forged.body);
    });
  });

  describe('session invalidation', () => {
    test('a reset ends sessions issued before it', async () => {
      const login = await server.request('/api/auth/login', {
        method: 'POST',
        body: { email: EMAIL, password: PASSWORD },
      });
      const oldToken = login.body.token;

      const before = await server.request('/api/auth/me', { token: oldToken });
      assert.equal(before.status, 200, 'the session did not work to begin with');

      // password_changed_at has one-second resolution, and a token minted in
      // the same second is deliberately kept valid. Cross the boundary so the
      // reset is unambiguously later than the token.
      await new Promise((r) => setTimeout(r, 1100));

      const reset = await server.request('/api/auth/reset-password', {
        method: 'POST',
        body: { token: await currentTokenFor(), newPassword: NEW_PASSWORD },
      });
      assert.equal(reset.status, 200);

      const after = await server.request('/api/auth/me', { token: oldToken });
      assert.equal(after.status, 401, 'a session survived the password reset');
    });

    async function currentTokenFor() {
      await forgot();
      return tokenFromEmail(sent[sent.length - 1]);
    }
  });
});
