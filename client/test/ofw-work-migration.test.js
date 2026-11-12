import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 0122_ofw_work_fields.sql, read as text: no country and no year home, a
// contract year only abroad now, and each function it rewrites keeps what
// 0121 gave it otherwise.
const sql = readFileSync(new URL('../../supabase/migrations/0122_ofw_work_fields.sql', import.meta.url), 'utf8');
const fn = (name) => {
  const start = sql.search(new RegExp(`create or replace function public\\.${name}\\(`, 'i'));
  assert.ok(start >= 0, `${name} is rewritten`);
  const ends = ['\n$function$;', '\n$$;'].map((e) => sql.indexOf(e, start)).filter((i) => i > 0);
  return sql.slice(start, Math.min(...ends));
};

test('refuses to run before 0121', () => {
  assert.match(sql.slice(0, sql.indexOf('end;')), /column_name = 'ofw_status'/);
  assert.match(sql, /raise exception 'Run the migrations up to 0121_member_ofw\.sql before this one'/);
});

test('the country and the year home go, the view first and back after', () => {
  const cleanup = sql.slice(sql.indexOf("column_name in ('ofw_country', 'ofw_returned')"));
  assert.match(cleanup, /^column_name in \('ofw_country', 'ofw_returned'\)\) then\s+drop view if exists public\.members_with_household;/);
  assert.match(cleanup, /drop column if exists ofw_country, drop column if exists ofw_returned;/);
  assert.ok(sql.indexOf('create or replace view public.members_with_household') > sql.indexOf('drop column if exists ofw_country'));
  assert.match(sql, /grant select on members_with_household to authenticated;/);
  const rest = sql.slice(sql.indexOf('end;', sql.indexOf('drop column if exists ofw_country')));
  assert.doesNotMatch(rest, /ofw_country|'ofw_returned'|m\.ofw_returned|ofwCountry|ofwReturned/, 'nothing after the cleanup reads them');
});

test('a contract year only abroad now: the trigger, then the old ones cleared, then the check', () => {
  const tidy = fn('members_ofw_tidy');
  assert.match(tidy, /if new\.ofw_status is distinct from 'Abroad' then new\.ofw_since := null; end if;/);
  assert.match(tidy, /\(new\.ofw_status, new\.ofw_since\) is distinct from \(old\.ofw_status, old\.ofw_since\)/);
  const at = (s) => { const i = sql.indexOf(s); assert.ok(i > 0, s); return i; };
  const update = at("update members set ofw_since = null where ofw_since is not null and ofw_status is distinct from 'Abroad';");
  assert.ok(at('create or replace function public.members_ofw_tidy()') < update, 'the new trigger is in place before the update');
  assert.ok(update < at('alter table members add constraint members_ofw_years_check'));
  assert.match(sql, /ofw_since is null or ofw_status = 'Abroad'/);
});

test('the view and the forms\' functions without the two columns, keeping 0121\'s checks', () => {
  const view = sql.slice(sql.indexOf('create or replace view public.members_with_household'));
  assert.match(view, /m\.family_no,\s+m\.occupation_group,\s+m\.ofw_status,\s+m\.ofw_since,\s+m\.ofw_updated_at,/);
  assert.match(view, /AS household_ofw/);
  for (const [name, checks] of [
    ['submit_registration_base', ["'Data privacy consent is required'", 'check_payload_families']],
    ['submit_family_registration_base', ['household_code_check']],
    ['create_household_base', ["'At least one member is required'"]],
  ]) {
    const body = fn(name);
    for (const c of checks) assert.ok(body.includes(c), `${name} keeps ${c}`);
    assert.match(body, /occupation_group, ofw_status, ofw_since\)\s+values/, name);
    assert.match(body, /ofw_year\(mem->>'ofwSince'\)\)/, name);
    assert.match(body, /insert into member_blood_types/, name);
  }
  assert.match(fn('portal_member_fields'), /'ofw_status', m\.ofw_status, 'ofw_since', m\.ofw_since\);/);
  assert.match(fn('portal_clean_member_fields'), /if ofw is distinct from 'Abroad' then since_val := 'null'::jsonb; end if;/);
  const approve = fn('census_approve_submission');
  assert.match(approve, /'Only parish staff can approve online updates'/);
  assert.match(approve, /if pf->>'blood_type' = any\(blood_types\(\)\) then/);
  assert.match(approve, /\(pf->>'ofw_status', pf->>'ofw_since'\) is distinct from \(bm->>'ofw_status', bm->>'ofw_since'\)/);
  const merge = fn('merge_members');
  assert.match(merge, /perform require_full_access\('merge members'\)/);
  assert.match(merge, /ofw_since\s+= case when k\.ofw_status is not null then k\.ofw_since else o\.ofw_since end/);
});

test('Report Stats: members abroad by kind of work, and still their GKK only for a leader', () => {
  const stats = fn('admin_report_stats');
  assert.match(stats, /'by_work', \(/);
  assert.doesNotMatch(stats, /by_country|gkk_leader/);
  assert.ok(sql.indexOf("alter function public.admin_report_stats() set application_name = 'parish:own_gkk_only';") > sql.search(/CREATE OR REPLACE FUNCTION public\.admin_report_stats/));
  assert.doesNotMatch(sql, /^grant .* to anon/m, 'nothing new for the public');
});
