/**
 * Field-by-field validation of the public registration endpoint.
 *
 * Every rejection here must come back as a 400 with a message the wizard can
 * show verbatim, and must leave the database untouched.
 */
import test, { describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { dbConfigured, skipReason, getPool, resetRegistry } from '../helpers/db.js';
import { startTestServer } from '../helpers/http.js';
import { registrationPayload, MINIMAL_MEMBER } from './fixtures/registration.js';

let server;
let pool;

describe('POST /api/registrations — validation', { skip: dbConfigured ? false : skipReason }, () => {
  before(async () => {
    pool = await getPool();
    server = await startTestServer();
  });

  after(async () => {
    await server?.close();
    await pool?.end();
  });

  beforeEach(async () => {
    await resetRegistry(pool);
  });

  const submit = (body) => server.request('/api/registrations', { method: 'POST', body });

  test('names the missing household field', async () => {
    const cases = [
      ['householdName', 'Family (household) name is required'],
      ['street', 'Street is required'],
      ['barangay', 'Barangay is required'],
      ['city', 'City / Municipality is required'],
      ['province', 'Province is required'],
      ['zip', 'ZIP code is required'],
    ];

    for (const [field, message] of cases) {
      const body = registrationPayload();
      delete body.household[field];
      const res = await submit(body);

      assert.equal(res.status, 400, `a household without ${field} was accepted`);
      assert.equal(res.body.error, message);
    }
  });

  test('treats a whitespace-only household field as missing', async () => {
    const res = await submit(registrationPayload({ household: { city: '   ' } }));

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'City / Municipality is required');
  });

  test('requires the household object, at least one member, and consent', async () => {
    const cases = [
      [{ members: [MINIMAL_MEMBER], consent: true }, 'Household details are required'],
      [{ household: 'Dela Cruz', members: [MINIMAL_MEMBER], consent: true }, 'Household details are required'],
      [registrationPayload({ members: [] }), 'At least one household member is required'],
      [{ ...registrationPayload(), members: 'Juan' }, 'At least one household member is required'],
      [registrationPayload({ consent: false }), 'Data privacy consent is required'],
    ];

    for (const [body, message] of cases) {
      const res = await submit(body);
      assert.equal(res.status, 400, `"${message}" was not enforced`);
      assert.equal(res.body.error, message);
    }
  });

  test('names the missing member field', async () => {
    const cases = [
      ['firstName', 'Member first name is required'],
      ['lastName', 'Member last name is required'],
      ['relationship', 'Member relationship is required'],
      ['sex', 'Member sex is required'],
      ['dob', 'Member date of birth is required'],
      ['civilStatus', 'Member civil status is required'],
    ];

    for (const [field, message] of cases) {
      const member = { ...MINIMAL_MEMBER };
      delete member[field];
      const res = await submit(registrationPayload({ members: [member] }));

      assert.equal(res.status, 400, `a member without ${field} was accepted`);
      assert.equal(res.body.error, message);
    }
  });

  test('rejects a member entry that is not an object', async () => {
    for (const member of ['Juan Dela Cruz', null, 42]) {
      const res = await submit(registrationPayload({ members: [member] }));

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Invalid member entry');
    }
  });

  test('caps a household at 30 members', async () => {
    const members = Array.from({ length: 31 }, (_, i) => ({ ...MINIMAL_MEMBER, firstName: `Member${i}` }));
    const res = await submit(registrationPayload({ members }));

    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'A household can have at most 30 members');
  });

  test('rejects non-strings smuggled into string fields', async () => {
    const cases = [
      [registrationPayload({ household: { householdName: { evil: true } } }), 'Family (household) name is required'],
      [registrationPayload({ household: { zip: ['9400'] } }), 'ZIP code is required'],
      [registrationPayload({ members: [{ ...MINIMAL_MEMBER, firstName: 12345 }] }), 'Member first name is required'],
    ];

    for (const [body, message] of cases) {
      const res = await submit(body);
      assert.equal(res.status, 400);
      assert.equal(res.body.error, message);
    }
  });

  test('leaves the database untouched after a run of rejected submissions', async () => {
    const rejected = [
      registrationPayload({ consent: false }),
      registrationPayload({ household: { zip: '' } }),
      registrationPayload({ members: [{ ...MINIMAL_MEMBER, sex: '' }] }),
    ];

    for (const body of rejected) {
      const res = await submit(body);
      assert.equal(res.status, 400);
    }

    const households = await pool.query('SELECT count(*)::int AS c FROM households');
    const members = await pool.query('SELECT count(*)::int AS c FROM members');
    assert.equal(households.rows[0].c, 0);
    assert.equal(members.rows[0].c, 0);
  });
});
