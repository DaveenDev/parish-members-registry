-- GKK history to review: when a GKK leader changes their GKK's history (its
-- text or photos), 0045 takes it off the website until staff publish it
-- again. This tells the parish office, in the bell and on phones, so the
-- secretary can review and republish it. Run after
-- 0059_gkk_directory_photo.sql. Safe to re-run.
--
-- The notification has its own area, 'website': only full-access staff see
-- it, the only accounts that can publish a GKK's history (Parish Config →
-- Parish GKK). It's not shown to GKK leaders, read-only or website accounts.

do $$
begin
  if to_regprocedure('public.gkks_leader_history_draft()') is null then
    raise exception 'Run 0045_gkk_leader_my_gkk.sql before this migration';
  end if;
  if to_regclass('public.staff_notifications') is null then
    raise exception 'Run 0034_staff_notifications.sql before this migration';
  end if;
end;
$$;

-- A third area, for the website's content waiting on staff.
alter table staff_notifications drop constraint if exists staff_notifications_area_check;
alter table staff_notifications add constraint staff_notifications_area_check
  check (area in ('requests', 'registry', 'website'));

-- Same as 0034, written out so 'website' is plainly full access only.
create or replace function public.notification_visible_to(acc text, acc_gkk text, area text, gkk text)
returns boolean
language sql immutable as $$
  select case
    when acc is null then false
    when acc = 'full' then true
    when acc in ('read_only', 'website') then area in ('requests', 'registry')
    when acc = 'gkk_leader' then area = 'registry' and gkk is not null and gkk = acc_gkk
    else false
  end;
$$;

-- AFTER UPDATE on gkks: a leader's change to the history. One alert per GKK
-- per half hour, so saving several times in a row doesn't flood the bell.
-- A problem here never stops the leader's save.
create or replace function public.notify_gkk_history_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if staff_access() is distinct from 'gkk_leader'
     or (new.history is not distinct from old.history and new.history_photos is not distinct from old.history_photos) then
    return null;
  end if;

  begin
    if not exists (
      select 1 from staff_notifications
      where kind = 'gkk_history' and gkk = new.name and created_at > now() - interval '30 minutes'
    ) then
      insert into staff_notifications (kind, area, gkk, title, detail, link)
      values (
        'gkk_history', 'website', new.name,
        case when old.history_published
          then 'GKK history taken off the website: review and republish'
          else 'GKK history to review for the website' end,
        new.name || case when old.history_published
          then ': the GKK leader changed it, so it is off the website until it is published again.'
          else ': the GKK leader updated it.' end,
        '/admin/settings?tab=gkk'
      );
    end if;
  exception when others then
    raise warning 'notify_gkk_history_review: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.notify_gkk_history_review() from public, anon, authenticated;

drop trigger if exists trg_zz_notify_gkk_history on gkks;
create trigger trg_zz_notify_gkk_history after update of history, history_photos on gkks
  for each row execute function notify_gkk_history_review();

-- Phones: as in 0037, with the history alert also sent to accounts on
-- "Member requests only" (the default), so the office hears about it.
create or replace function public.notification_push_targets(p_id bigint)
returns table (id bigint, endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select s.id, s.endpoint, s.p256dh, s.auth
  from staff_notifications n
  cross join staff_push_subscriptions s
  join auth.users u on u.id = s.user_id
  left join profiles p on p.id = s.user_id
  left join staff_notify_prefs pr on pr.user_id = s.user_id
  where n.id = p_id
    and (u.banned_until is null or u.banned_until <= now())
    and notification_visible_to(coalesce(p.access, 'full'), p.access_gkk, n.area, n.gkk)
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

revoke all on function public.notification_push_targets(bigint) from public, anon, authenticated;
grant execute on function public.notification_push_targets(bigint) to service_role;
