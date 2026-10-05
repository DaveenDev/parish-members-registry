-- Edit Household: each member's status and own participation answers
-- (0055), changed by staff. Run after 0055_registration_member_census.sql.
-- Safe to re-run.
--
-- save_member_answers(household, answers) saves, for each member given:
-- their status (membership_status: Active, Inactive, Moved away, Deceased or
-- Left the Church, or none) and their own answers (registration_participation;
-- cleared for a status with nothing to answer). Who may change a member is
-- the members write guard's rule (0014): full access, or a GKK leader for
-- their own GKK.
--
-- While a census is open, a member whose answer in it came from the
-- registration (source 'Registration', 0055) gets that answer updated too, so
-- their Practicing Catholic score follows the edit. An answer given in the
-- census itself (paper form, staff visit or the portal) is left alone; it's
-- changed on the Census page.

do $$
begin
  if to_regprocedure('public.registration_apply_member_answers(integer, integer, jsonb, uuid, text)') is null then
    raise exception 'Run 0055_registration_member_census.sql before this migration';
  end if;
end;
$$;

create or replace function public.save_member_answers(p_household_id integer, p_answers jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  a jsonb;
  mid integer;
  st text;
  part jsonb;
  cyc integer;
  synced jsonb := '[]'::jsonb;
  saved integer := 0;
begin
  if staff_access() is null then
    raise exception 'Please sign in again' using errcode = '42501';
  end if;
  if jsonb_typeof(p_answers) <> 'array' then return 0; end if;
  select id into cyc from census_cycles where status = 'Open';

  for a in select * from jsonb_array_elements(p_answers) loop
    mid := nullif(a->>'memberId', '')::integer;
    if mid is null or not exists (select 1 from members where id = mid and household_id = p_household_id) then
      raise exception 'A member here is not in this household';
    end if;
    st := nullif(trim(a->>'status'), '');
    if st is not null and not (st = any(census_member_statuses())) then
      raise exception 'Unknown status: %', st;
    end if;
    -- Only someone active or inactive has participation to answer.
    part := case when st is null or st in ('Active', 'Inactive') then census_clean_participation(a->'participation') else '{}'::jsonb end;

    -- The members write guard (trg_00_guard_staff_write) decides who may.
    update members set
      membership_status = st,
      status_updated_at = case when membership_status is distinct from st then now() else status_updated_at end,
      registration_participation = part
    where id = mid;

    if cyc is not null and st is not null and exists (
      select 1 from census_member_responses r where r.cycle_id = cyc and r.member_id = mid and r.source = 'Registration'
    ) then
      synced := synced || jsonb_build_array(jsonb_build_object('memberId', mid, 'status', st, 'participation', part));
    end if;
    saved := saved + 1;
  end loop;

  if jsonb_array_length(synced) > 0 then
    perform census_apply_responses(cyc, p_household_id, synced, 'Registration', auth.uid(), census_staff_name());
  end if;
  return saved;
end;
$$;

revoke all on function public.save_member_answers(integer, jsonb) from public, anon;
grant execute on function public.save_member_answers(integer, jsonb) to authenticated;
