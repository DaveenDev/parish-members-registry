-- The activity log covers more than households and members: requests, the
-- census, the parish website, parish settings and the lists staff keep
-- (GKKs, ministries, organizations, parish positions). Staff account
-- changes are logged by the manage-staff Edge Function (redeploy it). Run
-- after 0074_duplicates_merge.sql. Safe to re-run.
--
-- Each insert, change and delete is one entry: the record's name (a
-- request's reference number and person, an article's title, …) and, for a
-- change, each field from → to. Long text (an article body) is shortened,
-- and nothing that looks like a key, secret or password is recorded.

do $$
begin
  if to_regclass('public.activity_log') is null or to_regprocedure('public.current_staff_name()') is null then
    raise exception 'Run the migrations up to 0014_roles_activity_trash.sql before this one';
  end if;
end;
$$;

/** A value as the log keeps it: long text and large lists shortened. */
create or replace function public.activity_short(v jsonb) returns jsonb
language sql immutable as $$
  select case
    when v is null then null
    when jsonb_typeof(v) = 'string' and length(v #>> '{}') > 120 then to_jsonb(left(v #>> '{}', 117) || '…')
    when jsonb_typeof(v) in ('array', 'object') and length(v::text) > 200 then to_jsonb('(changed)'::text)
    else v
  end;
$$;

create or replace function public.log_record_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  old_j jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_j jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  rec jsonb := coalesce(new_j, old_j);
  diff jsonb := '{}'::jsonb;
  k text;
  lbl text;
begin
  if coalesce(current_setting('app.audit_skip', true), '') = 'on' then return null; end if;

  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(new_j) loop
      -- Bookkeeping, and anything secret.
      continue when k in ('updated_at', 'created_at', 'status_changed_at', 'status_updated_at', 'handled_by', 'handled_by_name',
                          'mobile_key', 'password_reset_verified_at')
                 or k ~* '(secret|password|token|api_?key|access_?key)';
      if new_j -> k is distinct from old_j -> k then
        diff := diff || jsonb_build_object(k, jsonb_build_array(activity_short(old_j -> k), activity_short(new_j -> k)));
      end if;
    end loop;
    if diff = '{}'::jsonb then return null; end if;
  end if;

  lbl := case tg_table_name
    when 'certificate_requests' then concat_ws(' · ', rec ->> 'ref_no', concat_ws(' ', rec ->> 'subject_first_name', rec ->> 'subject_last_name'))
    when 'sacrament_requests' then concat_ws(' · ', rec ->> 'ref_no', rec ->> 'person_name')
    when 'blood_requests' then concat_ws(' · ', rec ->> 'ref_no', rec ->> 'patient_name')
    when 'parish_settings' then 'Parish settings'
    when 'bulletins' then coalesce(nullif(rec ->> 'title', ''), 'Bulletin for ' || (rec ->> 'week_of'))
    else coalesce(nullif(rec ->> 'title', ''), nullif(rec ->> 'label', ''), nullif(rec ->> 'name', ''), nullif(rec ->> 'full_name', ''),
                  nullif(concat_ws(' ', rec ->> 'day', rec ->> 'time'), ''), rec ->> 'id')
  end;

  insert into activity_log (actor, actor_name, action, table_name, record_id, label, changes)
  values (auth.uid(), current_staff_name(), lower(tg_op), tg_table_name, rec ->> 'id', lbl,
          case when tg_op = 'UPDATE' then diff end);
  return null;
end;
$$;

revoke all on function public.log_record_activity() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'certificate_requests', 'sacrament_requests', 'blood_requests', 'blood_donors',
    'census_cycles',
    'announcements', 'articles', 'bulletins', 'events', 'mass_schedules', 'sacrament_guides', 'history_articles',
    'parish_settings', 'gkks', 'ministries', 'organizations', 'parish_positions'
  ] loop
    -- Leave out a table whose migration hasn't been run here.
    continue when to_regclass('public.' || t) is null;
    execute format('drop trigger if exists trg_zz_activity_log on %I', t);
    execute format('create trigger trg_zz_activity_log after insert or update or delete on %I
                    for each row execute function log_record_activity()', t);
  end loop;
end;
$$;

create index if not exists activity_log_table_idx on activity_log (table_name, at desc);
