import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { insertHouseholdWithRef } from '../lib/ref-no.js';
import { asyncHandler, parseId, parsePaging, optionalString, requireString, badRequest, notFound } from '../lib/http.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { status = 'All', gkk = 'All', search = '' } = req.query;
    const { page, pageSize, offset } = parsePaging(req.query);

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
    if (typeof search === 'string' && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      const p = `$${params.length}`;
      where.push(`(lower(h.household_name) LIKE ${p} OR lower(h.street) LIKE ${p} OR lower(h.barangay) LIKE ${p} OR lower(h.city) LIKE ${p} OR lower(coalesce(h.contact,'')) LIKE ${p})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const totalRes = await pool.query(`SELECT count(*)::int AS c FROM households h ${whereSql}`, params);

    const listRes = await pool.query(
      `SELECT h.*, (SELECT count(*)::int FROM members m WHERE m.household_id = h.id) AS member_count
       FROM households h ${whereSql}
       ORDER BY h.created_at DESC, h.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset]
    );

    res.json({ rows: listRes.rows, total: totalRes.rows[0].c, page, pageSize });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'household id');
    const hh = await pool.query('SELECT * FROM households WHERE id = $1', [id]);
    if (!hh.rows[0]) throw notFound('Household not found');
    const members = await pool.query('SELECT * FROM members WHERE household_id = $1 ORDER BY id', [id]);
    res.json({ household: hh.rows[0], members: members.rows });
  })
);

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { household, members } = req.body || {};
    if (!household || typeof household !== 'object') throw badRequest('Household details are required');

    const name = requireString(household.name, 'Household name');
    const street = requireString(household.street, 'Street');
    const barangay = requireString(household.barangay, 'Barangay');
    const city = requireString(household.city, 'City / Municipality');
    const province = requireString(household.province, 'Province');
    const zip = requireString(household.zip, 'ZIP code');

    if (!Array.isArray(members) || members.length === 0) throw badRequest('At least one member is required');
    for (const m of members) {
      if (!m || typeof m !== 'object') throw badRequest('Invalid member entry');
      requireString(m.first, 'Member first name');
      requireString(m.last, 'Member last name');
    }

    const status = household.status === 'Verified' ? 'Verified' : 'Pending';

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const householdId = await insertHouseholdWithRef(client, (refNo) => ({
        text: `INSERT INTO households (household_name, street, barangay, city, province, zip, contact, email, gkk, family_grouping, status, ref_no)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        values: [
          name, street, barangay, city, province, zip,
          optionalString(household.contact), optionalString(household.email),
          optionalString(household.gkk), optionalString(household.grouping), status, refNo,
        ],
      }));

      for (const m of members) {
        await client.query(
          `INSERT INTO members
            (household_id, first_name, middle_name, last_name, relationship, sex, dob, place_of_birth, civil_status, contact, email, occupation, blood_type,
             has_baptism, baptism_date, baptism_church, has_communion, communion_date, communion_church,
             has_confirmation, conf_date, conf_church, conf_name, conf_sponsor,
             has_matrimony, mat_date, mat_church, mat_type, ministries, organizations)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)`,
          [
            householdId, optionalString(m.first), optionalString(m.middle), optionalString(m.last),
            optionalString(m.rel), optionalString(m.sex), optionalString(m.dob), optionalString(m.pob),
            optionalString(m.civil), optionalString(m.contact), optionalString(m.email),
            optionalString(m.occupation), optionalString(m.bloodType),
            !!m.hasBaptism, optionalString(m.baptismDate), optionalString(m.baptismChurch),
            !!m.hasCommunion, optionalString(m.communionDate), optionalString(m.communionChurch),
            !!m.hasConfirmation, optionalString(m.confDate), optionalString(m.confChurch),
            optionalString(m.confName), optionalString(m.confSponsor),
            !!m.hasMatrimony, optionalString(m.matDate), optionalString(m.matChurch), optionalString(m.matType),
            Array.isArray(m.ministries) ? m.ministries : [],
            Array.isArray(m.organizations) ? m.organizations : [],
          ]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({ id: householdId });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

const PATCHABLE = ['household_name', 'street', 'barangay', 'city', 'province', 'zip', 'contact', 'email', 'gkk', 'family_grouping', 'status'];

router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'household id');
    const body = req.body || {};
    const sets = [];
    const params = [];

    for (const key of PATCHABLE) {
      if (!(key in body)) continue;
      if (key === 'status' && !['Pending', 'Verified'].includes(body[key])) throw badRequest('Invalid status');
      params.push(body[key] === '' ? null : body[key]);
      sets.push(`${key} = $${params.length}`);
    }
    if (!sets.length) throw badRequest('No fields to update');

    params.push(id);
    const result = await pool.query(
      `UPDATE households SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    );
    if (!result.rows[0]) throw notFound('Household not found');
    res.json({ household: result.rows[0] });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'household id');
    // members.household_id is ON DELETE CASCADE, so this removes the family's
    // member records in the same statement.
    const result = await pool.query('DELETE FROM households WHERE id = $1 RETURNING id', [id]);
    if (!result.rows[0]) throw notFound('Household not found');
    res.status(204).end();
  })
);

router.post(
  '/:id/members',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'household id');
    const m = req.body || {};
    const firstName = requireString(m.firstName, 'First name');
    const lastName = requireString(m.lastName, 'Last name');

    const exists = await pool.query('SELECT 1 FROM households WHERE id = $1', [id]);
    if (!exists.rows[0]) throw notFound('Household not found');

    const result = await pool.query(
      `INSERT INTO members (household_id, first_name, middle_name, last_name, relationship, sex, dob, civil_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        id, firstName, optionalString(m.middleName), lastName,
        optionalString(m.relationship), optionalString(m.sex), optionalString(m.dob), optionalString(m.civilStatus),
      ]
    );
    res.status(201).json({ member: result.rows[0] });
  })
);

export default router;
