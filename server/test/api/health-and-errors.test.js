/**
 * Cross-cutting HTTP behaviour: health, 404s, auth gating, security headers and
 * the central error handler. None of these tests reach the database, so they
 * run whether or not TEST_DATABASE_URL is configured.
 */
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import '../helpers/db.js'; // applies the test env before app.js is imported
import { startTestServer, staffToken } from '../helpers/http.js';

let server;
let token;

before(async () => {
  server = await startTestServer();
  token = await staffToken();
});

after(async () => {
  await server?.close();
});

describe('GET /api/health', () => {
  test('reports ok without authentication', async () => {
    const res = await server.request('/api/health');

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });
});

describe('unknown API routes', () => {
  test('answer 404 with a JSON body, not an HTML error page', async () => {
    const res = await server.request('/api/does-not-exist');

    assert.equal(res.status, 404);
    assert.deepEqual(res.body, { error: 'Not found' });
    assert.match(res.headers.get('content-type'), /application\/json/);
  });

  test('cover nested paths and every method', async () => {
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
      const res = await server.request('/api/nope/deeper/still', { method });
      assert.equal(res.status, 404, `${method} was not a 404`);
    }
  });

  test('are answered by the auth gate first inside a protected router', async () => {
    // /api/members/1/nope is not a route, but the router requires a token
    // before routing — the 401 must win, so an anonymous caller cannot probe
    // which admin paths exist.
    const res = await server.request('/api/members/1/nope');
    assert.equal(res.status, 401);
  });
});

describe('authentication gate', () => {
  const protectedRoutes = [
    '/api/auth/me',
    '/api/households',
    '/api/households/1',
    '/api/members',
    '/api/members/1',
    '/api/config/gkks',
    '/api/config/ministries',
    '/api/config/organizations',
    '/api/config/settings',
    '/api/dashboard/stats',
    '/api/reports/stats',
    '/api/reports/blood',
    '/api/reports/sources',
    '/api/exports/members.csv',
    '/api/exports/households.csv',
    '/api/exports/blood.csv',
  ];

  test('refuses every admin route without a token', async () => {
    for (const path of protectedRoutes) {
      const res = await server.request(path);
      assert.equal(res.status, 401, `${path} was reachable anonymously`);
      assert.deepEqual(res.body, { error: 'Not authenticated' });
    }
  });

  test('refuses writes without a token', async () => {
    const writes = [
      ['POST', '/api/households', { household: {}, members: [] }],
      ['PATCH', '/api/households/1', { status: 'Verified' }],
      ['DELETE', '/api/households/1', undefined],
      ['PATCH', '/api/members/1', { first_name: 'X' }],
      ['DELETE', '/api/members/1', undefined],
      ['POST', '/api/config/gkks', { name: 'X' }],
      ['PATCH', '/api/config/settings', { name: 'X' }],
      ['POST', '/api/reports/generate', { source: 'Members', type: 'By GKK' }],
      ['POST', '/api/exports/generated.csv', { columns: ['A'], rows: [] }],
    ];

    for (const [method, path, body] of writes) {
      const res = await server.request(path, { method, body });
      assert.equal(res.status, 401, `${method} ${path} was reachable anonymously`);
    }
  });

  test('rejects a garbage token', async () => {
    const res = await server.request('/api/members', { token: 'not-a-real-token' });

    assert.equal(res.status, 401);
    assert.deepEqual(res.body, { error: 'Invalid or expired session' });
  });

  test('lets a valid token through the gate', async () => {
    // /api/reports/sources is served from a constant, so this proves the token
    // was accepted without needing the database.
    const res = await server.request('/api/reports/sources', { token });

    assert.equal(res.status, 200);
    assert.deepEqual(res.body.sources, ['Members', 'Households']);
  });

  test('leaves the public registration endpoint open', async () => {
    const res = await server.request('/api/registrations', { method: 'POST', body: {} });

    // 400 (not 401): the endpoint is reachable and it is validation that stops us.
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Household details are required');
  });
});

describe('security headers', () => {
  test('helmet is applied', async () => {
    const res = await server.request('/api/health');

    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(res.headers.get('x-frame-options'), 'no framing protection');
    assert.equal(res.headers.get('x-powered-by'), null, 'Express version is advertised');
  });
});

describe('CORS', () => {
  test('reflects any origin when no allowlist is configured', async () => {
    // CORS_ORIGIN is empty in the test env, which is the same-origin/dev case:
    // the browser origin is echoed back rather than blocked.
    const res = await server.request('/api/health', { headers: { Origin: 'http://localhost:5173' } });

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  });

  test('answers a preflight', async () => {
    const res = await server.request('/api/households', {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:5173',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization,content-type',
      },
    });

    assert.ok(res.status === 204 || res.status === 200, `preflight answered ${res.status}`);
    assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  });
});

describe('request body handling', () => {
  test('answers 400 for malformed JSON instead of crashing', async () => {
    const res = await server.request('/api/registrations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"household": ',
    });

    assert.equal(res.status, 400);
    assert.ok(res.body.error, 'no error message');
  });

  test('rejects a body larger than the 1 MB limit', async () => {
    const huge = { household: { householdName: 'x'.repeat(1_200_000) } };
    const res = await server.request('/api/registrations', { method: 'POST', body: huge });

    assert.equal(res.status, 413);
  });

  test('treats a missing body as an empty one rather than throwing', async () => {
    const res = await server.request('/api/registrations', { method: 'POST' });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Household details are required');
  });
});

describe('error handler', () => {
  test('returns validation messages verbatim for 4xx', async () => {
    const res = await server.request('/api/registrations', {
      method: 'POST',
      body: { household: { householdName: 'Test' } },
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'Street is required');
  });

  test('never leaks internals — every error body is a plain { error } object', async () => {
    const res = await server.request('/api/registrations', { method: 'POST', body: { household: 'nope' } });

    assert.equal(res.status, 400);
    assert.deepEqual(Object.keys(res.body), ['error']);
    assert.equal(typeof res.body.error, 'string');
    assert.doesNotMatch(res.body.error, /at .*\.js:\d+/, 'a stack trace leaked into the response');
  });
});
