-- Possible duplicates: merge two records of the same person, and take back
-- a "Not duplicates". Also fixes restoring a member from the Trash, which
-- lost their blood type. Run after 0073_sacrament_request_member.sql. Safe
-- to re-run.
--
--   * merge_members(keep, other): the kept record gets what it lacks from
--     the other one (blank details, sacraments, ministries and
--     organizations, blood type, sacrament verifications, census answers)
--     and every request, donor entry and org chart place linked to the
--     other one; the other record then goes to the Trash. Full access only,
--     like deleting a member.
--   * undismiss_duplicate_group: a group marked "Not duplicates" shows on
--     the Duplicates page again. Same rules as dismissing one (0050).
--   * The Trash keeps a member's blood type (member_blood_types, 0062) and
--     their sacrament request links, so restoring puts them back.

do $$
begin
  if to_regprocedure('public.restore_deleted(bigint)') is null or to_regclass('public.member_blood_types') is null
     or to_regprocedure('public.members_in_leader_gkk(integer[])') is null then
    raise exception 'Run the migrations up to 0064_household_gkk_link.sql before this one';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'sacrament_requests' and column_name = 'member_id') then
    raise exception 'Run 0073_sacrament_request_member.sql before this migration';
  end if;
end;
$$;

-- ---- the Trash ----------------------------------------------------------------

-- As in 0014, plus blood types and sacrament request links.
create or replace function public.trash_snapshot(p_household_ids integer[], p_member_ids integer[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'households', (select coalesce(jsonb_agg(to_jsonb(h) order by h.id), '[]') from households h where h.id = any(p_household_ids)),
    'members', (select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]') from members m where m.id = any(p_member_ids)),
    'member_blood_types', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from member_blood_types b where b.member_id = any(p_member_ids)),
    'sacrament_verifications', (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from sacrament_verifications v where v.member_id = any(p_member_ids)),
    'census_member_responses', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from census_member_responses r where r.member_id = any(p_member_ids)),
    'census_household_snapshots', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from census_household_snapshots s where s.household_id = any(p_household_ids)),
    'census_submissions', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from census_submissions s where s.household_id = any(p_household_ids)),
    'household_access_codes', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from household_access_codes c where c.household_id = any(p_household_ids)),
    'certificate_links', (select coalesce(jsonb_agg(jsonb_build_array(c.id, c.member_id)), '[]') from certificate_requests c where c.member_id = any(p_member_ids)),
    'donor_links', (select coalesce(jsonb_agg(jsonb_build_array(d.id, d.member_id)), '[]') from blood_donors d where d.member_id = any(p_member_ids)),
    'sacrament_request_links', (select coalesce(jsonb_agg(jsonb_build_array(s.id, s.member_id)), '[]') from sacrament_requests s where s.member_id = any(p_member_ids))
  );
$$;

