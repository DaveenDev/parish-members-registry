import { Router } from 'express';
import { pool } from '../db/pool.js';
import { genRefNo } from '../lib/util.js';

const router = Router();

function n(v) {
  return v === '' || v === undefined ? null : v;
}

router.post('/', async (req, res) => {
  const { household, members, volunteer, notifyOptin, consent } = req.body || {};

  if (!household || !household.householdName || !household.street || !household.barangay || !household.city || !household.province || !household.zip) {
    return res.status(400).json({ error: 'Household address details are required' });
  }
  if (!Array.isArray(members) || members.length === 0) {
    return res.status(400).json({ error: 'At least one household member is required' });
  }
  if (!consent) {
    return res.status(400).json({ error: 'Data privacy consent is required' });
  }
  for (const m of members) {
    if (!m.firstName || !m.lastName || !m.relationship || !m.sex || !m.dob || !m.civilStatus) {
      return res.status(400).json({ error: 'Each member needs first name, last name, relationship, sex, date of birth and civil status' });
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const refNo = genRefNo();

    const hh = await client.query(
      `INSERT INTO households
        (household_name, street, barangay, city, province, zip, contact, email, gkk, family_grouping, status, volunteer, notify_optin, consent, ref_no)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Pending',$11,$12,$13,$14)
       RETURNING id, ref_no`,
      [
        household.householdName, household.street, household.barangay, household.city, household.province, household.zip,
        n(household.contact), n(household.email), n(household.gkk), n(household.familyGrouping),
        n(volunteer), !!notifyOptin, !!consent, refNo,
      ]
    );
    const householdId = hh.rows[0].id;

    for (const m of members) {
      await client.query(
        `INSERT INTO members
          (household_id, first_name, middle_name, last_name, relationship, sex, dob, place_of_birth, civil_status, contact, email, occupation, religion, blood_type,
           has_baptism, baptism_date, baptism_church,
           has_communion, communion_date, communion_church,
           has_confirmation, conf_date, conf_church, conf_name, conf_sponsor,
           has_matrimony, mat_date, mat_church, mat_type, ministries)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)`,
        [
          householdId, m.firstName, n(m.middleName), m.lastName, m.relationship, m.sex, m.dob, n(m.placeOfBirth), m.civilStatus, n(m.contact), n(m.email), n(m.occupation), m.religion || 'Roman Catholic', n(m.bloodType),
          !!m.hasBaptism, n(m.baptismDate), n(m.baptismChurch),
          !!m.hasCommunion, n(m.communionDate), n(m.communionChurch),
          !!m.hasConfirmation, n(m.confDate), n(m.confChurch), n(m.confName), n(m.confSponsor),
          !!m.hasMatrimony, n(m.matDate), n(m.matChurch), n(m.matType), m.ministries || [],
        ]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ refNo, householdId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Could not save registration' });
  } finally {
    client.release();
  }
});

export default router;
