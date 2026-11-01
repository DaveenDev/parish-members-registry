-- More of what staff do goes in the activity log (Settings → Activity log).
-- Until now the log missed:
--   * approving or rejecting a family's online census update
--   * renewing a household's census access code
--   * editing a GKK's last-year list
--   * uploading or deleting a GKK document
--   * a donor contact note on a blood request
--   * the photo storage (Cloudflare R2) settings
-- Run after 0101_demo_access.sql. Safe to re-run.
--
-- Nothing secret is recorded: a renewed census code says "renewed", never the
-- code, and a changed R2 key says "changed", never the key. Only staff
-- actions are logged; the SQL editor, seed scripts and the family's own
-- submissions (no signed-in staff member) add nothing. The email settings are
-- already logged with the rest of the parish settings (0076).

do $$
begin
  if to_regclass('public.activity_log') is null or to_regprocedure('public.log_record_activity()') is null then
    raise exception 'Run the migrations up to 0076_activity_more_records.sql before this one';
  end if;
end;
$$;

-- ---- a family's online census update: approved or rejected -------------------------

create or replace function public.log_census_review() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  hname text;
begin
  if coalesce(current_setting('app.audit_skip', true), '') = 'on' then return null; end if;
  -- Only a staff member's decision; an update approved automatically (0083) is inserted already approved.
  if new.reviewed_by is null or auth.uid() is null then return null; end if;
  select household_name into hname from households where id = new.household_id;
  insert into activity_log (actor, actor_name, action, table_name, record_id, household_id, label, changes)
  values (auth.uid(), coalesce(new.reviewed_by_name, current_staff_name()), 'update', 'census_submissions', new.id::text, new.household_id, hname,
          jsonb_strip_nulls(jsonb_build_object(
            'status', jsonb_build_array(old.status, new.status),
            'review_note', activity_short(to_jsonb(new.review_note)))));
  return null;
end;
$$;

revoke all on function public.log_census_review() from public, anon, authenticated;

drop trigger if exists trg_zz_census_review on census_submissions;
create trigger trg_zz_census_review after update on census_submissions
for each row when (old.status = 'Pending' and new.status <> 'Pending')
execute function public.log_census_review();

-- ---- renewing a household's census access code -------------------------------------

-- As in 0062, plus the log entry. The code itself is never recorded.
create or replace function public.census_reset_access_code(p_household_id integer)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  new_code text;
  attempt integer := 0;
begin
  if census_staff_name() is null then raise exception 'Only parish staff can change access codes'; end if;
  if not exists (select 1 from households where id = p_household_id and staff_census_gkk(gkk)) then raise exception 'Household not found'; end if;
  loop
    attempt := attempt + 1;
    new_code := census_new_access_code();
    begin
      insert into household_access_codes (household_id, code, issued_by) values (p_household_id, new_code, auth.uid())
      on conflict (household_id) do update set
        code = excluded.code, issued_at = now(), issued_by = excluded.issued_by, failed_attempts = 0, locked_until = null;
      insert into activity_log (actor, actor_name, action, table_name, record_id, household_id, label, changes)
      select auth.uid(), census_staff_name(), 'update', 'household_access_codes', p_household_id::text, p_household_id, h.household_name,
             jsonb_build_object('code_renewed', true)
      from households h where h.id = p_household_id;
      return new_code;
    exception when unique_violation then
      if attempt >= 20 then raise exception 'Could not generate a unique access code'; end if;
    end;
  end loop;
end;
$function$;

-- ---- a GKK's last-year list ---------------------------------------------------------

-- One entry per GKK for each statement, not one per household: pasting a whole
-- list or clearing one is a single line in the log, with how many households.
create or replace function public.log_last_year_added() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.audit_skip', true), '') = 'on' or auth.uid() is null then return null; end if;
  insert into activity_log (actor, actor_name, action, table_name, label, changes)
  select auth.uid(), current_staff_name(), 'insert', 'census_last_year_list', n.gkk,
         jsonb_strip_nulls(jsonb_build_object('count', n.c, 'household', case when n.c = 1 then n.one end))
  from (select gkk, count(*) as c, min(head_name) as one from new_rows group by gkk) n;
  return null;
