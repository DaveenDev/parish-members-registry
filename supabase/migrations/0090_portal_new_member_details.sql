-- A new member added on the census portal is entered as at registration:
-- their details, their sacraments, their part in the parish and lastly the
-- census questions. Run after 0085_census_status_review.sql. Safe to re-run.
--
-- Before this, the portal took a new member's name, relationship, sex,
-- birthday, civil status and contact only, and staff added the rest by hand
-- once they had approved the update. Now portal_submit() keeps the rest with
-- the update: place of birth, tribe, email, occupation and religion; each
-- sacrament with its date and parish (and the Confirmation name and
-- sponsor, and the kind of wedding); the organizations and the Katungdanan
-- sa GKK / Parish. Approving the update under Census → Online updates saves
-- them on the new member. An update sent before this approves as before.
--
-- Blood types are still not asked online: GKK leaders review these updates
-- and don't see blood types (0050).

do $$
begin
  if to_regprocedure('public.portal_submit(text, text, jsonb)') is null
     or to_regprocedure('public.census_approve_submission(integer)') is null
     or to_regprocedure('public.portal_clean_member_fields(jsonb, jsonb)') is null
     or to_regprocedure('public.census_apply_responses(integer, integer, jsonb, text, uuid, text)') is null then
    raise exception 'Run 0054_household_families.sql, 0083_census_auto_approve.sql and 0085_census_status_review.sql before this migration';
  end if;
end;
$$;

/**
 * What a new member brings in from the portal besides
 * portal_clean_member_fields(), keys as the members table's columns. A
 * sacrament's date and parish are kept only while it is ticked; the kind of
 * wedding only when it's one of the three; organizations and the parish role
 * only when they are on the parish's lists.
 */
create or replace function public.portal_new_member_details(p jsonb) returns jsonb
language sql stable set search_path = public as $$
  with s as (
    select coalesce(p->>'has_baptism', '') = 'true' as bap,
           coalesce(p->>'has_communion', '') = 'true' as com,
           coalesce(p->>'has_confirmation', '') = 'true' as conf,
           coalesce(p->>'has_matrimony', '') = 'true' as mat
  )
  select jsonb_build_object(
    'place_of_birth', portal_text(p->>'place_of_birth', 120),
    'tribe', portal_text(p->>'tribe', 80),
    'email', portal_text(p->>'email', 120),
    'occupation', portal_text(p->>'occupation', 100),
    'religion', coalesce(portal_text(p->>'religion', 60), 'Roman Catholic'),
    'has_baptism', s.bap,
    'baptism_date', case when s.bap then portal_date(p->>'baptism_date')::text end,
    'baptism_church', case when s.bap then portal_text(p->>'baptism_church', 150) end,
    'has_communion', s.com,
    'communion_date', case when s.com then portal_date(p->>'communion_date')::text end,
    'communion_church', case when s.com then portal_text(p->>'communion_church', 150) end,
    'has_confirmation', s.conf,
    'conf_date', case when s.conf then portal_date(p->>'conf_date')::text end,
    'conf_church', case when s.conf then portal_text(p->>'conf_church', 150) end,
    'conf_name', case when s.conf then portal_text(p->>'conf_name', 80) end,
    'conf_sponsor', case when s.conf then portal_text(p->>'conf_sponsor', 120) end,
    'has_matrimony', s.mat,
    'mat_date', case when s.mat then portal_date(p->>'mat_date')::text end,
    'mat_church', case when s.mat then portal_text(p->>'mat_church', 150) end,
    'mat_type', case when portal_text(p->>'mat_type') in ('Catholic Marriage', 'Civil Wedding', 'Other Sect Wedding') then portal_text(p->>'mat_type') end,
    'organizations', to_jsonb(array(
      select o.name from organizations o
      where jsonb_typeof(p->'organizations') = 'array'
        and o.name in (select jsonb_array_elements_text(p->'organizations'))
      order by o.name)),
    'gkk_role', portal_text(p->>'gkk_role', 80),
    'parish_role', (select pp.name from parish_positions pp where pp.name = portal_text(p->>'parish_role') limit 1))
  from s;
$$;

-- As in 0085, plus: a new member's fields carry portal_new_member_details().
-- Answers { ok, submittedAt, approved }.
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
      fields := portal_clean_member_fields(e, null) || portal_new_member_details(e);
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

-- As in 0054, plus: a new member is saved with the details, sacraments,
-- organizations and roles the family entered (an update sent before 0090
-- has none, so the member gets the usual blanks). Organizations and the
-- parish role are checked against the parish's lists again, as they may have
-- changed since the update was sent.
create or replace function public.census_approve_submission(p_id integer) returns integer
language plpgsql security definer set search_path = public as $$
declare
  staff_name text := census_staff_name();
  s census_submissions;
  bh jsonb;
  ph jsonb;
  e jsonb;
  bm jsonb;
  pf jsonb;
  mid integer;
  fam smallint;
  responses jsonb := '[]'::jsonb;
  saved integer := 0;
