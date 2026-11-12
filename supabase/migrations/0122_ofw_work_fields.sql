-- The work questions as Dave asked after trying 0121: one group, in this
-- order: works abroad (OFW)?, then (abroad now only, optional) the year the
-- contract started, then the occupation group (Category) and the
-- occupation. No country and no year home are asked. Run after
-- 0121_member_ofw.sql. Safe to re-run.
--
-- * members: ofw_country and ofw_returned are dropped (what was typed in
--   them goes; the activity log keeps it). ofw_since is now only for a
--   member abroad now: a former OFW's is cleared, and the check says so.
-- * members_ofw_tidy(), members_with_household, the three registration
--   functions, the census portal's member fields and approval, the member
--   merge and Report Stats: as in 0121 without those two columns. Report
--   Stats gives members abroad by kind of work ('by_work') instead of by
--   country. portal_submit(), the household counts, the census and the
--   practice score are unchanged.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'members' and column_name = 'ofw_status') then
    raise exception 'Run the migrations up to 0121_member_ofw.sql before this one';
  end if;
end;
$$;

-- ---- the two columns go ------------------------------------------------------------

-- The members view reads them, so it goes first and is made again below.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'members'
             and column_name in ('ofw_country', 'ofw_returned')) then
    drop view if exists public.members_with_household;
    alter table members drop constraint if exists members_ofw_country_check;
    alter table members drop constraint if exists members_ofw_years_check;
    alter table members drop column if exists ofw_country, drop column if exists ofw_returned;
  end if;
end;
$$;

-- As in 0121, without the country and the year home: a contract year only
-- for someone abroad now.
/**
 * Keeps a member's OFW answer whole, whichever form saves it: only someone
 * abroad now keeps a contract year, and a year later than next year is
 * refused. When the answer changes (or is given on a new member),
 * ofw_updated_at becomes today, unless the save sets it.
 */
create or replace function public.members_ofw_tidy() returns trigger
language plpgsql set search_path = public as $$
begin
  new.occupation_group := nullif(trim(new.occupation_group), '');
  new.ofw_status := nullif(trim(new.ofw_status), '');
  if new.ofw_status is distinct from 'Abroad' then new.ofw_since := null; end if;
  if new.ofw_since > extract(year from current_date) + 1 then
    raise exception 'The OFW contract year can''t be later than next year';
  end if;
  if tg_op = 'INSERT' then
    if new.ofw_status is not null and new.ofw_updated_at is null then new.ofw_updated_at := current_date; end if;
  elsif (new.ofw_status, new.ofw_since) is distinct from (old.ofw_status, old.ofw_since)
        and new.ofw_updated_at is not distinct from old.ofw_updated_at then
    new.ofw_updated_at := current_date;
  end if;
  return new;
end;
$$;

-- A former OFW's contract year (kept by 0121 as their last stint) goes, so
-- the check below holds. Each change is logged as any member edit.
update members set ofw_since = null where ofw_since is not null and ofw_status is distinct from 'Abroad';

-- "Next year" moves, so the upper bound here is only a backstop; the forms
-- and members_ofw_tidy() hold it to next year. Abroad now only.
alter table members drop constraint if exists members_ofw_years_check;
alter table members add constraint members_ofw_years_check
  check ((ofw_since is null or ofw_since between 1950 and 2100)
         and (ofw_since is null or ofw_status = 'Abroad'));

-- ---- views ------------------------------------------------------------------------------

-- As in 0121, without the country and the year home.
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
    m.family_no,
    m.occupation_group,
    m.ofw_status,
    m.ofw_since,
    m.ofw_updated_at,
    (EXISTS ( SELECT 1
           FROM members x
          WHERE ((x.household_id = m.household_id) AND (x.ofw_status = 'Abroad'::text) AND member_is_current(x.membership_status)))) AS household_ofw
   FROM (members m
     JOIN households h ON ((h.id = m.household_id)));

grant select on members_with_household to authenticated;

-- ---- registration and New Household -----------------------------------------

