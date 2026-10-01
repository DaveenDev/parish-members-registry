// Talks directly to Supabase (Postgres + RLS) instead of the old Express
// API. Every exported function keeps the exact name/argument/return shape
// the admin pages and the public registration wizard already call, so this
// file is the only thing that changed for the Supabase migration.
import { supabase } from './lib/supabaseClient.js';
import { PARTICIPATION_ITEMS, HELP_WAYS, SACRAMENTS, BLOOD_TYPES, parseAgeRange } from './constants.js';
import { memberFullName, inDateRange } from './lib/util.js';
import { bis, RELATIONSHIP_LABELS, SEX_LABELS, CIVIL_STATUS_LABELS, WEDDING_TYPE_LABELS } from './lib/bisaya.js';
import { toCsv, downloadCsv } from './lib/csv.js';
import { fetchAllPages } from './lib/paging.js';
import { shapeDashboard, shapeReport } from './lib/stats.js';
import { MEMBERSHIP_STATUSES, censusResponsesPayload } from './lib/census.js';

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

/**
 * Every row of a query, however many there are. Supabase caps a single
 * request at 1,000 rows, so the report builder and CSV exports would
 * otherwise come up short in a large parish. (Totals and counts don't need
 * this: they're computed in the database.) `build` returns a
 * fresh, stably ordered query each time it's called.
 */
async function fetchAll(build) {
  const { data, error } = await fetchAllPages((from, to) => build().range(from, to));
  if (error) throw mapError(error);
  return data;
}

/** True when a Postgres function doesn't exist yet (its migration hasn't been run). */
function isMissingFunction(error) {
  return error?.code === 'PGRST202' || error?.code === '42883';
}

