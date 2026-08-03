import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/gkks', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT g.name, (SELECT count(*)::int FROM households h WHERE h.gkk = g.name) AS count
     FROM gkks g ORDER BY g.name`
  );
  res.json({ rows });
});
router.post('/gkks', async (req, res) => {
  const { name } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
  await pool.query('INSERT INTO gkks (name) VALUES ($1) ON CONFLICT DO NOTHING', [name.trim()]);
  res.status(201).json({ ok: true });
});
router.patch('/gkks/:name', async (req, res) => {
  const { name: newName } = req.body || {};
  const oldName = decodeURIComponent(req.params.name);
  if (!newName?.trim()) return res.status(400).json({ error: 'Name is required' });
  await pool.query('UPDATE gkks SET name = $1 WHERE name = $2', [newName.trim(), oldName]);
  await pool.query('UPDATE households SET gkk = $1 WHERE gkk = $2', [newName.trim(), oldName]);
  res.json({ ok: true });
});
router.delete('/gkks/:name', async (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const inUse = await pool.query('SELECT count(*)::int AS c FROM households WHERE gkk = $1', [name]);
  if (inUse.rows[0].c > 0) return res.status(409).json({ error: 'This GKK is assigned to a household and cannot be deleted' });
  await pool.query('DELETE FROM gkks WHERE name = $1', [name]);
  res.status(204).end();
});

function groupRoutes(table, column, path) {
  router.get(`/${path}`, async (req, res) => {
    const listRes = await pool.query(`SELECT name FROM ${table} ORDER BY name`);
    const counts = await pool.query(`SELECT unnest(${column}) AS name, count(*)::int AS count FROM members GROUP BY unnest(${column})`);
    const countMap = Object.fromEntries(counts.rows.map((r) => [r.name, r.count]));
    res.json({ rows: listRes.rows.map((r) => ({ name: r.name, count: countMap[r.name] || 0 })) });
  });
  router.post(`/${path}`, async (req, res) => {
    const { name } = req.body || {};
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' });
    await pool.query(`INSERT INTO ${table} (name) VALUES ($1) ON CONFLICT DO NOTHING`, [name.trim()]);
    res.status(201).json({ ok: true });
  });
  router.patch(`/${path}/:name`, async (req, res) => {
    const { name: newName } = req.body || {};
    const oldName = decodeURIComponent(req.params.name);
    if (!newName?.trim()) return res.status(400).json({ error: 'Name is required' });
    await pool.query(`UPDATE ${table} SET name = $1 WHERE name = $2`, [newName.trim(), oldName]);
    await pool.query(`UPDATE members SET ${column} = array_replace(${column}, $2, $1)`, [newName.trim(), oldName]);
    res.json({ ok: true });
  });
  router.delete(`/${path}/:name`, async (req, res) => {
    const name = decodeURIComponent(req.params.name);
    const inUse = await pool.query(`SELECT count(*)::int AS c FROM members WHERE $1 = ANY(${column})`, [name]);
    if (inUse.rows[0].c > 0) return res.status(409).json({ error: 'Members are assigned to this item and it cannot be deleted' });
    await pool.query(`DELETE FROM ${table} WHERE name = $1`, [name]);
    res.status(204).end();
  });
}

groupRoutes('ministries', 'ministries', 'ministries');
groupRoutes('organizations', 'organizations', 'organizations');

router.get('/settings', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM parish_settings WHERE id = 1');
  res.json({ settings: rows[0] });
});
router.patch('/settings', async (req, res) => {
  const { name, address, contact, email, logo } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE parish_settings SET
       name = coalesce($1, name), address = coalesce($2, address),
       contact = coalesce($3, contact), email = coalesce($4, email),
       logo = coalesce($5, logo)
     WHERE id = 1 RETURNING *`,
    [name, address, contact, email, logo]
  );
  res.json({ settings: rows[0] });
});

export default router;
