import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/http.js';
import { ageFromDob, initials, memberFullName } from '../lib/util.js';

const router = Router();
router.use(requireAuth);

router.get('/stats', asyncHandler(async (req, res) => {
  const [households, members] = await Promise.all([
    pool.query('SELECT * FROM households'),
    pool.query(
      `SELECT m.*, h.household_name, h.gkk AS household_gkk, h.street, h.barangay, h.city
       FROM members m JOIN households h ON h.id = m.household_id`
    ),
  ]);
  const hh = households.rows;
  const mem = members.rows;

  const gkkNames = [...new Set(hh.map((h) => h.gkk).filter(Boolean))];
  const regByGkk = gkkNames.map((label) => {
    const inGkk = hh.filter((h) => h.gkk === label);
    const verified = inGkk.filter((h) => h.status === 'Verified').length;
    const pending = inGkk.filter((h) => h.status === 'Pending').length;
    const total = Math.max(1, inGkk.length);
    return { label, verified, pending, vw: `${Math.round((verified / total) * 100)}%`, pw: `${Math.round((pending / total) * 100)}%` };
  });

  const sacDefs = [['Baptism', 'has_baptism'], ['First Communion', 'has_communion'], ['Confirmation', 'has_confirmation'], ['Matrimony', 'has_matrimony']];
  const totalMembers = Math.max(1, mem.length);
  const sacCompletion = sacDefs.map(([label, key]) => {
    const n = mem.filter((m) => m[key]).length;
    return { label, n, missing: mem.length - n, w: `${Math.round((n / totalMembers) * 100)}%` };
  });

  const groupNames = [...new Set(mem.flatMap((m) => [...(m.ministries || []), ...(m.organizations || [])]))];
  const colors = ['#34589c', '#c39b4e', '#2f7a52', '#a13d29', '#7a6a3e', '#8a5fb0'];
  const participation = groupNames.map((label, i) => {
    const n = mem.filter((m) => (m.ministries || []).includes(label) || (m.organizations || []).includes(label)).length;
    return { label, n, w: `${Math.round((n / totalMembers) * 100)}%`, color: colors[i % colors.length] };
  });
  const anyVolunteer = Math.round((mem.filter((m) => (m.ministries || []).length || (m.organizations || []).length).length / totalMembers) * 100);

  const bloodMem = mem.filter((m) => m.blood_type);
  const bloodTypes = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const bloodCounts = bloodTypes.map((label) => ({ label, n: bloodMem.filter((m) => m.blood_type === label).length })).filter((b) => b.n > 0);

  res.json({
    totalHH: hh.length,
    totalVerified: hh.filter((h) => h.status === 'Verified').length,
    totalPending: hh.filter((h) => h.status === 'Pending').length,
    totalMembers: mem.length,
    regByGkk, sacCompletion, participation, anyVolunteer: Number.isFinite(anyVolunteer) ? anyVolunteer : 0,
    bloodCounts, unknownBlood: mem.length - bloodMem.length,
    gkkNames,
  });
}));

router.get('/blood', asyncHandler(async (req, res) => {
  const { type = 'All' } = req.query;
  const { rows } = await pool.query(
    `SELECT m.*, h.household_name, h.gkk AS household_gkk FROM members m JOIN households h ON h.id = m.household_id WHERE m.blood_type IS NOT NULL`
  );
  const filtered = type === 'All' ? rows : rows.filter((m) => m.blood_type === type);
  res.json({
    rows: filtered.map((m) => ({
      mid: m.id, name: memberFullName(m), initials: initials(m.first_name, m.last_name),
      household: m.household_name, bloodType: m.blood_type, age: ageFromDob(m.dob), gkk: m.household_gkk, contact: m.contact,
    })),
  });
}));

const SOURCES = {
  Members: {
    types: ['By GKK', 'By Sacrament', 'By Ministry / Organization'],
  },
  Households: {
    types: ['By Status', 'By GKK'],
  },
};

router.get('/sources', (req, res) => res.json({ sources: Object.keys(SOURCES), types: SOURCES }));

router.post('/generate', asyncHandler(async (req, res) => {
  const { source, type, gkk = 'All', dateFrom, dateTo, sacrament, group } = req.body || {};
  if (!SOURCES[source] || !SOURCES[source].types.includes(type)) return res.status(400).json({ error: 'Unknown report' });

  if (source === 'Members') {
    const { rows } = await pool.query(
      `SELECT m.*, h.household_name, h.gkk AS household_gkk FROM members m JOIN households h ON h.id = m.household_id`
    );
    let list = rows;
    if (gkk && gkk !== 'All') list = list.filter((m) => m.household_gkk === gkk);
    if (type === 'By Sacrament' && sacrament) {
      const key = { Baptism: 'has_baptism', Communion: 'has_communion', Confirmation: 'has_confirmation', Matrimony: 'has_matrimony' }[sacrament];
      if (key) list = list.filter((m) => m[key]);
    }
    if (type === 'By Ministry / Organization' && group) {
      list = list.filter((m) => (m.ministries || []).includes(group) || (m.organizations || []).includes(group));
    }
    const columns = ['Name', 'Household', 'GKK', 'Age', 'Relationship', 'Contact'];
    const rowsOut = list.map((m) => ({
      cells: [memberFullName(m), m.household_name, m.household_gkk || '—', ageFromDob(m.dob) ?? '—', m.relationship || '—', m.contact || '—'],
    }));
    return res.json({ title: `Members — ${type}`, meta: `${rowsOut.length} member(s)`, columns, rows: rowsOut, empty: rowsOut.length === 0, csvColumns: columns });
  }

  if (source === 'Households') {
    const { rows } = await pool.query('SELECT * FROM households');
    let list = rows;
    if (gkk && gkk !== 'All') list = list.filter((h) => h.gkk === gkk);
    if (dateFrom) list = list.filter((h) => new Date(h.created_at) >= new Date(dateFrom));
    if (dateTo) list = list.filter((h) => new Date(h.created_at) <= new Date(dateTo));
    const columns = ['Household', 'GKK', 'Grouping', 'Status', 'Registered'];
    const rowsOut = list.map((h) => ({
      cells: [h.household_name, h.gkk || '—', h.family_grouping || '—', h.status, new Date(h.created_at).toLocaleDateString()],
    }));
    return res.json({ title: `Households — ${type}`, meta: `${rowsOut.length} household(s)`, columns, rows: rowsOut, empty: rowsOut.length === 0, csvColumns: columns });
  }

  res.status(400).json({ error: 'Unsupported source' });
}));

export default router;
