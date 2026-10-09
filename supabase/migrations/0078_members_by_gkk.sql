-- Dashboard -> Members by GKK counts members. Run after
-- 0077_faster_activeness_report.sql. Safe to re-run.
--
-- The Dashboard's "Members by GKK" card took its numbers from
-- admin_dashboard_stats()'s by_gkk, which counts households (0010).
-- members_by_gkk() counts each GKK's current members (not moved away or
-- deceased, as members_with_household.is_current), largest first. It runs
-- as the signed-in account, so each one counts the members they can see (a
-- GKK leader, their own GKK's). Members of households with no GKK are left
-- out, as before.

do $$
begin
  if to_regclass('public.members') is null or to_regclass('public.households') is null then
    raise exception 'Run 0001_init.sql and the migrations after it first';
  end if;
end;
$$;

create or replace function public.members_by_gkk()
returns table (gkk text, members bigint)
language sql stable set search_path = public as $$
  select h.gkk, count(*)
  from members m
  join households h on h.id = m.household_id
  where h.gkk is not null
    and coalesce(m.membership_status <> all (array['Moved away', 'Deceased']), true)
  group by h.gkk
  order by count(*) desc, h.gkk;
$$;

revoke execute on function public.members_by_gkk() from public, anon;
grant execute on function public.members_by_gkk() to authenticated;
