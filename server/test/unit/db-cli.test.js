import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { parseFlags, describeTarget, countParishData, requireConfirmation } from '../../src/db/cli.js';

const PG_VARS = ['DATABASE_URL', 'PGHOST', 'PGPORT', 'PGDATABASE', 'NODE_ENV', 'npm_lifecycle_event'];
let saved;

beforeEach(() => {
  saved = Object.fromEntries(PG_VARS.map((k) => [k, process.env[k]]));
  for (const k of PG_VARS) delete process.env[k];
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('parseFlags', () => {
  test('collects --flags and ignores everything else', () => {
    const flags = parseFlags(['--yes', 'db:reset', '--all', 'extra']);
    assert.deepEqual([...flags].sort(), ['--all', '--yes']);
  });

  test('lower-cases so --YES still confirms', () => {
    assert.ok(parseFlags(['--YES']).has('--yes'));
  });

  test('is empty when no flags are given', () => {
    assert.equal(parseFlags([]).size, 0);
  });
});

describe('describeTarget', () => {
  test('summarises DATABASE_URL without leaking the password', () => {
    process.env.DATABASE_URL = 'postgres://parish:sup3r-s3cret@db.example.org:6543/parish_registry';
    const target = describeTarget();

    assert.equal(target, 'db.example.org:6543/parish_registry');
    assert.doesNotMatch(target, /sup3r-s3cret/);
    assert.doesNotMatch(target, /parish:/);
  });

  test('defaults the port when the URL omits it', () => {
    process.env.DATABASE_URL = 'postgres://localhost/parishdb';
    assert.equal(describeTarget(), 'localhost:5432/parishdb');
  });

  test('falls back to a safe phrase for an unparseable URL', () => {
    process.env.DATABASE_URL = 'this is not a url';
    assert.equal(describeTarget(), 'the database in DATABASE_URL');
  });

  test('uses the PG* variables when DATABASE_URL is unset', () => {
    process.env.PGHOST = 'pg.internal';
    process.env.PGPORT = '5433';
    process.env.PGDATABASE = 'parish_prod';
    assert.equal(describeTarget(), 'pg.internal:5433/parish_prod');
  });

  test('falls back to the local development defaults', () => {
    assert.equal(describeTarget(), 'localhost:5432/parish_registry');
  });
});

describe('countParishData', () => {
  test('returns numbers, not the strings pg gives back for count()', async () => {
    const db = { query: async () => ({ rows: [{ households: '6', members: '16' }] }) };
    assert.deepEqual(await countParishData(db), { households: 6, members: 16 });
  });
});

describe('requireConfirmation', () => {
  /** Run the guard with console and process.exit captured. */
  function attempt(flags, options) {
    const logs = [];
    const errors = [];
    const originalLog = console.log;
    const originalError = console.error;
    const originalExit = process.exit;
    let exitCode = null;

    console.log = (...args) => logs.push(args.join(' '));
    console.error = (...args) => errors.push(args.join(' '));
    process.exit = (code) => {
      exitCode = code;
      throw new Error('__exit__');
    };

    try {
      requireConfirmation(new Set(flags), {
        action: 'delete all households and members',
        target: 'localhost:5432/parish_registry',
        counts: { households: 6, members: 16 },
        command: 'db:reset',
        ...options,
      });
    } catch (err) {
      if (err.message !== '__exit__') throw err;
    } finally {
      console.log = originalLog;
      console.error = originalError;
      process.exit = originalExit;
    }

    return { exitCode, logs: logs.join('\n'), errors: errors.join('\n') };
  }

  test('exits without touching anything when --yes is missing', () => {
    const { exitCode, logs } = attempt([]);

    assert.equal(exitCode, 1);
    assert.match(logs, /Nothing has been changed/);
    assert.match(logs, /6 household\(s\), 16 member\(s\)/);
    assert.match(logs, /npm run db:reset/);
  });

  test('passes through when --yes is given', () => {
    const { exitCode } = attempt(['--yes']);
    assert.equal(exitCode, null, 'the guard did not exit');
  });

  test('refuses outright in production, even with --yes', () => {
    process.env.NODE_ENV = 'production';
    const { exitCode, errors } = attempt(['--yes']);

    assert.equal(exitCode, 1);
    assert.match(errors, /NODE_ENV=production/);
    assert.match(errors, /--i-know-this-is-production/);
  });

  test('allows production only with both flags', () => {
    process.env.NODE_ENV = 'production';
    const { exitCode } = attempt(['--yes', '--i-know-this-is-production']);
    assert.equal(exitCode, null);
  });

  test('still stops in production when only the production flag is given', () => {
    process.env.NODE_ENV = 'production';
    const { exitCode, logs } = attempt(['--i-know-this-is-production']);

    assert.equal(exitCode, 1);
    assert.match(logs, /Nothing has been changed/);
  });

  test('suggests the extra flags the caller passes', () => {
    const { logs } = attempt([], { extraFlags: '--replace', command: 'db:demo' });
    assert.match(logs, /npm run db:demo -- --replace --yes/);
  });
});
