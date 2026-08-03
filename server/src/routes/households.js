import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { genRefNo } from '../lib/util.js';

const router = Router();
router.use(requireAuth);

function n(v) {
  return v === '' || v === undefined ? null : v;
}

router.get('/', async (req, res) => {
  const { status = 'All', gkk = 'All', search = '', page = '1', pageSize = '10' } = req.query;
  const where = [];
  const params = [];

  if (status !== 'All') {
    params.push(status);
    where.push(`h.status = $${params.length}`);
  }
  if (gkk !== 'All') {
    params.push(gkk);
    where.push(`h.gkk = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    const p = params.length;
    where.push(`(lower(h.household_name) LIKE $${p} OR lower(h.street) LIKE $${p} OR lower(h.barangay) LIKE $${p} OR lower(h.city) LIKE $${p} OR lower(coalesce(h.contact,'')) LIKE $${p})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const totalRes = await pool.query(`SELECT count(*)::int AS c FROM households h ${whereSql}`, params);
  const total = totalRes.rows[0].c;

  const limit = Math.max(1, parseInt(pageSize, 10) || 10);
  const p = Math.max(1, parseInt(page, 10) || 1);
  const offset = (p - 1) * limit;

  const listRes = await pool.query(
    `SELECT h.*, (SELECT count(*)::int FROM members m WHERE m.household_id = h.id) AS member_count
     FROM households h ${whereSql}
     ORDER BY h.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  res.json({ rows: listRes.rows, total, page: p, pageSize: limit });
});

router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const hh = await pool.query('SELECT * FROM households WHERE id = $1', [id]);
  if (!hh.rows[0]) return res.status(404).json({ error: 'Household not found' });
  const members = await pool.query('SELECT * FROM members WHERE household_id = $1 ORDER BY id', [id]);
  res.json({ household: hh.rows[0], members: members.rows });
});

router.post('/', async (req, res) => {
  const { household, members } = req.body || {};
  if (!household?.name || !household.street || !household.barangay || !household.city || !household.province || !household.zip) {
    return res.status(400).json({ error: 'Household address details are required' });
  }
  if (!Array.isArray(members) || members.length === 0) {
    return res.status(400).json({ error: 'At least one member is required' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const hh = await client.query(
      `INSERT INTO households (household_name, street, barangay, city, province, zip, contact, email, gkk, family_grouping, status, ref_no)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [
        household.name, household.street, household.barangay, household.city, household.province, household.zip,
        n(household.contact), n(household.email), n(household.gkk), n(household.grouping), household.status || 'Pending', genRefNo(),
      ]
    );
    const householdId = hh.rows[0].id;

    for (const m of members) {
      await client.query(
        `INSERT INTO members
          (household_id, first_name, middle_name, last_name, relationship, sex, dob, place_of_birth, civil_status, contact, email, occupation, blood_type,
           has_baptism, baptism_date, baptism_church, has_communion, communion_date, communion_church,
           has_confirmation, conf_date, conf_church, conf_name, conf_sponsor,
           has_matrimony, mat_date, mat_church, mat_type, ministries, organizations)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)`,
        [
          householdId, m.first, n(m.middle), m.last, n(m.rel), n(m.sex), n(m.dob), n(m.pob), n(m.civil), n(m.contact), n(m.email), n(m.occupation), n(m.bloodType),
          !!m.hasBaptism, n(m.baptismDate), n(m.baptismChurch), !!m.hasCommunion, n(m.communionDate), n(m.communionChurch),
          !!m.hasConfirmation, n(m.confDate), n(m.confChurch), n(m.confName), n(m.confSponsor),
          !!m.hasMatrimony, n(m.matDate), n(m.matChurch), n(m.matType), m.ministries || [], m.organizations || [],
        ]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ id: householdId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Could not create household' });
  } finally {
    client.release();
  }
});

router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const allowed = ['household_name', 'street', 'barangay', 'city', 'province', 'zip', 'contact', 'email', 'gkk', 'family_grouping', 'status'];
  const sets = [];
  const params = [];
  for (const key of allowed) {
    if (key in (req.body || {})) {
      params.push(req.body[key]);
      sets.push(`${key} = $${params.length}`);
    }
  }
  if (!sets.length) return res.status(400).json({ error: 'No fields to update' });
  params.push(id);
  const result = await pool.query(`UPDATE households SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`, params);
  if (!result.rows[0]) return res.status(404).json({ error: 'Household not found' });
  res.json({ household: result.rows[0] });
});

router.post('/:id/members', async (req, res) => {
  const { id } = req.params;
  const m = req.body || {};
  if (!m.firstName || !m.lastName) return res.status(400).json({ error: 'First and last name are required' });
  const result = await pool.query(
    `INSERT INTO members (household_id, first_name, middle_name, last_name, relationship, sex, dob, civil_status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [id, m.firstName, n(m.middleName), m.lastName, n(m.relationship), n(m.sex), n(m.dob), n(m.civilStatus)]
  );
  res.status(201).json({ member: result.rows[0] });
});

export default router;
