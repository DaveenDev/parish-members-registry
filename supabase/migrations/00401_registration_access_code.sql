-- A newly registered family gets its census access code right away: the
-- confirmation screen shows the code with the reference number, so the family
-- can open its record in the census portal without waiting for a printed form.
-- Run after 0039_faster_access_checks.sql (needs 0008 and 0023). Safe to re-run.
--
-- submit_registration() (last written in 0006) is renamed to
-- submit_registration_base() and wrapped: the wrapper registers the family as
-- before, then issues the code and adds it to the result as accessCode. A
-- later migration that rewrites the registration should change
-- submit_registration_base(), not submit_registration().

do $$
begin
  if to_regclass('public.household_access_codes') is null or to_regprocedure('public.guard_access_code_write()') is null then
    raise exception 'Run 0008_census_portal.sql and 0023_gkk_leader_codes.sql before this migration';
  end if;
  if to_regprocedure('public.submit_registration_base(jsonb)') is null then
    alter function public.submit_registration(jsonb) rename to submit_registration_base;
  end if;
end;
$$;

revoke execute on function public.submit_registration_base(jsonb) from public, anon, authenticated;

-- { refNo, householdId, accessCode }. accessCode is null only if the code
-- couldn't be issued (say, a GKK leader of another GKK signed in on this
-- device); the registration itself still goes through, and staff can get the
-- code later from the Census page.
create or replace function public.submit_registration(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  res jsonb := submit_registration_base(payload);
  hid integer := (res->>'householdId')::integer;
  new_code text;
  attempt integer := 0;
begin
  begin
    loop
      attempt := attempt + 1;
      begin
        insert into household_access_codes (household_id, code, issued_by) values (hid, census_new_access_code(), auth.uid())
        on conflict (household_id) do nothing
        returning code into new_code;
        exit;
      exception when unique_violation then
        if attempt >= 20 then raise exception 'Could not generate a unique access code'; end if;
      end;
    end loop;
    if new_code is null then
      select a.code into new_code from household_access_codes a where a.household_id = hid;
    end if;
  exception when others then
    new_code := null;
  end;
  return res || jsonb_build_object('accessCode', new_code);
end;
$$;

grant execute on function public.submit_registration(jsonb) to anon, authenticated;
