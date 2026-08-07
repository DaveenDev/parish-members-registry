/**
 * A very small HTTP test client.
 *
 * The app is started on an ephemeral port and driven with the built-in `fetch`,
 * so the tests exercise the real Express stack — helmet, CORS, JSON parsing,
 * the rate limiters and the central error handler included — without pulling
 * in a test-HTTP dependency.
 */
import { once } from 'node:events';

/** Boot the API on a random free port. Returns helpers plus a `close()`. */
export async function startTestServer() {
  const { app } = await import('../../src/app.js');
  const server = app.listen(0);
  await once(server, 'listening');
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  return {
    base,
    port,
    request: (path, options) => request(base, path, options),
    close: async () => {
      server.close();
      await once(server, 'close');
    },
  };
}

let ipCounter = 0;

/**
 * A fresh simulated client IP for each request.
 *
 * The app sets `trust proxy: 1`, so the rate limiters key on the address in
 * X-Forwarded-For rather than on the loopback socket. Giving every request its
 * own address means one suite's requests are rate-limited as separate callers —
 * exactly as separate parishioners would be — instead of a long test file
 * tripping a limiter partway through. Tests that *want* one caller (see
 * rate-limit.test.js) pass `clientIp` explicitly.
 */
function nextClientIp() {
  ipCounter += 1;
  return `10.${(ipCounter >> 16) & 0xff}.${(ipCounter >> 8) & 0xff}.${ipCounter & 0xff}`;
}

/**
 * Perform a request and normalise the response.
 *
 * Returns `{ status, headers, body }` where `body` is parsed JSON when the
 * response is JSON, the raw text otherwise, and `null` for 204s.
 */
export async function request(base, path, { method = 'GET', body, token, headers = {}, clientIp } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'X-Forwarded-For': clientIp || nextClientIp(),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });

  const contentType = res.headers.get('content-type') || '';
  let parsed = null;
  if (res.status !== 204) {
    const text = await res.text();
    parsed = contentType.includes('application/json') && text ? JSON.parse(text) : text;
  }

  return { status: res.status, headers: res.headers, body: parsed };
}

/**
 * A signed token for a staff account.
 *
 * requireAuth checks the token against admin_users.password_changed_at, so the
 * account has to exist — a token for an imaginary id is now rejected, which is
 * the point of that check. Callers that pass an explicit `id` are arranging
 * their own account and are taken at their word.
 */
export async function staffToken(overrides = {}) {
  const { signToken } = await import('../../src/middleware/auth.js');

  let id = overrides.id;
  if (id === undefined) {
    const bcrypt = (await import('bcryptjs')).default;
    const { pool } = await import('../../src/db/pool.js');
    const { rows } = await pool.query(
      `INSERT INTO admin_users (email, password_hash, name, role)
       VALUES ($1, $2, 'Test Secretary', 'Parish Secretary')
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      ['tester@parishregistry.test', await bcrypt.hash('unused-in-tests', 4)]
    );
    id = rows[0].id;
  }

  return signToken({
    id,
    email: 'tester@parishregistry.test',
    name: 'Test Secretary',
    role: 'Parish Secretary',
    ...overrides,
  });
}
