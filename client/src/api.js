// Talks directly to Supabase (Postgres + RLS) instead of the old Express
// API. Every exported function keeps the exact name/argument/return shape
// the admin pages and the public registration wizard already call, so this
// file is the only thing that changed for the Supabase migration.
import { supabase } from './lib/supabaseClient.js';
import { ageFromDob } from './constants.js';
import { initials, memberFullName } from './lib/util.js';
import { toCsv, downloadCsv } from './lib/csv.js';

const MAX_PAGE_SIZE = 100;

function clampPaging({ page, pageSize } = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.min(Math.max(1, parseInt(pageSize, 10) || 10), MAX_PAGE_SIZE);
  return { page: p, pageSize: size, from: (p - 1) * size, to: (p - 1) * size + size - 1 };
}

function mapError(error, { fallback = 'Request failed', dupLabel } = {}) {
  if (!error) return new Error(fallback);
  if (error.code === '23505' && dupLabel) return new Error(`${dupLabel} already exists`);
  return new Error(error.message || fallback);
}

function cleanPatch(patch) {
  const out = {};
  for (const [key, value] of Object.entries(patch || {})) out[key] = value === '' ? null : value;
  return out;
}

export const api = {
  // ---- public registration wizard --------------------------------------
  async submitRegistration({ household, members, volunteer, notifyOptin, consent }) {
    const { data, error } = await supabase.rpc('submit_registration', {
      payload: { household, members, volunteer, notifyOptin, consent },
    });
    if (error) throw mapError(error);
    return data; // { refNo, householdId }
  },

  // ---- account (used by ParishConfig's "Change password" card) --------
  async changePassword(_currentPassword, newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw mapError(error);
    return { ok: true };
  },

  // ---- households --------------------------------------------------------
  async listHouseholds(params = {}) {
    const { status = 'All', gkk = 'All', search = '' } = params;
    const { page, pageSize, from, to } = clampPaging(params);

    let q = supabase.from('households_with_count').select('*', { count: 'exact' });
    if (status !== 'All') q = q.eq('status', status);
    if (gkk !== 'All') q = q.eq('gkk', gkk);
    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      q = q.or(`household_name.ilike.${s},street.ilike.${s},barangay.ilike.${s},city.ilike.${s},contact.ilike.${s}`);
    }
    q = q.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, to);

    const { data, error, count } = await q;
    if (error) throw mapError(error);
    return { rows: data, total: count, page, pageSize };
  },

  async getHousehold(id) {
    const { data: household, error } = await supabase.from('households').select('*').eq('id', id).single();
    if (error) throw mapError(error, { fallback: 'Household not found' });
    const { data: members, error: mErr } = await supabase.from('members').select('*').eq('household_id', id).order('id');
    if (mErr) throw mapError(mErr);
    return { household, members };
  },

  async createHousehold({ household, members }) {
    const { data, error } = await supabase.rpc('create_household', { payload: { household, members } });
    if (error) throw mapError(error);
    return { id: data };
  },

  async updateHousehold(id, patch) {
    const { data, error } = await supabase.from('households').update(cleanPatch(patch)).eq('id', id).select().single();
    if (error) throw mapError(error, { fallback: 'Household not found' });
    return { household: data };
  },

  async deleteHousehold(id) {
    const { error } = await supabase.from('households').delete().eq('id', id);
    if (error) throw mapError(error);
    return null;
  },

  async addHouseholdMember(householdId, member) {
    const { data, error } = await supabase
      .from('members')
      .insert({
        household_id: householdId,
        first_name: member.firstName,
        middle_name: member.middleName || null,
        last_name: member.lastName,
        relationship: member.relationship || null,
        sex: member.sex || null,
        dob: member.dob || null,
        civil_status: member.civilStatus || null,
      })
      .select()
      .single();
    if (error) throw mapError(error);
    return { member: data };
  },

  // ---- members -------------------------------------------------------
  async listMembers(params = {}) {
    const {
      status = 'All', civil = 'All', sacrament = 'All', ministry = 'All',
      age = 'All', blood = 'All', gkk = 'All', search = '',
      baptism = 'All', communion = 'All', confirmation = 'All', matrimony = 'All',
      sortKey = 'name', sortDir = 'asc',
    } = params;
    const { page, pageSize, from, to } = clampPaging(params);

    const SACRAMENT_COLUMNS = { Baptism: 'has_baptism', Communion: 'has_communion', Confirmation: 'has_confirmation', Matrimony: 'has_matrimony' };
    const AGE_RANGES = { '0-17': [0, 17], '18-30': [18, 30], '31-59': [31, 59], '60-200': [60, 200] };

    let q = supabase.from('members_with_household').select('*', { count: 'exact' });

    if (status !== 'All') q = q.eq('household_status', status);
    if (civil !== 'All') q = q.eq('civil_status', civil);
    if (gkk !== 'All') q = q.eq('household_gkk', gkk);
    if (sacrament !== 'All' && SACRAMENT_COLUMNS[sacrament]) q = q.eq(SACRAMENT_COLUMNS[sacrament], true);

    for (const [key, value] of Object.entries({ baptism, communion, confirmation, matrimony })) {
      if (value === 'All') continue;
      const col = SACRAMENT_COLUMNS[key[0].toUpperCase() + key.slice(1)];
      if (col) q = q.eq(col, value === 'Yes');
    }

    if (ministry !== 'All') {
      const escaped = String(ministry).replace(/"/g, '\\"');
      q = q.or(`ministries.cs.{"${escaped}"},organizations.cs.{"${escaped}"}`);
    }

    if (blood !== 'All') {
      q = blood === 'Unknown' ? q.is('blood_type', null) : q.eq('blood_type', blood);
    }

    if (age !== 'All' && AGE_RANGES[age]) {
      const [lo, hi] = AGE_RANGES[age];
      q = q.not('age', 'is', null).gte('age', lo).lte('age', hi);
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      q = q.or(`full_name.ilike.${s},household_name.ilike.${s},contact.ilike.${s}`);
    }

    const ascending = sortDir !== 'desc';
    const sortCol = { name: 'first_name', household: 'household_name', age: 'age', status: 'household_status' }[sortKey] || 'first_name';
    q = q.order(sortCol, { ascending, nullsFirst: false });
    if (sortKey === 'name') q = q.order('last_name', { ascending });
    q = q.order('id', { ascending: true }).range(from, to);

    const { data, error, count } = await q;
    if (error) throw mapError(error);
    return { rows: data, total: count, page, pageSize };
  },

  async getMember(id) {
    const { data, error } = await supabase.from('members_with_household').select('*').eq('id', id).single();
    if (error) throw mapError(error, { fallback: 'Member not found' });
    return { member: data };
  },

  async updateMember(id, patch) {
    const { data, error } = await supabase.from('members').update(cleanPatch(patch)).eq('id', id).select().single();
    if (error) throw mapError(error, { fallback: 'Member not found' });
    return { member: data };
  },

  async deleteMember(id) {
    const { error } = await supabase.from('members').delete().eq('id', id);
    if (error) throw mapError(error);
    return null;
  },

  // ---- GKKs ------------------------------------------------------------
  async listGkks() {
    const [{ data: names, error }, { data: hhRows, error: hErr }] = await Promise.all([
      supabase.from('gkks').select('name').order('name'),
      supabase.from('households').select('gkk'),
    ]);
    if (error) throw mapError(error);
    if (hErr) throw mapError(hErr);
    const counts = {};
    for (const r of hhRows) if (r.gkk) counts[r.gkk] = (counts[r.gkk] || 0) + 1;
    return { rows: names.map((g) => ({ name: g.name, count: counts[g.name] || 0 })) };
  },

  async addGkk(name) {
    const { error } = await supabase.from('gkks').insert({ name });
    if (error && error.code !== '23505') throw mapError(error);
    return { ok: true };
  },

  async renameGkk(oldName, newName) {
    const { error } = await supabase.rpc('rename_gkk', { old_name: oldName, new_name: newName });
    if (error) throw mapError(error, { dupLabel: 'A GKK with this name' });
    return { ok: true };
  },

  async deleteGkk(name) {
    const { error } = await supabase.rpc('delete_gkk', { target_name: name });
    if (error) throw mapError(error);
    return null;
  },

  // ---- ministries / organizations (identical shape, different table) --
  listMinistries: (opts) => listGroup('ministries', 'ministries', opts),
  addMinistry: (name) => addGroup('ministries', name),
  renameMinistry: (oldName, newName) => renameGroup('rename_ministry', oldName, newName, 'An item with this name'),
  deleteMinistry: (name) => deleteGroup('delete_ministry', name),

  listOrganizations: (opts) => listGroup('organizations', 'organizations', opts),
  addOrganization: (name) => addGroup('organizations', name),
  renameOrganization: (oldName, newName) => renameGroup('rename_organization', oldName, newName, 'An item with this name'),
  deleteOrganization: (name) => deleteGroup('delete_organization', name),

  // ---- parish settings ---------------------------------------------------
  async getSettings() {
    const { data, error } = await supabase.from('parish_settings').select('*').eq('id', 1).single();
    if (error) throw mapError(error);
    return { settings: data };
  },

  async updateSettings(patch) {
    const cleaned = {};
    for (const key of ['name', 'address', 'contact', 'email', 'logo']) {
      if (!(key in patch)) continue;
      const raw = patch[key];
      const trimmed = typeof raw === 'string' ? raw.trim() : '';
      cleaned[key] = key === 'logo' ? (trimmed === '' ? null : raw) : trimmed;
    }
    if (!Object.keys(cleaned).length) return api.getSettings();
    const { data, error } = await supabase.from('parish_settings').update(cleaned).eq('id', 1).select().single();
    if (error) throw mapError(error);
    return { settings: data };
  },

  // ---- dashboard ---------------------------------------------------------
  async dashboardStats() {
    const [{ data: hh, error: hErr }, { data: mem, error: mErr }] = await Promise.all([
      supabase.from('households').select('*'),
      supabase.from('members').select('*'),
    ]);
    if (hErr) throw mapError(hErr);
    if (mErr) throw mapError(mErr);

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

    return {
      statCards: [
        { label: 'Households', value: hh.length, note: `${verified} verified · ${pending} pending`, accent: '#34589c' },
        { label: 'Members', value: mem.length, note: 'across all households', accent: '#c39b4e' },
        { label: 'Verified', value: verified, note: 'households confirmed', accent: '#2f7a52' },
        { label: 'Pending', value: pending, note: 'awaiting verification', accent: '#a13d29' },
        { label: 'GKKs', value: Object.keys(gkkMap).length, note: 'basic ecclesial communities', accent: '#7a6a3e' },
      ],
      regMonths, ageBuckets, gkkBreak, ministryBreak, sacStats,
    };
  },

  // ---- reports -------------------------------------------------------
  async reportStats() {
    const [{ data: hh, error: hErr }, { data: mem, error: mErr }] = await Promise.all([
      supabase.from('households').select('*'),
      supabase.from('members_with_household').select('*'),
    ]);
    if (hErr) throw mapError(hErr);
    if (mErr) throw mapError(mErr);

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

    return {
      totalHH: hh.length,
      totalVerified: hh.filter((h) => h.status === 'Verified').length,
      totalPending: hh.filter((h) => h.status === 'Pending').length,
      totalMembers: mem.length,
      regByGkk, sacCompletion, participation, anyVolunteer: Number.isFinite(anyVolunteer) ? anyVolunteer : 0,
      bloodCounts, unknownBlood: mem.length - bloodMem.length,
      gkkNames,
    };
  },

  async bloodReport(type = 'All') {
    const { data, error } = await supabase.from('members_with_household').select('*').not('blood_type', 'is', null);
    if (error) throw mapError(error);
    const filtered = type === 'All' ? data : data.filter((m) => m.blood_type === type);
    return {
      rows: filtered.map((m) => ({
        mid: m.id, name: memberFullName(m), initials: initials(m.first_name, m.last_name),
        household: m.household_name, bloodType: m.blood_type, age: m.age, gkk: m.household_gkk, contact: m.contact,
      })),
    };
  },

  async reportSources() {
    const types = {
      Members: { types: ['By GKK', 'By Sacrament', 'By Ministry / Organization'] },
      Households: { types: ['By Status', 'By GKK'] },
    };
    return { sources: Object.keys(types), types };
  },

  async generateReport({ source, type, gkk = 'All', dateFrom, dateTo, sacrament, group }) {
    if (source === 'Members') {
      const { data, error } = await supabase.from('members_with_household').select('*');
      if (error) throw mapError(error);
      let list = data;
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
        cells: [memberFullName(m), m.household_name, m.household_gkk || '—', m.age ?? '—', m.relationship || '—', m.contact || '—'],
      }));
      return { title: `Members — ${type}`, meta: `${rowsOut.length} member(s)`, columns, rows: rowsOut, empty: rowsOut.length === 0, csvColumns: columns };
    }

    if (source === 'Households') {
      const { data, error } = await supabase.from('households').select('*');
      if (error) throw mapError(error);
      let list = data;
      if (gkk && gkk !== 'All') list = list.filter((h) => h.gkk === gkk);
      if (dateFrom) list = list.filter((h) => new Date(h.created_at) >= new Date(dateFrom));
      if (dateTo) list = list.filter((h) => new Date(h.created_at) <= new Date(dateTo));
      const columns = ['Household', 'GKK', 'Grouping', 'Status', 'Registered'];
      const rowsOut = list.map((h) => ({
        cells: [h.household_name, h.gkk || '—', h.family_grouping || '—', h.status, new Date(h.created_at).toLocaleDateString()],
      }));
      return { title: `Households — ${type}`, meta: `${rowsOut.length} household(s)`, columns, rows: rowsOut, empty: rowsOut.length === 0, csvColumns: columns };
    }

    throw new Error('Unsupported source');
  },

  // ---- exports (client-side CSV now — no backend to stream a download from)
  exportUrl: (name) => `/exports/${name}`,

  async exportGenerated({ title, columns, rows }) {
    if (!columns || !rows) throw new Error('Nothing to export');
    const csv = toCsv(
      rows.map((r) => Object.fromEntries(r.cells.map((c, i) => [columns[i], c]))),
      columns.map((label) => ({ label, value: label }))
    );
    return new Blob([csv], { type: 'text/csv;charset=utf-8' });
  },
};

