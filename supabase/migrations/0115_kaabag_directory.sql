-- The Kaabag page's directory and structure chart: the Kaabag's names and
-- photos, and the Kaabag Structure org chart. Run after
-- 0114_public_census_result.sql. Safe to re-run.
--
-- * kaabag_roster.photo_url: a person's photo, set beside their name under
--   Parish Website → Kaabag Schedule → The list. It's on the website only
--   with their name, so only once the person agreed ("Show on the website",
--   0113), like the name.
-- * public_kaabag_directory(): { total, people: [{ name, photo }] } for the
--   page's Direktoryo. `people` is those showing, A to Z; `total` is
--   everyone on the list, so the page can say how many are not named.
--   Nothing else about a person leaves the database: no member id, no
--   contact details, no part of the draw.
-- * The Kaabag Structure chart (slug kaabag-structure): built in like the
--   Church Structure in Parish life → Organization Structure, so it can't be
--   deleted, with a starting set of officers to change. It stays off the
--   website until it's published, and is shown on the Kaabag page instead
--   of under Ang Simbahan → Organisasyon.
--
-- Photos go to the 'org' folder of the photo storage, which media-upload
-- already allows, so no function needs redeploying.

do $$
begin
  if to_regclass('public.kaabag_roster') is null or to_regclass('public.org_charts') is null then
    raise exception 'Run the migrations up to 0114_public_census_result.sql before this one';
  end if;
end;
$$;

alter table kaabag_roster add column if not exists photo_url text;
alter table kaabag_roster drop constraint if exists kaabag_roster_photo_url_check;
alter table kaabag_roster add constraint kaabag_roster_photo_url_check
  check (photo_url is null or photo_url ~* '^https://');

-- As in 0113.
create or replace function public.public_kaabag_directory() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', (select count(*) from kaabag_roster),
    'people', (select coalesce(jsonb_agg(jsonb_build_object('name', trim(r.name), 'photo', nullif(trim(r.photo_url), ''))
                                         order by lower(trim(r.name)), r.id), '[]'::jsonb)
               from kaabag_roster r where r.show_publicly));
$$;

revoke all on function public.public_kaabag_directory() from public;
grant execute on function public.public_kaabag_directory() to anon, authenticated;

-- The Kaabag Structure chart.
do $$
declare
  c integer;
  top integer;
begin
  -- A chart staff already made under this name becomes the built-in one.
  update org_charts set builtin = true where slug = 'kaabag-structure' and not builtin;
  if not exists (select 1 from org_charts where slug = 'kaabag-structure') then
    insert into org_charts (title, slug, scope, builtin, sort_order)
    values ('Kaabag Structure', 'kaabag-structure', 'parish', true, coalesce((select max(sort_order) from org_charts), 0) + 1)
    returning id into c;
    insert into org_nodes (chart_id, title, sort_order) values (c, 'Kaabag President', 0) returning id into top;
    insert into org_nodes (chart_id, parent_id, title, sort_order)
    select c, top, t.name, t.ord
    from (values ('Vice-President', 0), ('Secretary', 1), ('Treasurer', 2)) as t(name, ord);
  end if;
end;
$$;
