import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { asyncHandler, requireString } from '../lib/http.js';
import { loginLimiter } from '../middleware/rate-limit.js';

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

export default router;
