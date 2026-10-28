-- Practicing Catholic status: a 0–100 score per member, worked out from
--   • participation (60): the member's own answers in their latest census,
--     or — before their first census — the household's registration survey.
--     Mass weighs most; Aktibo counts in full, Panagsa half, Wala nothing.
--   • sacraments (25): the ones expected for their age — Baptism always,
--     First Communion from 9, Confirmation from 14.
--   • involvement (15): a ministry, an organization, or a GKK / parish role.
-- Levels: Aktibo 70+, Panagsa 40–69, Dili aktibo below 40, Wala pa matino
-- with no participation answers. Children under 7 and members of another
-- religion aren't rated; moved-away and deceased members aren't either.
-- It's computed in the members view, so every census re-evaluates it.
-- client/src/lib/practice.js mirrors these rules — keep the two in sync.
-- Run after 0010_admin_tools.sql. Safe to re-run.

do $$
begin
  if to_regprocedure('public.census_reference_cycle_id()') is null then
    raise exception 'Run 0010_admin_tools.sql before this migration';
  end if;
end;
$$;

-- Participation points out of 60 over the items answered; null with no answers.
create or replace function public.practice_participation_points(p jsonb) returns numeric
language sql immutable as $$
  with w(k, wt) as (values ('mass', 24), ('bible_service', 8), ('devotions', 7), ('meetings', 7), ('pintakasi', 7), ('financial', 7)),
  a as (select k, v from jsonb_each_text(census_clean_participation(p)) as t(k, v))
  select case when count(*) = 0 then null else
    round(60 * sum(w.wt * case a.v when 'Aktibo' then 1 when 'Panagsa' then 0.5 else 0 end) / sum(w.wt), 1)
  end
  from a join w on w.k = a.k;
$$;

-- Sacrament points out of 25: the share of the sacraments expected at this age.
create or replace function public.practice_sacrament_points(p_age integer, p_baptism boolean, p_communion boolean, p_confirmation boolean)
returns numeric
language sql immutable as $$
  select round(25 * (
      (case when p_baptism then 1 else 0 end)
    + (case when coalesce(p_age, 0) >= 9 and p_communion then 1 else 0 end)
    + (case when coalesce(p_age, 0) >= 14 and p_confirmation then 1 else 0 end)
  )::numeric / (1 + (case when coalesce(p_age, 0) >= 9 then 1 else 0 end) + (case when coalesce(p_age, 0) >= 14 then 1 else 0 end)), 1);
$$;

-- Involvement points out of 15: any ministry, organization or role.
create or replace function public.practice_involvement_points(p_ministries text[], p_organizations text[], p_gkk_role text, p_parish_role text)
returns numeric
language sql immutable as $$
  select case when coalesce(cardinality(p_ministries), 0) > 0 or coalesce(cardinality(p_organizations), 0) > 0
                or coalesce(trim(p_gkk_role), '') <> '' or coalesce(trim(p_parish_role), '') <> ''
              then 15 else 0 end::numeric;
$$;

-- The level for a member; null for members no longer on the roster.
create or replace function public.practice_level(p_score numeric, p_participation numeric, p_age integer, p_religion text, p_is_current boolean)
returns text
language sql immutable as $$
  select case
    when not coalesce(p_is_current, true) then null
    when coalesce(nullif(trim(p_religion), ''), 'Roman Catholic') <> 'Roman Catholic' then 'Dili Katoliko'
    when p_age is not null and p_age < 7 then 'Bata pa'
    when p_participation is null then 'Wala pa matino'
    when p_score >= 70 then 'Aktibo'
    when p_score >= 40 then 'Panagsa'
    else 'Dili aktibo'
  end;
$$;

grant execute on function public.practice_participation_points(jsonb) to authenticated;
grant execute on function public.practice_sacrament_points(integer, boolean, boolean, boolean) to authenticated;
grant execute on function public.practice_involvement_points(text[], text[], text, text) to authenticated;
grant execute on function public.practice_level(numeric, numeric, integer, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- members_with_household: as in 0010, plus the practice_* columns.
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
  (m.first_name || ' ' || m.last_name) as full_name,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'baptism') as baptism_verified,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'communion') as communion_verified,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'confirmation') as confirmation_verified,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'matrimony') as matrimony_verified,
  -- Still part of the household roster (not moved away or deceased).
  coalesce(m.membership_status not in ('Moved away', 'Deceased'), true) as is_current,
  last_r.cycle_id as last_census_cycle_id,
  last_r.label as last_census_label,
  last_r.confirmed_at as last_confirmed_at,
  exists (
    select 1 from census_member_responses r
    where r.member_id = m.id and r.cycle_id = census_reference_cycle_id()
  ) as census_confirmed,
  -- Practicing Catholic status (see the top of this file).
  pr.score as practice_score,
  practice_level(pr.score, pr.participation, pr.age, m.religion, coalesce(m.membership_status not in ('Moved away', 'Deceased'), true)) as practice_level,
  pr.participation as practice_participation,
  pr.sacraments as practice_sacraments,
  pr.involvement as practice_involvement,
  case when cur_p.participation is not null then 'census' when pr.participation is not null then 'household' end as practice_source,
  cur_p.label as practice_source_label,
  -- Change since the census before (same sacraments and involvement, that census's answers).
  case when cur_p.participation is not null and prev_p.participation is not null
       then round(pr.participation - practice_participation_points(prev_p.participation), 1) end as practice_trend
from members m
join households h on h.id = m.household_id
left join lateral (
  select r.cycle_id, c.label, r.confirmed_at
  from census_member_responses r join census_cycles c on c.id = r.cycle_id
  where r.member_id = m.id
  order by r.cycle_id desc
  limit 1
) last_r on true
-- The member's latest and previous census answers that have any participation.
left join lateral (
  select r.participation, c.label
  from census_member_responses r join census_cycles c on c.id = r.cycle_id
  where r.member_id = m.id and practice_participation_points(r.participation) is not null
  order by r.cycle_id desc
  limit 1
) cur_p on true
left join lateral (
  select r.participation
  from census_member_responses r
  where r.member_id = m.id and practice_participation_points(r.participation) is not null
  order by r.cycle_id desc
  offset 1 limit 1
) prev_p on true
cross join lateral (
  select
    x.age,
    x.participation,
    x.sacraments,
    x.involvement,
    case when x.participation is null then null else x.participation + x.sacraments + x.involvement end as score
  from (
    select
      case when m.dob is null then null else date_part('year', age(m.dob))::int end as age,
      practice_participation_points(coalesce(cur_p.participation, h.participation)) as participation,
      practice_sacrament_points(case when m.dob is null then null else date_part('year', age(m.dob))::int end,
                                m.has_baptism, m.has_communion, m.has_confirmation) as sacraments,
      practice_involvement_points(m.ministries, m.organizations, m.gkk_role, m.parish_role) as involvement
  ) x
) pr;

grant select on members_with_household to authenticated;
