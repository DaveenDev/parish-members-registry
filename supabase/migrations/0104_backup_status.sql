-- Parish Config → Platform Integrations shows when the last weekly database
-- backup was made. The backup workflow (.github/workflows/backup.yml) records
-- each one here as its last step, once the encrypted file is safely in the
-- backup bucket. Run after 0103_trash_requests_and_content.sql. Safe to re-run.
--
-- Only the file name, its size and the time are kept, never anything from
-- the backup. Staff admins can read the status; nobody can change the table
-- from the website. A project that makes no backups simply has no rows.

do $$
begin
  if to_regprocedure('public.is_staff_admin()') is null then
    raise exception 'Run the migrations up to 0025_media_storage_settings.sql before this one';
  end if;
end;
$$;

create table if not exists backup_runs (
  id         bigserial primary key,
  taken_at   timestamptz not null default now(),
  file_name  text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  run_url    text
);

alter table backup_runs enable row level security;
revoke all on backup_runs from anon, authenticated;

-- { latest: { taken_at, file_name, size_bytes, run_url } | null, count }
create or replace function public.backup_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_staff_admin() then
    raise exception 'Only staff admins can see the backup status' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'latest', (select to_jsonb(b) - 'id' from backup_runs b order by taken_at desc, id desc limit 1),
    'count', (select count(*) from backup_runs));
end;
$$;

revoke all on function public.backup_status() from public, anon;
grant execute on function public.backup_status() to authenticated;
