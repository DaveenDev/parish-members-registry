import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  asyncHandler,
  HttpError,
  badRequest,
  notFound,
  conflict,
  requireString,
  optionalString,
  parseId,
  parsePaging,
  oneOf,
  MAX_PAGE_SIZE,
} from '../../src/lib/http.js';

describe('requireString', () => {
  test('returns the trimmed value', () => {
    assert.equal(requireString('  Dela Cruz  ', 'Household name'), 'Dela Cruz');
  });

  test('rejects empty and whitespace-only strings with a labelled message', () => {
    for (const value of ['', '   ', '\n\t']) {
      assert.throws(() => requireString(value, 'Street'), (err) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 400);
        assert.equal(err.message, 'Street is required');
        return true;
      });
    }
  });

  test('rejects non-strings so JSON bodies cannot smuggle objects into string methods', () => {
    for (const value of [undefined, null, 42, true, {}, [], { toLowerCase: () => 'x' }]) {
      assert.throws(() => requireString(value, 'Email'), { status: 400, message: 'Email is required' });
    }
  });
});

describe('optionalString', () => {
  test('trims strings and turns blanks into null', () => {
    assert.equal(optionalString('  0917 555 0142 '), '0917 555 0142');
    assert.equal(optionalString(''), null);
    assert.equal(optionalString('   '), null);
  });

  test('stringifies numbers and booleans', () => {
    assert.equal(optionalString(9400), '9400');
    assert.equal(optionalString(0), '0');
    assert.equal(optionalString(false), 'false');
  });

  test('turns anything else into null', () => {
    for (const value of [undefined, null, {}, [], () => {}]) {
      assert.equal(optionalString(value), null);
    }
  });
});

describe('parseId', () => {
  test('accepts positive integers, as strings or numbers', () => {
    assert.equal(parseId('7'), 7);
    assert.equal(parseId(7), 7);
    assert.equal(parseId('1'), 1);
  });

  test('rejects zero, negatives, fractions and non-numeric values', () => {
    for (const value of ['0', '-1', '1.5', 'abc', '', ' ', null, undefined, {}, '1; DROP TABLE members']) {
      assert.throws(() => parseId(value, 'member id'), { status: 400, message: 'Invalid member id' });
    }
  });

  test('defaults the label to "id"', () => {
    assert.throws(() => parseId('nope'), { message: 'Invalid id' });
  });
});

describe('parsePaging', () => {
  test('defaults to page 1 with 10 rows', () => {
    assert.deepEqual(parsePaging({}), { page: 1, pageSize: 10, offset: 0 });
    assert.deepEqual(parsePaging(), { page: 1, pageSize: 10, offset: 0 });
  });

  test('computes the offset from page and size', () => {
    assert.deepEqual(parsePaging({ page: '3', pageSize: '25' }), { page: 3, pageSize: 25, offset: 50 });
  });

  test('clamps the page size so a client cannot request the whole table', () => {
    assert.equal(parsePaging({ pageSize: '5000' }).pageSize, MAX_PAGE_SIZE);
    assert.equal(parsePaging({ pageSize: '0' }).pageSize, 10, 'zero falls back to the default');
    assert.equal(parsePaging({ pageSize: '-20' }).pageSize, 1);
  });

  test('clamps the page to at least 1', () => {
    assert.equal(parsePaging({ page: '0' }).page, 1);
    assert.equal(parsePaging({ page: '-4' }).page, 1);
    assert.equal(parsePaging({ page: 'abc' }).page, 1);
  });

  test('honours per-call defaults and maximums', () => {
    assert.deepEqual(parsePaging({}, { defaultSize: 50 }), { page: 1, pageSize: 50, offset: 0 });
    assert.equal(parsePaging({ pageSize: '40' }, { maxSize: 20 }).pageSize, 20);
  });
});

describe('oneOf', () => {
  const allowed = ['name', 'household', 'age'];

  test('passes through allowed values', () => {
    assert.equal(oneOf('household', allowed, 'name'), 'household');
  });

  test('falls back for anything else — this is what keeps sort keys out of SQL', () => {
    assert.equal(oneOf('m.id; DROP TABLE members', allowed, 'name'), 'name');
    assert.equal(oneOf(undefined, allowed, 'name'), 'name');
    assert.equal(oneOf(['age'], allowed, 'name'), 'name');
  });
});

describe('HttpError helpers', () => {
  test('carry the intended status code', () => {
    assert.equal(badRequest('nope').status, 400);
    assert.equal(notFound('nope').status, 404);
    assert.equal(conflict('nope').status, 409);
  });

  test('are real Errors with the given message', () => {
    const err = badRequest('ZIP code is required');
    assert.ok(err instanceof Error);
    assert.equal(err.name, 'HttpError');
    assert.equal(err.message, 'ZIP code is required');
  });
});

describe('asyncHandler', () => {
  /** Let the wrapper's promise chain settle — `wrapped` itself returns undefined. */
  const flush = () => new Promise(setImmediate);

  test('forwards a rejection to next() instead of leaving it unhandled', async () => {
    const boom = new Error('database is on fire');
    let passed;
    const handler = asyncHandler(async () => {
      throw boom;
    });

    handler({}, {}, (err) => {
      passed = err;
    });
    await flush();
    assert.equal(passed, boom);
  });

  test('forwards an HttpError with its status intact', async () => {
    let passed;
    const handler = asyncHandler(async () => {
      throw notFound('Member not found');
    });

    handler({}, {}, (err) => {
      passed = err;
    });
    await flush();
    assert.equal(passed.status, 404);
    assert.equal(passed.message, 'Member not found');
  });

  test('does not call next() when the handler resolves', async () => {
    let called = false;
    const res = {};
    const handler = asyncHandler(async (req, r) => {
      r.done = true;
    });

    handler({}, res, () => {
      called = true;
    });
    await flush();
    assert.equal(res.done, true);
    assert.equal(called, false);
  });

  test('passes req, res and next straight through', async () => {
    const req = { params: { id: '3' } };
    const res = { locals: {} };
    const next = () => {};
    let seen;

    asyncHandler(async (...args) => {
      seen = args;
    })(req, res, next);
    await flush();

    assert.deepEqual(seen, [req, res, next]);
  });
});
