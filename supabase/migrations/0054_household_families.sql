-- Families within a household. Run after 0053_last_year_list_other_gkk.sql.
-- Safe to re-run.
--
-- A house (household) can hold more than one family: a married son with his
-- wife and children, or two families sharing one roof. The household stays
-- the house (address, GKK, ref no, status, one Household Head); members now
-- carry a family number:
--
-- - family 1 is the Household Head's family;
-- - family 2, 3… each have one "Head of Family";
-- - a member's relationship (Spouse, Son…) is to the head of their own family.
--
-- Everyone already registered is in family 1. Families are shown by their
-- head's name; the number is only for grouping, so gaps don't matter.
--
-- Also here:
-- - registration (submit_registration_base) and the admin wizard
--   (create_household) take each member's familyNo;
-- - submit_family_registration(): a family living in a house that is already
--   registered registers itself into that house with the house's reference
--   number and census access code. The house goes back to Pending so the
--   parish office reviews the new family;
-- - the census portal keeps each member's family, lets a new member join one
--   of the house's families, and never makes or unmakes a family head;
-- - households_with_count.family_count, members_with_household.family_no;
-- - family_stats() for the Dashboard and Reports.
--
-- Last year's list still matches by the Household Head only: the paper census
-- counts one head per house.

do $$
begin
  if to_regprocedure('public.submit_registration_base(jsonb)') is null
     or to_regclass('public.household_access_codes') is null
     or to_regprocedure('public.household_by_ref(text)') is null then
    raise exception 'Run 00401_registration_access_code.sql and 0047_household_ref_format.sql before this migration';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- members.family_no
-- ---------------------------------------------------------------------------

alter table members add column if not exists family_no smallint not null default 1;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'members_family_no_range') then
    alter table members add constraint members_family_no_range check (family_no between 1 and 10);
  end if;
  -- The Household Head heads family 1; a Head of Family heads one of the others.
  if not exists (select 1 from pg_constraint where conname = 'members_family_head_rule') then
    alter table members add constraint members_family_head_rule check (
      (relationship is distinct from 'Head of Household' or family_no = 1)
      and (relationship is distinct from 'Head of Family' or family_no > 1));
  end if;
end;
$$;

create index if not exists idx_members_household_family on members(household_id, family_no);

-- A payload member's family number ("familyNo"), 1 when missing or not a number.
create or replace function public.payload_family_no(m jsonb) returns smallint
language sql immutable as $$
  select case when trim(coalesce(m->>'familyNo', '')) ~ '^\d{1,2}$' then trim(m->>'familyNo')::smallint else 1::smallint end;
$$;

-- Each family in a new household's member list has its one head: family 1
-- exactly one Household Head, every other family exactly one Head of Family.
-- `rel_key` is the payload's name for the relationship ('relationship' in the
-- public wizard, 'rel' in the admin one).
create or replace function public.check_payload_families(p_members jsonb, rel_key text) returns void
language plpgsql immutable as $$
declare
  f record;
begin
  if not exists (select 1 from jsonb_array_elements(p_members) m where payload_family_no(m) = 1) then
    raise exception 'Exactly one Household Head is required';
  end if;
  for f in
    select payload_family_no(m) as fam,
           count(*) filter (where trim(m->>rel_key) = 'Head of Household') as hh,
           count(*) filter (where trim(m->>rel_key) = 'Head of Family') as hf
    from jsonb_array_elements(p_members) m
    group by 1
  loop
    if f.fam < 1 or f.fam > 10 then raise exception 'A household can have at most 10 families'; end if;
    if f.fam = 1 and (f.hh <> 1 or f.hf <> 0) then raise exception 'Exactly one Household Head is required'; end if;
    if f.fam > 1 and f.hh <> 0 then raise exception 'The Household Head belongs to the first family'; end if;
    if f.fam > 1 and f.hf <> 1 then raise exception 'Each other family in the house needs exactly one Head of Family'; end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public registration — as in 0006, plus each member's family.
-- ---------------------------------------------------------------------------

create or replace function public.submit_registration_base(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
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
       contact, email, occupation, religion, blood_type, gkk_role, parish_role,
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
       coalesce(nullif(trim(mem->>'religion'), ''), 'Roman Catholic'), nullif(trim(mem->>'bloodType'), ''),
       nullif(trim(mem->>'gkkRole'), ''),
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
       ));
  end loop;

  return jsonb_build_object('refNo', new_ref_no, 'householdId', new_household_id);
end;
$$;

