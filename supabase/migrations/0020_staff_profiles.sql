-- Fix: "Only parish staff can start a census" for a signed-in staff account.
--
-- The staff functions (start / close a census, record answers, access codes…)
-- look the signed-in person up in `profiles`. That row was only ever made by
-- hand (the "insert into profiles" step after creating a user in Supabase),
-- so an account created without it could sign in and use most of the admin,
-- but every staff function refused it. This migration
--   1. adds the missing profile row for every account that has none,
--   2. adds one automatically for every account created from now on, and
--   3. makes census_staff_name() fall back to the account's email, as the
--      household verification already does.
-- The first account with no admin becomes a staff admin (Staff page); change
-- anyone's role or access there afterwards. Public registrants never get an
-- auth account (the README has you turn off "Allow new users to sign up").
-- Run after 0014_roles_activity_trash.sql. Safe to re-run.

do $$
begin
  if to_regprocedure('public.staff_access()') is null then
    raise exception 'Run 0014_roles_activity_trash.sql before this migration';
  end if;
end;
$$;

-- 3. The name staff actions are recorded under: the profile name, else the
--    email. Null only for a signed-out caller.
create or replace function public.census_staff_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(p.name), ''), u.email)
  from auth.users u left join profiles p on p.id = u.id
  where u.id = auth.uid();
$$;

revoke execute on function public.census_staff_name() from public, anon;
grant execute on function public.census_staff_name() to authenticated;

-- 1. Backfill. With no staff admin yet, the accounts found become admins so
--    someone can manage staff; otherwise they start as ordinary full-access staff.
insert into profiles (id, name, role, is_admin)
select u.id, '', 'Parish Secretary', not exists (select 1 from profiles where is_admin)
from auth.users u
where not exists (select 1 from profiles p where p.id = u.id);

-- 2. New accounts get a profile straight away.
create or replace function public.handle_new_staff_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, name, role)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), ''), 'Parish Secretary')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_staff_profile();
