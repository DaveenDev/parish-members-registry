-- The parish logo for the public registration site. Run after
-- 0003_public_stats_groups_names.sql. Safe to re-run.
--
-- anon still has no direct access to parish_settings; this returns only the
-- logo (a data URL, or null when none has been uploaded).

create or replace function public.public_parish_logo()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select logo from parish_settings where id = 1;
$$;

grant execute on function public.public_parish_logo() to anon, authenticated;