end;
$$;

create or replace function public.log_last_year_removed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.audit_skip', true), '') = 'on' or auth.uid() is null then return null; end if;
  insert into activity_log (actor, actor_name, action, table_name, label, changes)
  select auth.uid(), current_staff_name(), 'delete', 'census_last_year_list', n.gkk,
         jsonb_strip_nulls(jsonb_build_object('count', n.c, 'household', case when n.c = 1 then n.one end))
  from (select gkk, count(*) as c, min(head_name) as one from old_rows group by gkk) n;
  return null;
end;
$$;

create or replace function public.log_last_year_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(current_setting('app.audit_skip', true), '') = 'on' or auth.uid() is null then return null; end if;
  -- Only what a person edits: a GKK renamed carries its list along and isn't a change to it.
  insert into activity_log (actor, actor_name, action, table_name, label, changes)
  select auth.uid(), current_staff_name(), 'update', 'census_last_year_list', n.gkk,
         jsonb_strip_nulls(
           jsonb_build_object('count', count(*))
           || case when count(*) = 1 then
                jsonb_build_object('household', min(n.head_name))
                || case when min(o.head_name) is distinct from min(n.head_name) then jsonb_build_object('head_name', jsonb_build_array(min(o.head_name), min(n.head_name))) else '{}'::jsonb end
                || case when min(o.purok) is distinct from min(n.purok) then jsonb_build_object('purok', jsonb_build_array(min(o.purok), min(n.purok))) else '{}'::jsonb end
                || case when min(o.note) is distinct from min(n.note) then jsonb_build_object('note', jsonb_build_array(min(o.note), min(n.note))) else '{}'::jsonb end
              else '{}'::jsonb end
           || case when count(distinct o.status) = 1 and count(distinct n.status) = 1 and min(o.status) <> min(n.status)
                then jsonb_build_object('status', jsonb_build_array(min(o.status), min(n.status))) else '{}'::jsonb end)
  from new_rows n join old_rows o on o.id = n.id
  where (o.status, o.head_name, o.purok, o.note) is distinct from (n.status, n.head_name, n.purok, n.note)
  group by n.gkk;
  return null;
end;
$$;

revoke all on function public.log_last_year_added() from public, anon, authenticated;
revoke all on function public.log_last_year_removed() from public, anon, authenticated;
revoke all on function public.log_last_year_changed() from public, anon, authenticated;

do $$
begin
  -- Leave it out where 0041 hasn't been run.
  if to_regclass('public.census_last_year_list') is null then return; end if;
  drop trigger if exists trg_zz_last_year_added on census_last_year_list;
  create trigger trg_zz_last_year_added after insert on census_last_year_list
    referencing new table as new_rows for each statement execute function public.log_last_year_added();
  drop trigger if exists trg_zz_last_year_removed on census_last_year_list;
  create trigger trg_zz_last_year_removed after delete on census_last_year_list
    referencing old table as old_rows for each statement execute function public.log_last_year_removed();
  drop trigger if exists trg_zz_last_year_changed on census_last_year_list;
  create trigger trg_zz_last_year_changed after update on census_last_year_list
    referencing old table as old_rows new table as new_rows for each statement execute function public.log_last_year_changed();
end;
$$;

-- ---- GKK documents ------------------------------------------------------------------

create or replace function public.log_gkk_document() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  gname text;
begin
  if coalesce(current_setting('app.audit_skip', true), '') = 'on' or auth.uid() is null then return null; end if;
  select name into gname from gkks where id = (rec ->> 'gkk_id')::integer;
  insert into activity_log (actor, actor_name, action, table_name, record_id, label, changes)
  values (auth.uid(), current_staff_name(), lower(tg_op), 'gkk_documents', rec ->> 'id', rec ->> 'title',
          jsonb_strip_nulls(jsonb_build_object('gkk', gname, 'kind', rec ->> 'kind', 'file', rec ->> 'file_name')));
  return null;
end;
$$;

