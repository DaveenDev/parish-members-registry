/**
 * The rate limiters, driven from a single pinned client IP.
 *
 * Only paths that fail before any database work are used, so this suite runs
 * with or without TEST_DATABASE_URL.
 */
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import '../helpers/db.js';
import { startTestServer } from '../helpers/http.js';

let server;

before(async () => {
  server = await startTestServer();
});

after(async () => {
  await server?.close();
});

describe('login limiter', () => {
  test('blocks after 10 failed attempts from the same caller', async () => {
    const clientIp = '198.51.100.7';
    const attempt = () =>
      server.request('/api/auth/login', { method: 'POST', body: {}, clientIp });

    for (let i = 1; i <= 10; i++) {
      const res = await attempt();
      assert.equal(res.status, 400, `attempt ${i} was throttled too early`);
    }

    const blocked = await attempt();
    assert.equal(blocked.status, 429);
    assert.deepEqual(blocked.body, { error: 'Too many requests — please try again shortly.' });
  });

  test('does not affect a different caller', async () => {
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      body: {},
      clientIp: '198.51.100.8',
    });

    assert.equal(res.status, 400, 'one blocked IP locked out everybody else');
  });

  test('advertises the limit with draft-7 RateLimit headers', async () => {
    const res = await server.request('/api/auth/login', {
      method: 'POST',
      body: {},
      clientIp: '198.51.100.9',
    });

    assert.match(res.headers.get('ratelimit') || '', /limit=10/);
    assert.equal(res.headers.get('x-ratelimit-limit'), null, 'legacy headers should be off');
  });
});

describe('registration limiter', () => {
  test('blocks after 20 submissions from the same caller', async () => {
    const clientIp = '203.0.113.42';
    const attempt = () => server.request('/api/registrations', { method: 'POST', body: {}, clientIp });

    for (let i = 1; i <= 20; i++) {
      const res = await attempt();
      assert.equal(res.status, 400, `submission ${i} was throttled too early`);
    }

    const blocked = await attempt();
    assert.equal(blocked.status, 429);
    assert.deepEqual(blocked.body, { error: 'Too many requests — please try again shortly.' });
  });
});

describe('health endpoint', () => {
  test('sits outside the API limiter so uptime checks are never throttled', async () => {
    // /api/health is registered before app.use('/api', apiLimiter).
    const clientIp = '203.0.113.99';
    for (let i = 0; i < 40; i++) {
      const res = await server.request('/api/health', { clientIp });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('ratelimit'), null, 'the health check is being counted');
    }
  });
});
