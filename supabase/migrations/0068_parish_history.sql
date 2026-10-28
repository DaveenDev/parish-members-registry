-- Kasaysayan (Parish Website → History): the parish's history, written in
-- the admin instead of fixed text on the site. Run after 0067. Safe to re-run.
--
-- One main article (is_main) opens the History page (/simbahan/kasaysayan)
-- and its first paragraph is shown at the bottom of Ang Simbahan. The
-- chapters under it run in order of year, each with its own cover photo and
-- gallery. Photos are on Cloudflare R2 under history/ (history3_cover.jpg,
-- history3_1.jpg…), renamed by the media-upload function like the Blog
-- Articles (0029).

create table if not exists history_articles (
  id          serial primary key,
  is_main     boolean not null default false,
  title       text not null,
  year        integer check (year between 1000 and 2999),
  date_label  text,        -- shown instead of the year, e.g. "1950–1965" or "Hunyo 1952"
  author      text,
  body        text,
  photo_url   text,
  photos      jsonb not null default '[]'::jsonb,
  cover_seq   integer not null default 0,
  photo_seq   integer not null default 0,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint history_articles_photos_is_array check (jsonb_typeof(photos) = 'array'),
  -- A chapter needs its year to take its place in the timeline.
  constraint history_articles_chapter_year check (is_main or year is not null)
);

-- Only one main article.
create unique index if not exists history_articles_one_main on history_articles (is_main) where is_main;
create index if not exists history_articles_year_idx on history_articles (year, id);

drop trigger if exists trg_history_articles_touch on history_articles;
create trigger trg_history_articles_touch before update on history_articles
for each row execute function public.website_touch_updated_at();

-- Who may write: the website's staff, like the other website tables (0014, 0067).
drop trigger if exists trg_00_guard_staff_write on history_articles;
create trigger trg_00_guard_staff_write before insert or update or delete on history_articles
for each row execute function guard_staff_write('website');

-- The main article is always there; to hide it, it's made a draft.
create or replace function public.history_articles_keep_main() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and old.is_main then
    raise exception 'The main history article can''t be deleted. Make it a draft to hide it.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and old.is_main <> new.is_main then
    raise exception 'The main history article stays the main one.' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_history_articles_keep_main on history_articles;
create trigger trg_history_articles_keep_main before update or delete on history_articles
for each row execute function public.history_articles_keep_main();

alter table history_articles enable row level security;
drop policy if exists history_articles_admin_all on history_articles;
create policy history_articles_admin_all on history_articles for all to authenticated using (true) with check (true);
drop policy if exists history_articles_public_select on history_articles;
create policy history_articles_public_select on history_articles for select to anon using (published);
revoke all on history_articles from anon;
grant select on history_articles to anon;
grant select, insert, update, delete on history_articles to authenticated;
grant usage, select on sequence history_articles_id_seq to authenticated;

-- The main article, ready to be written (a draft until it's published).
insert into history_articles (is_main, title)
select true, 'Ang Kasaysayan sa Parokya'
where not exists (select 1 from history_articles where is_main);

-- As in 0046, and the history photos move to a new Public URL too.
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
      body = replace(body, old_base || '/', base || '/')
    where position(old_base || '/' in coalesce(photo_url, '') || photos::text || coalesce(body, '')) > 0;
    get diagnostics moved_history = row_count;
  end if;

  return media_storage_get() || jsonb_build_object('photos_moved', moved + moved_events + moved_gkks + moved_history);
end;
$$;

revoke all on function public.media_storage_save(text, text, text, text, text) from public, anon;
grant execute on function public.media_storage_save(text, text, text, text, text) to authenticated;
