-- A census update from the family portal that changes none of the family's
-- details is approved at once: its answers (each member's status and
-- participation) go straight into the census, with no staff review. An
-- update that changes the household's address or contact, a member's
-- details, or adds a member still waits in Census → Online updates as
-- before. Run after 0082_census_results_snapshot.sql. Safe to re-run.
--
-- Staff are only notified of an automatically approved update when the
-- family wrote a message with it.

do $$
begin
  if to_regprocedure('public.portal_submit(text, text, jsonb)') is null
     or to_regprocedure('public.notify_new_request()') is null then
    raise exception 'Run 0054_household_families.sql and 0034_staff_notifications.sql before this migration';
  end if;
end;
$$;

-- As in 0054, plus: with nothing changed, the update is saved as Approved
-- and its answers are applied. Answers { ok, submittedAt, approved }.
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

  -- Did the family change any details, or only answer the census?
  changed := jsonb_array_length(new_out) > 0
    or hh_out is distinct from before_json->'household'
    or exists (select 1 from jsonb_array_elements(members_out) x
               where x->'fields' is distinct from before_json->'members'->(x->>'id'));

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

-- As in 0072: an update approved automatically isn't one to review, so it
-- notifies staff only when it carries a message, linked to the approved list.
create or replace function public.notify_new_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r jsonb := to_jsonb(new);
  hh households;
begin
  if coalesce(auth.role(), '') <> 'anon' then
    return new;
  end if;

  begin
    case tg_table_name
    when 'certificate_requests' then
      insert into staff_notifications (kind, area, ref_no, title, detail, link)
      values ('certificate', 'requests', (r->>'ref_no'),
        'Certificate request: ' || case r->>'cert_type' when 'baptism' then 'Baptismal' when 'confirmation' then 'Confirmation'
                                                        when 'matrimony' then 'Marriage' else coalesce(r->>'cert_type', '') end,
        concat_ws(' ', r->>'subject_first_name', r->>'subject_last_name'),
        '/admin/requests?q=' || (r->>'ref_no'));

    when 'sacrament_requests' then
      if r->>'sacrament' = 'anointing' then
        insert into staff_notifications (kind, area, ref_no, title, detail, link, urgent)
        values ('anointing', 'requests', (r->>'ref_no'),
          case when (r->>'urgent')::boolean then 'Anointing of the Sick: gravely ill' else 'Anointing of the Sick request' end,
          concat_ws(' · ', r->>'person_name', r->>'location'),
          '/admin/requests?tab=sacraments&q=' || (r->>'ref_no'), true);
      else
        insert into staff_notifications (kind, area, ref_no, title, detail, link)
        values ('ocia', 'requests', (r->>'ref_no'), 'OCIA enrolment',
          r->>'person_name', '/admin/requests?tab=sacraments&q=' || (r->>'ref_no'));
      end if;

    when 'blood_requests' then
      insert into staff_notifications (kind, area, ref_no, title, detail, link, urgent)
      values ('blood', 'requests', (r->>'ref_no'), 'Blood request: ' || coalesce(r->>'blood_type', ''),
        concat_ws(' · ', r->>'patient_name', r->>'hospital'), '/admin/requests?tab=blood', true);

    when 'households' then
      insert into staff_notifications (kind, area, gkk, ref_no, title, detail, link)
      values ('registration', 'registry', r->>'gkk', (r->>'ref_no'), 'New household registration',
        concat_ws(' · ', r->>'household_name', r->>'gkk'),
        '/admin/households?status=All&q=' || (r->>'ref_no'));

    when 'census_submissions' then
      select * into hh from households where id = (r->>'household_id')::integer;
      if coalesce(r->>'status', 'Pending') = 'Pending' then
        insert into staff_notifications (kind, area, gkk, ref_no, title, detail, link)
        values ('census', 'registry', hh.gkk, hh.ref_no, 'Census update to review',
          concat_ws(' · ', hh.household_name, hh.gkk),
          '/admin/census?tab=updates' || coalesce('&q=' || hh.ref_no, ''));
      elsif nullif(trim(r->>'message'), '') is not null then
        insert into staff_notifications (kind, area, gkk, ref_no, title, detail, link)
        values ('census', 'registry', hh.gkk, hh.ref_no, 'Census message from a family',
          concat_ws(' · ', hh.household_name, hh.gkk),
          '/admin/census?tab=updates&status=' || (r->>'status') || coalesce('&q=' || hh.ref_no, ''));
      end if;

    when 'blood_donors' then
      insert into staff_notifications (kind, area, gkk, title, detail, link)
      values ('donor', 'requests', r->>'gkk', 'New blood donor' || coalesce(': ' || (r->>'blood_type'), ''),
        concat_ws(' · ', r->>'full_name', r->>'gkk'), '/admin/requests?tab=blood');

    else
      null;
    end case;
  exception when others then
    raise warning 'notify_new_request on %: %', tg_table_name, sqlerrm;
  end;
  return new;
end;
$function$;
