-- More public totals for the home page's "Atong pamilya sa parokya":
-- current members (not moved away or deceased), ministries, organizations,
-- and the year the oldest GKK was established. Counts only, no names; the
-- site shows any count under 5 as "Ubos sa 5". Run after 0018_gkk_chapel.sql.
-- Safe to re-run.

do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'gkks' and column_name = 'year_established') then
    raise exception 'Run 0018_gkk_chapel.sql before this migration';
  end if;
end;
$$;

create or replace function public.public_parish_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'gkks', (select count(*) from gkks),
    'households', (select count(*) from households),
    'members', (select count(*) from members where coalesce(membership_status not in ('Moved away', 'Deceased'), true)),
    'ministries', (select count(*) from ministries),
    'organizations', (select count(*) from organizations),
    'oldest_gkk_year', (select min(year_established) from gkks)
  );
$$;

grant execute on function public.public_parish_stats() to anon, authenticated;