-- As in 0121 (0062 plus the occupation group and OFW answer), with no country or year home (occupationGroup,
-- ofwStatus, ofwSince on each member).
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
       has_matrimony, mat_date, mat_church, mat_type, ministries, organizations,
       occupation_group, ofw_status, ofw_since)
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
       ),
       -- 0121: the occupation group and OFW answer (members_ofw_tidy() keeps them whole).
       (select g from unnest(occupation_groups()) g where g = trim(mem->>'occupationGroup')),
       (select s from unnest(ofw_statuses()) s where s = trim(mem->>'ofwStatus')),
       ofw_year(mem->>'ofwSince'))
    returning id into new_member_id;
    -- Blood types live in member_blood_types (0062), out of GKK leaders' reach.
    if nullif(trim(mem->>'bloodType'), '') is not null then
      insert into member_blood_types (member_id, blood_type) values (new_member_id, trim(mem->>'bloodType'));
    end if;
  end loop;

  return jsonb_build_object('refNo', new_ref_no, 'householdId', new_household_id);
end;
$function$;

-- As in 0121 (0062 plus the occupation group and OFW answer), with no country or year home.
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
       has_matrimony, mat_date, mat_church, mat_type, ministries, organizations,
       occupation_group, ofw_status, ofw_since)
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
       ),
       -- 0121: the occupation group and OFW answer (members_ofw_tidy() keeps them whole).
       (select g from unnest(occupation_groups()) g where g = trim(mem->>'occupationGroup')),
       (select s from unnest(ofw_statuses()) s where s = trim(mem->>'ofwStatus')),
       ofw_year(mem->>'ofwSince'))
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

-- As in 0121, with no country or year home.
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
       has_matrimony, mat_date, mat_church, mat_type, ministries, organizations,
       occupation_group, ofw_status, ofw_since)
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
       ),
       -- 0121: the occupation group and OFW answer (members_ofw_tidy() keeps them whole).
       (select g from unnest(occupation_groups()) g where g = trim(mem->>'occupationGroup')),
       (select s from unnest(ofw_statuses()) s where s = trim(mem->>'ofwStatus')),
       ofw_year(mem->>'ofwSince'))
    returning id into new_member_id;
    -- Blood types live in member_blood_types (0062); a GKK leader records
    -- them too now (0120).
    if nullif(trim(mem->>'bloodType'), '') is not null then
      insert into member_blood_types (member_id, blood_type) values (new_member_id, trim(mem->>'bloodType'));
    end if;
  end loop;

  return new_household_id;
end;
$function$;

-- ---- census portal ----------------------------------------------------------------

-- As in 0121 (0054 plus occupation, the occupation group and the OFW answer), with no country or year home; so a
-- family sees and can change them for each member.
create or replace function public.portal_member_fields(m members) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'first_name', m.first_name, 'middle_name', m.middle_name, 'last_name', m.last_name, 'suffix', m.suffix,
    'relationship', m.relationship, 'sex', m.sex, 'dob', m.dob::text, 'civil_status', m.civil_status,
    'contact', m.contact, 'family_no', m.family_no,
    'occupation', m.occupation, 'occupation_group', m.occupation_group,
    'ofw_status', m.ofw_status, 'ofw_since', m.ofw_since);
$$;

-- As in 0121, with no country or year home: a contract year only abroad now. A key
-- left out keeps what is on record; a value that isn't valid does too.
create or replace function public.portal_clean_member_fields(p jsonb, fallback jsonb) returns jsonb
language plpgsql stable as $$
declare
  rel text := portal_text(p->>'relationship');
  sex_val text := portal_text(p->>'sex');
  civil text := portal_text(p->>'civil_status');
  dob_val date := portal_date(p->>'dob');
  heads text[] := array['Head of Household', 'Head of Family'];
  occ_group text := portal_text(p->>'occupation_group');
  ofw text := portal_text(p->>'ofw_status');
  since_val jsonb;
