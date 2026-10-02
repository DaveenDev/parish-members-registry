-- GKK leaders can get and renew the census access codes (the code a family
-- types into the online census form) for the households of their own GKK.
--
-- Before this, household_access_codes was an "admin" table under the 0014
-- write guard, so only full-access staff could issue a code: a GKK leader
-- opening "Get codes" for a household with no code yet was refused, and
-- "New code" was hidden. The code functions also returned the codes of any
-- household asked for; they now return only households the signed-in staff
-- member can see (a GKK leader: their GKK). Full-access staff and the public
-- census portal (signed out, which checks its own codes) are unchanged.
-- It also fixes "Get codes" failing for every account after 0022 (see below).
-- Run after 0022_access_code_race.sql. Safe to re-run.

do $$
begin
  if to_regprocedure('public.staff_sees_gkk(text)') is null or to_regclass('public.household_access_codes') is null then
    raise exception 'Run 0008_census_portal.sql and 0014_roles_activity_trash.sql before this migration';
  end if;
end;
$$;

-- Write guard for the codes table, in place of 0014's "admin" one.
create or replace function public.guard_access_code_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  acc text := staff_access();
  mine text := staff_gkk();
begin
  -- Signed out (the census portal counting failed attempts) or full access.
  if acc is null or acc = 'full' then
    return coalesce(new, old);
  end if;
  if acc = 'gkk_leader' and tg_op in ('INSERT', 'UPDATE')
     and exists (select 1 from households h where h.id = new.household_id and h.gkk = mine) then
    return new;
  end if;
  raise exception '%', case acc
    when 'read_only' then 'Your account can view records but not change them'
    when 'gkk_leader' then 'Your account can only get codes for the households of your GKK'
    else 'Your account can''t change this. Ask a staff admin.'
  end using errcode = '42501';
end;
$$;

drop trigger if exists trg_00_guard_staff_write on household_access_codes;
create trigger trg_00_guard_staff_write
  before insert or update or delete on household_access_codes
  for each row execute function guard_access_code_write();

-- As in 0022, limited to the households the signed-in staff member can see.
-- 0022's version failed for everyone with 'column reference "household_id" is
-- ambiguous': its "on conflict (household_id)" also matched the function's own
-- household_id output column. use_column makes such names mean the table's.
create or replace function public.census_access_codes(p_household_ids integer[])
returns table (household_id integer, code text)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  hid integer;
  attempt integer;
begin
  if census_staff_name() is null then raise exception 'Only parish staff can see access codes'; end if;
  foreach hid in array coalesce(p_household_ids, '{}') loop
    continue when not exists (select 1 from households h where h.id = hid and staff_sees_gkk(h.gkk));
    continue when exists (select 1 from household_access_codes a where a.household_id = hid);
    attempt := 0;
    loop
      attempt := attempt + 1;
      begin
        insert into household_access_codes (household_id, code, issued_by) values (hid, census_new_access_code(), auth.uid())
        on conflict (household_id) do nothing;
        exit;
      exception when unique_violation then
        if attempt >= 20 then raise exception 'Could not generate a unique access code'; end if;
      end;
    end loop;
  end loop;
  return query
    select a.household_id, a.code
    from household_access_codes a join households h on h.id = a.household_id
    where a.household_id = any(p_household_ids) and staff_sees_gkk(h.gkk);
end;
$$;

-- As in 0008, for a household the signed-in staff member can see.
create or replace function public.census_reset_access_code(p_household_id integer) returns text
language plpgsql security definer set search_path = public as $$
declare
  new_code text;
  attempt integer := 0;
begin
  if census_staff_name() is null then raise exception 'Only parish staff can change access codes'; end if;
  if not exists (select 1 from households where id = p_household_id and staff_sees_gkk(gkk)) then raise exception 'Household not found'; end if;
  loop
    attempt := attempt + 1;
    new_code := census_new_access_code();
    begin
      insert into household_access_codes (household_id, code, issued_by) values (p_household_id, new_code, auth.uid())
      on conflict (household_id) do update set
        code = excluded.code, issued_at = now(), issued_by = excluded.issued_by, failed_attempts = 0, locked_until = null;
      return new_code;
    exception when unique_violation then
      if attempt >= 20 then raise exception 'Could not generate a unique access code'; end if;
    end;
  end loop;
end;
$$;

revoke execute on function public.census_access_codes(integer[]) from public, anon;
revoke execute on function public.census_reset_access_code(integer) from public, anon;
grant execute on function public.census_access_codes(integer[]) to authenticated;
grant execute on function public.census_reset_access_code(integer) to authenticated;
