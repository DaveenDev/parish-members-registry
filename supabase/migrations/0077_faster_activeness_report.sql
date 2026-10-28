-- Reports → Analysis Report for the whole parish no longer stops with
-- "canceling statement due to statement timeout". Run after
-- 0076_activity_more_records.sql. Safe to re-run. Same scores as before.
--
-- The report read members_with_household's eight practice_* columns, and
-- Postgres runs member_practice() once for each of them: eight runs per
-- member, each looking up the member's census answers. For every member of
-- the parish that took longer than Supabase allows a query. activeness_members()
-- reads the census answers once for all members and works out each member's
-- score once. The view is unchanged (it still skips the practice columns when
-- a page doesn't ask for them).
--
-- member_practice() is split in two so both use the same scoring:
-- member_practice_from() scores a member from answers already looked up, and
-- member_practice() looks them up for one member and calls it.

do $$
begin
  if to_regprocedure('public.member_practice(members, jsonb)') is null
     or to_regclass('public.census_member_responses') is null then
    raise exception 'Run the migrations up to 0055_registration_member_census.sql before this one';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- A member's Practicing Catholic score from their latest census answers with
-- participation (cur_part, from the census cur_label), the census before it
-- (prev_part, for the trend), else their own answers at registration, else
-- the household's survey. As 0055.
-- ---------------------------------------------------------------------------
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
  return result;
end;
$$;

create or replace function public.member_practice(m members, household_participation jsonb)
returns member_practice_t
language plpgsql stable set search_path = public as $$
declare
  cur_part jsonb;
  cur_label text;
  prev_part jsonb;
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
  return member_practice_from(m, household_participation, cur_part, cur_label, prev_part);
end;
$$;

-- ---------------------------------------------------------------------------
-- The Analysis Report's members: current members with their practice
-- details, as members_with_household gives them. p_gkk: 'All', 'None' (no
-- GKK) or a GKK's name. Runs as the signed-in account, so each one sees the
-- same members as on the members list (a GKK leader, their own GKK's).
-- ---------------------------------------------------------------------------
drop function if exists public.activeness_members(text);
create function public.activeness_members(p_gkk text default 'All')
returns table (
  id integer, first_name text, last_name text, suffix text,
  household_id integer, household_name text, household_gkk text,
  age integer, sex text, contact text, membership_status text,
  practice_level text, practice_score numeric, practice_participation numeric,
  practice_sacraments numeric, practice_involvement numeric,
  practice_source text, practice_source_label text, practice_trend numeric)
language sql stable set search_path = public as $$
  with answered as (
    -- Each member's census answers with participation, latest first.
    select r.member_id, r.participation, c.label,
           row_number() over (partition by r.member_id order by r.cycle_id desc) as n
    from census_member_responses r join census_cycles c on c.id = r.cycle_id
    where practice_participation_points(r.participation) is not null
  )
  select m.id, m.first_name, m.last_name, m.suffix,
         m.household_id, h.household_name, h.gkk,
         case when m.dob is null then null else date_part('year', age(m.dob::timestamptz))::int end,
         m.sex, m.contact, m.membership_status,
         p.level, p.score, p.participation, p.sacraments, p.involvement,
         p.source, p.source_label, p.trend
  from members m
  join households h on h.id = m.household_id
  left join answered cur on cur.member_id = m.id and cur.n = 1
  left join answered prev on prev.member_id = m.id and prev.n = 2
  cross join lateral member_practice_from(m, h.participation, cur.participation, cur.label, prev.participation) p
  where coalesce(m.membership_status <> all (array['Moved away', 'Deceased']), true)
    and (p_gkk = 'All' or (p_gkk = 'None' and h.gkk is null) or h.gkk = p_gkk);
$$;

revoke execute on function public.activeness_members(text) from public, anon;
grant execute on function public.activeness_members(text) to authenticated;
