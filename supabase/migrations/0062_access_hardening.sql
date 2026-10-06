-- Access hardening, after an audit of what each staff access level can
-- reach in the database (not only what the admin panel shows it):
--
--   1. A signed-in account with no staff profile now has no access
--      ('none'). Before, it counted as full access, a leftover from before
--      access levels (0014). Signed out (the public forms and the census
--      portal) is still null, as before.
--   2. Census answers, online submissions, snapshots and last year's list:
--      Full access, Read only and the GKK's own leader. "Website &
--      requests" has no census screens and no longer reads them.
--   3. Census access codes (get, renew): Full access and the GKK's own
--      leader, as the admin panel shows. Read only and Website & requests
--      could renew any household's code.
--   4. "Website & requests" may change only the office and contact details
--      in the parish settings (Parish Website → Office & Contact), not the
--      parish name, logo, website address, email, census schedule or
--      maintenance mode; and no longer edits GKKs (there is no screen for
--      it). Their notifications are requests only.
--   5. Blood types move from members.blood_type to member_blood_types, which
--      GKK leaders can't read. Before, the screens hid them from leaders but
--      the data still reached them. members_with_household keeps its
--      blood_type column (from the new table), so pages that read the view
--      are unchanged.
--
-- Run after 0061_gkk_history_alert_link.sql. Safe to re-run.

do $$
begin
  if to_regprocedure('public.notify_gkk_history_review()') is null or to_regclass('public.org_charts') is null
     or to_regprocedure('public.staff_can_see(text)') is null then
    raise exception 'Run the migrations up to 0061_gkk_history_alert_link.sql before this one';
  end if;
end;
$$;

-- ---- 1. no profile, no access ---------------------------------------------

create or replace function public.staff_access() returns text
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null
              else coalesce((select access from profiles where id = auth.uid()), 'none') end;
$$;

-- "Signed in at all" is not "staff" any more.
alter policy org_charts_staff_select on org_charts using ((select staff_access()) in ('full', 'read_only', 'gkk_leader', 'website'));
alter policy org_nodes_staff_select on org_nodes using ((select staff_access()) in ('full', 'read_only', 'gkk_leader', 'website'));
alter policy org_gkk_holders_staff_select on org_gkk_holders using ((select staff_access()) in ('full', 'read_only', 'gkk_leader', 'website'));

-- ---- 2. census data ---------------------------------------------------------

-- Who sees every GKK's census (the admin Census page): Full access and Read only.
create or replace function public.staff_sees_census() returns boolean
language sql stable set search_path = public as $$
  select staff_access() in ('full', 'read_only');
$$;

-- Who may get or renew a household's census code: Full access, or its GKK's leader.
create or replace function public.staff_census_gkk(gkk text) returns boolean
language sql stable set search_path = public as $$
  select staff_access() = 'full' or (staff_access() = 'gkk_leader' and gkk = staff_gkk());
$$;

alter policy census_household_snapshots_admin_select on census_household_snapshots using (
  (select staff_sees_census()) or exists (
    select 1 from households h
    where h.id = census_household_snapshots.household_id
      and (select staff_access()) = 'gkk_leader' and h.gkk = (select staff_gkk())));

alter policy census_member_responses_admin_select on census_member_responses using (
  (select staff_sees_census()) or exists (
    select 1 from members m join households h on h.id = m.household_id
    where m.id = census_member_responses.member_id
      and (select staff_access()) = 'gkk_leader' and h.gkk = (select staff_gkk())));

alter policy census_submissions_admin_select on census_submissions using (
  (select staff_sees_census()) or exists (
    select 1 from households h
    where h.id = census_submissions.household_id
      and (select staff_access()) = 'gkk_leader' and h.gkk = (select staff_gkk())));

alter policy census_last_year_list_staff on census_last_year_list using (
  (select staff_sees_census())
  or ((select staff_access()) = 'gkk_leader' and gkk = (select staff_gkk())));

-- ---- 4. notifications, parish settings, GKKs ---------------------------------

create or replace function public.notification_visible_to(acc text, acc_gkk text, area text, gkk text) returns boolean
language sql immutable as $$
  select case
    when acc is null then false
    when acc = 'full' then true
    when acc = 'read_only' then area in ('requests', 'registry')
    when acc = 'website' then area = 'requests'
    when acc = 'gkk_leader' then area = 'registry' and gkk is not null and gkk = acc_gkk
    else false
  end;
$$;

-- The parish_settings columns Parish Website → Office & Contact saves.
create or replace function public.website_office_fields() returns text[]
language sql immutable as $$
  select array['address', 'contact', 'email', 'mobile', 'facebook_url', 'sick_call_contact', 'directions',
               'map_url', 'secretary_messenger', 'office_hours', 'latitude', 'longitude'];
$$;

-- As in 0045, with Website & requests limited to the office details of the
-- parish settings and no GKK edits.
create or replace function public.guard_staff_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  acc text := staff_access();
  area text := tg_argv[0];
  mine text := staff_gkk();
  ok boolean := false;
