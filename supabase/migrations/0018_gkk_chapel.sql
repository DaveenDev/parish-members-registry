-- Each GKK's chapel: its address and the year the GKK was established, kept
-- on the gkks rows and shown in the public GKK directory (where the address
-- is also searched). Run after 0013_public_site.sql. Safe to re-run.

do $$
begin
  if to_regprocedure('public.public_gkk_directory()') is null then
    raise exception 'Run 0013_public_site.sql before this migration';
  end if;
end;
$$;

alter table gkks add column if not exists chapel_address   text;
alter table gkks add column if not exists year_established smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gkks_year_established_check') then
    alter table gkks add constraint gkks_year_established_check
      check (year_established is null or year_established between 1500 and 2100);
  end if;
end;
$$;

-- As in 0013, plus chapel_address and year_established.
create or replace function public.public_gkk_directory() returns jsonb
language sql stable security definer set search_path = public as $$
  with hh as (select gkk, count(*)::int as n from households where gkk is not null group by gkk),
  cen as (select * from public_census_gkk_rows())
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', g.name,
           'puroks', g.puroks,
           'chapel_address', nullif(trim(g.chapel_address), ''),
           'year_established', g.year_established,
           'meeting_schedule', g.meeting_schedule,
           'meeting_place', g.meeting_place,
           'households', case when coalesce(hh.n, 0) >= 5 then hh.n end,
           'census_pct', case when coalesce(cen.households, 0) >= 5 then round(100.0 * cen.confirmed / cen.households)::int end,
           'coordinator', case when g.coordinator_public and nullif(trim(g.coordinator_name), '') is not null
                               then jsonb_build_object('name', g.coordinator_name, 'mobile', nullif(trim(g.coordinator_mobile), '')) end
         ) order by g.name), '[]'::jsonb)
  from gkks g
  left join hh on hh.gkk = g.name
  left join cen on cen.gkk = g.name;
$$;

grant execute on function public.public_gkk_directory() to anon, authenticated;
