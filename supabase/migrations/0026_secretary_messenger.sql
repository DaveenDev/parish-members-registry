-- The office secretary's Facebook Messenger, set in Parish Website → Office &
-- Contact. The public website shows a "Message Me" button that opens
-- https://m.me/<username>. Run after 0013_public_site.sql. Safe to re-run.

alter table parish_settings add column if not exists secretary_messenger text;

-- As in 0013, plus secretary_messenger.
create or replace function public.public_office_details() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', name, 'address', address, 'contact', contact, 'email', email,
    'mobile', mobile, 'facebook_url', facebook_url, 'sick_call_contact', sick_call_contact,
    'directions', directions, 'map_url', map_url, 'latitude', latitude, 'longitude', longitude,
    'office_hours', office_hours, 'secretary_messenger', secretary_messenger
  ) from parish_settings where id = 1;
$$;

grant execute on function public.public_office_details() to anon, authenticated;
