-- Reports → Analysis Report can show one census instead of everyone's latest
-- answers. Run after 0077_faster_activeness_report.sql. Safe to re-run.
--
-- activeness_members() gains p_cycle. Left out (or null) it is unchanged:
-- current members, each scored from their latest census answers, else their
-- own answers at registration, else the household survey.
--
-- With a census id, the report is that census as it stood:
--   • the members are those who took part in it (any status but Moved away
--     or Deceased), plus the current members with no answer in it who were
--     in the registry by the time it closed;
--   • each is scored only on their answers in that census: no answers there
--     means "Wala pa matino" (no older answers or household survey);
--   • the trend compares it with the census before it;
--   • membership_status is their status in that census ('Not confirmed'
--     when they have no answer in it).
-- Sacraments, ministries and roles are only kept as they are now, so those
-- parts of the score are today's.

do $$
begin
  if to_regprocedure('public.member_practice_from(members, jsonb, jsonb, text, jsonb)') is null then
    raise exception 'Run 0077_faster_activeness_report.sql before this one';
  end if;
end;
$$;

-- One function, so PostgREST never has two to choose between for { p_gkk }.
drop function if exists public.activeness_members(text);
drop function if exists public.activeness_members(text, integer);
create function public.activeness_members(p_gkk text default 'All', p_cycle integer default null)
returns table (
  id integer, first_name text, last_name text, suffix text,
  household_id integer, household_name text, household_gkk text,
  age integer, sex text, contact text, membership_status text,
  practice_level text, practice_score numeric, practice_participation numeric,
  practice_sacraments numeric, practice_involvement numeric,
  practice_source text, practice_source_label text, practice_trend numeric)
language sql stable set search_path = public as $$
  with answered as (
    -- Each member's census answers with participation, latest first; with a
    -- census picked, only that one and those before it.
    select r.member_id, r.cycle_id, r.participation, c.label,
           row_number() over (partition by r.member_id order by r.cycle_id desc) as n
    from census_member_responses r join census_cycles c on c.id = r.cycle_id
    where practice_participation_points(r.participation) is not null
      and (p_cycle is null or r.cycle_id <= p_cycle)
  ),
  picked as (
    -- The picked census's statuses (none without one).
    select r.member_id, r.status from census_member_responses r where r.cycle_id = p_cycle
  ),
  scored as (
    select m, h, pk.status as census_status,
           case when m.dob is null then null else date_part('year', age(m.dob::timestamptz))::int end as age,
           -- Scored on the picked census alone: the latest answers count only if they are its own.
           (p_cycle is not null and (cur.cycle_id is distinct from p_cycle)) as unanswered,
           p
    from members m
    join households h on h.id = m.household_id
    left join picked pk on pk.member_id = m.id
    left join answered cur on cur.member_id = m.id and cur.n = 1
    left join answered prev on prev.member_id = m.id and prev.n = 2
    cross join lateral member_practice_from(
      m, h.participation,
      case when p_cycle is null or cur.cycle_id = p_cycle then cur.participation end,
      cur.label, prev.participation) p
    where member_is_current(coalesce(pk.status, m.membership_status))
      and (p_gkk = 'All' or (p_gkk = 'None' and h.gkk is null) or h.gkk = p_gkk)
      -- With a census picked, members with no answer in it only if they were registered by its close.
      and (p_cycle is null or pk.member_id is not null
           or m.created_at <= coalesce((select c.closed_at from census_cycles c where c.id = p_cycle), now()))
  )
  select (s.m).id, (s.m).first_name, (s.m).last_name, (s.m).suffix,
         (s.m).household_id, (s.h).household_name, (s.h).gkk,
         s.age, (s.m).sex, (s.m).contact,
         case when p_cycle is null then (s.m).membership_status else coalesce(s.census_status, 'Not confirmed') end,
         case when p_cycle is null then (s.p).level
              else practice_level(case when s.unanswered then null else (s.p).score end,
                                  case when s.unanswered then null else (s.p).participation end,
                                  s.age, (s.m).religion, true) end,
         case when s.unanswered then null else (s.p).score end,
         case when s.unanswered then null else (s.p).participation end,
         (s.p).sacraments, (s.p).involvement,
         case when s.unanswered then null else (s.p).source end,
         case when s.unanswered then null else (s.p).source_label end,
         case when s.unanswered then null else (s.p).trend end
  from scored s;
$$;

revoke execute on function public.activeness_members(text, integer) from public, anon;
grant execute on function public.activeness_members(text, integer) to authenticated;
