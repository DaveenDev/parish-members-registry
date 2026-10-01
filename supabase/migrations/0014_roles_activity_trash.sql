-- Staff access levels, an activity log, a trash for deleted households and
-- members, and the sidebar counts. Run after 0013_public_site.sql.
-- Safe to re-run.
--
-- Access levels (profiles.access). Every account that exists when this runs
-- keeps full access, so nothing changes until a staff admin picks another
-- level under Settings → Staff.
--   full        everything, as before
--   read_only   sees everything, changes nothing
--   gkk_leader  sees and updates the households and members of one GKK
--               (profiles.access_gkk); can't delete, and sees no requests,
--               website content, census admin, activity or trash
--   website     manages the Parish Website and the Requests queues, and can
--               look up (not change) registry records to match requests
--
-- Reads are limited with row level security. Writes are checked by a
-- BEFORE trigger on each table, so a refused change fails with a clear
-- message (an RLS-filtered UPDATE would silently change nothing), and the
-- check also covers the SECURITY DEFINER functions (census, sacrament
-- verification) that bypass RLS. Calls with no signed-in user (the public
-- registration and census portal functions, the service-role seed script)
-- are not affected: those functions do their own checks.

do $$
begin
  if to_regclass('public.certificate_requests') is null or to_regprocedure('public.public_office_details()') is null then
    raise exception 'Run 0012_requests.sql and 0013_public_site.sql before this migration';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Access levels
-- ---------------------------------------------------------------------------

