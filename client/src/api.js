// Talks directly to Supabase (Postgres + RLS) instead of the old Express
// API. Every exported function keeps the exact name/argument/return shape
// the admin pages and the public registration wizard already call, so this
// file is the only thing that changed for the Supabase migration.
import { supabase } from './lib/supabaseClient.js';
import { PARTICIPATION_ITEMS, HELP_WAYS, SACRAMENTS, BLOOD_TYPES, parseAgeRange } from './constants.js';
import { familiesOf, familyHeadName, familyTitle, familyBadges } from './lib/household.js';
import { memberFullName, inDateRange, plainLetters } from './lib/util.js';
import { bis, RELATIONSHIP_LABELS, SEX_LABELS, CIVIL_STATUS_LABELS, WEDDING_TYPE_LABELS } from './lib/bisaya.js';
import { toCsv, downloadCsv } from './lib/csv.js';
import { fetchAllPages } from './lib/paging.js';
import { shapeDashboard, shapeReport } from './lib/stats.js';
import { MEMBERSHIP_STATUSES, cleanParticipation, censusResponsesPayload, summarizeCensus, countLastYearList, normalizeSiteUrl, censusVsLastYearFrom, censusBaselineMode, previousCensus, vsLastYearTable, vsLastYearBaseline, unnamedNotYet, YOUNG_CHILD_MAX_AGE } from './lib/census.js';
import {
  sacramentProgressRows, turnaroundRows, registrationsByMonth, monthName, familiesByGkkRows, personName, SACRAMENT_MIN_AGE, missingSacrament,
  candidatesByGkk, churchWeddingCandidates, unbaptizedChildren, sacramentsByYear, AGE_GROUPS, inAgeGroup, ageSexRows, breakdownRows, celebrationsInMonth, statusChanges,
  waitingForVerification, helpWayLabel, volunteerPool, verificationsByStaff, groupMakeupRows, busyMembers, gkkOfficerRows, parishRoleRows,
  requestOutcomeRows, feesByMonth, byGkk, peso, missingDetails, dataQualityByGkk, householdProblems, censusComparisonRows,
} from './lib/reports.js';
import { certTypeLabel, sacramentRequestLabel, SACRAMENT_REQUEST_OPEN, BLOOD_OPEN } from './lib/requests.js';
import { addDays, ANNOUNCEMENT_DAYS } from './lib/website.js';
import { MEN_ONLY_FALLBACK, menOnlyBlocked, menOnlyMessage } from './lib/ministries.js';
import { resizePhotoBlob } from './lib/images.js';
import { gkkDocumentPath, gkkDocumentType } from './lib/gkkDocuments.js';

const MAX_PAGE_SIZE = 100;

function clampPaging({ page, pageSize } = {}) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const size = Math.min(Math.max(1, parseInt(pageSize, 10) || 10), MAX_PAGE_SIZE);
  return { page: p, pageSize: size, from: (p - 1) * size, to: (p - 1) * size + size - 1 };
}

