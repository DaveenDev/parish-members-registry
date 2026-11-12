import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 0121_member_ofw.sql, read as text: the columns and checks, the views' new
// columns, and that each function it rewrites keeps what it had.
const sql = readFileSync(new URL('../../supabase/migrations/0121_member_ofw.sql', import.meta.url), 'utf8');
const fn = (name) => {
  const start = sql.search(new RegExp(`create or replace function public\\.${name}\\(`, 'i'));
  assert.ok(start >= 0, `${name} is rewritten`);
  const ends = ['\n$function$;', '\n$$;'].map((e) => sql.indexOf(e, start)).filter((i) => i > 0);
  return sql.slice(start, Math.min(...ends));
};
const view = (name) => {
  const start = sql.search(new RegExp(`create (or replace )?view (public\\.)?${name}\\b`, 'i'));
  assert.ok(start >= 0, name);
  return sql.slice(start, sql.indexOf(';', start));
};

test('refuses to run before 0120 and is safe to re-run', () => {
  const guard = sql.slice(sql.indexOf('do $$'), sql.indexOf('end;'));
  assert.match(guard, /member_blood_types_select/);
  assert.match(sql, /raise exception 'Run the migrations up to 0120_leader_blood_types\.sql before this one'/);
  assert.equal((sql.match(/add column(?! if not exists)/g) || []).length, 0, 'every column is "if not exists"');
  for (const c of ['occupation_group', 'ofw_status', 'ofw_country', 'ofw_since', 'ofw_returned', 'ofw_updated_at']) {
    assert.match(sql, new RegExp(`add column if not exists ${c} `), c);
  }
  for (const k of ['members_occupation_group_check', 'members_ofw_status_check', 'members_ofw_country_check', 'members_ofw_years_check']) {
    assert.match(sql, new RegExp(`drop constraint if exists ${k};\\s+alter table members add constraint ${k}`), k);
  }
});

test('the checks', () => {
  assert.match(sql, /check \(ofw_status is null or ofw_status in \('Abroad', 'Returned'\)\)/);
  assert.match(sql, /length\(ofw_country\) <= 60/);
  assert.match(sql, /length\(occupation_group\) <= 60 and occupation_group = any\(occupation_groups\(\)\)/);
  assert.match(sql, /ofw_since between 1950 and 2100/);
  assert.match(sql, /ofw_returned >= ofw_since/);
  assert.match(sql, /ofw_returned is null or ofw_status = 'Returned'/);
  assert.match(sql, /create index if not exists members_ofw_household_idx on members \(household_id\) where ofw_status is not null;/);
  const tidy = fn('members_ofw_tidy');
  assert.match(tidy, /if new\.ofw_status is null then\s+new\.ofw_country := null; new\.ofw_since := null; new\.ofw_returned := null;/);
  assert.match(tidy, /extract\(year from current_date\) \+ 1/);
  assert.match(sql, /create trigger trg_members_ofw_tidy before insert or update on members/);
});

test('the household flag counts only current members, abroad now (and back home apart)', () => {
  const v = view('households_with_count');
  assert.match(v, /m\.ofw_status = 'Abroad' and member_is_current\(m\.membership_status\)\) as ofw_abroad_count/);
  assert.match(v, /m\.ofw_status = 'Returned' and member_is_current\(m\.membership_status\)\) as ofw_returned_count/);
  assert.match(v, /family_grouping_no,\s+\(select count/, 'the new columns come after 0057\'s');
  assert.match(sql, /grant select on households_with_count to authenticated;/);
  const mv = view('members_with_household');
  assert.match(mv, /m\.family_no,\s+m\.occupation_group,\s+m\.ofw_status,\s+m\.ofw_country,\s+m\.ofw_since,\s+m\.ofw_returned,\s+m\.ofw_updated_at,/);
  assert.match(mv, /x\.ofw_status = 'Abroad'::text\) AND member_is_current\(x\.membership_status\)\)\)\) AS household_ofw/);
  assert.match(mv, /with \(security_invoker = true\)/);
  assert.match(mv, /SELECT b\.blood_type\s+FROM member_blood_types b/, 'as 0062 otherwise');
});

