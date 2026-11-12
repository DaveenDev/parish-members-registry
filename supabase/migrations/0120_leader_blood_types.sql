-- Census Coordinators (GKK leaders) see and update their GKK's blood types,
-- and the census portal asks a new member's blood type. Run after
-- 0118_hero_position.sql. Safe to re-run.
--
-- Before this, blood types were out of GKK leaders' reach (0050, 0062): the
-- member_blood_types rules let only Full access, Read only and Website &
-- requests read them and only Full access change them, Report Stats gave a
-- leader none, New Household dropped the one a leader typed, and the census
-- portal didn't ask them because leaders review its updates.
--
-- * member_blood_types: a GKK leader reads and writes the rows of the
--   members they may see (their GKK, and the households with no GKK yet,
--   0093), through the members table's own rules. Clergy still see none
--   (0087). Each change is logged with the leader's name as before (0062).
-- * create_household_base(): as in 0062, but keeps a leader's blood types.
-- * admin_report_stats(): as in 0070, but a leader gets their GKK's blood
--   types. Its 'parish:own_gkk_only' setting (0093) is put back after it.
-- * portal_new_member_details(): as in 0090, plus 'blood_type' when it's one
--   of blood_types() (anything else is dropped).
-- * census_approve_submission(): as in 0090, plus a new member's blood type.
--   Existing members' blood types aren't shown or changed online. (Updates
--   that add a member always wait for review, 0083, so this is the only
--   place one is saved.)

do $$
begin
  if to_regprocedure('public.public_parish_hero_position()') is null
     or to_regprocedure('public.portal_new_member_details(jsonb)') is null
     or to_regprocedure('public.blood_types()') is null
     or to_regclass('public.member_blood_types') is null then
    raise exception 'Run the migrations up to 0118_hero_position.sql before this one';
  end if;
end;
$$;

-- ---- who reads and writes blood types -------------------------------------------

-- Everyone with the Blood Types page; a GKK leader for the members they may
-- see (the members rules inside the subquery limit it to them).
drop policy if exists member_blood_types_select on member_blood_types;
create policy member_blood_types_select on member_blood_types
  for select to authenticated using (
    (select staff_access()) in ('full', 'read_only', 'website')
    or ((select staff_access()) = 'gkk_leader'
        and exists (select 1 from members m where m.id = member_blood_types.member_id)));

-- Full access, and a GKK leader for those same members. (The public forms
-- and the registration and census functions write as the owner.)
drop policy if exists member_blood_types_write on member_blood_types;
create policy member_blood_types_write on member_blood_types
  for all to authenticated
  using ((select staff_access()) = 'full'
         or ((select staff_access()) = 'gkk_leader'
             and exists (select 1 from members m where m.id = member_blood_types.member_id)))
  with check ((select staff_access()) = 'full'
              or ((select staff_access()) = 'gkk_leader'
                  and exists (select 1 from members m where m.id = member_blood_types.member_id)));

-- ---- staff New Household ----------------------------------------------------------

-- As in 0062, but a GKK leader's blood types are saved too.
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
    -- Blood types live in member_blood_types (0062); a GKK leader records
    -- them too now (0120).
    if nullif(trim(mem->>'bloodType'), '') is not null then
      insert into member_blood_types (member_id, blood_type) values (new_member_id, trim(mem->>'bloodType'));
    end if;
  end loop;

  return new_household_id;
end;
$function$;

-- ---- Reports → Report Stats -------------------------------------------------------

-- As in 0070, without the GKK leader exceptions for blood types.
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
         and not exists (select 1 from member_blood_types b where b.member_id = m.id and coalesce(b.blood_type, '') <> ''))
  );
$function$;

-- create or replace dropped 0093's setting: a leader's numbers stay their GKK's.
alter function public.admin_report_stats() set application_name = 'parish:own_gkk_only';

-- ---- census portal: a new member's blood type ---------------------------------

/**
 * What a new member brings in from the portal besides
 * portal_clean_member_fields(), keys as the members table's columns. A
 * sacrament's date and parish are kept only while it is ticked; the kind of
 * wedding only when it's one of the three; organizations and the parish role
 * only when they are on the parish's lists. As in 0090, plus the blood type
 * (0120), kept only when it's one of blood_types().
 */
create or replace function public.portal_new_member_details(p jsonb) returns jsonb
language sql stable set search_path = public as $$
  with s as (
    select coalesce(p->>'has_baptism', '') = 'true' as bap,
           coalesce(p->>'has_communion', '') = 'true' as com,
           coalesce(p->>'has_confirmation', '') = 'true' as conf,
           coalesce(p->>'has_matrimony', '') = 'true' as mat
  )
  select jsonb_build_object(
    'place_of_birth', portal_text(p->>'place_of_birth', 120),
    'tribe', portal_text(p->>'tribe', 80),
    'email', portal_text(p->>'email', 120),
    'occupation', portal_text(p->>'occupation', 100),
    'religion', coalesce(portal_text(p->>'religion', 60), 'Roman Catholic'),
    'has_baptism', s.bap,
    'baptism_date', case when s.bap then portal_date(p->>'baptism_date')::text end,
    'baptism_church', case when s.bap then portal_text(p->>'baptism_church', 150) end,
    'has_communion', s.com,
    'communion_date', case when s.com then portal_date(p->>'communion_date')::text end,
    'communion_church', case when s.com then portal_text(p->>'communion_church', 150) end,
    'has_confirmation', s.conf,
    'conf_date', case when s.conf then portal_date(p->>'conf_date')::text end,
    'conf_church', case when s.conf then portal_text(p->>'conf_church', 150) end,
    'conf_name', case when s.conf then portal_text(p->>'conf_name', 80) end,
    'conf_sponsor', case when s.conf then portal_text(p->>'conf_sponsor', 120) end,
    'has_matrimony', s.mat,
    'mat_date', case when s.mat then portal_date(p->>'mat_date')::text end,
    'mat_church', case when s.mat then portal_text(p->>'mat_church', 150) end,
    'mat_type', case when portal_text(p->>'mat_type') in ('Catholic Marriage', 'Civil Wedding', 'Other Sect Wedding') then portal_text(p->>'mat_type') end,
    'organizations', to_jsonb(array(
      select o.name from organizations o
      where jsonb_typeof(p->'organizations') = 'array'
        and o.name in (select jsonb_array_elements_text(p->'organizations'))
      order by o.name)),
    'gkk_role', portal_text(p->>'gkk_role', 80),
    'parish_role', (select pp.name from parish_positions pp where pp.name = portal_text(p->>'parish_role') limit 1),
    'blood_type', case when portal_text(p->>'blood_type') = any(blood_types()) then portal_text(p->>'blood_type') end)
  from s;
$$;

-- As in 0090, plus a new member's blood type goes to member_blood_types.
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
    insert into members
      (household_id, family_no, first_name, middle_name, last_name, suffix, relationship, sex, dob, civil_status, contact,
       place_of_birth, tribe, email, occupation, religion,
       has_baptism, baptism_date, baptism_church,
       has_communion, communion_date, communion_church,
       has_confirmation, conf_date, conf_church, conf_name, conf_sponsor,
       has_matrimony, mat_date, mat_church, mat_type,
       organizations, gkk_role, parish_role)
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
       (select pp.name from parish_positions pp where pp.name = pf->>'parish_role' limit 1))
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
