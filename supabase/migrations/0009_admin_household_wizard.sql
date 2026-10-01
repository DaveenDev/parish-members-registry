-- Admin "New Household" now follows the public registration wizard: the
-- Household Head first, the parish-participation survey, volunteer / email
-- list / data-privacy consent, and each member's religion. create_household
-- stores those too, and checks the same things submit_registration does
-- (exactly one head, a unique household name, a GKK from the list).
-- Consent is recorded as given; staff may save without it.
-- Run after 0006_parish_positions.sql. Safe to re-run.

do $$
begin
  if to_regclass('public.parish_positions') is null then
    raise exception 'Run 0006_parish_positions.sql before this migration';
  end if;
end;
$$;

create or replace function public.create_household(payload jsonb)
returns integer
language plpgsql as $$
declare
  hh jsonb := payload->'household';
  mem jsonb;
  head_count integer;
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

  select count(*) into head_count
  from jsonb_array_elements(payload->'members') m
  where trim(m->>'rel') = 'Head of Household';
  if head_count <> 1 then raise exception 'Exactly one Household Head is required'; end if;

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
      (household_id, first_name, middle_name, last_name, suffix, relationship, sex, dob, place_of_birth, tribe, civil_status,
       contact, email, occupation, religion, blood_type, gkk_role, parish_role,
       has_baptism, baptism_date, baptism_church,
       has_communion, communion_date, communion_church,
       has_confirmation, conf_date, conf_church, conf_name, conf_sponsor,
       has_matrimony, mat_date, mat_church, mat_type, ministries, organizations)
    values
      (new_household_id, trim(mem->>'first'), nullif(trim(mem->>'middle'), ''), trim(mem->>'last'), nullif(trim(mem->>'suffix'), ''),
       nullif(trim(mem->>'rel'), ''), nullif(trim(mem->>'sex'), ''), nullif(trim(mem->>'dob'), '')::date, nullif(trim(mem->>'pob'), ''),
       nullif(trim(mem->>'tribe'), ''),
       nullif(trim(mem->>'civil'), ''), nullif(trim(mem->>'contact'), ''), nullif(trim(mem->>'email'), ''), nullif(trim(mem->>'occupation'), ''),
       coalesce(nullif(trim(mem->>'religion'), ''), 'Roman Catholic'),
       nullif(trim(mem->>'bloodType'), ''), nullif(trim(mem->>'gkkRole'), ''),
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
       ));
  end loop;

  return new_household_id;
end;
$$;

grant execute on function public.create_household(jsonb) to authenticated;
