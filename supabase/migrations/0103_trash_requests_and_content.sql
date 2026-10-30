-- The Trash (Settings → Trash) keeps more than households and members, for
-- 3 months instead of 30 days. Run after 0102_activity_more_staff_actions.sql.
-- Safe to re-run.
--
-- A staff member's delete of any of these goes to the Trash first, where staff
-- with full access can put it back or delete it for good:
--   * requests: certificate, sacrament, prayer and blood requests, and blood donors
--   * website content: announcements, bulletins, events, articles, history
--     chapters and songs
-- Mass times and Downloads (forms with a file on the public site) still delete
-- for good: a Daily Mass is a row for each day, and a form's file would stay
-- public from the Trash. Only a signed-in staff member's delete is kept: the
-- SQL editor and the seed scripts delete as before.
--
-- Entries older than 3 months are removed by a daily job (pg_cron, as the
-- morning summary of 0034 uses), and by each new Trash entry. Until a job has
-- run, an expired entry is hidden from the Trash page already. The photos of
-- an article, event or history chapter stay in storage while it's in the
-- Trash; deleting it for good from the Trash page removes them too. An entry
-- that expires by itself leaves its photos behind (the database cannot reach
-- the photo storage).

do $$
begin
  if to_regclass('public.deleted_records') is null or to_regprocedure('public.log_record_activity()') is null then
    raise exception 'Run the migrations up to 0076_activity_more_records.sql before this one';
  end if;
end;
$$;

-- ---- what the Trash can hold --------------------------------------------------------

alter table deleted_records drop constraint if exists deleted_records_kind_check;
alter table deleted_records add constraint deleted_records_kind_check check (kind in (
  'household', 'member',
  'certificate_request', 'sacrament_request', 'prayer_request', 'blood_request', 'blood_donor',
  'announcement', 'bulletin', 'event', 'article', 'history_article', 'song'
));

-- ---- 3 months ----------------------------------------------------------------------

create or replace function public.purge_expired_trash() returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer;
begin
  delete from deleted_records where deleted_at < now() - interval '3 months';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.purge_expired_trash() from public, anon, authenticated;

-- An expired entry is gone from the page even before the job has removed it.
alter policy deleted_records_staff_select on deleted_records
  using ((select staff_can_see('trash')) and deleted_at > now() - interval '3 months');

-- As in 0014, but a household or member keeps its place in the Trash for 3 months, not 30 days.
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
  perform purge_expired_trash();
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
  perform purge_expired_trash();
  return new_id;
end;
$$;

do $$
begin
  if to_regnamespace('cron') is not null then
    -- 19:30 UTC is 3:30 AM in the Philippines. Scheduling again under the same name replaces the old schedule.
    perform cron.schedule('purge-expired-trash', '30 19 * * *', 'select public.purge_expired_trash()');
  else
    raise notice 'pg_cron is not on: expired Trash entries are removed when something else goes to the Trash';
  end if;
exception when others then
  raise notice 'Could not schedule the Trash clean-up: %', sqlerrm;
end;
$$;

-- ---- a delete keeps the record --------------------------------------------------------

-- BEFORE DELETE on each table below. `data` is { table, row, <its dependants> }.
create or replace function public.trash_on_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := to_jsonb(old);
  k text;
  lbl text;
  det text;
  kids jsonb := '{}'::jsonb;
begin
  if auth.uid() is null or coalesce(current_setting('app.trash_skip', true), '') = 'on' then return old; end if;

  case tg_table_name
    when 'certificate_requests' then
      k := 'certificate_request';
      lbl := concat_ws(' · ', rec ->> 'ref_no', nullif(concat_ws(' ', rec ->> 'subject_first_name', rec ->> 'subject_last_name'), ''));
      det := concat_ws(' · ', rec ->> 'cert_type', rec ->> 'status');
    when 'sacrament_requests' then
      k := 'sacrament_request';
      lbl := concat_ws(' · ', rec ->> 'ref_no', rec ->> 'person_name');
      det := concat_ws(' · ', rec ->> 'sacrament', rec ->> 'status');
    when 'prayer_requests' then
      k := 'prayer_request';
      lbl := concat_ws(' · ', rec ->> 'ref_no', nullif(rec ->> 'for_name', ''));
      det := rec ->> 'intention_type';
      kids := jsonb_build_object('prayer_request_prayers',
                (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from prayer_request_prayers p where p.request_id = old.id));
    when 'blood_requests' then
      k := 'blood_request';
      lbl := concat_ws(' · ', rec ->> 'ref_no', rec ->> 'patient_name');
      det := concat_ws(' · ', rec ->> 'blood_type', rec ->> 'hospital', rec ->> 'status');
      kids := jsonb_build_object('blood_request_contacts',
                (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from blood_request_contacts c where c.request_id = old.id));
    when 'blood_donors' then
      k := 'blood_donor';
      lbl := rec ->> 'full_name';
      det := concat_ws(' · ', rec ->> 'blood_type', rec ->> 'gkk');
      kids := jsonb_build_object('blood_request_contacts',
                (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from blood_request_contacts c where c.donor_id = old.id));
    when 'announcements' then
      k := 'announcement';
      lbl := rec ->> 'title';
      det := concat_ws(' · ', rec ->> 'category', rec ->> 'publish_on');
    when 'bulletins' then
      k := 'bulletin';
      lbl := coalesce(nullif(rec ->> 'title', ''), 'Bulletin for ' || (rec ->> 'week_of'));
      det := rec ->> 'week_of';
    when 'events' then
      k := 'event';
      lbl := rec ->> 'title';
      det := concat_ws(' · ', rec ->> 'type', rec ->> 'start_date');
    when 'articles' then
      k := 'article';
      lbl := rec ->> 'title';
      det := concat_ws(' · ', rec ->> 'tag', rec ->> 'held_on');
    when 'history_articles' then
      k := 'history_article';
      lbl := rec ->> 'title';
      det := concat_ws(' · ', rec ->> 'year', rec ->> 'date_label');
    when 'songs' then
      k := 'song';
      lbl := rec ->> 'title';
      det := array_to_string(old.categories, ', ');
    else
      return old;
  end case;

  insert into deleted_records (kind, record_id, label, detail, data, deleted_by, deleted_by_name)
  values (k, old.id, coalesce(nullif(lbl, ''), k || ' ' || old.id), nullif(det, ''),
          jsonb_build_object('table', tg_table_name, 'row', rec) || kids, auth.uid(), current_staff_name());
  perform purge_expired_trash();
  return old;