revoke execute on function public.submit_registration_base(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin New Household — as in 0009, plus each member's family.
-- ---------------------------------------------------------------------------

create or replace function public.create_household(payload jsonb)
returns integer
language plpgsql as $$
declare
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
       contact, email, occupation, religion, blood_type, gkk_role, parish_role,
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

-- ---------------------------------------------------------------------------
-- Another family joins a registered house
-- ---------------------------------------------------------------------------

-- The house's reference number and census access code, checked as the census
-- portal does (portal_check, 0047): 5 wrong tries lock the house for 15
-- minutes. Unlike the portal, no census needs to be open.
create or replace function public.household_code_check(p_ref text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  hid integer;
  ac household_access_codes;
begin
  hid := household_by_ref(p_ref);
  if hid is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into ac from household_access_codes where household_id = hid for update;
  if ac.household_id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if ac.locked_until is not null and ac.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;

  if ac.code <> census_normalize_code(p_code) then
    update household_access_codes set
      failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
      locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
    where household_id = hid;
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  update household_access_codes set failed_attempts = 0, locked_until = null
  where household_id = hid and (failed_attempts <> 0 or locked_until is not null);
  return jsonb_build_object('ok', true, 'householdId', hid);
end;
$$;
revoke execute on function public.household_code_check(text, text) from public, anon, authenticated;

-- { ok, householdName, refNo, gkk, families } for the wizard to show which
-- house the family is joining, or { ok: false, error: 'invalid' | 'locked' }.
create or replace function public.family_join_check(p_ref text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  chk jsonb := household_code_check(p_ref, p_code);
  h households;
begin
  if not (chk->>'ok')::boolean then return chk; end if;
  select * into h from households where id = (chk->>'householdId')::integer;
  return jsonb_build_object(
    'ok', true, 'householdName', h.household_name, 'refNo', h.ref_no, 'gkk', h.gkk,
    'families', (select count(distinct family_no) from members where household_id = h.id));
end;
$$;
grant execute on function public.family_join_check(text, text) to anon, authenticated;

-- Register a family into a registered house. payload: { members: [...] as
-- in submit_registration, one of them the 'Head of Family' ], consent }.
-- The family gets the next family number, and the house goes back to Pending
-- for the parish office to review. Returns { ok, refNo, householdName,
-- familyNo } or { ok: false, error } for a wrong reference / code.
create or replace function public.submit_family_registration(p_ref text, p_code text, payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
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
       contact, email, occupation, religion, blood_type, gkk_role, parish_role,
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
       coalesce(nullif(trim(mem->>'religion'), ''), 'Roman Catholic'), nullif(trim(mem->>'bloodType'), ''),
       nullif(trim(mem->>'gkkRole'), ''),
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
       ));
  end loop;

  update households set status = 'Pending' where id = hid and status <> 'Pending';

  return jsonb_build_object('ok', true, 'refNo', h.ref_no, 'householdName', h.household_name, 'familyNo', fam);
end;
$$;
grant execute on function public.submit_family_registration(text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Census portal — as in 0008, keeping each member's family
-- ---------------------------------------------------------------------------

create or replace function public.portal_member_fields(m members) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'first_name', m.first_name, 'middle_name', m.middle_name, 'last_name', m.last_name, 'suffix', m.suffix,
    'relationship', m.relationship, 'sex', m.sex, 'dob', m.dob::text, 'civil_status', m.civil_status,
    'contact', m.contact, 'family_no', m.family_no);
$$;

-- As in 0008, plus: the family heads stay as they are (nobody becomes or
-- stops being a Household Head or Head of Family online), and an existing
-- member keeps their family. A new member's family_no is checked against the
-- house by portal_submit().
create or replace function public.portal_clean_member_fields(p jsonb, fallback jsonb) returns jsonb
language plpgsql stable as $$
declare
  rel text := portal_text(p->>'relationship');
  sex_val text := portal_text(p->>'sex');
  civil text := portal_text(p->>'civil_status');
  dob_val date := portal_date(p->>'dob');
  heads text[] := array['Head of Household', 'Head of Family'];
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
                          case when trim(coalesce(p->>'family_no', '')) ~ '^\d{1,2}$' then trim(p->>'family_no')::integer end, 1)
  );
end;
$$;

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
      fields := portal_clean_member_fields(e, null);
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

  delete from census_submissions where cycle_id = cyc_id and household_id = hid and status = 'Pending';
  insert into census_submissions (cycle_id, household_id, before, proposed, message)
  values (cyc_id, hid, before_json,
          jsonb_build_object('household', hh_out, 'members', members_out, 'newMembers', new_out),
          portal_text(p_payload->>'message', 1000))
  returning submitted_at into saved_at;

  return jsonb_build_object('ok', true, 'submittedAt', saved_at);
