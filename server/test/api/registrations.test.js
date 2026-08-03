/**
 * The public registration endpoint — successful submissions and the guarantees
 * about what ends up in the database.
 *
 * Field-by-field validation lives in registrations-validation.test.js; the
 * submission limiter itself is covered in rate-limit.test.js.
 */
import test, { describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { dbConfigured, skipReason, getPool, resetRegistry } from '../helpers/db.js';
import { startTestServer } from '../helpers/http.js';
import { registrationPayload, MINIMAL_MEMBER } from './fixtures/registration.js';

let server;
let pool;

describe('POST /api/registrations', { skip: dbConfigured ? false : skipReason }, () => {
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

  test('stores the household and its members, and returns a reference number', async () => {
    const res = await submit(registrationPayload());

    assert.equal(res.status, 201);
    assert.match(res.body.refNo, /^OLG-\d{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
    assert.equal(typeof res.body.householdId, 'number');

    const { rows } = await pool.query('SELECT * FROM households WHERE id = $1', [res.body.householdId]);
    const household = rows[0];
    assert.equal(household.household_name, 'Dela Cruz Family');
    assert.equal(household.city, 'Kidapawan City');
    assert.equal(household.gkk, 'GKK San Isidro');
    assert.equal(household.ref_no, res.body.refNo);
    assert.equal(household.status, 'Pending', 'public registrations must start unverified');
    assert.equal(household.consent, true);
    assert.equal(household.notify_optin, true);
    assert.equal(household.volunteer, 'Yes');

    const members = await pool.query('SELECT * FROM members WHERE household_id = $1', [res.body.householdId]);
    assert.equal(members.rowCount, 1);
    assert.equal(members.rows[0].first_name, 'Juan');
    assert.equal(members.rows[0].dob, '1981-06-14', 'the date must not shift by a timezone');
    assert.equal(members.rows[0].has_baptism, true);
    assert.equal(members.rows[0].baptism_church, 'Our Lady of Guadalupe');
    assert.deepEqual(members.rows[0].ministries, ['Choir', 'Lector & Commentator']);
    assert.deepEqual(members.rows[0].organizations, [], 'the public form does not assign organizations');
  });

  test('accepts a household with only the required fields and defaults the rest', async () => {
    const res = await submit({
      household: {
        householdName: 'Reyes Family',
        street: '5 Mabini St.',
        barangay: 'Poblacion',
        city: 'Kidapawan City',
        province: 'North Cotabato',
        zip: '9400',
      },
      members: [MINIMAL_MEMBER],
      consent: true,
    });

    assert.equal(res.status, 201);

    const { rows } = await pool.query(
      `SELECT h.contact, h.gkk, h.notify_optin, h.volunteer, m.religion, m.blood_type, m.ministries
       FROM households h JOIN members m ON m.household_id = h.id WHERE h.id = $1`,
      [res.body.householdId]
    );
    assert.equal(rows[0].contact, null);
    assert.equal(rows[0].gkk, null);
    assert.equal(rows[0].notify_optin, false);
    assert.equal(rows[0].volunteer, null);
    assert.equal(rows[0].religion, 'Roman Catholic', 'religion should default');
    assert.equal(rows[0].blood_type, null);
    assert.deepEqual(rows[0].ministries, []);
  });

  test('stores every member and gives each submission a distinct reference', async () => {
    const first = await submit(
      registrationPayload({
        members: [MINIMAL_MEMBER, { ...MINIMAL_MEMBER, firstName: 'Ben', relationship: 'Son' }],
      })
    );
    const second = await submit(registrationPayload({ household: { householdName: 'Santos Family' } }));

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.notEqual(first.body.refNo, second.body.refNo);

    const count = await pool.query('SELECT count(*)::int AS c FROM members WHERE household_id = $1', [
      first.body.householdId,
    ]);
    assert.equal(count.rows[0].c, 2);
  });

  test('accepts a household at the 30-member cap', async () => {
    const members = Array.from({ length: 30 }, (_, i) => ({ ...MINIMAL_MEMBER, firstName: `Member${i}` }));
    const res = await submit(registrationPayload({ members }));

    assert.equal(res.status, 201);
    const count = await pool.query('SELECT count(*)::int AS c FROM members WHERE household_id = $1', [
      res.body.householdId,
    ]);
    assert.equal(count.rows[0].c, 30);
  });

  test('writes nothing at all when a later member fails validation', async () => {
    // The household insert happens before the members are inserted, so a bad
    // second member has to roll the whole thing back.
    const res = await submit(
      registrationPayload({ members: [MINIMAL_MEMBER, { ...MINIMAL_MEMBER, lastName: '   ' }] })
    );

    assert.equal(res.status, 400);
    const households = await pool.query('SELECT count(*)::int AS c FROM households');
    const members = await pool.query('SELECT count(*)::int AS c FROM members');
    assert.equal(households.rows[0].c, 0, 'a partial household was left behind');
    assert.equal(members.rows[0].c, 0);
  });
});
