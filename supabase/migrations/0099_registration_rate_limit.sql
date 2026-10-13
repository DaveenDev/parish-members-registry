-- Online registration (Irehistro ang pamilya) gets the rate limit the other
-- public forms have (public_request_guard, 0012). Run after
-- 0098_gkk_coordinators.sql. Safe to re-run.
--
-- submit_registration and submit_family_registration were open to anyone
-- without a limit, so a script could fill the verification queue with made-up
-- households. Now one visitor (one internet address) can send 30 registrations
-- an hour, and the whole site 300 an hour: far above a parish registration
-- drive, where many phones on the same Wi-Fi or mobile network share one
-- address. Signed-in staff (a GKK leader registering families on /register)
-- aren't counted. The functions are 0055's, with the guard first.

do $$
begin
  if to_regprocedure('public.public_request_guard(text, integer, integer)') is null
     or to_regprocedure('public.submit_registration_base(jsonb)') is null
     or to_regprocedure('public.submit_family_registration_base(text, text, jsonb)') is null
     or to_regprocedure('public.registration_apply_member_answers(integer, integer, jsonb, uuid, text)') is null then
    raise exception 'Run the migrations up to 0098_gkk_coordinators.sql before this one';
  end if;
end;
$$;

/** The registration limit: 30 an hour from one visitor, 300 an hour in all; staff signed in aren't counted. */
create or replace function public.registration_guard()
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    perform public_request_guard('registration', 30, 300);
  end if;
end;
$$;

revoke all on function public.registration_guard() from public, anon, authenticated;

create or replace function public.submit_registration(payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  res jsonb;
  hid integer;
  new_code text;
  attempt integer := 0;
begin
  perform registration_guard();
  res := submit_registration_base(payload);
  hid := (res->>'householdId')::integer;

  perform registration_apply_member_answers(hid, 0, payload->'members', null, 'Online registration');

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

create or replace function public.submit_family_registration(p_ref text, p_code text, payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  last_id integer;
  res jsonb;
  hid integer;
begin
  perform registration_guard();
  -- Members added from here on are this family's (the code check stays in the base).
  last_id := (select coalesce(max(id), 0) from members);
  res := submit_family_registration_base(p_ref, p_code, payload);
  if coalesce((res->>'ok')::boolean, false) then
    select h.id into hid from households h where h.ref_no = res->>'refNo';
    if hid is not null then
      perform registration_apply_member_answers(hid, last_id, payload->'members', null, 'Online registration');
    end if;
  end if;
  return res;
end;
$$;

grant execute on function public.submit_registration(jsonb) to anon, authenticated;
grant execute on function public.submit_family_registration(text, text, jsonb) to anon, authenticated;