/** A missing table is a migration that hasn't been run; say which one. */
function migrationError(error, table) {
  if (error?.code === '42P01' || error?.code === 'PGRST205') return new Error(`Run the 0014_roles_activity_trash.sql migration in Supabase to use this page (${table} is missing)`);
  return mapError(error);
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

  // ---- census family portal (0008 migration) --------------------------
  /** { open, label } — whether a census is open for online updates. */
  async portalStatus() {
    const { data, error } = await supabase.rpc('portal_status');
    if (error) throw mapError(error);
    return data || { open: false };
  },

  /** The household's census form, or { ok: false, error: 'invalid' | 'locked' | 'closed' }. */
  async portalOpen(refNo, code) {
    const { data, error } = await supabase.rpc('portal_open', { p_ref: refNo, p_code: code });
    if (error) throw mapError(error);
    return data;
  },

  async portalSubmit(refNo, code, payload) {
    const { data, error } = await supabase.rpc('portal_submit', { p_ref: refNo, p_code: code, p_payload: payload });
    if (error) throw mapError(error);
    return data;
  },

  async listPublicGkks() {
    const { data, error } = await supabase.rpc('list_public_gkks');
    if (error) throw mapError(error);
    return data || [];
  },

  async listPublicOrganizations() {
    const { data, error } = await supabase.rpc('list_public_organizations');
    if (error) throw mapError(error);
    return data || [];
  },

  async listPublicParishPositions() {
    const { data, error } = await supabase.rpc('list_public_parish_positions');
    if (error) throw mapError(error);
    return data || [];
  },

  async publicStats() {
    const { data, error } = await supabase.rpc('public_parish_stats');
    if (error) throw mapError(error);
    return data; // { gkks, households }
  },

  /** The logo uploaded in Parish Config (a data URL), or null if there isn't one. */
  async publicParishLogo() {
    const { data, error } = await supabase.rpc('public_parish_logo');
    if (error) throw mapError(error);
    return data || null;
  },

  /** True when no household (any status) already uses this name, ignoring case. */
  async householdNameAvailable(name) {
    const { data, error } = await supabase.rpc('household_name_available', { candidate: name });
    if (error) throw mapError(error);
    return data === true;
  },

  // ---- account (used by ParishConfig's "Change password" card) --------
  async changePassword(currentPassword, newPassword) {
    // Re-check the current password first, so an unattended signed-in
    // browser can't be used to take over the account.
    const { data: { user }, error: uErr } = await supabase.auth.getUser();
    if (uErr || !user?.email) throw mapError(uErr, { fallback: 'Please sign in again' });
    const { error: authErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword || '' });
    if (authErr) throw new Error('Current password is incorrect');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw mapError(error);
    return { ok: true };
  },

  // ---- households --------------------------------------------------------
  /**
   * One page of households. Filters: status, gkk, search, ids. Sort:
   * sortKey 'registered' (newest first by default), 'name', 'gkk',
   * 'members' or 'updated', with sortDir 'asc' / 'desc'.
   */
  async listHouseholds(params = {}) {
    const { page, pageSize, from, to } = clampPaging(params);
    const q = householdQuery(supabase.from('households_with_count').select('*', { count: 'exact' }), params).range(from, to);
    const { data, error, count } = await q;
    if (error) throw mapError(error);
    return { rows: data, total: count, page, pageSize };
  },

  async getHousehold(id) {
    const { data: household, error } = await supabase.from('households').select('*').eq('id', id).single();
    if (error) throw mapError(error, { fallback: 'Household not found' });
    const { data: members, error: mErr } = await supabase.from('members').select('*').eq('household_id', id).order('id');
    if (mErr) throw mapError(mErr);
    // Attach staff verifications ({ baptism: true, … }) for the print sheet.
    // Before the 0005 migration the table doesn't exist; just skip it.
    const { data: checks } = await supabase.from('sacrament_verifications').select('member_id, sacrament').in('member_id', members.map((m) => m.id));
    for (const m of members) {
      m.verified = Object.fromEntries((checks || []).filter((c) => c.member_id === m.id).map((c) => [c.sacrament, true]));
    }
    return { household, members };
  },

  /**
   * Staff registering a family (admin New Household). Takes the public
   * wizard's household / member shapes and maps them to the keys
   * create_household reads; the survey, volunteer, consent and religion need
   * the 0009 migration.
   */
  async createHousehold({ household, status, members, volunteer, notifyOptin, consent }) {
    const { householdName, familyGrouping, ...rest } = household;
    const payload = {
      household: { ...rest, name: householdName, grouping: familyGrouping, status },
      members: members.map(({ firstName, middleName, lastName, relationship, placeOfBirth, civilStatus, ...m }) => ({
        ...m, first: firstName, middle: middleName, last: lastName, rel: relationship, pob: placeOfBirth, civil: civilStatus,
      })),
      volunteer, notifyOptin, consent,
    };
    const { data, error } = await supabase.rpc('create_household', { payload });
    if (error) throw mapError(error);
    return { id: data };
  },

  /** Set the status of several households at once (bulk Verify). */
  async setHouseholdsStatus(ids, status) {
    if (!ids.length) return [];
    const { data, error } = await supabase.from('households').update({ status }).in('id', ids).select('id');
    if (error) throw mapError(error);
    return data;
  },

  /** Download households matching listHouseholds-style filters (or `ids`) as CSV. */
  async exportHouseholdsCsv(params, filename = 'households.csv') {
    const data = await fetchAll(() => householdQuery(supabase.from('households_with_count').select('*'), { sortKey: 'name', ...params }));
    downloadCsv(filename, data, HOUSEHOLD_CSV_COLUMNS);
    return data.length;
  },

  /** Download members matching listMembers-style filters (or `ids`) as CSV. */
  async exportMembersCsv(params, filename = 'members.csv') {
    const data = await fetchAll(() => {
      let q = applyMemberFilters(supabase.from('members_with_household').select('*'), params);
      if (params?.ids) q = q.in('id', params.ids);
      return q.order('household_name').order('id');
    });
    downloadCsv(filename, data, MEMBER_CSV_COLUMNS);
    return data.length;
  },

  async updateHousehold(id, patch) {
    const { data, error } = await supabase.from('households').update(cleanPatch(patch)).eq('id', id).select().single();
    if (error) throw mapError(error, { fallback: 'Household not found' });
    return { household: data };
  },

  /**
   * Move a household (and its members) to the trash. Resolves to the trash
   * entry's id, for Undo, or null before 0014, when it's deleted outright.
   */
  async deleteHousehold(id) {
    const { data, error } = await supabase.rpc('trash_household', { p_id: id });
    if (!error) return data;
    if (!isMissingFunction(error)) throw mapError(error);
    const { error: delError } = await supabase.from('households').delete().eq('id', id);
    if (delError) throw mapError(delError);
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
        suffix: member.suffix || null,
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
      sortKey = 'name', sortDir = 'asc',
      groupBy, // 'gkk': rows come out GKK by GKK, with the chosen sort inside each
      memberOrder = 'id', // within a household: 'id' (head first) or 'name'
    } = params;
    const { page, pageSize, from, to } = clampPaging(params);

    let q = applyMemberFilters(supabase.from('members_with_household').select('*', { count: 'exact' }), params);

    const ascending = sortDir !== 'desc';
    const sortCol = { name: 'first_name', household: 'household_name', age: 'age', status: 'household_status', blood: 'blood_type' }[sortKey] || 'first_name';
    // Members without a GKK sort last, under their own "No GKK" heading.
    if (groupBy === 'gkk') q = q.order('household_gkk', { ascending: true, nullsFirst: false });
    q = q.order(sortCol, { ascending, nullsFirst: false });
    if (sortKey === 'name') q = q.order('last_name', { ascending });
    // Within a blood type, alphabetical by name.
    if (sortKey === 'blood') q = q.order('first_name', { ascending: true }).order('last_name', { ascending: true });
    // Keep each household's members together even when two share a name;
    // within a household, id order puts the head (entered first) on top.
    if (sortKey === 'household') {
      q = q.order('household_id', { ascending });
      if (memberOrder === 'name') q = q.order('first_name', { ascending: true }).order('last_name', { ascending: true });
    }
    q = q.order('id', { ascending: true }).range(from, to);

    const { data, error, count } = await q;
    if (error) throw mapError(error);
    return { rows: data, total: count, page, pageSize };
  },

  /**
   * How many members match `params` in each GKK: { 'GKK San Isidro': 12, …,
   * null: 3 } (null = households with no GKK). Uses count-only queries per
   * GKK, so totals are exact however many members there are.
   */
  async memberCountsByGkk(params = {}) {
    const { data: gkks, error } = await supabase.from('gkks').select('name');
    if (error) throw mapError(error);
    const count = async (gkk) => {
      let q = applyMemberFilters(supabase.from('members_with_household').select('id', { count: 'exact', head: true }), { ...params, gkk: 'All' });
      q = gkk === null ? q.is('household_gkk', null) : q.eq('household_gkk', gkk);
      const { count: n, error: e } = await q;
      if (e) throw mapError(e);
      return n || 0;
    };
    const names = params.gkk && params.gkk !== 'All' ? [params.gkk] : [...gkks.map((g) => g.name), null];
    const counts = await Promise.all(names.map(count));
    return new Map(names.map((name, i) => [name, counts[i]]));
  },

  /**
   * Members per blood type under the given filters (gkk, age, search…), for
   * the Blood Types page tiles: { 'A+': 4, …, Unknown: 9 }. Count-only queries.
   */
  async bloodTypeCounts(params = {}) {
    const keys = [...BLOOD_TYPES, 'Unknown'];
    const counts = await Promise.all(keys.map(async (blood) => {
      const q = applyMemberFilters(supabase.from('members_with_household').select('id', { count: 'exact', head: true }), { ...params, blood });
      const { count, error } = await q;
      if (error) throw mapError(error);
      return count || 0;
    }));
    return Object.fromEntries(keys.map((k, i) => [k, counts[i]]));
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

  /** Move a member to the trash; like deleteHousehold. */
  async deleteMember(id) {
    const { data, error } = await supabase.rpc('trash_member', { p_id: id });
    if (!error) return data;
    if (!isMissingFunction(error)) throw mapError(error);
    const { error: delError } = await supabase.from('members').delete().eq('id', id);
    if (delError) throw mapError(delError);
    return null;
  },

  // ---- trash and activity log (0014 migration) -------------------------
  async listTrash() {
    const { data, error } = await supabase.from('deleted_records')
      .select('id, kind, record_id, label, detail, deleted_at, deleted_by_name')
      .order('deleted_at', { ascending: false }).limit(500);
    if (error) throw migrationError(error, 'deleted_records');
    return { rows: data || [] };
  },
  /** Put a trash entry back. Resolves to { kind, record_id, household_id }. */
  async restoreDeleted(id) {
    const { data, error } = await supabase.rpc('restore_deleted', { p_id: id });
    if (error) throw mapError(error);
    return data;
  },
  async purgeDeleted(id) {
    const { error } = await supabase.rpc('purge_deleted', { p_id: id });
    if (error) throw mapError(error);
  },

  /**
   * Activity log entries, newest first. Narrow with householdId, memberId,
   * table ('households' | 'members' | 'sacrament_verifications'), actor
   * (a staff name, or 'online' for the family's own changes) and search
   * (the household or member name).
   */
  async listActivity({ householdId, memberId, table, actor, search, page = 1, pageSize = 20 } = {}) {
    const p = clampPaging({ page, pageSize });
    let q = supabase.from('activity_log').select('*', { count: 'exact' });
    if (householdId) q = q.eq('household_id', householdId);
    if (memberId) q = q.eq('member_id', memberId);
    if (table && table !== 'All') q = q.eq('table_name', table);
    if (actor === 'online') q = q.is('actor_name', null);
    else if (actor && actor !== 'All') q = q.eq('actor_name', actor);
    if (search && search.trim()) q = q.ilike('label', `%${search.trim().replace(/[%_,()]/g, ' ')}%`);
    const { data, error, count } = await q.order('at', { ascending: false }).order('id', { ascending: false }).range(p.from, p.to);
    if (error) throw migrationError(error, 'activity_log');
    return { rows: data || [], total: count || 0, page: p.page, pageSize: p.pageSize };
  },

  /**
   * Requests whose reference number or names match `text`, a few of each
   * kind, for the quick search: [{ kind, id, ref_no, title, status }].
   */
  async searchRequests(text) {
    const t = String(text || '').trim().replace(/[%_,()]/g, ' ');
    if (t.length < 2) return [];
    const like = `%${t}%`;
    const kinds = [
      ['certificates', 'certificate_requests', 'id, ref_no, status, subject_first_name, subject_last_name, requester_name',
        `ref_no.ilike.${like},subject_first_name.ilike.${like},subject_last_name.ilike.${like},requester_name.ilike.${like}`,
        (r) => `${r.subject_first_name} ${r.subject_last_name}`],
      ['prayers', 'prayer_requests', 'id, ref_no, status, for_name, requester_name, intention_type',
        `ref_no.ilike.${like},for_name.ilike.${like},requester_name.ilike.${like}`,
        (r) => r.for_name || r.intention_type],
      ['blood', 'blood_requests', 'id, ref_no, status, patient_name, blood_type',
        `ref_no.ilike.${like},patient_name.ilike.${like}`,
        (r) => `${r.patient_name} (${r.blood_type})`],
    ];
    const results = await Promise.all(kinds.map(async ([kind, table, cols, filter, title]) => {
      const { data, error } = await supabase.from(table).select(cols).or(filter).order('created_at', { ascending: false }).limit(4);
      if (error) return [];
      return (data || []).map((r) => ({ kind, id: r.id, ref_no: r.ref_no, status: r.status, title: title(r) }));
    }));
    return results.flat();
  },

  /** What's waiting for staff, for the sidebar badges. */
  async navCounts() {
    const { data, error } = await supabase.rpc('admin_nav_counts');
    if (!error) return data;
    if (!isMissingFunction(error)) throw mapError(error);
    // Before 0014: pending households and the request queues only.
    const [pending, requests] = await Promise.all([
      supabase.from('households').select('id', { count: 'exact', head: true }).eq('status', 'Pending'),
      api.requestInboxCounts().catch(() => null),
    ]);
    return { pending_households: pending.count || 0, requests };
  },

  // ---- sacrament verification (admin) --------------------------------
  /** Staff verifications for one member, keyed by sacrament ('baptism', …). */
  async getSacramentVerifications(memberId) {
    const { data, error } = await supabase.from('sacrament_verifications').select('*').eq('member_id', memberId);
    if (error) throw mapError(error);
    return Object.fromEntries((data || []).map((v) => [v.sacrament, v]));
  },

  async verifySacrament(memberId, sacrament, source, reference) {
    const { data, error } = await supabase.rpc('verify_sacrament', {
      p_member_id: memberId, p_sacrament: sacrament, p_source: source, p_reference: reference || null,
    });
    if (error) throw mapError(error);
    return data;
  },

  async unverifySacrament(memberId, sacrament) {
    const { error } = await supabase.rpc('unverify_sacrament', { p_member_id: memberId, p_sacrament: sacrament });
    if (error) throw mapError(error);
    return null;
  },

  /** { baptism: { claimed, verified }, … } — count-only queries, no rows downloaded. */
  async sacramentVerificationCounts({ gkk = 'All' } = {}) {
    const count = async (filter) => {
      let q = supabase.from('members_with_household').select('id', { count: 'exact', head: true }).eq('is_current', true);
      if (gkk !== 'All') q = q.eq('household_gkk', gkk);
      const { count: n, error } = await filter(q);
      if (error) throw mapError(error);
      return n || 0;
    };
    const entries = await Promise.all(SACRAMENTS.map(async (s) => {
      const [claimed, verified] = await Promise.all([
        count((q) => q.eq(s.has, true)),
        count((q) => q.eq(`${s.key}_verified`, true)),
      ]);
      return [s.key, { claimed, verified }];
    }));
    return Object.fromEntries(entries);
  },

  // ---- staff accounts (Settings → Staff; staff admins only) -----------
  // Runs in the manage-staff Edge Function, which holds the service-role key.
  staff: {
    list: () => callStaffFunction({ action: 'list' }).then((r) => r.staff || []),
    create: ({ name, email, role, isAdmin, access, accessGkk, password }) => callStaffFunction({ action: 'create', name, email, role, is_admin: !!isAdmin, access, access_gkk: accessGkk, password }),
    update: (id, { name, role, isAdmin, access, accessGkk }) => callStaffFunction({ action: 'update', id, name, role, is_admin: !!isAdmin, access, access_gkk: accessGkk }),
    resetPassword: (id, password) => callStaffFunction({ action: 'reset_password', id, password }),
    setDisabled: (id, disabled) => callStaffFunction({ action: disabled ? 'disable' : 'enable', id }),
  },

  // ---- possible duplicate members (admin) ------------------------------
  /** Groups of members who share a first name, last name and date of birth (find_duplicate_members). */
  async findDuplicateMembers() {
    const { data, error } = await supabase.rpc('find_duplicate_members');
    if (error) throw mapError(error);
    return data || [];
  },

  /** Hide a group as "not duplicates" until another matching member turns up. */
  async dismissDuplicateGroup(memberIds) {
    const { error } = await supabase.rpc('dismiss_duplicate_group', { p_member_ids: memberIds });
    if (error) throw mapError(error);
    return null;
  },

  // ---- ministry / organization membership (admin) -------------------
  addMemberToGroup: (memberId, column, name) => changeGroupMembership(memberId, column, name, true),
  removeMemberFromGroup: (memberId, column, name) => changeGroupMembership(memberId, column, name, false),

  // ---- GKKs ------------------------------------------------------------
  async listGkks() {
    return { rows: await listCounts('gkks') };
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
  listMinistries: (opts) => listGroup('ministries', opts),
  addMinistry: (name) => addGroup('ministries', name),
  renameMinistry: (oldName, newName) => renameGroup('rename_ministry', oldName, newName, 'An item with this name'),
  deleteMinistry: (name) => deleteGroup('delete_ministry', name),

  listOrganizations: (opts) => listGroup('organizations', opts),
  addOrganization: (name) => addGroup('organizations', name),
  renameOrganization: (oldName, newName) => renameGroup('rename_organization', oldName, newName, 'An item with this name'),
  deleteOrganization: (name) => deleteGroup('delete_organization', name),

  // ---- parish positions (Parish Organization Structure) ----------------
  // One position per member (members.parish_role), not an array like the above.
  async listParishPositions() {
    return { rows: await listCounts('parish_positions') };
  },
  addParishPosition: (name) => addGroup('parish_positions', name),
  renameParishPosition: (oldName, newName) => renameGroup('rename_parish_position', oldName, newName, 'A position with this name'),
  deleteParishPosition: (name) => deleteGroup('delete_parish_position', name),

  // ---- parish settings ---------------------------------------------------
  async getSettings() {
    const { data, error } = await supabase.from('parish_settings').select('*').eq('id', 1).single();
    if (error) throw mapError(error);
    return { settings: data };
  },

  async updateSettings(patch) {
    const cleaned = {};
    for (const key of ['name', 'address', 'contact', 'email', 'logo', ...OFFICE_TEXT_FIELDS]) {
      if (!(key in patch)) continue;
      const raw = patch[key];
      const trimmed = typeof raw === 'string' ? raw.trim() : '';
      cleaned[key] = key === 'logo' ? (trimmed === '' ? null : raw) : trimmed;
    }
    // Office hours and the map pin (0011 migration) aren't plain text.
    if ('office_hours' in patch) cleaned.office_hours = patch.office_hours || null;
    for (const key of ['latitude', 'longitude']) {
      if (!(key in patch)) continue;
      const n = patch[key] === '' || patch[key] === null ? null : Number(patch[key]);
      if (n !== null && Number.isNaN(n)) throw new Error(`The map ${key} must be a number`);
      cleaned[key] = n;
    }
    if (!Object.keys(cleaned).length) return api.getSettings();
    const { data, error } = await supabase.from('parish_settings').update(cleaned).eq('id', 1).select().single();
    if (error) throw mapError(error);
    return { settings: data };
  },

  // ---- parish website content (0011 migration) ------------------------
  async listMassSchedules() {
    return listWebsite('mass_schedules', (q) => q.order('day_of_week').order('start_time'));
  },
  saveMassSchedule: (row) => saveWebsiteRow('mass_schedules', row),
  deleteMassSchedule: (id) => deleteWebsiteRow('mass_schedules', id),

  async listSacramentGuides() {
    return listWebsite('sacrament_guides', (q) => q.order('sort').order('id'));
  },
  saveSacramentGuide: (row) => saveWebsiteRow('sacrament_guides', row),

  async listAnnouncements() {
    return listWebsite('announcements', (q) => q.order('publish_on', { ascending: false }).order('id', { ascending: false }));
  },
  saveAnnouncement: (row) => saveWebsiteRow('announcements', row),
  deleteAnnouncement: (id) => deleteWebsiteRow('announcements', id),

  async listBulletins() {
    return listWebsite('bulletins', (q) => q.order('week_of', { ascending: false }));
  },
  saveBulletin: (row) => saveWebsiteRow('bulletins', row, 'A bulletin for this week'),
  deleteBulletin: (id) => deleteWebsiteRow('bulletins', id),

  async listEvents() {
    return listWebsite('events', (q) => q.order('start_date').order('start_time', { nullsFirst: true }));
  },
  saveEvent: (row) => saveWebsiteRow('events', row),
  deleteEvent: (id) => deleteWebsiteRow('events', id),

  // Latest updates: articles about activities held (0013 migration).
  async listArticles() {
    return listWebsite('articles', (q) => q.order('held_on', { ascending: false }).order('id', { ascending: false }), '0013_public_site.sql');
  },
  saveArticle: (row) => saveWebsiteRow('articles', row),
  deleteArticle: (id) => deleteWebsiteRow('articles', id),

  // GKK directory details on the gkks rows (0013 migration).
  async listGkkDetails() {
    return listWebsite('gkks', (q) => q.order('name'), '0013_public_site.sql');
  },
  async saveGkkDetails(id, patch) {
    const fields = Object.fromEntries(GKK_DETAIL_FIELDS.filter((f) => f in patch).map((f) => [f, typeof patch[f] === 'string' ? patch[f].trim() : patch[f]]));
    const { data, error } = await supabase.from('gkks').update(cleanPatch(fields)).eq('id', id).select().single();
    if (error) throw mapError(error);
    return data;
  },

  /** Publish or unpublish one item of any website content table. */
  async setWebsitePublished(table, id, published) {
    if (!WEBSITE_TABLES.includes(table)) throw new Error('Unknown content type');
    const { data, error } = await supabase.from(table).update({ published }).eq('id', id).select().single();
    if (error) throw mapError(error);
    return data;
  },

  // ---- requests from parishioners (0012 migration) --------------------
  // Public forms (for the public website). Each returns { ref_no } except
  // registerBloodDonor. Errors arrive in Bisaya, ready to show.
  submitCertificateRequest: (payload) => publicRpc('submit_certificate_request', { payload }),
  /** Status of a certificate request by reference number, or null if not found. */
  certificateRequestStatus: (refNo) => publicRpc('certificate_request_status', { p_ref: refNo }),
  submitPrayerRequest: (payload) => publicRpc('submit_prayer_request', { payload }),
  registerBloodDonor: (payload) => publicRpc('register_blood_donor', { payload }),
  submitBloodRequest: (payload) => publicRpc('submit_blood_request', { payload }),
  /** Open blood calls staff chose to show: blood type, units, hospital, date. */
  publicBloodCalls: () => publicRpc('public_blood_calls'),
  /** Prayer intentions staff chose to show (requester agreed), last 30 days. */
  publicPrayerIntentions: () => publicRpc('public_prayer_intentions'),

  // ---- public website reads (0011 tables, 0013 functions) -------------
  // Published items only, even for a signed-in staff member browsing the site.
  publicMassSchedules: () => listPublished('mass_schedules', (q) => q.order('day_of_week').order('start_time')),
  /** Live announcements: pinned first, then newest. */
  publicAnnouncements: () => listPublished('announcements', (q) => q
    .lte('publish_on', todayLocal())
    .or(`expires_on.is.null,expires_on.gte.${todayLocal()}`)
    .order('pinned', { ascending: false }).order('publish_on', { ascending: false }).order('id', { ascending: false })),
  publicBulletins: () => listPublished('bulletins', (q) => q.order('week_of', { ascending: false }).limit(26)),
  /** Events that haven't ended before `fromIso` (YYYY-MM-DD). */
  publicEvents: (fromIso) => listPublished('events', (q) => q
    .or(`end_date.gte.${fromIso},and(end_date.is.null,start_date.gte.${fromIso})`)
    .order('start_date').order('start_time', { nullsFirst: true })),
  publicArticles: () => listPublished('articles', (q) => q.order('held_on', { ascending: false }).order('id', { ascending: false }).limit(30)),
  /** One published item by id (for shared links to an event, announcement, bulletin or article), or null. */
  async publicItem(table, id) {
    if (!WEBSITE_TABLES.includes(table)) throw new Error('Unknown content type');
    const rows = await listPublished(table, (q) => q.eq('id', Number(id) || 0).limit(1));
    return rows[0] || null;
  },
  /** [{ name, puroks, meeting_schedule, meeting_place, households|null, census_pct|null, coordinator|null }] */
  publicGkkDirectory: () => publicRpc('public_gkk_directory'),
  /** { open, label, ends_on, pct, gkks: [{ name, pct|null }] } */
  publicCensusProgress: () => publicRpc('public_census_progress'),
  publicOfficeDetails: () => publicRpc('public_office_details'),
  /** { ref_no, household_name, status, registered_on }, or null if not found. */
  registrationStatus: (refNo) => publicRpc('registration_status', { p_ref: refNo }),

  // Staff queues.
  async requestInboxCounts() {
    const { data, error } = await supabase.rpc('request_inbox_counts');
    if (error) throw mapError(error);
    return data;
  },

  async listCertificateRequests() {
    return listRequests('certificate_requests', '*, member:members(*)');
  },
  saveCertificateRequest: (row) => saveRequestRow('certificate_requests', row, CERT_FIELDS),

  async listPrayerRequests() {
    return listRequests('prayer_requests');
  },
  savePrayerRequest: (row) => saveRequestRow('prayer_requests', row, PRAYER_FIELDS),
  /** Mark several intentions as prayed for, at the Mass on `offeredOn`. */
  async markPrayersPrayed(ids, offeredOn) {
    if (!ids.length) return [];
    const { data, error } = await supabase.from('prayer_requests')
      .update({ status: 'Prayed for', offered_on: offeredOn || null }).in('id', ids).select();
    if (error) throw mapError(error);
    return data;
  },

  async listBloodRequests() {
    return listRequests('blood_requests');
  },
  saveBloodRequest: (row) => saveRequestRow('blood_requests', row, BLOOD_REQUEST_FIELDS),

  async listBloodDonors() {
    return listRequests('blood_donors', '*', (q) => q.order('full_name'));
  },
  saveBloodDonor: (row) => saveRequestRow('blood_donors', row, DONOR_FIELDS, 'A donor with this mobile number'),

  async listBloodContacts(requestId) {
    const { data, error } = await supabase.from('blood_request_contacts').select('*').eq('request_id', requestId);
    if (error) throw mapError(error);
    return data || [];
  },
  async setBloodContact(requestId, donorId, status, note) {
    const { data, error } = await supabase.from('blood_request_contacts')
      .upsert({ request_id: requestId, donor_id: donorId, status, note: note?.trim() || null }, { onConflict: 'request_id,donor_id' })
      .select().single();
    if (error) throw mapError(error);
    return data;
  },
  async clearBloodContact(requestId, donorId) {
    const { error } = await supabase.from('blood_request_contacts').delete().eq('request_id', requestId).eq('donor_id', donorId);
    if (error) throw mapError(error);
  },

  /** Delete a request (e.g. spam). Only these tables. */
  async deleteRequest(table, id) {
    if (!REQUEST_TABLES.includes(table)) throw new Error('Unknown request type');
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw mapError(error);
  },

  // ---- parish census (0007 migration) --------------------------------
  /** Every census, newest first. */
  async listCensusCycles() {
    const { data, error } = await supabase.from('census_cycles').select('*').order('id', { ascending: false });
    if (error) throw mapError(error);
    return data;
  },

  async openCensusCycle({ label, startsOn, endsOn }) {
    const { data, error } = await supabase.rpc('census_open_cycle', {
      p_label: label, p_starts_on: startsOn || null, p_ends_on: endsOn || null,
    });
    if (error) throw mapError(error, { dupLabel: 'A census with this name' });
    return data;
  },

  async closeCensusCycle(id) {
    const { data, error } = await supabase.rpc('census_close_cycle', { p_cycle_id: id });
    if (error) throw mapError(error);
    return data;
  },

  async reopenCensusCycle(id) {
    const { data, error } = await supabase.rpc('census_reopen_cycle', { p_cycle_id: id });
    if (error) throw mapError(error);
    return data;
  },

  async setCensusInterval(months) {
    const { error } = await supabase.from('parish_settings').update({ census_interval_months: Number(months) }).eq('id', 1);
    if (error) throw mapError(error);
    return { ok: true };
  },

  /** Households with how many of their members are confirmed in this census. */
  async listCensusHouseholds(cycleId, params = {}) {
    const { gkk = 'All', progress = 'All', search = '' } = params;
    const { page, pageSize, from, to } = clampPaging(params);
    let q = supabase.rpc('census_household_progress', { p_cycle_id: cycleId }, { count: 'exact' });
    if (gkk === 'None') q = q.is('gkk', null);
    else if (gkk !== 'All') q = q.eq('gkk', gkk);
    if (progress !== 'All') q = q.eq('progress', progress);
    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      q = q.or(`household_name.ilike.${s},head_name.ilike.${s},ref_no.ilike.${s}`);
    }
    q = q.order('household_name').order('household_id').range(from, to);
    const { data, error, count } = await q;
    if (error) throw mapError(error);
    return { rows: data, total: count, page, pageSize };
  },

  /** { 'Not started': n, 'Partly confirmed': n, Confirmed: n } households. */
  async censusHouseholdProgressCounts(cycleId) {
    const { data, error } = await supabase.rpc('census_household_progress', { p_cycle_id: cycleId }).select('progress');
    if (error) throw mapError(error);
    const counts = { 'Not started': 0, 'Partly confirmed': 0, Confirmed: 0 };
    for (const r of data) counts[r.progress] = (counts[r.progress] || 0) + 1;
    return counts;
  },

  /** census_summary() rows: { gkk, status, members }. */
  async censusSummary(cycleId) {
    const { data, error } = await supabase.rpc('census_summary', { p_cycle_id: cycleId });
    if (error) throw mapError(error);
    return data || [];
  },

  /**
   * A household with each member's answer in this census (`census`) and in
   * the census before it (`previous`), for the census entry panel.
   */
  async getHouseholdCensus(cycleId, householdId) {
    const { household, members } = await api.getHousehold(householdId);
    const { data, error } = await supabase
      .from('census_member_responses')
      .select('*, census_cycles(label)')
      .in('member_id', members.map((m) => m.id))
      .order('cycle_id', { ascending: false });
    if (error) throw mapError(error);
    for (const m of members) {
      const mine = data.filter((r) => r.member_id === m.id);
      m.census = mine.find((r) => r.cycle_id === cycleId) || null;
      m.previous = mine.find((r) => r.cycle_id < cycleId) || null;
    }
    return { household, members };
  },

  /**
   * Save a household's census answers. `rows` is [{ memberId, status,
   * participation, notes }]; members without a status are left unconfirmed.
   */
  async recordHouseholdCensus(cycleId, householdId, { rows, source, participation, helpWays }) {
    const { data, error } = await supabase.rpc('census_record_household', {
      p_cycle_id: cycleId,
      p_household_id: householdId,
      p_responses: censusResponsesPayload(rows),
      p_source: source,
      p_household_participation: participation || null,
      p_help_ways: helpWays || null,
    });
    if (error) throw mapError(error);
    return { saved: data };
  },

  async clearMemberCensus(cycleId, memberId) {
    const { error } = await supabase.rpc('census_clear_member', { p_cycle_id: cycleId, p_member_id: memberId });
    if (error) throw mapError(error);
    return null;
  },

  /** Online updates families sent in this census (Pending by default). */
  async listCensusSubmissions(cycleId, status = 'Pending') {
    const { data, error } = await supabase
      .from('census_submissions')
      .select('*, households(household_name, ref_no, gkk)')
      .eq('cycle_id', cycleId)
      .eq('status', status)
      .order('submitted_at', { ascending: true });
    if (error) throw mapError(error);
    return data;
  },

  async approveCensusSubmission(id) {
    const { data, error } = await supabase.rpc('census_approve_submission', { p_id: id });
    if (error) throw mapError(error);
    return { saved: data };
  },

  async rejectCensusSubmission(id, note) {
    const { error } = await supabase.rpc('census_reject_submission', { p_id: id, p_note: note || null });
    if (error) throw mapError(error);
    return null;
  },

  /** { [householdId]: 'XXXXXXXX' }, issuing codes to households that have none. */
  async censusAccessCodes(householdIds) {
    const { data, error } = await supabase.rpc('census_access_codes', { p_household_ids: householdIds });
    if (error) throw mapError(error);
    return Object.fromEntries((data || []).map((r) => [r.household_id, r.code]));
  },

  async resetAccessCode(householdId) {
    const { data, error } = await supabase.rpc('census_reset_access_code', { p_household_id: householdId });
    if (error) throw mapError(error);
    return data;
  },

  /** One member's answers across every census, newest first. */
  async memberCensusHistory(memberId) {
    const { data, error } = await supabase
      .from('census_member_responses')
      .select('*, census_cycles(label, status)')
      .eq('member_id', memberId)
      .order('cycle_id', { ascending: false });
    if (error) throw mapError(error);
    return data;
  },

  /**
   * Households and their current members for the printed census form —
   * either one GKK ('None' = households without one) or the given ids.
   */
  async censusPrintData({ gkk, householdIds }) {
    let hq = supabase.from('households').select('*').order('household_name');
    let mq = supabase.from('members_with_household').select('*').eq('is_current', true).order('id');
    if (householdIds) {
      hq = hq.in('id', householdIds);
      mq = mq.in('household_id', householdIds);
    } else if (gkk === 'None') {
      hq = hq.is('gkk', null);
      mq = mq.is('household_gkk', null);
    } else {
      hq = hq.eq('gkk', gkk);
      mq = mq.eq('household_gkk', gkk);
    }
    const [{ data: households, error: hErr }, { data: members, error: mErr }] = await Promise.all([hq, mq]);
    if (hErr) throw mapError(hErr);
    if (mErr) throw mapError(mErr);
    // Online access codes (0008). Without that migration the forms print without them.
    const codes = await api.censusAccessCodes(households.map((h) => h.id)).catch(() => ({}));
    return households.map((h) => ({ household: h, code: codes[h.id] || null, members: members.filter((m) => m.household_id === h.id) }));
  },

  // ---- dashboard ---------------------------------------------------------
  async dashboardStats() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const { data, error } = await supabase.rpc('admin_dashboard_stats', { p_tz: tz });
    if (error) throw mapError(error);
    return shapeDashboard(data);
  },

  // ---- reports -------------------------------------------------------
  async reportStats() {
    const { data, error } = await supabase.rpc('admin_report_stats');
    if (error) throw mapError(error);
    return shapeReport(data);
  },

  async reportSources() {
    const types = {
      Members: { types: ['By GKK', 'By Sacrament', 'By Ministry / Organization'] },
      Households: { types: ['By Status', 'By GKK'] },
    };
    return { sources: Object.keys(types), types };
  },

  async generateReport({ source, type, gkk = 'All', status = 'All', dateFrom, dateTo, sacrament, group }) {
    if (source === 'Members') {
      let list = await fetchAll(() => supabase.from('members_with_household').select('*').eq('is_current', true).order('household_name').order('id'));
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
        cells: [memberFullName(m), m.household_name, m.household_gkk || '—', m.age ?? '—', bis(RELATIONSHIP_LABELS, m.relationship) || '—', m.contact || '—'],
      }));
      return { title: `Members — ${type}`, meta: `${rowsOut.length} member(s)`, columns, rows: rowsOut, empty: rowsOut.length === 0, csvColumns: columns };
    }

    if (source === 'Households') {
      let list = await fetchAll(() => supabase.from('households').select('*').order('household_name').order('id'));
      if (gkk && gkk !== 'All') list = list.filter((h) => h.gkk === gkk);
      if (type === 'By Status' && status && status !== 'All') list = list.filter((h) => h.status === status);
      if (dateFrom || dateTo) list = list.filter((h) => inDateRange(h.created_at, dateFrom, dateTo));
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

const OFFICE_TEXT_FIELDS = ['mobile', 'facebook_url', 'sick_call_contact', 'directions', 'map_url'];

const WEBSITE_TABLES = ['mass_schedules', 'sacrament_guides', 'announcements', 'bulletins', 'events', 'articles'];

const GKK_DETAIL_FIELDS = ['puroks', 'meeting_schedule', 'meeting_place', 'coordinator_name', 'coordinator_mobile', 'coordinator_public', 'coordinator_consent_on'];

async function listWebsite(table, order, migration = '0011_website_content.sql') {
  const { data, error } = await order(supabase.from(table).select('*'));
  if (error) {
    // Before the migration is run the table (or column) doesn't exist; say which file fixes it.
    if (['42P01', 'PGRST205', '42703'].includes(error.code)) throw new Error(`Run the ${migration} migration in Supabase to use this page`);
    throw mapError(error);
  }
  return { rows: data || [] };
}

/** Today as YYYY-MM-DD on the visitor's clock (the parish is in one time zone). */
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Published rows of a website content table, for the public site. */
async function listPublished(table, order) {
  const { data, error } = await order(supabase.from(table).select('*').eq('published', true));
  if (error) throw mapError(error);
  return data || [];
}

/** Insert a row (no id) or update it (with id). Blank strings save as null. */
async function saveWebsiteRow(table, row, dupLabel) {
  const { id, created_at: _c, updated_at: _u, ...fields } = row;
  const patch = cleanPatch(fields);
  const q = id ? supabase.from(table).update(patch).eq('id', id) : supabase.from(table).insert(patch);
  const { data, error } = await q.select().single();
  if (error) throw mapError(error, { dupLabel });
  return data;
}

async function deleteWebsiteRow(table, id) {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw mapError(error);
}

const REQUEST_TABLES = ['certificate_requests', 'prayer_requests', 'blood_requests', 'blood_donors'];

// The columns staff may set on each request table. Ref numbers, who handled
// it and the timestamps are filled in by the database.
const CERT_FIELDS = [
  'cert_type', 'status', 'source', 'subject_first_name', 'subject_middle_name', 'subject_last_name', 'subject_birth_date',
  'sacrament_date', 'sacrament_year', 'sacrament_place', 'father_name', 'mother_name', 'spouse_name', 'purpose', 'copies',
  'requester_name', 'requester_mobile', 'requester_email', 'relationship', 'message',
  'member_id', 'fee', 'or_number', 'released_to', 'public_note', 'staff_notes',
];
const PRAYER_FIELDS = [
  'intention_type', 'intention', 'for_name', 'requester_name', 'requester_mobile', 'allow_public', 'show_publicly',
  'status', 'source', 'offered_on', 'staff_notes',
];
const BLOOD_REQUEST_FIELDS = [
  'patient_name', 'blood_type', 'units', 'hospital', 'needed_by', 'contact_name', 'contact_mobile', 'relationship', 'notes',
  'allow_public', 'show_publicly', 'status', 'source', 'staff_notes',
];
const DONOR_FIELDS = ['full_name', 'mobile', 'blood_type', 'gkk', 'member_id', 'last_donated_on', 'source', 'opted_out_at', 'notes'];

function requestsError(error) {
  // Before 0012 is run the tables don't exist; say which file fixes it.
  if (error.code === '42P01' || error.code === 'PGRST205') return new Error('Run the 0012_requests.sql migration in Supabase to use this page');
  return mapError(error);
}

async function publicRpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw mapError(error);
  return data;
}

