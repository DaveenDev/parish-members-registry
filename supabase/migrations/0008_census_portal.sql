-- Census family portal: during an open census, a family can open its own
-- record online with its reference number and the access code printed on
-- its census form, correct its details and answer the census. What the family
-- sends is only a proposal — staff review and approve it before anything in
-- the registry changes. Families get no accounts: the portal is a handful of
-- security-definer functions, and anon still has no table access.
-- Run after 0007_census.sql. Safe to re-run.

do $$
begin
  if to_regclass('public.census_cycles') is null then
    raise exception 'Run 0007_census.sql before this migration';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared census helpers (0007's census_record_household is rebuilt on top of
-- these so the portal approval writes answers exactly the same way)
-- ---------------------------------------------------------------------------

-- How the household looked before this census first changed it.
create or replace function public.census_take_snapshot(p_cycle_id integer, p_household_id integer) returns void
language sql security definer set search_path = public as $$
  insert into census_household_snapshots (cycle_id, household_id, snapshot)
  select p_cycle_id, h.id,
         to_jsonb(h) || jsonb_build_object('members', coalesce((
           select jsonb_agg(to_jsonb(m) order by m.id) from members m where m.household_id = h.id
         ), '[]'::jsonb))
  from households h where h.id = p_household_id
  on conflict (cycle_id, household_id) do nothing;
$$;

