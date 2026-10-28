-- A new login has no access until a staff admin gives it some. Run after
-- 0064_household_gkk_link.sql. Safe to re-run.
--
-- Every new login gets a profile (handle_new_staff_profile, 0020), and
-- profiles.access defaulted to 'full'. With sign-ups open on the auth
-- project, anyone could sign themselves up with the public app key and read
-- and change the whole registry. Now the profile starts with no access level,
-- which staff_access() reads as 'none' (0062): the account sees nothing until
-- a staff admin sets its access in Settings → Staff (manage-staff sets it on
-- every account it creates). Phone notifications and dismissing possible
-- duplicates follow the same rule.

do $$
begin
  if to_regclass('public.households') is null or to_regprocedure('public.staff_access()') is null then
    raise exception 'Run the earlier migrations first';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'households_gkk_fkey') then
    raise exception 'Run 0064_household_gkk_link.sql before this migration';
  end if;
end;
$$;

alter table profiles alter column access drop default;
alter table profiles alter column access drop not null;

-- As in 0062: signed out is null; a login without a profile or without an
-- access level is 'none'.
create or replace function public.staff_access() returns text
language sql stable security definer set search_path = public as $$
  select case when auth.uid() is null then null
              else coalesce((select access from profiles where id = auth.uid()), 'none') end;
$$;

-- As in 0063, with no access level meaning no notifications.
create or replace function public.notification_push_targets(p_id bigint)
returns table (id bigint, endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select s.id, s.endpoint, s.p256dh, s.auth
  from staff_notifications n
  cross join staff_push_subscriptions s
  join auth.users u on u.id = s.user_id
  left join profiles p on p.id = s.user_id
  left join gkks lg on lg.id = p.access_gkk_id
  left join staff_notify_prefs pr on pr.user_id = s.user_id
  where n.id = p_id
    and (u.banned_until is null or u.banned_until <= now())
    and notification_visible_to(coalesce(p.access, 'none'), lg.name, n.area, n.gkk)
    and case
          when n.kind = 'digest' then coalesce(pr.digest, true)
          else case coalesce(pr.push_level, 'requests')
            when 'all' then true
            when 'requests' then n.kind in ('anointing', 'certificate', 'ocia', 'blood', 'donor', 'census', 'gkk_history')
            when 'urgent' then n.urgent
            else false
          end
        end;
$$;

-- As in 0050, refusing every account that can't change records (a new login
-- without access, read only, website), not just read only and website.
create or replace function public.dismiss_duplicate_group(p_member_ids integer[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  staff_name text;
  ids integer[];
begin
  select coalesce(nullif(trim(p.name), ''), u.email) into staff_name
  from profiles p join auth.users u on u.id = p.id
  where p.id = auth.uid();
  if staff_name is null then raise exception 'Only parish staff can dismiss possible duplicates'; end if;

  select array_agg(distinct x order by x) into ids from unnest(p_member_ids) as x where x is not null;
  if coalesce(array_length(ids, 1), 0) < 2 then raise exception 'Choose at least two members'; end if;

  if staff_access() is distinct from 'full' and staff_access() is distinct from 'gkk_leader' then
    raise exception 'Your account can view records but not change them' using errcode = '42501';
  end if;
  if staff_access() = 'gkk_leader' and not members_in_leader_gkk(ids) then
    raise exception 'Your account can only review the members of %', staff_gkk() using errcode = '42501';
  end if;

  insert into duplicate_dismissals (member_ids, dismissed_by, dismissed_by_name)
  values (ids, auth.uid(), staff_name)
  on conflict (member_ids) do nothing;
end;
$$;