begin
  if staff_name is null then raise exception 'Only parish staff can approve online updates'; end if;
  select * into s from census_submissions where id = p_id for update;
  if s.id is null then raise exception 'Online update not found'; end if;
  if s.status <> 'Pending' then raise exception 'This online update was already reviewed'; end if;
  if not exists (select 1 from census_cycles where id = s.cycle_id and status = 'Open') then
    raise exception 'This census is closed. Reopen it to approve updates.';
  end if;

  perform census_take_snapshot(s.cycle_id, s.household_id);

  -- Household: only what the family changed.
  bh := s.before->'household';
  ph := s.proposed->'household';
  update households h set
    street   = case when ph->>'street'   is distinct from bh->>'street'   then coalesce(ph->>'street', h.street) else h.street end,
    barangay = case when ph->>'barangay' is distinct from bh->>'barangay' then coalesce(ph->>'barangay', h.barangay) else h.barangay end,
    city     = case when ph->>'city'     is distinct from bh->>'city'     then coalesce(ph->>'city', h.city) else h.city end,
    province = case when ph->>'province' is distinct from bh->>'province' then coalesce(ph->>'province', h.province) else h.province end,
    zip      = case when ph->>'zip'      is distinct from bh->>'zip'      then coalesce(ph->>'zip', h.zip) else h.zip end,
    contact  = case when ph->>'contact'  is distinct from bh->>'contact'  then ph->>'contact' else h.contact end,
    email    = case when ph->>'email'    is distinct from bh->>'email'    then ph->>'email' else h.email end
  where h.id = s.household_id;

  -- Existing members: only changed fields; members removed since are skipped.
  -- A family head stays a head (and a member never becomes one) here.
  for e in select * from jsonb_array_elements(s.proposed->'members') loop
    mid := (e->>'id')::integer;
    continue when not exists (select 1 from members where id = mid and household_id = s.household_id);
    bm := s.before->'members'->(mid::text);
    pf := e->'fields';
    update members m set
      first_name   = case when pf->>'first_name'   is distinct from bm->>'first_name'   then coalesce(pf->>'first_name', m.first_name) else m.first_name end,
      middle_name  = case when pf->>'middle_name'  is distinct from bm->>'middle_name'  then pf->>'middle_name' else m.middle_name end,
      last_name    = case when pf->>'last_name'    is distinct from bm->>'last_name'    then coalesce(pf->>'last_name', m.last_name) else m.last_name end,
      suffix       = case when pf->>'suffix'       is distinct from bm->>'suffix'       then pf->>'suffix' else m.suffix end,
      relationship = case when pf->>'relationship' is distinct from bm->>'relationship'
                           and coalesce(pf->>'relationship', '') not in ('Head of Household', 'Head of Family')
                           and coalesce(m.relationship, '') not in ('Head of Household', 'Head of Family')
                          then pf->>'relationship' else m.relationship end,
      sex          = case when pf->>'sex'          is distinct from bm->>'sex'          then pf->>'sex' else m.sex end,
      dob          = case when pf->>'dob'          is distinct from bm->>'dob'          then (pf->>'dob')::date else m.dob end,
      civil_status = case when pf->>'civil_status' is distinct from bm->>'civil_status' then pf->>'civil_status' else m.civil_status end,
      contact      = case when pf->>'contact'      is distinct from bm->>'contact'      then pf->>'contact' else m.contact end
    where m.id = mid;
    if e->>'status' is not null then
      responses := responses || jsonb_build_array(jsonb_build_object(
        'memberId', mid, 'status', e->>'status', 'participation', e->'participation', 'notes', e->>'notes'));
    end if;
  end loop;

  -- New members, into their family while it's still in the house.
  for e in select * from jsonb_array_elements(s.proposed->'newMembers') loop
    pf := e->'fields';
    continue when coalesce(pf->>'relationship', '') in ('Head of Household', 'Head of Family');
    fam := case when trim(coalesce(pf->>'family_no', '')) ~ '^\d{1,2}$' then (pf->>'family_no')::smallint else 1 end;
    if not exists (select 1 from members where household_id = s.household_id and family_no = fam) then fam := 1; end if;
    insert into members
      (household_id, family_no, first_name, middle_name, last_name, suffix, relationship, sex, dob, civil_status, contact,
       place_of_birth, tribe, email, occupation, religion,
       has_baptism, baptism_date, baptism_church,
       has_communion, communion_date, communion_church,
       has_confirmation, conf_date, conf_church, conf_name, conf_sponsor,
       has_matrimony, mat_date, mat_church, mat_type,
       organizations, gkk_role, parish_role)
    values
      (s.household_id, fam, pf->>'first_name', pf->>'middle_name', pf->>'last_name', pf->>'suffix', pf->>'relationship',
       pf->>'sex', (pf->>'dob')::date, pf->>'civil_status', pf->>'contact',
       pf->>'place_of_birth', pf->>'tribe', pf->>'email', pf->>'occupation', coalesce(pf->>'religion', 'Roman Catholic'),
       coalesce((pf->>'has_baptism')::boolean, false), (pf->>'baptism_date')::date, pf->>'baptism_church',
       coalesce((pf->>'has_communion')::boolean, false), (pf->>'communion_date')::date, pf->>'communion_church',
       coalesce((pf->>'has_confirmation')::boolean, false), (pf->>'conf_date')::date, pf->>'conf_church', pf->>'conf_name', pf->>'conf_sponsor',
       coalesce((pf->>'has_matrimony')::boolean, false), (pf->>'mat_date')::date, pf->>'mat_church', pf->>'mat_type',
       array(
         select o.name from organizations o
         where jsonb_typeof(pf->'organizations') = 'array'
           and o.name in (select jsonb_array_elements_text(pf->'organizations'))
         order by o.name),
       pf->>'gkk_role',
       (select pp.name from parish_positions pp where pp.name = pf->>'parish_role' limit 1))
    returning id into mid;
    if e->>'status' is not null then
      responses := responses || jsonb_build_array(jsonb_build_object(
        'memberId', mid, 'status', e->>'status', 'participation', e->'participation', 'notes', e->>'notes'));
    end if;
  end loop;

  if jsonb_array_length(responses) > 0 then
    saved := census_apply_responses(s.cycle_id, s.household_id, responses, 'Portal', auth.uid(), staff_name);
  end if;

  update census_submissions set status = 'Approved', reviewed_by = auth.uid(), reviewed_by_name = staff_name, reviewed_at = now()
  where id = p_id;
  return saved;
end;
$$;
