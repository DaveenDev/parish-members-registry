-- OFW (Overseas Filipino Worker) details and occupation groups on members,
-- and the OFW household worked out from them. Every parish, no setting.
-- Run after 0120_leader_blood_types.sql. Safe to re-run.
--
-- * members: occupation_group (one of occupation_groups(), so occupations
--   can be counted; the free-text occupation stays), ofw_status ('Abroad' =
--   abroad now, 'Returned' = a former OFW back home, null = not an OFW or not
--   asked), ofw_country, ofw_since (start of the current or last contract),
--   ofw_returned (year they came home, 'Returned' only) and ofw_updated_at
--   (when the OFW answer was last given). members_ofw_tidy() keeps them
--   together: no OFW answer clears the rest, abroad clears the year home,
--   and a changed answer is dated.
-- * households_with_count: ofw_abroad_count and ofw_returned_count (current
--   members abroad / back home). An OFW household has a member abroad now;
--   nothing is stored, so it never disagrees with the members.
--   members_with_household: the member's columns and household_ofw.
-- * Registration, the family form and staff New Household save them.
-- * Census portal: families see and change occupation and the OFW answer of
--   existing members, and give them for new ones; approving the update
--   applies them, and confirming an OFW's answer dates it.
-- * Merging two members keeps the OFW answer of one of them, whole.
-- * Report Stats: 'ofw' and 'occupation_groups' (a leader's: their GKK).
-- * Census: a member abroad with no answer counts as 'Abroad', not 'Not
--   confirmed'; a closed census keeps its OFW counts (census_results.ofw).
-- * Practicing Catholic: a current member abroad is 'Abroad', not rated.
--
-- Seen with the member by everyone who sees the member (no hiding by access
-- level); never on the public website.

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'member_blood_types'
                 and policyname = 'member_blood_types_select' and qual like '%gkk_leader%')
     or to_regprocedure('public.merge_members(integer, integer)') is null
     or to_regprocedure('public.census_keep_results(integer, jsonb)') is null
     or to_regprocedure('public.member_practice_from(members, jsonb, jsonb, text, jsonb)') is null then
    raise exception 'Run the migrations up to 0120_leader_blood_types.sql before this one';
  end if;
end;
$$;

-- ---- lists ----------------------------------------------------------------------

-- Keep in step with OCCUPATION_GROUPS in client/src/constants.js.
create or replace function public.occupation_groups() returns text[]
language sql immutable as $$
  select array['Farming or fishing', 'Business or vendor', 'Driver or transport', 'Construction or skilled trade',
               'Factory or labourer', 'Office or sales staff', 'Teacher', 'Health worker', 'Government, police or military',
               'Seafarer', 'Household service or caregiver', 'Professional', 'Student', 'Homemaker', 'Retired',
               'Looking for work', 'Other'];
$$;

create or replace function public.ofw_statuses() returns text[]
language sql immutable as $$
  select array['Abroad', 'Returned'];
$$;

-- A year typed on a form ("2019"), from 1950 to next year; else null.
create or replace function public.ofw_year(p text) returns smallint
language sql stable as $$
  select case when trim(coalesce(p, '')) ~ '^\d{4}$'
               and trim(p)::int between 1950 and extract(year from current_date)::int + 1
              then trim(p)::smallint end;
$$;

-- ---- columns ----------------------------------------------------------------------

alter table members
  add column if not exists occupation_group text,
  add column if not exists ofw_status text,
  add column if not exists ofw_country text,
  add column if not exists ofw_since smallint,
  add column if not exists ofw_returned smallint,
  add column if not exists ofw_updated_at date;

alter table members drop constraint if exists members_occupation_group_check;
alter table members add constraint members_occupation_group_check
  check (occupation_group is null or (length(occupation_group) <= 60 and occupation_group = any(occupation_groups())));
alter table members drop constraint if exists members_ofw_status_check;
alter table members add constraint members_ofw_status_check
  check (ofw_status is null or ofw_status in ('Abroad', 'Returned'));
alter table members drop constraint if exists members_ofw_country_check;
alter table members add constraint members_ofw_country_check
  check (ofw_country is null or length(ofw_country) <= 60);
