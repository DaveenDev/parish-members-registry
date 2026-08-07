import test, { describe, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

let freshness;

before(async () => {
  freshness = await import('../../src/middleware/session-freshness.js');
});

beforeEach(() => {
  freshness.setFreshnessLookup();
  freshness.clearFreshnessCache();
});

const SECONDS = (d) => Math.floor(d / 1000);
const NOW = SECONDS(Date.now());

describe('isSessionCurrent', () => {
  test('accepts a token issued after the last password change', async () => {
    freshness.setFreshnessLookup(async () => NOW - 3600);
    assert.equal(await freshness.isSessionCurrent(1, NOW), true);
  });

  test('rejects a token issued before the password changed', async () => {
    freshness.setFreshnessLookup(async () => NOW);
    assert.equal(await freshness.isSessionCurrent(1, NOW - 60), false);
  });

  test('accepts a token issued in the same second as the change', async () => {
    // The reset flow hands back a token minted at the moment of the change;
    // an off-by-one here would sign the user straight back out.
    freshness.setFreshnessLookup(async () => NOW);
    assert.equal(await freshness.isSessionCurrent(1, NOW), true);
  });

  test('rejects a token for an account that no longer exists', async () => {
    freshness.setFreshnessLookup(async () => null);
    assert.equal(await freshness.isSessionCurrent(1, NOW), false);
  });

  test('rejects a token with no user id', async () => {
    freshness.setFreshnessLookup(async () => NOW - 100);
    assert.equal(await freshness.isSessionCurrent(undefined, NOW), false);
  });

  test('propagates lookup failures so callers can fail closed', async () => {
    freshness.setFreshnessLookup(async () => {
      throw new Error('database unreachable');
    });
    await assert.rejects(() => freshness.isSessionCurrent(1, NOW), /database unreachable/);
  });
});

describe('caching', () => {
  test('does not hit the database on every request', async () => {
    let calls = 0;
    freshness.setFreshnessLookup(async () => {
      calls++;
      return NOW - 3600;
    });

    for (let i = 0; i < 5; i++) await freshness.isSessionCurrent(7, NOW);
    assert.equal(calls, 1);
  });

  test('caches per user rather than globally', async () => {
    const changedAt = { 1: NOW - 3600, 2: NOW };
    freshness.setFreshnessLookup(async (id) => changedAt[id]);

    assert.equal(await freshness.isSessionCurrent(1, NOW - 60), true);
    assert.equal(await freshness.isSessionCurrent(2, NOW - 60), false);
  });

  test('forgetUser makes a password change take effect immediately', async () => {
    let changedAt = NOW - 3600;
    freshness.setFreshnessLookup(async () => changedAt);

    assert.equal(await freshness.isSessionCurrent(9, NOW - 60), true);

    changedAt = NOW;
    // Without the invalidation the stale cutoff would keep the old session
    // alive for the length of the TTL.
    freshness.forgetUser(9);

    assert.equal(await freshness.isSessionCurrent(9, NOW - 60), false);
  });
});