alter table profiles add column if not exists access text not null default 'full';
alter table profiles add column if not exists access_gkk text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_access_check') then
    alter table profiles add constraint profiles_access_check
      check (access in ('full', 'read_only', 'gkk_leader', 'website'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_access_gkk_check') then
    alter table profiles add constraint profiles_access_gkk_check
      check (access <> 'gkk_leader' or coalesce(trim(access_gkk), '') <> '');
  end if;
end;
$$;

-- The signed-in account's access level. A signed-in account without a
-- profile row counts as full access, as every signed-in account did before.
-- Null when nobody is signed in.
create or replace function public.staff_access() returns text
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null
              else coalesce((select access from profiles where id = auth.uid()), 'full') end;
$$;

create or replace function public.staff_gkk() returns text
language sql stable security definer set search_path = public as $$
  select access_gkk from profiles where id = auth.uid() and access = 'gkk_leader';
$$;

/** True when the signed-in account may see `area` ('registry', 'requests', 'activity', 'trash'). */
create or replace function public.staff_can_see(area text) returns boolean
language sql stable set search_path = public as $$
  select case staff_access()
    when 'full' then true
    when 'read_only' then area in ('registry', 'requests', 'activity')
    when 'website' then area in ('registry', 'requests')
    else false
  end;
$$;

/** True when a household in GKK `gkk` is visible to the signed-in account. */
create or replace function public.staff_sees_gkk(gkk text) returns boolean
language sql stable set search_path = public as $$
  select staff_can_see('registry') or (staff_access() = 'gkk_leader' and gkk = staff_gkk());
$$;

-- Write guard. TG_ARGV[0] is the table's area:
--   registry      households, members (GKK leaders: their GKK, no deletes)
--   verification  sacrament verifications (GKK leaders may only lose one,
--                 when they untick a sacrament on a member of their GKK)
--   website       website content and parish office details
--   requests      certificate, prayer and blood requests, blood donors
--   gkks          the GKK list (website editors may edit a GKK's page,
--                 not rename, add or delete GKKs)
--   admin         everything else: lists, census, duplicates
create or replace function public.guard_staff_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  acc text := staff_access();
  area text := tg_argv[0];
  mine text := staff_gkk();
  ok boolean := false;
begin
  if acc is null or acc = 'full' then
    ok := true;
  elsif acc = 'website' then
    ok := area in ('website', 'requests');
    -- (nested, since only gkks rows have a name to compare)
    if area = 'gkks' and tg_op = 'UPDATE' then
      ok := new.name = old.name;
    end if;
  elsif acc = 'gkk_leader' and area = 'registry' and tg_op <> 'DELETE' then
    if tg_table_name = 'households' then
      ok := new.gkk = mine and (tg_op = 'INSERT' or old.gkk = mine);
    else
      ok := exists (select 1 from households h where h.id = new.household_id and h.gkk = mine)
        and (tg_op = 'INSERT' or exists (select 1 from households h where h.id = old.household_id and h.gkk = mine));
    end if;
    if not ok then
      raise exception 'Your account can only change households in %', mine using errcode = '42501';
    end if;
  elsif acc = 'gkk_leader' and area = 'verification' and tg_op = 'DELETE' then
    ok := exists (select 1 from members m join households h on h.id = m.household_id
                  where m.id = old.member_id and h.gkk = mine);
  end if;

  if not ok then
    raise exception '%', case acc
      when 'read_only' then 'Your account can view records but not change them'
      when 'gkk_leader' then 'Your account can only update the households and members of your GKK'
      else 'Your account can''t change this. Ask a staff admin.'
    end using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare
  t record;
begin
  for t in select * from (values
    ('households', 'registry'), ('members', 'registry'),
    ('sacrament_verifications', 'verification'),
    ('announcements', 'website'), ('articles', 'website'), ('bulletins', 'website'), ('events', 'website'),
    ('mass_schedules', 'website'), ('sacrament_guides', 'website'), ('parish_settings', 'website'),
    ('certificate_requests', 'requests'), ('prayer_requests', 'requests'), ('blood_requests', 'requests'),
    ('blood_request_contacts', 'requests'), ('blood_donors', 'requests'),
    ('gkks', 'gkks'),
    ('ministries', 'admin'), ('organizations', 'admin'), ('parish_positions', 'admin'),
    ('duplicate_dismissals', 'admin'), ('census_cycles', 'admin'), ('census_member_responses', 'admin'),
    ('census_submissions', 'admin'), ('census_household_snapshots', 'admin'), ('household_access_codes', 'admin')
  ) as x(tbl, area) loop
    -- "trg_00_" so it runs before the table's other BEFORE triggers.
    execute format('drop trigger if exists trg_00_guard_staff_write on %I', t.tbl);
    execute format('create trigger trg_00_guard_staff_write before insert or update or delete on %I
                    for each row execute function guard_staff_write(%L)', t.tbl, t.area);
  end loop;
end;
$$;

-- Read policies. Each table keeps one policy for authenticated users; it
-- now limits which rows they see (and so which rows they can try to
-- change; the trigger above decides whether the change is allowed).
do $$
declare
  t record;
begin
  for t in select * from (values
    -- table, old policy name, rows visible
    ('households', 'households_admin_all', 'staff_sees_gkk(gkk)'),
    ('members', 'members_admin_all', 'staff_can_see(''registry'') or exists (select 1 from households h where h.id = household_id and staff_sees_gkk(h.gkk))'),
    ('certificate_requests', 'certificate_requests_admin_all', 'staff_can_see(''requests'')'),
    ('prayer_requests', 'prayer_requests_admin_all', 'staff_can_see(''requests'')'),
    ('blood_requests', 'blood_requests_admin_all', 'staff_can_see(''requests'')'),
    ('blood_request_contacts', 'blood_request_contacts_admin_all', 'staff_can_see(''requests'')'),
    ('blood_donors', 'blood_donors_admin_all', 'staff_can_see(''requests'')')
  ) as x(tbl, pol, rule) loop
    execute format('drop policy if exists %I on %I', t.pol, t.tbl);
    execute format('create policy %I on %I for all to authenticated using (%s) with check (true)', t.pol, t.tbl, t.rule);
  end loop;

  for t in select * from (values
    ('sacrament_verifications', 'sacrament_verifications_admin_select',
     'staff_can_see(''registry'') or exists (select 1 from members m join households h on h.id = m.household_id where m.id = member_id and staff_sees_gkk(h.gkk))'),
    ('census_household_snapshots', 'census_household_snapshots_admin_select', 'staff_can_see(''registry'')'),
    ('census_member_responses', 'census_member_responses_admin_select', 'staff_can_see(''registry'')'),
    ('census_submissions', 'census_submissions_admin_select', 'staff_can_see(''registry'')'),
    ('household_access_codes', 'household_access_codes_admin_select', 'staff_access() = ''full'''),
    ('duplicate_dismissals', 'duplicate_dismissals_admin_select', 'staff_can_see(''registry'')')
  ) as x(tbl, pol, rule) loop
    execute format('drop policy if exists %I on %I', t.pol, t.tbl);
    execute format('create policy %I on %I for select to authenticated using (%s)', t.pol, t.tbl, t.rule);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Activity log: who changed which household or member, and what changed.
-- ---------------------------------------------------------------------------

create table if not exists activity_log (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  actor        uuid references auth.users(id) on delete set null,
  actor_name   text,           -- null: the family, online (registration or census portal)
  action       text not null check (action in ('insert', 'update', 'delete', 'trash', 'restore')),
  table_name   text not null,
  record_id    text,
  household_id integer,        -- no foreign keys: the log outlives the records
  member_id    integer,
  label        text,           -- household or member name at the time
  changes      jsonb           -- update: { column: [old, new] }; trash/restore: a summary
);
create index if not exists activity_log_at_idx on activity_log (at desc);
create index if not exists activity_log_household_idx on activity_log (household_id, at desc);
create index if not exists activity_log_member_idx on activity_log (member_id, at desc);

alter table activity_log enable row level security;
drop policy if exists activity_log_staff_select on activity_log;
create policy activity_log_staff_select on activity_log for select to authenticated using (staff_can_see('activity'));
revoke insert, update, delete on activity_log from anon, authenticated;
grant select on activity_log to authenticated;

create or replace function public.log_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  old_j jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_j jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  rec jsonb := coalesce(new_j, old_j);
  diff jsonb := '{}'::jsonb;
  k text;
  hid integer;
  mid integer;
  lbl text;
begin
  -- Trash and restore write one summary entry of their own.
  if coalesce(current_setting('app.audit_skip', true), '') = 'on' then return null; end if;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(new_j) loop
      continue when k in ('updated_at', 'status_updated_at');
      if new_j -> k is distinct from old_j -> k then
        diff := diff || jsonb_build_object(k, jsonb_build_array(old_j -> k, new_j -> k));
      end if;
    end loop;
    if diff = '{}'::jsonb then return null; end if;
  end if;

  if tg_table_name = 'households' then
    hid := (rec ->> 'id')::integer;
    lbl := rec ->> 'household_name';
  elsif tg_table_name = 'members' then
    mid := (rec ->> 'id')::integer;
    hid := (rec ->> 'household_id')::integer;
    lbl := concat_ws(' ', rec ->> 'first_name', rec ->> 'last_name');
  else -- sacrament_verifications
    mid := (rec ->> 'member_id')::integer;
    select m.household_id, concat_ws(' ', m.first_name, m.last_name) into hid, lbl from members m where m.id = mid;
    diff := jsonb_build_object('sacrament', rec ->> 'sacrament', 'source', rec ->> 'source', 'reference', rec ->> 'reference');
  end if;

  insert into activity_log (actor, actor_name, action, table_name, record_id, household_id, member_id, label, changes)
  values (auth.uid(), current_staff_name(), lower(tg_op), tg_table_name,
          coalesce(rec ->> 'id', mid::text), hid, mid, lbl,
          case when tg_op = 'UPDATE' or tg_table_name = 'sacrament_verifications' then diff end);
  return null;
end;
$$;

drop trigger if exists trg_households_log on households;
create trigger trg_households_log after insert or update or delete on households
for each row execute function log_activity();
drop trigger if exists trg_members_log on members;
create trigger trg_members_log after insert or update or delete on members
for each row execute function log_activity();
drop trigger if exists trg_sacrament_verifications_log on sacrament_verifications;
create trigger trg_sacrament_verifications_log after insert or update or delete on sacrament_verifications
for each row execute function log_activity();

-- ---------------------------------------------------------------------------
-- Trash: a deleted household or member is kept for 30 days and can be
-- restored with everything that hung off it (sacrament verifications,
-- census answers, access codes, links from certificate requests and the
-- blood donor list).
-- ---------------------------------------------------------------------------

create table if not exists deleted_records (
  id              bigserial primary key,
  kind            text not null check (kind in ('household', 'member')),
  record_id       integer not null,
  label           text not null,
  detail          text,
  data            jsonb not null,
  deleted_at      timestamptz not null default now(),
  deleted_by      uuid references auth.users(id) on delete set null,
  deleted_by_name text
);
create index if not exists deleted_records_deleted_at_idx on deleted_records (deleted_at desc);

alter table deleted_records enable row level security;
drop policy if exists deleted_records_staff_select on deleted_records;
create policy deleted_records_staff_select on deleted_records for select to authenticated using (staff_can_see('trash'));
revoke insert, update, delete on deleted_records from anon, authenticated;
grant select on deleted_records to authenticated;

-- Restoring a household keeps who verified it and when.
create or replace function public.households_track_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  staff_name text;
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then
    return new;
  end if;
  if new.status = 'Verified' and (tg_op = 'INSERT' or old.status is distinct from 'Verified') then
    select coalesce(nullif(trim(p.name), ''), u.email) into staff_name
    from auth.users u left join profiles p on p.id = u.id
    where u.id = auth.uid();
    new.verified_at := now();
    new.verified_by := auth.uid();
    new.verified_by_name := staff_name;
  elsif new.status = 'Verified' then
    new.verified_at := old.verified_at;
    new.verified_by := old.verified_by;
    new.verified_by_name := old.verified_by_name;
  else
    new.verified_at := null;
    new.verified_by := null;
    new.verified_by_name := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.require_full_access(what text) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if staff_access() is distinct from 'full' then
    raise exception 'Only staff with full access can %', what using errcode = '42501';
  end if;
end;
$$;

/** Everything that hangs off these members and households, as one jsonb snapshot. */
create or replace function public.trash_snapshot(p_household_ids integer[], p_member_ids integer[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'households', (select coalesce(jsonb_agg(to_jsonb(h) order by h.id), '[]') from households h where h.id = any(p_household_ids)),
    'members', (select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]') from members m where m.id = any(p_member_ids)),
    'sacrament_verifications', (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from sacrament_verifications v where v.member_id = any(p_member_ids)),
    'census_member_responses', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from census_member_responses r where r.member_id = any(p_member_ids)),
    'census_household_snapshots', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from census_household_snapshots s where s.household_id = any(p_household_ids)),
    'census_submissions', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from census_submissions s where s.household_id = any(p_household_ids)),
    'household_access_codes', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from household_access_codes c where c.household_id = any(p_household_ids)),
    'certificate_links', (select coalesce(jsonb_agg(jsonb_build_array(c.id, c.member_id)), '[]') from certificate_requests c where c.member_id = any(p_member_ids)),
    'donor_links', (select coalesce(jsonb_agg(jsonb_build_array(d.id, d.member_id)), '[]') from blood_donors d where d.member_id = any(p_member_ids))
  );