async function listGroup(table, column, opts) {
  const gkk = opts && typeof opts === 'object' ? opts.gkk : undefined;
  const scoped = typeof gkk === 'string' && gkk && gkk !== 'All';

  const { data: names, error } = await supabase.from(table).select('name').order('name');
  if (error) throw mapError(error);

  const counts = {};
  if (scoped) {
    const { data, error: e2 } = await supabase.from('members_with_household').select(column).eq('household_gkk', gkk);
    if (e2) throw mapError(e2);
    data.forEach((r) => (r[column] || []).forEach((n) => { counts[n] = (counts[n] || 0) + 1; }));
  } else {
    const { data, error: e2 } = await supabase.from('members').select(column);
    if (e2) throw mapError(e2);
    data.forEach((r) => (r[column] || []).forEach((n) => { counts[n] = (counts[n] || 0) + 1; }));
  }

  return { rows: names.map((r) => ({ name: r.name, count: counts[r.name] || 0 })) };
}

async function addGroup(table, name) {
  const { error } = await supabase.from(table).insert({ name });
  if (error && error.code !== '23505') throw mapError(error);
  return { ok: true };
}

async function renameGroup(rpcName, oldName, newName, dupLabel) {
  const { error } = await supabase.rpc(rpcName, { old_name: oldName, new_name: newName });
  if (error) throw mapError(error, { dupLabel });
  return { ok: true };
}

