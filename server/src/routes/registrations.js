import { Router } from 'express';
import { pool } from '../db/pool.js';
import { insertHouseholdWithRef } from '../lib/ref-no.js';
import { asyncHandler, requireString, optionalString, badRequest } from '../lib/http.js';
import { registrationLimiter } from '../middleware/rate-limit.js';

const router = Router();

const MAX_MEMBERS = 30;

router.post(
  '/',
  registrationLimiter,
  asyncHandler(async (req, res) => {
    const { household, members, volunteer, notifyOptin, consent } = req.body || {};

    if (!household || typeof household !== 'object') throw badRequest('Household details are required');

    const householdName = requireString(household.householdName, 'Family (household) name');
    const street = requireString(household.street, 'Street');
    const barangay = requireString(household.barangay, 'Barangay');
    const city = requireString(household.city, 'City / Municipality');
    const province = requireString(household.province, 'Province');
    const zip = requireString(household.zip, 'ZIP code');

    if (!Array.isArray(members) || members.length === 0) {
      throw badRequest('At least one household member is required');
    }
    if (members.length > MAX_MEMBERS) {
      throw badRequest(`A household can have at most ${MAX_MEMBERS} members`);
    }
    if (!consent) {
      throw badRequest('Data privacy consent is required');
    }

    for (const m of members) {
      if (!m || typeof m !== 'object') throw badRequest('Invalid member entry');
      requireString(m.firstName, 'Member first name');
      requireString(m.lastName, 'Member last name');
      requireString(m.relationship, 'Member relationship');
      requireString(m.sex, 'Member sex');
      requireString(m.dob, 'Member date of birth');
      requireString(m.civilStatus, 'Member civil status');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let refNo;
      const householdId = await insertHouseholdWithRef(client, (generated) => {
        refNo = generated;
        return {
          text: `INSERT INTO households
                  (household_name, street, barangay, city, province, zip, contact, email, gkk, family_grouping, status, volunteer, notify_optin, consent, ref_no)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Pending',$11,$12,$13,$14)
                 RETURNING id`,
          values: [
            householdName, street, barangay, city, province, zip,
            optionalString(household.contact), optionalString(household.email),
            optionalString(household.gkk), optionalString(household.familyGrouping),
            optionalString(volunteer), !!notifyOptin, !!consent, generated,
          ],
        };
      });

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
            householdId, optionalString(m.firstName), optionalString(m.middleName), optionalString(m.lastName),
            optionalString(m.relationship), optionalString(m.sex), optionalString(m.dob), optionalString(m.placeOfBirth),
            optionalString(m.civilStatus), optionalString(m.contact), optionalString(m.email), optionalString(m.occupation),
            optionalString(m.religion) || 'Roman Catholic', optionalString(m.bloodType),
            !!m.hasBaptism, optionalString(m.baptismDate), optionalString(m.baptismChurch),
            !!m.hasCommunion, optionalString(m.communionDate), optionalString(m.communionChurch),
            !!m.hasConfirmation, optionalString(m.confDate), optionalString(m.confChurch),
            optionalString(m.confName), optionalString(m.confSponsor),
            !!m.hasMatrimony, optionalString(m.matDate), optionalString(m.matChurch), optionalString(m.matType),
            Array.isArray(m.ministries) ? m.ministries : [],
          ]
        );
      }

      await client.query('COMMIT');
      res.status(201).json({ refNo, householdId });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

export default router;
