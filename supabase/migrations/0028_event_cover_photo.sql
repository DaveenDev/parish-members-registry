-- A cover photo for each event (Parish Website → Events), stored on
-- Cloudflare R2 like the Blog Article photos (docs/media-storage.md). The
-- public site shows a photo layout for events that have one. Run after
-- 0027_media_base_url_move.sql, then redeploy the media-upload function (it
-- now also takes photos for the "events" folder). Safe to re-run.

alter table events add column if not exists photo_url text;

-- As in 0027, and event covers move to a new Public URL too.
create or replace function public.media_storage_save(
  p_account_id text, p_access_key_id text, p_secret_access_key text, p_bucket text, p_public_base_url text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  base text := regexp_replace(trim(coalesce(p_public_base_url, '')), '/+$', '');
  old_base text;
  moved integer := 0;
  moved_events integer := 0;
begin
  if not is_staff_admin() then
    raise exception 'Only staff admins can change the photo storage settings' using errcode = '42501';
  end if;
  if base <> '' and base !~* '^https://' then
    raise exception 'The public URL must start with https://' using errcode = '22023';
  end if;
  select public_base_url into old_base from media_storage_settings where id = 1;

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

  -- Point existing photos at the new address. Only "<old>/" is replaced, so
  -- https://a.example never matches inside https://a.example.org.
  if coalesce(old_base, '') <> '' and base <> '' and old_base <> base then
    update articles set
      photo_url = replace(photo_url, old_base || '/', base || '/'),
      photos = replace(photos::text, old_base || '/', base || '/')::jsonb,
      body = replace(body, old_base || '/', base || '/')
    where position(old_base || '/' in coalesce(photo_url, '') || photos::text || coalesce(body, '')) > 0;
    get diagnostics moved = row_count;

    update events set photo_url = replace(photo_url, old_base || '/', base || '/')
    where position(old_base || '/' in coalesce(photo_url, '')) > 0;
    get diagnostics moved_events = row_count;
  end if;

  return media_storage_get() || jsonb_build_object('photos_moved', moved + moved_events);
end;
$$;

revoke all on function public.media_storage_save(text, text, text, text, text) from public, anon;
grant execute on function public.media_storage_save(text, text, text, text, text) to authenticated;
