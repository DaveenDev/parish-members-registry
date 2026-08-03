/** Admin household directory: listing, filters, creation, edits and deletion. */
import test, { describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { dbConfigured, skipReason, getPool, resetRegistry, ensureReferenceData, insertHousehold } from '../helpers/db.js';
import { startTestServer, staffToken } from '../helpers/http.js';

let server;
let pool;
let token;

describe('households API', { skip: dbConfigured ? false : skipReason }, () => {
  before(async () => {
    pool = await getPool();
    server = await startTestServer();
    token = await staffToken();
    await ensureReferenceData(pool);
  });

  after(async () => {
    await server?.close();
    await pool?.end();
  });

  beforeEach(async () => {
    await resetRegistry(pool);
  });

  const get = (path) => server.request(path, { token });
  const send = (method, path, body) => server.request(path, { method, body, token });

  describe('GET /api/households', () => {
    beforeEach(async () => {
      await insertHousehold(pool, { household_name: 'Aquino Family', gkk: 'GKK San Isidro', status: 'Verified', contact: '0917 555 0100' }, [
        { first_name: 'Ana', last_name: 'Aquino' },
        { first_name: 'Ben', last_name: 'Aquino' },
      ]);
      await insertHousehold(pool, { household_name: 'Bautista Family', gkk: 'GKK Sto. Niño', status: 'Pending', street: '9 Bonifacio Ave.' });
    });

    test('returns rows with a member count and a total', async () => {
      const res = await get('/api/households');

      assert.equal(res.status, 200);
      assert.equal(res.body.total, 2);
      assert.equal(res.body.page, 1);
      assert.equal(res.body.pageSize, 10);
      assert.equal(res.body.rows.length, 2);

      const aquino = res.body.rows.find((r) => r.household_name === 'Aquino Family');
      assert.equal(aquino.member_count, 2);
      assert.equal(res.body.rows.find((r) => r.household_name === 'Bautista Family').member_count, 0);
    });

    test('lists the most recently registered household first', async () => {
      const res = await get('/api/households');
      assert.equal(res.body.rows[0].household_name, 'Bautista Family');
    });

    test('filters by status', async () => {
      const verified = await get('/api/households?status=Verified');
      assert.equal(verified.body.total, 1);
      assert.equal(verified.body.rows[0].household_name, 'Aquino Family');

      const all = await get('/api/households?status=All');
      assert.equal(all.body.total, 2);
    });

    test('filters by GKK', async () => {
      const res = await get(`/api/households?gkk=${encodeURIComponent('GKK Sto. Niño')}`);

      assert.equal(res.body.total, 1);
      assert.equal(res.body.rows[0].household_name, 'Bautista Family');
    });

    test('searches name, address and contact, case-insensitively', async () => {
      for (const [query, expected] of [
        ['aquino', 'Aquino Family'],
        ['BONIFACIO', 'Bautista Family'],
        ['0917 555 0100', 'Aquino Family'],
      ]) {
        const res = await get(`/api/households?search=${encodeURIComponent(query)}`);
        assert.equal(res.body.total, 1, `"${query}" matched ${res.body.total} households`);
        assert.equal(res.body.rows[0].household_name, expected);
      }
    });

    test('returns an empty page rather than an error when nothing matches', async () => {
      const res = await get('/api/households?search=nobody-by-that-name');

      assert.equal(res.status, 200);
      assert.deepEqual(res.body.rows, []);
      assert.equal(res.body.total, 0);
    });

    test('paginates', async () => {
      const first = await get('/api/households?page=1&pageSize=1');
      const second = await get('/api/households?page=2&pageSize=1');

      assert.equal(first.body.total, 2);
      assert.equal(first.body.rows.length, 1);
      assert.equal(second.body.rows.length, 1);
      assert.notEqual(first.body.rows[0].id, second.body.rows[0].id);
    });

    test('clamps an oversized page size', async () => {
      const res = await get('/api/households?pageSize=100000');
      assert.equal(res.body.pageSize, 100);
    });
  });

  describe('GET /api/households/:id', () => {
    test('returns the household with its members in a stable order', async () => {
      const { id } = await insertHousehold(pool, { household_name: 'Cruz Family' }, [
        { first_name: 'Carlos', last_name: 'Cruz' },
        { first_name: 'Dina', last_name: 'Cruz' },
      ]);

      const res = await get(`/api/households/${id}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.household.household_name, 'Cruz Family');
      assert.deepEqual(res.body.members.map((m) => m.first_name), ['Carlos', 'Dina']);
    });

    test('404s for an id that does not exist', async () => {
      const res = await get('/api/households/999999');

      assert.equal(res.status, 404);
      assert.equal(res.body.error, 'Household not found');
    });

    test('400s for an id that is not a positive integer', async () => {
      for (const id of ['abc', '0', '-3', '1.5']) {
        const res = await get(`/api/households/${id}`);
        assert.equal(res.status, 400, `${id} was accepted as an id`);
        assert.equal(res.body.error, 'Invalid household id');
      }
    });
  });

  describe('POST /api/households', () => {
    const body = (patch = {}) => ({
      household: {
        name: 'Nuevo Family',
        street: '11 Luna St.',
        barangay: 'Poblacion',
        city: 'Kidapawan City',
        province: 'North Cotabato',
        zip: '9400',
        gkk: 'GKK San Isidro',
        ...patch.household,
      },
      members: patch.members ?? [{ first: 'Nina', last: 'Nuevo', rel: 'Head of Household', sex: 'Female', dob: '1988-02-09' }],
    });

    test('creates the household and its members', async () => {
      const res = await send('POST', '/api/households', body());

      assert.equal(res.status, 201);
      assert.equal(typeof res.body.id, 'number');

      const created = await get(`/api/households/${res.body.id}`);
      assert.equal(created.body.household.household_name, 'Nuevo Family');
      assert.equal(created.body.household.status, 'Pending', 'staff entries default to Pending');
      assert.match(created.body.household.ref_no, /^OLG-\d{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
      assert.equal(created.body.members.length, 1);
      assert.equal(created.body.members[0].first_name, 'Nina');
      assert.equal(created.body.members[0].dob, '1988-02-09');
    });

    test('honours an explicitly Verified status and ignores anything else', async () => {
      const verified = await send('POST', '/api/households', body({ household: { status: 'Verified' } }));
      const nonsense = await send('POST', '/api/households', body({ household: { status: 'Approved' } }));

      const a = await get(`/api/households/${verified.body.id}`);
      const b = await get(`/api/households/${nonsense.body.id}`);
      assert.equal(a.body.household.status, 'Verified');
      assert.equal(b.body.household.status, 'Pending');
    });

    test('stores sacrament flags and group memberships', async () => {
      const res = await send('POST', '/api/households', body({
        members: [{
          first: 'Nina', last: 'Nuevo', rel: 'Head of Household', sex: 'Female', dob: '1988-02-09',
          hasBaptism: true, baptismDate: '1988-04-10', baptismChurch: 'Our Lady of Guadalupe',
          hasConfirmation: true, confName: 'Nina Maria',
          ministries: ['Choir'], organizations: ['Youth Ministry'],
        }],
      }));

      const created = await get(`/api/households/${res.body.id}`);
      const member = created.body.members[0];
      assert.equal(member.has_baptism, true);
      assert.equal(member.baptism_date, '1988-04-10');
      assert.equal(member.has_confirmation, true);
      assert.equal(member.conf_name, 'Nina Maria');
      assert.equal(member.has_communion, false);
      assert.deepEqual(member.ministries, ['Choir']);
      assert.deepEqual(member.organizations, ['Youth Ministry']);
    });

    test('rejects incomplete payloads', async () => {
      const cases = [
        [{ members: [] }, 'Household details are required'],
        [body({ household: { name: '' } }), 'Household name is required'],
        [body({ household: { zip: '' } }), 'ZIP code is required'],
        [body({ members: [] }), 'At least one member is required'],
        [body({ members: [{ first: 'Nina' }] }), 'Member last name is required'],
        [body({ members: ['Nina'] }), 'Invalid member entry'],
      ];

      for (const [payload, message] of cases) {
        const res = await send('POST', '/api/households', payload);
        assert.equal(res.status, 400, `"${message}" was not enforced`);
        assert.equal(res.body.error, message);
      }

      const count = await pool.query('SELECT count(*)::int AS c FROM households');
      assert.equal(count.rows[0].c, 0, 'a rejected payload still created a household');
    });
  });

  describe('PATCH /api/households/:id', () => {
    test('updates only the fields that were sent', async () => {
      const { id } = await insertHousehold(pool, { household_name: 'Old Name', city: 'Kidapawan City', gkk: 'GKK San Isidro' });

      const res = await send('PATCH', `/api/households/${id}`, { household_name: 'New Name', status: 'Verified' });

      assert.equal(res.status, 200);
      assert.equal(res.body.household.household_name, 'New Name');
      assert.equal(res.body.household.status, 'Verified');
      assert.equal(res.body.household.city, 'Kidapawan City', 'an untouched field changed');
      assert.equal(res.body.household.gkk, 'GKK San Isidro');
    });

    test('clears a field sent as an empty string', async () => {
      const { id } = await insertHousehold(pool, { contact: '0917 555 0100' });

      const res = await send('PATCH', `/api/households/${id}`, { contact: '' });
      assert.equal(res.body.household.contact, null);
    });

    test('rejects a status outside Pending/Verified', async () => {
      const { id } = await insertHousehold(pool, {});

      const res = await send('PATCH', `/api/households/${id}`, { status: 'Deleted' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Invalid status');
    });

    test('ignores keys that are not editable', async () => {
      const { id } = await insertHousehold(pool, {});

      const res = await send('PATCH', `/api/households/${id}`, { ref_no: 'HACKED', created_at: '1999-01-01', id: 999 });

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'No fields to update');
      const { rows } = await pool.query('SELECT ref_no FROM households WHERE id = $1', [id]);
      assert.notEqual(rows[0].ref_no, 'HACKED');
    });

    test('404s for a household that does not exist', async () => {
      const res = await send('PATCH', '/api/households/999999', { status: 'Verified' });

      assert.equal(res.status, 404);
      assert.equal(res.body.error, 'Household not found');
    });
  });

  describe('DELETE /api/households/:id', () => {
    test('removes the household and cascades to its members', async () => {
      const { id } = await insertHousehold(pool, {}, [{ first_name: 'Ana' }, { first_name: 'Ben' }]);

      const res = await send('DELETE', `/api/households/${id}`);
      assert.equal(res.status, 204);

      const households = await pool.query('SELECT count(*)::int AS c FROM households WHERE id = $1', [id]);
      const members = await pool.query('SELECT count(*)::int AS c FROM members WHERE household_id = $1', [id]);
      assert.equal(households.rows[0].c, 0);
      assert.equal(members.rows[0].c, 0, 'orphaned members were left behind');
    });

    test('404s when it is already gone', async () => {
      const { id } = await insertHousehold(pool, {});
      await send('DELETE', `/api/households/${id}`);

      const again = await send('DELETE', `/api/households/${id}`);
      assert.equal(again.status, 404);
    });
  });

  describe('POST /api/households/:id/members', () => {
    test('adds a member to an existing household', async () => {
      const { id } = await insertHousehold(pool, {});

      const res = await send('POST', `/api/households/${id}/members`, {
        firstName: 'Lito',
        middleName: 'R.',
        lastName: 'Aquino',
        relationship: 'Son',
        sex: 'Male',
        dob: '2011-07-04',
        civilStatus: 'Single',
      });

      assert.equal(res.status, 201);
      assert.equal(res.body.member.first_name, 'Lito');
      assert.equal(res.body.member.household_id, id);
      assert.equal(res.body.member.dob, '2011-07-04');
      assert.deepEqual(res.body.member.ministries, []);
    });

    test('requires a first and last name', async () => {
      const { id } = await insertHousehold(pool, {});

      const missingLast = await send('POST', `/api/households/${id}/members`, { firstName: 'Lito' });
      assert.equal(missingLast.status, 400);
      assert.equal(missingLast.body.error, 'Last name is required');
    });

    test('404s for a household that does not exist', async () => {
      const res = await send('POST', '/api/households/999999/members', { firstName: 'Lito', lastName: 'Aquino' });

      assert.equal(res.status, 404);
      assert.equal(res.body.error, 'Household not found');
    });
  });
});