-- "Next year" moves, so the upper bound here is only a backstop; the forms
-- and members_ofw_tidy() hold them to next year.
alter table members drop constraint if exists members_ofw_years_check;
alter table members add constraint members_ofw_years_check
  check ((ofw_since is null or ofw_since between 1950 and 2100)
         and (ofw_returned is null or ofw_returned between 1950 and 2100)
         and (ofw_returned is null or ofw_since is null or ofw_returned >= ofw_since)
         and (ofw_returned is null or ofw_status = 'Returned'));

-- The household flag's subqueries only look at members with an answer.
create index if not exists members_ofw_household_idx on members (household_id) where ofw_status is not null;

/**
 * Keeps a member's OFW answer whole, whichever form saves it: no answer (not
 * an OFW) clears the country and years; abroad now clears the year home; a
 * year later than next year is refused. When the answer changes (or is given
 * on a new member), ofw_updated_at becomes today, unless the save sets it.
 */
create or replace function public.members_ofw_tidy() returns trigger
language plpgsql set search_path = public as $$
begin
  new.occupation_group := nullif(trim(new.occupation_group), '');
  new.ofw_status := nullif(trim(new.ofw_status), '');
  new.ofw_country := nullif(trim(new.ofw_country), '');
  if new.ofw_status is null then
    new.ofw_country := null; new.ofw_since := null; new.ofw_returned := null;
  elsif new.ofw_status = 'Abroad' then
    new.ofw_returned := null;
  end if;
  if new.ofw_since > extract(year from current_date) + 1 or new.ofw_returned > extract(year from current_date) + 1 then
    raise exception 'An OFW year can''t be later than next year';
  end if;
  if new.ofw_returned < new.ofw_since then
    raise exception 'The year they came home can''t be before their last contract started';
  end if;
  if tg_op = 'INSERT' then
    if new.ofw_status is not null and new.ofw_updated_at is null then new.ofw_updated_at := current_date; end if;
  elsif (new.ofw_status, new.ofw_country, new.ofw_since, new.ofw_returned)
          is distinct from (old.ofw_status, old.ofw_country, old.ofw_since, old.ofw_returned)
        and new.ofw_updated_at is not distinct from old.ofw_updated_at then
    new.ofw_updated_at := current_date;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_members_ofw_tidy on members;
create trigger trg_members_ofw_tidy before insert or update on members
  for each row execute function members_ofw_tidy();

-- ---- views ----------------------------------------------------------------------------

-- As in 0057, plus the members abroad now and back home (current members only).
drop view if exists households_with_count;
create view households_with_count
with (security_invoker = true) as
select
  h.*,
  (select count(*)::int from members m where m.household_id = h.id) as member_count,
  (select concat_ws(' ', m.first_name, m.last_name, nullif(m.suffix, ''))
     from members m
    where m.household_id = h.id and m.relationship = 'Head of Household'
    order by m.id limit 1) as head_name,
  greatest(1, (select count(distinct m.family_no)::int from members m
                where m.household_id = h.id and member_is_current(m.membership_status))) as family_count,
  (substring(h.family_grouping from '\d{1,9}'))::int as family_grouping_no,
  (select count(*)::int from members m
    where m.household_id = h.id and m.ofw_status = 'Abroad' and member_is_current(m.membership_status)) as ofw_abroad_count,
  (select count(*)::int from members m
    where m.household_id = h.id and m.ofw_status = 'Returned' and member_is_current(m.membership_status)) as ofw_returned_count
from households h;

grant select on households_with_count to authenticated;

-- As in 0062, plus the member's occupation group and OFW answer, and whether
-- their household has a current member abroad.
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
    m.ofw_country,
    m.ofw_since,
    m.ofw_returned,
    m.ofw_updated_at,
    (EXISTS ( SELECT 1
           FROM members x
          WHERE ((x.household_id = m.household_id) AND (x.ofw_status = 'Abroad'::text) AND member_is_current(x.membership_status)))) AS household_ofw
   FROM (members m
     JOIN households h ON ((h.id = m.household_id)));

-- ---- registration and New Household -----------------------------------------

