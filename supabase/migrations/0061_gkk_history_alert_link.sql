-- GKK history to review: the notification (0060) opens that GKK's History
-- tab under Parish Config → Parish GKK, where the office reviews and
-- publishes it, instead of only the GKK list. The link carries the GKK's id
-- (?tab=gkk&history=<id>), which survives a rename and needs no escaping.
-- Run after 0060_gkk_history_review_alert.sql. Safe to re-run.

do $$
begin
  if to_regprocedure('public.notify_gkk_history_review()') is null then
    raise exception 'Run 0060_gkk_history_review_alert.sql before this migration';
  end if;
end;
$$;

-- As in 0060, with the GKK's own link.
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
        '/admin/settings?tab=gkk&history=' || new.id
      );
    end if;
  exception when others then
    raise warning 'notify_gkk_history_review: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.notify_gkk_history_review() from public, anon, authenticated;

-- The alerts already in the bell open their GKK too.
update staff_notifications n
set link = '/admin/settings?tab=gkk&history=' || g.id
from gkks g
where n.kind = 'gkk_history' and n.gkk = g.name and n.link = '/admin/settings?tab=gkk';
