import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { asyncHandler, requireString, badRequest } from '../lib/http.js';
import { loginLimiter, passwordResetLimiter } from '../middleware/rate-limit.js';
import { randomToken, hashToken } from '../lib/crypto.js';
import { sendEmail } from '../lib/email.js';
import { buildResetEmail, buildResetUrl, resolveAppUrl, RESET_TOKEN_TTL_MINUTES } from '../lib/reset-email.js';
import { forgetUser } from '../middleware/session-freshness.js';

const router = Router();

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const email = requireString(body.email, 'Email').toLowerCase();
    const password = requireString(body.password, 'Password');

    const { rows } = await pool.query('SELECT * FROM admin_users WHERE email = $1', [email]);
    const user = rows[0];

    // Always run a bcrypt compare so a missing account and a wrong password take
    // the same time — otherwise response timing reveals which emails exist.
    const hash = user ? user.password_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
    const ok = await bcrypt.compare(password, hash);

    if (!user || !ok) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  })
);

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

const MIN_PASSWORD_LENGTH = 10;

router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const currentPassword = requireString(req.body?.currentPassword, 'Current password');
    const newPassword = requireString(req.body?.newPassword, 'New password');

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw badRequest(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }
    if (newPassword === currentPassword) {
      throw badRequest('New password must be different from the current one');
    }

    const { rows } = await pool.query('SELECT * FROM admin_users WHERE id = $1', [req.user.id]);
    const user = rows[0];
    if (!user) throw badRequest('Account not found');

    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE admin_users SET password_hash = $1, password_changed_at = now() WHERE id = $2',
      [hash, user.id]
    );
    forgetUser(user.id);

    // Every session issued under the old password is now dead, including the
    // caller's — hand back a fresh token so they are not signed out mid-task.
    res.json({ ok: true, token: signToken(user) });
  })
);

/**
 * Request a reset link.
 *
 * Always answers 200 with the same body. Reporting "no such account" here
 * would turn this into an oracle for which parish staff emails exist, and the
 * endpoint is unauthenticated.
 */
router.post(
  '/forgot-password',
  passwordResetLimiter,
  asyncHandler(async (req, res) => {
    const email = requireString(req.body?.email, 'Email').toLowerCase();
    const acknowledgement = { ok: true, message: 'If that email belongs to a staff account, a reset link is on its way.' };

    const { rows } = await pool.query('SELECT id, email, name FROM admin_users WHERE email = $1', [email]);
    const user = rows[0];
    if (!user) return res.json(acknowledgement);

    const appUrl = resolveAppUrl(req.headers.origin);
    if (!appUrl) {
      console.error('Cannot build a reset link: set PUBLIC_APP_URL to the address of the admin site.');
      return res.json(acknowledgement);
    }

    const token = randomToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000);

    // Outstanding links for this account become useless the moment a new one is
    // requested, so a forwarded older email cannot be used later.
    await pool.query('UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL', [
      user.id,
    ]);
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, hashToken(token), expiresAt]
    );

    const parish = await pool.query('SELECT name FROM parish_settings WHERE id = 1');
    const message = buildResetEmail({
      name: user.name,
      parishName: parish.rows[0]?.name,
      resetUrl: buildResetUrl(appUrl, token),
    });

    try {
      await sendEmail({ to: user.email, ...message });
    } catch (err) {
      // Never surface the provider's answer: whether sending succeeded also
      // reveals whether the account exists. Logs are where this belongs.
      console.error(`Failed to send a reset email to account ${user.id}:`, err.message);
    }

    res.json(acknowledgement);
  })
);

/** Complete a reset. The token proves ownership, so no current password is asked for. */
router.post(
  '/reset-password',
  passwordResetLimiter,
  asyncHandler(async (req, res) => {
    const token = requireString(req.body?.token, 'Reset token');
    const newPassword = requireString(req.body?.newPassword, 'New password');

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      throw badRequest(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    const invalid = () => res.status(400).json({ error: 'This reset link is invalid or has expired' });

    const { rows } = await pool.query(
      `SELECT t.id, t.user_id, t.used_at, t.expires_at, u.email, u.name, u.role
         FROM password_reset_tokens t
         JOIN admin_users u ON u.id = t.user_id
        WHERE t.token_hash = $1`,
      [hashToken(token)]
    );
    const record = rows[0];
    if (!record || record.used_at || new Date(record.expires_at) <= new Date()) return invalid();

    const hash = await bcrypt.hash(newPassword, 10);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Claim the token inside the transaction. Two submissions of the same
      // link race here, and only the one that flips used_at proceeds.
      const claimed = await client.query(
        'UPDATE password_reset_tokens SET used_at = now() WHERE id = $1 AND used_at IS NULL RETURNING id',
        [record.id]
      );
      if (!claimed.rows[0]) {
        await client.query('ROLLBACK');
        return invalid();
      }

      await client.query(
        'UPDATE admin_users SET password_hash = $1, password_changed_at = now() WHERE id = $2',
        [hash, record.user_id]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    forgetUser(record.user_id);
    res.json({ ok: true });
  })
);

export default router;
