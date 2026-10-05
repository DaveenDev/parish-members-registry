-- Registration asks every member the census questions, like the census
-- portal: their status now (Active, Inactive or Left the Church; young
-- children are Active) and Aktibo / Panagsa / Wala for each kind of
-- participation. Run after 0054_household_families.sql. Safe to re-run.
--
-- - Each member keeps their own answers (members.registration_participation)
--   and their status (members.membership_status). Their Practicing Catholic
--   score uses those answers until their first census, in place of the
--   household's survey (source 'registration').
-- - While a census is open, the answers are also that member's answers in
--   it (source 'Registration'), so a family that registers during the census
--   counts as confirmed and needs no second visit.
-- - The household's "how can you help" question stays with the household.
--
-- The three ways in are wrapped, as 0040 did: submit_registration() (the
-- website), create_household() (admin New Household) and
-- submit_family_registration() (a family joining a registered house). Each
-- runs as before, then applies the answers to the members it just added, in
-- the order they were sent. Members carry them as `censusStatus` and
-- `participation`. A later migration that rewrites one of these should change
-- its *_base() function, not the wrapper.

do $$
begin
  if to_regprocedure('public.submit_family_registration(text, text, jsonb)') is null
     or to_regprocedure('public.census_apply_responses(integer, integer, jsonb, text, uuid, text)') is null
     or to_regprocedure('public.member_practice(members, jsonb)') is null then
    raise exception 'Run 0008_census_portal.sql, 0039_faster_access_checks.sql and 0054_household_families.sql before this migration';
  end if;
  if to_regprocedure('public.create_household_base(jsonb)') is null then
    alter function public.create_household(jsonb) rename to create_household_base;
  end if;
  if to_regprocedure('public.submit_family_registration_base(text, text, jsonb)') is null then
    alter function public.submit_family_registration(text, text, jsonb) rename to submit_family_registration_base;
  end if;
end;
$$;

revoke execute on function public.create_household_base(jsonb) from public, anon, authenticated;
revoke execute on function public.submit_family_registration_base(text, text, jsonb) from public, anon, authenticated;

alter table members add column if not exists registration_participation jsonb not null default '{}'::jsonb;

-- Census answers can come from the registration too. Keep in sync with the
-- labels in client/src/lib/census.js (CENSUS_SOURCE_LABELS).
alter table census_member_responses drop constraint if exists census_member_responses_source_check;
alter table census_member_responses add constraint census_member_responses_source_check
  check (source in ('Paper', 'Staff visit', 'Portal', 'Registration'));

/**
 * The census answers sent with newly added members (those of household
 * `p_household_id` with an id above `p_after_id`, in id order, which is the
 * order they were sent in `p_members`). Saves each member's answers and
 * status, and records them in the open census, if any.
 */