/** Every row of a request table, paged past Supabase's 1,000-row cap. */
async function listRequests(table, select = '*', order = (q) => q.order('created_at', { ascending: false })) {
  const { data, error } = await fetchAllPages((from, to) => order(supabase.from(table).select(select)).order('id', { ascending: false }).range(from, to));
  if (error) throw requestsError(error);
  return { rows: data || [] };
}

/** Insert (no id) or update (with id) the allowed fields of a request row. Blank strings save as null. */
async function saveRequestRow(table, row, fields, dupLabel) {
  const patch = cleanPatch(Object.fromEntries(fields.filter((f) => f in row).map((f) => [f, typeof row[f] === 'string' ? row[f].trim() : row[f]])));
  const q = row.id ? supabase.from(table).update(patch).eq('id', row.id) : supabase.from(table).insert(patch);
  const { data, error } = await q.select(table === 'certificate_requests' ? '*, member:members(*)' : '*').single();
  if (error) throw mapError(error, { dupLabel });
  return data;
}

const GROUP_COLUMNS = ['ministries', 'organizations'];

/**
 * The member-list filters shared by listMembers and memberCountsByGkk, so a
 * list and its group counts always agree. `q` is a members_with_household query.
 */
function applyMemberFilters(q, params = {}) {
  const {
    status = 'All', civil = 'All', sacrament = 'All', ministry = 'All',
    age = 'All', blood = 'All', gkk = 'All', search = '',
    baptism = 'All', communion = 'All', confirmation = 'All', matrimony = 'All',
    // Moved away / deceased members drop out of every list unless asked for.
    membership = 'Current', census = 'All',
    groupColumn,
    // 'Any' = members holding any Responsibility in Parish; otherwise one position.
    parishRole = 'All',
  } = params;
  const SACRAMENT_COLUMNS = { Baptism: 'has_baptism', Communion: 'has_communion', Confirmation: 'has_confirmation', Matrimony: 'has_matrimony' };

  if (status !== 'All') q = q.eq('household_status', status);
  if (membership === 'Current') q = q.eq('is_current', true);
  else if (membership === 'Not assessed') q = q.is('membership_status', null);
  else if (MEMBERSHIP_STATUSES.includes(membership)) q = q.eq('membership_status', membership);
  if (census === 'Confirmed') q = q.eq('census_confirmed', true);
  else if (census === 'Not confirmed') q = q.eq('census_confirmed', false);
  if (civil !== 'All') q = q.eq('civil_status', civil);
  if (gkk !== 'All') q = q.eq('household_gkk', gkk);
  if (sacrament !== 'All' && SACRAMENT_COLUMNS[sacrament]) q = q.eq(SACRAMENT_COLUMNS[sacrament], true);

  // Per-sacrament filters: Yes (claimed) / No / Unverified (claimed, not yet
  // checked by staff) / Verified. The *_verified flags come from the view.
  for (const [key, value] of Object.entries({ baptism, communion, confirmation, matrimony })) {
    if (value === 'All') continue;
    const col = SACRAMENT_COLUMNS[key[0].toUpperCase() + key.slice(1)];
    if (!col) continue;
    if (value === 'Verified') q = q.eq(`${key}_verified`, true);
    else if (value === 'Unverified') q = q.eq(col, true).eq(`${key}_verified`, false);
    else q = q.eq(col, value === 'Yes');
  }

  if (ministry !== 'All' && GROUP_COLUMNS.includes(groupColumn)) {
    q = q.contains(groupColumn, [ministry]);
  } else if (ministry !== 'All') {
    const escaped = String(ministry).replace(/"/g, '\\"');
    q = q.or(`ministries.cs.{"${escaped}"},organizations.cs.{"${escaped}"}`);
  }

  if (parishRole === 'Any') q = q.not('parish_role', 'is', null);
  else if (parishRole !== 'All') q = q.eq('parish_role', parishRole);

  // 'Recorded' = any blood type on file; 'Unknown' = none on file.
  if (blood !== 'All') {
    if (blood === 'Unknown') q = q.is('blood_type', null);
    else if (blood === 'Recorded') q = q.not('blood_type', 'is', null);
    else q = q.eq('blood_type', blood);
  }

  const ageRange = age !== 'All' && parseAgeRange(age);
  if (ageRange) {
    const [lo, hi] = ageRange;
    q = q.not('age', 'is', null).gte('age', lo).lte('age', hi);
  }

  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`full_name.ilike.${s},household_name.ilike.${s},contact.ilike.${s}`);
  }
  return q;
}