function mapError(error, { fallback = 'Request failed', dupLabel } = {}) {
  if (!error) return new Error(fallback);
  if (error.code === '23505' && dupLabel) return new Error(`${dupLabel} already exists`);
  // A household's GKK must be in the GKK list (0064).
  if (error.code === '23503' && /households_gkk_fkey/.test(error.message || '')) return new Error('Please select a GKK from the list');
  // The staff functions found no profile for this signed-in account (0020 adds the missing ones).
  if (/^Only parish staff can/.test(error.message || '')) {
    return new Error(`${error.message}. This account has no staff profile yet: run the 00201_staff_profiles.sql migration in Supabase, then sign in again.`);
  }
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

/** A function a migration adds isn't there yet: say which file to run, or null for any other error. */
function missingMigration(error, file) {
  return isMissingFunction(error) ? new Error(`Run the ${file} migration in Supabase to use this`) : null;
}

/** Before 0041 the list's table doesn't exist; say which file adds it. */
function lastYearMissing(error) {
  if (['42P01', 'PGRST205'].includes(error?.code) || /census_last_year_list/.test(error?.message || '') && /does not exist|schema cache/.test(error?.message || '')) {
    return new Error("Run the 0041_census_last_year_list.sql migration in Supabase to use last year's list");
  }
  return error instanceof Error && !error.code ? error : mapError(error);
}

/** A missing table is a migration that hasn't been run; say which one. */
function migrationError(error, table) {
  if (error?.code === '42P01' || error?.code === 'PGRST205') return new Error(`Run the 0014_roles_activity_trash.sql migration in Supabase to use this page (${table} is missing)`);
  return mapError(error);
}

const isMissingTable = (error) => ['42P01', 'PGRST205'].includes(error?.code);

/**
 * Blood types (member_blood_types, 0062) onto rows read from the members
 * table, which no longer has them. A GKK leader reads none. Before 0062 the
 * rows still carry their own.
 */
async function attachBloodTypes(members) {
  if (!members?.length) return;
  const { data, error } = await supabase.from('member_blood_types').select('member_id, blood_type').in('member_id', members.map((m) => m.id));
  if (error) return;
  const byId = new Map(data.map((b) => [b.member_id, b.blood_type]));
  for (const m of members) m.blood_type = byId.get(m.id) || null;
}

/** Save or clear a member's blood type; false before 0062 (the column is still on members). */
async function saveMemberBloodType(memberId, value) {
  const blood = String(value || '').trim();
  const { error } = blood
    ? await supabase.from('member_blood_types').upsert({ member_id: memberId, blood_type: blood }, { onConflict: 'member_id' })
    : await supabase.from('member_blood_types').delete().eq('member_id', memberId);
  if (isMissingTable(error)) return false;
  if (error) throw mapError(error);
  return true;
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
    return data; // { refNo, householdId, accessCode } (accessCode from 0040)
  },

  // ---- another family joins a registered house (0054 migration) --------
  /** { ok, householdName, refNo, gkk, families } or { ok: false, error: 'invalid' | 'locked' }. */
  async familyJoinCheck(refNo, code) {
    const { data, error } = await supabase.rpc('family_join_check', { p_ref: refNo, p_code: code });
    if (error) throw mapError(error);
    return data;
  },
  /** { ok, refNo, householdName, familyNo } or { ok: false, error }. */
  async submitFamilyRegistration({ refNo, code, members, consent }) {
    const { data, error } = await supabase.rpc('submit_family_registration', {
      p_ref: refNo, p_code: code, payload: { members, consent },
    });
    if (error) throw mapError(error);
    return data;
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
    return data; // { gkks, households } (+ members, ministries, organizations, oldest_gkk_year after 0019)
  },

  /** The logo uploaded in Parish Config (a data URL), or null if there isn't one. */
  async publicParishLogo() {
    const { data, error } = await supabase.rpc('public_parish_logo');
    if (error) throw mapError(error);
    return data || null;
  },

  /** The parish photo for the home page hero (an R2 link, or an inline data URL saved before), or null. Needs 0020. */
  async publicParishHeroImage() {
    const { data, error } = await supabase.rpc('public_parish_hero_image');
    if (error) return null;
    return data || null;
  },

  /** The parish's default color theme (Parish Config → Appearance), or null. Needs 0014. */
  async publicParishTheme() {
    const { data, error } = await supabase.rpc('public_parish_theme');
    if (error) return null;
    return data || null;
  },

  /**
   * { on, message, parish } for the public site's maintenance notice (0049).
   * Before that migration (or on any error) the site stays open.
   */
  async publicMaintenance() {
    const { data, error } = await supabase.rpc('public_maintenance');
    if (error || !data) return { on: false, message: null, parish: '' };
    return data;
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
    // Also clears the "change your password" flag an admin sets on a new or
    // reset account (manage-staff), in the same update.
    const { error } = await supabase.auth.updateUser({ password: newPassword, data: { must_change_password: false } });
    if (error) throw mapError(error);
    return { ok: true };
  },

  // ---- households --------------------------------------------------------
  /**
   * One page of households. Filters: status, gkk, search, ids. Sort:
   * sortKey 'registered' (newest first by default), 'name', 'gkk',
   * 'members' or 'updated', with sortDir 'asc' / 'desc'.
   */
  /**
   * Households for the admin list. A search also matches members' names; such
   * rows carry `matched_members` (the members whose name matched).
   */
  async listHouseholds(params = {}) {
    const { page, pageSize, from, to } = clampPaging(params);
    const { params: query, matches } = await withMemberMatches(params);
    const q = householdQuery(supabase.from('households_with_count').select('*', { count: 'exact' }), query).range(from, to);
    const { data, error, count } = await q;
    if (error) throw mapError(error);
    const rows = matches ? data.map((h) => (matches.byHousehold.has(h.id) ? { ...h, matched_members: matches.byHousehold.get(h.id) } : h)) : data;
    return { rows, total: count, page, pageSize };
  },

  /**
   * { Pending, Verified } households under listHouseholds-style filters (not
   * status), for the Households tabs. Count-only, with the member-name search
   * run once for both.
   */
  async householdStatusCounts(params = {}) {
    const { params: query } = await withMemberMatches(params);
    const count = async (status) => {
      const { count: n, error } = await householdQuery(supabase.from('households').select('id', { count: 'exact', head: true }), { ...query, status });
      if (error) throw mapError(error);
      return n || 0;
    };
    const [Pending, Verified] = await Promise.all([count('Pending'), count('Verified')]);
    return { Pending, Verified };
  },

  async getHousehold(id) {
    const { data: household, error } = await supabase.from('households').select('*').eq('id', id).single();
    if (error) throw mapError(error, { fallback: 'Household not found' });
    const { data: members, error: mErr } = await supabase.from('members').select('*').eq('household_id', id).order('id');
    if (mErr) throw mapError(mErr);
    await attachBloodTypes(members);
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
    const { params: query } = await withMemberMatches(params);
    const data = await fetchAll(() => householdQuery(supabase.from('households_with_count').select('*'), { sortKey: 'name', ...query }));
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

  /** The Blood Types page's list as it is filtered (GKK, age, blood type, search), for the blood directory CSV. */
  async exportBloodCsv(params, filename = 'blood-directory.csv') {
    const data = await fetchAll(() => applyMemberFilters(supabase.from('members_with_household').select('*'), params)
      .order('blood_type', { nullsFirst: false }).order('id'));
    downloadCsv(filename, data, BLOOD_CSV_COLUMNS);
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
        family_no: member.familyNo || 1,
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
    const sortCol = { name: 'first_name', household: 'household_name', age: 'age', status: 'household_status', blood: 'blood_type', practice: 'practice_score' }[sortKey] || 'first_name';
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
    // Filtering or sorting on the status before 0017 is run: say which file adds it.
    if (error && /practice_/.test(error.message || '')) throw new Error('Run the 0017_practicing_status.sql migration in Supabase to use the Practicing Catholic status');
    if (error) throw mapError(error);
    return { rows: data, total: count, page, pageSize };
  },

  /**
   * The families of these households, for the Members list's family badges:
   * familyBadges() of their current members (as family_stats counts them),
   * only for households with two or more families. One small query per page.
   */
  async memberFamilyBadges(householdIds) {
    const ids = [...new Set(householdIds)].filter(Boolean);
    if (!ids.length) return new Map();
    const { data, error } = await supabase
      .from('members_with_household')
      .select('household_id, family_no, relationship, first_name, last_name, suffix')
      .in('household_id', ids)
      .eq('is_current', true)
      .order('id');
    if (error) throw mapError(error);
    return familyBadges(data);
  },

  /**
   * How many members match `params` in each GKK: { 'GKK San Isidro': 12, …,
   * null: 3 } (null = households with no GKK). Uses count-only queries per
   * GKK, so totals are exact however many members there are.
   */
  async memberCountsByGkk(params = {}) {
    // The GKKs this account sees: a GKK leader's own only (0050).
    const gkks = await listCounts('gkks');
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
    const { blood_type: blood, ...fields } = patch;
    let bloodSaved = false;
    if ('blood_type' in patch) {
      // Blood types have their own table (0062) that GKK leaders can't reach;
      // before that migration they're still a member column.
      bloodSaved = await saveMemberBloodType(id, blood);
      if (!bloodSaved) fields.blood_type = blood;
    }
    let member = { id };
    if (Object.keys(fields).length) {
      const { data, error } = await supabase.from('members').update(cleanPatch(fields)).eq('id', id).select().single();
      if (error) throw mapError(error, { fallback: 'Member not found' });
      member = data;
    }
    return { member: bloodSaved ? { ...member, blood_type: (blood || '').trim() || null } : member };
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
  async listActivity({ householdId, memberId, table, tables, actor, search, page = 1, pageSize = 20 } = {}) {
    const p = clampPaging({ page, pageSize });
    let q = supabase.from('activity_log').select('*', { count: 'exact' });
    if (householdId) q = q.eq('household_id', householdId);
    if (memberId) q = q.eq('member_id', memberId);
    if (tables?.length) q = q.in('table_name', tables);
    else if (table && table !== 'All') q = q.eq('table_name', table);
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
      ['blood', 'blood_requests', 'id, ref_no, status, patient_name, blood_type',
        `ref_no.ilike.${like},patient_name.ilike.${like}`,
        (r) => `${r.patient_name} (${r.blood_type})`],
      ['sacraments', 'sacrament_requests', 'id, ref_no, status, person_name, sacrament',
        `ref_no.ilike.${like},person_name.ilike.${like},requester_name.ilike.${like}`,
        (r) => `${r.person_name} (${r.sacrament === 'ocia' ? 'OCIA' : 'Anointing'})`],
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

  // ---- staff notifications (0034) -----------------------------------
  /**
   * The latest notifications this account may see, and its own settings
   * (when the bell was last opened, what goes to its devices). null before
   * the 0034 migration, so the bell stays hidden.
   */
  async listNotifications(limit = 30) {
    const [list, prefs] = await Promise.all([
      supabase.from('staff_notifications')
        .select('id, kind, area, ref_no, title, detail, link, urgent, created_at')
        .order('created_at', { ascending: false }).limit(limit),
      supabase.from('staff_notify_prefs').select('seen_at, push_level, digest').maybeSingle(),
    ]);
    if (list.error) {
      if (list.error.code === '42P01' || list.error.code === 'PGRST205') return null;
      throw mapError(list.error);
    }
    return { items: list.data || [], prefs: prefs.data || { seen_at: null, push_level: 'requests', digest: true } };
  },

  /** Opening the bell: everything so far is seen. Returns the database's time. */
  async markNotificationsSeen() {
    const { data, error } = await supabase.rpc('mark_staff_notifications_seen');
    if (error) throw mapError(error);
    return data;
  },

  async saveNotifyPrefs(patch) {
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from('staff_notify_prefs')
      .upsert({ user_id: session?.user?.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    if (error) throw mapError(error);
    return null;
  },

  /** Calls `onNew(row)` for each new notification this account may see. Returns the unsubscribe. */
  subscribeNotifications(onNew) {
    const channel = supabase.channel(`staff-notifications-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_notifications' }, (msg) => onNew(msg.new))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  },

  /** The push key the browser subscribes with (made on first use by the notify-staff function). */
  async pushPublicKey() {
    const data = await callNotifyFunction({ action: 'setup', site: window.location.origin });
    return data.publicKey;
  },

  async savePushSubscription(subscription, device) {
    const json = subscription.toJSON();
    const { error } = await supabase.rpc('save_push_subscription', {
      p_endpoint: json.endpoint, p_p256dh: json.keys?.p256dh, p_auth: json.keys?.auth, p_device: device,
    });
    if (error) throw mapError(error);
    return null;
  },

  async listMyPushDevices() {
    const { data, error } = await supabase.from('staff_push_subscriptions')
      .select('id, endpoint, device, created_at, last_ok_at').order('created_at');
    if (error) throw mapError(error);
    return data || [];
  },

  async removePushDevice({ id, endpoint }) {
    const q = supabase.from('staff_push_subscriptions').delete();
    const { error } = await (id ? q.eq('id', id) : q.eq('endpoint', endpoint));
    if (error) throw mapError(error);
    return null;
  },

  /** A test notification to this device (`endpoint`), or to all of this account's. */
  async sendTestPush(endpoint) {
    return callNotifyFunction({ action: 'test', endpoint: endpoint || undefined });
  },

  // ---- sacrament verification (admin) --------------------------------
  /** Staff verifications for one member, keyed by sacrament ('baptism', …). */
  async getSacramentVerifications(memberId) {
    const { data, error } = await supabase.from('sacrament_verifications').select('*').eq('member_id', memberId);
    if (error) throw mapError(error);
    return Object.fromEntries((data || []).map((v) => [v.sacrament, v]));
  },

  // ---- service history (0071) ----------------------------------------
  /** A member's past service, or null before the 0071 migration adds the table. */
  async listMemberService(memberId) {
    const { data, error } = await supabase.from('member_service').select('*').eq('member_id', memberId);
    if (isMissingTable(error)) return null;
    if (error) throw mapError(error);
    return data;
  },

  async addMemberService(row) {
    const { data, error } = await supabase.from('member_service').insert(row).select().single();
    if (error) throw mapError(error);
    return data;
  },

  async updateMemberService(id, patch) {
    const { data, error } = await supabase.from('member_service').update(patch).eq('id', id).select().single();
    if (error) throw mapError(error);
    return data;
  },

  async deleteMemberService(id) {
    const { error } = await supabase.from('member_service').delete().eq('id', id);
    if (error) throw mapError(error);
    return null;
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
    // A GKK leader's GKK goes by its id (0063).
    create: ({ name, email, role, isAdmin, access, accessGkkId, password }) => callStaffFunction({ action: 'create', name, email, role, is_admin: !!isAdmin, access, access_gkk_id: accessGkkId, password }),
    update: (id, { name, role, isAdmin, access, accessGkkId }) => callStaffFunction({ action: 'update', id, name, role, is_admin: !!isAdmin, access, access_gkk_id: accessGkkId }),
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

  /** Groups marked "Not duplicates", newest first, each with its members' names: [{ member_ids, members, dismissed_by_name, dismissed_at }]. */
  async listDismissedDuplicates() {
    const { data, error } = await supabase.from('duplicate_dismissals').select('*').order('dismissed_at', { ascending: false });
    if (error) throw mapError(error);
    const ids = [...new Set((data || []).flatMap((d) => d.member_ids))];
    if (!ids.length) return [];
    const { data: members, error: mErr } = await supabase.from('members_with_household')
      .select('id, first_name, middle_name, last_name, suffix, dob, household_name').in('id', ids);
    if (mErr) throw mapError(mErr);
    const byId = new Map((members || []).map((m) => [m.id, m]));
    // A group whose members have since been deleted has nothing left to show.
    return (data || []).map((d) => ({ ...d, members: d.member_ids.map((id) => byId.get(id)).filter(Boolean) }))
      .filter((d) => d.members.length > 1);
  },

  /** Take back "Not duplicates": the group shows on the Duplicates page again (0075). */
  async undismissDuplicateGroup(memberIds) {
    const { error } = await supabase.rpc('undismiss_duplicate_group', { p_member_ids: memberIds });
    if (error) throw missingMigration(error, '0075_duplicates_merge.sql') || mapError(error);
    return null;
  },

  /**
   * Merge `otherId` into `keepId` (two records of one person): the kept
   * record gets what it lacks, and the other goes to the Trash (0075).
   * Resolves to the trash entry's id.
   */
  async mergeMembers(keepId, otherId) {
    const { data, error } = await supabase.rpc('merge_members', { p_keep: keepId, p_other: otherId });
    if (error) throw missingMigration(error, '0075_duplicates_merge.sql') || mapError(error);
    return data;
  },

  // ---- ministry / organization membership (admin) -------------------
  addMemberToGroup: (memberId, column, name) => changeGroupMembership(memberId, column, name, true),
  removeMemberFromGroup: (memberId, column, name) => changeGroupMembership(memberId, column, name, false),

  // ---- GKKs ------------------------------------------------------------
  async listGkks() {
    return { rows: await listCounts('gkks') };
  },
  /** Every GKK's id and name, for choosing a GKK leader's GKK (0063). */
  async gkkChoices() {
    const { data, error } = await supabase.from('gkks').select('id, name').order('name');
    if (error) throw mapError(error);
    return data || [];
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
    // gkk_documents keeps a GKK that has documents (0044).
    if (error?.code === '23503' && /gkk_documents/.test(error.message || '')) throw new Error('This GKK still has documents (land titles and others). Delete them in its Documents tab first.');
    if (error) throw mapError(error);
    return null;
  },

  // ---- ministries / organizations (identical shape, different table) --
  listMinistries: (opts) => listGroup('ministries', opts),
  /** Names of the ministries only men may join (ministries.men_only, 0038), as a Set. */
  async menOnlyMinistries() {
    const { data, error } = await supabase.from('ministries').select('name, men_only');
    if (error) {
      // Before the 0038 migration there's no men_only column: Kaabag by name.
      if (error.code === '42703' || /men_only/.test(error.message || '')) return new Set(MEN_ONLY_FALLBACK);
      throw mapError(error);
    }
    return new Set((data || []).filter((r) => r.men_only).map((r) => r.name));
  },
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

  // ---- Organization Structure charts (0057) ----------------------------
  // Read by any staff account; changed (full access) only through the
  // functions, which check access and log to the activity log.
  /** Every chart, in tab order: [{ id, title, slug, scope, builtin, published, sort_order, updated_at }]. */
  async listOrgCharts() {
    const { data, error } = await supabase.from('org_charts').select('*').order('sort_order').order('id');
    if (orgMissing(error)) throw new Error(ORG_HINT);
    if (error) throw mapError(error);
    return data || [];
  },
  /** A chart's positions: org_nodes rows, each with its holder's name as `member` (or null). */
  async listOrgNodes(chartId) {
    const { data, error } = await supabase.from('org_nodes')
      .select('*, member:members(first_name, last_name, suffix)')
      .eq('chart_id', chartId).order('sort_order').order('id');
    if (orgMissing(error)) throw new Error(ORG_HINT);
    if (error) throw mapError(error);
    return data || [];
  },
  /** A new (parish-level) chart after the others; returns its row. */
  createOrgChart: (title) => orgRpc('create_org_chart', { p_title: title }),
  renameOrgChart: (id, title) => orgRpc('update_org_chart', { p_id: id, p_title: title }),
  setOrgChartPublished: (id, published) => orgRpc('update_org_chart', { p_id: id, p_published: published }),
  deleteOrgChart: (id) => orgRpc('delete_org_chart', { p_id: id }),
  /** Save every position of a chart at once (lib/orgChart.js savePayload). */
  saveOrgChart: (id, nodes) => orgRpc('save_org_chart', { p_chart_id: id, p_nodes: nodes }),
  /** The saved chart as the website shows it, published or not; `gkk` fills in the GKK Structure. */
  orgChartPreview: (id, gkk) => orgRpc('org_chart_preview', { p_chart_id: id, p_gkk: gkk || null }),
  /** One GKK's own holders on the GKK Structure (org_gkk_holders rows, with `member`). */
  async listOrgGkkHolders(gkk) {
    const { data, error } = await supabase.from('org_gkk_holders')
      .select('*, member:members(first_name, last_name, suffix)').eq('gkk', gkk);
    if (orgMissing(error)) throw new Error(ORG_HINT);
    if (error) throw mapError(error);
    return data || [];
  },
  /** One GKK's photo and note on a GKK Structure position (0081: the people are its officers). */
  saveOrgGkkHolder: ({ nodeId, gkk, photoUrl, note }) => orgRpc('save_org_gkk_holder', {
    p_node_id: nodeId, p_gkk: gkk, p_member_id: null, p_holder_name: null, p_photo_url: photoUrl || null, p_note: note || null,
  }),

  // ---- a GKK's structure: its officers (0081) ------------------------------
  // The GKK leader saves a draft and sends it; the parish office approves it
  // (save with 'publish') or sends it back. Each returns the structure:
  // { positions, live, draft, state } (lib/gkkStructure.js).
  gkkStructure: (gkk) => structureRpc('gkk_structure', { p_gkk: gkk }),
  /** `action`: 'draft', 'submit' (to the parish office) or 'publish' (full access: approved). */
  saveGkkStructure: (gkk, officers, action) => structureRpc('save_gkk_structure', { p_gkk: gkk, p_officers: officers, p_action: action }),
  returnGkkStructure: (gkk, note) => structureRpc('return_gkk_structure', { p_gkk: gkk, p_note: note }),
  discardGkkStructure: (gkk) => structureRpc('discard_gkk_structure', { p_gkk: gkk }),
  /** Each GKK with changes waiting: Map of GKK name → status ('draft', 'submitted', 'returned'). */
  async gkkStructureStates() {
    const { data, error } = await supabase.from('org_gkk_structures').select('gkk, status').not('status', 'is', null);
    if (error) return new Map();
    return new Map((data || []).map((r) => [r.gkk, r.status]));
  },

  // ---- parish settings ---------------------------------------------------
  async getSettings() {
    const { data, error } = await supabase.from('parish_settings').select('*').eq('id', 1).single();
    if (error) throw mapError(error);
    return { settings: data };
  },

  async updateSettings(patch) {
    const cleaned = {};
    for (const key of ['name', 'address', 'contact', 'email', 'logo', 'hero_image', ...OFFICE_TEXT_FIELDS]) {
      if (!(key in patch)) continue;
      const raw = patch[key];
      const trimmed = typeof raw === 'string' ? raw.trim() : '';
      cleaned[key] = key === 'logo' || key === 'hero_image' ? (trimmed === '' ? null : raw) : trimmed;
    }
    // Office hours and the map pin (0011 migration) aren't plain text.
    if ('office_hours' in patch) cleaned.office_hours = patch.office_hours || null;
    // The parish's default color theme (0014 migration).
    if ('theme' in patch) cleaned.theme = patch.theme || null;
    // Whether the census uses last year's household list (0048 migration).
    if ('last_year_list_enabled' in patch) cleaned.last_year_list_enabled = !!patch.last_year_list_enabled;
    // Maintenance mode for the public website (0049 migration).
    if ('maintenance_mode' in patch) cleaned.maintenance_mode = !!patch.maintenance_mode;
    if ('maintenance_message' in patch) cleaned.maintenance_message = String(patch.maintenance_message || '').trim() || null;
    // Where printed census links and QR codes point (0042 migration); blank uses the default.
    if ('site_url' in patch) cleaned.site_url = normalizeSiteUrl(patch.site_url) || null;
    for (const key of ['latitude', 'longitude']) {
      if (!(key in patch)) continue;
      const n = patch[key] === '' || patch[key] === null ? null : Number(patch[key]);
      if (n !== null && Number.isNaN(n)) throw new Error(`The map ${key} must be a number`);
      cleaned[key] = n;
    }
    if (!Object.keys(cleaned).length) return api.getSettings();
    const { data, error } = await supabase.from('parish_settings').update(cleaned).eq('id', 1).select().single();
    if ('hero_image' in cleaned && (error?.code === '42703' || error?.code === 'PGRST204')) throw new Error('Run the 0020_parish_hero_image.sql migration in Supabase to save the parish photo');
    if ('site_url' in cleaned && (error?.code === '42703' || error?.code === 'PGRST204')) throw new Error('Run the 0042_public_site_url.sql migration in Supabase to save the website address');
    if (('maintenance_mode' in cleaned || 'maintenance_message' in cleaned) && (error?.code === '42703' || error?.code === 'PGRST204')) throw new Error('Run the 0049_maintenance_mode.sql migration in Supabase to use maintenance mode');
    if ('last_year_list_enabled' in cleaned && (error?.code === '42703' || error?.code === 'PGRST204')) throw new Error("Run the 0048_last_year_list_switch.sql migration in Supabase to turn last year's list off");
    if (error) throw mapError(error);
    return { settings: data };
  },

  // ---- photo storage, Cloudflare R2 (0025 migration; staff admins) ------
  async getMediaStorage() {
    const { data, error } = await supabase.rpc('media_storage_get');
    if (error?.code === 'PGRST202') throw new Error('Run the 0025_media_storage_settings.sql migration in Supabase to set up photo storage here');
    if (error) throw mapError(error);
    return data;
  },

  /** A blank `secretAccessKey` keeps the one already saved. */
  async saveMediaStorage({ accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl }) {
    const { data, error } = await supabase.rpc('media_storage_save', {
      p_account_id: accountId || '',
      p_access_key_id: accessKeyId || '',
      p_secret_access_key: secretAccessKey || '',
      p_bucket: bucket || '',
      p_public_base_url: publicBaseUrl || '',
    });
    if (error) throw mapError(error);
    return data;
  },

  async clearMediaStorage() {
    const { error } = await supabase.rpc('media_storage_clear');
    if (error) throw mapError(error);
  },

  /**
   * Try R2 settings before saving them (staff admins): the media-upload
   * function uploads a test file, reads it back through the Public URL and
   * deletes it. A blank `secretAccessKey` uses the saved one.
   * Returns { passed, steps: [{ step, ok, message }] }.
   */
  async testMediaStorage({ accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl }) {
    const data = await callMediaFunction({ action: 'test', accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl });
    return { passed: !!data?.passed, steps: data?.steps || [] };
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
  async saveEvent(row) {
    try {
      return await saveWebsiteRow('events', row);
    } catch (e) {
      // Before 0028 there's no cover photo column.
      if (/photo_url/.test(e.message || '')) throw new Error('Run the 0028_event_cover_photo.sql migration in Supabase to save event cover photos');
      throw e;
    }
  },
  /** Delete an event, then (best effort) its cover on R2 unless another event still uses it. */
  async deleteEvent(id) {
    const { data: row } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
    await deleteWebsiteRow('events', id);
    if (row?.photo_url) await api.deleteEventCover(row.photo_url, id).catch(() => {});
  },
  /**
   * Remove an event cover from R2 unless an event other than `exceptId` still
   * uses it: Duplicate copies the cover, so a series can share one photo.
   */
  async deleteEventCover(url, exceptId = null) {
    if (!url) return;
    let q = supabase.from('events').select('id').eq('photo_url', url).limit(1);
    if (exceptId) q = q.neq('id', exceptId);
    const { data, error } = await q;
    if (error || data?.length) return;
    await callMediaFunction({ action: 'delete', url });
  },

  // Latest updates: articles about activities held (0013 migration).
  async listArticles() {
    return listWebsite('articles', (q) => q.order('held_on', { ascending: false }).order('id', { ascending: false }), '0013_public_site.sql');
  },
  async saveArticle(row) {
    try {
      return await saveWebsiteRow('articles', row);
    } catch (e) {
      // Before 0021 there's no photos column or History tag.
      if (/photos|articles_tag_check/.test(e.message || '')) throw new Error('Run the 0021_article_gallery.sql migration in Supabase to save Blog Articles');
      if (/author/.test(e.message || '')) throw new Error('Run the 0030_article_author.sql migration in Supabase to save the author');
      throw e;
    }
  },
  /** Delete an article, then (best effort) its photos on R2; articles don't go to the trash. */
  async deleteArticle(id) {
    const { data: row } = await supabase.from('articles').select('*').eq('id', id).maybeSingle();
    await deleteWebsiteRow('articles', id);
    const urls = [row?.photo_url, ...(row?.photos || []).map((p) => p.url)].filter(Boolean);
    await Promise.allSettled(urls.map((url) => callMediaFunction({ action: 'delete', url })));
  },

  // The History page (0068): one main article, then chapters in order of year.
  async listHistory() {
    return listWebsite('history_articles', (q) => q.order('is_main', { ascending: false }).order('year', { nullsFirst: true }).order('id'), '0068_parish_history.sql');
  },
  async saveHistory(row) {
    try {
      return await saveWebsiteRow('history_articles', row);
    } catch (e) {
      if (/body_photo/.test(e.message || '')) throw new Error('Run the 0069_history_body_photo.sql migration in Supabase to add a photo inside the article');
      if (/video_url/.test(e.message || '')) throw new Error('Run the 0080_history_video.sql migration in Supabase to add a video to the article');
      throw e;
    }
  },
  /** Delete a chapter, then (best effort) its photos on R2. The main article can't be deleted. */
  async deleteHistory(id) {
    const { data: row } = await supabase.from('history_articles').select('*').eq('id', id).maybeSingle();
    await deleteWebsiteRow('history_articles', id);
    const urls = [row?.photo_url, row?.body_photo_url, row?.video_url, ...(row?.photos || []).map((p) => p.url)].filter(Boolean);
    await Promise.allSettled(urls.map((url) => callMediaFunction({ action: 'delete', url })));
  },

  // Article photos and event covers on Cloudflare R2, through the media-upload Edge Function.
  /**
   * After saving an article or event, rename its photos on R2 to readable
   * names (article101_cover.jpg, article101_1.jpg, event55_cover.jpg). Returns
   * the updated row, or null when nothing needed renaming.
   */
  async nameImages(table, id) {
    const data = await callMediaFunction({ action: 'name', table, id });
    return data?.row || null;
  },
  /** Shrink `file`, upload it to R2 under `folder` ('articles', 'events', 'history'…) and return its public URL. */
  async uploadImage(file, folder = 'articles') {
    const blob = await resizePhotoBlob(file);
    const { uploadUrl, publicUrl } = await callMediaFunction({ action: 'sign', folder, contentType: 'image/jpeg', size: blob.size });
    let res;
    try {
      res = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
    } catch {
      throw new Error('Could not reach the photo storage. Check the R2 bucket’s CORS settings (docs/media-storage.md).');
    }
    if (!res.ok) throw new Error(`The photo storage refused the upload (${res.status})`);
    return publicUrl;
  },
  /**
   * Upload a video as it is to R2 under `folder` (the History page's, 0080)
   * and return its public URL. `onProgress(fraction)` follows the upload,
   * which can take minutes on a slow connection.
   */
  async uploadVideo(file, folder = 'history', onProgress = () => {}) {
    const { uploadUrl, publicUrl } = await callMediaFunction({ action: 'sign', folder, contentType: file.type, size: file.size });
    // XMLHttpRequest, not fetch: only it reports how much has been sent.
    const status = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      xhr.onload = () => resolve(xhr.status);
      xhr.onerror = () => reject(new Error('Could not reach the photo storage. Check the R2 bucket’s CORS settings (docs/media-storage.md), and the connection.'));
      xhr.send(file);
    });
    if (status < 200 || status >= 300) throw new Error(`The photo storage refused the video (${status})`);
    return publicUrl;
  },
  /** Remove an uploaded photo (or video) from R2. */
  deleteImage: (url) => callMediaFunction({ action: 'delete', url }),

  // GKK directory details on the gkks rows (0013 migration).
  async listGkkDetails() {
    return listWebsite('gkks', (q) => q.order('name'), '0013_public_site.sql');
  },
  /** A new GKK with its details in one insert. */
  async createGkk(name, patch = {}) {
    const fields = Object.fromEntries(GKK_DETAIL_FIELDS.filter((f) => f in patch).map((f) => [f, typeof patch[f] === 'string' ? patch[f].trim() : patch[f]]));
    const { data, error } = await supabase.from('gkks').insert({ name: name.trim(), ...cleanPatch(fields) }).select().single();
    if (error?.code === '23505') throw new Error('A GKK with this name already exists');
    if (gkk44Missing(error)) throw new Error(GKK_44_HINT);
    if (gkk46Missing(error)) throw new Error(GKK_46_HINT);
    if (gkk79Missing(error)) throw new Error(GKK_79_HINT);
    if (error?.code === '42703' || error?.code === 'PGRST204') throw new Error('Run the 0018_gkk_chapel.sql and 0040_gkk_previous_households.sql migrations in Supabase to save GKK details');
    if (error) throw mapError(error);
    return data;
  },
  async saveGkkDetails(id, patch) {
    const fields = Object.fromEntries(GKK_DETAIL_FIELDS.filter((f) => f in patch).map((f) => [f, typeof patch[f] === 'string' ? patch[f].trim() : patch[f]]));
    const { data, error } = await supabase.from('gkks').update(cleanPatch(fields)).eq('id', id).select().single();
    if (gkk44Missing(error)) throw new Error(GKK_44_HINT);
    if (gkk46Missing(error)) throw new Error(GKK_46_HINT);
    if (gkk79Missing(error)) throw new Error(GKK_79_HINT);
    if (error?.code === '42703' || error?.code === 'PGRST204') throw new Error('Run the 0018_gkk_chapel.sql and 0040_gkk_previous_households.sql migrations in Supabase to save GKK details');
    if (error) throw mapError(error);
    return data;
  },

  // Household reference numbers (0047): each barangay's 3-letter code.
  /** [{ barangay, code, gkks, next_ref }], A–Z. Every barangay with a GKK gets a code here if it has none yet. */
  async listBarangayRefCodes() {
    const { data, error } = await supabase.rpc('list_barangay_ref_codes');
    if (isMissingFunction(error)) throw new Error('Run the 0047_household_ref_format.sql migration in Supabase to set the reference number codes');
    if (error) throw mapError(error);
    return data || [];
  },
  async setBarangayRefCode(barangay, code) {
    const { error } = await supabase.rpc('set_barangay_ref_code', { p_barangay: barangay, p_code: code });
    if (error) throw mapError(error);
  },

  // A GKK's documents (0044): rows in gkk_documents, files in the private gkk-documents bucket.
  async listGkkDocuments(gkkId) {
    const { data, error } = await supabase.from('gkk_documents').select('*').eq('gkk_id', gkkId).order('created_at', { ascending: false });
    if (gkk44Missing(error)) throw new Error(GKK_44_HINT);
    if (error) throw mapError(error);
    return data || [];
  },
  /** Upload `file` to the GKK's folder, then save its row; the file is removed again if the row can't be saved. */
  async uploadGkkDocument(gkkId, file, { title, kind, note }) {
    const contentType = gkkDocumentType(file);
    const path = gkkDocumentPath(gkkId, contentType, crypto.randomUUID());
    const { error: upError } = await supabase.storage.from(GKK_DOCS_BUCKET).upload(path, file, { contentType, upsert: false });
    if (upError) {
      if (/bucket not found/i.test(upError.message || '')) throw new Error(GKK_44_HINT);
      throw new Error(/row-level security|unauthorized/i.test(upError.message || '') ? "Your account can't add documents to this GKK" : upError.message || 'Could not upload the file');
    }
    const { data, error } = await supabase.from('gkk_documents')
      .insert({ gkk_id: gkkId, title, kind, note: note || null, file_path: path, file_name: file.name.slice(0, 255), content_type: contentType, size_bytes: file.size })
      .select().single();
    if (error) {
      await supabase.storage.from(GKK_DOCS_BUCKET).remove([path]).catch(() => {});
      if (gkk44Missing(error)) throw new Error(GKK_44_HINT);
      throw mapError(error);
    }
    return data;
  },
  /** A link to the file that works for 5 minutes (`download` saves it under its own name instead of opening it). */
  async gkkDocumentLink(doc, { download = false } = {}) {
    const { data, error } = await supabase.storage.from(GKK_DOCS_BUCKET).createSignedUrl(doc.file_path, 300, download ? { download: doc.file_name } : undefined);
    if (error) throw new Error(error.message || 'Could not open the file');
    return data.signedUrl;
  },
  async deleteGkkDocument(doc) {
    const { error } = await supabase.from('gkk_documents').delete().eq('id', doc.id);
    if (error) throw mapError(error);
    const { error: rmError } = await supabase.storage.from(GKK_DOCS_BUCKET).remove([doc.file_path]);
    if (rmError) throw new Error(`The document was taken off the list, but its file could not be deleted: ${rmError.message}`);
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
  registerBloodDonor: (payload) => publicRpc('register_blood_donor', { payload }),
  submitBloodRequest: (payload) => publicRpc('submit_blood_request', { payload }),
  /** Ask to avail of OCIA or the Anointing of the Sick (0032); payload.sacrament says which. */
  submitSacramentRequest: (payload) => publicRpc('submit_sacrament_request', { payload }),
  /** Status of a sacrament request (SR-…) by reference number, or null if not found (0033). */
  sacramentRequestStatus: (refNo) => publicRpc('sacrament_request_status', { p_ref: refNo }),
  /** Open blood calls staff chose to show: blood type, units, hospital, date. */
  publicBloodCalls: () => publicRpc('public_blood_calls'),

  // ---- public website reads (0011 tables, 0013 functions) -------------
  // Published items only, even for a signed-in staff member browsing the site.
  publicMassSchedules: () => listPublished('mass_schedules', (q) => q.order('day_of_week').order('start_time')),
  /** Published sacrament guides (requirements and steps), in the office's order. */
  publicSacramentGuides: () => listPublished('sacrament_guides', (q) => q.order('sort').order('id')),
  /**
   * Live announcements, pinned first, then newest. One with no end date
   * drops off ANNOUNCEMENT_DAYS after it starts, unless it's pinned
   * (announcementLastDay in lib/website.js; the admin shows the same).
   */
  publicAnnouncements: () => listPublished('announcements', (q) => q
    .lte('publish_on', todayLocal())
    .or(`expires_on.gte.${todayLocal()},and(expires_on.is.null,pinned.is.true),and(expires_on.is.null,publish_on.gte.${addDays(todayLocal(), -ANNOUNCEMENT_DAYS)})`)
    .order('pinned', { ascending: false }).order('publish_on', { ascending: false }).order('id', { ascending: false })),
  publicBulletins: () => listPublished('bulletins', (q) => q.order('week_of', { ascending: false }).limit(26)),
  /** Events that haven't ended before `fromIso` (YYYY-MM-DD). */
  publicEvents: (fromIso) => listPublished('events', (q) => q
    .or(`end_date.gte.${fromIso},and(end_date.is.null,start_date.gte.${fromIso})`)
    .order('start_date').order('start_time', { nullsFirst: true })),
  // Every published article: Pahibalo ug Kalihokan lists them all (Home shows the newest two).
  publicArticles: () => listPublished('articles', (q) => q.order('held_on', { ascending: false }).order('id', { ascending: false }).limit(500)),
  /** The published History page: { main, chapters } (chapters oldest first); empty before 0068 is run. */
  async publicHistory() {
    const rows = await listPublished('history_articles', (q) => q.order('year', { nullsFirst: true }).order('id')).catch(() => []);
    return { main: rows.find((r) => r.is_main) || null, chapters: rows.filter((r) => !r.is_main) };
  },
  /** One published item by id (for shared links to an event, announcement, bulletin or article), or null. */
  async publicItem(table, id) {
    if (!WEBSITE_TABLES.includes(table)) throw new Error('Unknown content type');
    const rows = await listPublished(table, (q) => q.eq('id', Number(id) || 0).limit(1));
    return rows[0] || null;
  },
  /** [{ name, puroks, chapel_address, year_established, meeting_schedule, meeting_place, households|null, census_pct|null, coordinator|null }] */
  publicGkkDirectory: () => publicRpc('public_gkk_directory'),
  /** A GKK page's { photo_url, photos, history, history_photos } (history only once published), or null. */
  async publicGkkPage(name) {
    try {
      return await publicRpc('public_gkk_page', { p_name: name });
    } catch {
      // Before 0046: just the history (0044), or nothing.
      const h = await publicRpc('public_gkk_history', { p_name: name }).catch(() => null);
      return h && { photo_url: null, photos: [], history: h.history, history_photos: h.photos };
    }
  },
  /** The published org charts, in order: [{ title, slug, scope }] (0057). */
  publicOrgCharts: () => publicRpc('public_org_charts'),
  /** One published chart: { title, slug, scope, nodes: [{ id, parentId, title, holders, photo, note }] }, or null. `gkk` fills in the GKK Structure. */
  publicOrgChart: (slug, gkk) => publicRpc('public_org_chart', { p_slug: slug, p_gkk: gkk || null }),
  /** { open, label, ends_on, pct, gkks: [{ name, pct|null }] } */
  publicCensusProgress: () => publicRpc('public_census_progress'),
  publicOfficeDetails: () => publicRpc('public_office_details'),
  /** { ref_no, status, registered_on } (the current number, also when found by an old one), or null if not found. */
  registrationStatus: (refNo) => publicRpc('registration_status', { p_ref: refNo }),

  // Staff queues.
  async requestInboxCounts() {
    const { data, error } = await supabase.rpc('request_inbox_counts');
    if (error) throw mapError(error);
    return data;
  },

  async listCertificateRequests() {
    return listRequests('certificate_requests', CERT_SELECT);
  },
  saveCertificateRequest: (row) => saveRequestRow('certificate_requests', row, CERT_FIELDS),

  async listSacramentRequests() {
    try {
      try {
        return await listRequests('sacrament_requests', `*, member:members(${LINKED_MEMBER_COLUMNS})`);
      } catch (e) {
        // Before 0074 a request has no member link.
        if (!/relationship|member_id/i.test(e.message || '')) throw e;
        return await listRequests('sacrament_requests');
      }
    } catch (e) {
      if (/0012_requests/.test(e.message || '')) throw new Error('Run the 0032_sacrament_requests.sql migration in Supabase to use this tab');
      throw e;
    }
  },
  async saveSacramentRequest(row) {
    const saved = await saveRequestRow('sacrament_requests', row, SACRAMENT_FIELDS);
    // The linked member, as the list shows it (0074).
    if (!saved.member_id) return { ...saved, member: null };
    const { data: member } = await supabase.from('members').select(LINKED_MEMBER_COLUMNS).eq('id', saved.member_id).maybeSingle();
    return { ...saved, member: member || null };
  },

  /** The requests linked to one member: certificates, and sacrament requests from 0074. */
  async memberRequests(memberId) {
    const [certs, sacs] = await Promise.all([
      supabase.from('certificate_requests').select('id, ref_no, cert_type, status, created_at').eq('member_id', memberId).order('created_at', { ascending: false }),
      supabase.from('sacrament_requests').select('id, ref_no, sacrament, status, scheduled_on, created_at').eq('member_id', memberId).order('created_at', { ascending: false }),
    ]);
    if (certs.error) throw requestsError(certs.error);
    return { certificates: certs.data || [], sacraments: sacs.error ? [] : sacs.data || [] };
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

  /**
   * Close a census, keeping its results as they stand (0082): worked out
   * here, then saved with the close in one step. Before 0082 it closes
   * without them.
   */
  async closeCensusCycle(cycle, cycles) {
    const results = await api.buildCensusResults(cycle, cycles);
    let { data, error } = await supabase.rpc('census_close_cycle', { p_cycle_id: cycle.id, p_results: results });
    if (isMissingFunction(error)) ({ data, error } = await supabase.rpc('census_close_cycle', { p_cycle_id: cycle.id }));
    if (error) throw mapError(error);
    return data;
  },

  async reopenCensusCycle(id) {
    const { data, error } = await supabase.rpc('census_reopen_cycle', { p_cycle_id: id });
    if (error) throw mapError(error);
    return data;
  },

  /** Change a census's name, start date or target end (0073). */
  async updateCensusCycle(id, { label, startsOn, endsOn }) {
    const { data, error } = await supabase.rpc('census_update_cycle', {
      p_cycle_id: id, p_label: label, p_starts_on: startsOn || null, p_ends_on: endsOn || null,
    });
    if (error) throw missingMigration(error, '0073_census_edit_delete.sql') || mapError(error);
    return data;
  },

  /** What deleting a census takes with it: members' recorded answers and online updates. */
  async censusCycleUsage(id) {
    const [answers, updates] = await Promise.all([
      supabase.from('census_member_responses').select('member_id', { count: 'exact', head: true }).eq('cycle_id', id),
      supabase.from('census_submissions').select('id', { count: 'exact', head: true }).eq('cycle_id', id),
    ]);
    if (answers.error) throw mapError(answers.error);
    return { answers: answers.count || 0, updates: updates.error ? 0 : updates.count || 0 };
  },

  /** Delete a census started by mistake, with its answers (0073). */
  async deleteCensusCycle(id) {
    const { error } = await supabase.rpc('census_delete_cycle', { p_cycle_id: id });
    if (error) throw missingMigration(error, '0073_census_edit_delete.sql') || mapError(error);
    return { ok: true };
  },

  async setCensusInterval(months) {
    const { error } = await supabase.from('parish_settings').update({ census_interval_months: Number(months) }).eq('id', 1);
    if (error) throw mapError(error);
    return { ok: true };
  },

  /**
   * Households with how many of their members are confirmed in this census.
   * Sorted for the page's grouping: by GKK across all GKKs, or by Family
   * Grouping (FG 1, FG 2 … FG 10, then unset) within one GKK (0057).
   */
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
    if (gkk === 'All') q = q.order('gkk', { nullsFirst: false });
    else q = q.order('family_grouping_no', { nullsFirst: false }).order('family_grouping', { nullsFirst: false });
    q = q.order('household_name').order('household_id').range(from, to);
    const { data, error, count } = await q;
    if (error) throw mapError(error);
    return { rows: data, total: count, page, pageSize };
  },

  /** { 'Not started': n, 'Partly confirmed': n, Confirmed: n } households. */
  async censusHouseholdProgressCounts(cycleId) {
    // Every household, past the 1,000-row cap; only the progress column comes back.
    const data = await fetchAll(() => supabase.rpc('census_household_progress', { p_cycle_id: cycleId }).select('progress').order('household_id'));
    const counts = { 'Not started': 0, 'Partly confirmed': 0, Confirmed: 0 };
    for (const r of data) counts[r.progress] = (counts[r.progress] || 0) + 1;
    return counts;
  },

  /** Whether the parish uses last year's household list (on unless turned off, 0048). */
  async lastYearListEnabled() {
    const { data, error } = await supabase.from('parish_settings').select('last_year_list_enabled').eq('id', 1).maybeSingle();
    return error ? true : data?.last_year_list_enabled !== false;
  },
  /**
   * Every household in the registry (on the verification queue or verified)
   * with its head of household's name, for matching last year's list:
   * [{ household_id, household_name, gkk, status, first_name, middle_name, last_name, suffix }].
   * GKK leaders get their own GKK's (row level security).
   */
  async registryHeads() {
    const [households, heads] = await Promise.all([
      fetchAll(() => supabase.from('households').select('id, household_name, gkk, status').order('id')),
      fetchAll(() => supabase.from('members').select('household_id, first_name, middle_name, last_name, suffix').eq('relationship', 'Head of Household').order('id')),
    ]);
    const head = new Map();
    for (const m of heads) if (!head.has(m.household_id)) head.set(m.household_id, m);
    return households.map((h) => ({
      household_id: h.id, household_name: h.household_name, gkk: h.gkk, status: h.status,
      first_name: head.get(h.id)?.first_name || '', middle_name: head.get(h.id)?.middle_name || '',
      last_name: head.get(h.id)?.last_name || '', suffix: head.get(h.id)?.suffix || '',
    }));
  },
  /** Every Head of Family (families 2, 3… in a house, 0054), for matching last year's list too. */
  async registryFamilyHeads() {
    const rows = await fetchAll(() => supabase.from('members').select('id, household_id, first_name, middle_name, last_name, suffix').eq('relationship', 'Head of Family').order('id'));
    return rows.map(({ id, ...m }) => ({ member_id: id, ...m }));
  },
  /**
   * Households (and families) against last year or the previous census, as
   * the Census page, Reports and Parish GKK show it: censusVsLastYearFrom()
   * in lib/census.js. A closed census shows the results kept when it closed
   * (0082), with `kept: { savedAt, savedBy }`; an open one, or one closed
   * before 0082, is worked out from the registry now.
   */
  async censusVsLastYear(cycle, cycles, ownGkk = null) {
    const kept = cycle ? await api.keptCensusResults(cycle.id, ownGkk) : null;
    if (kept?.vs_last_year) return { ...kept.vs_last_year, kept: { savedAt: kept.saved_at, savedBy: kept.saved_by_name } };
    return censusVsLastYearFrom(await api.censusVsLastYearInputs(cycle, cycles), ownGkk);
  },
  /**
   * What censusVsLastYearFrom() works from, fetched once: the households
   * that answered this census and the one before (mode 'census', once an
   * earlier census was held here), else the registry against last year's
   * list or the counts typed in Parish GKK (censusBaselineMode()).
   */
  async censusVsLastYearInputs(cycle, cycles) {
    // The switch only matters for the first census, so it's read only then.
    const first = !(cycle && previousCensus(cycles, cycle));
    const mode = censusBaselineMode(cycles, cycle, first && await api.lastYearListEnabled());
    if (mode === 'census') {
      const previous = previousCensus(cycles, cycle);
      const [before, now, famBefore, famNow] = await Promise.all([
        api.censusHouseholdProgressRows(previous.id), api.censusHouseholdProgressRows(cycle.id),
        api.censusFamilyProgressRows(previous.id), api.censusFamilyProgressRows(cycle.id),
      ]);
      return { mode, previous, before, now, famBefore, famNow };
    }
    // Families (0079) against the count typed in Parish GKK; null before 0054/0079.
    const [details, heads, list, familyHeads, stats] = await Promise.all([
      api.listGkkDetails(), api.registryHeads(),
      mode === 'list' ? api.listLastYear('All').catch(() => []) : [],
      mode === 'list' ? api.registryFamilyHeads().catch(() => []) : [],
      api.familyStats().catch(() => null),
    ]);
    return { mode, previous: null, gkks: details.rows, heads, list, familyHeads, familyStats: stats ? stats.by_gkk : null };
  },
  /**
   * The results a closed census kept (0082) for the whole parish (`gkk`
   * null) or one GKK: { summary, vs_last_year, saved_at, saved_by_name }, or
   * null (none kept, or before 0082). A GKK leader only reads their GKK's.
   */
  async keptCensusResults(cycleId, gkk = null) {
    let q = supabase.from('census_results').select('summary, vs_last_year, saved_at, saved_by_name').eq('cycle_id', cycleId);
    q = gkk ? q.eq('gkk', gkk) : q.is('gkk', null);
    const { data, error } = await q.maybeSingle();
    return error ? null : data;
  },
  /**
   * A census's results to keep (0082), worked out from the registry now:
   * [{ gkk: null, summary, vsLastYear }] for the whole parish, then one per
   * GKK, from one fetch.
   */
  async buildCensusResults(cycle, cycles) {
    const [inputs, rows, details] = await Promise.all([
      api.censusVsLastYearInputs(cycle, cycles), api.liveCensusSummary(cycle.id), api.listGkkDetails(),
    ]);
    // Plain data only, as it's stored as JSON.
    const plain = (v) => JSON.parse(JSON.stringify(v));
    return [
      { gkk: null, summary: rows, vsLastYear: plain(censusVsLastYearFrom(inputs, null)) },
      ...details.rows.map((g) => ({ gkk: g.name, summary: rows.filter((r) => r.gkk === g.name), vsLastYear: plain(censusVsLastYearFrom(inputs, g.name)) })),
    ];
  },
  /** Full access: keep the results of a census closed before 0082, worked out now. */
  async recordCensusResults(cycle, cycles) {
    const results = await api.buildCensusResults(cycle, cycles);
    const { data, error } = await supabase.rpc('census_record_results', { p_cycle_id: cycle.id, p_results: results });
    if (isMissingFunction(error)) throw new Error('Run the 0082_census_results_snapshot.sql migration in Supabase to keep each census’s results');
    if (error) throw mapError(error);
    return data;
  },
  /** Every family's part in one census (0079): [{ household_id, family_no, gkk, took_part }], or null before 0079. */
  async censusFamilyProgressRows(cycleId) {
    try {
      return await fetchAll(() => supabase.rpc('census_family_progress', { p_cycle_id: cycleId })
        .select('household_id, family_no, gkk, took_part').order('household_id').order('family_no'));
    } catch {
      return null;
    }
  },
  /** Every household's progress in one census: [{ household_id, household_name, head_name, ref_no, gkk, progress }]. */
  async censusHouseholdProgressRows(cycleId) {
    return fetchAll(() => supabase.rpc('census_household_progress', { p_cycle_id: cycleId })
      .select('household_id, household_name, head_name, ref_no, gkk, progress').order('household_id'));
  },

  // ---- last year's household list (0041 migration) -------------------
  /**
   * Heads of household in other GKKs who may be one of `gkk`'s names still
   * "Not yet" (0053), for otherGkkMatches(). Household details only for staff
   * who see the whole registry. Empty before 0053.
   */
  async lastYearOtherGkkHeads(gkk) {
    const { data, error } = await supabase.rpc('last_year_other_gkk_heads', { p_gkk: gkk });
    if (error) return [];
    return data || [];
  },

  /** Every name on one GKK's list (or every GKK's, for 'All'), by purok then name. */
  async listLastYear(gkk = 'All') {
    try {
      return await fetchAll(() => {
        let q = supabase.from('census_last_year_list').select('*');
        if (gkk !== 'All') q = q.eq('gkk', gkk);
        return q.order('gkk').order('purok', { nullsFirst: true }).order('head_name').order('id');
      });
    } catch (e) {
      throw lastYearMissing(e);
    }
  },
  /** Map of GKK → { total, notYet, registered, setAside }; empty before 0041. */
  async lastYearCounts() {
    try {
      const rows = await fetchAll(() => supabase.from('census_last_year_list').select('gkk, status').order('id'));
      return countLastYearList(rows);
    } catch {
      return new Map();
    }
  },
  /** Add names: [{ gkk, head_name, purok, note }]. Returns how many were added. */
  async addLastYear(rows) {
    let added = 0;
    // A few hundred per request keeps each insert small.
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500).map((r) => ({ gkk: r.gkk, head_name: r.head_name, purok: r.purok || null, note: r.note || null }));
      const { error } = await supabase.from('census_last_year_list').insert(chunk);
      if (error) throw lastYearMissing(error);
      added += chunk.length;
    }
    return added;
  },
  /** Change a name's details or status ({ head_name, purok, note, status }). */
  async saveLastYear(id, patch) {
    const fields = Object.fromEntries(['head_name', 'purok', 'note', 'status'].filter((f) => f in patch).map((f) => [f, typeof patch[f] === 'string' ? patch[f].trim() : patch[f]]));
    // Corrections to how the name is found in the registry (0052): a household chosen by hand, or ones it isn't.
    if ('household_id' in patch) fields.household_id = patch.household_id ?? null;
    if ('not_household_ids' in patch) fields.not_household_ids = patch.not_household_ids || [];
    const { data, error } = await supabase.from('census_last_year_list').update(cleanPatch(fields)).eq('id', id).select().single();
    if (['42703', 'PGRST204'].includes(error?.code) && /not_household_ids/.test(error.message || '')) throw new Error('Run the 0052_last_year_list_links.sql migration in Supabase to correct a match');
    if (error) throw lastYearMissing(error);
    return data;
  },
  async deleteLastYear(id) {
    const { error } = await supabase.from('census_last_year_list').delete().eq('id', id);
    if (error) throw lastYearMissing(error);
  },
  /** Remove a GKK's whole list (e.g. once the census is done). */
  async clearLastYear(gkk) {
    const { error } = await supabase.from('census_last_year_list').delete().eq('gkk', gkk);
    if (error) throw lastYearMissing(error);
  },

  /**
   * census_summary() rows: { gkk, status, members }. A closed census gives
   * the ones kept when it closed (0082): the whole parish's for staff, their
   * GKK's for its leader (the only ones they can read).
   */
  async censusSummary(cycleId) {
    const { data: kept } = await supabase.from('census_results').select('gkk, summary').eq('cycle_id', cycleId);
    const row = (kept || []).find((r) => r.gkk == null) || (kept?.length === 1 ? kept[0] : null);
    if (row) return row.summary || [];
    return api.liveCensusSummary(cycleId);
  },
  /** census_summary() rows worked out from the registry now, kept results or not. */
  async liveCensusSummary(cycleId) {
    const { data, error } = await supabase.rpc('census_summary', { p_cycle_id: cycleId });
    if (error) throw mapError(error);
    return data || [];
  },

  /**
   * Save members' statuses and own participation answers from Edit Household
   * (0056): [{ memberId, status, participation }]. While a census is open, an
   * answer in it that came from the registration follows the edit.
   */
  async saveMemberAnswers(householdId, answers) {
    const { data, error } = await supabase.rpc('save_member_answers', { p_household_id: householdId, p_answers: answers });
    if (isMissingFunction(error)) throw new Error("Run the 0056_member_answers_edit.sql migration in Supabase to save members' status and participation");
    if (error) throw mapError(error);
    return data;
  },
  /** The open census and, for each of `memberIds`, their answer in it: { cycle, byMember: Map id → { status, source } }. */
  async openCensusAnswers(memberIds) {
    const { data: cycle } = await supabase.from('census_cycles').select('id, label').eq('status', 'Open').maybeSingle();
    if (!cycle || !memberIds.length) return { cycle: cycle || null, byMember: new Map() };
    const { data } = await supabase.from('census_member_responses').select('member_id, status, source').eq('cycle_id', cycle.id).in('member_id', memberIds);
    return { cycle, byMember: new Map((data || []).map((r) => [r.member_id, r])) };
  },
  /**
   * Each member's latest census answers with participation, the ones their
   * Practicing Catholic score uses: member id → { participation, status, label }.
   * Members with none are left out; before 0007 (no census) the map is empty.
   */
  async latestCensusAnswers(memberIds) {
    if (!memberIds.length) return new Map();
    const { data, error } = await supabase
      .from('census_member_responses')
      .select('member_id, cycle_id, status, participation, census_cycles(label)')
      .in('member_id', memberIds)
      .order('cycle_id', { ascending: false });
    if (error) return new Map();
    const latest = new Map();
    for (const r of data) {
      if (!latest.has(r.member_id) && Object.keys(cleanParticipation(r.participation)).length) {
        latest.set(r.member_id, { participation: r.participation, status: r.status, label: r.census_cycles?.label || 'Census' });
      }
    }
    return latest;
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

  /** How many online updates in this census wait for review (count only, for the tab badge). */
  async pendingCensusSubmissionCount(cycleId) {
    const { count, error } = await supabase.from('census_submissions').select('id', { count: 'exact', head: true })
      .eq('cycle_id', cycleId).eq('status', 'Pending');
    if (error) throw mapError(error);
    return count || 0;
  },

  /** Every update in one status (past the 1,000-row cap), oldest first; the tab searches and pages them. */
  async listCensusSubmissions(cycleId, status = 'Pending') {
    return fetchAll(() => supabase
      .from('census_submissions')
      .select('*, households(household_name, ref_no, gkk)')
      .eq('cycle_id', cycleId)
      .eq('status', status)
      .order('submitted_at', { ascending: true })
      .order('id', { ascending: true }));
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
   * Every row, past the 1,000-row cap: a large GKK has more members than that.
   */
  async censusPrintData({ gkk, householdIds, withCodes = true }) {
    const memberCols = 'id, household_id, family_no, first_name, middle_name, last_name, suffix, relationship, dob, civil_status, '
      + 'has_baptism, has_communion, has_confirmation, has_matrimony';
    const scope = (q, idCol, gkkCol) => {
      if (householdIds) return q.in(idCol, householdIds);
      return gkk === 'None' ? q.is(gkkCol, null) : q.eq(gkkCol, gkk);
    };
    const [households, members] = await Promise.all([
      fetchAll(() => scope(supabase.from('households').select('*'), 'id', 'gkk').order('household_name').order('id')),
      fetchAll(() => scope(supabase.from('members_with_household').select(memberCols).eq('is_current', true), 'household_id', 'household_gkk').order('id')),
    ]);
    // Online access codes (0008), unless the caller leaves them out. Without that
    // migration the forms print without them.
    const codes = withCodes ? await api.censusAccessCodes(households.map((h) => h.id)).catch(() => ({})) : {};
    return households.map((h) => ({ household: h, code: codes[h.id] || null, members: members.filter((m) => m.household_id === h.id) }));
  },

  // ---- dashboard ---------------------------------------------------------
  async dashboardStats() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const [{ data, error }, families, gkkMembers] = await Promise.all([supabase.rpc('admin_dashboard_stats', { p_tz: tz }), api.familyStats(), api.membersByGkk()]);
    if (error) throw mapError(error);
    return { ...shapeDashboard({ ...data, family_stats: families }), gkkMembers };
  },

  /**
   * Current members per GKK, largest first (0078): [{ label, n }], or null
   * before the migration (the Dashboard then shows households per GKK).
   */
  async membersByGkk() {
    const { data, error } = await supabase.rpc('members_by_gkk');
    if (error) {
      if (isMissingFunction(error)) return null;
      throw mapError(error);
    }
    return (data || []).map((r) => ({ label: r.gkk, n: Number(r.members) || 0 }));
  },

  /**
   * Families within households (0054): { families, multi_family_households,
   * by_gkk: [{ label, households, families, multi }] }, or null before the
   * migration is run (the pages then leave family figures out).
   */
  async familyStats() {
    const { data, error } = await supabase.rpc('family_stats');
    if (error) {
      if (isMissingFunction(error)) return null;
      throw mapError(error);
    }
    return data;
  },

  // ---- reports -------------------------------------------------------
  async reportStats() {
    const [{ data, error }, families] = await Promise.all([supabase.rpc('admin_report_stats'), api.familyStats()]);
    if (error) throw mapError(error);
    return shapeReport({ ...data, family_stats: families });
  },

  /**
   * One report from Reports → Generate Report: { title, meta, columns, rows:
   * [{ cells, families?, csvLines? }], empty, csvColumns }. Reports/lib
   * reports.js do the counting; this fetches the rows (every page of them).
   * `blood` is false for accounts that can't see blood types.
   */
  async generateReport({ source, type, gkk = 'All', status = 'All', dateFrom, dateTo, sacrament, received = 'Received', group, cycleId, ageGroup, month, volunteer = 'All', missing = 'Any', blood = true }) {
    const table = (title, meta, columns, rows) => ({ title, meta, columns, rows: rows.map((cells) => ({ cells })), empty: rows.length === 0, csvColumns: columns });
    const range = [dateFrom && `from ${dateFrom}`, dateTo && `to ${dateTo}`].filter(Boolean).join(' ');
    const where = gkk && gkk !== 'All' ? ` · ${gkk}` : '';
    const days = (n) => (n === null || n === undefined ? '—' : `${n} day(s)`);
    const date = (v) => (v ? new Date(v).toLocaleDateString() : '—');
    const members = (opts) => reportMembers({ gkk, ...opts });
    // A member's line in the member lists.
    const memberColumns = ['Name', 'Household', 'GKK', 'Sex', 'Age', 'Birth date', 'Civil status', 'Relationship', 'Contact'];
    const memberCells = (m) => [
      personName(m), m.household_name, m.household_gkk || '—', bis(SEX_LABELS, m.sex) || '—', m.age ?? '—', m.dob || '—',
      bis(CIVIL_STATUS_LABELS, m.civil_status) || '—', bis(RELATIONSHIP_LABELS, m.relationship) || '—', m.contact || '—',
    ];

    if (source === 'Households' && type === 'By registration month') {
      const list = await fetchAll(() => householdQuery(supabase.from('households_with_count').select('id, created_at, status, member_count, gkk'), { gkk, sortKey: 'registered', sortDir: 'asc' }));
      const rows = registrationsByMonth(list, { dateFrom, dateTo });
      return table('Registrations by month', `${rows.reduce((n, r) => n + r.households, 0)} household(s) ${range}`.trim(),
        ['Month', 'Households registered', 'Members', 'Verified so far'],
        rows.map((r) => [monthName(r.month), r.households, r.members, r.verified]));
    }

    if (source === 'Households') {
      let list = await fetchAll(() => householdQuery(supabase.from('households_with_count')
        .select('id, ref_no, household_name, head_name, gkk, family_grouping, member_count, status, contact, volunteer, help_ways, created_at, verified_at, verified_by_name'),
      { gkk, sortKey: 'name', sortDir: 'asc' }));
      if (type === 'Waiting for verification') {
        const rows = waitingForVerification(list);
        const oldest = rows[0];
        return table('Households waiting for verification', rows.length ? `${rows.length} pending household(s), the longest waiting ${oldest.days} day(s)${where}` : `No household is waiting${where}`,
          ['Household', 'Ref no', 'Head', 'GKK', 'Members', 'Registered', 'Days waiting'],
          rows.map((h) => [h.household_name, h.ref_no || '—', h.head_name || '—', h.gkk || '—', h.member_count, date(h.created_at), h.days]));
      }
      if (type === 'Volunteer pool') {
        const rows = volunteerPool(list, volunteer);
        const yes = rows.filter((h) => h.volunteer === 'Yes').length;
        return table('Volunteer pool', `${yes} household(s) said Yes · ${rows.length - yes} said Maybe${where}`,
          ['Household', 'GKK', 'Volunteer', 'Ways they can help', 'Head', 'Contact'],
          rows.map((h) => [h.household_name, h.gkk || '—', h.volunteer, (h.help_ways || []).map(helpWayLabel).join(', ') || '—', h.head_name || '—', h.contact || '—']));
      }
      if (type === 'Verifications by staff') {
        const rows = verificationsByStaff(list, { dateFrom, dateTo });
        const total = rows.reduce((n, r) => n + r.verified, 0);
        return table('Verifications by staff', `${total} household(s) verified ${range || 'so far'}${where}`.replace('  ', ' '),
          ['Month', 'Verified by', 'Households verified', 'Average days from registration'],
          rows.map((r) => [monthName(r.month), r.staff, r.verified, days(r.avgDays)]));
      }
      if (type === 'By Status' && status && status !== 'All') list = list.filter((h) => h.status === status);
      if (dateFrom || dateTo) list = list.filter((h) => inDateRange(h.created_at, dateFrom, dateTo));
      if (type === 'By GKK') list = [...list].sort(byGkk((h) => h.gkk, (a, b) => a.household_name.localeCompare(b.household_name)));
      const gkks = new Set(list.map((h) => h.gkk || ''));
      return table(`Households — ${type}`, `${list.length} household(s)${type === 'By GKK' ? ` in ${gkks.size} GKK(s)` : ''}${where}`,
        ['Ref no', 'Household', 'Head', 'GKK', 'Grouping', 'Members', 'Status', 'Registered', 'Verified by'],
        list.map((h) => [h.ref_no || '—', h.household_name, h.head_name || '—', h.gkk || '—', h.family_grouping || '—', h.member_count, h.status, date(h.created_at), h.verified_by_name || '—']));
    }

    if (source === 'Sacraments') {
      if (type === 'Verification progress by GKK') {
        const list = await members({ columns: 'id, household_gkk, has_baptism, has_communion, has_confirmation, has_matrimony, baptism_verified, communion_verified, confirmation_verified, matrimony_verified' });
        const rows = sacramentProgressRows(list);
        const cell = (x) => `${x.verified} of ${x.claimed}`;
        return table('Sacrament verification progress', `Verified of claimed, for ${list.length} current member(s)`,
          ['GKK', 'Members', ...SACRAMENTS.map((x) => x.label), 'Waiting'],
          rows.map((r) => [r.label, r.members, ...SACRAMENTS.map((x) => cell(r[x.key])), r.waiting]));
      }
      const list = await members();
      if (type === 'Candidates by GKK') {
        const { rows, total } = candidatesByGkk(list);
        const line = (r) => [r.label, r.members, r.baptism, r.communion, r.confirmation];
        return table('Sacrament candidates by GKK',
          `Members old enough who haven't received each sacrament (First Communion and Confirmation from ${SACRAMENT_MIN_AGE.communion}). For their names: Members → By Sacrament → Not yet received${where}`,
          ['GKK', 'Members', 'Not baptized', 'No First Communion', 'Not confirmed'], rows.length ? [...rows.map(line), ...(rows.length > 1 ? [line(total)] : [])] : []);
      }
      if (type === 'Couples for a church wedding') {
        const rows = churchWeddingCandidates(list);
        return table('Couples for a church wedding', `${rows.length} couple(s) or member(s) living together, or married without a church wedding on record${where}`,
          ['Couple', 'Situation', 'Married on', 'Household', 'GKK', 'Contact'],
          rows.map((r) => [r.names, r.situation, r.married || '—', r.household, r.gkk, r.contact]));
      }
      if (type === 'Children not yet baptized') {
        const rows = unbaptizedChildren(list);
        return table('Children not yet baptized',
          `${rows.length} child(ren) aged ${YOUNG_CHILD_MAX_AGE} and under with no Baptism on record, for a follow-up visit with their family. Some may be baptized but not recorded yet${where}`,
          ['Child', 'Age', 'Birth date', 'Parents / family head', 'Household', 'GKK', 'Contact'],
          rows.map((r) => [r.name, r.age, r.dob || '—', r.parents, r.household, r.gkk, r.contact]));
      }
      if (type === 'Received by year') {
        const { rows, undated } = sacramentsByYear(list);
        const missingDates = Object.values(undated).reduce((a, b) => a + b, 0);
        return table('Sacraments received by year', `From the dates on members' records; a wedding counts once per couple. ${missingDates} sacrament(s) have no date on record${where}`,
          ['Year', 'Baptisms', 'First Communions', 'Confirmations', 'Weddings'],
          rows.map((r) => [r.year, r.baptism, r.communion, r.confirmation, r.matrimony]));
      }
    }

    if (source === 'Census') {
      if (!cycleId) throw new Error('Choose a census');
      const cycles = await api.listCensusCycles();
      const cycle = cycles.find((c) => c.id === Number(cycleId));
      // Against the previous census once there is one; for the first, last year's list or counts (censusBaselineMode()).
      // A closed census gives the results kept when it closed (0082).
      if (type === 'Households vs last year' || type === 'Not yet registered') {
        const res = await api.censusVsLastYear(cycle, cycles, gkk === 'All' ? null : gkk);
        const baseline = vsLastYearBaseline(res);
        const noBaseline = res.mode === 'count'
          ? `No baseline to compare with: type each GKK's households last year in Parish GKK, or turn the list on${where}`
          : res.mode === 'census'
            ? `No baseline to compare with: nobody answered ${baseline}${where}`
            : `No baseline to compare with (${baseline}): add last year's names or counts${where}`;
        if (type === 'Households vs last year') {
          const t = vsLastYearTable(res, cycle);
          const fam = res.families?.hasBaseline ? res.families.total : null;
          const families = fam ? ` · families: ${fam.lastYear - fam.notYet} of ${fam.lastYear} (${fam.pct}%)` : '';
          const meta = res.hasBaseline ? `${res.total.pct}% registered against ${baseline} · ${res.total.notYet} of ${res.total.lastYear} not yet${families}${where}` : noBaseline;
          return table(t.title, meta, t.columns, t.rows);
        }
        const list = res.mode !== 'census'
          ? { columns: ['GKK', 'Head of household', 'Purok', 'Note'], rows: res.notYet.map((n) => [n.gkk, n.title, n.purok || '—', n.note || '—']) }
          : { columns: ['GKK', 'Household', 'Head · ref no'], rows: res.notYet.map((n) => [n.gkk || 'No GKK', n.title, n.detail || '—']) };
        // GKKs measured by their typed count have no names to list, only how many are left.
        const unnamed = unnamedNotYet(res);
        const named = res.mode === 'count' ? '' : `${res.notYet.length} famil${res.notYet.length === 1 ? 'y' : 'ies'} from ${baseline} not yet registered`;
        const counted = unnamed ? `${unnamed} household(s) not yet registered by last year's household count (no names to list)` : '';
        const meta = !res.hasBaseline && res.mode !== 'census' ? noBaseline
          : `${[named, counted].filter(Boolean).join(' · ') || `Every household from ${baseline} has registered`}${where}`;
        return table(`${cycle?.label || 'Census'}: not yet registered`, meta, list.columns, list.rows);
      }
      if (type === 'Results by GKK') {
        const sum = summarizeCensus(await api.censusSummary(cycleId));
        const row = (r) => [r.label, ...sum.columns.map((c) => r.counts[c]), r.total, `${r.pct}%`];
        return table(`${cycle?.label || 'Census'} — results by GKK`, `${sum.total.total} member(s)`,
          ['GKK', ...sum.columns, 'Total', 'Confirmed %'], sum.rows.length ? [...sum.rows.map(row), row(sum.total)] : []);
      }
      if (type === 'Compared with the census before') {
        const before = cycle && previousCensus(cycles, cycle);
        if (!before) return table(`${cycle?.label || 'Census'} — compared with the census before`, 'There is no earlier census to compare with', [], []);
        const scoped = (rows) => (gkk === 'All' ? rows : rows.filter((r) => r.gkk === gkk));
        const [prev, cur] = await Promise.all([api.censusSummary(before.id), api.censusSummary(cycleId)]);
        const { rows, total } = censusComparisonRows(summarizeCensus(scoped(prev)), summarizeCensus(scoped(cur)));
        const line = (r) => [r.label, r.before, r.now, r.change > 0 ? `+${r.change}` : r.change, r.deceased, r.movedAway, r.left, r.notConfirmed];
        return table(`${cycle.label} — compared with ${before.label}`,
          `Members counted (confirmed and still in the parish): ${total.before} in ${before.label}, ${total.now} in ${cycle.label}${where}`,
          ['GKK', `Counted in ${before.label}`, `Counted in ${cycle.label}`, 'Change', 'Deceased', 'Moved away', 'Left the Church', 'Not confirmed yet'],
          rows.length ? [...rows.map(line), ...(rows.length > 1 ? [line(total)] : [])] : []);
      }
      // Members not confirmed in the chosen census (not always the latest one).
      const [list, confirmed] = await Promise.all([
        members({ columns: 'id, first_name, last_name, suffix, household_name, household_gkk, age, contact' }),
        fetchAll(() => supabase.from('census_member_responses').select('member_id').eq('cycle_id', Number(cycleId)).order('member_id')),
      ]);
      const done = new Set(confirmed.map((r) => r.member_id));
      const rows = list.filter((m) => !done.has(m.id))
        .sort(byGkk((m) => m.household_gkk, (a, b) => a.household_name.localeCompare(b.household_name)));
      return table(`${cycle?.label || 'Census'} — not confirmed yet`, `${rows.length} current member(s) not confirmed in ${cycle?.label || 'this census'}${where}`,
        ['Name', 'Household', 'GKK', 'Age', 'Contact'],
        rows.map((m) => [personName(m), m.household_name, m.household_gkk || '—', m.age ?? '—', m.contact || '—']));
    }

    if (source === 'Requests') {
      if (type === 'Certificate turnaround') {
        const list = await fetchAll(() => supabase.from('certificate_requests').select('id, cert_type, status, created_at, released_at').order('id'));
        const rows = turnaroundRows(list, { dateFrom, dateTo, typeLabel: certTypeLabel });
        return table('Certificate turnaround', `Requests received ${range || 'so far'}`.trim(),
          ['Certificate', 'Received', 'Released', 'Average to release', 'Longest', 'Still open', 'Oldest open'],
          rows.map((r) => [r.label, r.received, r.released, days(r.avgDays), days(r.maxDays), r.open, r.open ? days(r.oldestOpen) : '—']));
      }
      if (type === 'Certificate fees by month') {
        const list = await fetchAll(() => supabase.from('certificate_requests').select('id, fee, or_number, released_at').not('released_at', 'is', null).order('id'));
        const rows = feesByMonth(list, { dateFrom, dateTo });
        const sum = rows.reduce((n, r) => n + r.total, 0);
        return table('Certificate fees by month', `${peso(sum)} from ${rows.reduce((n, r) => n + r.released, 0)} certificate(s) released ${range || 'so far'}`.trim(),
          ['Month', 'Released', 'With a fee', 'Fees', 'No OR number'],
          rows.map((r) => [monthName(r.month), r.released, r.paid, peso(r.total), r.noOr]));
      }
      if (type === 'Sacrament requests') {
        const list = await fetchAll(() => supabase.from('sacrament_requests').select('id, sacrament, status, created_at, status_changed_at').order('id'));
        const rows = requestOutcomeRows(list, {
          dateFrom, dateTo, groupOf: (r) => r.sacrament, labelOf: sacramentRequestLabel,
          done: 'Done', closed: ['Cancelled'], open: SACRAMENT_REQUEST_OPEN,
        });
        return table('Sacrament requests', `Requests received ${range || 'so far'}; days to done run to when each was marked Done`.trim(),
          ['Request', 'Received', 'Done', 'Cancelled', 'Still open', 'Average to done', 'Oldest open'],
          rows.map((r) => [r.label, r.received, r.done, r.closed, r.open, days(r.avgDays), r.open ? days(r.oldestOpen) : '—']));
      }
      if (type === 'Blood requests') {
        const list = await fetchAll(() => supabase.from('blood_requests').select('id, blood_type, units, status, created_at, status_changed_at').order('id'));
        const rows = requestOutcomeRows(list, {
          dateFrom, dateTo, groupOf: (r) => r.blood_type, units: (r) => r.units,
          done: 'Fulfilled', closed: ['Closed'], open: BLOOD_OPEN,
        }).sort((a, b) => BLOOD_TYPES.indexOf(a.label) - BLOOD_TYPES.indexOf(b.label));
        return table('Blood requests', `Requests received ${range || 'so far'}, by the blood type asked for`.trim(),
          ['Blood type', 'Requests', 'Units asked', 'Fulfilled', 'Closed unfulfilled', 'Still open', 'Average to fulfilled', 'Oldest open'],
          rows.map((r) => [r.label, r.received, r.units, r.done, r.closed, r.open, days(r.avgDays), r.open ? days(r.oldestOpen) : '—']));
      }
    }

    if (source === 'Celebrations') {
      const kind = type === 'Birthdays' ? 'birthday' : 'anniversary';
      const m = Number(month) || new Date().getMonth() + 1;
      const monthLabel = new Date(2000, m - 1, 1).toLocaleDateString('en-US', { month: 'long' });
      const rows = celebrationsInMonth(await members(), m, kind);
      if (kind === 'birthday') {
        return table(`Birthdays in ${monthLabel}`, `${rows.length} member(s)${where}`,
          ['Day', 'Name', 'Turns', 'Household', 'GKK', 'Contact'],
          rows.map((r) => [r.day, r.name, r.years, r.household, r.gkk, r.contact]));
      }
      return table(`Wedding anniversaries in ${monthLabel}`, `${rows.length} couple(s)${where}`,
        ['Day', 'Couple', 'Years', 'Wedding', 'Household', 'GKK', 'Contact'],
        rows.map((r) => [r.day, r.name, r.years, bis(WEDDING_TYPE_LABELS, r.type) || '—', r.household, r.gkk, r.contact]));
    }

    if (source === 'Ministries & organizations') {
      if (type === 'GKK officers') {
        const names = gkk === 'All' ? (await api.listGkks()).rows.map((g) => g.name) : [gkk];
        const rows = gkkOfficerRows(await members({ columns: 'id, first_name, last_name, suffix, household_gkk, gkk_role, contact' }), names);
        const vacant = rows.filter((r) => r.vacant).length;
        return table('GKK officers', `${rows.length - vacant} officer(s) · ${vacant} vacant role(s)${where}`,
          ['GKK', 'Role', 'Officer', 'Contact'], rows.map((r) => [r.gkk, r.role, r.name, r.contact]));
      }
      const list = await members();
      if (type === 'Parish roles') {
        const rows = parishRoleRows(list);
        return table('Parish roles', `${rows.length} member(s) with a Katungdanan sa Parish${where}`,
          ['Role', 'Member', 'GKK', 'Contact'], rows.map((r) => [r.role, r.name, r.gkk, r.contact]));
      }
      if (type === 'Members in 3 or more groups') {
        const rows = busyMembers(list, 3);
        return table('Members in 3 or more groups', `${rows.length} member(s) serving in three or more ministries and organizations${where}`,
          ['Name', 'Groups', 'Ministries & organizations', 'GKK', 'Age', 'Contact'],
          rows.map((m) => [personName(m), m.groups.length, m.groups.join(', '), m.household_gkk || '—', m.age ?? '—', m.contact || '—']));
      }
      const [mins, orgs] = await Promise.all([api.listMinistries(), api.listOrganizations()]);
      const groups = [...mins.rows.map((g) => ({ name: g.name, kind: 'Ministry' })), ...orgs.rows.map((g) => ({ name: g.name, kind: 'Organization' }))];
      let rows = groupMakeupRows(list, groups);
      const small = type === 'Small or empty groups';
      if (small) rows = rows.filter((r) => r.members < SMALL_GROUP).sort((a, b) => a.members - b.members || a.name.localeCompare(b.name));
      return table(small ? 'Small or empty groups' : 'Make-up of each group',
        small ? `${rows.length} group(s) with fewer than ${SMALL_GROUP} current members${where}` : `${groups.length} ministries and organizations, current members only${where}`,
        ['Group', 'Kind', 'Members', 'Male', 'Female', 'Under 18', '18–30', '31–59', '60 and up', 'No birth date', 'GKKs'],
        rows.map((r) => [r.name, r.kind, r.members, r.male, r.female, r.under18, r.y18, r.y31, r.y60, r.noAge, r.gkks]));
    }

    if (source === 'Data quality') {
      if (type === 'Households with problems') {
        const houses = await fetchAll(() => householdQuery(supabase.from('households').select('id, ref_no, household_name, gkk, contact'), { gkk, sortKey: 'name', sortDir: 'asc' }));
        const people = houses.length ? await fetchAll(() => {
          let q = supabase.from('members_with_household').select('id, household_id, relationship, contact, is_current');
          if (gkk !== 'All') q = q.eq('household_gkk', gkk);
          return q.order('id');
        }) : [];
        const rows = householdProblems(houses, people);
        return table('Households with problems', `${rows.length} of ${houses.length} household(s) need fixing${where}`,
          ['Household', 'Ref no', 'GKK', 'Problems'], rows.map((h) => [h.household_name, h.ref_no || '—', h.gkk || '—', h.problems.join(', ')]));
      }
      const list = await members();
      if (type === 'Missing details by GKK') {
        const { fields, rows, total } = dataQualityByGkk(list, { blood });
        const line = (r) => [r.label, r.members, ...fields.map((f) => r[f.key]), r.completePct];
        return table('Missing details by GKK', `${total.complete} of ${total.members} current member(s) have nothing missing${where}`,
          ['GKK', 'Members', ...fields.map((f) => `No ${f.label.toLowerCase()}`), 'Complete'],
          rows.length ? [...rows.map(line), ...(rows.length > 1 ? [line(total)] : [])] : []);
      }
      const rows = list.map((m) => ({ m, missing: missingDetails(m, { blood }) }))
        .filter((r) => r.missing.length && (missing === 'Any' || r.missing.includes(missing)))
        .sort(byGkk((r) => r.m.household_gkk, (a, b) => a.m.household_name.localeCompare(b.m.household_name)));
      return table('Members with missing details', `${rows.length} current member(s)${missing === 'Any' ? '' : ` with no ${missing.toLowerCase()}`}${where}`,
        ['Name', 'Household', 'GKK', 'Relationship', 'Age', 'Missing'],
        rows.map(({ m, missing: miss }) => [personName(m), m.household_name, m.household_gkk || '—', bis(RELATIONSHIP_LABELS, m.relationship) || '—', m.age ?? '—', miss.join(', ')]));
    }

    if (source === 'Members') {
      if (type === 'Deceased' || type === 'Moved away or left the Church') {
        const statuses = type === 'Deceased' ? ['Deceased'] : ['Moved away', 'Left the Church'];
        const rows = statusChanges(await members({ current: false }), statuses, { dateFrom, dateTo });
        return table(type === 'Deceased' ? 'Deceased members' : 'Members who moved away or left the Church',
          `${rows.length} member(s)${range ? `, status recorded ${range}` : ''}${where}`,
          ['Name', 'Status', 'Recorded', 'Household', 'GKK', 'Age', 'Contact'],
          rows.map((m) => [personName(m), m.membership_status, date(m.status_updated_at), m.household_name, m.household_gkk || '—', m.age ?? '—', m.contact || '—']));
      }
      const list = await members();
      if (type === 'Age and sex') {
        const { rows, total } = ageSexRows(list);
        const line = (r) => [r.label, r.male, r.female, r.other, r.total, r.share];
        return table('Members by age and sex', `${total.total} current member(s)${where}`,
          ['Age', 'Male', 'Female', 'Sex not recorded', 'Total', 'Share'], total.total ? [...rows.map(line), line(total)] : []);
      }
      const BREAKDOWNS = {
        'By civil status': ['civil_status', 'Civil status', { adultsOnly: true, label: (v) => bis(CIVIL_STATUS_LABELS, v) }, 'Members 18 and up (or with no birth date)'],
        'By tribe': ['tribe', 'Tribe', {}, 'Current members'],
        'By religion': ['religion', 'Religion', {}, 'Current members; other religions show mixed-faith households'],
      };
      if (BREAKDOWNS[type]) {
        const [field, label, opts, note] = BREAKDOWNS[type];
        const { rows, total } = breakdownRows(list, field, opts);
        return table(`Members ${type.toLowerCase()}`, `${note}: ${total}${where}`,
          [label, 'Male', 'Female', 'Total', 'Share'], rows.map((r) => [r.label, r.male, r.female, r.total, r.share]));
      }
      let rows = list;
      let title = `Members — ${type}`;
      if (type === 'By GKK') {
        rows = [...list].sort(byGkk((m) => m.household_gkk, (a, b) => a.household_name.localeCompare(b.household_name)));
      }
      if (type === 'By Sacrament' && sacrament) {
        const s = SACRAMENTS.find((x) => x.key === sacrament);
        const notYet = received === 'Not yet';
        rows = list.filter((m) => (notYet ? missingSacrament(m, s.key) : m[s.has]))
          .sort(byGkk((m) => m.household_gkk, (a, b) => (a.age ?? 999) - (b.age ?? 999)));
        title = notYet ? `Not yet received: ${s.label}` : `Received: ${s.label}`;
      }
      if (type === 'By Ministry / Organization' && group) {
        rows = list.filter((m) => (m.ministries || []).includes(group) || (m.organizations || []).includes(group));
        title = `Members — ${group}`;
      }
      if (type === 'By age group') {
        const g = AGE_GROUPS.find((x) => x.key === ageGroup) || AGE_GROUPS[0];
        rows = list.filter((m) => inAgeGroup(m, g.key)).sort((a, b) => a.age - b.age || personName(a).localeCompare(personName(b)));
        title = `Members — ${g.label}`;
      }
      const gkks = new Set(rows.map((m) => m.household_gkk || ''));
      const minAge = type === 'By Sacrament' && received === 'Not yet' && SACRAMENT_MIN_AGE[sacrament]
        ? `, ${SACRAMENT_MIN_AGE[sacrament]} and up or with no birth date` : '';
      return table(title, `${rows.length} current member(s)${minAge}${type === 'By GKK' ? ` in ${gkks.size} GKK(s)` : ''}${where}`, memberColumns, rows.map(memberCells));
    }

    if (source === 'Families') {
      let houses;
      try {
        houses = await fetchAll(() => supabase.from('households_with_count')
          .select('id, household_name, ref_no, gkk, member_count, family_count').order('household_name').order('id'));
      } catch (e) {
        if (/family_count/.test(e.message || '')) throw new Error('Run the 0054_household_families.sql migration in Supabase to use the Families reports');
        throw e;
      }
      if (gkk && gkk !== 'All') houses = houses.filter((h) => h.gkk === gkk);
      if (type === 'By GKK') {
        const rows = familiesByGkkRows(houses);
        const families = rows.reduce((n, r) => n + r.families, 0);
        return table('Families by GKK', `${families} famil${families === 1 ? 'y' : 'ies'} in ${houses.length} household(s)`,
          ['GKK', 'Households', 'Families', 'Households with 2+ families', 'Members'],
          rows.map((r) => [r.label, r.households, r.families, r.multi, r.members]));
      }
      // Households with more than one family, each followed by its members
      // family by family. The CSV gives every member a line of their own.
      const multi = houses.filter((h) => h.family_count > 1);
      const members = multi.length ? await fetchAll(() => supabase.from('members_with_household')
        .select('id, household_id, family_no, first_name, last_name, suffix, relationship, age, membership_status, is_current')
        .in('household_id', multi.map((h) => h.id)).order('id')) : [];
      const columns = ['Household', 'GKK', 'Ref no', 'Families', 'Family heads', 'Members'];
      const detail = ['Family', 'Member', 'Relationship', 'Age'];
      const rows = multi.map((h) => {
        const families = familiesOf(members.filter((m) => m.household_id === h.id)).map((g) => ({
          title: familyTitle(g),
          head: familyHeadName(g.head),
          members: g.members.map((m) => ({
            name: familyHeadName(m),
            relationship: bis(RELATIONSHIP_LABELS, m.relationship) || '—',
            age: m.age ?? '—',
            note: m.is_current === false ? m.membership_status : '',
          })),
        }));
        const cells = [
          h.household_name, h.gkk || '—', h.ref_no || '—', h.family_count,
          families.map((f) => f.head).filter(Boolean).join('; ') || '—',
          h.member_count,
        ];
        const csvLines = [
          [...cells, ...detail.map(() => '')],
          ...families.flatMap((f) => f.members.map((m) => [...columns.map(() => ''), f.title, m.note ? `${m.name} (${m.note})` : m.name, m.relationship, m.age])),
        ];
        return { cells, families, csvLines };
      });
      return { ...table('Households with more than one family', `${multi.length} household(s), members grouped by family`, columns, []), rows, empty: !rows.length, csvColumns: [...columns, ...detail] };
    }

    throw new Error('Unsupported source');
  },

  // ---- exports (client-side CSV now — no backend to stream a download from)
  exportUrl: (name) => `/exports/${name}`,

  /**
   * Data for the Membership Activeness analysis: current members with their
   * Practicing Catholic status (0017), and the participation answers behind
   * each score — the member's latest census answers, else the household's
   * registration survey. `gkk` narrows it to one GKK ('None' = no GKK).
   * activeness_members() (0077) works each score out once; before it, the
   * view works it out once per column and times out for a whole parish.
   * `cycleId` (0084) makes it that census as it stood: its members, each
   * scored on their answers in it alone, with their status in it.
   */
  async activenessData({ gkk = 'All', cycleId = null } = {}) {
    let members;
    const args = cycleId ? { p_gkk: gkk, p_cycle: Number(cycleId) } : { p_gkk: gkk };
    const { data, error } = await fetchAllPages((from, to) => supabase.rpc('activeness_members', args).order('id').range(from, to));
    if (!error) members = data;
    else if (cycleId) throw missingMigration(error, '0084_activeness_by_census.sql') || mapError(error);
    else if (!isMissingFunction(error)) throw mapError(error);
    else {
      const cols = 'id, first_name, last_name, suffix, household_id, household_name, household_gkk, age, sex, contact, membership_status, '
        + 'practice_level, practice_score, practice_participation, practice_sacraments, practice_involvement, practice_source, practice_source_label, practice_trend';
      try {
        members = await fetchAll(() => {
          let q = supabase.from('members_with_household').select(cols).eq('is_current', true);
          if (gkk === 'None') q = q.is('household_gkk', null);
          else if (gkk !== 'All') q = q.eq('household_gkk', gkk);
          return q.order('id');
        });
      } catch (e) {
        if (/practice_/.test(e.message || '')) throw new Error('Run the 0017_practicing_status.sql migration in Supabase to use the activeness analysis');
        if (/statement timeout/.test(e.message || '')) throw new Error('Run the 0077_faster_activeness_report.sql migration in Supabase to analyse this many members');
        throw e;
      }
    }
    const householdIds = [...new Set(members.map((m) => m.household_id))];
    const [households, responses] = await Promise.all([
      householdIds.length ? fetchAll(() => supabase.from('households').select('id, participation').order('id')) : [],
      // Before 0007 there is no census table; every score then comes from the household survey.
      fetchAll(() => {
        let q = supabase.from('census_member_responses').select('member_id, cycle_id, participation');
        if (cycleId) q = q.eq('cycle_id', Number(cycleId));
        return q.order('cycle_id', { ascending: false }).order('member_id');
      }).catch(() => []),
    ]);
    const surveyOf = new Map(households.map((h) => [h.id, h.participation || {}]));
    const latestOf = new Map();
    for (const r of responses) {
      if (!latestOf.has(r.member_id) && r.participation && Object.keys(r.participation).length) latestOf.set(r.member_id, r.participation);
    }
    // One census's analysis counts only its own answers, never the household survey.
    const answers = new Map(members.map((m) => [m.id, latestOf.get(m.id) || (cycleId ? {} : surveyOf.get(m.household_id)) || {}]));
    return { members, answers };
  },

  async exportGenerated({ title, columns, rows }) {
    if (!columns || !rows) throw new Error('Nothing to export');
    // A row may bring several CSV lines (`csvLines`), e.g. a household and its members.
    const csv = toCsv(
      rows.flatMap((r) => r.csvLines || [r.cells]).map((cells) => Object.fromEntries(cells.map((c, i) => [columns[i], c]))),
      columns.map((label) => ({ label, value: label }))
    );
    return new Blob([csv], { type: 'text/csv;charset=utf-8' });
  },
};

const OFFICE_TEXT_FIELDS = ['mobile', 'facebook_url', 'sick_call_contact', 'directions', 'map_url', 'secretary_messenger'];

const WEBSITE_TABLES = ['mass_schedules', 'sacrament_guides', 'announcements', 'bulletins', 'events', 'articles', 'history_articles'];

const GKK_DETAIL_FIELDS = ['puroks', 'chapel_address', 'year_established','meeting_schedule', 'meeting_place', 'coordinator_name', 'coordinator_mobile', 'coordinator_public', 'coordinator_consent_on', 'previous_households', 'previous_families', 'history', 'history_photos', 'history_published', 'photo_url', 'photos'];

const GKK_DOCS_BUCKET = 'gkk-documents';

/** Before 0044 the GKK's history columns and documents table don't exist; say which file adds them. */
function gkk44Missing(error) {
  return ['42703', 'PGRST204', '42P01', 'PGRST205'].includes(error?.code) && /history|gkk_documents/.test(error?.message || '');
}
const GKK_44_HINT = 'Run the 0044_gkk_history_documents.sql migration in Supabase to save GKK history and documents';
/** Before 0046 the GKK page's photo columns don't exist. */
const gkk46Missing = (error) => ['42703', 'PGRST204'].includes(error?.code) && /photo_url|photos/.test(error?.message || '');
const GKK_46_HINT = "Run the 0046_gkk_photos.sql migration in Supabase to save the GKK page's photos";
/** Before 0079 there's no Families last year column. */
const gkk79Missing = (error) => ['42703', 'PGRST204'].includes(error?.code) && /previous_families/.test(error?.message || '');
const GKK_79_HINT = 'Run the 0079_census_families.sql migration in Supabase to save Families last year';

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
  // Text pasted from Facebook often uses "bold" math letters the site's fonts can't draw.
  return (data || []).map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, plainLetters(v)])));
}

