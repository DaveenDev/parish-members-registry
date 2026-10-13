-- A "Demo" access level, for the demo site's shared login: other parishes
-- press "Try the demo" on the staff sign-in page and look around the admin
-- panel as the parish office would. Run after 0100_prayer_wall.sql. Safe to
-- re-run.
--
-- Demo works as Full access everywhere the database checks (staff_access()
-- answers 'full' for it), so visitors can try every page: households, the
-- census, requests, the website, reports, the trash. What it never gets:
--   - staff admin: no Settings → Staff and no Platform Integrations (the
--     photo storage keys and email), which check profiles.is_admin, not the
--     access level. The constraint below keeps a demo account from being made
--     an admin;
--   - phone notifications: notification_push_targets() reads profiles.access
--     itself, and 'demo' isn't a level it sends to, so nobody's phone gets
--     the demo site's alerts through the shared login. The bell still shows
--     them.
-- manage-staff refuses the level on the live project and never makes a demo
-- account change its password, so the shared password keeps working; the
-- admin panel doesn't offer a password change to it either.

do $$
begin
  if to_regprocedure('public.prayer_request_is_public(prayer_requests)') is null
     or to_regprocedure('public.notification_visible_to(text, text, text, text)') is null then
    raise exception 'Run the migrations up to 0100_prayer_wall.sql before this one';
  end if;
end;
$$;

alter table profiles drop constraint if exists profiles_access_check;
alter table profiles add constraint profiles_access_check
  check (access in ('full', 'read_only', 'gkk_leader', 'website', 'clergy', 'demo'));

-- A demo login is shared with anyone trying the app: never a staff admin.
alter table profiles drop constraint if exists profiles_demo_not_admin;
alter table profiles add constraint profiles_demo_not_admin
  check (access is distinct from 'demo' or not coalesce(is_admin, false));

-- As in 0065, with a demo account working as full access.
create or replace function public.staff_access() returns text
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null
              else coalesce((select case when access = 'demo' then 'full' else access end
                             from profiles where id = auth.uid()), 'none') end;
$$;
