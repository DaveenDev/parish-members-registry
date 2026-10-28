-- The parish's main photo for the public home page's hero, set in Parish
-- Config. Stored inline as a data URL like the logo (the admin resizes it
-- before upload). Run after 0014_roles_activity_trash.sql. Safe to re-run.

do $$
begin
  if to_regprocedure('public.public_parish_theme()') is null then
    raise exception 'Run 0014_roles_activity_trash.sql before this migration';
  end if;
end;
$$;

alter table parish_settings add column if not exists hero_image text;

create or replace function public.public_parish_hero_image() returns text
language sql stable security definer set search_path = public as $$
  select hero_image from parish_settings where id = 1;
$$;

grant execute on function public.public_parish_hero_image() to anon, authenticated;
