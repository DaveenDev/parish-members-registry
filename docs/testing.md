# Automated tests

The test suite runs on Node's built-in test runner (`node --test`) and Node's
`assert/strict`. There is no test framework to install — if you can run the app,
you can run the tests.

```bash
npm test          # everything (API suites skip themselves without a test DB)
npm run test:unit # pure-function tests only, no database needed
npm run test:api  # the HTTP/database suites only
npm run test:watch
```

## Layout

```
server/test/
  helpers/
    db.js       Test-database guard, registry reset, record fixtures
    http.js     Boots the app on a random port; a tiny fetch-based client
  unit/         Pure functions — no database, no HTTP
    http.test.js            validation/paging/sorting helpers
    util.test.js            age, initials, CSV writer
    ref-no.test.js          reference-number generation and collision retry
    auth-middleware.test.js JWT signing and the Bearer-token gate
    db-cli.test.js          maintenance-script flags and confirmation guards
  api/          The real Express app over HTTP
    health-and-errors.test.js  health, 404s, auth gate, headers, error shape
    rate-limit.test.js         login/registration/API limiters
    auth.test.js               sign in, session, change password
    registrations.test.js      public submissions and what gets persisted
    registrations-validation.test.js  field-by-field rejection messages
    households.test.js         admin household directory and edits
    members.test.js            the filter matrix, sorting, paging, edits
    config.test.js             GKKs, ministries, organizations, parish profile
    reports-exports.test.js    dashboard figures, report builder, CSV exports
    fixtures/                  shared payload builders
client/test/
  constants.test.js  pick-lists, blank member, date and age formatting
  api.test.js        the browser API client against a stubbed fetch
```

## Running the API suites

The API suites drive the real Express app against a real PostgreSQL database —
most of what is worth testing in the routes *is* the SQL, and a mocked pool
would not catch a wrong join or a filter that matches the wrong rows.

They are skipped, not failed, when no test database is configured, so `npm test`
still works on a machine without PostgreSQL:

```
ok 20 - households API # SKIP TEST_DATABASE_URL is not set — see docs/testing.md
```

To run them, create a database whose name contains `test`, apply the schema, and
point `TEST_DATABASE_URL` at it:

```bash
createdb parish_registry_test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/parish_registry_test npm run db:setup

TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/parish_registry_test npm test
```

Two guards make this safe to leave configured:

- the suites read **`TEST_DATABASE_URL`**, never `DATABASE_URL`, so the database
  your dev server is pointed at is never touched;
- the helper refuses to start if the database name does not contain `test`.

The suites truncate `households` and `members` as they go and leave reference
data (staff accounts, GKKs, ministries, organizations, parish profile) intact —
anything a suite adds to those tables it removes afterwards.

## Conventions

**Everything runs serially.** `--test-concurrency=1` is set for the full run and
for `test:api`, because the API suites share one database. Unit tests do not care
either way.

**Each test file is its own process.** That is Node's default, and the suites
rely on it: `server/test/unit/auth-middleware.test.js` sets `JWT_SECRET` before
importing the middleware, which reads it once at import time.

**Requests carry a simulated client IP.** The app sets `trust proxy: 1`, so the
rate limiters key on `X-Forwarded-For`. The test client sends a fresh address per
request, which means a long suite is not throttled halfway through. Tests that
want a single caller — `rate-limit.test.js` — pass `clientIp` explicitly.

**Arrange with the fixtures, assert through the API.** `insertHousehold()` in
`helpers/db.js` writes directly to the database so that a test for, say,
`DELETE /api/households/:id` does not depend on the create endpoint working.

## Adding a test

For a new pure function, add to the matching file under `server/test/unit/`.

For a new endpoint, add to the suite for its router and follow the shape already
there:

```js
describe('my API', { skip: dbConfigured ? false : skipReason }, () => {
  before(async () => {
    pool = await getPool();
    server = await startTestServer();
    token = await staffToken();
  });

  after(async () => {
    await server?.close();
    await pool?.end();
  });

  beforeEach(async () => {
    await resetRegistry(pool);
  });

  test('does the thing', async () => {
    const res = await server.request('/api/thing', { token });
    assert.equal(res.status, 200);
  });
});
```

New endpoints should have at least: the success case, the shape of what is
persisted, one rejection per validation rule, the 404 for a missing record, and
— if it is under `/api/admin` — a check that it is unreachable without a token
(add the path to the list in `health-and-errors.test.js`).

## What the automated tests do not cover

Rendering, browser behaviour and anything the parishioner or the parish
secretary actually sees. That is covered by the manual browser playbooks in
[`docs/beta-testing/`](beta-testing/README.md), which are the other half of the
release check.