begin
  fallback := coalesce(fallback, '{}'::jsonb);
  if rel is null or rel not in ('Head of Household', 'Head of Family', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Grandfather',
                                'Grandmother', 'Grandchild', 'Sibling', 'In-law', 'Household Helper', 'Other') then
    rel := fallback->>'relationship';
  end if;
  if rel is distinct from fallback->>'relationship' and (rel = any(heads) or fallback->>'relationship' = any(heads)) then
    rel := fallback->>'relationship';
  end if;
  if sex_val is null or sex_val not in ('Male', 'Female') then sex_val := fallback->>'sex'; end if;
  if civil is null or civil not in ('Single', 'Married', 'Live-in', 'Widowed', 'Separated') then civil := fallback->>'civil_status'; end if;
  -- Occupation group: blank clears it; one not on the list keeps the old one.
  if not (p ? 'occupation_group') or (occ_group is not null and not (occ_group = any(occupation_groups()))) then
    occ_group := fallback->>'occupation_group';
  end if;
  -- The OFW answer: blank is "not an OFW"; anything else not on the list keeps the old one.
  if not (p ? 'ofw_status') or (ofw is not null and not (ofw = any(ofw_statuses()))) then
    ofw := fallback->>'ofw_status';
  end if;
  since_val := case when not (p ? 'ofw_since') then fallback->'ofw_since'
                    when portal_text(p->>'ofw_since') is null then 'null'::jsonb
                    else coalesce(to_jsonb(ofw_year(p->>'ofw_since')), fallback->'ofw_since') end;
  -- Kept whole, as members_ofw_tidy() would: a contract year only abroad now.
  if ofw is distinct from 'Abroad' then since_val := 'null'::jsonb; end if;
  return jsonb_build_object(
    'first_name', coalesce(portal_text(p->>'first_name', 80), fallback->>'first_name'),
    'middle_name', case when p ? 'middle_name' then portal_text(p->>'middle_name', 80) else fallback->>'middle_name' end,
    'last_name', coalesce(portal_text(p->>'last_name', 80), fallback->>'last_name'),
    'suffix', case when p ? 'suffix' then portal_text(p->>'suffix', 20) else fallback->>'suffix' end,
    'relationship', rel,
    'sex', sex_val,
    'dob', coalesce(dob_val::text, fallback->>'dob'),
    'civil_status', civil,
    'contact', case when p ? 'contact' then portal_text(p->>'contact', 60) else fallback->>'contact' end,
    'family_no', coalesce((fallback->>'family_no')::integer,
                          case when trim(coalesce(p->>'family_no', '')) ~ '^\d{1,2}$' then trim(p->>'family_no')::integer end, 1),
    'occupation', case when p ? 'occupation' then portal_text(p->>'occupation', 100) else fallback->>'occupation' end,
    'occupation_group', occ_group,
    'ofw_status', ofw,
    'ofw_since', coalesce(since_val, 'null'::jsonb)
  );
end;
$$;

-- As in 0121, with no country or year home. Occupation, the occupation group and the OFW answer, for
-- existing members (only what the family changed) and new ones.
create or replace function public.census_approve_submission(p_id integer) returns integer
language plpgsql security definer set search_path = public as $$
declare
  staff_name text := census_staff_name();
  s census_submissions;
  bh jsonb;
  ph jsonb;
  e jsonb;
  bm jsonb;
  pf jsonb;
  mid integer;
  fam smallint;
  responses jsonb := '[]'::jsonb;
  saved integer := 0;
  ofw_changed boolean;
