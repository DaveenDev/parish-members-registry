-- census_access_codes(): two calls at once for a household with no code
-- (opening "Get codes" while printing, or a page asking twice) both saw no
-- code and both inserted. The second insert then failed on household_id, not
-- on the code, so retrying never helped and it gave up with "Could not
-- generate a unique access code". Now a household that got its code from the
-- other call is simply skipped; only a clash on the code itself retries.

create or replace function public.census_access_codes(p_household_ids integer[])
returns table (household_id integer, code text)
language plpgsql security definer set search_path = public as $$
declare
  hid integer;
  attempt integer;
begin
  if census_staff_name() is null then raise exception 'Only parish staff can see access codes'; end if;
  foreach hid in array coalesce(p_household_ids, '{}') loop
    continue when not exists (select 1 from households h where h.id = hid);
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
    select a.household_id, a.code from household_access_codes a where a.household_id = any(p_household_ids);
end;
$$;

revoke execute on function public.census_access_codes(integer[]) from public, anon;
grant execute on function public.census_access_codes(integer[]) to authenticated;
