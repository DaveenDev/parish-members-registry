-- GKK leaders can use the Census page for the households of their own GKK:
-- see progress and results, record answers, and review the online updates
-- families send. Starting, closing and reopening a census stay with
-- full-access staff (census_cycles keeps 0014's "admin" write guard).
--
-- Before this, 0014 limited reads of the census tables to staff who see the
-- whole registry and put their writes under the "admin" guard, so a GKK
-- leader saw no census at all. Now:
--   reads   the census rows of households the signed-in staff member can see
--           (staff_sees_gkk, as for households and members). The progress,
--           results and sidebar-count functions run as the caller, so they
--           follow these rules without changes.
--   writes  a GKK-aware guard on the three tables. The census functions
--           (record answers, clear an answer, approve or reject an online
--           update) are SECURITY DEFINER, but every row they write goes
--           through this trigger, so a GKK leader is refused for any other
--           GKK. Their changes to households and members already pass 0014's
--           registry guard for their own GKK.
-- Full-access staff, read-only staff and the public census portal are
-- unchanged. Run after 0023_gkk_leader_codes.sql. Safe to re-run.

do $$
begin
  if to_regprocedure('public.staff_sees_gkk(text)') is null or to_regclass('public.census_submissions') is null then
    raise exception 'Run 0008_census_portal.sql and 0014_roles_activity_trash.sql before this migration';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------

drop policy if exists "census_member_responses_admin_select" on census_member_responses;
create policy "census_member_responses_admin_select" on census_member_responses
  for select to authenticated using (
    staff_can_see('registry') or exists (
      select 1 from members m join households h on h.id = m.household_id
      where m.id = member_id and staff_sees_gkk(h.gkk)));

drop policy if exists "census_submissions_admin_select" on census_submissions;
create policy "census_submissions_admin_select" on census_submissions
  for select to authenticated using (
    staff_can_see('registry') or exists (select 1 from households h where h.id = household_id and staff_sees_gkk(h.gkk)));

drop policy if exists "census_household_snapshots_admin_select" on census_household_snapshots;
create policy "census_household_snapshots_admin_select" on census_household_snapshots
  for select to authenticated using (
    staff_can_see('registry') or exists (select 1 from households h where h.id = household_id and staff_sees_gkk(h.gkk)));

-- ---------------------------------------------------------------------------
-- Writes
-- ---------------------------------------------------------------------------

-- In place of 0014's "admin" guard on the census answer tables.
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
