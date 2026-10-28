-- Cloudflare R2 photo storage settings, kept in the database so a staff
-- admin can enter them under Parish Config instead of setting Edge Function
-- secrets. Run after 0021_article_gallery.sql. Safe to re-run.
--
-- The secret access key must never reach a browser:
--   - the table has row level security and no policies, and anon and
--     authenticated have no grants, so only the service role (the
--     media-upload Edge Function) can read it;
--   - media_storage_get() lets a staff admin see the settings, with the
--     secret reduced to "is one saved?";
--   - media_storage_save() lets a staff admin change them; a blank secret
--     keeps the saved one.
-- The Edge Function uses these settings when they are complete, and falls
-- back to its R2_* secrets otherwise (see docs/media-storage.md).

create table if not exists media_storage_settings (
  id                smallint primary key default 1 check (id = 1),
  account_id        text not null default '',
  access_key_id     text not null default '',
  secret_access_key text not null default '',
  bucket            text not null default '',
  public_base_url   text not null default '',
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id) on delete set null
);

alter table media_storage_settings enable row level security;
revoke all on media_storage_settings from anon, authenticated;

/** True when the signed-in account is a staff admin (profiles.is_admin, 0010). */
create or replace function public.is_staff_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

create or replace function public.media_storage_get() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s media_storage_settings;
begin
  if not is_staff_admin() then
    raise exception 'Only staff admins can see the photo storage settings' using errcode = '42501';
  end if;
  select * into s from media_storage_settings where id = 1;
  return jsonb_build_object(
    'account_id', coalesce(s.account_id, ''),
    'access_key_id', coalesce(s.access_key_id, ''),
    'bucket', coalesce(s.bucket, ''),
    'public_base_url', coalesce(s.public_base_url, ''),
    'has_secret', coalesce(s.secret_access_key, '') <> '',
    'updated_at', s.updated_at);
end;
$$;

create or replace function public.media_storage_save(
  p_account_id text, p_access_key_id text, p_secret_access_key text, p_bucket text, p_public_base_url text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  base text := regexp_replace(trim(coalesce(p_public_base_url, '')), '/+$', '');
begin
  if not is_staff_admin() then
    raise exception 'Only staff admins can change the photo storage settings' using errcode = '42501';
  end if;
  if base <> '' and base !~* '^https://' then
    raise exception 'The public URL must start with https://' using errcode = '22023';
  end if;
  insert into media_storage_settings as m (id, account_id, access_key_id, secret_access_key, bucket, public_base_url, updated_at, updated_by)
  values (1, trim(coalesce(p_account_id, '')), trim(coalesce(p_access_key_id, '')), trim(coalesce(p_secret_access_key, '')),
          trim(coalesce(p_bucket, '')), base, now(), auth.uid())
  on conflict (id) do update set
    account_id = excluded.account_id,
    access_key_id = excluded.access_key_id,
    -- A blank secret keeps the one already saved.
    secret_access_key = case when excluded.secret_access_key = '' then m.secret_access_key else excluded.secret_access_key end,
    bucket = excluded.bucket,
    public_base_url = excluded.public_base_url,
    updated_at = now(),
    updated_by = auth.uid();
  return media_storage_get();
end;
$$;

/** Forget the saved settings; the Edge Function falls back to its secrets. */
create or replace function public.media_storage_clear() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_staff_admin() then
    raise exception 'Only staff admins can change the photo storage settings' using errcode = '42501';
  end if;
  delete from media_storage_settings where id = 1;
end;
$$;

revoke all on function public.media_storage_get() from public, anon;
revoke all on function public.media_storage_save(text, text, text, text, text) from public, anon;
revoke all on function public.media_storage_clear() from public, anon;
grant execute on function public.media_storage_get() to authenticated;
grant execute on function public.media_storage_save(text, text, text, text, text) to authenticated;
grant execute on function public.media_storage_clear() to authenticated;
