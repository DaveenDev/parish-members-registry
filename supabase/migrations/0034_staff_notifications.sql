-- Staff notifications: tell the parish office when someone sends something
-- from the website (a certificate request, joining OCIA, the Anointing of the
-- Sick, a blood request, a household registration, a census update), and
-- every morning at 7:00 what is still waiting. Run after
-- 0033_sacrament_request_status.sql. Safe to re-run.
--
-- One list, staff_notifications, feeds:
--   * the bell in the admin panel (live, through Supabase Realtime)
--   * phone and computer notifications (Web Push), sent by the notify-staff
--     Edge Function, which this database calls through pg_net
--   * the 7:00 AM summary, a pg_cron job that adds one more notification
--
-- A new kind of request only needs one more branch in notify_new_request()
-- and its trigger at the bottom of this file.
--
-- The bell works with this migration alone. Phone notifications also need
-- the notify-staff Edge Function (see docs/notifications.md).

-- Stop early, naming the missing file, if an earlier migration hasn't run.
do $$
begin
  if to_regclass('public.sacrament_requests') is null then
    raise exception 'Run 0032_sacrament_requests.sql before this migration';
  end if;
end;
$$;

-- pg_net lets the database call the Edge Function, pg_cron runs the morning
-- summary. Both come with every Supabase project (free plan included); if
-- either can't be turned on here, the bell still works without it.
do $$
begin
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net is not available (%): phone notifications will not be sent', sqlerrm;
  end;
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise notice 'pg_cron is not available (%): no 7:00 AM summary', sqlerrm;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who sees what
-- ---------------------------------------------------------------------------

-- Same rule as staff_can_see() and staff_sees_gkk() (0014), for any account
-- rather than only the signed-in one, so the Edge Function can pick who to
-- notify. `area` is 'requests' or 'registry'; `gkk` is the household's GKK
-- for registry notifications, so GKK leaders hear about their own GKK.
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

-- ---------------------------------------------------------------------------
-- The notifications
-- ---------------------------------------------------------------------------

create table if not exists staff_notifications (
  id          bigserial primary key,
  kind        text not null,      -- certificate, ocia, anointing, blood, registration, census, digest
  area        text not null check (area in ('requests', 'registry')),
  gkk         text,
  ref_no      text,
  title       text not null,      -- shown on the phone: no names or contact details
  detail      text,               -- shown only inside the admin panel
  link        text not null default '/admin',
  urgent      boolean not null default false,
  pushed_at   timestamptz,        -- when the Edge Function sent it to phones
  created_at  timestamptz not null default now()
);

create index if not exists staff_notifications_created_idx on staff_notifications (created_at desc);

alter table staff_notifications enable row level security;
drop policy if exists staff_notifications_select on staff_notifications;
create policy staff_notifications_select on staff_notifications for select to authenticated
  using (notification_visible_to(staff_access(), staff_gkk(), area, gkk));
revoke all on staff_notifications from anon, authenticated;
grant select on staff_notifications to authenticated;

-- Each account's bell (when it was last opened) and what it wants on its
-- phones. No row yet means: everything, plus the morning summary.
create table if not exists staff_notify_prefs (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  seen_at     timestamptz,
  push_level  text not null default 'all' check (push_level in ('all', 'urgent', 'none')),
  digest      boolean not null default true,
  updated_at  timestamptz not null default now()
);

alter table staff_notify_prefs enable row level security;
drop policy if exists staff_notify_prefs_own on staff_notify_prefs;
create policy staff_notify_prefs_own on staff_notify_prefs for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on staff_notify_prefs from anon;
grant select, insert, update, delete on staff_notify_prefs to authenticated;

-- The phones and computers each account turned notifications on for: the
-- browser's push subscription. Only push services' own addresses are kept.
create table if not exists staff_push_subscriptions (
  id          bigserial primary key,
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint    text not null unique check (endpoint ~ '^https://'),
  p256dh      text not null,
  auth        text not null,
  device      text,
  created_at  timestamptz not null default now(),
  last_ok_at  timestamptz
);

