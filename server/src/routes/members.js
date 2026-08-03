import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler, parseId, parsePaging, oneOf, notFound, badRequest } from '../lib/http.js';

const router = Router();
router.use(requireAuth);

const AGE_RANGES = {
  '0-17': [0, 17],
  '18-30': [18, 30],
  '31-59': [31, 59],
  '60-200': [60, 200],
};

const SACRAMENT_COLUMNS = {
  Baptism: 'has_baptism',
  Communion: 'has_communion',
  Confirmation: 'has_confirmation',
  Matrimony: 'has_matrimony',
};

// Sort keys are interpolated into SQL, so they must come from this map only.
const SORTS = {
  name: 'm.first_name %DIR%, m.last_name %DIR%',
  household: 'h.household_name %DIR%',
  // Age ascending means youngest first, i.e. most recent date of birth first.
  age: 'm.dob %INVDIR% NULLS LAST',
  status: 'h.status %DIR%',
};

const SELECT_COLUMNS = `
  m.*,
  h.household_name,
  h.status AS household_status,
  h.gkk AS household_gkk,
  h.street, h.barangay, h.city`;

/** Build the shared WHERE clause + bound params from query filters. */
function buildFilters(query) {
  const {
    status = 'All', civil = 'All', sacrament = 'All', ministry = 'All',
    age = 'All', blood = 'All', gkk = 'All', search = '',
    baptism = 'All', communion = 'All', confirmation = 'All', matrimony = 'All',
  } = query;

  const where = [];
  const params = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('$?', `$${params.length}`));
  };

  if (status !== 'All') add('h.status = $?', status);
  if (civil !== 'All') add('m.civil_status = $?', civil);
  if (gkk !== 'All') add('h.gkk = $?', gkk);

  if (sacrament !== 'All') {
    const col = SACRAMENT_COLUMNS[sacrament];
    if (col) where.push(`m.${col} = true`);
  }

  // Per-sacrament tri-state filters used by the Sacraments page.
  for (const [key, value] of Object.entries({ baptism, communion, confirmation, matrimony })) {
    if (value === 'All') continue;
    if (value !== 'Yes' && value !== 'No') throw badRequest(`Invalid ${key} filter`);
    const col = SACRAMENT_COLUMNS[key[0].toUpperCase() + key.slice(1)];
    if (col) where.push(`m.${col} = ${value === 'Yes' ? 'true' : 'false'}`);
  }

  if (ministry !== 'All') {
    params.push(ministry);
    where.push(`($${params.length} = ANY(m.ministries) OR $${params.length} = ANY(m.organizations))`);
  }

  if (blood !== 'All') {
    if (blood === 'Unknown') where.push('m.blood_type IS NULL');
    else add('m.blood_type = $?', blood);
  }

  if (age !== 'All' && AGE_RANGES[age]) {
    const [lo, hi] = AGE_RANGES[age];
    params.push(lo, hi);
    where.push(
      `m.dob IS NOT NULL AND date_part('year', age(m.dob))::int BETWEEN $${params.length - 1} AND $${params.length}`
    );
  }

  if (typeof search === 'string' && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`);
    const p = `$${params.length}`;
    where.push(`(
      lower(m.first_name || ' ' || m.last_name) LIKE ${p}
      OR lower(h.household_name) LIKE ${p}
      OR lower(coalesce(m.contact, '')) LIKE ${p}
    )`);
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { whereSql, params } = buildFilters(req.query);
    const { page, pageSize, offset } = parsePaging(req.query);

    const sortKey = oneOf(req.query.sortKey, Object.keys(SORTS), 'name');
    const dir = oneOf(req.query.sortDir, ['asc', 'desc'], 'asc') === 'desc' ? 'DESC' : 'ASC';
    const orderBy = SORTS[sortKey]
      .replaceAll('%INVDIR%', dir === 'ASC' ? 'DESC' : 'ASC')
      .replaceAll('%DIR%', dir);

    const countRes = await pool.query(
      `SELECT count(*)::int AS c FROM members m JOIN households h ON h.id = m.household_id ${whereSql}`,
      params
    );

    const listRes = await pool.query(
      `SELECT ${SELECT_COLUMNS}
       FROM members m JOIN households h ON h.id = m.household_id
       ${whereSql}
       ORDER BY ${orderBy}, m.id
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    res.json({ rows: listRes.rows, total: countRes.rows[0].c, page, pageSize });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'member id');
    const { rows } = await pool.query(
      `SELECT ${SELECT_COLUMNS}, h.province, h.zip
       FROM members m JOIN households h ON h.id = m.household_id
       WHERE m.id = $1`,
      [id]
    );
    if (!rows[0]) throw notFound('Member not found');
    res.json({ member: rows[0] });
  })
);

const PATCHABLE = [
  'first_name', 'middle_name', 'last_name', 'relationship', 'sex', 'dob', 'place_of_birth', 'civil_status',
  'contact', 'email', 'occupation', 'religion', 'blood_type',
  'has_baptism', 'baptism_date', 'baptism_church',
  'has_communion', 'communion_date', 'communion_church',
  'has_confirmation', 'conf_date', 'conf_church', 'conf_name', 'conf_sponsor',
  'has_matrimony', 'mat_date', 'mat_church', 'mat_type',
  'ministries', 'organizations',
];

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'member id');
    const body = req.body || {};
    const sets = [];
    const params = [];

    for (const key of PATCHABLE) {
      if (!(key in body)) continue;
      params.push(body[key] === '' ? null : body[key]);
      sets.push(`${key} = $${params.length}`);
    }
    if (!sets.length) throw badRequest('No fields to update');

    params.push(id);
    const result = await pool.query(
      `UPDATE members SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!result.rows[0]) throw notFound('Member not found');
    res.json({ member: result.rows[0] });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'member id');
    const result = await pool.query('DELETE FROM members WHERE id = $1 RETURNING id', [id]);
    if (!result.rows[0]) throw notFound('Member not found');
    res.status(204).end();
  })
);

export default router;
