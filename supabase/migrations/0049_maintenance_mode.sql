-- Maintenance mode for the public website. Run after
-- 0048_last_year_list_switch.sql. Safe to re-run.
--
-- When on, the public pages (the website, /register and /census) show a
-- "ginaayo pa" notice instead of their content. Signed-in staff still see
-- the site, with a reminder bar, and the admin is never affected.
-- Set in Parish Config -> Parish Config by staff with full access.

alter table parish_settings add column if not exists maintenance_mode boolean not null default false;
alter table parish_settings add column if not exists maintenance_message text;

-- What the public site needs to know before it shows anything: whether it is
-- in maintenance, the note to show, and the parish name for the notice.
create or replace function public.public_maintenance() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'on', coalesce(s.maintenance_mode, false),
    'message', nullif(trim(coalesce(s.maintenance_message, '')), ''),
    'parish', s.name
  )
  from parish_settings s where s.id = 1;
$$;

revoke all on function public.public_maintenance() from public;
grant execute on function public.public_maintenance() to anon, authenticated;
