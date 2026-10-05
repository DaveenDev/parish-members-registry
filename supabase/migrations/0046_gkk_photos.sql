-- Each GKK's photos on its website page: a main photo and a small gallery
-- (up to 5 photos, with captions), on Cloudflare R2 like the history
-- photos. Kept on the Details tab of Parish Config -> Parish GKK and of a
-- GKK leader's My GKK, and shown on the GKK's page as soon as they're
-- saved (unlike the history, which staff publish). Run after
-- 0045_gkk_leader_my_gkk.sql, then redeploy the media-upload function.
-- Safe to re-run.

do $$
begin
  if to_regprocedure('public.gkk_leader_fields()') is null then
    raise exception 'Run 0045_gkk_leader_my_gkk.sql before this migration';
  end if;
end;
$$;

alter table gkks add column if not exists photo_url text;
-- [{ "url": ..., "caption": ... }], at most 5.
alter table gkks add column if not exists photos    jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gkks_photos_is_short_array') then
    alter table gkks add constraint gkks_photos_is_short_array
      check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 5);
  end if;
end;
$$;

-- As in 0045, plus the photos. Keep in sync with client/src/components/GkkFields.jsx.
create or replace function public.gkk_leader_fields() returns text[]
language sql immutable as $$
  select array['chapel_address', 'puroks', 'year_established', 'meeting_schedule', 'meeting_place',
               'history', 'history_photos', 'photo_url', 'photos'];
$$;

/**
 * What a GKK's website page shows beyond the directory: its main photo and
 * gallery, and its history once published (else null). Null for an
 * unknown GKK.
 */
create or replace function public.public_gkk_page(p_name text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'photo_url', nullif(trim(g.photo_url), ''),
    'photos', g.photos,
    'history', case when g.history_published then nullif(trim(g.history), '') end,
    'history_photos', case when g.history_published then g.history_photos else '[]'::jsonb end)
  from gkks g
  where g.name = p_name;
$$;

grant execute on function public.public_gkk_page(text) to anon, authenticated;

-- As in 0044, and the GKK photos move to a new Public URL too.
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
  end if;

  return media_storage_get() || jsonb_build_object('photos_moved', moved + moved_events + moved_gkks);
end;
$$;

revoke all on function public.media_storage_save(text, text, text, text, text) from public, anon;
grant execute on function public.media_storage_save(text, text, text, text, text) to authenticated;
