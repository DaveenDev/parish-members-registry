-- Parish Config → Parish GKK's "No coordinator": a GKK without a GKK leader
-- account. Run after 0097_song_credits.sql. Safe to re-run.
--
-- The chip looked at the GKK's old coordinator_name field (0013), which
-- nothing fills any more, so every GKK showed "No coordinator" however many
-- GKK leaders (census coordinators) had accounts. gkk_coordinators() gives
-- each GKK's GKK leader accounts that can sign in (a disabled account leaves
-- its GKK uncovered, as on Staff accounts), by name, to full-access staff
-- only: profiles are each staff member's own to read, and whether an account
-- is disabled is kept in auth.users.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'access_gkk_id')
     or to_regprocedure('public.staff_access()') is null then
    raise exception 'Run the migrations up to 0097_song_credits.sql before this one';
  end if;
end;
$$;

/** [{ gkk_id, names }]: the GKKs with a GKK leader account that can sign in, and those leaders' names. Full access only. */
create or replace function public.gkk_coordinators()
returns table (gkk_id integer, names text[])
language sql stable security definer set search_path = public as $$
  select p.access_gkk_id,
         array_agg(coalesce(nullif(trim(p.name), ''), u.email) order by coalesce(nullif(trim(p.name), ''), u.email))
  from profiles p
  join auth.users u on u.id = p.id
  where staff_access() = 'full'
    and p.access = 'gkk_leader'
    and p.access_gkk_id is not null
    and (u.banned_until is null or u.banned_until <= now())
  group by p.access_gkk_id;
$$;

revoke all on function public.gkk_coordinators() from public, anon;
grant execute on function public.gkk_coordinators() to authenticated;