-- As in 0062, plus the occupation group and OFW answer (occupationGroup,
-- ofwStatus, ofwCountry, ofwSince, ofwReturned on each member).
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
       occupation_group, ofw_status, ofw_country, ofw_since, ofw_returned)
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
       left(nullif(trim(mem->>'ofwCountry'), ''), 60), ofw_year(mem->>'ofwSince'), ofw_year(mem->>'ofwReturned'))
    returning id into new_member_id;
    -- Blood types live in member_blood_types (0062), out of GKK leaders' reach.
    if nullif(trim(mem->>'bloodType'), '') is not null then
      insert into member_blood_types (member_id, blood_type) values (new_member_id, trim(mem->>'bloodType'));
    end if;
  end loop;

  return jsonb_build_object('refNo', new_ref_no, 'householdId', new_household_id);
end;
$function$;

-- As in 0062, plus the occupation group and OFW answer.
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
       occupation_group, ofw_status, ofw_country, ofw_since, ofw_returned)
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
       left(nullif(trim(mem->>'ofwCountry'), ''), 60), ofw_year(mem->>'ofwSince'), ofw_year(mem->>'ofwReturned'))
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

-- As in 0120, plus the occupation group and OFW answer.
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
       occupation_group, ofw_status, ofw_country, ofw_since, ofw_returned)
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
       left(nullif(trim(mem->>'ofwCountry'), ''), 60), ofw_year(mem->>'ofwSince'), ofw_year(mem->>'ofwReturned'))
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

-- As in 0054, plus occupation, the occupation group and the OFW answer, so a
-- family sees and can change them for each member.
create or replace function public.portal_member_fields(m members) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'first_name', m.first_name, 'middle_name', m.middle_name, 'last_name', m.last_name, 'suffix', m.suffix,
    'relationship', m.relationship, 'sex', m.sex, 'dob', m.dob::text, 'civil_status', m.civil_status,
    'contact', m.contact, 'family_no', m.family_no,
    'occupation', m.occupation, 'occupation_group', m.occupation_group,
    'ofw_status', m.ofw_status, 'ofw_country', m.ofw_country, 'ofw_since', m.ofw_since, 'ofw_returned', m.ofw_returned);
$$;

-- As in 0054, plus occupation, the occupation group and the OFW answer. A key
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
  home_val jsonb;
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
  home_val := case when not (p ? 'ofw_returned') then fallback->'ofw_returned'
                   when portal_text(p->>'ofw_returned') is null then 'null'::jsonb
                   else coalesce(to_jsonb(ofw_year(p->>'ofw_returned')), fallback->'ofw_returned') end;
  -- Kept whole, as members_ofw_tidy() would: no year home unless back home,
  -- and none before the last contract started.
  if ofw is distinct from 'Returned' or (jsonb_typeof(since_val) = 'number' and jsonb_typeof(home_val) = 'number'
                                         and home_val::int < since_val::int) then
    home_val := 'null'::jsonb;
  end if;
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
    'ofw_country', case when ofw is null then null
                        when p ? 'ofw_country' then portal_text(p->>'ofw_country', 60) else fallback->>'ofw_country' end,
    'ofw_since', case when ofw is null then 'null'::jsonb else coalesce(since_val, 'null'::jsonb) end,
    'ofw_returned', coalesce(home_val, 'null'::jsonb)
  );
end;
$$;

