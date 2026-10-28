-- Staff notifications (0034): a new phone-notification choice, "Member
-- requests only", now the default. It sends what parishioners ask for from
-- the website: the Anointing of the Sick (Dihog), certificates, OCIA, the
-- blood donor call (blood requests and new donors) and census updates from
-- families; not new household registrations. New blood donors now notify
-- too (kind 'donor'). The bell in the admin panel still lists everything.
-- Run after 0034_staff_notifications.sql. Safe to re-run.
--
-- Accounts still on the old default ("Every new request") move to the new
-- one; anyone can switch back under Settings → Notifications.

do $$
begin
  if to_regclass('public.staff_notify_prefs') is null then
    raise exception 'Run 0034_staff_notifications.sql before this migration';
  end if;
end;
$$;

-- push_level: all | requests | urgent | none
alter table staff_notify_prefs drop constraint if exists staff_notify_prefs_push_level_check;
alter table staff_notify_prefs add constraint staff_notify_prefs_push_level_check
  check (push_level in ('all', 'requests', 'urgent', 'none'));
alter table staff_notify_prefs alter column push_level set default 'requests';
update staff_notify_prefs set push_level = 'requests', updated_at = now() where push_level = 'all';

-- ---------------------------------------------------------------------------
-- New requests from the website: as in 0034, plus new blood donors
-- ---------------------------------------------------------------------------

create or replace function public.notify_new_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r jsonb := to_jsonb(new);
  hh households;
begin
  if coalesce(auth.role(), '') <> 'anon' then
    return new;
  end if;

  begin
    case tg_table_name
    when 'certificate_requests' then
      insert into staff_notifications (kind, area, ref_no, title, detail, link)
      values ('certificate', 'requests', (r->>'ref_no'),
        'Certificate request: ' || case r->>'cert_type' when 'baptism' then 'Baptismal' when 'confirmation' then 'Confirmation'
                                                        when 'matrimony' then 'Marriage' else coalesce(r->>'cert_type', '') end,
        concat_ws(' ', r->>'subject_first_name', r->>'subject_last_name'),
        '/admin/requests?q=' || (r->>'ref_no'));

    when 'sacrament_requests' then
      if r->>'sacrament' = 'anointing' then
        insert into staff_notifications (kind, area, ref_no, title, detail, link, urgent)
        values ('anointing', 'requests', (r->>'ref_no'),
          case when (r->>'urgent')::boolean then 'Anointing of the Sick: gravely ill' else 'Anointing of the Sick request' end,
          concat_ws(' · ', r->>'person_name', r->>'location'),
          '/admin/requests?tab=sacraments&q=' || (r->>'ref_no'), true);
      else
        insert into staff_notifications (kind, area, ref_no, title, detail, link)
        values ('ocia', 'requests', (r->>'ref_no'), 'OCIA enrolment',
          r->>'person_name', '/admin/requests?tab=sacraments&q=' || (r->>'ref_no'));
      end if;

    when 'blood_requests' then
      insert into staff_notifications (kind, area, ref_no, title, detail, link, urgent)
      values ('blood', 'requests', (r->>'ref_no'), 'Blood request: ' || coalesce(r->>'blood_type', ''),
        concat_ws(' · ', r->>'patient_name', r->>'hospital'), '/admin/requests?tab=blood', true);

    when 'households' then
      insert into staff_notifications (kind, area, gkk, ref_no, title, detail, link)
      values ('registration', 'registry', r->>'gkk', (r->>'ref_no'), 'New household registration',
        concat_ws(' · ', r->>'household_name', r->>'gkk'),
        '/admin/households?status=Pending&q=' || (r->>'ref_no'));

    when 'census_submissions' then
      select * into hh from households where id = (r->>'household_id')::integer;
      insert into staff_notifications (kind, area, gkk, ref_no, title, detail, link)
      values ('census', 'registry', hh.gkk, hh.ref_no, 'Census update to review',
        concat_ws(' · ', hh.household_name, hh.gkk), '/admin/census');

    when 'blood_donors' then
      insert into staff_notifications (kind, area, gkk, title, detail, link)
      values ('donor', 'requests', r->>'gkk', 'New blood donor' || coalesce(': ' || (r->>'blood_type'), ''),
        concat_ws(' · ', r->>'full_name', r->>'gkk'), '/admin/requests?tab=blood');

    else
      null;
    end case;
  exception when others then
    raise warning 'notify_new_request on %: %', tg_table_name, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_zz_notify_staff on blood_donors;
create trigger trg_zz_notify_staff after insert on blood_donors
for each row execute function public.notify_new_request();

-- ---------------------------------------------------------------------------
-- Who gets each phone notification: as in 0034, with "member requests only"
-- (also for accounts that never chose)
-- ---------------------------------------------------------------------------

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
            when 'requests' then n.kind in ('anointing', 'certificate', 'ocia', 'blood', 'donor', 'census')
            when 'urgent' then n.urgent
            else false
          end
        end;
$$;

-- Same access as in 0034: only the notify-staff Edge Function asks this.
revoke all on function public.notification_push_targets(bigint) from public, anon, authenticated;
grant execute on function public.notification_push_targets(bigint) to service_role;