revoke all on function public.log_gkk_document() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.gkk_documents') is null then return; end if;
  drop trigger if exists trg_zz_activity_log on gkk_documents;
  create trigger trg_zz_activity_log after insert or delete on gkk_documents
    for each row execute function public.log_gkk_document();
end;
$$;

-- ---- donor contacts on a blood request ---------------------------------------------

create or replace function public.log_blood_contact() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  old_j jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_j jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  rec jsonb := coalesce(new_j, old_j);
  req blood_requests;
  donor text;
  diff jsonb;
begin
  if coalesce(current_setting('app.audit_skip', true), '') = 'on' or auth.uid() is null then return null; end if;
  select * into req from blood_requests where id = (rec ->> 'request_id')::integer;
  select full_name into donor from blood_donors where id = (rec ->> 'donor_id')::integer;
  -- Deleting the request or the donor removes its contacts too: that is logged as the request or donor.
  if req.id is null or donor is null then return null; end if;

  diff := jsonb_build_object('donor', donor);
  if tg_op = 'UPDATE' then
    if old_j ->> 'status' is not distinct from new_j ->> 'status' and old_j ->> 'note' is not distinct from new_j ->> 'note' then return null; end if;
    if old_j ->> 'status' is distinct from new_j ->> 'status' then
      diff := diff || jsonb_build_object('status', jsonb_build_array(old_j ->> 'status', new_j ->> 'status'));
    end if;
    if old_j ->> 'note' is distinct from new_j ->> 'note' then
      diff := diff || jsonb_build_object('note', jsonb_build_array(activity_short(to_jsonb(old_j ->> 'note')), activity_short(to_jsonb(new_j ->> 'note'))));
    end if;
  else
    diff := diff || jsonb_strip_nulls(jsonb_build_object('status', rec ->> 'status', 'note', activity_short(to_jsonb(rec ->> 'note'))));
  end if;

  insert into activity_log (actor, actor_name, action, table_name, record_id, label, changes)
  values (auth.uid(), current_staff_name(), lower(tg_op), 'blood_request_contacts', req.id::text,
          concat_ws(' · ', req.ref_no, req.patient_name), diff);
  return null;
end;
$$;

revoke all on function public.log_blood_contact() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.blood_request_contacts') is null then return; end if;
  drop trigger if exists trg_zz_activity_log on blood_request_contacts;
  create trigger trg_zz_activity_log after insert or update or delete on blood_request_contacts
    for each row execute function public.log_blood_contact();
end;
$$;

-- ---- photo storage (Cloudflare R2) settings ---------------------------------------

create or replace function public.log_storage_settings() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  old_j jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_j jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  diff jsonb := '{}'::jsonb;
  k text;
begin
  if coalesce(current_setting('app.audit_skip', true), '') = 'on' or auth.uid() is null then return null; end if;

  -- The bucket and the public address are not secret, so they are shown. The account and the keys are
  -- only said to have changed.
  foreach k in array array['bucket', 'public_base_url'] loop
    if old_j ->> k is distinct from new_j ->> k then
      diff := diff || jsonb_build_object(k, jsonb_build_array(old_j ->> k, new_j ->> k));
    end if;
  end loop;
  foreach k in array array['account_id', 'access_key_id', 'secret_access_key'] loop
    if old_j ->> k is distinct from new_j ->> k then diff := diff || jsonb_build_object(k || '_changed', true); end if;
  end loop;
  if tg_op = 'UPDATE' and diff = '{}'::jsonb then return null; end if;

  insert into activity_log (actor, actor_name, action, table_name, record_id, label, changes)
  values (auth.uid(), current_staff_name(), lower(tg_op), 'media_storage_settings', '1', 'Photo storage (Cloudflare R2)',
          case when tg_op = 'DELETE' then null else diff end);
  return null;
end;
$$;

revoke all on function public.log_storage_settings() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.media_storage_settings') is null then return; end if;
  drop trigger if exists trg_zz_activity_log on media_storage_settings;
  create trigger trg_zz_activity_log after insert or update or delete on media_storage_settings
    for each row execute function public.log_storage_settings();
end;
$$;