$$;

create or replace function public.trash_household(p_id integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  h households;
  ids integer[];
  new_id bigint;
begin
  perform require_full_access('delete households');
  select * into h from households where id = p_id;
  if h.id is null then raise exception 'Household not found'; end if;
  ids := array(select id from members where household_id = p_id);

  insert into deleted_records (kind, record_id, label, detail, data, deleted_by, deleted_by_name)
  values ('household', p_id, h.household_name,
          concat_ws(' · ', h.gkk, cardinality(ids) || ' member(s)', h.ref_no),
          trash_snapshot(array[p_id], ids), auth.uid(), current_staff_name())
  returning id into new_id;

  perform set_config('app.audit_skip', 'on', true);
  delete from households where id = p_id;
  perform set_config('app.audit_skip', 'off', true);

  insert into activity_log (actor, actor_name, action, table_name, record_id, household_id, label, changes)
  values (auth.uid(), current_staff_name(), 'trash', 'households', p_id::text, p_id, h.household_name,
          jsonb_build_object('members', cardinality(ids)));
  delete from deleted_records where deleted_at < now() - interval '30 days';
  return new_id;
end;
$$;

create or replace function public.trash_member(p_id integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  m members;
  hname text;
  new_id bigint;
  lbl text;
begin
  perform require_full_access('delete members');
  select * into m from members where id = p_id;
  if m.id is null then raise exception 'Member not found'; end if;
  select household_name into hname from households where id = m.household_id;
  lbl := concat_ws(' ', m.first_name, m.last_name, m.suffix);

  insert into deleted_records (kind, record_id, label, detail, data, deleted_by, deleted_by_name)
  values ('member', p_id, lbl, hname, trash_snapshot(array[]::integer[], array[p_id]), auth.uid(), current_staff_name())
  returning id into new_id;

  perform set_config('app.audit_skip', 'on', true);
  delete from members where id = p_id;
  perform set_config('app.audit_skip', 'off', true);

  insert into activity_log (actor, actor_name, action, table_name, record_id, household_id, member_id, label)
  values (auth.uid(), current_staff_name(), 'trash', 'members', p_id::text, m.household_id, p_id, lbl);
  delete from deleted_records where deleted_at < now() - interval '30 days';
  return new_id;
end;
$$;

create or replace function public.restore_deleted(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r deleted_records;
  d jsonb;
  hid integer;
  taken text;
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
  perform set_config('app.restoring', 'off', true);
  perform set_config('app.audit_skip', 'off', true);

  insert into activity_log (actor, actor_name, action, table_name, record_id, household_id, member_id, label)
  values (auth.uid(), current_staff_name(), 'restore', case r.kind when 'household' then 'households' else 'members' end,
          r.record_id::text, coalesce(hid, r.record_id), case when r.kind = 'member' then r.record_id end, r.label);
  delete from deleted_records where id = p_id;
  return jsonb_build_object('kind', r.kind, 'record_id', r.record_id, 'household_id', coalesce(hid, r.record_id));
end;
$$;

create or replace function public.purge_deleted(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_full_access('empty the trash');
  delete from deleted_records where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sidebar badges: what's waiting for staff, in one call. Runs as the caller,
-- so each count only includes what that account can see.
-- ---------------------------------------------------------------------------

create or replace function public.admin_nav_counts() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'pending_households', (select count(*) from households where status = 'Pending'),
    'duplicate_groups', case when staff_can_see('registry') then jsonb_array_length(find_duplicate_members()) else 0 end,
    'census_updates', (select count(*) from census_submissions s join census_cycles c on c.id = s.cycle_id
                       where s.status = 'Pending' and c.status = 'Open'),
    'sacraments_waiting', (select coalesce(sum((has_baptism and not baptism_verified)::int + (has_communion and not communion_verified)::int
                                              + (has_confirmation and not confirmation_verified)::int + (has_matrimony and not matrimony_verified)::int), 0)
                           from members_with_household where is_current),
    'requests', case when staff_can_see('requests') then request_inbox_counts()
                     else jsonb_build_object('certificates', 0, 'ready', 0, 'prayers', 0, 'blood', 0) end
  );
$$;

-- ---------------------------------------------------------------------------
-- Parish default color theme (Parish Config → Appearance). A device that
-- picked its own theme keeps it; everyone else, including the public site,
-- follows this one.
-- ---------------------------------------------------------------------------

alter table parish_settings add column if not exists theme text;

create or replace function public.public_parish_theme() returns text
language sql stable security definer set search_path = public as $$
  select theme from parish_settings where id = 1;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.staff_access() from public, anon;
revoke all on function public.staff_gkk() from public, anon;
revoke all on function public.staff_can_see(text) from public, anon;
revoke all on function public.staff_sees_gkk(text) from public, anon;
revoke all on function public.guard_staff_write() from public, anon, authenticated;
revoke all on function public.log_activity() from public, anon, authenticated;
revoke all on function public.require_full_access(text) from public, anon, authenticated;
revoke all on function public.trash_snapshot(integer[], integer[]) from public, anon, authenticated;
revoke all on function public.trash_household(integer) from public, anon;
revoke all on function public.trash_member(integer) from public, anon;
revoke all on function public.restore_deleted(bigint) from public, anon;
revoke all on function public.purge_deleted(bigint) from public, anon;
revoke all on function public.admin_nav_counts() from public, anon;

grant execute on function public.staff_access() to authenticated;
grant execute on function public.staff_gkk() to authenticated;
grant execute on function public.staff_can_see(text) to authenticated;
grant execute on function public.staff_sees_gkk(text) to authenticated;
grant execute on function public.trash_household(integer) to authenticated;
grant execute on function public.trash_member(integer) to authenticated;
grant execute on function public.restore_deleted(bigint) to authenticated;
grant execute on function public.purge_deleted(bigint) to authenticated;
grant execute on function public.admin_nav_counts() to authenticated;
grant execute on function public.public_parish_theme() to anon, authenticated;