begin
  if staff_name is null then raise exception 'Only parish staff can approve online updates'; end if;
  select * into s from census_submissions where id = p_id for update;
  if s.id is null then raise exception 'Online update not found'; end if;
  if s.status <> 'Pending' then raise exception 'This online update was already reviewed'; end if;
  if not exists (select 1 from census_cycles where id = s.cycle_id and status = 'Open') then
    raise exception 'This census is closed. Reopen it to approve updates.';
  end if;

  perform census_take_snapshot(s.cycle_id, s.household_id);

  -- Household: only what the family changed.
  bh := s.before->'household';
  ph := s.proposed->'household';
  update households h set
    street   = case when ph->>'street'   is distinct from bh->>'street'   then coalesce(ph->>'street', h.street) else h.street end,
    barangay = case when ph->>'barangay' is distinct from bh->>'barangay' then coalesce(ph->>'barangay', h.barangay) else h.barangay end,
    city     = case when ph->>'city'     is distinct from bh->>'city'     then coalesce(ph->>'city', h.city) else h.city end,
    province = case when ph->>'province' is distinct from bh->>'province' then coalesce(ph->>'province', h.province) else h.province end,
    zip      = case when ph->>'zip'      is distinct from bh->>'zip'      then coalesce(ph->>'zip', h.zip) else h.zip end,
    contact  = case when ph->>'contact'  is distinct from bh->>'contact'  then ph->>'contact' else h.contact end,
    email    = case when ph->>'email'    is distinct from bh->>'email'    then ph->>'email' else h.email end
  where h.id = s.household_id;

  -- Existing members: only changed fields; members removed since are skipped.
  -- A family head stays a head (and a member never becomes one) here.
  for e in select * from jsonb_array_elements(s.proposed->'members') loop
    mid := (e->>'id')::integer;
    continue when not exists (select 1 from members where id = mid and household_id = s.household_id);
    bm := s.before->'members'->(mid::text);
    pf := e->'fields';
    ofw_changed := pf ? 'ofw_status' and (
      (pf->>'ofw_status', pf->>'ofw_since') is distinct from (bm->>'ofw_status', bm->>'ofw_since'));
    update members m set
      first_name   = case when pf->>'first_name'   is distinct from bm->>'first_name'   then coalesce(pf->>'first_name', m.first_name) else m.first_name end,
      middle_name  = case when pf->>'middle_name'  is distinct from bm->>'middle_name'  then pf->>'middle_name' else m.middle_name end,
      last_name    = case when pf->>'last_name'    is distinct from bm->>'last_name'    then coalesce(pf->>'last_name', m.last_name) else m.last_name end,
      suffix       = case when pf->>'suffix'       is distinct from bm->>'suffix'       then pf->>'suffix' else m.suffix end,
      relationship = case when pf->>'relationship' is distinct from bm->>'relationship'
                           and coalesce(pf->>'relationship', '') not in ('Head of Household', 'Head of Family')
                           and coalesce(m.relationship, '') not in ('Head of Household', 'Head of Family')
                          then pf->>'relationship' else m.relationship end,
      sex          = case when pf->>'sex'          is distinct from bm->>'sex'          then pf->>'sex' else m.sex end,
      dob          = case when pf->>'dob'          is distinct from bm->>'dob'          then (pf->>'dob')::date else m.dob end,
      civil_status = case when pf->>'civil_status' is distinct from bm->>'civil_status' then pf->>'civil_status' else m.civil_status end,
      contact      = case when pf->>'contact'      is distinct from bm->>'contact'      then pf->>'contact' else m.contact end,
      -- 0121: occupation and its group (an update sent before 0121 has neither,
      -- so nothing changes), and the OFW answer, taken whole when any part changed.
      occupation   = case when pf ? 'occupation' and pf->>'occupation' is distinct from bm->>'occupation' then pf->>'occupation' else m.occupation end,
      occupation_group = case when pf ? 'occupation_group' and pf->>'occupation_group' is distinct from bm->>'occupation_group'
                              then (select g from unnest(occupation_groups()) g where g = pf->>'occupation_group') else m.occupation_group end,
      ofw_status   = case when ofw_changed then (select x from unnest(ofw_statuses()) x where x = pf->>'ofw_status') else m.ofw_status end,
      ofw_since    = case when ofw_changed then ofw_year(pf->>'ofw_since') else m.ofw_since end,
      -- Asked and confirmed as it was: dated today (a change is dated by members_ofw_tidy()).
      ofw_updated_at = case when not ofw_changed and coalesce((e->>'ofw_asked')::boolean, false) and m.ofw_status is not null
                            then current_date else m.ofw_updated_at end
    where m.id = mid;
    if e->>'status' is not null then
      responses := responses || jsonb_build_array(jsonb_build_object(
        'memberId', mid, 'status', e->>'status', 'participation', e->'participation', 'notes', e->>'notes'));
    end if;
  end loop;

  -- New members, into their family while it's still in the house.
  for e in select * from jsonb_array_elements(s.proposed->'newMembers') loop
    pf := e->'fields';
    continue when coalesce(pf->>'relationship', '') in ('Head of Household', 'Head of Family');
    fam := case when trim(coalesce(pf->>'family_no', '')) ~ '^\d{1,2}$' then (pf->>'family_no')::smallint else 1 end;
    if not exists (select 1 from members where household_id = s.household_id and family_no = fam) then fam := 1; end if;
    insert into members
      (household_id, family_no, first_name, middle_name, last_name, suffix, relationship, sex, dob, civil_status, contact,
       place_of_birth, tribe, email, occupation, religion,
       has_baptism, baptism_date, baptism_church,
       has_communion, communion_date, communion_church,
       has_confirmation, conf_date, conf_church, conf_name, conf_sponsor,
       has_matrimony, mat_date, mat_church, mat_type,
       organizations, gkk_role, parish_role,
       occupation_group, ofw_status, ofw_since)
    values
      (s.household_id, fam, pf->>'first_name', pf->>'middle_name', pf->>'last_name', pf->>'suffix', pf->>'relationship',
       pf->>'sex', (pf->>'dob')::date, pf->>'civil_status', pf->>'contact',
       pf->>'place_of_birth', pf->>'tribe', pf->>'email', pf->>'occupation', coalesce(pf->>'religion', 'Roman Catholic'),
       coalesce((pf->>'has_baptism')::boolean, false), (pf->>'baptism_date')::date, pf->>'baptism_church',
       coalesce((pf->>'has_communion')::boolean, false), (pf->>'communion_date')::date, pf->>'communion_church',
       coalesce((pf->>'has_confirmation')::boolean, false), (pf->>'conf_date')::date, pf->>'conf_church', pf->>'conf_name', pf->>'conf_sponsor',
       coalesce((pf->>'has_matrimony')::boolean, false), (pf->>'mat_date')::date, pf->>'mat_church', pf->>'mat_type',
       array(
         select o.name from organizations o
         where jsonb_typeof(pf->'organizations') = 'array'
           and o.name in (select jsonb_array_elements_text(pf->'organizations'))
         order by o.name),
       pf->>'gkk_role',
       (select pp.name from parish_positions pp where pp.name = pf->>'parish_role' limit 1),
       (select g from unnest(occupation_groups()) g where g = pf->>'occupation_group'),
       (select x from unnest(ofw_statuses()) x where x = pf->>'ofw_status'),
       ofw_year(pf->>'ofw_since'))
    returning id into mid;
    -- The blood type the family gave (0120), checked against the list again.
    if pf->>'blood_type' = any(blood_types()) then
      insert into member_blood_types (member_id, blood_type) values (mid, pf->>'blood_type')
      on conflict (member_id) do update set blood_type = excluded.blood_type;
    end if;
    if e->>'status' is not null then
      responses := responses || jsonb_build_array(jsonb_build_object(
        'memberId', mid, 'status', e->>'status', 'participation', e->'participation', 'notes', e->>'notes'));
    end if;
  end loop;

  if jsonb_array_length(responses) > 0 then
    saved := census_apply_responses(s.cycle_id, s.household_id, responses, 'Portal', auth.uid(), staff_name);
  end if;

  update census_submissions set status = 'Approved', reviewed_by = auth.uid(), reviewed_by_name = staff_name, reviewed_at = now()
  where id = p_id;
  return saved;