begin
  if acc is null or acc = 'full' then
    ok := true;
  elsif acc = 'website' then
    ok := area in ('website', 'requests');
    if ok and tg_table_name = 'parish_settings' then
      ok := tg_op = 'UPDATE'
        and (to_jsonb(new) - website_office_fields()) = (to_jsonb(old) - website_office_fields());
      if not ok then
        raise exception 'Your account can only change the office and contact details. Ask a staff admin for the rest.' using errcode = '42501';
      end if;
    end if;
  elsif acc = 'gkk_leader' and area = 'registry' and tg_op <> 'DELETE' then
    if tg_table_name = 'households' then
      ok := new.gkk = mine and (tg_op = 'INSERT' or old.gkk = mine);
    else
      ok := exists (select 1 from households h where h.id = new.household_id and h.gkk = mine)
        and (tg_op = 'INSERT' or exists (select 1 from households h where h.id = old.household_id and h.gkk = mine));
    end if;
    if not ok then
      raise exception 'Your account can only change households in %', mine using errcode = '42501';
    end if;
  elsif acc = 'gkk_leader' and area = 'verification' and tg_op = 'DELETE' then
    ok := exists (select 1 from members m join households h on h.id = m.household_id
                  where m.id = old.member_id and h.gkk = mine);
  elsif acc = 'gkk_leader' and area = 'gkks' and tg_op = 'UPDATE' then
    -- Everything but the leader's fields must stay as it was.
    ok := old.name = mine
      and (to_jsonb(new) - gkk_leader_fields()) = (to_jsonb(old) - gkk_leader_fields());
    if not ok then
      raise exception 'Your account can only change the chapel details and history of %', coalesce(mine, 'your GKK') using errcode = '42501';
    end if;
  end if;

  if not ok then
    raise exception '%', case acc
      when 'read_only' then 'Your account can view records but not change them'
      when 'gkk_leader' then 'Your account can only update the households and members of your GKK'
      else 'Your account can''t change this. Ask a staff admin.'
    end using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

-- ---- 5. blood types out of GKK leaders' reach ----------------------------------

create table if not exists member_blood_types (
  member_id  integer primary key references members(id) on delete cascade,
  blood_type text not null
);

alter table member_blood_types enable row level security;
grant select, insert, update, delete on member_blood_types to authenticated;

-- Seen by everyone with the Blood Types page; changed with full access only.
-- (The public forms and the registration functions write as the owner.)
drop policy if exists member_blood_types_select on member_blood_types;
create policy member_blood_types_select on member_blood_types
  for select to authenticated using ((select staff_access()) in ('full', 'read_only', 'website'));
drop policy if exists member_blood_types_write on member_blood_types;
create policy member_blood_types_write on member_blood_types
  for all to authenticated using ((select staff_access()) = 'full') with check ((select staff_access()) = 'full');

-- Move what's recorded today (first run only).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'members' and column_name = 'blood_type') then
    insert into member_blood_types (member_id, blood_type)
    select id, trim(blood_type) from members where coalesce(trim(blood_type), '') <> ''
    on conflict (member_id) do nothing;
  end if;
end;
$$;

drop trigger if exists trg_member_blood_types_log on member_blood_types;
create trigger trg_member_blood_types_log after insert or update or delete on member_blood_types
  for each row execute function log_activity();

-- Activity log: a blood type change shows as a change to the member.
CREATE OR REPLACE FUNCTION public.log_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  old_j jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_j jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  rec jsonb := coalesce(new_j, old_j);
  diff jsonb := '{}'::jsonb;
  k text;
  hid integer;
  mid integer;
  lbl text;
begin
  -- Trash and restore write one summary entry of their own.
  if coalesce(current_setting('app.audit_skip', true), '') = 'on' then return null; end if;

  -- A blood type (member_blood_types, 0062) is logged as a change to the
  -- member, as it was when it was a member column. Not for a member added
  -- in the same transaction (their "insert" entry covers it) or one being
  -- deleted.
  if tg_table_name = 'member_blood_types' then
    mid := (rec ->> 'member_id')::integer;
    select m.household_id, concat_ws(' ', m.first_name, m.last_name) into hid, lbl from members m where m.id = mid;
    if hid is null or (tg_op = 'INSERT' and exists (select 1 from members m where m.id = mid and m.created_at >= now())) then
      return null;
    end if;
    if (old_j ->> 'blood_type') is not distinct from (new_j ->> 'blood_type') then return null; end if;
    insert into activity_log (actor, actor_name, action, table_name, record_id, household_id, member_id, label, changes)
    values (auth.uid(), current_staff_name(), 'update', 'members', mid::text, hid, mid, lbl,
            jsonb_build_object('blood_type', jsonb_build_array(old_j -> 'blood_type', new_j -> 'blood_type')));
    return null;
  end if;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(new_j) loop
      continue when k in ('updated_at', 'status_updated_at');
      if new_j -> k is distinct from old_j -> k then
        diff := diff || jsonb_build_object(k, jsonb_build_array(old_j -> k, new_j -> k));
      end if;
    end loop;
    if diff = '{}'::jsonb then return null; end if;
  end if;

  if tg_table_name = 'households' then
    hid := (rec ->> 'id')::integer;
    lbl := rec ->> 'household_name';
  elsif tg_table_name = 'members' then
    mid := (rec ->> 'id')::integer;
    hid := (rec ->> 'household_id')::integer;
    lbl := concat_ws(' ', rec ->> 'first_name', rec ->> 'last_name');
  else -- sacrament_verifications
    mid := (rec ->> 'member_id')::integer;
    select m.household_id, concat_ws(' ', m.first_name, m.last_name) into hid, lbl from members m where m.id = mid;
    diff := jsonb_build_object('sacrament', rec ->> 'sacrament', 'source', rec ->> 'source', 'reference', rec ->> 'reference');
  end if;

  insert into activity_log (actor, actor_name, action, table_name, record_id, household_id, member_id, label, changes)
  values (auth.uid(), current_staff_name(), lower(tg_op), tg_table_name,
          coalesce(rec ->> 'id', mid::text), hid, mid, lbl,
          case when tg_op = 'UPDATE' or tg_table_name = 'sacrament_verifications' then diff end);
  return null;
end;
$function$;