-- As in 0090, plus: each member's fields carry occupation and the OFW answer
-- (portal_clean_member_fields), and 'ofw_asked' says the form asked the OFW
-- question. An update with no changes dates the OFW answers it confirmed.
-- Answers { ok, submittedAt, approved }.
create or replace function public.portal_submit(p_ref text, p_code text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  chk jsonb := portal_check(p_ref, p_code);
  hid integer;
  cyc_id integer;
  h households;
  before_json jsonb;
  hh_in jsonb := coalesce(p_payload->'household', '{}'::jsonb);
  hh_out jsonb;
  members_out jsonb := '[]'::jsonb;
  new_out jsonb := '[]'::jsonb;
  e jsonb;
  mid integer;
  fields jsonb;
  status_val text;
  k text;
  saved_at timestamptz;
  changed boolean;
  responses jsonb;
begin
  if not (chk->>'ok')::boolean then return chk; end if;
  hid := (chk->>'householdId')::integer;
  select id into cyc_id from census_cycles where status = 'Open';
  select * into h from households where id = hid;

  if coalesce((p_payload->>'consent')::boolean, false) is not true then
    raise exception 'Data privacy consent is required';
  end if;

  before_json := jsonb_build_object(
    'household', portal_household_fields(h),
    'members', coalesce((select jsonb_object_agg(m.id::text, portal_member_fields(m)) from members m where m.household_id = hid), '{}'::jsonb));

  -- Household: a missing key keeps what is on record; required address
  -- parts can't be blanked.
  hh_out := before_json->'household';
  if jsonb_typeof(hh_in) = 'object' then
    foreach k in array array['street', 'barangay', 'city', 'province', 'zip', 'contact', 'email'] loop
      continue when not (hh_in ? k);
      if k in ('contact', 'email') or portal_text(hh_in->>k) is not null then
        hh_out := jsonb_set(hh_out, array[k], coalesce(to_jsonb(portal_text(hh_in->>k,
          case k when 'street' then 200 when 'zip' then 20 when 'contact' then 60 when 'email' then 120 else 100 end)), 'null'::jsonb));
      end if;
    end loop;
  end if;

  if jsonb_typeof(p_payload->'members') = 'array' then
    if jsonb_array_length(p_payload->'members') > 30 then raise exception 'A household can have at most 30 members'; end if;
    for e in select * from jsonb_array_elements(p_payload->'members') loop
      mid := nullif(e->>'id', '')::integer;
      if mid is null or not (before_json->'members' ? mid::text) then
        raise exception 'A member in this form is not in your household';
      end if;
      status_val := e->>'status';
      if status_val is not null and not (status_val = any(census_member_statuses())) then status_val := null; end if;
      fields := portal_clean_member_fields(e, before_json->'members'->(mid::text));
      members_out := members_out || jsonb_build_array(jsonb_build_object(
        'id', mid, 'fields', fields, 'status', status_val,
        'ofw_asked', e ? 'ofw_status',
        'participation', census_clean_participation(e->'participation'),
        'notes', portal_text(e->>'notes', 500)));
    end loop;
  end if;

  if jsonb_typeof(p_payload->'newMembers') = 'array' then
    if jsonb_array_length(p_payload->'newMembers') > 10 then raise exception 'Add at most 10 new members at a time'; end if;
    for e in select * from jsonb_array_elements(p_payload->'newMembers') loop
      if trim(coalesce(e->>'relationship', '')) in ('Head of Household', 'Head of Family') then
        raise exception 'A new member cannot be a family head';
      end if;
      fields := portal_clean_member_fields(e, null) || portal_new_member_details(e);
      if fields->>'first_name' is null or fields->>'last_name' is null then raise exception 'Member first and last name are required'; end if;
      if fields->>'relationship' is null then raise exception 'Member relationship is required'; end if;
      -- Only one of the house's families; otherwise the first.
      if not exists (select 1 from members where household_id = hid and family_no = (fields->>'family_no')::integer) then
        fields := jsonb_set(fields, '{family_no}', '1'::jsonb);
      end if;
      status_val := e->>'status';
      if status_val is not null and not (status_val = any(census_member_statuses())) then status_val := null; end if;
      new_out := new_out || jsonb_build_array(jsonb_build_object(
        'fields', fields, 'status', status_val,
        'participation', census_clean_participation(e->'participation'),
        'notes', portal_text(e->>'notes', 500)));
    end loop;
  end if;

  -- Did the family change any details, take a member off the household
  -- (moved away, deceased, left the Church), or only answer the census?
  changed := jsonb_array_length(new_out) > 0
    or hh_out is distinct from before_json->'household'
    or exists (select 1 from jsonb_array_elements(members_out) x
               where x->'fields' is distinct from before_json->'members'->(x->>'id'))
    or exists (select 1 from jsonb_array_elements(members_out) x
               join members m on m.id = (x->>'id')::integer
               where x->>'status' in ('Moved away', 'Deceased', 'Left the Church')
                 and m.membership_status is distinct from x->>'status');

  delete from census_submissions where cycle_id = cyc_id and household_id = hid and status = 'Pending';

  if changed then
    insert into census_submissions (cycle_id, household_id, before, proposed, message)
    values (cyc_id, hid, before_json,
            jsonb_build_object('household', hh_out, 'members', members_out, 'newMembers', new_out),
            portal_text(p_payload->>'message', 1000))
    returning submitted_at into saved_at;
    return jsonb_build_object('ok', true, 'submittedAt', saved_at, 'approved', false);
  end if;

  -- Only answers: save them as census_approve_submission() would.
  select coalesce(jsonb_agg(jsonb_build_object(
           'memberId', (x->>'id')::integer, 'status', x->>'status', 'participation', x->'participation', 'notes', x->>'notes')), '[]'::jsonb)
    into responses
  from jsonb_array_elements(members_out) x
  where x->>'status' is not null;
  if jsonb_array_length(responses) > 0 then
    perform census_apply_responses(cyc_id, hid, responses, 'Portal', null, 'the family');
  end if;
  -- The family confirmed these members' OFW answers as they are.
  update members m set ofw_updated_at = current_date
  where m.household_id = hid and m.ofw_status is not null and m.ofw_updated_at is distinct from current_date
    and exists (select 1 from jsonb_array_elements(members_out) x
                where (x->>'id')::integer = m.id and coalesce((x->>'ofw_asked')::boolean, false));

  insert into census_submissions (cycle_id, household_id, before, proposed, message,
                                  status, reviewed_by_name, reviewed_at, review_note)
  values (cyc_id, hid, before_json,
          jsonb_build_object('household', hh_out, 'members', members_out, 'newMembers', new_out),
          portal_text(p_payload->>'message', 1000),
          'Approved', 'the system', now(), 'no details changed, so approved automatically')
  returning submitted_at into saved_at;
  return jsonb_build_object('ok', true, 'submittedAt', saved_at, 'approved', true);
end;
$$;
grant execute on function public.portal_submit(text, text, jsonb) to anon, authenticated;

-- As in 0120, plus occupation, the occupation group and the OFW answer, for
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
      (pf->>'ofw_status', pf->>'ofw_country', pf->>'ofw_since', pf->>'ofw_returned')
        is distinct from (bm->>'ofw_status', bm->>'ofw_country', bm->>'ofw_since', bm->>'ofw_returned'));
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
      ofw_country  = case when ofw_changed then left(pf->>'ofw_country', 60) else m.ofw_country end,
      ofw_since    = case when ofw_changed then ofw_year(pf->>'ofw_since') else m.ofw_since end,
      ofw_returned = case when ofw_changed then ofw_year(pf->>'ofw_returned') else m.ofw_returned end,
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
       occupation_group, ofw_status, ofw_country, ofw_since, ofw_returned)
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
       left(pf->>'ofw_country', 60), ofw_year(pf->>'ofw_since'), ofw_year(pf->>'ofw_returned'))
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

