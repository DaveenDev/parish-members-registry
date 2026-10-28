-- A household's GKK must be one in the GKK list. Run after
-- 0063_leader_gkk_by_id.sql. Safe to re-run.
--
-- households.gkk and staff_notifications.gkk held a GKK's name with nothing
-- tying it to the GKK list, so a household could keep a name the list no
-- longer has (it then belonged to no GKK: no leader saw it, no GKK filter or
-- census count had it). Now both reference gkks(name):
--   * a name not in the list is refused (the registration forms already
--     refused one; this covers every other way a household is saved);
--   * renaming a GKK renames it on its households and notifications through
--     the reference itself;
--   * a GKK with households still can't be deleted (as delete_gkk already
--     said); deleting one clears it from old notifications.
-- Households in the trash keep their GKK's name too: a rename now renames it
-- there, and restoring one whose GKK has since been deleted says so.

do $$
begin
  if to_regprocedure('public.gkks_rename_cascade()') is null then
    raise exception 'Run 0063_leader_gkk_by_id.sql before this migration';
  end if;
end;
$$;

-- ---- households -----------------------------------------------------------------

do $$
declare lost text;
begin
  select string_agg(format('%s (%s)', household_name, gkk), ', ') into lost
  from households h where h.gkk is not null and not exists (select 1 from gkks g where g.name = h.gkk);
  if lost is not null then
    raise exception 'These households have a GKK that is not in the GKK list: %. Choose their GKK, then run this again.', lost;
  end if;
end;
$$;

alter table households drop constraint if exists households_gkk_fkey;
alter table households add constraint households_gkk_fkey
  foreign key (gkk) references gkks(name) on update cascade on delete restrict;

-- ---- staff notifications --------------------------------------------------------

-- A notification about a GKK no longer in the list just loses the GKK.
update staff_notifications n set gkk = null
where n.gkk is not null and not exists (select 1 from gkks g where g.name = n.gkk);

alter table staff_notifications drop constraint if exists staff_notifications_gkk_fkey;
alter table staff_notifications add constraint staff_notifications_gkk_fkey
  foreign key (gkk) references gkks(name) on update cascade on delete set null;

-- ---- renaming a GKK -------------------------------------------------------------

-- As in 0063: households and notifications now follow through their
-- reference; the leaders' accounts (their copy of the name) and trashed
-- households are renamed here.
create or replace function public.gkks_rename_cascade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update profiles set access_gkk = new.name where access_gkk_id = new.id;
  update deleted_records set data = jsonb_set(data, '{households,0,gkk}', to_jsonb(new.name))
  where kind = 'household' and data -> 'households' -> 0 ->> 'gkk' = old.name;
  return null;
end;
$$;
revoke execute on function public.gkks_rename_cascade() from public, anon, authenticated;

-- ---- restoring a household ------------------------------------------------------

-- As in 0062, refusing a household whose GKK has since been deleted.
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
  perform set_config('app.restoring', 'off', true);
  perform set_config('app.audit_skip', 'off', true);

  insert into activity_log (actor, actor_name, action, table_name, record_id, household_id, member_id, label)
  values (auth.uid(), current_staff_name(), 'restore', case r.kind when 'household' then 'households' else 'members' end,
          r.record_id::text, coalesce(hid, r.record_id), case when r.kind = 'member' then r.record_id end, r.label);
  delete from deleted_records where id = p_id;
  return jsonb_build_object('kind', r.kind, 'record_id', r.record_id, 'household_id', coalesce(hid, r.record_id));
end;
$$;
