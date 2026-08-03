/**
 * Admin member directory: the filter matrix, sorting, paging and edits.
 *
 * The filters are built as SQL fragments, so this suite is the main guard
 * against a filter silently matching the wrong rows.
 */
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { dbConfigured, skipReason, getPool, resetRegistry, ensureReferenceData, insertHousehold } from '../helpers/db.js';
import { startTestServer, staffToken } from '../helpers/http.js';

let server;
let pool;
let token;

/** ISO date for someone who turns `age` today. */
function dobForAge(age) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  d.setDate(d.getDate() - 1); // safely past the birthday
  return d.toISOString().slice(0, 10);
}

describe('members API', { skip: dbConfigured ? false : skipReason }, () => {
  before(async () => {
    pool = await getPool();
    server = await startTestServer();
    token = await staffToken();
    await ensureReferenceData(pool);
    await resetRegistry(pool);

    // Aquino — Verified, GKK San Isidro
    await insertHousehold(
      pool,
      { household_name: 'Aquino Family', gkk: 'GKK San Isidro', status: 'Verified' },
      [
        {
          first_name: 'Ana', last_name: 'Aquino', civil_status: 'Married', sex: 'Female',
          dob: dobForAge(45), blood_type: 'O+', contact: '0917 555 0100',
          has_baptism: true, has_communion: true, has_confirmation: true, has_matrimony: true,
          ministries: ['Choir'], organizations: ['Youth Ministry'],
        },
        {
          first_name: 'Ben', last_name: 'Aquino', civil_status: 'Single', sex: 'Male',
          dob: dobForAge(12), blood_type: 'A+',
          has_baptism: true,
          ministries: ['Lector & Commentator'],
        },
      ]
    );

    // Bautista — Pending, GKK Sto. Niño
    await insertHousehold(
      pool,
      { household_name: 'Bautista Family', gkk: 'GKK Sto. Niño', status: 'Pending' },
      [
        {
          first_name: 'Carlos', last_name: 'Bautista', civil_status: 'Widowed', sex: 'Male',
          dob: dobForAge(68), blood_type: null,
          has_baptism: true, has_communion: true,
          organizations: ['Youth Ministry'],
        },
        {
          first_name: 'Dina', last_name: 'Bautista', civil_status: 'Single', sex: 'Female',
          dob: dobForAge(25), blood_type: 'B-',
        },
      ]
    );
  });

  after(async () => {
    await resetRegistry(pool);
    await server?.close();
    await pool?.end();
  });

  const get = (path) => server.request(path, { token });
  const names = (res) => res.body.rows.map((m) => m.first_name);

  describe('GET /api/members', () => {
    test('joins the household so the table can show name, status and address', async () => {
      const res = await get('/api/members?search=Ana');

      assert.equal(res.status, 200);
      const ana = res.body.rows[0];
      assert.equal(ana.household_name, 'Aquino Family');
      assert.equal(ana.household_status, 'Verified');
      assert.equal(ana.household_gkk, 'GKK San Isidro');
      assert.equal(ana.city, 'Test City');
    });

    test('returns every member with a total', async () => {
      const res = await get('/api/members?pageSize=100');

      assert.equal(res.body.total, 4);
      assert.equal(res.body.rows.length, 4);
    });

    test('filters by household status', async () => {
      assert.deepEqual((await get('/api/members?status=Verified')).body.rows.map((m) => m.last_name).sort(), ['Aquino', 'Aquino']);
      assert.equal((await get('/api/members?status=Pending')).body.total, 2);
    });

    test('filters by civil status', async () => {
      assert.equal((await get('/api/members?civil=Single')).body.total, 2);
      assert.equal((await get('/api/members?civil=Widowed')).body.total, 1);
    });

    test('filters by GKK', async () => {
      const res = await get(`/api/members?gkk=${encodeURIComponent('GKK Sto. Niño')}`);
      assert.deepEqual(names(res).sort(), ['Carlos', 'Dina']);
    });

    test('filters by a single sacrament', async () => {
      assert.equal((await get('/api/members?sacrament=Baptism')).body.total, 3);
      assert.equal((await get('/api/members?sacrament=Confirmation')).body.total, 1);
      assert.equal((await get('/api/members?sacrament=Matrimony')).body.total, 1);
    });

    test('supports the per-sacrament Yes/No filters used by the Sacraments page', async () => {
      assert.equal((await get('/api/members?baptism=Yes')).body.total, 3);
      assert.equal((await get('/api/members?baptism=No')).body.total, 1);
      assert.equal((await get('/api/members?communion=Yes&confirmation=No')).body.total, 1);
    });

    test('rejects an unknown per-sacrament filter value', async () => {
      const res = await get('/api/members?baptism=Maybe');

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'Invalid baptism filter');
    });

    test('matches ministries and organizations with the same filter', async () => {
      assert.deepEqual(names(await get('/api/members?ministry=Choir')), ['Ana']);
      // Youth Ministry is an organization here, not a ministry.
      assert.deepEqual(names(await get(`/api/members?ministry=${encodeURIComponent('Youth Ministry')}`)).sort(), ['Ana', 'Carlos']);
    });

    test('filters by blood type, including the Unknown bucket', async () => {
      assert.deepEqual(names(await get('/api/members?blood=O%2B')), ['Ana']);
      assert.deepEqual(names(await get('/api/members?blood=Unknown')), ['Carlos']);
    });

    test('filters by age range', async () => {
      assert.deepEqual(names(await get('/api/members?age=0-17')), ['Ben']);
      assert.deepEqual(names(await get('/api/members?age=18-30')), ['Dina']);
      assert.deepEqual(names(await get('/api/members?age=31-59')), ['Ana']);
      assert.deepEqual(names(await get('/api/members?age=60-200')), ['Carlos']);
    });

    test('ignores an unknown age bucket rather than returning nothing', async () => {
      assert.equal((await get('/api/members?age=99-100')).body.total, 4);
    });

    test('searches names, household name and contact number', async () => {
      assert.deepEqual(names(await get('/api/members?search=bautista')).sort(), ['Carlos', 'Dina']);
      assert.deepEqual(names(await get('/api/members?search=ANA%20AQUINO')), ['Ana']);
      assert.deepEqual(names(await get('/api/members?search=555%200100')), ['Ana']);
      assert.equal((await get('/api/members?search=%20%20')).body.total, 4, 'a blank search should not filter');
    });

    test('combines filters', async () => {
      const res = await get('/api/members?status=Verified&civil=Single&sacrament=Baptism');
      assert.deepEqual(names(res), ['Ben']);
    });

    test('passes the search term as a bound parameter, so SQL cannot be injected', async () => {
      const res = await get(`/api/members?search=${encodeURIComponent("' OR 1=1 --")}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.total, 0);
    });
  });

  describe('sorting', () => {
    test('sorts by name in both directions', async () => {
      assert.deepEqual(names(await get('/api/members?sortKey=name&sortDir=asc&pageSize=100')), ['Ana', 'Ben', 'Carlos', 'Dina']);
      assert.deepEqual(names(await get('/api/members?sortKey=name&sortDir=desc&pageSize=100')), ['Dina', 'Carlos', 'Ben', 'Ana']);
    });

    test('sorts age ascending as youngest first', async () => {
      assert.deepEqual(names(await get('/api/members?sortKey=age&sortDir=asc&pageSize=100')), ['Ben', 'Dina', 'Ana', 'Carlos']);
      assert.deepEqual(names(await get('/api/members?sortKey=age&sortDir=desc&pageSize=100')), ['Carlos', 'Ana', 'Dina', 'Ben']);
    });

    test('sorts by household and by status', async () => {
      const byHousehold = await get('/api/members?sortKey=household&sortDir=desc&pageSize=100');
      assert.deepEqual(byHousehold.body.rows.map((m) => m.household_name), [
        'Bautista Family', 'Bautista Family', 'Aquino Family', 'Aquino Family',
      ]);

      const byStatus = await get('/api/members?sortKey=status&sortDir=asc&pageSize=100');
      assert.equal(byStatus.body.rows[0].household_status, 'Pending');
    });

    test('falls back to the default sort for an unknown key or direction', async () => {
      const injected = await get('/api/members?sortKey=(SELECT%201)&sortDir=sideways&pageSize=100');

      assert.equal(injected.status, 200);
      assert.deepEqual(names(injected), ['Ana', 'Ben', 'Carlos', 'Dina']);
    });
  });

  describe('paging', () => {
    test('slices the result set deterministically', async () => {
      const page1 = await get('/api/members?sortKey=name&pageSize=2&page=1');
      const page2 = await get('/api/members?sortKey=name&pageSize=2&page=2');

      assert.equal(page1.body.total, 4);
      assert.deepEqual(names(page1), ['Ana', 'Ben']);
      assert.deepEqual(names(page2), ['Carlos', 'Dina']);
    });

    test('returns an empty page past the end', async () => {
      const res = await get('/api/members?page=99');

      assert.equal(res.status, 200);
      assert.deepEqual(res.body.rows, []);
      assert.equal(res.body.total, 4);
    });

    test('clamps the page size to 100', async () => {
      assert.equal((await get('/api/members?pageSize=100000')).body.pageSize, 100);
    });
  });

  describe('GET /api/members/:id', () => {
    test('returns the member with the full household address', async () => {
      const list = await get('/api/members?search=Dina');
      const id = list.body.rows[0].id;

      const res = await get(`/api/members/${id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.member.first_name, 'Dina');
      assert.equal(res.body.member.province, 'Test Province');
      assert.equal(res.body.member.zip, '9400');
    });

    test('404s for an unknown id and 400s for a malformed one', async () => {
      assert.equal((await get('/api/members/999999')).status, 404);

      const bad = await get('/api/members/not-a-number');
      assert.equal(bad.status, 400);
      assert.equal(bad.body.error, 'Invalid member id');
    });
  });

  describe('PATCH /api/members/:id', () => {
    let memberId;

    before(async () => {
      const created = await insertHousehold(pool, { household_name: 'Patch Family' }, [
        { first_name: 'Pia', last_name: 'Patch' },
      ]);
      memberId = created.memberIds[0];
    });

    test('updates the whitelisted fields', async () => {
      const res = await server.request(`/api/members/${memberId}`, {
        method: 'PATCH',
        token,
        body: {
          first_name: 'Pilar',
          occupation: 'Catechist',
          has_confirmation: true,
          conf_date: '2005-11-19',
          ministries: ['Choir', 'Catechist'],
          organizations: ['Legion of Mary'],
        },
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.member.first_name, 'Pilar');
      assert.equal(res.body.member.occupation, 'Catechist');
      assert.equal(res.body.member.has_confirmation, true);
      assert.equal(res.body.member.conf_date, '2005-11-19');
      assert.deepEqual(res.body.member.ministries, ['Choir', 'Catechist']);
      assert.deepEqual(res.body.member.organizations, ['Legion of Mary']);
      assert.equal(res.body.member.last_name, 'Patch', 'an untouched field changed');
    });

    test('turns an empty string into NULL so dates can be cleared', async () => {
      const res = await server.request(`/api/members/${memberId}`, {
        method: 'PATCH',
        token,
        body: { conf_date: '', occupation: '' },
      });

      assert.equal(res.body.member.conf_date, null);
      assert.equal(res.body.member.occupation, null);
    });

    test('refuses to move a member between households or rewrite its id', async () => {
      const res = await server.request(`/api/members/${memberId}`, {
        method: 'PATCH',
        token,
        body: { id: 1, household_id: 1, created_at: '1999-01-01' },
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.error, 'No fields to update');
    });

    test('404s for a member that does not exist', async () => {
      const res = await server.request('/api/members/999999', { method: 'PATCH', token, body: { first_name: 'X' } });

      assert.equal(res.status, 404);
      assert.equal(res.body.error, 'Member not found');
    });
  });

  describe('DELETE /api/members/:id', () => {
    test('removes the member but keeps the household', async () => {
      const { id, memberIds } = await insertHousehold(pool, { household_name: 'Delete Family' }, [
        { first_name: 'Del' },
        { first_name: 'Eta' },
      ]);

      const res = await server.request(`/api/members/${memberIds[0]}`, { method: 'DELETE', token });
      assert.equal(res.status, 204);

      const remaining = await pool.query('SELECT count(*)::int AS c FROM members WHERE household_id = $1', [id]);
      const household = await pool.query('SELECT count(*)::int AS c FROM households WHERE id = $1', [id]);
      assert.equal(remaining.rows[0].c, 1);
      assert.equal(household.rows[0].c, 1, 'deleting a member must not delete the household');
    });

    test('404s when it is already gone', async () => {
      const res = await server.request('/api/members/999999', { method: 'DELETE', token });
      assert.equal(res.status, 404);
    });
  });
});
