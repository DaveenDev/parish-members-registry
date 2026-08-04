/**
 * Parish configuration: GKKs, ministries, organizations and the parish profile.
 *
 * Renaming has to cascade to the records that reference the old name, and
 * deleting has to be refused while anything still points at it — those two
 * rules are what this suite mostly exists to protect.
 */
import test, { describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { dbConfigured, skipReason, getPool, resetRegistry, insertHousehold } from '../helpers/db.js';
import { startTestServer, staffToken } from '../helpers/http.js';

let server;
let pool;
let token;
let savedSettings;

/** Names created by this suite, cleaned up afterwards. */
const TEMP = {
  gkks: ['ZZ Test GKK', 'ZZ Renamed GKK', 'ZZ Unused GKK'],
  ministries: ['ZZ Test Ministry', 'ZZ Renamed Ministry', 'ZZ Unused Ministry'],
  organizations: ['ZZ Test Org', 'ZZ Renamed Org'],
};

describe('config API', { skip: dbConfigured ? false : skipReason }, () => {
  before(async () => {
    pool = await getPool();
    server = await startTestServer();
    token = await staffToken();
    const { rows } = await pool.query('SELECT * FROM parish_settings WHERE id = 1');
    savedSettings = rows[0];
  });

  after(async () => {
    if (!pool) return;
    await resetRegistry(pool);
    await pool.query('DELETE FROM gkks WHERE name = ANY($1)', [TEMP.gkks]);
    await pool.query('DELETE FROM ministries WHERE name = ANY($1)', [TEMP.ministries]);
    await pool.query('DELETE FROM organizations WHERE name = ANY($1)', [TEMP.organizations]);
    if (savedSettings) {
      await pool.query('UPDATE parish_settings SET name=$1, address=$2, contact=$3, email=$4, logo=$5 WHERE id = 1', [
        savedSettings.name, savedSettings.address, savedSettings.contact, savedSettings.email, savedSettings.logo,
      ]);
    }
    await server?.close();
    await pool.end();
  });

  beforeEach(async () => {
    await resetRegistry(pool);
    await pool.query('DELETE FROM gkks WHERE name = ANY($1)', [TEMP.gkks]);
    await pool.query('DELETE FROM ministries WHERE name = ANY($1)', [TEMP.ministries]);
    await pool.query('DELETE FROM organizations WHERE name = ANY($1)', [TEMP.organizations]);
  });

  const get = (path) => server.request(path, { token });
  const send = (method, path, body) => server.request(path, { method, body, token });
  const find = (res, name) => res.body.rows.find((r) => r.name === name);

  describe('GKKs', () => {
    test('lists every GKK with the number of households in it', async () => {
      await send('POST', '/api/config/gkks', { name: 'ZZ Test GKK' });
      await insertHousehold(pool, { gkk: 'ZZ Test GKK' });
      await insertHousehold(pool, { gkk: 'ZZ Test GKK' });

      const res = await get('/api/config/gkks');

      assert.equal(res.status, 200);
      assert.equal(find(res, 'ZZ Test GKK').count, 2);
    });

    test('reports zero for a GKK nobody is assigned to', async () => {
      await send('POST', '/api/config/gkks', { name: 'ZZ Unused GKK' });

      const res = await get('/api/config/gkks');
      assert.equal(find(res, 'ZZ Unused GKK').count, 0);
    });

    test('adding the same name twice is harmless', async () => {
      const first = await send('POST', '/api/config/gkks', { name: 'ZZ Test GKK' });
      const second = await send('POST', '/api/config/gkks', { name: 'ZZ Test GKK' });

      assert.equal(first.status, 201);
      assert.equal(second.status, 201);

      const { rows } = await pool.query('SELECT count(*)::int AS c FROM gkks WHERE name = $1', ['ZZ Test GKK']);
      assert.equal(rows[0].c, 1);
    });

    test('requires a name', async () => {
      for (const body of [{}, { name: '   ' }, { name: 42 }]) {
        const res = await send('POST', '/api/config/gkks', body);
        assert.equal(res.status, 400);
        assert.equal(res.body.error, 'Name is required');
      }
    });

    test('renaming carries the households over to the new name', async () => {
      await send('POST', '/api/config/gkks', { name: 'ZZ Test GKK' });
      const { id } = await insertHousehold(pool, { gkk: 'ZZ Test GKK' });

      const res = await send('PATCH', '/api/config/gkks/ZZ%20Test%20GKK', { name: 'ZZ Renamed GKK' });
      assert.equal(res.status, 200);

      const { rows } = await pool.query('SELECT gkk FROM households WHERE id = $1', [id]);
      assert.equal(rows[0].gkk, 'ZZ Renamed GKK', 'the household kept the old GKK name');

      const list = await get('/api/config/gkks');
      assert.equal(find(list, 'ZZ Test GKK'), undefined);
      assert.equal(find(list, 'ZZ Renamed GKK').count, 1);
    });

    test('renaming something that does not exist is a 404', async () => {
      const res = await send('PATCH', '/api/config/gkks/ZZ%20Nope', { name: 'ZZ Renamed GKK' });

      assert.equal(res.status, 404);
      assert.equal(res.body.error, 'GKK not found');
    });

    test('deleting is refused while a household still uses it', async () => {
      await send('POST', '/api/config/gkks', { name: 'ZZ Test GKK' });
      await insertHousehold(pool, { gkk: 'ZZ Test GKK' });

      const res = await send('DELETE', '/api/config/gkks/ZZ%20Test%20GKK');

      assert.equal(res.status, 409);
      assert.equal(res.body.error, 'This GKK is assigned to a household and cannot be deleted');
      const { rows } = await pool.query('SELECT count(*)::int AS c FROM gkks WHERE name = $1', ['ZZ Test GKK']);
      assert.equal(rows[0].c, 1, 'the GKK was deleted anyway');
    });

    test('deleting an unused GKK succeeds', async () => {
      await send('POST', '/api/config/gkks', { name: 'ZZ Unused GKK' });

      const res = await send('DELETE', '/api/config/gkks/ZZ%20Unused%20GKK');
      assert.equal(res.status, 204);

      const list = await get('/api/config/gkks');
      assert.equal(find(list, 'ZZ Unused GKK'), undefined);
    });

    test('handles names that need URL encoding', async () => {
      const name = 'ZZ Test GKK';
      await send('POST', '/api/config/gkks', { name });

      const res = await send('DELETE', `/api/config/gkks/${encodeURIComponent(name)}`);
      assert.equal(res.status, 204);
    });
  });

  for (const [label, path, column, temp] of [
    ['ministries', 'ministries', 'ministries', TEMP.ministries],
    ['organizations', 'organizations', 'organizations', TEMP.organizations],
  ]) {
    describe(label, () => {
      const [NAME, RENAMED] = temp;

      test('lists each group with the number of members in it', async () => {
        await send('POST', `/api/config/${path}`, { name: NAME });
        await insertHousehold(pool, { gkk: 'GKK San Isidro' }, [
          { first_name: 'Ana', [column]: [NAME] },
          { first_name: 'Ben', [column]: [NAME] },
          { first_name: 'Cita' },
        ]);

        const res = await get(`/api/config/${path}`);

        assert.equal(res.status, 200);
        assert.equal(find(res, NAME).count, 2);
      });

      test('scopes the counts to a GKK when asked', async () => {
        await send('POST', `/api/config/${path}`, { name: NAME });
        await insertHousehold(pool, { gkk: 'GKK San Isidro' }, [{ first_name: 'Ana', [column]: [NAME] }]);
        await insertHousehold(pool, { gkk: 'GKK Sto. Niño' }, [{ first_name: 'Ben', [column]: [NAME] }]);

        const all = await get(`/api/config/${path}`);
        const scoped = await get(`/api/config/${path}?gkk=${encodeURIComponent('GKK San Isidro')}`);
        const allKeyword = await get(`/api/config/${path}?gkk=All`);

        assert.equal(find(all, NAME).count, 2);
        assert.equal(find(scoped, NAME).count, 1);
        assert.equal(find(allKeyword, NAME).count, 2);
      });

      test('renaming rewrites the name on every member record', async () => {
        await send('POST', `/api/config/${path}`, { name: NAME });
        const { memberIds } = await insertHousehold(pool, {}, [{ first_name: 'Ana', [column]: [NAME, 'Choir'] }]);

        const res = await send('PATCH', `/api/config/${path}/${encodeURIComponent(NAME)}`, { name: RENAMED });
        assert.equal(res.status, 200);

        const { rows } = await pool.query(`SELECT ${column} FROM members WHERE id = $1`, [memberIds[0]]);
        assert.deepEqual(rows[0][column], [RENAMED, 'Choir'], 'the other memberships must be left alone');
      });

      test('renaming something that does not exist is a 404', async () => {
        const res = await send('PATCH', `/api/config/${path}/ZZ%20Nope`, { name: RENAMED });

        assert.equal(res.status, 404);
        assert.equal(res.body.error, 'Item not found');
      });

      test('deleting is refused while members are assigned', async () => {
        await send('POST', `/api/config/${path}`, { name: NAME });
        await insertHousehold(pool, {}, [{ first_name: 'Ana', [column]: [NAME] }]);

        const res = await send('DELETE', `/api/config/${path}/${encodeURIComponent(NAME)}`);

        assert.equal(res.status, 409);
        assert.equal(res.body.error, 'Members are assigned to this item and it cannot be deleted');
      });

      test('deleting an unused group succeeds', async () => {
        await send('POST', `/api/config/${path}`, { name: NAME });

        const res = await send('DELETE', `/api/config/${path}/${encodeURIComponent(NAME)}`);
        assert.equal(res.status, 204);
        assert.equal(find(await get(`/api/config/${path}`), NAME), undefined);
      });
    });
  }

  describe('parish settings', () => {
    test('returns the parish profile', async () => {
      const res = await get('/api/config/settings');

      assert.equal(res.status, 200);
      assert.equal(typeof res.body.settings.name, 'string');
      assert.equal(res.body.settings.id, 1);
    });

    test('updates only the fields that were sent', async () => {
      await send('PATCH', '/api/config/settings', { name: 'Test Parish', address: '1 Test Rd.', contact: '0917 000 0000' });

      const res = await send('PATCH', '/api/config/settings', { name: 'Renamed Parish' });

      assert.equal(res.status, 200);
      assert.equal(res.body.settings.name, 'Renamed Parish');
      assert.equal(res.body.settings.address, '1 Test Rd.', 'an untouched field changed');
      assert.equal(res.body.settings.contact, '0917 000 0000');
    });

    test('clears a text field sent as an empty string, without nulling it', async () => {
      const res = await send('PATCH', '/api/config/settings', { contact: '' });

      assert.equal(res.body.settings.contact, '', 'NOT NULL text columns must get an empty string');
    });

    test('clears the logo to NULL when sent empty', async () => {
      await send('PATCH', '/api/config/settings', { logo: 'data:image/png;base64,AAAA' });
      const cleared = await send('PATCH', '/api/config/settings', { logo: '' });

      assert.equal(cleared.body.settings.logo, null);
    });

    test('ignores unknown keys and returns the current profile for an empty patch', async () => {
      const before = await get('/api/config/settings');
      const res = await send('PATCH', '/api/config/settings', { id: 2, nonsense: 'x' });

      assert.equal(res.status, 200);
      assert.deepEqual(res.body.settings, before.body.settings);
    });
  });
});