async function changeGroupMembership(memberId, column, name, join) {
  if (!GROUP_COLUMNS.includes(column)) throw new Error(`Unknown group column: ${column}`);
  const { data, error } = await supabase.from('members').select(column).eq('id', memberId).single();
  if (error) throw mapError(error, { fallback: 'Member not found' });
  const current = data[column] || [];
  const next = join ? [...new Set([...current, name])] : current.filter((n) => n !== name);
  if (next.length === current.length && next.every((n, i) => n === current[i])) return { unchanged: true };
  return api.updateMember(memberId, { [column]: next });
}

/**
 * Call the manage-staff Edge Function and turn its failures into readable
 * messages: the function's own `{ error }` text, or a setup hint when it
 * hasn't been deployed yet.
 */
async function callStaffFunction(body) {
  const { data, error } = await supabase.functions.invoke('manage-staff', { body });
  if (!error) return data;
  const res = error.context;
  const payload = res && typeof res.json === 'function' ? await res.json().catch(() => null) : null;
  if (payload?.error) throw new Error(payload.error);
  if (res?.status === 404 || error.name === 'FunctionsFetchError') {
    throw new Error('Staff management isn’t set up yet: deploy the manage-staff Edge Function (see the README).');
  }
  throw new Error(error.message || 'Request failed');
}