/** Insert a row (no id) or update it (with id). Blank strings save as null. */
async function saveWebsiteRow(table, row, dupLabel) {
  // The photo name counters (0029) belong to the media-upload function.
  const { id, created_at: _c, updated_at: _u, cover_seq: _cs, photo_seq: _ps, ...fields } = row;
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

const REQUEST_TABLES = ['certificate_requests', 'blood_requests', 'blood_donors', 'sacrament_requests'];

// The columns staff may set on each request table. Ref numbers, who handled
// it and the timestamps are filled in by the database.
const CERT_FIELDS = [
  'cert_type', 'status', 'source', 'subject_first_name', 'subject_middle_name', 'subject_last_name', 'subject_birth_date',
  'sacrament_date', 'sacrament_year', 'sacrament_place', 'father_name', 'mother_name', 'spouse_name', 'purpose', 'copies',
  'requester_name', 'requester_mobile', 'requester_email', 'relationship', 'message',
  'member_id', 'fee', 'or_number', 'released_to', 'public_note', 'staff_notes',
];
const BLOOD_REQUEST_FIELDS = [
  'patient_name', 'blood_type', 'units', 'hospital', 'needed_by', 'contact_name', 'contact_mobile', 'relationship', 'notes',
  'allow_public', 'show_publicly', 'status', 'source', 'staff_notes',
];
const SACRAMENT_FIELDS = [
  'sacrament', 'person_name', 'baptism_status', 'location', 'preferred_date', 'urgent',
  'requester_name', 'requester_mobile', 'relationship', 'message', 'status', 'source', 'scheduled_on', 'staff_notes', 'member_id',
];
// A request's linked member, as the Requests page shows them.
const LINKED_MEMBER_COLUMNS = 'id, first_name, middle_name, last_name, suffix, dob, household:households(household_name, gkk)';
const DONOR_FIELDS = ['full_name', 'mobile', 'blood_type', 'gkk', 'member_id', 'last_donated_on', 'source', 'opted_out_at', 'notes'];

function requestsError(error) {
  // Before 0012 is run the tables don't exist; say which file fixes it.
  if (error.code === '42P01' || error.code === 'PGRST205') return new Error('Run the 0012_requests.sql migration in Supabase to use this page');
  return mapError(error);
}

const ORG_HINT = 'Run the 00571_org_chart.sql migration in Supabase to use Organization Structure';
/** A missing org chart table or function: 0057 hasn't been run. */
function orgMissing(error) {
  return ['42P01', 'PGRST205'].includes(error?.code) || isMissingFunction(error);
}
async function orgRpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (orgMissing(error)) throw new Error(ORG_HINT);
  if (error) throw mapError(error);
  return data;
}

