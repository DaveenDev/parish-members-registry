import rateLimit from 'express-rate-limit';

const json = (req, res) => res.status(429).json({ error: 'Too many requests — please try again shortly.' });

/**
 * Credential stuffing / brute-force guard. Only failed logins count towards the
 * limit, so a busy parish office signing in legitimately is never locked out.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: json,
});

/**
 * Password reset request and completion. Unauthenticated and it sends email,
 * so an unbounded endpoint is both an email-quota drain (300/day on the free
 * provider tier) and a way to harass a staff member's inbox.
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: json,
});

/** Public registration submissions — stops automated spam of the open endpoint. */
export const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: json,
});

/** Broad backstop for the rest of the API. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: json,
});
