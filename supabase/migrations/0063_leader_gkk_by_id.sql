-- GKK leaders: the account's GKK by its id, not its name. Run after
-- 0062_access_hardening.sql. Safe to re-run.
--
-- Before, profiles.access_gkk held the GKK's name, and renaming the GKK
-- (rename_gkk) left it behind: the leader signed in to an empty registry.
-- Notifications kept the old name too, so a leader lost their GKK's
-- notifications the same way. Now:
--   * profiles.access_gkk_id points at gkks(id), and staff_gkk() reads the
--     GKK's current name through it, so a rename never costs a leader their
--     GKK. A GKK assigned to a leader's account can't be deleted until the
--     account is changed.
--   * Renaming a GKK carries the new name to its households (as rename_gkk
--     did), its staff notifications and its leaders' accounts, however the
--     name is changed.
--   * profiles.access_gkk stays, kept in step with the id by a trigger, for
--     app versions and Edge Functions from before this migration (they read
--     and save the name). Nothing new reads it.
--   * Notifications saved under a GKK's name from before it got its "GKK "
--     prefix take the current name.

do $$
begin
  if to_regprocedure('public.staff_sees_census()') is null or to_regclass('public.member_blood_types') is null then
    raise exception 'Run the migrations up to 0062_access_hardening.sql before this one';
  end if;
end;
$$;

-- ---- the leader's GKK by id ---------------------------------------------------

alter table profiles add column if not exists access_gkk_id integer references gkks(id) on delete restrict;

-- By name, or by the name from before the GKK got its "GKK " prefix (a
-- leader set up then lost their GKK at the rename).
update profiles p set access_gkk_id = coalesce(
    (select g.id from gkks g where g.name = trim(p.access_gkk)),
    (select g.id from gkks g where g.name = 'GKK ' || trim(p.access_gkk)))
where p.access = 'gkk_leader' and p.access_gkk_id is null;

do $$
declare lost text;
begin
  select string_agg(coalesce(nullif(trim(name), ''), id::text) || ' (' || coalesce(access_gkk, 'no GKK') || ')', ', ') into lost
  from profiles where access = 'gkk_leader' and access_gkk_id is null;
  if lost is not null then
    raise exception 'These GKK leader accounts name a GKK that is not in the GKK list: %. Set their GKK in Settings → Staff, then run this again.', lost;
  end if;
end;
$$;

alter table profiles drop constraint if exists profiles_access_gkk_check;
alter table profiles drop constraint if exists profiles_access_gkk_id_check;
alter table profiles add constraint profiles_access_gkk_id_check
  check (access is distinct from 'gkk_leader' or access_gkk_id is not null);

-- Only a GKK leader has a GKK. A save by name (an app version or Edge Function
-- from before 0063) finds the id; then the name is the GKK's current one.
create or replace function public.profiles_access_gkk_sync() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.access is distinct from 'gkk_leader' then
    new.access_gkk_id := null;
  elsif new.access_gkk_id is null
     or (tg_op = 'UPDATE' and new.access_gkk is distinct from old.access_gkk
         and new.access_gkk_id is not distinct from old.access_gkk_id) then
    new.access_gkk_id := coalesce((select id from gkks where name = trim(new.access_gkk)), new.access_gkk_id);
  end if;
  new.access_gkk := (select name from gkks where id = new.access_gkk_id);
  return new;
end;
$$;
revoke execute on function public.profiles_access_gkk_sync() from public, anon, authenticated;

drop trigger if exists trg_profiles_access_gkk_sync on profiles;
create trigger trg_profiles_access_gkk_sync before insert or update on profiles
  for each row execute function profiles_access_gkk_sync();

-- The names as the trigger keeps them, for the accounts set by id above.
update profiles set access_gkk_id = access_gkk_id where access = 'gkk_leader';

-- As in 0014, through the id.
create or replace function public.staff_gkk() returns text
language sql stable security definer set search_path = public as $$
  select g.name from profiles p join gkks g on g.id = p.access_gkk_id
  where p.id = auth.uid() and p.access = 'gkk_leader';
$$;

-- As in 0060, with the leader's GKK through the id.
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
    and notification_visible_to(coalesce(p.access, 'full'), lg.name, n.area, n.gkk)
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

-- ---- renaming a GKK -------------------------------------------------------------

-- Households, staff notifications and the leaders' accounts keep the GKK by
-- name; a rename takes them along.
create or replace function public.gkks_rename_cascade() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update households set gkk = new.name where gkk = old.name;
  update staff_notifications set gkk = new.name where gkk = old.name;
  update profiles set access_gkk = new.name where access_gkk_id = new.id;
  return null;
end;
$$;
revoke execute on function public.gkks_rename_cascade() from public, anon, authenticated;

drop trigger if exists trg_gkks_rename_cascade on gkks;
create trigger trg_gkks_rename_cascade after update of name on gkks
  for each row when (old.name is distinct from new.name) execute function gkks_rename_cascade();

-- As in 0010; trg_gkks_rename_cascade now moves the households.
create or replace function public.rename_gkk(old_name text, new_name text) returns void
language plpgsql set search_path = public as $$
begin
  if coalesce(trim(new_name), '') = '' then raise exception 'Name is required'; end if;
  update gkks set name = trim(new_name) where name = old_name;
  if not found then raise exception 'GKK not found'; end if;
end;
$$;

-- As in 0010, explaining a GKK still assigned to a leader's account.
create or replace function public.delete_gkk(target_name text) returns void
language plpgsql set search_path = public as $$
declare
  in_use integer;
  blocker text;
begin
  select count(*) into in_use from households where gkk = target_name;
  if in_use > 0 then raise exception 'This GKK is assigned to a household and cannot be deleted'; end if;
  delete from gkks where name = target_name;
exception when foreign_key_violation then
  get stacked diagnostics blocker = constraint_name;
  if blocker = 'profiles_access_gkk_id_fkey' then
    raise exception 'This GKK is assigned to a GKK leader''s staff account. Change that account in Settings → Staff first.';
  end if;
  raise;
end;
$$;

-- ---- notifications under a GKK's older name -----------------------------------

update staff_notifications n set gkk = 'GKK ' || n.gkk
where n.gkk is not null
  and not exists (select 1 from gkks g where g.name = n.gkk)
  and exists (select 1 from gkks g where g.name = 'GKK ' || n.gkk);

notify pgrst, 'reload schema';
