-- Public stats, public organization list, household-name uniqueness, and the
-- ministry/organization rename fix. Run after 0002_head_first_registration.sql.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Rename fix. Supabase enables pg_safeupdate for API requests, which rejects
-- any UPDATE without a WHERE clause — including ones inside an RPC. 0001's
-- rename_ministry / rename_organization updated every member row
-- unconditionally, so renaming a ministry or organization always failed with
-- "UPDATE requires a WHERE clause". Only touch the rows that hold the name.
-- ---------------------------------------------------------------------------

create or replace function public.rename_ministry(old_name text, new_name text) returns void
language plpgsql as $$
begin
  if coalesce(trim(new_name), '') = '' then raise exception 'Name is required'; end if;
  update ministries set name = trim(new_name) where name = old_name;
  if not found then raise exception 'Item not found'; end if;
  update members set ministries = array_replace(ministries, old_name, trim(new_name))
  where old_name = any(ministries);
end;
$$;

create or replace function public.rename_organization(old_name text, new_name text) returns void
language plpgsql as $$
begin
  if coalesce(trim(new_name), '') = '' then raise exception 'Name is required'; end if;
  update organizations set name = trim(new_name) where name = old_name;
  if not found then raise exception 'Item not found'; end if;
  update members set organizations = array_replace(organizations, old_name, trim(new_name))
  where old_name = any(organizations);
end;
$$;

-- ---------------------------------------------------------------------------
-- Read-only helpers for the anonymous public site. anon still has no direct
-- table access; these return only aggregate counts, names, or a yes/no.
-- ---------------------------------------------------------------------------

create or replace function public.public_parish_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'gkks', (select count(*) from gkks),
    'households', (select count(*) from households)
  );
$$;

create or replace function public.list_public_organizations()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select name from organizations order by name;
$$;

create or replace function public.household_name_available(candidate text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from households
    where lower(trim(household_name)) = lower(trim(candidate))
  );
$$;

grant execute on function public.public_parish_stats() to anon, authenticated;
grant execute on function public.list_public_organizations() to anon, authenticated;
grant execute on function public.household_name_available(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Public registration — as in 0002, plus: household names must be unique
-- (case-insensitive), and members may list organizations, kept only if they
-- match the parish's organizations table. Ministries are still assigned by
-- staff only.
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
       has_matrimony, mat_date, mat_church, mat_type, ministries, organizations)
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
       '{}',
       array(
         select distinct x from jsonb_array_elements_text(
           case when jsonb_typeof(mem->'organizations') = 'array' then mem->'organizations' else '[]'::jsonb end
         ) x
         where x in (select name from organizations)
       ));
  end loop;

  return jsonb_build_object('refNo', new_ref_no, 'householdId', new_household_id);
end;
$$;

grant execute on function public.submit_registration(jsonb) to anon;
