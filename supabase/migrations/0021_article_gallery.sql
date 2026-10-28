-- Blog Articles (Parish Website → Blog Articles): a photo gallery per article
-- and a History tag ("Kasaysayan") for the parish's historical records.
-- Photos live on Cloudflare R2 (docs/media-storage.md); photo_url stays the
-- cover and photos is [{ "url": ..., "caption": ... }]. Run after
-- 0013_public_site.sql. Safe to re-run.

do $$
begin
  if to_regclass('public.articles') is null then
    raise exception 'Run 0013_public_site.sql before this migration';
  end if;
end;
$$;

alter table articles add column if not exists photos jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'articles_photos_is_array') then
    alter table articles add constraint articles_photos_is_array check (jsonb_typeof(photos) = 'array');
  end if;
end;
$$;

alter table articles drop constraint if exists articles_tag_check;
alter table articles add constraint articles_tag_check check (tag in ('Parish', 'GKK', 'Ministry', 'History'));