end;
$$;

revoke all on function public.trash_on_delete() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'certificate_requests', 'sacrament_requests', 'prayer_requests', 'blood_requests', 'blood_donors',
    'announcements', 'bulletins', 'events', 'articles', 'history_articles', 'songs'
  ] loop
    -- Leave out a table whose migration hasn't been run here.
    continue when to_regclass('public.' || t) is null;
    execute format('drop trigger if exists trg_trash_on_delete on %I', t);
    execute format('create trigger trg_trash_on_delete before delete on %I
                    for each row execute function public.trash_on_delete()', t);
  end loop;
end;
$$;

-- ---- putting one back ---------------------------------------------------------------

-- Restores a request, donor or website item (households and members use restore_deleted).
-- Resolves to { kind, record_id }.
create or replace function public.restore_trashed_record(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r deleted_records;
  tbl text;
  row_j jsonb;
begin
  perform require_full_access('restore deleted records');
  select * into r from deleted_records where id = p_id;
  if r.id is null then raise exception 'This item is no longer in the trash'; end if;
  tbl := case r.kind
    when 'certificate_request' then 'certificate_requests'
    when 'sacrament_request' then 'sacrament_requests'
    when 'prayer_request' then 'prayer_requests'
    when 'blood_request' then 'blood_requests'
    when 'blood_donor' then 'blood_donors'
    when 'announcement' then 'announcements'
    when 'bulletin' then 'bulletins'
    when 'event' then 'events'
    when 'article' then 'articles'
    when 'history_article' then 'history_articles'
    when 'song' then 'songs'
  end;
  if tbl is null then raise exception 'Households and members are restored with restore_deleted'; end if;
  row_j := r.data -> 'row';

  -- A linked member who has since been deleted: the record comes back unlinked.
  if row_j ->> 'member_id' is not null and not exists (select 1 from members where id = (row_j ->> 'member_id')::integer) then
    row_j := jsonb_set(row_j, '{member_id}', 'null'::jsonb);
  end if;

  perform set_config('app.audit_skip', 'on', true);
  perform set_config('app.restoring', 'on', true);
  begin
    execute format('insert into %I select * from jsonb_populate_recordset(null::%I, $1)', tbl, tbl) using jsonb_build_array(row_j);

    if r.kind = 'prayer_request' then
      insert into prayer_request_prayers
      select * from jsonb_populate_recordset(null::prayer_request_prayers, coalesce(r.data -> 'prayer_request_prayers', '[]'))
      on conflict do nothing;
    elsif r.kind in ('blood_request', 'blood_donor') then
      -- Only the contacts whose request and donor are both still there.
      insert into blood_request_contacts
      select c.* from jsonb_populate_recordset(null::blood_request_contacts, coalesce(r.data -> 'blood_request_contacts', '[]')) c
      where exists (select 1 from blood_requests b where b.id = c.request_id)
        and exists (select 1 from blood_donors d where d.id = c.donor_id)
      on conflict do nothing;
    end if;
  exception
    when unique_violation then
      raise exception 'Can''t restore this: something with the same reference number, mobile number or date already exists. Change or delete that one first.';
    when foreign_key_violation then
      raise exception 'Can''t restore this: it refers to something that has since been removed (for example a GKK). Add that back, then try again.';
  end;
  perform set_config('app.restoring', 'off', true);
  perform set_config('app.audit_skip', 'off', true);

  insert into activity_log (actor, actor_name, action, table_name, record_id, label)
  values (auth.uid(), current_staff_name(), 'restore', tbl, r.record_id::text, r.label);
  delete from deleted_records where id = p_id;
  return jsonb_build_object('kind', r.kind, 'record_id', r.record_id);
end;
$$;

revoke all on function public.restore_trashed_record(bigint) from public, anon;
grant execute on function public.restore_trashed_record(bigint) to authenticated;
