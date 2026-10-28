-- Song lyrics for everyone: each song's composer (credited on its page,
-- in the downloaded lyrics and to search engines) and its language
-- (Bisaya unless staff say otherwise), so people anywhere can find a song
-- and know whose it is. Run after 0096_downloads.sql. Safe to re-run.

do $$
begin
  if to_regclass('public.songs') is null then
    raise exception 'Run 0096_downloads.sql before this migration';
  end if;
end;
$$;

alter table songs add column if not exists composer text;
alter table songs add column if not exists language text not null default 'Bisaya';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'songs_composer_length') then
    alter table songs add constraint songs_composer_length check (composer is null or length(composer) <= 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'songs_language_length') then
    alter table songs add constraint songs_language_length check (length(trim(language)) between 1 and 40);
  end if;
end;
$$;