create index if not exists staff_push_subscriptions_user_idx on staff_push_subscriptions (user_id);

alter table staff_push_subscriptions enable row level security;
drop policy if exists staff_push_subscriptions_own on staff_push_subscriptions;
create policy staff_push_subscriptions_own on staff_push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on staff_push_subscriptions from anon;
grant select, insert, update, delete on staff_push_subscriptions to authenticated;
grant usage, select on sequence staff_push_subscriptions_id_seq to authenticated;

-- The Edge Function's settings. Nobody signed in can read this table: the
-- function fills in the push keys and its own address the first time a
-- staff member turns on notifications, and the database calls it with
-- hook_secret.
create table if not exists notify_config (
  id                 integer primary key default 1 check (id = 1),
  function_url       text,
  hook_secret        text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  vapid_public_key   text,
  vapid_private_jwk  jsonb,
  contact            text,
  updated_at         timestamptz not null default now()
);

insert into notify_config (id) values (1) on conflict (id) do nothing;
alter table notify_config enable row level security;
revoke all on notify_config from anon, authenticated;

-- ---------------------------------------------------------------------------
-- New requests from the website
-- ---------------------------------------------------------------------------

-- AFTER INSERT on each request table. Only what the public sends (the
-- website's anonymous submit functions); a request staff type in for a
-- walk-in, a restore from the Trash or the demo data adds nothing. A problem
-- here never stops the request itself from being saved.
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

    else
      null;
    end case;
  exception when others then
    raise warning 'notify_new_request on %: %', tg_table_name, sqlerrm;
  end;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['certificate_requests', 'sacrament_requests', 'blood_requests', 'households', 'census_submissions'] loop
    execute format('drop trigger if exists trg_zz_notify_staff on %I', t);
    execute format('create trigger trg_zz_notify_staff after insert on %I for each row execute function public.notify_new_request()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Phone notifications: hand each new notification to the Edge Function
-- ---------------------------------------------------------------------------

-- pg_net sends the call after the request is saved, in the background, so a
-- slow or missing Edge Function never delays or fails the website's form.
create or replace function public.staff_notifications_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cfg notify_config;
begin
  select * into cfg from notify_config where id = 1;
  if cfg.function_url is null or cfg.vapid_public_key is null or to_regnamespace('net') is null then
    return new;
  end if;
  if not exists (select 1 from staff_push_subscriptions) then
    return new;
  end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3, timeout_milliseconds := 10000)'
      using cfg.function_url,
            jsonb_build_object('action', 'deliver', 'id', new.id),
            jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', cfg.hook_secret);
  exception when others then
    raise warning 'staff_notifications_push: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_staff_notifications_push on staff_notifications;
create trigger trg_staff_notifications_push after insert on staff_notifications
for each row execute function public.staff_notifications_push();

-- The devices to send notification `p_id` to: accounts that may see it, are
-- not disabled, and asked for this kind (staff_notify_prefs). For the Edge
-- Function only.
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
          else coalesce(pr.push_level, 'all') = 'all' or (pr.push_level = 'urgent' and n.urgent)
        end;
$$;

-- ---------------------------------------------------------------------------
-- The bell
-- ---------------------------------------------------------------------------

-- Opening the bell marks everything up to now as seen, by the database's clock.
create or replace function public.mark_staff_notifications_seen() returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  t timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'Please sign in again';
  end if;
  insert into staff_notify_prefs (user_id, seen_at) values (auth.uid(), t)
  on conflict (user_id) do update set seen_at = excluded.seen_at, updated_at = now();
  return t;
end;
$$;

-- Turning notifications on for this device. A browser has one push address,
-- so on a shared office computer the device moves to whoever turned it on
-- last, instead of failing on the other account's row.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_device text)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  saved bigint;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'This browser sent an incomplete push subscription';
  end if;
  delete from staff_push_subscriptions where endpoint = p_endpoint and user_id <> auth.uid();
  insert into staff_push_subscriptions (user_id, endpoint, p256dh, auth, device)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_device, 80))
  on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth, device = excluded.device
  returning id into saved;
  return saved;
