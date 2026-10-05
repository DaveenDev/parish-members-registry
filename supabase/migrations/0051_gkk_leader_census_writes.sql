-- GKK leaders can save the census for their own GKK again. Run after
-- 0050_gkk_leader_scope.sql. Safe to re-run.
--
-- A GKK leader could edit their households and members, but recording census
-- answers, or approving or rejecting a family's online update, failed with
-- "Your account can only update the households and members of your GKK".
-- The three census answer tables still had 0014's "admin" write guard, which
-- refuses every GKK leader: the write half of 0024_gkk_leader_census.sql
-- (guard_census_write) was missing from the database. Its read half has since
-- been restored by 0050, so this file brings back only the write half, as it
-- was in 0024: a leader may write the census rows of households in their GKK,
-- and is refused for any other GKK.

do $$
begin
  if to_regprocedure('public.staff_gkk()') is null or to_regclass('public.census_submissions') is null then
    raise exception 'Run 0008_census_portal.sql and 0014_roles_activity_trash.sql before this migration';
  end if;
end;
$$;

-- In place of 0014's "admin" guard on the census answer tables (as 0024).
create or replace function public.guard_census_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  acc text := staff_access();
  mine text := staff_gkk();
  hid integer;
begin
  -- Signed out (the census portal) or full access.
  if acc is null or acc = 'full' then
    return coalesce(new, old);
  end if;
  if acc = 'gkk_leader' then
    -- census_member_responses rows point at a member; the others at a household.
    if tg_table_name = 'census_member_responses' then
      if tg_op = 'DELETE' then
        select m.household_id into hid from members m where m.id = old.member_id;
      else
        select m.household_id into hid from members m where m.id = new.member_id;
      end if;
    elsif tg_op = 'DELETE' then
      hid := old.household_id;
    else
      hid := new.household_id;
    end if;
    if exists (select 1 from households h where h.id = hid and h.gkk = mine) then
      return coalesce(new, old);
    end if;
  end if;
  raise exception '%', case acc
    when 'read_only' then 'Your account can view records but not change them'
    when 'gkk_leader' then 'Your account can only record the census for households in ' || coalesce(mine, 'your GKK')
    else 'Your account can''t change this. Ask a staff admin.'
  end using errcode = '42501';
end;
$$;

revoke all on function public.guard_census_write() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['census_member_responses', 'census_submissions', 'census_household_snapshots'] loop
    execute format('drop trigger if exists trg_00_guard_staff_write on %I', t);
    execute format('create trigger trg_00_guard_staff_write before insert or update or delete on %I
                    for each row execute function guard_census_write()', t);
  end loop;
end;
$$;