const STRUCTURE_HINT = 'Run the 0081_gkk_structure_leaders.sql migration in Supabase to fill in GKK structures';
async function structureRpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (orgMissing(error)) throw new Error(STRUCTURE_HINT);
  if (error) throw mapError(error);
  return data;
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
  const { data, error } = await q.select(table === 'certificate_requests' ? CERT_SELECT : '*').single();
  if (error) throw mapError(error, { dupLabel });
  return data;
}

const GROUP_COLUMNS = ['ministries', 'organizations'];

// A certificate request with its linked member and which of that member's
// sacraments are verified against the register (certClaimState).
const CERT_SELECT = '*, member:members(*, verifications:sacrament_verifications(sacrament))';

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
    // A Practicing Catholic level (0017), e.g. 'Aktibo'.
    practice = 'All',
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

  if (practice !== 'All') q = q.eq('practice_level', practice);
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
  const { data, error } = await supabase.from('members').select(`${column}, sex`).eq('id', memberId).single();
  if (error) throw mapError(error, { fallback: 'Member not found' });
  // Kaabag and other men-only ministries (0038); the database refuses it too.
  if (join && column === 'ministries' && menOnlyBlocked(name, data.sex, await api.menOnlyMinistries(), (data.ministries || []).includes(name))) {
    throw new Error(menOnlyMessage(name));
  }
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
/** Call the media-upload Edge Function (R2 photos), with a setup hint when it isn't deployed. */
async function callMediaFunction(body) {
  const { data, error } = await supabase.functions.invoke('media-upload', { body });
  if (!error) return data;
  const res = error.context;
  const payload = res && typeof res.json === 'function' ? await res.json().catch(() => null) : null;
  if (payload?.error) throw new Error(payload.error);
  if (res?.status === 404 || error.name === 'FunctionsFetchError') {
    throw new Error('Photo uploads aren’t set up yet: deploy the media-upload Edge Function (see docs/media-storage.md).');
  }
  throw new Error(error.message || 'Request failed');
}

