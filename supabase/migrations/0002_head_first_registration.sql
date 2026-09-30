-- Head-first registration wizard (run after 0001_init.sql)
--
-- Adds the fields the reworked public wizard collects — member suffix, tribe
-- and GKK responsibility, plus the household's parish-participation survey —
-- exposes the GKK list to the anonymous wizard, and teaches both insert RPCs
-- about the new fields. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table members add column if not exists suffix   text;
alter table members add column if not exists tribe    text;
alter table members add column if not exists gkk_role text;

-- participation: { mass | bible_service | devotions | meetings | pintakasi | financial : Aktibo | Panagsa | Wala }
-- help_ways: keys from HELP_WAYS in client/src/constants.js
alter table households add column if not exists participation jsonb  not null default '{}';
alter table households add column if not exists help_ways     text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Views — `m.*` / `h.*` were expanded when the views were first created, and
-- `create or replace view` can't insert the new columns ahead of the computed
-- ones, so drop and recreate them.
-- ---------------------------------------------------------------------------

drop view if exists members_with_household;
create view members_with_household
with (security_invoker = true) as
select
  m.*,
  h.household_name,
  h.status as household_status,
  h.gkk as household_gkk,
  h.street, h.barangay, h.city, h.province, h.zip,
  case when m.dob is null then null else date_part('year', age(m.dob))::int end as age,
  (m.first_name || ' ' || m.last_name) as full_name
from members m
join households h on h.id = m.household_id;

drop view if exists households_with_count;
create view households_with_count
with (security_invoker = true) as
select
  h.*,
  (select count(*)::int from members m where m.household_id = h.id) as member_count,
  (select concat_ws(' ', m.first_name, m.last_name, nullif(m.suffix, ''))
     from members m
    where m.household_id = h.id and m.relationship = 'Head of Household'
    order by m.id limit 1) as head_name
from households h;

grant select on members_with_household to authenticated;
grant select on households_with_count to authenticated;

-- ---------------------------------------------------------------------------
-- GKK list for the public wizard's dropdown. anon still has no direct table
-- access; this only ever returns the names.
-- ---------------------------------------------------------------------------

create or replace function public.list_public_gkks()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select name from gkks order by name;
$$;

grant execute on function public.list_public_gkks() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public registration — adds suffix/tribe/gkkRole per member, the
-- participation survey, a known-GKK check, and requires exactly one
-- Household Head.
-- ---------------------------------------------------------------------------

create or replace function public.submit_registration(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hh jsonb := payload->'household';
  mem jsonb;
  member_count integer;
  head_count integer;
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

  select count(*) into head_count
  from jsonb_array_elements(payload->'members') m
  where trim(m->>'relationship') = 'Head of Household';
  if head_count <> 1 then raise exception 'Exactly one Household Head is required'; end if;

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
      (household_id, first_name, middle_name, last_name, suffix, relationship, sex, dob, place_of_birth, tribe, civil_status,
       contact, email, occupation, religion, blood_type, gkk_role,
       has_baptism, baptism_date, baptism_church,
       has_communion, communion_date, communion_church,
       has_confirmation, conf_date, conf_church, conf_name, conf_sponsor,
       has_matrimony, mat_date, mat_church, mat_type, ministries)
    values
      (new_household_id, trim(mem->>'firstName'), nullif(trim(mem->>'middleName'), ''), trim(mem->>'lastName'),
       nullif(trim(mem->>'suffix'), ''),
       nullif(trim(mem->>'relationship'), ''), nullif(trim(mem->>'sex'), ''),
       nullif(trim(mem->>'dob'), '')::date, nullif(trim(mem->>'placeOfBirth'), ''), nullif(trim(mem->>'tribe'), ''),
       nullif(trim(mem->>'civilStatus'), ''), nullif(trim(mem->>'contact'), ''), nullif(trim(mem->>'email'), ''),
       nullif(trim(mem->>'occupation'), ''),
       coalesce(nullif(trim(mem->>'religion'), ''), 'Roman Catholic'), nullif(trim(mem->>'bloodType'), ''),
       nullif(trim(mem->>'gkkRole'), ''),
       coalesce((mem->>'hasBaptism')::boolean, false), nullif(trim(mem->>'baptismDate'), '')::date, nullif(trim(mem->>'baptismChurch'), ''),
       coalesce((mem->>'hasCommunion')::boolean, false), nullif(trim(mem->>'communionDate'), '')::date, nullif(trim(mem->>'communionChurch'), ''),
       coalesce((mem->>'hasConfirmation')::boolean, false), nullif(trim(mem->>'confDate'), '')::date, nullif(trim(mem->>'confChurch'), ''),
       nullif(trim(mem->>'confName'), ''), nullif(trim(mem->>'confSponsor'), ''),
       coalesce((mem->>'hasMatrimony')::boolean, false), nullif(trim(mem->>'matDate'), '')::date, nullif(trim(mem->>'matChurch'), ''),
       nullif(trim(mem->>'matType'), ''),
       coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(mem->'ministries', '[]'::jsonb)) x), '{}'));
  end loop;

  return jsonb_build_object('refNo', new_ref_no, 'householdId', new_household_id);
