-- Each GKK's history and its important documents, kept under Parish Config →
-- Parish GKK. Run after 0043_sacrament_verification_stricter.sql (it needs
-- 0018, 0028 and 0041), then redeploy the media-upload function (it now also
-- takes photos for the "gkks" folder). Safe to re-run.
--
-- 1. History: an article about the GKK (text and a photo gallery with
--    captions, photos on Cloudflare R2 like the Blog Articles). Once marked
--    published it shows on the GKK's page of the public website.
-- 2. Documents: land titles, deeds, tax declarations and the like, as files
--    in a PRIVATE Supabase Storage bucket ("gkk-documents"). These are not
--    for the public, so they are never on R2 (whose photos anyone with the
--    link can open). Only staff with full access, and the GKK's own leader
--    for their GKK, can list, open, upload or delete them; files open
--    through short-lived signed links. A GKK that still has documents can't
--    be deleted, so a land title is never lost with it.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'gkks' and column_name = 'chapel_address') then
    raise exception 'Run 0018_gkk_chapel.sql before this migration';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'events' and column_name = 'photo_url') then
    raise exception 'Run 0028_event_cover_photo.sql before this migration';
  end if;
  if to_regprocedure('public.staff_gkk()') is null or to_regprocedure('public.census_staff_name()') is null then
    raise exception 'Run 0007_census.sql and 0014_roles_activity_trash.sql before this migration';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. History
-- ---------------------------------------------------------------------------

alter table gkks add column if not exists history           text;
-- [{ "url": ..., "caption": ... }], as articles.photos (0021).
alter table gkks add column if not exists history_photos    jsonb not null default '[]'::jsonb;
alter table gkks add column if not exists history_published boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gkks_history_photos_is_array') then
    alter table gkks add constraint gkks_history_photos_is_array check (jsonb_typeof(history_photos) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gkks_history_length') then
    alter table gkks add constraint gkks_history_length check (history is null or length(history) <= 50000);
  end if;
end;
$$;

/** A GKK's published history for its page on the public website, or null. */
create or replace function public.public_gkk_history(p_name text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('history', g.history, 'photos', g.history_photos)
  from gkks g
  where g.name = p_name and g.history_published
    and (nullif(trim(g.history), '') is not null or jsonb_array_length(g.history_photos) > 0);
$$;

grant execute on function public.public_gkk_history(text) to anon, authenticated;

-- As in 0028, and GKK history photos move to a new Public URL too.
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
      history = replace(history, old_base || '/', base || '/')
    where position(old_base || '/' in history_photos::text || coalesce(history, '')) > 0;
    get diagnostics moved_gkks = row_count;
  end if;

  return media_storage_get() || jsonb_build_object('photos_moved', moved + moved_events + moved_gkks);
end;
$$;

revoke all on function public.media_storage_save(text, text, text, text, text) from public, anon;
grant execute on function public.media_storage_save(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Documents
-- ---------------------------------------------------------------------------

/**
 * True when the signed-in account may see and change GKK `p_gkk_id`'s
 * documents: full access for every GKK, a GKK leader for their own.
 */
create or replace function public.staff_sees_gkk_documents(p_gkk_id integer) returns boolean
language sql stable security definer set search_path = public as $$
  select case staff_access()
    when 'full' then true
    when 'gkk_leader' then exists (select 1 from gkks g where g.id = p_gkk_id and g.name = staff_gkk())
    else false
  end;
$$;

/** As above, for a file in the bucket: its path starts with the GKK's id ("12/<uuid>.pdf"). */
create or replace function public.staff_sees_gkk_document_path(p_path text) returns boolean
language sql stable security definer set search_path = public as $$
  select case when split_part(coalesce(p_path, ''), '/', 1) ~ '^[0-9]{1,9}$'
              then staff_sees_gkk_documents(split_part(p_path, '/', 1)::integer)
              else false end;
$$;

revoke all on function public.staff_sees_gkk_documents(integer) from public, anon;
revoke all on function public.staff_sees_gkk_document_path(text) from public, anon;
grant execute on function public.staff_sees_gkk_documents(integer) to authenticated;
grant execute on function public.staff_sees_gkk_document_path(text) to authenticated;

-- Keep in sync with GKK_DOCUMENT_KINDS in client/src/lib/gkkDocuments.js.
create table if not exists gkk_documents (
  id               serial primary key,
  -- By id, so renaming a GKK keeps its documents. A GKK with documents
  -- can't be deleted (delete them first).
  gkk_id           integer not null references gkks(id) on delete restrict,
  title            text not null check (length(trim(title)) between 1 and 200),
  kind             text not null default 'Other'
                   check (kind in ('Land title', 'Deed of donation', 'Deed of sale', 'Tax declaration', 'Survey plan', 'Other')),
  note             text check (note is null or length(note) <= 500),
  -- The file in the gkk-documents bucket: "<gkk_id>/<uuid>.<ext>".
  file_path        text not null unique,
  file_name        text not null check (length(file_name) between 1 and 255),
  content_type     text,
  size_bytes       bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by      uuid references auth.users(id) on delete set null default auth.uid(),
  uploaded_by_name text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_gkk_documents_gkk on gkk_documents(gkk_id, created_at desc);

-- Who uploaded it and when (set here, not by the browser); the file must
-- sit in the GKK's own folder.
create or replace function public.gkk_documents_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.title := trim(new.title);
  new.note := nullif(trim(new.note), '');
  if tg_op = 'INSERT' then
    new.uploaded_by := auth.uid();
    new.uploaded_by_name := census_staff_name();
    new.created_at := now();
  else
    new.gkk_id := old.gkk_id;
    new.file_path := old.file_path;
    new.uploaded_by := old.uploaded_by;
    new.uploaded_by_name := old.uploaded_by_name;
    new.created_at := old.created_at;
  end if;
  if split_part(new.file_path, '/', 1) <> new.gkk_id::text then
    raise exception 'The file is not in this GKK''s folder' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke all on function public.gkk_documents_stamp() from public, anon, authenticated;

drop trigger if exists trg_gkk_documents_stamp on gkk_documents;
create trigger trg_gkk_documents_stamp before insert or update on gkk_documents
  for each row execute function gkk_documents_stamp();

alter table gkk_documents enable row level security;

drop policy if exists "gkk_documents_staff" on gkk_documents;
create policy "gkk_documents_staff" on gkk_documents
  for all to authenticated
  using (staff_sees_gkk_documents(gkk_id))
  with check (staff_sees_gkk_documents(gkk_id));

revoke all on gkk_documents from anon, authenticated;
grant select, insert, update, delete on gkk_documents to authenticated;
grant usage, select on sequence gkk_documents_id_seq to authenticated;

-- The private bucket: 20 MB per file; PDFs, photos/scans and Word files.
-- Keep in sync with client/src/lib/gkkDocuments.js.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gkk-documents', 'gkk-documents', false, 20971520, array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Files: read (signed links), upload and delete, never overwrite.
drop policy if exists "gkk_documents_read" on storage.objects;
create policy "gkk_documents_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'gkk-documents' and staff_sees_gkk_document_path(name));

drop policy if exists "gkk_documents_upload" on storage.objects;
create policy "gkk_documents_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gkk-documents' and staff_sees_gkk_document_path(name));

drop policy if exists "gkk_documents_delete" on storage.objects;
create policy "gkk_documents_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'gkk-documents' and staff_sees_gkk_document_path(name));
