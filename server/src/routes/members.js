import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { ageFromDob } from '../lib/util.js';

const router = Router();
router.use(requireAuth);

function n(v) {
  return v === '' || v === undefined ? null : v;
}

const AGE_RANGES = {
  '0-17': [0, 17],
  '18-30': [18, 30],
  '31-59': [31, 59],
  '60-200': [60, 200],
};

router.get('/', async (req, res) => {
  const {
    status = 'All', civil = 'All', sacrament = 'All', ministry = 'All', age = 'All', blood = 'All', gkk = 'All',
    search = '', sortKey = 'name', sortDir = 'asc', page = '1', pageSize = '10',
  } = req.query;

  const { rows: all } = await pool.query(
    `SELECT m.*, h.household_name, h.status AS household_status, h.gkk AS household_gkk, h.street, h.barangay, h.city
     FROM members m JOIN households h ON h.id = m.household_id`
  );

  let list = all;
  if (status !== 'All') list = list.filter((m) => m.household_status === status);
  if (civil !== 'All') list = list.filter((m) => m.civil_status === civil);
  if (sacrament !== 'All') {
    const key = { Baptism: 'has_baptism', Communion: 'has_communion', Confirmation: 'has_confirmation', Matrimony: 'has_matrimony' }[sacrament];
    if (key) list = list.filter((m) => m[key]);
  }
  if (ministry !== 'All') list = list.filter((m) => (m.ministries || []).includes(ministry) || (m.organizations || []).includes(ministry));
  if (blood !== 'All') list = list.filter((m) => (blood === 'Unknown' ? !m.blood_type : m.blood_type === blood));
  if (gkk !== 'All') list = list.filter((m) => m.household_gkk === gkk);
  if (age !== 'All' && AGE_RANGES[age]) {
    const [lo, hi] = AGE_RANGES[age];
    list = list.filter((m) => {
      const a = ageFromDob(m.dob);
      return a !== null && a >= lo && a <= hi;
    });
  }
  if (search) {
    const s = search.toLowerCase();
    list = list.filter((m) =>
      `${m.first_name} ${m.last_name}`.toLowerCase().includes(s) ||
      (m.household_name || '').toLowerCase().includes(s) ||
      (m.contact || '').toLowerCase().includes(s)
    );
  }

  const dir = sortDir === 'desc' ? -1 : 1;
  list = list.slice().sort((a, b) => {
    let av, bv;
    if (sortKey === 'name') { av = `${a.first_name} ${a.last_name}`; bv = `${b.first_name} ${b.last_name}`; }
    else if (sortKey === 'household') { av = a.household_name; bv = b.household_name; }
    else if (sortKey === 'age') { av = ageFromDob(a.dob) ?? -1; bv = ageFromDob(b.dob) ?? -1; }
    else if (sortKey === 'status') { av = a.household_status; bv = b.household_status; }
    else { av = a.id; bv = b.id; }
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  const total = list.length;
  const limit = Math.max(1, parseInt(pageSize, 10) || 10);
  const p = Math.max(1, parseInt(page, 10) || 1);
  const rows = list.slice((p - 1) * limit, (p - 1) * limit + limit);

  res.json({ rows, total, page: p, pageSize: limit });
});

router.get('/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT m.*, h.household_name, h.status AS household_status, h.gkk AS household_gkk, h.street, h.barangay, h.city, h.province, h.zip
     FROM members m JOIN households h ON h.id = m.household_id WHERE m.id = $1`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Member not found' });
  res.json({ member: rows[0] });
});

const PATCHABLE = [
  'first_name', 'middle_name', 'last_name', 'relationship', 'sex', 'dob', 'place_of_birth', 'civil_status',
  'contact', 'email', 'occupation', 'religion', 'blood_type',
  'has_baptism', 'baptism_date', 'baptism_church',
  'has_communion', 'communion_date', 'communion_church',
  'has_confirmation', 'conf_date', 'conf_church', 'conf_name', 'conf_sponsor',
  'has_matrimony', 'mat_date', 'mat_church', 'mat_type',
  'ministries', 'organizations',
];

router.patch('/:id', async (req, res) => {
  const sets = [];
  const params = [];
  for (const key of PATCHABLE) {
    if (key in (req.body || {})) {
      params.push(req.body[key] === '' ? null : req.body[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(req.params.id);
  const result = await pool.query(`UPDATE members SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  if (!result.rows[0]) return res.status(404).json({ error: 'Member not found' });
  res.json({ member: result.rows[0] });
});

router.delete('/:id', async (req, res) => {
  const result = await pool.query('DELETE FROM members WHERE id = $1 RETURNING id', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Member not found' });
  res.status(204).end();
});

export default router;
