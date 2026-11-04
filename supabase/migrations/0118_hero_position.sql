-- Where the home page's 3D object sits in the hero, chosen per parish.
-- Run after 0117_hero_symbol.sql. Safe to re-run.
--
-- * parish_settings.hero_position: 'left', 'center' or 'right', set in
--   Parish Website → "Home page 3D" beside the object. Blank is 'left', as
--   before there was a choice (client/src/lib/heroSymbols.js). Computers
--   only: on phones the object stays centred behind the text.
-- * website_office_fields(): hero_position joins the parish settings a
--   Website & requests account may change, as it's set on their page.
-- * public_parish_hero_position(): what the home page reads.

do $$
begin
  if to_regprocedure('public.public_parish_hero_symbol()') is null then
    raise exception 'Run the migrations up to 0117_hero_symbol.sql before this one';
  end if;
end;
$$;

alter table parish_settings add column if not exists hero_position text;
alter table parish_settings drop constraint if exists parish_settings_hero_position_check;
alter table parish_settings add constraint parish_settings_hero_position_check
  check (hero_position is null or hero_position in ('left', 'center', 'right'));

create or replace function public.website_office_fields() returns text[]
language sql immutable as $$
  select array['address', 'contact', 'email', 'mobile', 'facebook_url', 'sick_call_contact', 'directions',
               'map_url', 'secretary_messenger', 'office_hours', 'latitude', 'longitude', 'certificate_note',
               'hero_symbol', 'hero_position'];
$$;

create or replace function public.public_parish_hero_position() returns text
language sql stable security definer set search_path = public as $$
  select hero_position from parish_settings where id = 1;
$$;

grant execute on function public.public_parish_hero_position() to anon, authenticated;
