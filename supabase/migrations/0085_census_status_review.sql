-- An online census update that marks a member as moved away, deceased or
-- left the Church waits for staff review again. Run after
-- 0083_census_auto_approve.sql. Safe to re-run.
--
-- 0083 approves an update at once when the family changed none of the
-- household's or members' details. Its answers then go straight into the
-- registry, and a member's census status becomes their membership status:
-- one tap on "Namatay" or "Nibalhin" took a member off the household's
-- current members with nobody checking. Now an update that gives a member
-- one of those statuses (when it isn't already their status on record)
-- waits under Census → Online updates like a change of details. Updates
-- that only answer Aktibo / Dili aktibo and the activity questions are
-- still approved at once.

do $$
begin
  if to_regprocedure('public.portal_submit(text, text, jsonb)') is null
     or to_regprocedure('public.census_apply_responses(integer, integer, jsonb, text, uuid, text)') is null then
    raise exception 'Run 0083_census_auto_approve.sql before this migration';
  end if;
end;
$$;

-- As in 0083, plus: a member newly marked Moved away, Deceased or Left the
-- Church counts as a change. Answers { ok, submittedAt, approved }.
create or replace function public.portal_submit(p_ref text, p_code text, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  chk jsonb := portal_check(p_ref, p_code);
  hid integer;
  cyc_id integer;
  h households;
  before_json jsonb;
  hh_in jsonb := coalesce(p_payload->'household', '{}'::jsonb);
  hh_out jsonb;
  members_out jsonb := '[]'::jsonb;
  new_out jsonb := '[]'::jsonb;
  e jsonb;
  mid integer;
  fields jsonb;
  status_val text;
  k text;
  saved_at timestamptz;
  changed boolean;
  responses jsonb;
begin
  if not (chk->>'ok')::boolean then return chk; end if;
  hid := (chk->>'householdId')::integer;
  select id into cyc_id from census_cycles where status = 'Open';
  select * into h from households where id = hid;

  if coalesce((p_payload->>'consent')::boolean, false) is not true then
    raise exception 'Data privacy consent is required';
  end if;

  before_json := jsonb_build_object(
    'household', portal_household_fields(h),
    'members', coalesce((select jsonb_object_agg(m.id::text, portal_member_fields(m)) from members m where m.household_id = hid), '{}'::jsonb));

  -- Household: a missing key keeps what is on record; required address
  -- parts can't be blanked.
  hh_out := before_json->'household';
  if jsonb_typeof(hh_in) = 'object' then
    foreach k in array array['street', 'barangay', 'city', 'province', 'zip', 'contact', 'email'] loop
      continue when not (hh_in ? k);
      if k in ('contact', 'email') or portal_text(hh_in->>k) is not null then
        hh_out := jsonb_set(hh_out, array[k], coalesce(to_jsonb(portal_text(hh_in->>k,
          case k when 'street' then 200 when 'zip' then 20 when 'contact' then 60 when 'email' then 120 else 100 end)), 'null'::jsonb));
      end if;
    end loop;
  end if;

  if jsonb_typeof(p_payload->'members') = 'array' then
    if jsonb_array_length(p_payload->'members') > 30 then raise exception 'A household can have at most 30 members'; end if;
    for e in select * from jsonb_array_elements(p_payload->'members') loop
      mid := nullif(e->>'id', '')::integer;
      if mid is null or not (before_json->'members' ? mid::text) then
        raise exception 'A member in this form is not in your household';
      end if;
      status_val := e->>'status';
      if status_val is not null and not (status_val = any(census_member_statuses())) then status_val := null; end if;
      fields := portal_clean_member_fields(e, before_json->'members'->(mid::text));
      members_out := members_out || jsonb_build_array(jsonb_build_object(
        'id', mid, 'fields', fields, 'status', status_val,
        'participation', census_clean_participation(e->'participation'),
        'notes', portal_text(e->>'notes', 500)));
    end loop;
  end if;

  if jsonb_typeof(p_payload->'newMembers') = 'array' then
    if jsonb_array_length(p_payload->'newMembers') > 10 then raise exception 'Add at most 10 new members at a time'; end if;
    for e in select * from jsonb_array_elements(p_payload->'newMembers') loop
      if trim(coalesce(e->>'relationship', '')) in ('Head of Household', 'Head of Family') then
        raise exception 'A new member cannot be a family head';
      end if;
      fields := portal_clean_member_fields(e, null);
      if fields->>'first_name' is null or fields->>'last_name' is null then raise exception 'Member first and last name are required'; end if;
      if fields->>'relationship' is null then raise exception 'Member relationship is required'; end if;
      -- Only one of the house's families; otherwise the first.
      if not exists (select 1 from members where household_id = hid and family_no = (fields->>'family_no')::integer) then
        fields := jsonb_set(fields, '{family_no}', '1'::jsonb);
      end if;
      status_val := e->>'status';
      if status_val is not null and not (status_val = any(census_member_statuses())) then status_val := null; end if;
      new_out := new_out || jsonb_build_array(jsonb_build_object(
        'fields', fields, 'status', status_val,
        'participation', census_clean_participation(e->'participation'),
        'notes', portal_text(e->>'notes', 500)));
    end loop;
  end if;

  -- Did the family change any details, take a member off the household
  -- (moved away, deceased, left the Church), or only answer the census?
  changed := jsonb_array_length(new_out) > 0
    or hh_out is distinct from before_json->'household'
    or exists (select 1 from jsonb_array_elements(members_out) x
               where x->'fields' is distinct from before_json->'members'->(x->>'id'))
    or exists (select 1 from jsonb_array_elements(members_out) x
               join members m on m.id = (x->>'id')::integer
               where x->>'status' in ('Moved away', 'Deceased', 'Left the Church')
                 and m.membership_status is distinct from x->>'status');

  delete from census_submissions where cycle_id = cyc_id and household_id = hid and status = 'Pending';

  if changed then
    insert into census_submissions (cycle_id, household_id, before, proposed, message)
    values (cyc_id, hid, before_json,
            jsonb_build_object('household', hh_out, 'members', members_out, 'newMembers', new_out),
            portal_text(p_payload->>'message', 1000))
    returning submitted_at into saved_at;
    return jsonb_build_object('ok', true, 'submittedAt', saved_at, 'approved', false);
  end if;

  -- Only answers: save them as census_approve_submission() would.
  select coalesce(jsonb_agg(jsonb_build_object(
           'memberId', (x->>'id')::integer, 'status', x->>'status', 'participation', x->'participation', 'notes', x->>'notes')), '[]'::jsonb)
    into responses
  from jsonb_array_elements(members_out) x
  where x->>'status' is not null;
  if jsonb_array_length(responses) > 0 then
    perform census_apply_responses(cyc_id, hid, responses, 'Portal', null, 'the family');
  end if;

  insert into census_submissions (cycle_id, household_id, before, proposed, message,
                                  status, reviewed_by_name, reviewed_at, review_note)
  values (cyc_id, hid, before_json,
          jsonb_build_object('household', hh_out, 'members', members_out, 'newMembers', new_out),
          portal_text(p_payload->>'message', 1000),
          'Approved', 'the system', now(), 'no details changed, so approved automatically')
  returning submitted_at into saved_at;
  return jsonb_build_object('ok', true, 'submittedAt', saved_at, 'approved', true);
end;
$$;
grant execute on function public.portal_submit(text, text, jsonb) to anon, authenticated;
