import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, requireString, optionalString, conflict, notFound } from '../lib/http.js';

const router = Router();
router.use(requireAuth);

const UNIQUE_VIOLATION = '23505';

/** Map a duplicate-name rename to a 409 the UI can show; pass everything else through. */
function renameError(err, itemLabel) {
  return err.code === UNIQUE_VIOLATION ? conflict(`${itemLabel} already exists`) : err;
}

router.get(
  '/gkks',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT g.name, (SELECT count(*)::int FROM households h WHERE h.gkk = g.name) AS count
       FROM gkks g ORDER BY g.name`
    );
    res.json({ rows });
  })
);

router.post(
  '/gkks',
  asyncHandler(async (req, res) => {
    const name = requireString(req.body?.name, 'Name');
    await pool.query('INSERT INTO gkks (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
    res.status(201).json({ ok: true });
  })
);

router.patch(
  '/gkks/:name',
  asyncHandler(async (req, res) => {
    const newName = requireString(req.body?.name, 'Name');
    const oldName = decodeURIComponent(req.params.name);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query('UPDATE gkks SET name = $1 WHERE name = $2 RETURNING name', [newName, oldName]);
      if (!updated.rows[0]) throw notFound('GKK not found');
      await client.query('UPDATE households SET gkk = $1 WHERE gkk = $2', [newName, oldName]);
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (err) {
      await client.query('ROLLBACK');
      throw renameError(err, 'A GKK with this name');
    } finally {
      client.release();
    }
  })
);

router.delete(
  '/gkks/:name',
  asyncHandler(async (req, res) => {
    const name = decodeURIComponent(req.params.name);
    const inUse = await pool.query('SELECT count(*)::int AS c FROM households WHERE gkk = $1', [name]);
    if (inUse.rows[0].c > 0) throw conflict('This GKK is assigned to a household and cannot be deleted');
    await pool.query('DELETE FROM gkks WHERE name = $1', [name]);
    res.status(204).end();
  })
);

/**
 * Ministries and organizations share identical CRUD. `table` and `column` are
 * hardcoded at the two call sites below — never user input — so interpolating
 * them into SQL is safe.
 */
function groupRoutes(table, column, path) {
  router.get(
    `/${path}`,
    asyncHandler(async (req, res) => {
      const gkk = req.query.gkk;
      const scoped = typeof gkk === 'string' && gkk && gkk !== 'All';

      const listRes = await pool.query(`SELECT name FROM ${table} ORDER BY name`);
      const counts = scoped
        ? await pool.query(
            `SELECT unnest(m.${column}) AS name, count(*)::int AS count
             FROM members m JOIN households h ON h.id = m.household_id
             WHERE h.gkk = $1 GROUP BY unnest(m.${column})`,
            [gkk]
          )
        : await pool.query(
            `SELECT unnest(${column}) AS name, count(*)::int AS count FROM members GROUP BY unnest(${column})`
          );

      const countMap = Object.fromEntries(counts.rows.map((r) => [r.name, r.count]));
      res.json({ rows: listRes.rows.map((r) => ({ name: r.name, count: countMap[r.name] || 0 })) });
    })
  );

  router.post(
    `/${path}`,
    asyncHandler(async (req, res) => {
      const name = requireString(req.body?.name, 'Name');
      await pool.query(`INSERT INTO ${table} (name) VALUES ($1) ON CONFLICT DO NOTHING`, [name]);
      res.status(201).json({ ok: true });
    })
  );

  router.patch(
    `/${path}/:name`,
    asyncHandler(async (req, res) => {
      const newName = requireString(req.body?.name, 'Name');
      const oldName = decodeURIComponent(req.params.name);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const updated = await client.query(`UPDATE ${table} SET name = $1 WHERE name = $2 RETURNING name`, [newName, oldName]);
        if (!updated.rows[0]) throw notFound('Item not found');
        await client.query(`UPDATE members SET ${column} = array_replace(${column}, $2, $1)`, [newName, oldName]);
        await client.query('COMMIT');
        res.json({ ok: true });
      } catch (err) {
        await client.query('ROLLBACK');
        throw renameError(err, 'An item with this name');
      } finally {
        client.release();
      }
    })
  );

  router.delete(
    `/${path}/:name`,
    asyncHandler(async (req, res) => {
      const name = decodeURIComponent(req.params.name);
      const inUse = await pool.query(`SELECT count(*)::int AS c FROM members WHERE $1 = ANY(${column})`, [name]);
      if (inUse.rows[0].c > 0) throw conflict('Members are assigned to this item and it cannot be deleted');
      await pool.query(`DELETE FROM ${table} WHERE name = $1`, [name]);
      res.status(204).end();
    })
  );
}

groupRoutes('ministries', 'ministries', 'ministries');
groupRoutes('organizations', 'organizations', 'organizations');

router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM parish_settings WHERE id = 1');
    res.json({ settings: rows[0] });
  })
);

const SETTINGS_FIELDS = ['name', 'address', 'contact', 'email', 'logo'];

router.patch(
  '/settings',
  asyncHandler(async (req, res) => {
    const body = req.body || {};
    const sets = [];
    const params = [];

    // Only touch keys the caller actually sent, so an omitted field is left
    // alone while an explicitly empty one is cleared.
    for (const key of SETTINGS_FIELDS) {
      if (!(key in body)) continue;
      params.push(key === 'logo' ? optionalString(body[key]) : optionalString(body[key]) ?? '');
      sets.push(`${key} = $${params.length}`);
    }
    if (!sets.length) {
      const { rows } = await pool.query('SELECT * FROM parish_settings WHERE id = 1');
      return res.json({ settings: rows[0] });
    }

    const { rows } = await pool.query(
      `UPDATE parish_settings SET ${sets.join(', ')} WHERE id = 1 RETURNING *`,
      params
    );
    res.json({ settings: rows[0] });
  })
);

export default router;
