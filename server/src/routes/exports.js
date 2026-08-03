import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { ageFromDob, toCsv } from '../lib/util.js';

const router = Router();
router.use(requireAuth);

function send(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

router.get('/members.csv', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT m.*, h.household_name, h.gkk AS household_gkk FROM members m JOIN households h ON h.id = m.household_id ORDER BY h.household_name, m.id`
  );
  const csv = toCsv(rows, [
    { label: 'First Name', value: 'first_name' },
    { label: 'Middle Name', value: 'middle_name' },
    { label: 'Last Name', value: 'last_name' },
    { label: 'Household', value: 'household_name' },
    { label: 'Relationship', value: 'relationship' },
    { label: 'Sex', value: 'sex' },
    { label: 'Date of Birth', value: 'dob' },
    { label: 'Age', value: (r) => ageFromDob(r.dob) ?? '' },
    { label: 'Civil Status', value: 'civil_status' },
    { label: 'Contact', value: 'contact' },
    { label: 'Email', value: 'email' },
    { label: 'Occupation', value: 'occupation' },
    { label: 'Blood Type', value: 'blood_type' },
    { label: 'GKK', value: 'household_gkk' },
    { label: 'Baptism', value: (r) => (r.has_baptism ? 'Yes' : 'No') },
    { label: 'First Communion', value: (r) => (r.has_communion ? 'Yes' : 'No') },
    { label: 'Confirmation', value: (r) => (r.has_confirmation ? 'Yes' : 'No') },
    { label: 'Matrimony', value: (r) => (r.has_matrimony ? 'Yes' : 'No') },
    { label: 'Ministries', value: (r) => (r.ministries || []).join('; ') },
    { label: 'Organizations', value: (r) => (r.organizations || []).join('; ') },
  ]);
  send(res, 'members.csv', csv);
});

router.get('/households.csv', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT h.*, (SELECT count(*)::int FROM members m WHERE m.household_id = h.id) AS member_count FROM households h ORDER BY h.household_name`
  );
  const csv = toCsv(rows, [
    { label: 'Household Name', value: 'household_name' },
    { label: 'Street', value: 'street' },
    { label: 'Barangay', value: 'barangay' },
    { label: 'City', value: 'city' },
    { label: 'Province', value: 'province' },
    { label: 'ZIP', value: 'zip' },
    { label: 'GKK', value: 'gkk' },
    { label: 'Family Grouping', value: 'family_grouping' },
    { label: 'Contact', value: 'contact' },
    { label: 'Email', value: 'email' },
    { label: 'Members', value: 'member_count' },
    { label: 'Status', value: 'status' },
    { label: 'Reference No.', value: 'ref_no' },
    { label: 'Registered', value: (r) => new Date(r.created_at).toISOString().slice(0, 10) },
  ]);
  send(res, 'households.csv', csv);
});

router.get('/blood.csv', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT m.*, h.household_name, h.gkk AS household_gkk FROM members m JOIN households h ON h.id = m.household_id WHERE m.blood_type IS NOT NULL ORDER BY m.blood_type`
  );
  const csv = toCsv(rows, [
    { label: 'Name', value: (r) => `${r.first_name} ${r.last_name}` },
    { label: 'Blood Type', value: 'blood_type' },
    { label: 'Age', value: (r) => ageFromDob(r.dob) ?? '' },
    { label: 'GKK', value: 'household_gkk' },
    { label: 'Household', value: 'household_name' },
    { label: 'Contact', value: 'contact' },
  ]);
  send(res, 'blood-directory.csv', csv);
});

router.post('/generated.csv', async (req, res) => {
  const { title, columns, rows } = req.body || {};
  if (!columns || !rows) return res.status(400).json({ error: 'Nothing to export' });
  const csv = toCsv(
    rows.map((r) => Object.fromEntries(r.cells.map((c, i) => [columns[i], c]))),
    columns.map((label) => ({ label, value: label }))
  );
  send(res, `${(title || 'report').toLowerCase().replace(/\s+/g, '-')}.csv`, csv);
});

export default router;
