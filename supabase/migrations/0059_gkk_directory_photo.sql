-- The website's GKK cards show each GKK's main photo (the chapel, 0046).
-- Run after 0058_last_year_count_reset.sql (needs 0046). Safe to re-run.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'gkks' and column_name = 'photo_url') then
    raise exception 'Run 0046_gkk_photos.sql before this migration';
  end if;
end;
$$;

-- As in 0018, plus photo_url.
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
           'photo_url', nullif(trim(g.photo_url), ''),
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