-- As in 0081, plus the occupation group and the OFW answer.
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
    -- The OFW answer of one of them, whole (0121): never one's country with the other's years.
    ofw_status       = case when k.ofw_status is not null then k.ofw_status else o.ofw_status end,
    ofw_country      = case when k.ofw_status is not null then k.ofw_country else o.ofw_country end,
    ofw_since        = case when k.ofw_status is not null then k.ofw_since else o.ofw_since end,
    ofw_returned     = case when k.ofw_status is not null then k.ofw_returned else o.ofw_returned end,
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

-- As in 0120, plus 'ofw' and the occupation groups.
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
        select m.household_id, m.ofw_status, m.ofw_country, h.gkk
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
        'by_country', (select coalesce(jsonb_agg(jsonb_build_object('country', t.country, 'abroad', t.abroad, 'returned', t.returned)
                                                 order by t.abroad desc, t.returned desc, t.country), '[]'::jsonb)
                       from (select coalesce(ofw_country, 'Not given') as country,
                                    count(*) filter (where ofw_status = 'Abroad') as abroad,
                                    count(*) filter (where ofw_status = 'Returned') as returned
                             from o group by 1) t))
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

-- ---- census -------------------------------------------------------------------------------

-- As in 0007: members per GKK and census status, but a current member abroad
-- with no answer is 'Abroad' (they can't take part here), not 'Not confirmed'.
create or replace function public.census_summary(p_cycle_id integer)
returns table (gkk text, status text, members integer)
language sql stable as $$
  select h.gkk, coalesce(r.status, case when m.ofw_status = 'Abroad' and member_is_current(m.membership_status)
                                        then 'Abroad' else 'Not confirmed' end), count(*)::int
  from members m
  join households h on h.id = m.household_id
  left join census_member_responses r on r.member_id = m.id and r.cycle_id = p_cycle_id
  where r.member_id is not null or coalesce(m.membership_status not in ('Moved away', 'Deceased'), true)
  group by 1, 2;
$$;
alter function public.census_summary(integer) set application_name = 'parish:own_gkk_only';

-- A closed census keeps its OFW numbers (households with a member abroad and
-- members abroad), so a past census's stay as they were.
alter table census_results add column if not exists ofw jsonb;

-- As in 0082, plus each row's OFW numbers, worked out here from the registry.
create or replace function public.census_keep_results(p_cycle_id integer, p_results jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  g text;
  n integer := 0;
  who text := census_staff_name();
begin
  if jsonb_typeof(p_results) is distinct from 'array' then raise exception 'No results to keep'; end if;
  if jsonb_array_length(p_results) > 1000 then raise exception 'Too many results to keep'; end if;
  delete from census_results where cycle_id = p_cycle_id;
  for r in select * from jsonb_array_elements(p_results) loop
    g := nullif(trim(coalesce(r->>'gkk', '')), '');
    continue when g is not null and not exists (select 1 from gkks where name = g);
    insert into census_results (cycle_id, gkk, summary, vs_last_year, saved_by_name, ofw)
    values (p_cycle_id, g,
            case when jsonb_typeof(r->'summary') = 'array' then r->'summary' else '[]'::jsonb end,
            case when jsonb_typeof(r->'vsLastYear') = 'object' then r->'vsLastYear' end,
            who,
            (select jsonb_build_object('households', count(distinct m.household_id), 'members', count(*))
             from members m join households h on h.id = m.household_id
             where m.ofw_status = 'Abroad' and member_is_current(m.membership_status) and (g is null or h.gkk = g)))
    on conflict (cycle_id, coalesce(gkk, '')) do update set
      summary = excluded.summary, vs_last_year = excluded.vs_last_year, saved_at = now(), saved_by_name = excluded.saved_by_name,
      ofw = excluded.ofw;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.census_keep_results(integer, jsonb) from public, anon, authenticated;

-- ---- Practicing Catholic ---------------------------------------------------------------

-- As in 0077, but a current member abroad is 'Abroad': not rated, and left out
-- of the practice percentages as the other unrated levels are.
create or replace function public.member_practice_from(
  m members, household_participation jsonb, cur_part jsonb, cur_label text, prev_part jsonb)
returns member_practice_t
language plpgsql stable set search_path = public as $$
declare
  own_part jsonb := case when practice_participation_points(m.registration_participation) is not null then m.registration_participation end;
  v_age int := case when m.dob is null then null else date_part('year', age(m.dob::timestamptz))::int end;
  v_part numeric;
  v_sac numeric;
  v_inv numeric;
  v_score numeric;
  result member_practice_t;
begin
  v_part := practice_participation_points(coalesce(cur_part, own_part, household_participation));
  v_sac := practice_sacrament_points(v_age, m.has_baptism, m.has_communion, m.has_confirmation);
  v_inv := practice_involvement_points(m.ministries, m.organizations, m.gkk_role, m.parish_role);
  v_score := case when v_part is null then null else v_part + v_sac + v_inv end;

  result := (
    v_score,
    practice_level(v_score, v_part, v_age, m.religion, member_is_current(m.membership_status)),
    v_part, v_sac, v_inv,
    case when cur_part is not null then 'census' when own_part is not null then 'registration' when v_part is not null then 'household' end,
    case when cur_part is not null then cur_label end,
    case when cur_part is not null and prev_part is not null
         then round(v_part - practice_participation_points(prev_part), 1) end);
  -- 0121: a current member abroad can't take part here, so isn't rated.
  if m.ofw_status = 'Abroad' and member_is_current(m.membership_status) then
    result.score := null;
    result.level := 'Abroad';
    result.trend := null;
  end if;
  return result;
end;
$$;

notify pgrst, 'reload schema';
