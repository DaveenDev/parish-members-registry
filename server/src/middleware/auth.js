import jwt from 'jsonwebtoken';

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

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}
