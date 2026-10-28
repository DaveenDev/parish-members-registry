-- Service history: each member's past service, so staff can tell a former
-- Kaabag, a former CFC member or a past PPC officer from someone who never
-- served. A member's record still shows what they're in now (ministries,
-- organizations, Responsibility in Parish / GKK); member_service keeps what
-- they used to be in, by year.
--
--   * Automatic: when a ministry or organization is taken off a member, or
--     their Responsibility in Parish or in GKK changes, the old one is
--     recorded with this year as its last year. Putting it back in the same
--     year removes that entry again, so a slip that was saved and undone
--     leaves no trace.
--   * By hand: staff add older service (and correct the years) in the
--     member's record.
--   * Renaming a ministry, organization or parish position renames it in
--     the history too, and isn't recorded as leaving it.
--   * The trash keeps a member's history, and restoring puts it back.
--
-- Seen by everyone who sees the member; changed by full access and the
-- member's GKK leader. Run after 0070_report_sacrament_ages.sql. Safe to
-- re-run.

do $$
begin
  if to_regprocedure('public.report_age_at_least(date, integer)') is null or to_regclass('public.member_blood_types') is null then
    raise exception 'Run the migrations up to 0070_report_sacrament_ages.sql before this one';
  end if;
end;
$$;

-- ---- the table --------------------------------------------------------------

