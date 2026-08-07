import test, { describe, before } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';

// middleware/auth.js reads JWT_SECRET at import time, so it has to be set
// before the dynamic import below.
const SECRET = 'unit-test-secret';
process.env.JWT_SECRET = SECRET;

let signToken;
let requireAuth;

before(async () => {
  // requireAuth checks admin_users.password_changed_at; stub that lookup so
  // these stay pure unit tests. Freshness itself is covered separately.
  const freshness = await import('../../src/middleware/session-freshness.js');
  freshness.setFreshnessLookup(async () => 0);
  ({ signToken, requireAuth } = await import('../../src/middleware/auth.js'));
});

/** Minimal Express res double capturing the status and JSON body. */
function fakeRes() {
  return {
    statusCode: null,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    },
  };
}

async function run(authorization) {
  const req = { headers: authorization === undefined ? {} : { authorization } };
  const res = fakeRes();
  let nextCalled = false;
  await requireAuth(req, res, () => {
    nextCalled = true;
  });
  return { req, res, nextCalled };
}

const user = { id: 4, email: 'secretary@parish.test', name: 'Ma. Assumpta R.', role: 'Parish Secretary' };

describe('signToken', () => {
  test('carries the identity claims the admin UI needs', () => {
    const claims = jwt.verify(signToken(user), SECRET);
    assert.equal(claims.id, 4);
    assert.equal(claims.email, 'secretary@parish.test');
    assert.equal(claims.name, 'Ma. Assumpta R.');
    assert.equal(claims.role, 'Parish Secretary');
  });

  test('never puts the password hash in the token', () => {
    const claims = jwt.verify(signToken({ ...user, password_hash: '$2a$10$secret' }), SECRET);
    assert.equal(claims.password_hash, undefined);
    assert.deepEqual(Object.keys(claims).sort(), ['email', 'exp', 'iat', 'id', 'name', 'role']);
  });

  test('expires in seven days', () => {
    const claims = jwt.verify(signToken(user), SECRET);
    assert.equal(claims.exp - claims.iat, 7 * 24 * 60 * 60);
  });
});

describe('requireAuth', () => {
  test('accepts a valid Bearer token and puts the claims on req.user', async () => {
    const { req, res, nextCalled } = await run(`Bearer ${signToken(user)}`);

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, null);
    assert.equal(req.user.id, 4);
    assert.equal(req.user.role, 'Parish Secretary');
  });

  test('rejects a missing Authorization header', async () => {
    const { res, nextCalled } = await run(undefined);

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.payload, { error: 'Not authenticated' });
  });

  test('rejects a header without the Bearer prefix', async () => {
    for (const header of ['', signToken(user), `Basic ${signToken(user)}`, 'bearer lowercase']) {
      const { res, nextCalled } = await run(header);
      assert.equal(nextCalled, false, `accepted ${JSON.stringify(header)}`);
      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.payload, { error: 'Not authenticated' });
    }
  });

  test('rejects a token signed with a different secret', async () => {
    const forged = jwt.sign({ id: 1, role: 'Parish Secretary' }, 'not-the-secret');
    const { res, nextCalled } = await run(`Bearer ${forged}`);

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.payload, { error: 'Invalid or expired session' });
  });

  test('rejects an expired token', async () => {
    const expired = jwt.sign({ id: 1 }, SECRET, { expiresIn: '-1s' });
    const { res, nextCalled } = await run(`Bearer ${expired}`);

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.payload, { error: 'Invalid or expired session' });
  });

  test('rejects a token with a tampered payload', async () => {
    const token = signToken(user);
    const [header, , signature] = token.split('.');
    const tampered = Buffer.from(JSON.stringify({ ...user, role: 'Superuser' })).toString('base64url');
    const { res, nextCalled } = await run(`Bearer ${header}.${tampered}.${signature}`);

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });

  test('rejects an unsigned "alg: none" token', async () => {
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(
      JSON.stringify({ id: 1, role: 'Parish Secretary' })
    ).toString('base64url')}.`;
    const { res, nextCalled } = await run(`Bearer ${none}`);

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });

  test('rejects junk that is not a JWT at all', async () => {
    const { res, nextCalled } = await run('Bearer not.a.token');

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 401);
  });
});
