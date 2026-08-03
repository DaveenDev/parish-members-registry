import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import { genRefNo, insertHouseholdWithRef } from '../../src/lib/ref-no.js';

const REF_PATTERN = /^OLG-(\d{4})-([23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6})$/;

describe('genRefNo', () => {
  test('matches the OLG-<year>-<6 chars> shape', () => {
    assert.match(genRefNo(), REF_PATTERN);
  });

  test('uses the current year by default and the given year otherwise', () => {
    assert.equal(genRefNo().split('-')[1], String(new Date().getFullYear()));
    assert.equal(genRefNo(2019).split('-')[1], '2019');
  });

  test('never emits characters that are ambiguous when read aloud', () => {
    for (let i = 0; i < 500; i++) {
      const suffix = genRefNo().split('-')[2];
      assert.doesNotMatch(suffix, /[01OI]/, `ambiguous character in ${suffix}`);
    }
  });

  test('produces distinct values', () => {
    const seen = new Set();
    for (let i = 0; i < 200; i++) seen.add(genRefNo());
    // 32^6 combinations — 200 draws colliding would mean the generator is broken.
    assert.equal(seen.size, 200);
  });
});

/** A pg client stand-in that records every statement it is given. */
function fakeClient({ failures = 0, failWith } = {}) {
  const statements = [];
  let insertCalls = 0;

  const collision = Object.assign(new Error('duplicate key value violates unique constraint'), {
    code: '23505',
    constraint: 'households_ref_no_key',
  });

  return {
    statements,
    get insertCalls() {
      return insertCalls;
    },
    async query(text, values) {
      statements.push(text);
      if (!text.startsWith('INSERT')) return { rows: [] };

      insertCalls++;
      if (failWith && insertCalls === 1) throw failWith;
      if (insertCalls <= failures) throw collision;
      return { rows: [{ id: 100 + insertCalls }], values };
    },
  };
}

/** Build the `buildQuery` callback the helper expects, recording the refs it is offered. */
function buildQueryRecorder(refs) {
  return (refNo) => {
    refs.push(refNo);
    return {
      text: 'INSERT INTO households (ref_no) VALUES ($1) RETURNING id',
      values: [refNo],
    };
  };
}

describe('insertHouseholdWithRef', () => {
  test('returns the inserted id on the first attempt', async () => {
    const client = fakeClient();
    const refs = [];

    const id = await insertHouseholdWithRef(client, buildQueryRecorder(refs));

    assert.equal(id, 101);
    assert.equal(refs.length, 1);
    assert.match(refs[0], REF_PATTERN);
  });

  test('wraps each attempt in a savepoint and releases it on success', async () => {
    const client = fakeClient();
    await insertHouseholdWithRef(client, buildQueryRecorder([]));

    assert.deepEqual(client.statements, [
      'SAVEPOINT ref_attempt',
      'INSERT INTO households (ref_no) VALUES ($1) RETURNING id',
      'RELEASE SAVEPOINT ref_attempt',
    ]);
  });

  test('retries with a fresh reference number after a ref_no collision', async () => {
    const client = fakeClient({ failures: 2 });
    const refs = [];

    const id = await insertHouseholdWithRef(client, buildQueryRecorder(refs));

    assert.equal(id, 103, 'third attempt succeeded');
    assert.equal(refs.length, 3);
    assert.equal(new Set(refs).size, 3, 'each retry generated a new reference');
  });

  test('rolls back to the savepoint after a collision so the transaction stays usable', async () => {
    const client = fakeClient({ failures: 1 });
    await insertHouseholdWithRef(client, buildQueryRecorder([]));

    const rollbacks = client.statements.filter((s) => s === 'ROLLBACK TO SAVEPOINT ref_attempt');
    assert.equal(rollbacks.length, 1);
    // Never a bare ROLLBACK — that would discard the caller's transaction.
    assert.ok(!client.statements.includes('ROLLBACK'));
  });

  test('gives up after 5 attempts and throws the last collision', async () => {
    const client = fakeClient({ failures: Infinity });

    await assert.rejects(() => insertHouseholdWithRef(client, buildQueryRecorder([])), {
      code: '23505',
    });
    assert.equal(client.insertCalls, 5);
  });

  test('rethrows a non-collision error immediately, without retrying', async () => {
    const notNull = Object.assign(new Error('null value in column "street"'), { code: '23502' });
    const client = fakeClient({ failWith: notNull });

    await assert.rejects(() => insertHouseholdWithRef(client, buildQueryRecorder([])), { code: '23502' });
    assert.equal(client.insertCalls, 1);
  });

  test('rethrows a unique violation on a different constraint immediately', async () => {
    const otherUnique = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'admin_users_email_key',
    });
    const client = fakeClient({ failWith: otherUnique });

    await assert.rejects(() => insertHouseholdWithRef(client, buildQueryRecorder([])), {
      constraint: 'admin_users_email_key',
    });
    assert.equal(client.insertCalls, 1);
  });
});