end;
$$;

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
      contact      = case when pf->>'contact'      is distinct from bm->>'contact'      then pf->>'contact' else m.contact end
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
    insert into members (household_id, family_no, first_name, middle_name, last_name, suffix, relationship, sex, dob, civil_status, contact)
    values (s.household_id, fam, pf->>'first_name', pf->>'middle_name', pf->>'last_name', pf->>'suffix', pf->>'relationship',
            pf->>'sex', (pf->>'dob')::date, pf->>'civil_status', pf->>'contact')
    returning id into mid;
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

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- As in 0010, plus family_count (families with a current member; at least 1).
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
                where m.household_id = h.id and member_is_current(m.membership_status))) as family_count
from households h;

grant select on households_with_count to authenticated;

-- As in 0039, plus family_no at the end.
create or replace view members_with_household with (security_invoker = true) as
select m.id, m.household_id, m.first_name, m.middle_name, m.last_name, m.relationship, m.sex, m.dob,
  m.place_of_birth, m.civil_status, m.contact, m.email, m.occupation, m.religion, m.blood_type,
  m.has_baptism, m.baptism_date, m.baptism_church, m.has_communion, m.communion_date, m.communion_church,
  m.has_confirmation, m.conf_date, m.conf_church, m.conf_name, m.conf_sponsor,
  m.has_matrimony, m.mat_date, m.mat_church, m.mat_type, m.ministries, m.organizations, m.created_at,
  m.suffix, m.tribe, m.gkk_role, m.parish_role, m.membership_status, m.status_updated_at, m.updated_at,
  h.household_name, h.status as household_status, h.gkk as household_gkk,
  h.street, h.barangay, h.city, h.province, h.zip,
  case when m.dob is null then null::integer else date_part('year', age(m.dob::timestamptz))::integer end as age,
  (m.first_name || ' ') || m.last_name as full_name,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'baptism') as baptism_verified,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'communion') as communion_verified,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'confirmation') as confirmation_verified,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'matrimony') as matrimony_verified,
  coalesce(m.membership_status <> all (array['Moved away', 'Deceased']), true) as is_current,
  (select r.cycle_id from census_member_responses r join census_cycles c on c.id = r.cycle_id
    where r.member_id = m.id order by r.cycle_id desc limit 1) as last_census_cycle_id,
  (select c.label from census_member_responses r join census_cycles c on c.id = r.cycle_id
    where r.member_id = m.id order by r.cycle_id desc limit 1) as last_census_label,
  (select r.confirmed_at from census_member_responses r join census_cycles c on c.id = r.cycle_id
    where r.member_id = m.id order by r.cycle_id desc limit 1) as last_confirmed_at,
  exists (select 1 from census_member_responses r where r.member_id = m.id and r.cycle_id = census_reference_cycle_id()) as census_confirmed,
  (member_practice(m, h.participation)).score as practice_score,
  (member_practice(m, h.participation)).level as practice_level,
  (member_practice(m, h.participation)).participation as practice_participation,
  (member_practice(m, h.participation)).sacraments as practice_sacraments,
  (member_practice(m, h.participation)).involvement as practice_involvement,
  (member_practice(m, h.participation)).source as practice_source,
  (member_practice(m, h.participation)).source_label as practice_source_label,
  (member_practice(m, h.participation)).trend as practice_trend,
  m.family_no
from members m
join households h on h.id = m.household_id;

grant select on members_with_household to authenticated;

-- ---------------------------------------------------------------------------
-- Family figures for the Dashboard and Reports
-- ---------------------------------------------------------------------------

-- A family counts while it has a current member (not moved away or
-- deceased). Runs as the signed-in account, so a GKK leader gets their own
-- GKK's figures (row level security), like admin_report_stats().
-- { families, multi_family_households, by_gkk: [{ label, households, families, multi }] }
create or replace function public.family_stats() returns jsonb
language sql stable set search_path = public as $$
  with fam as (
    select distinct m.household_id, m.family_no
    from members m
    where member_is_current(m.membership_status)
  ),
  per_house as (
    select h.id, h.gkk, count(f.family_no) as families
    from households h
    left join fam f on f.household_id = h.id
    group by h.id, h.gkk
  )
  select jsonb_build_object(
    'families', (select coalesce(sum(greatest(families, 1)), 0) from per_house),
    'multi_family_households', (select count(*) from per_house where families > 1),
    'by_gkk', (
      select coalesce(jsonb_agg(jsonb_build_object('label', t.gkk, 'households', t.households, 'families', t.families, 'multi', t.multi)
                                order by t.gkk), '[]'::jsonb)
      from (
        select gkk, count(*) as households, sum(greatest(families, 1)) as families, count(*) filter (where families > 1) as multi
        from per_house where gkk is not null group by gkk
      ) t
    )
  );
$$;

revoke execute on function public.family_stats() from public, anon;
grant execute on function public.family_stats() to authenticated;