async function callNotifyFunction(body) {
  const { data, error } = await supabase.functions.invoke('notify-staff', { body });
  if (!error) return data;
  const res = error.context;
  const payload = res && typeof res.json === 'function' ? await res.json().catch(() => null) : null;
  if (payload?.error) throw new Error(payload.error);
  if (res?.status === 404 || error.name === 'FunctionsFetchError') {
    throw new Error('Phone notifications aren’t set up yet: deploy the notify-staff Edge Function (see docs/notifications.md).');
  }
  throw new Error(error.message || 'Request failed');
}

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
  { label: 'Family', value: (r) => r.family_no ?? 1 },
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
  { label: 'Families', value: (r) => r.family_count ?? 1 },
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
// The most households a member-name search adds to the results, so the id
// list stays a sensible size in the request URL.
const MEMBER_MATCH_LIMIT = 300;

/**
 * Members whose name matches `search`, grouped by household, so the
 * Households search can find a family by anyone in it:
 * { ids: [household_id…], byHousehold: Map(household_id → [member…]) }.
 * Returns null for an empty search.
 */
async function memberNameMatches(search) {
  const s = String(search || '').trim();
  if (!s) return null;
  const like = `%${s}%`;
  const { data, error } = await supabase.from('members_with_household')
    .select('id, household_id, first_name, middle_name, last_name, suffix, relationship')
    .or(`full_name.ilike.${like},first_name.ilike.${like},middle_name.ilike.${like},last_name.ilike.${like}`)
    .order('household_id').order('id')
    .limit(1000);
  if (error) throw mapError(error);
  const byHousehold = new Map();
  for (const m of data || []) {
    if (!byHousehold.has(m.household_id)) {
      if (byHousehold.size >= MEMBER_MATCH_LIMIT) break;
      byHousehold.set(m.household_id, []);
    }
    byHousehold.get(m.household_id).push(m);
  }
  return { ids: [...byHousehold.keys()], byHousehold };
}

