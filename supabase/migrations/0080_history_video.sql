-- A video in the History page's main article (Parish Website → History):
-- shown under the page's title, before the photos, only when one is added.
-- Uploaded to Cloudflare R2 like the photos and renamed with the gallery
-- (history3_5.mp4…). Run after 0069. Safe to re-run.

alter table history_articles add column if not exists video_url text;

-- As in 0069, and the video moves to a new Public URL too.
create or replace function public.media_storage_save(
  p_account_id text, p_access_key_id text, p_secret_access_key text, p_bucket text, p_public_base_url text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  base text := regexp_replace(trim(coalesce(p_public_base_url, '')), '/+$', '');
  old_base text;
  moved integer := 0;
  moved_events integer := 0;
  moved_gkks integer := 0;
  moved_history integer := 0;
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

    update gkks set
      history_photos = replace(history_photos::text, old_base || '/', base || '/')::jsonb,
      history = replace(history, old_base || '/', base || '/'),
      photo_url = replace(photo_url, old_base || '/', base || '/'),
      photos = replace(photos::text, old_base || '/', base || '/')::jsonb
    where position(old_base || '/' in history_photos::text || coalesce(history, '') || coalesce(photo_url, '') || photos::text) > 0;
    get diagnostics moved_gkks = row_count;

    update history_articles set
      photo_url = replace(photo_url, old_base || '/', base || '/'),
      photos = replace(photos::text, old_base || '/', base || '/')::jsonb,
      body_photo_url = replace(body_photo_url, old_base || '/', base || '/'),
      video_url = replace(video_url, old_base || '/', base || '/'),
      body = replace(body, old_base || '/', base || '/')
    where position(old_base || '/' in coalesce(photo_url, '') || photos::text || coalesce(body_photo_url, '') || coalesce(video_url, '') || coalesce(body, '')) > 0;
    get diagnostics moved_history = row_count;
  end if;

  return media_storage_get() || jsonb_build_object('photos_moved', moved + moved_events + moved_gkks + moved_history);
end;
$$;

revoke all on function public.media_storage_save(text, text, text, text, text) from public, anon;
grant execute on function public.media_storage_save(text, text, text, text, text) to authenticated;