-- The member list keeps its blood_type column, now from member_blood_types
-- (empty for a GKK leader, who can't read that table).
create or replace view public.members_with_household with (security_invoker = true) as
SELECT m.id,
    m.household_id,
    m.first_name,
    m.middle_name,
    m.last_name,
    m.relationship,
    m.sex,
    m.dob,
    m.place_of_birth,
    m.civil_status,
    m.contact,
    m.email,
    m.occupation,
    m.religion,
    ( SELECT b.blood_type
           FROM member_blood_types b
          WHERE (b.member_id = m.id)) AS blood_type,
    m.has_baptism,
    m.baptism_date,
    m.baptism_church,
    m.has_communion,
    m.communion_date,
    m.communion_church,
    m.has_confirmation,
    m.conf_date,
    m.conf_church,
    m.conf_name,
    m.conf_sponsor,
    m.has_matrimony,
    m.mat_date,
    m.mat_church,
    m.mat_type,
    m.ministries,
    m.organizations,
    m.created_at,
    m.suffix,
    m.tribe,
    m.gkk_role,
    m.parish_role,
    m.membership_status,
    m.status_updated_at,
    m.updated_at,
    h.household_name,
    h.status AS household_status,
    h.gkk AS household_gkk,
    h.street,
    h.barangay,
    h.city,
    h.province,
    h.zip,
        CASE
            WHEN (m.dob IS NULL) THEN NULL::integer
            ELSE (date_part('year'::text, age((m.dob)::timestamp with time zone)))::integer
        END AS age,
    ((m.first_name || ' '::text) || m.last_name) AS full_name,
    (EXISTS ( SELECT 1
           FROM sacrament_verifications v
          WHERE ((v.member_id = m.id) AND (v.sacrament = 'baptism'::text)))) AS baptism_verified,
    (EXISTS ( SELECT 1
           FROM sacrament_verifications v
          WHERE ((v.member_id = m.id) AND (v.sacrament = 'communion'::text)))) AS communion_verified,
    (EXISTS ( SELECT 1
           FROM sacrament_verifications v
          WHERE ((v.member_id = m.id) AND (v.sacrament = 'confirmation'::text)))) AS confirmation_verified,
    (EXISTS ( SELECT 1
           FROM sacrament_verifications v
          WHERE ((v.member_id = m.id) AND (v.sacrament = 'matrimony'::text)))) AS matrimony_verified,
    COALESCE((m.membership_status <> ALL (ARRAY['Moved away'::text, 'Deceased'::text])), true) AS is_current,
    ( SELECT r.cycle_id
           FROM (census_member_responses r
             JOIN census_cycles c ON ((c.id = r.cycle_id)))
          WHERE (r.member_id = m.id)
          ORDER BY r.cycle_id DESC
         LIMIT 1) AS last_census_cycle_id,
    ( SELECT c.label
           FROM (census_member_responses r
             JOIN census_cycles c ON ((c.id = r.cycle_id)))
          WHERE (r.member_id = m.id)
          ORDER BY r.cycle_id DESC
         LIMIT 1) AS last_census_label,
    ( SELECT r.confirmed_at
           FROM (census_member_responses r
             JOIN census_cycles c ON ((c.id = r.cycle_id)))
          WHERE (r.member_id = m.id)
          ORDER BY r.cycle_id DESC
         LIMIT 1) AS last_confirmed_at,
    (EXISTS ( SELECT 1
           FROM census_member_responses r
          WHERE ((r.member_id = m.id) AND (r.cycle_id = census_reference_cycle_id())))) AS census_confirmed,
    (member_practice(m.*, h.participation)).score AS practice_score,
    (member_practice(m.*, h.participation)).level AS practice_level,
    (member_practice(m.*, h.participation)).participation AS practice_participation,
    (member_practice(m.*, h.participation)).sacraments AS practice_sacraments,
    (member_practice(m.*, h.participation)).involvement AS practice_involvement,
    (member_practice(m.*, h.participation)).source AS practice_source,
    (member_practice(m.*, h.participation)).source_label AS practice_source_label,
    (member_practice(m.*, h.participation)).trend AS practice_trend,
    m.family_no
   FROM (members m
     JOIN households h ON ((h.id = m.household_id)));

-- Registration (public wizard, family form, staff New Household): the blood
-- type goes to member_blood_types. As before otherwise.
CREATE OR REPLACE FUNCTION public.submit_registration_base(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_member_id integer;
  hh jsonb := payload->'household';
  mem jsonb;
  member_count integer;
  gkk_val text;
  participation_val jsonb := '{}'::jsonb;
  help_ways_val text[] := '{}';
  new_household_id integer;
  new_ref_no text;
begin
  if hh is null then
    raise exception 'Household details are required';
  end if;

  if coalesce(trim(hh->>'householdName'), '') = '' then raise exception 'Family (household) name is required'; end if;
  if coalesce(trim(hh->>'street'), '') = '' then raise exception 'Street is required'; end if;
  if coalesce(trim(hh->>'barangay'), '') = '' then raise exception 'Barangay is required'; end if;
  if coalesce(trim(hh->>'city'), '') = '' then raise exception 'City / Municipality is required'; end if;
  if coalesce(trim(hh->>'province'), '') = '' then raise exception 'Province is required'; end if;
  if coalesce(trim(hh->>'zip'), '') = '' then raise exception 'ZIP code is required'; end if;

  if exists (select 1 from households where lower(trim(household_name)) = lower(trim(hh->>'householdName'))) then
    raise exception 'The household name "%" is already registered. Please choose a different name.', trim(hh->>'householdName');
  end if;

  gkk_val := nullif(trim(hh->>'gkk'), '');
  if gkk_val is not null and not exists (select 1 from gkks where name = gkk_val) then
    raise exception 'Please select a GKK from the list';
  end if;

  if jsonb_typeof(hh->'participation') = 'object' then
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into participation_val
    from jsonb_each_text(hh->'participation') as t(k, v)
    where k in ('mass', 'bible_service', 'devotions', 'meetings', 'pintakasi', 'financial')
      and v in ('Aktibo', 'Panagsa', 'Wala');
  end if;

  if jsonb_typeof(hh->'helpWays') = 'array' then
    select coalesce(array_agg(distinct x), '{}') into help_ways_val
    from jsonb_array_elements_text(hh->'helpWays') x
    where x in ('sunday_mass', 'bible_service', 'devotions', 'meetings', 'pintakasi', 'financial');
  end if;

  if payload->'members' is null or jsonb_typeof(payload->'members') <> 'array' then
    raise exception 'At least one household member is required';
  end if;

  member_count := jsonb_array_length(payload->'members');
  if member_count = 0 then raise exception 'At least one household member is required'; end if;
  if member_count > 30 then raise exception 'A household can have at most 30 members'; end if;
  if coalesce((payload->>'consent')::boolean, false) is not true then
    raise exception 'Data privacy consent is required';
  end if;

  perform check_payload_families(payload->'members', 'relationship');

  for mem in select * from jsonb_array_elements(payload->'members') loop
    if coalesce(trim(mem->>'firstName'), '') = '' then raise exception 'Member first name is required'; end if;
    if coalesce(trim(mem->>'lastName'), '') = '' then raise exception 'Member last name is required'; end if;
    if coalesce(trim(mem->>'relationship'), '') = '' then raise exception 'Member relationship is required'; end if;
    if coalesce(trim(mem->>'sex'), '') = '' then raise exception 'Member sex is required'; end if;
    if coalesce(trim(mem->>'dob'), '') = '' then raise exception 'Member date of birth is required'; end if;
    if coalesce(trim(mem->>'civilStatus'), '') = '' then raise exception 'Member civil status is required'; end if;
  end loop;

  insert into households
    (household_name, street, barangay, city, province, zip, contact, email, gkk, family_grouping,
     status, volunteer, notify_optin, consent, participation, help_ways)
  values
    (trim(hh->>'householdName'), trim(hh->>'street'), trim(hh->>'barangay'), trim(hh->>'city'),
     trim(hh->>'province'), trim(hh->>'zip'),
     nullif(trim(hh->>'contact'), ''), nullif(trim(hh->>'email'), ''),
     gkk_val, nullif(trim(hh->>'familyGrouping'), ''),
     'Pending', nullif(trim(payload->>'volunteer'), ''),
     coalesce((payload->>'notifyOptin')::boolean, false), true,
     participation_val, help_ways_val)
  returning id, ref_no into new_household_id, new_ref_no;

  for mem in select * from jsonb_array_elements(payload->'members') loop
    insert into members
      (household_id, family_no, first_name, middle_name, last_name, suffix, relationship, sex, dob, place_of_birth, tribe, civil_status,
       contact, email, occupation, religion, gkk_role, parish_role,
       has_baptism, baptism_date, baptism_church,
       has_communion, communion_date, communion_church,
       has_confirmation, conf_date, conf_church, conf_name, conf_sponsor,
       has_matrimony, mat_date, mat_church, mat_type, ministries, organizations)
    values
      (new_household_id, payload_family_no(mem), trim(mem->>'firstName'), nullif(trim(mem->>'middleName'), ''), trim(mem->>'lastName'),
       nullif(trim(mem->>'suffix'), ''),
       nullif(trim(mem->>'relationship'), ''), nullif(trim(mem->>'sex'), ''),
       nullif(trim(mem->>'dob'), '')::date, nullif(trim(mem->>'placeOfBirth'), ''), nullif(trim(mem->>'tribe'), ''),
       nullif(trim(mem->>'civilStatus'), ''), nullif(trim(mem->>'contact'), ''), nullif(trim(mem->>'email'), ''),
       nullif(trim(mem->>'occupation'), ''),
       coalesce(nullif(trim(mem->>'religion'), ''), 'Roman Catholic'), nullif(trim(mem->>'gkkRole'), ''),
       (select name from parish_positions where name = trim(mem->>'parishRole')),
       coalesce((mem->>'hasBaptism')::boolean, false), nullif(trim(mem->>'baptismDate'), '')::date, nullif(trim(mem->>'baptismChurch'), ''),
       coalesce((mem->>'hasCommunion')::boolean, false), nullif(trim(mem->>'communionDate'), '')::date, nullif(trim(mem->>'communionChurch'), ''),
       coalesce((mem->>'hasConfirmation')::boolean, false), nullif(trim(mem->>'confDate'), '')::date, nullif(trim(mem->>'confChurch'), ''),
       nullif(trim(mem->>'confName'), ''), nullif(trim(mem->>'confSponsor'), ''),
       coalesce((mem->>'hasMatrimony')::boolean, false), nullif(trim(mem->>'matDate'), '')::date, nullif(trim(mem->>'matChurch'), ''),
       nullif(trim(mem->>'matType'), ''),
       '{}',
       array(
         select distinct x from jsonb_array_elements_text(
           case when jsonb_typeof(mem->'organizations') = 'array' then mem->'organizations' else '[]'::jsonb end
         ) x
         where x in (select name from organizations)
       ))
    returning id into new_member_id;
    -- Blood types live in member_blood_types (0062), out of GKK leaders' reach.
    if nullif(trim(mem->>'bloodType'), '') is not null then
      insert into member_blood_types (member_id, blood_type) values (new_member_id, trim(mem->>'bloodType'));
    end if;
  end loop;

  return jsonb_build_object('refNo', new_ref_no, 'householdId', new_household_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_family_registration_base(p_ref text, p_code text, payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_member_id integer;
  chk jsonb := household_code_check(p_ref, p_code);
  hid integer;
  h households;
  mem jsonb;
  member_count integer;
  head_count integer;
  fam smallint;
begin
  if not (chk->>'ok')::boolean then return chk; end if;
  hid := (chk->>'householdId')::integer;
  select * into h from households where id = hid for update;

  if payload->'members' is null or jsonb_typeof(payload->'members') <> 'array' then
    raise exception 'At least one family member is required';
  end if;
  member_count := jsonb_array_length(payload->'members');
  if member_count = 0 then raise exception 'At least one family member is required'; end if;
  if coalesce((payload->>'consent')::boolean, false) is not true then
    raise exception 'Data privacy consent is required';
  end if;
  if (select count(*) from members where household_id = hid) + member_count > 30 then
    raise exception 'A household can have at most 30 members';
  end if;

  select count(*) filter (where trim(m->>'relationship') = 'Head of Family') into head_count
  from jsonb_array_elements(payload->'members') m;
  if head_count <> 1 then raise exception 'Exactly one Head of Family is required'; end if;
  if exists (select 1 from jsonb_array_elements(payload->'members') m where trim(m->>'relationship') = 'Head of Household') then
    raise exception 'This house already has its Household Head';
  end if;

  for mem in select * from jsonb_array_elements(payload->'members') loop
    if coalesce(trim(mem->>'firstName'), '') = '' then raise exception 'Member first name is required'; end if;
    if coalesce(trim(mem->>'lastName'), '') = '' then raise exception 'Member last name is required'; end if;
    if coalesce(trim(mem->>'relationship'), '') = '' then raise exception 'Member relationship is required'; end if;
    if coalesce(trim(mem->>'sex'), '') = '' then raise exception 'Member sex is required'; end if;
    if coalesce(trim(mem->>'dob'), '') = '' then raise exception 'Member date of birth is required'; end if;
    if coalesce(trim(mem->>'civilStatus'), '') = '' then raise exception 'Member civil status is required'; end if;
  end loop;

  select coalesce(max(family_no), 1) + 1 into fam from members where household_id = hid;
  if fam > 10 then raise exception 'A household can have at most 10 families'; end if;

  for mem in select * from jsonb_array_elements(payload->'members') loop
    insert into members
      (household_id, family_no, first_name, middle_name, last_name, suffix, relationship, sex, dob, place_of_birth, tribe, civil_status,
       contact, email, occupation, religion, gkk_role, parish_role,
       has_baptism, baptism_date, baptism_church,
       has_communion, communion_date, communion_church,
       has_confirmation, conf_date, conf_church, conf_name, conf_sponsor,
       has_matrimony, mat_date, mat_church, mat_type, ministries, organizations)
    values
      (hid, fam, trim(mem->>'firstName'), nullif(trim(mem->>'middleName'), ''), trim(mem->>'lastName'),
       nullif(trim(mem->>'suffix'), ''),
       nullif(trim(mem->>'relationship'), ''), nullif(trim(mem->>'sex'), ''),
       nullif(trim(mem->>'dob'), '')::date, nullif(trim(mem->>'placeOfBirth'), ''), nullif(trim(mem->>'tribe'), ''),
       nullif(trim(mem->>'civilStatus'), ''), nullif(trim(mem->>'contact'), ''), nullif(trim(mem->>'email'), ''),
       nullif(trim(mem->>'occupation'), ''),
       coalesce(nullif(trim(mem->>'religion'), ''), 'Roman Catholic'), nullif(trim(mem->>'gkkRole'), ''),
       (select name from parish_positions where name = trim(mem->>'parishRole')),
       coalesce((mem->>'hasBaptism')::boolean, false), nullif(trim(mem->>'baptismDate'), '')::date, nullif(trim(mem->>'baptismChurch'), ''),
       coalesce((mem->>'hasCommunion')::boolean, false), nullif(trim(mem->>'communionDate'), '')::date, nullif(trim(mem->>'communionChurch'), ''),
       coalesce((mem->>'hasConfirmation')::boolean, false), nullif(trim(mem->>'confDate'), '')::date, nullif(trim(mem->>'confChurch'), ''),
       nullif(trim(mem->>'confName'), ''), nullif(trim(mem->>'confSponsor'), ''),
       coalesce((mem->>'hasMatrimony')::boolean, false), nullif(trim(mem->>'matDate'), '')::date, nullif(trim(mem->>'matChurch'), ''),
       nullif(trim(mem->>'matType'), ''),
       '{}',
       array(
         select distinct x from jsonb_array_elements_text(
           case when jsonb_typeof(mem->'organizations') = 'array' then mem->'organizations' else '[]'::jsonb end
         ) x
         where x in (select name from organizations)
       ))
    returning id into new_member_id;
    -- Blood types live in member_blood_types (0062), out of GKK leaders' reach.
    if nullif(trim(mem->>'bloodType'), '') is not null then
      insert into member_blood_types (member_id, blood_type) values (new_member_id, trim(mem->>'bloodType'));
    end if;
  end loop;

  update households set status = 'Pending' where id = hid and status <> 'Pending';

  return jsonb_build_object('ok', true, 'refNo', h.ref_no, 'householdName', h.household_name, 'familyNo', fam);
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_household_base(payload jsonb)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
declare
  new_member_id integer;
  hh jsonb := payload->'household';
  mem jsonb;
  gkk_val text;
  participation_val jsonb := '{}'::jsonb;
  help_ways_val text[] := '{}';
  new_household_id integer;
  status_val text;
begin
  if hh is null then raise exception 'Household details are required'; end if;
  if coalesce(trim(hh->>'name'), '') = '' then raise exception 'Household name is required'; end if;
  if coalesce(trim(hh->>'street'), '') = '' then raise exception 'Street is required'; end if;
  if coalesce(trim(hh->>'barangay'), '') = '' then raise exception 'Barangay is required'; end if;
  if coalesce(trim(hh->>'city'), '') = '' then raise exception 'City / Municipality is required'; end if;
  if coalesce(trim(hh->>'province'), '') = '' then raise exception 'Province is required'; end if;
  if coalesce(trim(hh->>'zip'), '') = '' then raise exception 'ZIP code is required'; end if;

  if exists (select 1 from households where lower(trim(household_name)) = lower(trim(hh->>'name'))) then
    raise exception 'The household name "%" is already registered. Please choose a different name.', trim(hh->>'name');
  end if;

  gkk_val := nullif(trim(hh->>'gkk'), '');
  if gkk_val is not null and not exists (select 1 from gkks where name = gkk_val) then
    raise exception 'Please select a GKK from the list';
  end if;

  if jsonb_typeof(hh->'participation') = 'object' then
    select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into participation_val
    from jsonb_each_text(hh->'participation') as t(k, v)
    where k in ('mass', 'bible_service', 'devotions', 'meetings', 'pintakasi', 'financial')
      and v in ('Aktibo', 'Panagsa', 'Wala');
  end if;

  if jsonb_typeof(hh->'helpWays') = 'array' then
    select coalesce(array_agg(distinct x), '{}') into help_ways_val
    from jsonb_array_elements_text(hh->'helpWays') x
    where x in ('sunday_mass', 'bible_service', 'devotions', 'meetings', 'pintakasi', 'financial');
  end if;

  if payload->'members' is null or jsonb_typeof(payload->'members') <> 'array'
     or jsonb_array_length(payload->'members') = 0 then
    raise exception 'At least one member is required';
  end if;
  if jsonb_array_length(payload->'members') > 30 then raise exception 'A household can have at most 30 members'; end if;

  perform check_payload_families(payload->'members', 'rel');

  for mem in select * from jsonb_array_elements(payload->'members') loop
    if coalesce(trim(mem->>'first'), '') = '' then raise exception 'Member first name is required'; end if;
    if coalesce(trim(mem->>'last'), '') = '' then raise exception 'Member last name is required'; end if;
  end loop;

  status_val := case when hh->>'status' = 'Verified' then 'Verified' else 'Pending' end;

  insert into households
    (household_name, street, barangay, city, province, zip, contact, email, gkk, family_grouping,
     status, volunteer, notify_optin, consent, participation, help_ways)
  values
    (trim(hh->>'name'), trim(hh->>'street'), trim(hh->>'barangay'), trim(hh->>'city'), trim(hh->>'province'), trim(hh->>'zip'),
     nullif(trim(hh->>'contact'), ''), nullif(trim(hh->>'email'), ''), gkk_val, nullif(trim(hh->>'grouping'), ''),
     status_val, nullif(trim(payload->>'volunteer'), ''),
     coalesce((payload->>'notifyOptin')::boolean, false), coalesce((payload->>'consent')::boolean, false),
     participation_val, help_ways_val)
  returning id into new_household_id;

  for mem in select * from jsonb_array_elements(payload->'members') loop
    insert into members
      (household_id, family_no, first_name, middle_name, last_name, suffix, relationship, sex, dob, place_of_birth, tribe, civil_status,
       contact, email, occupation, religion, gkk_role, parish_role,
       has_baptism, baptism_date, baptism_church,
       has_communion, communion_date, communion_church,
       has_confirmation, conf_date, conf_church, conf_name, conf_sponsor,
       has_matrimony, mat_date, mat_church, mat_type, ministries, organizations)
    values
      (new_household_id, payload_family_no(mem), trim(mem->>'first'), nullif(trim(mem->>'middle'), ''), trim(mem->>'last'), nullif(trim(mem->>'suffix'), ''),
       nullif(trim(mem->>'rel'), ''), nullif(trim(mem->>'sex'), ''), nullif(trim(mem->>'dob'), '')::date, nullif(trim(mem->>'pob'), ''),
       nullif(trim(mem->>'tribe'), ''),
       nullif(trim(mem->>'civil'), ''), nullif(trim(mem->>'contact'), ''), nullif(trim(mem->>'email'), ''), nullif(trim(mem->>'occupation'), ''),
       coalesce(nullif(trim(mem->>'religion'), ''), 'Roman Catholic'),
       nullif(trim(mem->>'gkkRole'), ''),
       (select name from parish_positions where name = trim(mem->>'parishRole')),
       coalesce((mem->>'hasBaptism')::boolean, false), nullif(trim(mem->>'baptismDate'), '')::date, nullif(trim(mem->>'baptismChurch'), ''),
       coalesce((mem->>'hasCommunion')::boolean, false), nullif(trim(mem->>'communionDate'), '')::date, nullif(trim(mem->>'communionChurch'), ''),
       coalesce((mem->>'hasConfirmation')::boolean, false), nullif(trim(mem->>'confDate'), '')::date, nullif(trim(mem->>'confChurch'), ''),
       nullif(trim(mem->>'confName'), ''), nullif(trim(mem->>'confSponsor'), ''),
       coalesce((mem->>'hasMatrimony')::boolean, false), nullif(trim(mem->>'matDate'), '')::date, nullif(trim(mem->>'matChurch'), ''),
       nullif(trim(mem->>'matType'), ''),
       array(
         select distinct x from jsonb_array_elements_text(
           case when jsonb_typeof(mem->'ministries') = 'array' then mem->'ministries' else '[]'::jsonb end
         ) x
         where x in (select name from ministries)
       ),
       array(
         select distinct x from jsonb_array_elements_text(
           case when jsonb_typeof(mem->'organizations') = 'array' then mem->'organizations' else '[]'::jsonb end
         ) x
         where x in (select name from organizations)
       ))
    returning id into new_member_id;
    -- Blood types live in member_blood_types (0062), out of GKK leaders' reach.
    if nullif(trim(mem->>'bloodType'), '') is not null and staff_access() is distinct from 'gkk_leader' then
      insert into member_blood_types (member_id, blood_type) values (new_member_id, trim(mem->>'bloodType'));
    end if;
  end loop;

  return new_household_id;
end;
$function$;

-- Reports: blood type counts from member_blood_types (still none for a GKK leader).
CREATE OR REPLACE FUNCTION public.admin_report_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'households', (select count(*) from households),
    'verified',   (select count(*) from households where status = 'Verified'),
    'pending',    (select count(*) from households where status = 'Pending'),
    'members',    (select count(*) from members where member_is_current(membership_status)),
    'by_gkk', (
      select coalesce(jsonb_agg(jsonb_build_object('label', t.gkk, 'verified', t.verified, 'pending', t.pending) order by t.gkk), '[]'::jsonb)
      from (
        select gkk, count(*) filter (where status = 'Verified') as verified, count(*) filter (where status = 'Pending') as pending
        from households where gkk is not null group by gkk
      ) t
    ),
    'sacraments', (
      select jsonb_build_object(
        'baptism', count(*) filter (where has_baptism),
        'communion', count(*) filter (where has_communion),
        'confirmation', count(*) filter (where has_confirmation),
        'matrimony', count(*) filter (where has_matrimony))
      from members where member_is_current(membership_status)
    ),
    'participation', (
      select coalesce(jsonb_agg(jsonb_build_object('label', t.g, 'n', t.n) order by t.n desc, t.g), '[]'::jsonb)
      from (
        select g, count(distinct m.id) as n
        from members m, unnest(m.ministries || m.organizations) as g
        where member_is_current(m.membership_status)
        group by g
      ) t
    ),
    'any_group', (select count(*) from members
                  where member_is_current(membership_status) and (cardinality(ministries) > 0 or cardinality(organizations) > 0)),
    'blood', case when staff_access() = 'gkk_leader' then '{}'::jsonb else (
      select coalesce(jsonb_object_agg(blood_type, n), '{}'::jsonb)
      from (select b.blood_type, count(*) as n from members m join member_blood_types b on b.member_id = m.id
            where member_is_current(m.membership_status) and coalesce(b.blood_type, '') <> '' group by b.blood_type) t
    ) end,
    'blood_unknown', case when staff_access() = 'gkk_leader' then 0 else
      (select count(*) from members m where member_is_current(m.membership_status)
         and not exists (select 1 from member_blood_types b where b.member_id = m.id and coalesce(b.blood_type, '') <> '')) end
  );
$function$;

-- Trash keeps a member's blood type, and restoring puts it back (also for
-- items trashed before this migration, whose member rows still carry it).
CREATE OR REPLACE FUNCTION public.trash_snapshot(p_household_ids integer[], p_member_ids integer[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'households', (select coalesce(jsonb_agg(to_jsonb(h) order by h.id), '[]') from households h where h.id = any(p_household_ids)),
    'members', (select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]') from members m where m.id = any(p_member_ids)),
    'member_blood_types', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from member_blood_types b where b.member_id = any(p_member_ids)),
    'sacrament_verifications', (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from sacrament_verifications v where v.member_id = any(p_member_ids)),
    'census_member_responses', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from census_member_responses r where r.member_id = any(p_member_ids)),
    'census_household_snapshots', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from census_household_snapshots s where s.household_id = any(p_household_ids)),
    'census_submissions', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from census_submissions s where s.household_id = any(p_household_ids)),
    'household_access_codes', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from household_access_codes c where c.household_id = any(p_household_ids)),
    'certificate_links', (select coalesce(jsonb_agg(jsonb_build_array(c.id, c.member_id)), '[]') from certificate_requests c where c.member_id = any(p_member_ids)),
    'donor_links', (select coalesce(jsonb_agg(jsonb_build_array(d.id, d.member_id)), '[]') from blood_donors d where d.member_id = any(p_member_ids))
  );