/** listHouseholds-style params plus the households a member-name search adds. */
async function withMemberMatches(params = {}) {
  const matches = await memberNameMatches(params.search);
  return { params: matches ? { ...params, memberHouseholdIds: matches.ids } : params, matches };
}

// groupBy: 'gkk' or 'family_grouping' sorts by that first, so the Households
// page can show the rows in groups; the chosen sort applies within a group.
// family_grouping orders FG 1, FG 2 … FG 10 (family_grouping_no, 0057).
function householdQuery(q, { status = 'All', gkk = 'All', search = '', ids, memberHouseholdIds, sortKey = 'registered', sortDir, groupBy } = {}) {
  if (status !== 'All') q = q.eq('status', status);
  if (gkk !== 'All') q = q.eq('gkk', gkk);
  if (ids) q = q.in('id', ids);
  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    // Also any household with a member whose name matches (memberNameMatches).
    const byMember = memberHouseholdIds?.length ? `,id.in.(${memberHouseholdIds.join(',')})` : '';
    q = q.or(`household_name.ilike.${s},head_name.ilike.${s},street.ilike.${s},barangay.ilike.${s},city.ilike.${s},contact.ilike.${s},ref_no.ilike.${s}${byMember}`);
  }
  const col = HOUSEHOLD_SORTS[sortKey] || HOUSEHOLD_SORTS.registered;
  // Dates read newest first unless asked otherwise; names and counts A→Z / low→high.
  const ascending = sortDir ? sortDir === 'asc' : !['created_at', 'updated_at'].includes(col);
  if (groupBy === 'gkk' && col !== 'gkk') q = q.order('gkk', { nullsFirst: false });
  else if (groupBy === 'family_grouping') q = q.order('family_grouping_no', { nullsFirst: false }).order('family_grouping', { nullsFirst: false });
  q = q.order(col, { ascending, nullsFirst: false });
  if (col !== 'household_name') q = q.order('household_name', { ascending: true });
  return q.order('id', { ascending: true });
}