test('registration, the family form and New Household save the answer, keeping their checks', () => {
  for (const [name, checks] of [
    ['submit_registration_base', ["'Data privacy consent is required'", "'A household can have at most 30 members'", 'check_payload_families']],
    ['submit_family_registration_base', ['household_code_check', "'Exactly one Head of Family is required'"]],
    ['create_household_base', ["'At least one member is required'", 'check_payload_families']],
  ]) {
    const body = fn(name);
    for (const c of checks) assert.ok(body.includes(c), `${name} keeps ${c}`);
    assert.match(body, /occupation_group, ofw_status, ofw_country, ofw_since, ofw_returned\)\s+values/, name);
    assert.match(body, /where g = trim\(mem->>'occupationGroup'\)/, name);
    assert.match(body, /ofw_year\(mem->>'ofwSince'\), ofw_year\(mem->>'ofwReturned'\)/, name);
    assert.match(body, /insert into member_blood_types/, `${name} keeps the blood type`);
  }
  assert.doesNotMatch(fn('create_household_base'), /gkk_leader/, 'as 0120: a leader\'s blood type is kept');
});

test('the census portal: families see and change occupation and the OFW answer', () => {
  assert.match(fn('portal_member_fields'), /'occupation', m\.occupation, 'occupation_group', m\.occupation_group,\s+'ofw_status', m\.ofw_status/);
  const clean = fn('portal_clean_member_fields');
  assert.match(clean, /occ_group = any\(occupation_groups\(\)\)/);
  assert.match(clean, /ofw = any\(ofw_statuses\(\)\)/);
  assert.match(clean, /'ofw_returned', coalesce\(home_val, 'null'::jsonb\)/);
  const submit = fn('portal_submit');
  assert.match(submit, /portal_check\(p_ref, p_code\)/);
  assert.match(submit, /'Data privacy consent is required'/);
  assert.match(submit, /portal_new_member_details\(e\)/, 'as 0090');
  assert.match(submit, /'ofw_asked', e \? 'ofw_status'/);
  assert.match(submit, /update members m set ofw_updated_at = current_date/);
  const approve = fn('census_approve_submission');
  assert.match(approve, /'Only parish staff can approve online updates'/);
  assert.match(approve, /'This census is closed\. Reopen it to approve updates\.'/);
  assert.match(approve, /if pf->>'blood_type' = any\(blood_types\(\)\) then/, 'keeps 0120\'s blood type');
  assert.match(approve, /ofw_status {3}= case when ofw_changed then/);
  assert.match(approve, /occupation_group, ofw_status, ofw_country, ofw_since, ofw_returned\)\s+values/);
});

test('merges keep one OFW answer whole; the other functions keep their guards and settings', () => {
  const merge = fn('merge_members');
  assert.match(merge, /perform require_full_access\('merge members'\)/);
  for (const c of ['ofw_status', 'ofw_country', 'ofw_since', 'ofw_returned', 'ofw_updated_at']) {
    assert.match(merge, new RegExp(`${c}\\s+= case when k\\.ofw_status is not null then k\\.${c} else o\\.${c} end`), c);
  }
  assert.match(merge, /occupation_group = coalesce\(k\.occupation_group, o\.occupation_group\)/);

  const stats = fn('admin_report_stats');
  assert.match(stats, /'sacrament_missing'/, 'started from 0120 (0070)');
  assert.doesNotMatch(stats, /gkk_leader/, 'leaders keep their blood types (0120)');
  assert.match(stats, /'ofw', \(/);
  assert.match(stats, /'occupation_groups', \(/);
  for (const f of ['admin_report_stats()', 'census_summary(integer)']) {
    const at = sql.search(new RegExp(`create or replace function public\\.${f.split('(')[0]}\\(`, 'i'));
    assert.ok(at >= 0, f);
    assert.ok(sql.indexOf(`alter function public.${f} set application_name = 'parish:own_gkk_only';`, at) > at, `${f} keeps its own-GKK setting`);
  }
  assert.match(fn('census_summary'), /then 'Abroad' else 'Not confirmed' end/);
  assert.match(fn('census_keep_results'), /ofw = excluded\.ofw/);
  assert.match(sql, /revoke all on function public\.census_keep_results\(integer, jsonb\) from public, anon, authenticated;/);
  assert.match(fn('member_practice_from'), /if m\.ofw_status = 'Abroad' and member_is_current\(m\.membership_status\) then\s+result\.score := null;\s+result\.level := 'Abroad';/);
});

test('nothing for the public website', () => {
  for (const f of ['public_census_result', 'public_parish_stats', 'anon']) {
    assert.ok(!new RegExp(`function public\\.${f}`).test(sql), f);
  }
  // The only grant to the public is the census portal's own, as in 0090.
  assert.deepEqual(sql.match(/^grant .* to anon.*$/gm), ['grant execute on function public.portal_submit(text, text, jsonb) to anon, authenticated;']);
});