end;
$$;

grant execute on function public.submit_registration(jsonb) to anon;

-- ---------------------------------------------------------------------------
-- Admin household creation — adds suffix/tribe/gkkRole per member.
-- ---------------------------------------------------------------------------

create or replace function public.create_household(payload jsonb)
returns integer
language plpgsql as $$
declare
  hh jsonb := payload->'household';
  mem jsonb;
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

  if payload->'members' is null or jsonb_typeof(payload->'members') <> 'array'
     or jsonb_array_length(payload->'members') = 0 then
    raise exception 'At least one member is required';
  end if;

  for mem in select * from jsonb_array_elements(payload->'members') loop
    if coalesce(trim(mem->>'first'), '') = '' then raise exception 'Member first name is required'; end if;
    if coalesce(trim(mem->>'last'), '') = '' then raise exception 'Member last name is required'; end if;
  end loop;

  status_val := case when hh->>'status' = 'Verified' then 'Verified' else 'Pending' end;

  insert into households
    (household_name, street, barangay, city, province, zip, contact, email, gkk, family_grouping, status)
  values
    (trim(hh->>'name'), trim(hh->>'street'), trim(hh->>'barangay'), trim(hh->>'city'), trim(hh->>'province'), trim(hh->>'zip'),
     nullif(trim(hh->>'contact'), ''), nullif(trim(hh->>'email'), ''), nullif(trim(hh->>'gkk'), ''), nullif(trim(hh->>'grouping'), ''),
     status_val)
  returning id into new_household_id;

  for mem in select * from jsonb_array_elements(payload->'members') loop
    insert into members
      (household_id, first_name, middle_name, last_name, suffix, relationship, sex, dob, place_of_birth, tribe, civil_status,
       contact, email, occupation, blood_type, gkk_role,
       has_baptism, baptism_date, baptism_church,
       has_communion, communion_date, communion_church,
       has_confirmation, conf_date, conf_church, conf_name, conf_sponsor,
       has_matrimony, mat_date, mat_church, mat_type, ministries, organizations)
    values
      (new_household_id, trim(mem->>'first'), nullif(trim(mem->>'middle'), ''), trim(mem->>'last'), nullif(trim(mem->>'suffix'), ''),
       nullif(trim(mem->>'rel'), ''), nullif(trim(mem->>'sex'), ''), nullif(trim(mem->>'dob'), '')::date, nullif(trim(mem->>'pob'), ''),
       nullif(trim(mem->>'tribe'), ''),
       nullif(trim(mem->>'civil'), ''), nullif(trim(mem->>'contact'), ''), nullif(trim(mem->>'email'), ''), nullif(trim(mem->>'occupation'), ''),
       nullif(trim(mem->>'bloodType'), ''), nullif(trim(mem->>'gkkRole'), ''),
       coalesce((mem->>'hasBaptism')::boolean, false), nullif(trim(mem->>'baptismDate'), '')::date, nullif(trim(mem->>'baptismChurch'), ''),
       coalesce((mem->>'hasCommunion')::boolean, false), nullif(trim(mem->>'communionDate'), '')::date, nullif(trim(mem->>'communionChurch'), ''),
       coalesce((mem->>'hasConfirmation')::boolean, false), nullif(trim(mem->>'confDate'), '')::date, nullif(trim(mem->>'confChurch'), ''),
       nullif(trim(mem->>'confName'), ''), nullif(trim(mem->>'confSponsor'), ''),
       coalesce((mem->>'hasMatrimony')::boolean, false), nullif(trim(mem->>'matDate'), '')::date, nullif(trim(mem->>'matChurch'), ''),
       nullif(trim(mem->>'matType'), ''),
       coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(mem->'ministries', '[]'::jsonb)) x), '{}'),
       coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(mem->'organizations', '[]'::jsonb)) x), '{}'));
  end loop;

  return new_household_id;
end;
$$;

grant execute on function public.create_household(jsonb) to authenticated;
