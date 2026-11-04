-- The 3D object behind the website's home page hero, chosen per parish.
-- Run after 0107_certificate_pickup_note.sql. Safe to re-run.
--
-- * parish_settings.hero_symbol: which object sits in the gold rays, set in
--   Parish Website → "Home page 3D" (beside Visit website): 'crucifix', 'cross', 'chalice',
--   'monstrance', 'sacred-heart', 'immaculate-heart', 'dove' or 'rosary',
--   or 'off' for none. Blank shows the crucifix, as before there was a
--   choice (client/src/lib/heroSymbols.js has the list).
-- * website_office_fields(): hero_symbol joins the parish settings a
--   Website & requests account may change, as it's set on their page.
-- * public_parish_hero_symbol(): what the home page reads.

do $$
begin
  if to_regprocedure('public.public_parish_hero_image()') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'parish_settings' and column_name = 'certificate_note') then
    raise exception 'Run the migrations up to 0107_certificate_pickup_note.sql before this one';
  end if;
end;
$$;

alter table parish_settings add column if not exists hero_symbol text;
alter table parish_settings drop constraint if exists parish_settings_hero_symbol_check;
alter table parish_settings add constraint parish_settings_hero_symbol_check
  check (hero_symbol is null or hero_symbol ~ '^[a-z-]{1,30}$');

create or replace function public.website_office_fields() returns text[]
language sql immutable as $$
  select array['address', 'contact', 'email', 'mobile', 'facebook_url', 'sick_call_contact', 'directions',
               'map_url', 'secretary_messenger', 'office_hours', 'latitude', 'longitude', 'certificate_note',
               'hero_symbol'];
$$;

create or replace function public.public_parish_hero_symbol() returns text
language sql stable security definer set search_path = public as $$
  select hero_symbol from parish_settings where id = 1;
$$;

grant execute on function public.public_parish_hero_symbol() to anon, authenticated;
