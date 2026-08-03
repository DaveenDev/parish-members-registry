import { Router } from 'express';
import { pool } from '../db/pool.js';
import { requireAuth } from '../middleware/auth.js';
import { asyncHandler } from '../lib/http.js';
import { ageFromDob } from '../lib/util.js';

const router = Router();
router.use(requireAuth);

router.get('/stats', asyncHandler(async (req, res) => {
  const [households, members] = await Promise.all([
    pool.query('SELECT * FROM households'),
    pool.query('SELECT * FROM members'),
  ]);
  const hh = households.rows;
  const mem = members.rows;

  const verified = hh.filter((h) => h.status === 'Verified').length;
  const pending = hh.filter((h) => h.status === 'Pending').length;

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const monthCounts = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const count = mem.filter((m) => {
      const c = new Date(m.created_at);
      return c.getFullYear() === d.getFullYear() && c.getMonth() === d.getMonth();
    }).length;
    monthCounts.push({ label: monthNames[d.getMonth()], n: count });
  }
  const maxMonth = Math.max(1, ...monthCounts.map((m) => m.n));
  const regMonths = monthCounts.map((m) => ({ ...m, h: `${Math.max(6, Math.round((m.n / maxMonth) * 100))}%` }));

  const ageBucketDefs = [['0-9', 0, 9], ['10-19', 10, 19], ['20-34', 20, 34], ['35-49', 35, 49], ['50-64', 50, 64], ['65+', 65, 200]];
  const ageBucketCounts = ageBucketDefs.map(([label, lo, hi]) => ({
    label,
    n: mem.filter((m) => { const a = ageFromDob(m.dob); return a !== null && a >= lo && a <= hi; }).length,
  }));
  const maxAge = Math.max(1, ...ageBucketCounts.map((b) => b.n));
  const ageBuckets = ageBucketCounts.map((b) => ({ ...b, h: `${Math.max(6, Math.round((b.n / maxAge) * 100))}%` }));

  const gkkMap = {};
  hh.forEach((h) => { if (h.gkk) gkkMap[h.gkk] = (gkkMap[h.gkk] || 0) + 1; });
  const maxGkk = Math.max(1, ...Object.values(gkkMap), 1);
  const gkkBreak = Object.entries(gkkMap).map(([label, n]) => ({ label, n, w: `${Math.round((n / maxGkk) * 100)}%` }));

  const minMap = {};
  mem.forEach((m) => [...(m.ministries || []), ...(m.organizations || [])].forEach((g) => { minMap[g] = (minMap[g] || 0) + 1; }));
  const maxMin = Math.max(1, ...Object.values(minMap), 1);
  const ministryBreak = Object.entries(minMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, n]) => ({ label, n, w: `${Math.round((n / maxMin) * 100)}%` }));

  const sacStats = [
    { label: 'Baptism', n: mem.filter((m) => m.has_baptism).length },
    { label: 'First Communion', n: mem.filter((m) => m.has_communion).length },
    { label: 'Confirmation', n: mem.filter((m) => m.has_confirmation).length },
    { label: 'Matrimony', n: mem.filter((m) => m.has_matrimony).length },
  ];

  res.json({
    statCards: [
      { label: 'Households', value: hh.length, note: `${verified} verified · ${pending} pending`, accent: '#34589c' },
      { label: 'Members', value: mem.length, note: 'across all households', accent: '#c39b4e' },
      { label: 'Verified', value: verified, note: 'households confirmed', accent: '#2f7a52' },
      { label: 'Pending', value: pending, note: 'awaiting verification', accent: '#a13d29' },
      { label: 'GKKs', value: Object.keys(gkkMap).length, note: 'basic ecclesial communities', accent: '#7a6a3e' },
    ],
    regMonths, ageBuckets, gkkBreak, ministryBreak, sacStats,
  });
}));

export default router;