create or replace function public.registration_apply_member_answers(
  p_household_id integer, p_after_id integer, p_members jsonb, p_staff uuid, p_staff_name text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  ids integer[];
  i integer;
  mem jsonb;
  part jsonb;
  status_val text;
  responses jsonb := '[]'::jsonb;
  cyc_id integer;
begin
  if jsonb_typeof(p_members) <> 'array' then return; end if;
  select array_agg(id order by id) into ids from members where household_id = p_household_id and id > coalesce(p_after_id, 0);
  if ids is null then return; end if;

  for i in 1 .. least(array_length(ids, 1), jsonb_array_length(p_members)) loop
    mem := p_members -> (i - 1);
    part := census_clean_participation(mem->'participation');
    -- Moved away and Deceased make no sense for someone registering now.
    status_val := nullif(trim(mem->>'censusStatus'), '');
    if status_val is not null and status_val not in ('Active', 'Inactive', 'Left the Church') then status_val := null; end if;
    -- An older form sends answers without a status: suggest one, as the census does.
    if status_val is null then status_val := census_suggest_status(part); end if;
    -- Someone who left the Church has no participation to answer.
    if status_val is null or status_val = 'Left the Church' then part := '{}'::jsonb; end if;

    update members set
      registration_participation = part,
      membership_status = coalesce(status_val, membership_status),
      status_updated_at = case when status_val is not null then now() else status_updated_at end
    where id = ids[i];

    if status_val is not null then
      responses := responses || jsonb_build_array(jsonb_build_object('memberId', ids[i], 'status', status_val, 'participation', part));
    end if;
  end loop;

  select id into cyc_id from census_cycles where status = 'Open';
  if cyc_id is not null and jsonb_array_length(responses) > 0 then
    perform census_apply_responses(cyc_id, p_household_id, responses, 'Registration', p_staff, p_staff_name);
  end if;
end;
$$;

revoke all on function public.registration_apply_member_answers(integer, integer, jsonb, uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The website: as in 0040 (the access code), then the members' answers.
-- ---------------------------------------------------------------------------
create or replace function public.submit_registration(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  res jsonb := submit_registration_base(payload);
  hid integer := (res->>'householdId')::integer;
  new_code text;
  attempt integer := 0;
begin
  perform registration_apply_member_answers(hid, 0, payload->'members', null, 'Online registration');

  begin
    loop
      attempt := attempt + 1;
      begin
        insert into household_access_codes (household_id, code, issued_by) values (hid, census_new_access_code(), auth.uid())
        on conflict (household_id) do nothing
        returning code into new_code;
        exit;
      exception when unique_violation then
        if attempt >= 20 then raise exception 'Could not generate a unique access code'; end if;
      end;
    end loop;
    if new_code is null then
      select a.code into new_code from household_access_codes a where a.household_id = hid;
    end if;
  exception when others then
    new_code := null;
  end;
  return res || jsonb_build_object('accessCode', new_code);
end;
$$;

grant execute on function public.submit_registration(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin New Household: as in 0054, then the members' answers.
-- ---------------------------------------------------------------------------
create or replace function public.create_household(payload jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  hid integer := create_household_base(payload);
begin
  perform registration_apply_member_answers(hid, 0, payload->'members', auth.uid(), census_staff_name());
  return hid;
end;
$$;

revoke execute on function public.create_household(jsonb) from public, anon;
grant execute on function public.create_household(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- A family joining a registered house: as in 0054, then the new members'
-- answers (only the members added now; the house's others keep theirs).
-- ---------------------------------------------------------------------------
create or replace function public.submit_family_registration(p_ref text, p_code text, payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  -- Members added from here on are this family's (the code check stays in the base).
  last_id integer := (select coalesce(max(id), 0) from members);
  res jsonb := submit_family_registration_base(p_ref, p_code, payload);
  hid integer;
begin
  if coalesce((res->>'ok')::boolean, false) then
    select h.id into hid from households h where h.ref_no = res->>'refNo';
    if hid is not null then
      perform registration_apply_member_answers(hid, last_id, payload->'members', null, 'Online registration');
    end if;
  end if;
  return res;
end;
$$;

grant execute on function public.submit_family_registration(text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- The Practicing Catholic score: as in 0039, with the member's own answers
-- at registration before the household's survey (source 'registration').
-- ---------------------------------------------------------------------------
create or replace function public.member_practice(m members, household_participation jsonb)
returns member_practice_t
language plpgsql stable set search_path = public as $$
declare
  cur_part jsonb;
  cur_label text;
  prev_part jsonb;
  own_part jsonb := case when practice_participation_points(m.registration_participation) is not null then m.registration_participation end;
  v_age int := case when m.dob is null then null else date_part('year', age(m.dob::timestamptz))::int end;
  v_part numeric;
  v_sac numeric;
  v_inv numeric;
  v_score numeric;
  result member_practice_t;
begin
  select r.participation, c.label into cur_part, cur_label
  from census_member_responses r join census_cycles c on c.id = r.cycle_id
  where r.member_id = m.id and practice_participation_points(r.participation) is not null
  order by r.cycle_id desc limit 1;
  -- The census before it, for the trend (only needed when there is a latest one).
  if cur_part is not null then
    select r.participation into prev_part
    from census_member_responses r
    where r.member_id = m.id and practice_participation_points(r.participation) is not null
    order by r.cycle_id desc offset 1 limit 1;
  end if;

  v_part := practice_participation_points(coalesce(cur_part, own_part, household_participation));
  v_sac := practice_sacrament_points(v_age, m.has_baptism, m.has_communion, m.has_confirmation);
  v_inv := practice_involvement_points(m.ministries, m.organizations, m.gkk_role, m.parish_role);
  v_score := case when v_part is null then null else v_part + v_sac + v_inv end;

  result := (
    v_score,
    practice_level(v_score, v_part, v_age, m.religion, member_is_current(m.membership_status)),
    v_part, v_sac, v_inv,
    case when cur_part is not null then 'census' when own_part is not null then 'registration' when v_part is not null then 'household' end,
    cur_label,
    case when cur_part is not null and prev_part is not null
         then round(v_part - practice_participation_points(prev_part), 1) end);
  return result;
end;
$$;
