import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOOD_TYPES } from '../src/constants.js';

// 0120: GKK leaders see and change their GKK's blood types, and the census
// portal asks a new member's. Read from the migration's text.
const sql = readFileSync(new URL('../../supabase/migrations/0120_leader_blood_types.sql', import.meta.url), 'utf8');
// A function's text, from its "create or replace" to the end of its body.
const fn = (name) => {
  const start = sql.search(new RegExp(`create or replace function public\\.${name}\\(`, 'i'));
  assert.ok(start >= 0, name);
  const ends = ['\n$function$;', '\n$$;'].map((e) => sql.indexOf(e, start)).filter((i) => i > 0);
  return sql.slice(start, Math.min(...ends));
};

test('refuses to run before 0118', () => {
  assert.match(sql.slice(0, sql.indexOf('end;')), /to_regprocedure\('public\.public_parish_hero_position\(\)'\) is null/);
  assert.match(sql, /raise exception 'Run the migrations up to 0118_hero_position\.sql before this one'/);
});

test('leaders read and write the blood types of the members they may see; clergy still none', () => {
  const select = sql.slice(sql.indexOf('create policy member_blood_types_select'), sql.indexOf('drop policy if exists member_blood_types_write'));
  assert.match(select, /in \('full', 'read_only', 'website'\)/);
  assert.match(select, /= 'gkk_leader'\s+and exists \(select 1 from members m where m\.id = member_blood_types\.member_id\)/);
  assert.doesNotMatch(select, /clergy/);
  const write = sql.slice(sql.indexOf('create policy member_blood_types_write'));
  const using = write.slice(write.indexOf('using'), write.indexOf('with check'));
  const check = write.slice(write.indexOf('with check'), write.indexOf(';'));
  for (const part of [using, check]) {
    assert.match(part, /= 'full'/);
    assert.match(part, /= 'gkk_leader'\s+and exists \(select 1 from members m where m\.id = member_blood_types\.member_id\)/);
  }
});

test('Report Stats give a leader their blood types, and keep counting their GKK only', () => {
  const body = fn('admin_report_stats');
  assert.doesNotMatch(body, /gkk_leader/);
  assert.match(body, /'blood', \(/);
  assert.match(body, /'sacrament_missing'/, 'started from the 0070 text');
  const after = sql.slice(sql.indexOf('$function$;', sql.search(/function public\.admin_report_stats/i)));
  assert.match(after, /^\$function\$;\s+-- [^\n]*\nalter function public\.admin_report_stats\(\) set application_name = 'parish:own_gkk_only';/);
});

test('staff New Household keeps a leader\'s blood type', () => {
  const body = fn('create_household_base');
  assert.match(body, /insert into member_blood_types/);
  assert.doesNotMatch(body, /gkk_leader/);
});

test('the portal keeps a new member\'s blood type only when it is on the list, and approval saves it', () => {
  assert.match(fn('portal_new_member_details'), /'blood_type', case when portal_text\(p->>'blood_type'\) = any\(blood_types\(\)\)/);
  const approve = fn('census_approve_submission');
  assert.match(approve, /if staff_name is null then raise exception/, 'keeps the 0090 guards');
  assert.match(approve, /if pf->>'blood_type' = any\(blood_types\(\)\) then\s+insert into member_blood_types \(member_id, blood_type\) values \(mid, pf->>'blood_type'\)/);
  // blood_types() (0012) is the app's list.
  const list = readFileSync(new URL('../../supabase/migrations/0012_requests.sql', import.meta.url), 'utf8');
  assert.ok(list.includes(`array[${BLOOD_TYPES.map((b) => `'${b}'`).join(', ')}]`));
});