end;
$$;

-- ---- merging two members ------------------------------------------------------------

-- As in 0121, with no country or year home.
create or replace function public.merge_members(p_keep integer, p_other integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  k members;
  o members;
  trash_id bigint;
  other_label text;
  other_household text;
begin
  perform require_full_access('merge members');
  if p_keep is null or p_other is null or p_keep = p_other then raise exception 'Choose two different members'; end if;
  select * into k from members where id = p_keep for update;
  select * into o from members where id = p_other for update;
  if k.id is null or o.id is null then raise exception 'One of these members is no longer in the registry'; end if;
  other_label := concat_ws(' ', o.first_name, o.last_name, o.suffix);
  select household_name into other_household from households where id = o.household_id;

  update members set
    middle_name      = coalesce(nullif(trim(k.middle_name), ''), o.middle_name),
    suffix           = coalesce(nullif(trim(k.suffix), ''), o.suffix),
    sex              = coalesce(nullif(trim(k.sex), ''), o.sex),
    place_of_birth   = coalesce(nullif(trim(k.place_of_birth), ''), o.place_of_birth),
    civil_status     = coalesce(nullif(trim(k.civil_status), ''), o.civil_status),
    contact          = coalesce(nullif(trim(k.contact), ''), o.contact),
    email            = coalesce(nullif(trim(k.email), ''), o.email),
    occupation       = coalesce(nullif(trim(k.occupation), ''), o.occupation),
    occupation_group = coalesce(k.occupation_group, o.occupation_group),
    -- The OFW answer of one of them, whole (0121): never one's status with the other's year.
    ofw_status       = case when k.ofw_status is not null then k.ofw_status else o.ofw_status end,
    ofw_since        = case when k.ofw_status is not null then k.ofw_since else o.ofw_since end,
    ofw_updated_at   = case when k.ofw_status is not null then k.ofw_updated_at else o.ofw_updated_at end,
    religion         = coalesce(nullif(trim(k.religion), ''), o.religion),
    tribe            = coalesce(nullif(trim(k.tribe), ''), o.tribe),
    gkk_role         = coalesce(nullif(trim(k.gkk_role), ''), o.gkk_role),
    parish_role      = coalesce(nullif(trim(k.parish_role), ''), o.parish_role),
    membership_status = coalesce(k.membership_status, o.membership_status),
    has_baptism      = k.has_baptism or o.has_baptism,
    baptism_date     = coalesce(k.baptism_date, o.baptism_date),
    baptism_church   = coalesce(nullif(trim(k.baptism_church), ''), o.baptism_church),
    has_communion    = k.has_communion or o.has_communion,
    communion_date   = coalesce(k.communion_date, o.communion_date),
    communion_church = coalesce(nullif(trim(k.communion_church), ''), o.communion_church),
    has_confirmation = k.has_confirmation or o.has_confirmation,
    conf_date        = coalesce(k.conf_date, o.conf_date),
    conf_church      = coalesce(nullif(trim(k.conf_church), ''), o.conf_church),
    conf_name        = coalesce(nullif(trim(k.conf_name), ''), o.conf_name),
    conf_sponsor     = coalesce(nullif(trim(k.conf_sponsor), ''), o.conf_sponsor),
    has_matrimony    = k.has_matrimony or o.has_matrimony,
    mat_date         = coalesce(k.mat_date, o.mat_date),
    mat_church       = coalesce(nullif(trim(k.mat_church), ''), o.mat_church),
    mat_type         = coalesce(nullif(trim(k.mat_type), ''), o.mat_type),
    ministries       = array(select distinct x from unnest(coalesce(k.ministries, '{}') || coalesce(o.ministries, '{}')) x order by x),
    organizations    = array(select distinct x from unnest(coalesce(k.organizations, '{}') || coalesce(o.organizations, '{}')) x order by x)
  where id = p_keep;

  insert into member_blood_types (member_id, blood_type)
  select p_keep, blood_type from member_blood_types where member_id = p_other
  on conflict (member_id) do nothing;
  update sacrament_verifications set member_id = p_keep
  where member_id = p_other and sacrament not in (select sacrament from sacrament_verifications where member_id = p_keep);
  update census_member_responses set member_id = p_keep
  where member_id = p_other and cycle_id not in (select cycle_id from census_member_responses where member_id = p_keep);
  update member_service ms set member_id = p_keep
  where ms.member_id = p_other and not exists (
    select 1 from member_service ks
    where ks.member_id = p_keep and ks.kind = ms.kind and lower(ks.name) = lower(ms.name)
      and ks.from_year is not distinct from ms.from_year and ks.to_year is not distinct from ms.to_year);
  update certificate_requests set member_id = p_keep where member_id = p_other;
  update sacrament_requests set member_id = p_keep where member_id = p_other;
  update blood_donors set member_id = p_keep where member_id = p_other;
  update org_nodes set member_id = p_keep where member_id = p_other;
  update org_gkk_holders set member_id = p_keep where member_id = p_other;
  update org_gkk_officers set member_id = p_keep where member_id = p_other;

  trash_id := trash_member(p_other);

  insert into activity_log (actor, actor_name, action, table_name, record_id, household_id, member_id, label, changes)
  values (auth.uid(), current_staff_name(), 'merge', 'members', p_keep::text, k.household_id, p_keep,
          concat_ws(' ', k.first_name, k.last_name),
          jsonb_build_object('merged', other_label, 'household', other_household));
  return trash_id;
end;
$$;

-- ---- Reports → Report Stats -----------------------------------------------------------

-- As in 0121, with members abroad by kind of work ('by_work') instead of by country.
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
    -- Members old enough for each sacrament (no birth date: can't be ruled
    -- out), and how many of them haven't received it.
    'sacrament_eligible', (
      select jsonb_build_object(
        'baptism', count(*),
        'communion', count(*) filter (where report_age_at_least(dob, 7)),
        'confirmation', count(*) filter (where report_age_at_least(dob, 7)),
        'matrimony', count(*) filter (where report_age_at_least(dob, 18)))
      from members where member_is_current(membership_status)
    ),
    'sacrament_missing', (
      select jsonb_build_object(
        'baptism', count(*) filter (where not has_baptism),
        'communion', count(*) filter (where not has_communion and report_age_at_least(dob, 7)),
        'confirmation', count(*) filter (where not has_confirmation and report_age_at_least(dob, 7)),
        'matrimony', count(*) filter (where not has_matrimony and report_age_at_least(dob, 18)))
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
    -- Everyone who has Reports and blood types gets them; a GKK leader their
    -- GKK's, as the rows they may read are (0120).
    'blood', (
      select coalesce(jsonb_object_agg(blood_type, n), '{}'::jsonb)
      from (select b.blood_type, count(*) as n from members m join member_blood_types b on b.member_id = m.id
            where member_is_current(m.membership_status) and coalesce(b.blood_type, '') <> '' group by b.blood_type) t
    ),
    'blood_unknown',
      (select count(*) from members m where member_is_current(m.membership_status)
         and not exists (select 1 from member_blood_types b where b.member_id = m.id and coalesce(b.blood_type, '') <> '')),
    -- 0121: OFWs among the current members. An OFW household has a member
    -- abroad now; a former OFW household has none abroad and one back home.
    'ofw', (
      with o as (
        select m.household_id, m.ofw_status, m.occupation_group, h.gkk
        from members m join households h on h.id = m.household_id
        where m.ofw_status is not null and member_is_current(m.membership_status)
      )
      select jsonb_build_object(
        'households_abroad', (select count(distinct household_id) from o where ofw_status = 'Abroad'),
        'households_returned', (select count(distinct household_id) from o
                                where ofw_status = 'Returned'
                                  and household_id not in (select household_id from o where ofw_status = 'Abroad')),
        'members_abroad', (select count(*) from o where ofw_status = 'Abroad'),
        'members_returned', (select count(*) from o where ofw_status = 'Returned'),
        'by_gkk', (select coalesce(jsonb_agg(jsonb_build_object('gkk', t.gkk, 'households', t.households, 'members', t.members)
                                             order by t.gkk nulls last), '[]'::jsonb)
                   from (select gkk, count(distinct household_id) as households, count(*) as members
                         from o where ofw_status = 'Abroad' group by gkk) t),
        -- Members abroad now by kind of work (their occupation group; null: none yet).
        'by_work', (select coalesce(jsonb_agg(jsonb_build_object('group', t.g, 'members', t.n) order by t.n desc, t.g nulls last), '[]'::jsonb)
                    from (select occupation_group as g, count(*) as n from o where ofw_status = 'Abroad' group by 1) t))
    ),
    -- Current members 15 and over (or with no birth date) by occupation group;
    -- an occupation typed but not yet given a group is "not sorted".
    'occupation_groups', (
      select coalesce(jsonb_agg(jsonb_build_object('group', t.g, 'members', t.n) order by t.n desc, t.g), '[]'::jsonb)
      from (select occupation_group as g, count(*) as n from members
            where member_is_current(membership_status) and report_age_at_least(dob, 15) and occupation_group is not null
            group by occupation_group) t
    ),
    'occupation_not_sorted', (select count(*) from members
                              where member_is_current(membership_status) and report_age_at_least(dob, 15)
                                and occupation_group is null and coalesce(trim(occupation), '') <> ''),
    'occupation_not_given', (select count(*) from members
                             where member_is_current(membership_status) and report_age_at_least(dob, 15)
                               and occupation_group is null and coalesce(trim(occupation), '') = '')
  );
$function$;

-- create or replace dropped 0093's setting: a leader's numbers stay their GKK's.
alter function public.admin_report_stats() set application_name = 'parish:own_gkk_only';

notify pgrst, 'reload schema';