async function deleteGroup(rpcName, name) {
  const { error } = await supabase.rpc(rpcName, { target_name: name });
  if (error) throw mapError(error);
  return null;
}

export async function downloadWithAuth(path, filename) {
  try {
    if (path === '/exports/members.csv') {
      const { data, error } = await supabase.from('members_with_household').select('*').order('household_name').order('id');
      if (error) throw mapError(error);
      downloadCsv(filename, data, [
        { label: 'First Name', value: 'first_name' },
        { label: 'Middle Name', value: 'middle_name' },
        { label: 'Last Name', value: 'last_name' },
        { label: 'Household', value: 'household_name' },
        { label: 'Relationship', value: 'relationship' },
        { label: 'Sex', value: 'sex' },
        { label: 'Date of Birth', value: 'dob' },
        { label: 'Age', value: (r) => r.age ?? '' },
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
    } else if (path === '/exports/households.csv') {
      const { data, error } = await supabase.from('households_with_count').select('*').order('household_name');
      if (error) throw mapError(error);
      downloadCsv(filename, data, [
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
    } else if (path === '/exports/blood.csv') {
      const { data, error } = await supabase.from('members_with_household').select('*').not('blood_type', 'is', null).order('blood_type');
      if (error) throw mapError(error);
      downloadCsv(filename, data, [
        { label: 'Name', value: (r) => `${r.first_name} ${r.last_name}` },
        { label: 'Blood Type', value: 'blood_type' },
        { label: 'Age', value: (r) => r.age ?? '' },
        { label: 'GKK', value: 'household_gkk' },
        { label: 'Household', value: 'household_name' },
        { label: 'Contact', value: 'contact' },
      ]);
    } else {
      throw new Error(`Unknown export: ${path}`);
    }
  } catch (err) {
    // Matches the old fetch-based downloadWithAuth, which never surfaced
    // errors to the caller either (Exports.jsx doesn't await/catch it).
    console.error(err);
  }
}

export { triggerDownload } from './lib/csv.js';
