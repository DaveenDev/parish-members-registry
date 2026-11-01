-- The website's "Karong {year}" strip: how many people received each sacrament
-- this year, from the dates families gave in the registry. Run after
-- 0105_officer_consent.sql. Safe to re-run.
--
-- Totals only, never names. A count under 5 comes back null (the website says
-- "Ubos sa 5"), so a small number can't point at anyone. The year is Manila's.
-- Matrimony counts people married (both spouses, when both are registered).

create or replace function public.public_sacrament_milestones(p_year integer default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with y as (select coalesce(p_year, extract(year from public.parish_today())::integer) as yr),
  n as (
    select
      (select count(*) from members, y where has_baptism and extract(year from baptism_date) = y.yr) as baptism,
      (select count(*) from members, y where has_communion and extract(year from communion_date) = y.yr) as communion,
      (select count(*) from members, y where has_confirmation and extract(year from conf_date) = y.yr) as confirmation,
      (select count(*) from members, y where has_matrimony and extract(year from mat_date) = y.yr) as matrimony
  )
  select jsonb_build_object(
    'year', (select yr from y),
    'baptism', case when n.baptism >= 5 then n.baptism end,
    'communion', case when n.communion >= 5 then n.communion end,
    'confirmation', case when n.confirmation >= 5 then n.confirmation end,
    'matrimony', case when n.matrimony >= 5 then n.matrimony end
  ) from n;
$$;

revoke all on function public.public_sacrament_milestones(integer) from public;
grant execute on function public.public_sacrament_milestones(integer) to anon, authenticated;