// Reports → Generate Report: a ministry or organization with fewer current members than this is "small".
const SMALL_GROUP = 5;

// The member columns the reports read (not select('*'), which works out
// every member's Practicing Catholic score).
const REPORT_MEMBER_COLUMNS = 'id, household_id, family_no, first_name, last_name, suffix, relationship, sex, dob, age, civil_status, contact, religion, tribe, '
  + 'blood_type, has_baptism, baptism_date, has_communion, communion_date, has_confirmation, conf_date, has_matrimony, mat_date, mat_type, '
  + 'ministries, organizations, gkk_role, parish_role, membership_status, status_updated_at, is_current, household_name, household_gkk';

/**
 * Every member for a report: current members only (not Moved away or
 * Deceased) unless `current` is false, in one GKK unless `gkk` is 'All'.
 */
async function reportMembers({ gkk = 'All', columns = REPORT_MEMBER_COLUMNS, current = true } = {}) {
  return fetchAll(() => {
    let q = supabase.from('members_with_household').select(columns);
    if (current) q = q.eq('is_current', true);
    if (gkk && gkk !== 'All') q = q.eq('household_gkk', gkk);
    return q.order('household_name').order('id');
  });
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
  } else if (path === '/exports/rosters.csv') {
    // One row per member per ministry or organization.
    const data = await fetchAll(() => supabase.from('members_with_household')
      .select('id, first_name, last_name, suffix, household_name, household_gkk, contact, ministries, organizations, gkk_role, parish_role')
      .eq('is_current', true).order('id'));
    const rows = data.flatMap((m) => [
      ...(m.ministries || []).map((g) => ({ ...m, group: g, kind: 'Ministry' })),
      ...(m.organizations || []).map((g) => ({ ...m, group: g, kind: 'Organization' })),
    ]).sort((a, b) => a.group.localeCompare(b.group) || memberFullName(a).localeCompare(memberFullName(b)));
    downloadCsv(filename, rows, [
      { label: 'Group', value: 'group' }, { label: 'Kind', value: 'kind' },
      { label: 'Name', value: (r) => memberFullName(r) }, { label: 'Household', value: 'household_name' },
      { label: 'GKK', value: 'household_gkk' }, { label: 'Contact', value: 'contact' },
    ]);
  } else if (path === '/exports/certificates.csv') {
    const data = await fetchAll(() => supabase.from('certificate_requests').select('*').order('created_at').order('id'));
    downloadCsv(filename, data, [
      { label: 'Reference No.', value: 'ref_no' }, { label: 'Certificate', value: (r) => certTypeLabel(r.cert_type) },
      { label: 'Status', value: 'status' }, { label: 'Source', value: 'source' },
      { label: 'Name on certificate', value: (r) => [r.subject_first_name, r.subject_middle_name, r.subject_last_name].filter(Boolean).join(' ') },
      { label: 'Requested by', value: 'requester_name' }, { label: 'Mobile', value: 'requester_mobile' },
      { label: 'Purpose', value: 'purpose' }, { label: 'Copies', value: 'copies' }, { label: 'Fee', value: 'fee' }, { label: 'OR No.', value: 'or_number' },
      { label: 'Received', value: (r) => r.created_at?.slice(0, 10) }, { label: 'Released', value: (r) => r.released_at?.slice(0, 10) || '' },
      { label: 'Released to', value: 'released_to' }, { label: 'Handled by', value: 'handled_by_name' },
    ]);
  } else if (path === '/exports/sacrament-requests.csv') {
    const data = await fetchAll(() => supabase.from('sacrament_requests').select('*').order('created_at').order('id'));
    downloadCsv(filename, data, [
      { label: 'Reference No.', value: 'ref_no' }, { label: 'Sacrament', value: (r) => sacramentRequestLabel(r.sacrament) },
      { label: 'Status', value: 'status' }, { label: 'Urgent', value: (r) => (r.urgent ? 'Yes' : '') }, { label: 'Source', value: 'source' },
      { label: 'Person', value: 'person_name' }, { label: 'Where', value: 'location' }, { label: 'Baptized?', value: 'baptism_status' },
      { label: 'Requested by', value: 'requester_name' }, { label: 'Relationship', value: 'relationship' }, { label: 'Mobile', value: 'requester_mobile' },
      { label: 'Preferred date', value: (r) => r.preferred_date || '' }, { label: 'Scheduled on', value: (r) => r.scheduled_on || '' },
      { label: 'Received', value: (r) => r.created_at?.slice(0, 10) }, { label: 'Handled by', value: 'handled_by_name' },
    ]);
  } else if (path === '/exports/blood-requests.csv') {
    const data = await fetchAll(() => supabase.from('blood_requests').select('*').order('created_at').order('id'));
    downloadCsv(filename, data, [
      { label: 'Reference No.', value: 'ref_no' }, { label: 'Status', value: 'status' }, { label: 'Source', value: 'source' },
      { label: 'Patient', value: 'patient_name' }, { label: 'Blood type', value: 'blood_type' }, { label: 'Units', value: 'units' },
      { label: 'Hospital', value: 'hospital' }, { label: 'Needed by', value: (r) => r.needed_by || '' },
      { label: 'Contact person', value: 'contact_name' }, { label: 'Relationship', value: 'relationship' }, { label: 'Mobile', value: 'contact_mobile' },
      { label: 'Received', value: (r) => r.created_at?.slice(0, 10) }, { label: 'Status changed', value: (r) => r.status_changed_at?.slice(0, 10) || '' },
      { label: 'Handled by', value: 'handled_by_name' },
    ]);
  } else if (path === '/exports/donors.csv') {
    const data = await fetchAll(() => supabase.from('blood_donors').select('*').order('full_name').order('id'));
    downloadCsv(filename, data, [
      { label: 'Name', value: 'full_name' }, { label: 'Mobile', value: 'mobile' }, { label: 'Blood type', value: 'blood_type' },
      { label: 'GKK', value: 'gkk' }, { label: 'Last donated', value: 'last_donated_on' },
      { label: 'Opted out', value: (r) => (r.opted_out_at ? 'Yes' : 'No') }, { label: 'Notes', value: 'notes' },
    ]);
  } else if (path === '/exports/activity.csv') {
    const data = await fetchAll(() => supabase.from('activity_log').select('*').order('at', { ascending: false }).order('id', { ascending: false }));
    downloadCsv(filename, data, [
      { label: 'When', value: (r) => new Date(r.at).toISOString().replace('T', ' ').slice(0, 19) },
      { label: 'Who', value: (r) => r.actor_name || 'The family (online)' }, { label: 'Action', value: 'action' },
      { label: 'Record', value: 'table_name' }, { label: 'Name', value: 'label' },
      { label: 'Changes', value: (r) => (r.changes ? JSON.stringify(r.changes) : '') },
    ]);
  } else {
    throw new Error(`Unknown export: ${path}`);
  }
}

export { triggerDownload } from './lib/csv.js';