end;
$$;

-- Live updates for the bell. Realtime applies the select policy above, so
-- each account only hears about what it may see.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'staff_notifications') then
    alter publication supabase_realtime add table staff_notifications;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The 7:00 AM summary
-- ---------------------------------------------------------------------------

-- "3 certificates" / "1 certificate"; nothing for zero.
create or replace function public.count_phrase(n bigint, one text, many text) returns text
language sql immutable as $$
  select case when n = 1 then '1 ' || one when n > 1 then n || ' ' || many end;
$$;

-- What is still waiting, as one notification for the office (staff who may
-- see the Requests queues also see the registry). Nothing waiting, nothing
-- sent. Also clears notifications older than 60 days.
create or replace function public.send_morning_digest() returns void
language plpgsql security definer set search_path = public as $$
declare
  certs bigint; ocia bigint; anoint bigint; blood bigint;
  pending bigint; census bigint; overdue bigint;
  requests bigint; parts text[]; title text;
begin
  delete from staff_notifications where created_at < now() - interval '60 days';

  select count(*) into certs from certificate_requests where status in ('Received', 'Being prepared');
  select count(*) filter (where sacrament = 'ocia'), count(*) filter (where sacrament = 'anointing')
    into ocia, anoint from sacrament_requests where status = 'New';
  select count(*) into blood from blood_requests where status in ('Open', 'Contacting donors');
  select count(*) into pending from households where status = 'Pending';
  select count(*) into census from census_submissions s join census_cycles c on c.id = s.cycle_id
    where s.status = 'Pending' and c.status = 'Open';
  select (select count(*) from certificate_requests where status in ('Received', 'Being prepared') and created_at < now() - interval '3 days')
       + (select count(*) from sacrament_requests where status = 'New' and created_at < now() - interval '3 days')
       + (select count(*) from blood_requests where status = 'Open' and created_at < now() - interval '3 days')
    into overdue;

  requests := certs + ocia + anoint + blood;
  if requests + pending + census = 0 then
    return;
  end if;

  parts := array_remove(array[
    count_phrase(anoint, 'Anointing of the Sick', 'Anointing of the Sick'),
    count_phrase(blood, 'blood request', 'blood requests'),
    count_phrase(certs, 'certificate', 'certificates'),
    count_phrase(ocia, 'OCIA enrolment', 'OCIA enrolments'),
    count_phrase(pending, 'household to verify', 'households to verify'),
    count_phrase(census, 'census update', 'census updates')
  ], null);

  title := case
    when requests > 0 then 'Good morning: ' || count_phrase(requests, 'request waiting', 'requests waiting')
    else 'Good morning: ' || count_phrase(pending + census, 'item to review', 'items to review')
  end;

  insert into staff_notifications (kind, area, title, detail, link, urgent)
  values ('digest', 'requests', title,
    array_to_string(parts, ', ') || coalesce(' · ' || count_phrase(overdue, 'waiting over 3 days', 'waiting over 3 days'), ''),
    case when requests > 0 then '/admin/requests' else '/admin' end,
    anoint + blood > 0);
end;
$$;

-- 23:00 UTC is 7:00 AM in the Philippines. Scheduling again under the same
-- name replaces the old schedule.
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('staff-morning-digest', '0 23 * * *', 'select public.send_morning_digest()');
  end if;
exception when others then
  raise notice 'Could not schedule the morning summary: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.notify_new_request() from public, anon, authenticated;
revoke all on function public.staff_notifications_push() from public, anon, authenticated;
revoke all on function public.notification_push_targets(bigint) from public, anon, authenticated;
revoke all on function public.send_morning_digest() from public, anon, authenticated;
revoke all on function public.mark_staff_notifications_seen() from public, anon;
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;

grant execute on function public.notification_visible_to(text, text, text, text) to authenticated;
grant execute on function public.notification_push_targets(bigint) to service_role;
grant execute on function public.send_morning_digest() to service_role;
grant execute on function public.mark_staff_notifications_seen() to authenticated;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