$function$;

CREATE OR REPLACE FUNCTION public.restore_deleted(p_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r deleted_records;
  d jsonb;
  hid integer;
  taken text;
begin
  perform require_full_access('restore deleted records');
  select * into r from deleted_records where id = p_id;
  if r.id is null then raise exception 'This item is no longer in the trash'; end if;
  d := r.data;

  if r.kind = 'household' then
    select household_name into taken from households
    where lower(trim(household_name)) = lower(trim(d -> 'households' -> 0 ->> 'household_name'));
    if taken is not null then
      raise exception 'Another household is now called “%”. Rename it, then restore this one.', taken;
    end if;
  else
    hid := (d -> 'members' -> 0 ->> 'household_id')::integer;
    if not exists (select 1 from households where id = hid) then
      raise exception 'This member''s household isn''t in the registry any more. Restore the household first.';
    end if;
  end if;

  perform set_config('app.audit_skip', 'on', true);
  perform set_config('app.restoring', 'on', true);
  insert into households select * from jsonb_populate_recordset(null::households, d -> 'households');
  insert into members select * from jsonb_populate_recordset(null::members, d -> 'members');
  -- Blood types: their own list (0062), or inside the member rows of items trashed before 0062.
  insert into member_blood_types (member_id, blood_type)
  select (x ->> 'member_id')::integer, x ->> 'blood_type' from jsonb_array_elements(coalesce(d -> 'member_blood_types', '[]')) x
  union
  select (x ->> 'id')::integer, x ->> 'blood_type' from jsonb_array_elements(coalesce(d -> 'members', '[]')) x
  where coalesce(x ->> 'blood_type', '') <> ''
  on conflict (member_id) do nothing;
  insert into sacrament_verifications select * from jsonb_populate_recordset(null::sacrament_verifications, d -> 'sacrament_verifications');
  insert into census_member_responses select * from jsonb_populate_recordset(null::census_member_responses, d -> 'census_member_responses');
  insert into census_household_snapshots select * from jsonb_populate_recordset(null::census_household_snapshots, d -> 'census_household_snapshots');
  insert into census_submissions select * from jsonb_populate_recordset(null::census_submissions, d -> 'census_submissions');
  insert into household_access_codes select * from jsonb_populate_recordset(null::household_access_codes, d -> 'household_access_codes');
  update certificate_requests c set member_id = (x ->> 1)::integer
  from jsonb_array_elements(d -> 'certificate_links') x
  where c.id = (x ->> 0)::integer and c.member_id is null;
  update blood_donors b set member_id = (x ->> 1)::integer
  from jsonb_array_elements(d -> 'donor_links') x
  where b.id = (x ->> 0)::integer and b.member_id is null;
  perform set_config('app.restoring', 'off', true);
  perform set_config('app.audit_skip', 'off', true);

  insert into activity_log (actor, actor_name, action, table_name, record_id, household_id, member_id, label)
  values (auth.uid(), current_staff_name(), 'restore', case r.kind when 'household' then 'households' else 'members' end,
          r.record_id::text, coalesce(hid, r.record_id), case when r.kind = 'member' then r.record_id end, r.label);
  delete from deleted_records where id = p_id;
  return jsonb_build_object('kind', r.kind, 'record_id', r.record_id, 'household_id', coalesce(hid, r.record_id));
end;
$function$;

-- Leaders can't write member_blood_types at all, so this guard is no longer needed.
drop trigger if exists trg_members_leader_keep_blood_type on members;
drop function if exists public.members_leader_keep_blood_type();

alter table members drop column if exists blood_type;

-- ---- 3. census codes; and the rest of "signed in" is not "staff" ----------------

CREATE OR REPLACE FUNCTION public.census_access_codes(p_household_ids integer[])
 RETURNS TABLE(household_id integer, code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
declare
  hid integer;
  attempt integer;
begin
  if census_staff_name() is null then raise exception 'Only parish staff can see access codes'; end if;
  foreach hid in array coalesce(p_household_ids, '{}') loop
    continue when not exists (select 1 from households h where h.id = hid and staff_census_gkk(h.gkk));
    continue when exists (select 1 from household_access_codes a where a.household_id = hid);
    attempt := 0;
    loop
      attempt := attempt + 1;
      begin
        insert into household_access_codes (household_id, code, issued_by) values (hid, census_new_access_code(), auth.uid())
        on conflict (household_id) do nothing;
        exit;
      exception when unique_violation then
        if attempt >= 20 then raise exception 'Could not generate a unique access code'; end if;
      end;
    end loop;
  end loop;
  return query
    select a.household_id, a.code
    from household_access_codes a join households h on h.id = a.household_id
    where a.household_id = any(p_household_ids) and staff_census_gkk(h.gkk);
end;
$function$;

CREATE OR REPLACE FUNCTION public.census_reset_access_code(p_household_id integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_code text;
  attempt integer := 0;
begin
  if census_staff_name() is null then raise exception 'Only parish staff can change access codes'; end if;
  if not exists (select 1 from households where id = p_household_id and staff_census_gkk(gkk)) then raise exception 'Household not found'; end if;
  loop
    attempt := attempt + 1;
    new_code := census_new_access_code();
    begin
      insert into household_access_codes (household_id, code, issued_by) values (p_household_id, new_code, auth.uid())
      on conflict (household_id) do update set
        code = excluded.code, issued_at = now(), issued_by = excluded.issued_by, failed_attempts = 0, locked_until = null;
      return new_code;
    exception when unique_violation then
      if attempt >= 20 then raise exception 'Could not generate a unique access code'; end if;
    end;
  end loop;
end;
$function$;

-- The other GKKs' heads that match last year's list: names only for a leader, as before.
CREATE OR REPLACE FUNCTION public.last_year_other_gkk_heads(p_gkk text)
 RETURNS TABLE(household_id integer, household_name text, status text, gkk text, first_name text, middle_name text, last_name text, suffix text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  whole boolean := staff_sees_census();
begin
  if not whole and not (staff_access() = 'gkk_leader' and p_gkk = staff_gkk()) then
    raise exception 'Your account can''t see this list' using errcode = '42501';
  end if;
  return query
    select case when whole then h.id end, case when whole then h.household_name end, case when whole then h.status end,
           h.gkk, m.first_name, m.middle_name, m.last_name, m.suffix
    from households h
    join lateral (
      select mm.first_name, mm.middle_name, mm.last_name, mm.suffix from members mm
      where mm.household_id = h.id and mm.relationship = 'Head of Household'
      order by mm.id limit 1
    ) m on true
    where h.gkk is distinct from p_gkk
      and coalesce(trim(m.last_name), '') <> ''
      and exists (select 1 from census_last_year_list l
                  where l.gkk = p_gkk and l.status = 'Not yet' and l.household_id is null
                    and l.head_name ilike '%' || trim(m.last_name) || '%');
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_member_answers(p_household_id integer, p_answers jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  a jsonb;
  mid integer;
  st text;
  part jsonb;
  cyc integer;
  synced jsonb := '[]'::jsonb;
  saved integer := 0;
begin
  if coalesce(staff_access(), 'none') = 'none' then
    raise exception 'Please sign in again' using errcode = '42501';
  end if;
  if jsonb_typeof(p_answers) <> 'array' then return 0; end if;
  select id into cyc from census_cycles where status = 'Open';

  for a in select * from jsonb_array_elements(p_answers) loop
    mid := nullif(a->>'memberId', '')::integer;
    if mid is null or not exists (select 1 from members where id = mid and household_id = p_household_id) then
      raise exception 'A member here is not in this household';
    end if;
    st := nullif(trim(a->>'status'), '');
    if st is not null and not (st = any(census_member_statuses())) then
      raise exception 'Unknown status: %', st;
    end if;
    -- Only someone active or inactive has participation to answer.
    part := case when st is null or st in ('Active', 'Inactive') then census_clean_participation(a->'participation') else '{}'::jsonb end;

    -- The members write guard (trg_00_guard_staff_write) decides who may.
    update members set
      membership_status = st,
      status_updated_at = case when membership_status is distinct from st then now() else status_updated_at end,
      registration_participation = part
    where id = mid;

    if cyc is not null and st is not null and exists (
      select 1 from census_member_responses r where r.cycle_id = cyc and r.member_id = mid and r.source = 'Registration'
    ) then
      synced := synced || jsonb_build_array(jsonb_build_object('memberId', mid, 'status', st, 'participation', part));
    end if;
    saved := saved + 1;
  end loop;

  if jsonb_array_length(synced) > 0 then
    perform census_apply_responses(cyc, p_household_id, synced, 'Registration', auth.uid(), census_staff_name());
  end if;
  return saved;
end;
$function$;

CREATE OR REPLACE FUNCTION public.org_chart_preview(p_chart_id integer, p_gkk text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(staff_access(), 'none') = 'none' then
    raise exception 'Please sign in again' using errcode = '42501';
  end if;
  return org_chart_tree(p_chart_id, p_gkk);
end;
$function$;
