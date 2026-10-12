-- Downloads on the public website (/downloads): song lyrics and forms the
-- parish office shares with parishioners. Kept under Parish Website → Song
-- Lyrics and Parish Website → Forms & Files. Run after 0095. Safe to re-run.
--
-- 1. Songs: the lyrics of the songs sung at the GKK Kasaulogan, the Bible
--    Service and other gatherings, typed in so they read well on a phone.
--    A song can be used for more than one (categories).
-- 2. Files: GKK forms, the manual census form and other forms, as files in
--    a PUBLIC Supabase Storage bucket ("downloads"): anyone with a file's
--    link can open it, so only put here what is meant for everyone. Only
--    staff who run the website (Full access, Website & requests) can
--    upload, replace or delete them. A draft's file is not listed on the
--    website, but its link would still open it.
--
-- Like the other website content, every item is a draft until published.

do $$
begin
  if to_regprocedure('public.website_touch_updated_at()') is null or to_regprocedure('public.guard_staff_write()') is null
     or to_regprocedure('public.staff_access()') is null or to_regprocedure('public.log_record_activity()') is null then
    raise exception 'Run the migrations up to 0076_activity_more_records.sql before this one';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Songs
-- ---------------------------------------------------------------------------

create table if not exists songs (
  id          serial primary key,
  title       text not null check (length(trim(title)) between 1 and 200),
  -- What it's sung at: "Kasaulogan sa GKK", "Bible Service", … (the
  -- website's filters). Suggested in client/src/lib/downloads.js.
  categories  text[] not null default '{}',
  -- A short line under the title: the composer, the key, "Pagsulod"…
  note        text check (note is null or length(note) <= 300),
  lyrics      text not null check (length(trim(lyrics)) between 1 and 20000),
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint songs_categories_size check (cardinality(categories) <= 10)
);

create index if not exists songs_title_idx on songs (lower(title));

-- ---------------------------------------------------------------------------
-- 2. Files
-- ---------------------------------------------------------------------------

create table if not exists download_files (
  id            serial primary key,
  title         text not null check (length(trim(title)) between 1 and 200),
  -- "GKK Forms", "Manual Census Forms", … (one per file).
  category      text not null check (length(trim(category)) between 1 and 80),
  description   text check (description is null or length(description) <= 500),
  -- The file in the downloads bucket: "<uuid>.<ext>". Downloaded under file_name.
  file_path     text not null unique,
  file_name     text not null check (length(file_name) between 1 and 255),
  content_type  text,
  size_bytes    bigint check (size_bytes is null or size_bytes >= 0),
  published     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists download_files_category_idx on download_files (category, lower(title));

-- ---------------------------------------------------------------------------
-- Both tables: who may write, the activity log, who may read
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['songs', 'download_files'] loop
    execute format('drop trigger if exists trg_%s_touch on %I', t, t);
    execute format('create trigger trg_%s_touch before update on %I
                    for each row execute function public.website_touch_updated_at()', t, t);

    -- The website's staff, like the other website tables (0014, 0067).
    execute format('drop trigger if exists trg_00_guard_staff_write on %I', t);
    execute format('create trigger trg_00_guard_staff_write before insert or update or delete on %I
                    for each row execute function guard_staff_write(''website'')', t);

    -- Each insert, change and delete in the activity log (0076).
    execute format('drop trigger if exists trg_zz_activity_log on %I', t);
    execute format('create trigger trg_zz_activity_log after insert or update or delete on %I
                    for each row execute function log_record_activity()', t);

    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_admin_all', t);
    execute format('create policy %I on %I for all to authenticated using (true) with check (true)', t || '_admin_all', t);
    execute format('drop policy if exists %I on %I', t || '_public_select', t);
    execute format('create policy %I on %I for select to anon using (published)', t || '_public_select', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select on %I to anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('grant usage, select on sequence %I to authenticated', t || '_id_seq');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- The public bucket: 20 MB per file; PDFs, Word, Excel and photos/scans.
-- Keep in sync with client/src/lib/downloads.js.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('downloads', 'downloads', true, 20971520, array[
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg', 'image/png'])
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

/** True when the signed-in account runs the website: Full access or Website & requests. */
create or replace function public.staff_edits_website() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(staff_access() in ('full', 'website'), false);
$$;

revoke all on function public.staff_edits_website() from public, anon;
grant execute on function public.staff_edits_website() to authenticated;

-- Anyone opens a file through its public link (the bucket is public); only
-- the website's staff list, upload and delete them. Deleting needs select too.
drop policy if exists "downloads_staff_read" on storage.objects;
create policy "downloads_staff_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'downloads' and staff_edits_website());

drop policy if exists "downloads_staff_upload" on storage.objects;
create policy "downloads_staff_upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'downloads' and staff_edits_website());

drop policy if exists "downloads_staff_delete" on storage.objects;
create policy "downloads_staff_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'downloads' and staff_edits_website());