create table if not exists member_service (
  id         serial primary key,
  member_id  integer not null references members(id) on delete cascade,
  kind       text not null check (kind in ('ministry', 'organization', 'parish', 'gkk')),
  name       text not null check (trim(name) <> ''),
  from_year  integer check (from_year between 1900 and 2100),
  to_year    integer check (to_year between 1900 and 2100),
  notes      text,
  source     text not null default 'manual' check (source in ('manual', 'auto')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  constraint member_service_years check (from_year is null or to_year is null or from_year <= to_year)
);

create index if not exists member_service_member_idx on member_service (member_id);

alter table member_service enable row level security;
grant select, insert, update, delete on member_service to authenticated;
grant usage, select on sequence member_service_id_seq to authenticated;

-- Seen as the member is (0039); changed with full access, or by the GKK
-- leader of the member's household.
drop policy if exists member_service_select on member_service;
create policy member_service_select on member_service
  for select to authenticated
  using ((select staff_can_see('registry'))
         or exists (select 1 from members m join households h on h.id = m.household_id
                    where m.id = member_service.member_id
                      and (select staff_access()) = 'gkk_leader' and h.gkk = (select staff_gkk())));

drop policy if exists member_service_write on member_service;
create policy member_service_write on member_service
  for all to authenticated
  using ((select staff_access()) = 'full'
         or exists (select 1 from members m join households h on h.id = m.household_id
                    where m.id = member_service.member_id
                      and (select staff_access()) = 'gkk_leader' and h.gkk = (select staff_gkk())))
  with check ((select staff_access()) = 'full'
         or exists (select 1 from members m join households h on h.id = m.household_id
                    where m.id = member_service.member_id
                      and (select staff_access()) = 'gkk_leader' and h.gkk = (select staff_gkk())));

-- ---- recorded automatically ----------------------------------------------------

-- One kind of service: what was dropped is recorded as ending this year;
-- what was put back loses an automatic entry from this year.
create or replace function public.member_service_change(p_member_id integer, p_kind text, p_old text[], p_new text[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  yr integer := extract(year from now() at time zone 'Asia/Manila')::integer;
  item text;
begin
  for item in select distinct trim(x) from unnest(coalesce(p_old, '{}')) x
              where coalesce(trim(x), '') <> '' and not (trim(x) = any(array(select trim(y) from unnest(coalesce(p_new, '{}')) y))) loop
    insert into member_service (member_id, kind, name, to_year, source)
    select p_member_id, p_kind, item, yr, 'auto'
    where not exists (select 1 from member_service s
                      where s.member_id = p_member_id and s.kind = p_kind and s.name = item and s.to_year = yr);
  end loop;

  for item in select distinct trim(x) from unnest(coalesce(p_new, '{}')) x
              where coalesce(trim(x), '') <> '' and not (trim(x) = any(array(select trim(y) from unnest(coalesce(p_old, '{}')) y))) loop
    delete from member_service s
    where s.member_id = p_member_id and s.kind = p_kind and s.name = item and s.to_year = yr and s.source = 'auto';
  end loop;
end;
$$;
revoke all on function public.member_service_change(integer, text, text[], text[]) from public, anon, authenticated;

create or replace function public.record_member_service() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Renames (below) and restoring from the trash aren't anyone leaving.
  if coalesce(current_setting('app.service_skip', true), '') = 'on'
     or coalesce(current_setting('app.restoring', true), '') = 'on' then
    return null;
  end if;
  perform member_service_change(new.id, 'ministry', old.ministries, new.ministries);
  perform member_service_change(new.id, 'organization', old.organizations, new.organizations);
  perform member_service_change(new.id, 'parish', array_remove(array[old.parish_role], null), array_remove(array[new.parish_role], null));
  perform member_service_change(new.id, 'gkk', array_remove(array[old.gkk_role], null), array_remove(array[new.gkk_role], null));
  return null;
end;
$$;
revoke all on function public.record_member_service() from public, anon, authenticated;

drop trigger if exists trg_members_service on members;
create trigger trg_members_service
  after update of ministries, organizations, parish_role, gkk_role on members
  for each row
  when (old.ministries is distinct from new.ministries or old.organizations is distinct from new.organizations
        or old.parish_role is distinct from new.parish_role or old.gkk_role is distinct from new.gkk_role)
  execute function record_member_service();

-- ---- renames carry the history along ----------------------------------------------

-- As in 0038, and the history follows the new name.
create or replace function public.rename_ministry(old_name text, new_name text) returns void
language plpgsql as $$
begin
  if coalesce(trim(new_name), '') = '' then raise exception 'Name is required'; end if;
  update ministries set name = trim(new_name) where name = old_name;
  if not found then raise exception 'Item not found'; end if;
  perform set_config('app.renaming_ministry', 'on', true);
  perform set_config('app.service_skip', 'on', true);
  update members set ministries = array_replace(ministries, old_name, trim(new_name))
  where old_name = any(ministries);
  perform set_config('app.service_skip', 'off', true);
  perform set_config('app.renaming_ministry', 'off', true);
  update member_service set name = trim(new_name) where kind = 'ministry' and name = old_name;
end;
$$;

-- As in 0003, and the history follows the new name.
create or replace function public.rename_organization(old_name text, new_name text) returns void
language plpgsql as $$
begin
  if coalesce(trim(new_name), '') = '' then raise exception 'Name is required'; end if;
  update organizations set name = trim(new_name) where name = old_name;
  if not found then raise exception 'Item not found'; end if;
  perform set_config('app.service_skip', 'on', true);
  update members set organizations = array_replace(organizations, old_name, trim(new_name))
  where old_name = any(organizations);
  perform set_config('app.service_skip', 'off', true);
  update member_service set name = trim(new_name) where kind = 'organization' and name = old_name;
end;
$$;

-- As in 0006, and the history follows the new name.
create or replace function public.rename_parish_position(old_name text, new_name text) returns void
language plpgsql as $$
begin
  if coalesce(trim(new_name), '') = '' then raise exception 'Name is required'; end if;
  update parish_positions set name = trim(new_name) where name = old_name;
  if not found then raise exception 'Item not found'; end if;
  perform set_config('app.service_skip', 'on', true);
  update members set parish_role = trim(new_name) where parish_role = old_name;
  perform set_config('app.service_skip', 'off', true);
  update member_service set name = trim(new_name) where kind = 'parish' and name = old_name;
end;
$$;

-- ---- the trash keeps it ------------------------------------------------------------

-- As in 0062, with member_service.
CREATE OR REPLACE FUNCTION public.trash_snapshot(p_household_ids integer[], p_member_ids integer[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'households', (select coalesce(jsonb_agg(to_jsonb(h) order by h.id), '[]') from households h where h.id = any(p_household_ids)),
    'members', (select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]') from members m where m.id = any(p_member_ids)),
    'member_blood_types', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from member_blood_types b where b.member_id = any(p_member_ids)),
    'member_service', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from member_service s where s.member_id = any(p_member_ids)),
    'sacrament_verifications', (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from sacrament_verifications v where v.member_id = any(p_member_ids)),
    'census_member_responses', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from census_member_responses r where r.member_id = any(p_member_ids)),
    'census_household_snapshots', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from census_household_snapshots s where s.household_id = any(p_household_ids)),
    'census_submissions', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from census_submissions s where s.household_id = any(p_household_ids)),
    'household_access_codes', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from household_access_codes c where c.household_id = any(p_household_ids)),
    'certificate_links', (select coalesce(jsonb_agg(jsonb_build_array(c.id, c.member_id)), '[]') from certificate_requests c where c.member_id = any(p_member_ids)),
    'donor_links', (select coalesce(jsonb_agg(jsonb_build_array(d.id, d.member_id)), '[]') from blood_donors d where d.member_id = any(p_member_ids))
  );
$function$;

-- As in 0064, putting back the member's service history (none for items
-- trashed before this migration).
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
  insert into member_service select * from jsonb_populate_recordset(null::member_service, coalesce(d -> 'member_service', '[]'))
  on conflict (id) do nothing;
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
