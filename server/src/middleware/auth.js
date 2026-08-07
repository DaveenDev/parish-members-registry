import jwt from 'jsonwebtoken';
import { isSessionCurrent } from './session-freshness.js';

const DEV_SECRET = 'dev-secret-change-me';

/**
 * A default signing key in production means anyone who has read this repo can
 * mint a valid staff session. Refuse to start rather than serve that.
 */
function resolveSecret() {
  const secret = process.env.JWT_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret === DEV_SECRET || secret.length < 32) {
      throw new Error(
        'JWT_SECRET must be set to a random string of at least 32 characters in production. ' +
          'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"'
      );
    }
  }
  return secret || DEV_SECRET;
}

const SECRET = resolveSecret();

export function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, SECRET, {
    expiresIn: '7d',
  });
}

/** Verify the signature only. Split out so it can be tested without a database. */
export function verifyToken(authorizationHeader) {
  const header = authorizationHeader || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return { error: 'Not authenticated' };
  try {
    return { claims: jwt.verify(token, SECRET) };
  } catch {
    return { error: 'Invalid or expired session' };
  }
}

export async function requireAuth(req, res, next) {
  const { claims, error } = verifyToken(req.headers.authorization);
  if (error) return res.status(401).json({ error });

  // A valid signature is not enough: the password may have changed since this
  // token was issued, which has to end the session. See session-freshness.js.
  let current;
  try {
    current = await isSessionCurrent(claims.id, claims.iat);
  } catch (err) {
    console.error('Could not verify session freshness:', err.message);
    return res.status(503).json({ error: 'Cannot verify your session right now — please try again' });
  }

  if (!current) {
    return res.status(401).json({ error: 'Your session ended because the password was changed' });
  }

  req.user = claims;
  next();
}
