-- Hardening from the staff journey run of 2026-10-01 (notes H1 and H2): take
-- away privileges the signed-out public never needed, so the staff/public
-- boundary no longer rests on row-level security alone. Nothing the app does
-- changes. Run after 0014_roles_activity_trash.sql. Safe to re-run.

-- Stop early, naming the missing file, if an earlier migration hasn't run.
do $$
begin
  if to_regprocedure('public.staff_access()') is null then
    raise exception 'Run 0014_roles_activity_trash.sql before this migration';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- H1: staff functions that anon could execute.
-- Postgres lets everyone (public) execute a new function. 0001, 0006 and 0007
-- granted these to authenticated without revoking them from public, so a
-- signed-out caller could run them; they are security invoker, so RLS
-- stopped every write, but the caller got application errors back instead of
-- "permission denied". Same pattern as 0005, 0007's cycle functions and 0010.
-- ---------------------------------------------------------------------------
revoke execute on function public.create_household(jsonb) from public, anon;
revoke execute on function public.rename_gkk(text, text) from public, anon;
revoke execute on function public.delete_gkk(text) from public, anon;
revoke execute on function public.rename_ministry(text, text) from public, anon;
revoke execute on function public.delete_ministry(text) from public, anon;
revoke execute on function public.rename_organization(text, text) from public, anon;
revoke execute on function public.delete_organization(text) from public, anon;
revoke execute on function public.rename_parish_position(text, text) from public, anon;
revoke execute on function public.delete_parish_position(text) from public, anon;
revoke execute on function public.census_household_progress(integer) from public, anon;
revoke execute on function public.census_summary(integer) from public, anon;

grant execute on function public.create_household(jsonb) to authenticated;
grant execute on function public.rename_gkk(text, text) to authenticated;
grant execute on function public.delete_gkk(text) to authenticated;
grant execute on function public.rename_ministry(text, text) to authenticated;
grant execute on function public.delete_ministry(text) to authenticated;
grant execute on function public.rename_organization(text, text) to authenticated;
grant execute on function public.delete_organization(text) to authenticated;
grant execute on function public.rename_parish_position(text, text) to authenticated;
grant execute on function public.delete_parish_position(text) to authenticated;
grant execute on function public.census_household_progress(integer) to authenticated;
grant execute on function public.census_summary(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- H2: write privileges on profiles.
-- 0001 grants authenticated select only, but Supabase's default privileges
-- give new tables to anon and authenticated in full, so a staff session's
-- PATCH/DELETE on profiles reached RLS (which stopped them) instead of being
-- refused outright. The browser only ever reads its own profile; staff
-- accounts are written by the manage-staff function with the service role,
-- which these revokes don't touch.
-- ---------------------------------------------------------------------------
revoke all on profiles from anon;
revoke insert, update, delete, truncate, references, trigger on profiles from authenticated;
grant select on profiles to authenticated;
