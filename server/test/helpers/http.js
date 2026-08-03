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

/** A signed token for an imaginary staff account — routes only read the claims. */
export async function staffToken(overrides = {}) {
  const { signToken } = await import('../../src/middleware/auth.js');
  return signToken({
    id: 1,
    email: 'tester@parishregistry.test',
    name: 'Test Secretary',
    role: 'Parish Secretary',
    ...overrides,
  });
}
