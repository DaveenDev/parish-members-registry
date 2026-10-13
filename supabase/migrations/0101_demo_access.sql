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
-- account change its password, so the shared password keeps working.
--
-- Its password and email can't be changed by the account itself: everyone
-- trying the demo knows the password, and could otherwise lock the others
-- out through Supabase's own API (PUT /auth/v1/user), whatever the admin
-- panel shows. A trigger on auth.users refuses the change. Only a staff
-- admin's reset under Settings → Staff gets through: manage-staff (service
-- role) first leaves a one-minute allowance in demo_password_resets, which
-- no signed-in account can write, and the trigger uses it up.

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

-- ---- the shared password stays as it is ------------------------------------------

-- A staff admin's reset of a demo login's password (manage-staff), allowed
-- for a minute. Row level security with no policies and no grants: only the
-- service role reads or writes it.
create table if not exists demo_password_resets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  until   timestamptz not null
);
alter table demo_password_resets enable row level security;
revoke all on demo_password_resets from anon, authenticated;

-- Before any change to a login: for a demo account, no new email (asked for
-- or made) and no new password unless a reset was just allowed, which it
-- uses up. Everyone else's logins are untouched.
create or replace function public.guard_demo_login() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from profiles where id = new.id and access = 'demo') then
    return new;
  end if;
  if new.email is distinct from old.email
     or (coalesce(new.email_change, '') <> '' and new.email_change is distinct from old.email_change) then
    raise exception 'The demo login''s email can''t be changed' using errcode = '42501';
  end if;
  if new.encrypted_password is distinct from old.encrypted_password then
    delete from demo_password_resets where user_id = new.id and until > now();
    if not found then
      raise exception 'The demo login''s password can''t be changed. A staff admin can reset it under Settings → Staff.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_demo_login() from public, anon, authenticated;

drop trigger if exists guard_demo_login on auth.users;
create trigger guard_demo_login
  before update on auth.users
  for each row execute function public.guard_demo_login();