-- Validate then save census answers [{ memberId, status, participation, notes }]
-- for one household. Callers check who is calling and that the census is open.
create or replace function public.census_apply_responses(
  p_cycle_id integer, p_household_id integer, p_responses jsonb, p_source text, p_staff uuid, p_staff_name text
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  member_id_val integer;
  status_val text;
  participation_val jsonb;
  saved_count integer := 0;
begin
  for r in select * from jsonb_array_elements(p_responses) loop
    member_id_val := nullif(r->>'memberId', '')::integer;
    if member_id_val is null or not exists (select 1 from members where id = member_id_val and household_id = p_household_id) then
      raise exception 'A member in this census form is not in this household';
    end if;
    if not (coalesce(r->>'status', '') = any(census_member_statuses())) then
      raise exception 'Choose a status for every member you are confirming';
    end if;
  end loop;

  perform census_take_snapshot(p_cycle_id, p_household_id);

  for r in select * from jsonb_array_elements(p_responses) loop
    member_id_val := (r->>'memberId')::integer;
    status_val := r->>'status';
    participation_val := census_clean_participation(r->'participation');

    insert into census_member_responses
      (cycle_id, member_id, status, suggested_status, participation, source, notes, confirmed_by, confirmed_by_name, confirmed_at)
    values
      (p_cycle_id, member_id_val, status_val, census_suggest_status(participation_val), participation_val, p_source,
       left(nullif(trim(r->>'notes'), ''), 500), p_staff, p_staff_name, now())
    on conflict (cycle_id, member_id) do update set
      status = excluded.status,
      suggested_status = excluded.suggested_status,
      participation = excluded.participation,
      source = excluded.source,
      notes = excluded.notes,
      confirmed_by = excluded.confirmed_by,
      confirmed_by_name = excluded.confirmed_by_name,
      confirmed_at = excluded.confirmed_at;

    update members set membership_status = status_val, status_updated_at = now()
    where id = member_id_val and membership_status is distinct from status_val;

    saved_count := saved_count + 1;
  end loop;
  return saved_count;
end;
$$;

-- Same behaviour as in 0007, now sharing census_apply_responses.
create or replace function public.census_record_household(
  p_cycle_id integer,
  p_household_id integer,
  p_responses jsonb,
  p_source text default 'Paper',
  p_household_participation jsonb default null,
  p_help_ways jsonb default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  staff_name text := census_staff_name();
  cycle_status text;
  saved_count integer;
begin
  if staff_name is null then raise exception 'Only parish staff can record census answers'; end if;

  select status into cycle_status from census_cycles where id = p_cycle_id;
  if cycle_status is null then raise exception 'Census not found'; end if;
  if cycle_status <> 'Open' then raise exception 'This census is closed. Reopen it to record changes.'; end if;

  if not exists (select 1 from households where id = p_household_id) then
    raise exception 'Household not found';
  end if;
  if coalesce(p_source, '') not in ('Paper', 'Staff visit') then
    raise exception 'Choose where these answers came from';
  end if;
  if jsonb_typeof(p_responses) <> 'array' or jsonb_array_length(p_responses) = 0 then
    raise exception 'Choose a status for at least one member';
  end if;

  saved_count := census_apply_responses(p_cycle_id, p_household_id, p_responses, p_source, auth.uid(), staff_name);

  if jsonb_typeof(p_household_participation) = 'object' then
    update households set participation = census_clean_participation(p_household_participation) where id = p_household_id;
  end if;
  if jsonb_typeof(p_help_ways) = 'array' then
    update households set help_ways = coalesce((
      select array_agg(distinct x) from jsonb_array_elements_text(p_help_ways) x
      where x in ('sunday_mass', 'bible_service', 'devotions', 'meetings', 'pintakasi', 'financial')
    ), '{}')
    where id = p_household_id;
  end if;

  return saved_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access codes
--
-- 8 characters from the reference-number alphabet (no 0/O/1/I), printed as
-- XXXX-XXXX: 32^8 ≈ 10^12 combinations, and 5 wrong tries lock the
-- household for 15 minutes. Kept readable by staff (not hashed) so that
-- reprinting a GKK's forms shows the same code families already have; staff
-- can see every household's data anyway, and anon has no table access.
-- ---------------------------------------------------------------------------

create table if not exists household_access_codes (
  household_id    integer primary key references households(id) on delete cascade,
  code            text unique not null,
  issued_at       timestamptz not null default now(),
  issued_by       uuid references auth.users(id) on delete set null,
  failed_attempts integer not null default 0,
  locked_until    timestamptz
);

alter table household_access_codes enable row level security;
drop policy if exists "household_access_codes_admin_select" on household_access_codes;
create policy "household_access_codes_admin_select" on household_access_codes
  for select to authenticated using (true);
revoke all on household_access_codes from anon, authenticated;
grant select on household_access_codes to authenticated;

-- Uppercase, letters and digits only ("ab3k-77xq " → "AB3K77XQ").
create or replace function public.census_normalize_code(p text) returns text
language sql immutable as $$
  select upper(regexp_replace(coalesce(p, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- Random code from gen_random_uuid()'s bytes (a cryptographic source, unlike
-- random()). Bytes 0–5 and 10–11 of a v4 UUID are fully random; 256 is a
-- multiple of 32, so every character is equally likely.
create or replace function public.census_new_access_code() returns text
language plpgsql volatile as $$
declare
  alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  out_code text := '';
  i integer;
begin
  foreach i in array array[0, 1, 2, 3, 4, 5, 10, 11] loop
    out_code := out_code || substr(alphabet, 1 + (get_byte(bytes, i) % 32), 1);
  end loop;
  return out_code;
end;
$$;

-- Codes for these households, issuing one to any household that has none.
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
        insert into household_access_codes (household_id, code, issued_by) values (hid, census_new_access_code(), auth.uid());
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

-- A new code for a lost or leaked form; the old one stops working at once.
create or replace function public.census_reset_access_code(p_household_id integer) returns text
language plpgsql security definer set search_path = public as $$
declare
  new_code text;
  attempt integer := 0;
begin
  if census_staff_name() is null then raise exception 'Only parish staff can change access codes'; end if;
  if not exists (select 1 from households where id = p_household_id) then raise exception 'Household not found'; end if;
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

-- ---------------------------------------------------------------------------
-- Family submissions
--
-- `before` is what the editable fields held when the family submitted, so
-- approval only changes what the family actually changed — edits staff made
-- in the meantime are kept.
-- ---------------------------------------------------------------------------

create table if not exists census_submissions (
  id               serial primary key,
  cycle_id         integer not null references census_cycles(id) on delete cascade,
  household_id     integer not null references households(id) on delete cascade,
  before           jsonb not null,
  proposed         jsonb not null,
  message          text,
  status           text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  submitted_at     timestamptz not null default now(),
  reviewed_by      uuid references auth.users(id) on delete set null,
  reviewed_by_name text,
  reviewed_at      timestamptz,
  review_note      text
);

-- One pending update per household per census; sending again replaces it.
create unique index if not exists census_submissions_one_pending
  on census_submissions (cycle_id, household_id) where status = 'Pending';

alter table census_submissions enable row level security;
drop policy if exists "census_submissions_admin_select" on census_submissions;
create policy "census_submissions_admin_select" on census_submissions
  for select to authenticated using (true);
revoke all on census_submissions from anon, authenticated;
grant select on census_submissions to authenticated;

-- The fields a family may correct, as stored (dates as yyyy-mm-dd text).
create or replace function public.portal_household_fields(h households) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'street', h.street, 'barangay', h.barangay, 'city', h.city, 'province', h.province, 'zip', h.zip,
    'contact', h.contact, 'email', h.email);
$$;

create or replace function public.portal_member_fields(m members) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'first_name', m.first_name, 'middle_name', m.middle_name, 'last_name', m.last_name, 'suffix', m.suffix,
    'relationship', m.relationship, 'sex', m.sex, 'dob', m.dob::text, 'civil_status', m.civil_status,
    'contact', m.contact);
$$;

-- Trimmed, length-capped text; '' becomes null.
create or replace function public.portal_text(p text, max_len integer default 200) returns text
language sql immutable as $$
  select left(nullif(trim(p), ''), max_len);
$$;

-- A plausible yyyy-mm-dd birth date, else null.
create or replace function public.portal_date(p text) returns date
language plpgsql immutable as $$
declare d date;
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  d := p::date;
  if d < date '1900-01-01' or d > current_date then return null; end if;
  return d;
exception when others then
  return null;
end;
$$;

-- Clean one member's proposed fields. A value the portal cannot accept
-- (an unknown relationship, a bad date…) falls back to `fallback` — the value
-- on record for an existing member, null for a new one.
create or replace function public.portal_clean_member_fields(p jsonb, fallback jsonb) returns jsonb
language plpgsql stable as $$
declare
  rel text := portal_text(p->>'relationship');
  sex_val text := portal_text(p->>'sex');
  civil text := portal_text(p->>'civil_status');
  dob_val date := portal_date(p->>'dob');
  pick text;
begin
  fallback := coalesce(fallback, '{}'::jsonb);
  if rel is null or rel not in ('Head of Household', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Grandfather',
                                'Grandmother', 'Grandchild', 'Sibling', 'In-law', 'Household Helper', 'Other') then
    rel := fallback->>'relationship';
  end if;
  if sex_val is null or sex_val not in ('Male', 'Female') then sex_val := fallback->>'sex'; end if;
  if civil is null or civil not in ('Single', 'Married', 'Live-in', 'Widowed', 'Separated') then civil := fallback->>'civil_status'; end if;
  return jsonb_build_object(
    'first_name', coalesce(portal_text(p->>'first_name', 80), fallback->>'first_name'),
    'middle_name', case when p ? 'middle_name' then portal_text(p->>'middle_name', 80) else fallback->>'middle_name' end,
    'last_name', coalesce(portal_text(p->>'last_name', 80), fallback->>'last_name'),
    'suffix', case when p ? 'suffix' then portal_text(p->>'suffix', 20) else fallback->>'suffix' end,
    'relationship', rel,
    'sex', sex_val,
    'dob', coalesce(dob_val::text, fallback->>'dob'),
    'civil_status', civil,
    'contact', case when p ? 'contact' then portal_text(p->>'contact', 60) else fallback->>'contact' end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Portal (anon)
-- ---------------------------------------------------------------------------

create or replace function public.portal_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('open', true, 'label', label) from census_cycles where status = 'Open'),
    jsonb_build_object('open', false));
$$;

-- Check a reference number + code. Returns { ok, householdId } or
-- { ok: false, error: 'closed' | 'invalid' | 'locked' }. It returns instead of
-- raising so the failed-attempt counter is saved even when the code is wrong.
-- An unknown reference number and a wrong code give the same answer.
create or replace function public.portal_check(p_ref text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  hid integer;
  ac household_access_codes;
begin
  if not exists (select 1 from census_cycles where status = 'Open') then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  select id into hid from households where upper(ref_no) = upper(trim(coalesce(p_ref, '')));
  if hid is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into ac from household_access_codes where household_id = hid for update;
  if ac.household_id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if ac.locked_until is not null and ac.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;

  if ac.code <> census_normalize_code(p_code) then
    update household_access_codes set
      failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
      locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
    where household_id = hid;
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  update household_access_codes set failed_attempts = 0, locked_until = null
  where household_id = hid and (failed_attempts <> 0 or locked_until is not null);
  return jsonb_build_object('ok', true, 'householdId', hid);
end;
$$;

-- The household's record for the portal form: its correctable details, its
-- current members, and the census answers so far (from a pending update if
-- the family already sent one, else from staff entries in this census).
create or replace function public.portal_open(p_ref text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  chk jsonb := portal_check(p_ref, p_code);
  hid integer;
  cyc census_cycles;
  h households;
  pend census_submissions;
  members_json jsonb;
begin
  if not (chk->>'ok')::boolean then return chk; end if;
  hid := (chk->>'householdId')::integer;
  select * into cyc from census_cycles where status = 'Open';
  select * into h from households where id = hid;
  select * into pend from census_submissions where cycle_id = cyc.id and household_id = hid and status = 'Pending';

  select coalesce(jsonb_agg(
    jsonb_build_object('id', m.id)
    || coalesce(pm->'fields', portal_member_fields(m))
    || jsonb_build_object(
         'has_baptism', m.has_baptism, 'has_communion', m.has_communion,
         'has_confirmation', m.has_confirmation, 'has_matrimony', m.has_matrimony,
         'status', case when pend.id is not null then pm->>'status' else r.status end,
         'participation', case when pend.id is not null then coalesce(pm->'participation', '{}'::jsonb) else coalesce(r.participation, '{}'::jsonb) end,
         'notes', case when pend.id is not null then pm->>'notes' else r.notes end)
    order by m.id), '[]'::jsonb)
  into members_json
  from members m
  left join census_member_responses r on r.member_id = m.id and r.cycle_id = cyc.id
  left join lateral (
    select e from jsonb_array_elements(coalesce(pend.proposed->'members', '[]'::jsonb)) e
    where (e->>'id')::integer = m.id limit 1
  ) as x(pm) on true
  where m.household_id = hid
    and (r.member_id is not null or coalesce(m.membership_status not in ('Moved away', 'Deceased'), true));

  return jsonb_build_object(
    'ok', true,
    'cycle', jsonb_build_object('label', cyc.label),
    'household', jsonb_build_object('household_name', h.household_name, 'ref_no', h.ref_no, 'gkk', h.gkk)
                 || coalesce(pend.proposed->'household', portal_household_fields(h)),
    'members', members_json,
    'newMembers', coalesce(pend.proposed->'newMembers', '[]'::jsonb),
    'message', pend.message,
    'pending', case when pend.id is null then null else jsonb_build_object('submittedAt', pend.submitted_at) end
  );
end;
$$;

-- Save the family's update as a pending proposal for staff to review.
-- payload: { household: {street…email}, members: [{ id, first_name…contact,
-- status, participation, notes }], newMembers: [{ first_name…, status,
-- participation, notes }], message, consent }
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
      fields := portal_clean_member_fields(e, null);
      if fields->>'first_name' is null or fields->>'last_name' is null then raise exception 'Member first and last name are required'; end if;
      if fields->>'relationship' is null then raise exception 'Member relationship is required'; end if;
      if fields->>'relationship' = 'Head of Household' then raise exception 'A new member cannot be the Household Head'; end if;
      status_val := e->>'status';
      if status_val is not null and not (status_val = any(census_member_statuses())) then status_val := null; end if;
      new_out := new_out || jsonb_build_array(jsonb_build_object(
        'fields', fields, 'status', status_val,
        'participation', census_clean_participation(e->'participation'),
        'notes', portal_text(e->>'notes', 500)));
    end loop;
  end if;

  delete from census_submissions where cycle_id = cyc_id and household_id = hid and status = 'Pending';
  insert into census_submissions (cycle_id, household_id, before, proposed, message)
  values (cyc_id, hid, before_json,
          jsonb_build_object('household', hh_out, 'members', members_out, 'newMembers', new_out),
          portal_text(p_payload->>'message', 1000))
  returning submitted_at into saved_at;

  return jsonb_build_object('ok', true, 'submittedAt', saved_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff review
-- ---------------------------------------------------------------------------

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
      relationship = case when pf->>'relationship' is distinct from bm->>'relationship' then pf->>'relationship' else m.relationship end,
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

  -- New members.
  for e in select * from jsonb_array_elements(s.proposed->'newMembers') loop
    pf := e->'fields';
    insert into members (household_id, first_name, middle_name, last_name, suffix, relationship, sex, dob, civil_status, contact)
    values (s.household_id, pf->>'first_name', pf->>'middle_name', pf->>'last_name', pf->>'suffix', pf->>'relationship',
            pf->>'sex', (pf->>'dob')::date, pf->>'civil_status', pf->>'contact')
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

create or replace function public.census_reject_submission(p_id integer, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare staff_name text := census_staff_name();
begin
  if staff_name is null then raise exception 'Only parish staff can reject online updates'; end if;
  update census_submissions set status = 'Rejected', reviewed_by = auth.uid(), reviewed_by_name = staff_name,
    reviewed_at = now(), review_note = portal_text(p_note, 500)
  where id = p_id and status = 'Pending';
  if not found then raise exception 'This online update was already reviewed'; end if;
end;
$$;

-- 0007's progress list, plus whether an online update is waiting for review.
drop function if exists public.census_household_progress(integer);
create function public.census_household_progress(p_cycle_id integer)
returns table (
  household_id integer, household_name text, ref_no text, gkk text, head_name text,
  members_expected integer, members_confirmed integer, progress text, pending_update boolean
)
language sql stable as $$
  with per as (
    select h.id, h.household_name, h.ref_no, h.gkk,
      (select concat_ws(' ', m.first_name, m.last_name, nullif(m.suffix, ''))
         from members m where m.household_id = h.id and m.relationship = 'Head of Household'
        order by m.id limit 1) as head_name,
      count(m.id) filter (where r.member_id is not null or coalesce(m.membership_status not in ('Moved away', 'Deceased'), true))::int as expected,
      count(r.member_id)::int as confirmed
    from households h
    left join members m on m.household_id = h.id
    left join census_member_responses r on r.member_id = m.id and r.cycle_id = p_cycle_id
    group by h.id
  )
  select id, household_name, ref_no, gkk, head_name, expected, confirmed,
    case when confirmed = 0 then 'Not started'
         when confirmed >= expected then 'Confirmed'
         else 'Partly confirmed' end,
    exists (select 1 from census_submissions s where s.household_id = per.id and s.cycle_id = p_cycle_id and s.status = 'Pending')
  from per;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Internal helpers are callable only from the functions above.
-- ---------------------------------------------------------------------------

revoke execute on function public.census_take_snapshot(integer, integer) from public, anon, authenticated;
revoke execute on function public.census_apply_responses(integer, integer, jsonb, text, uuid, text) from public, anon, authenticated;
revoke execute on function public.census_new_access_code() from public, anon, authenticated;
revoke execute on function public.portal_check(text, text) from public, anon, authenticated;
revoke execute on function public.census_access_codes(integer[]) from public, anon;
revoke execute on function public.census_reset_access_code(integer) from public, anon;
revoke execute on function public.census_approve_submission(integer) from public, anon;
revoke execute on function public.census_reject_submission(integer, text) from public, anon;

grant execute on function public.census_record_household(integer, integer, jsonb, text, jsonb, jsonb) to authenticated;
grant execute on function public.census_access_codes(integer[]) to authenticated;
grant execute on function public.census_reset_access_code(integer) to authenticated;
grant execute on function public.census_approve_submission(integer) to authenticated;
grant execute on function public.census_reject_submission(integer, text) to authenticated;
grant execute on function public.census_household_progress(integer) to authenticated;
grant execute on function public.census_normalize_code(text) to anon, authenticated;
grant execute on function public.portal_status() to anon, authenticated;
grant execute on function public.portal_open(text, text) to anon, authenticated;
grant execute on function public.portal_submit(text, text, jsonb) to anon, authenticated;