-- As in 0064, plus relinking sacrament requests.
create or replace function public.restore_deleted(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r deleted_records;
  d jsonb;
  hid integer;
  taken text;
  gone_gkk text;
begin
  perform require_full_access('restore deleted records');
  select * into r from deleted_records where id = p_id;
  if r.id is null then raise exception 'This item is no longer in the trash'; end if;
  d := r.data;

  if r.kind = 'household' then
    select household_name into taken from households
    where lower(trim(household_name)) = lower(trim(d -> 'households' -> 0 ->> 'household_name'));
    if taken is not null then
      raise exception 'Another household is now called “%”. Rename it, then restore this one.', taken;
    end if;
    gone_gkk := d -> 'households' -> 0 ->> 'gkk';
    if gone_gkk is not null and not exists (select 1 from gkks where name = gone_gkk) then
      raise exception 'This household was in “%”, which is no longer in the GKK list. Add that GKK back in Parish Config → Parish GKK, restore the household, then move it to its GKK.', gone_gkk;
    end if;
  else
    hid := (d -> 'members' -> 0 ->> 'household_id')::integer;
    if not exists (select 1 from households where id = hid) then
      raise exception 'This member''s household isn''t in the registry any more. Restore the household first.';
    end if;
  end if;

  perform set_config('app.audit_skip', 'on', true);
  perform set_config('app.restoring', 'on', true);
  insert into households select * from jsonb_populate_recordset(null::households, d -> 'households');
  insert into members select * from jsonb_populate_recordset(null::members, d -> 'members');
  -- Blood types: their own list (0062), or inside the member rows of items trashed before 0062.
  insert into member_blood_types (member_id, blood_type)
  select (x ->> 'member_id')::integer, x ->> 'blood_type' from jsonb_array_elements(coalesce(d -> 'member_blood_types', '[]')) x
  union
  select (x ->> 'id')::integer, x ->> 'blood_type' from jsonb_array_elements(coalesce(d -> 'members', '[]')) x
  where coalesce(x ->> 'blood_type', '') <> ''
  on conflict (member_id) do nothing;
  insert into sacrament_verifications select * from jsonb_populate_recordset(null::sacrament_verifications, d -> 'sacrament_verifications');
  insert into census_member_responses select * from jsonb_populate_recordset(null::census_member_responses, d -> 'census_member_responses');
  insert into census_household_snapshots select * from jsonb_populate_recordset(null::census_household_snapshots, d -> 'census_household_snapshots');
  insert into census_submissions select * from jsonb_populate_recordset(null::census_submissions, d -> 'census_submissions');
  insert into household_access_codes select * from jsonb_populate_recordset(null::household_access_codes, d -> 'household_access_codes');
  update certificate_requests c set member_id = (x ->> 1)::integer
  from jsonb_array_elements(d -> 'certificate_links') x
  where c.id = (x ->> 0)::integer and c.member_id is null;
  update blood_donors b set member_id = (x ->> 1)::integer
  from jsonb_array_elements(d -> 'donor_links') x
  where b.id = (x ->> 0)::integer and b.member_id is null;
  update sacrament_requests s set member_id = (x ->> 1)::integer
  from jsonb_array_elements(coalesce(d -> 'sacrament_request_links', '[]')) x
  where s.id = (x ->> 0)::integer and s.member_id is null;
  perform set_config('app.restoring', 'off', true);
  perform set_config('app.audit_skip', 'off', true);

  insert into activity_log (actor, actor_name, action, table_name, record_id, household_id, member_id, label)
  values (auth.uid(), current_staff_name(), 'restore', case r.kind when 'household' then 'households' else 'members' end,
          r.record_id::text, coalesce(hid, r.record_id), case when r.kind = 'member' then r.record_id end, r.label);
  delete from deleted_records where id = p_id;
  return jsonb_build_object('kind', r.kind, 'record_id', r.record_id, 'household_id', coalesce(hid, r.record_id));
end;
$$;

-- ---- merging two records -----------------------------------------------------------

do $$
begin
  alter table activity_log drop constraint if exists activity_log_action_check;
  alter table activity_log add constraint activity_log_action_check
    check (action in ('insert', 'update', 'delete', 'trash', 'restore', 'merge'));
end;
$$;

/**
 * Merge p_other into p_keep (two records of one person) and move p_other to
 * the Trash. Returns the trash entry's id.
 */
create or replace function public.merge_members(p_keep integer, p_other integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  k members;
  o members;
  trash_id bigint;
  other_label text;
  other_household text;
begin
  perform require_full_access('merge members');
  if p_keep is null or p_other is null or p_keep = p_other then raise exception 'Choose two different members'; end if;
  select * into k from members where id = p_keep for update;
  select * into o from members where id = p_other for update;
  if k.id is null or o.id is null then raise exception 'One of these members is no longer in the registry'; end if;
  other_label := concat_ws(' ', o.first_name, o.last_name, o.suffix);
  select household_name into other_household from households where id = o.household_id;

  -- 1. Blanks on the kept record from the other one; a sacrament either
  --    record has counts, and the two sets of groups are joined.
  update members set
    middle_name      = coalesce(nullif(trim(k.middle_name), ''), o.middle_name),
    suffix           = coalesce(nullif(trim(k.suffix), ''), o.suffix),
    sex              = coalesce(nullif(trim(k.sex), ''), o.sex),
    place_of_birth   = coalesce(nullif(trim(k.place_of_birth), ''), o.place_of_birth),
    civil_status     = coalesce(nullif(trim(k.civil_status), ''), o.civil_status),
    contact          = coalesce(nullif(trim(k.contact), ''), o.contact),
    email            = coalesce(nullif(trim(k.email), ''), o.email),
    occupation       = coalesce(nullif(trim(k.occupation), ''), o.occupation),
    religion         = coalesce(nullif(trim(k.religion), ''), o.religion),
    tribe            = coalesce(nullif(trim(k.tribe), ''), o.tribe),
    gkk_role         = coalesce(nullif(trim(k.gkk_role), ''), o.gkk_role),
    parish_role      = coalesce(nullif(trim(k.parish_role), ''), o.parish_role),
    membership_status = coalesce(k.membership_status, o.membership_status),
    has_baptism      = k.has_baptism or o.has_baptism,
    baptism_date     = coalesce(k.baptism_date, o.baptism_date),
    baptism_church   = coalesce(nullif(trim(k.baptism_church), ''), o.baptism_church),
    has_communion    = k.has_communion or o.has_communion,
    communion_date   = coalesce(k.communion_date, o.communion_date),
    communion_church = coalesce(nullif(trim(k.communion_church), ''), o.communion_church),
    has_confirmation = k.has_confirmation or o.has_confirmation,
    conf_date        = coalesce(k.conf_date, o.conf_date),
    conf_church      = coalesce(nullif(trim(k.conf_church), ''), o.conf_church),
    conf_name        = coalesce(nullif(trim(k.conf_name), ''), o.conf_name),
    conf_sponsor     = coalesce(nullif(trim(k.conf_sponsor), ''), o.conf_sponsor),
    has_matrimony    = k.has_matrimony or o.has_matrimony,
    mat_date         = coalesce(k.mat_date, o.mat_date),
    mat_church       = coalesce(nullif(trim(k.mat_church), ''), o.mat_church),
    mat_type         = coalesce(nullif(trim(k.mat_type), ''), o.mat_type),
    ministries       = array(select distinct x from unnest(coalesce(k.ministries, '{}') || coalesce(o.ministries, '{}')) x order by x),
    organizations    = array(select distinct x from unnest(coalesce(k.organizations, '{}') || coalesce(o.organizations, '{}')) x order by x)
  where id = p_keep;

  -- 2. What hangs off the other record, where the kept one has none of its own.
  insert into member_blood_types (member_id, blood_type)
  select p_keep, blood_type from member_blood_types where member_id = p_other
  on conflict (member_id) do nothing;
  update sacrament_verifications set member_id = p_keep
  where member_id = p_other and sacrament not in (select sacrament from sacrament_verifications where member_id = p_keep);
  update census_member_responses set member_id = p_keep
  where member_id = p_other and cycle_id not in (select cycle_id from census_member_responses where member_id = p_keep);
  update certificate_requests set member_id = p_keep where member_id = p_other;
  update sacrament_requests set member_id = p_keep where member_id = p_other;
  update blood_donors set member_id = p_keep where member_id = p_other;
  if to_regclass('public.org_nodes') is not null then
    update org_nodes set member_id = p_keep where member_id = p_other;
    update org_gkk_holders set member_id = p_keep where member_id = p_other;
  end if;

  -- 3. The other record to the Trash (restorable for 30 days, as a bare record).
  trash_id := trash_member(p_other);

  insert into activity_log (actor, actor_name, action, table_name, record_id, household_id, member_id, label, changes)
  values (auth.uid(), current_staff_name(), 'merge', 'members', p_keep::text, k.household_id, p_keep,
          concat_ws(' ', k.first_name, k.last_name),
          jsonb_build_object('merged', other_label, 'household', other_household));
  return trash_id;
end;
$$;

revoke all on function public.merge_members(integer, integer) from public, anon;
grant execute on function public.merge_members(integer, integer) to authenticated;

-- ---- taking back "Not duplicates" ----------------------------------------------------

create or replace function public.undismiss_duplicate_group(p_member_ids integer[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  ids integer[];
begin
  if current_staff_name() is null then raise exception 'Only parish staff can change possible duplicates'; end if;
  select array_agg(distinct x order by x) into ids from unnest(p_member_ids) as x where x is not null;
  if staff_access() in ('read_only', 'website') then
    raise exception 'Your account can view records but not change them' using errcode = '42501';
  end if;
  if staff_access() = 'gkk_leader' and not members_in_leader_gkk(ids) then
    raise exception 'Your account can only review the members of %', staff_gkk() using errcode = '42501';
  end if;
  delete from duplicate_dismissals where member_ids = ids;
end;
$$;

revoke all on function public.undismiss_duplicate_group(integer[]) from public, anon;
grant execute on function public.undismiss_duplicate_group(integer[]) to authenticated;