async function listGroup(table, opts) {
  const gkk = opts && typeof opts === 'object' ? opts.gkk : undefined;
  const scoped = typeof gkk === 'string' && gkk && gkk !== 'All';
  return { rows: await listCounts(table, scoped ? gkk : null) };
}

/** [{ name, count }] for one staff-managed list, counted in the database (admin_list_counts). */
async function listCounts(list, gkk = null) {
  const { data, error } = await supabase.rpc('admin_list_counts', { p_list: list, p_gkk: gkk });
  if (error) throw mapError(error);
  return (data || []).map((r) => ({ name: r.name, count: r.n }));
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

const MEMBER_CSV_COLUMNS = [
  { label: 'First Name', value: 'first_name' },
  { label: 'Middle Name', value: 'middle_name' },
  { label: 'Last Name', value: 'last_name' },
  { label: 'Suffix', value: 'suffix' },
  { label: 'Household', value: 'household_name' },
  { label: 'Relationship', value: (r) => bis(RELATIONSHIP_LABELS, r.relationship) },
  { label: 'Sex', value: (r) => bis(SEX_LABELS, r.sex) },
  { label: 'Date of Birth', value: 'dob' },
  { label: 'Age', value: (r) => r.age ?? '' },
  { label: 'Place of Birth', value: 'place_of_birth' },
  { label: 'Tribe', value: 'tribe' },
  { label: 'Civil Status', value: (r) => bis(CIVIL_STATUS_LABELS, r.civil_status) },
  { label: 'Contact', value: 'contact' },
  { label: 'Email', value: 'email' },
  { label: 'Occupation', value: 'occupation' },
  { label: 'Blood Type', value: 'blood_type' },
  { label: 'GKK', value: 'household_gkk' },
  { label: 'Baptism', value: (r) => (r.has_baptism ? 'Yes' : 'No') },
  { label: 'First Communion', value: (r) => (r.has_communion ? 'Yes' : 'No') },
  { label: 'Confirmation', value: (r) => (r.has_confirmation ? 'Yes' : 'No') },
  { label: 'Matrimony', value: (r) => (r.has_matrimony ? 'Yes' : 'No') },
  { label: 'Wedding Type', value: (r) => bis(WEDDING_TYPE_LABELS, r.mat_type) },
  ...SACRAMENTS.map((s) => ({ label: `${s.label} Verified`, value: (r) => (r[`${s.key}_verified`] ? 'Yes' : 'No') })),
  { label: 'GKK Responsibility', value: 'gkk_role' },
  { label: 'Parish Responsibility', value: 'parish_role' },
  { label: 'Ministries', value: (r) => (r.ministries || []).join('; ') },
  { label: 'Organizations', value: (r) => (r.organizations || []).join('; ') },
  { label: 'Membership Status', value: (r) => r.membership_status || 'Not assessed' },
  { label: 'Last Census', value: 'last_census_label' },
];

const HOUSEHOLD_CSV_COLUMNS = [
  { label: 'Household Name', value: 'household_name' },
  { label: 'Head', value: 'head_name' },
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
  ...PARTICIPATION_ITEMS.map(([key, label]) => ({ label, value: (r) => (r.participation || {})[key] || '' })),
  { label: 'Ways to Help', value: (r) => (r.help_ways || []).map((k) => (HELP_WAYS.find(([hk]) => hk === k) || [k, k])[1]).join('; ') },
  { label: 'Registered', value: (r) => new Date(r.created_at).toISOString().slice(0, 10) },
];

const BLOOD_CSV_COLUMNS = [
  { label: 'Name', value: (r) => `${r.first_name} ${r.last_name}` },
  { label: 'Blood Type', value: 'blood_type' },
  { label: 'Age', value: (r) => r.age ?? '' },
  { label: 'GKK', value: 'household_gkk' },
  { label: 'Household', value: 'household_name' },
  { label: 'Contact', value: 'contact' },
];

const HOUSEHOLD_SORTS = { registered: 'created_at', name: 'household_name', gkk: 'gkk', members: 'member_count', updated: 'updated_at' };

/** listHouseholds' filters and sort, on a households_with_count query. */
function householdQuery(q, { status = 'All', gkk = 'All', search = '', ids, sortKey = 'registered', sortDir } = {}) {
  if (status !== 'All') q = q.eq('status', status);
  if (gkk !== 'All') q = q.eq('gkk', gkk);
  if (ids) q = q.in('id', ids);
  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    q = q.or(`household_name.ilike.${s},head_name.ilike.${s},street.ilike.${s},barangay.ilike.${s},city.ilike.${s},contact.ilike.${s},ref_no.ilike.${s}`);
  }
  const col = HOUSEHOLD_SORTS[sortKey] || HOUSEHOLD_SORTS.registered;
  // Dates read newest first unless asked otherwise; names and counts A→Z / low→high.
  const ascending = sortDir ? sortDir === 'asc' : !['created_at', 'updated_at'].includes(col);
  q = q.order(col, { ascending, nullsFirst: false });
  if (col !== 'household_name') q = q.order('household_name', { ascending: true });
  return q.order('id', { ascending: true });
}

/** Build and download one of the CSV exports. Rejects if the data can't be read. */
export async function downloadWithAuth(path, filename) {
  if (path === '/exports/members.csv') {
    await api.exportMembersCsv({ membership: 'All' }, filename);
  } else if (path === '/exports/households.csv') {
    await api.exportHouseholdsCsv({}, filename);
  } else if (path === '/exports/blood.csv') {
    const data = await fetchAll(() => supabase.from('members_with_household').select('*').not('blood_type', 'is', null).eq('is_current', true).order('blood_type').order('id'));
    downloadCsv(filename, data, BLOOD_CSV_COLUMNS);
  } else {
    throw new Error(`Unknown export: ${path}`);
  }
}

export { triggerDownload } from './lib/csv.js';
