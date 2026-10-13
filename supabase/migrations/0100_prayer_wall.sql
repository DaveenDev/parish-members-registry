-- Prayer requests come back as a prayer wall on the website: Komunidad →
-- Mga Hangyo sa Pag-ampo (/komunidad/pag-ampo), each request with a page of
-- its own, a running line of them on Home, and a "Nag-ampo ko" (I prayed)
-- button with a count. Run after 0099_registration_rate_limit.sql. Safe to
-- re-run.
--
-- 0035 took the old feature away but kept the prayer_requests table (0012).
-- This adds to it:
--   show_until   the last day it shows on the website: the person asking
--                picks it (up to 90 days ahead); staff can change it
--   show_name    whether their name shows with it ("Usa ka parokyano" if not)
--   reviewed_at  when staff decided whether to show it; null while it waits
-- A request shows only when the person asked for it (allow_public), staff
-- approved it (show_publicly), it isn't archived and show_until hasn't
-- passed. The others are for the priest and the office only.
--
-- "Nag-ampo ko" taps are counted once per request per browser, by a random
-- id the browser keeps (stored hashed), never with a name. The public gets
-- in only through pray_for_request(), with the same hourly limits as the
-- forms.

do $$
begin
  if to_regclass('public.prayer_requests') is null
     or to_regprocedure('public.registration_guard()') is null
     or to_regprocedure('public.notification_push_targets(bigint)') is null then
    raise exception 'Run the migrations up to 0099_registration_rate_limit.sql before this one';
  end if;
end;
$$;

-- ---- the requests ------------------------------------------------------------------

alter table prayer_requests add column if not exists show_until date;
alter table prayer_requests add column if not exists show_name boolean not null default false;
alter table prayer_requests add column if not exists reviewed_by_name text;

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'prayer_requests' and column_name = 'reviewed_at') then
    alter table prayer_requests add column reviewed_at timestamptz;
    -- Intentions saved before 0035 aren't waiting for anyone now. With no
    -- show_until they stay off the website until staff give them a date.
    -- Triggers off, so "last updated" and the activity log stay as they were.
    alter table prayer_requests disable trigger user;
    update prayer_requests set reviewed_at = updated_at;
    alter table prayer_requests enable trigger user;
  end if;
end;
$$;

create index if not exists prayer_requests_shown_idx on prayer_requests (show_until) where show_publicly;

-- As 0039 did for the other request tables: the access check once per query.
alter policy prayer_requests_admin_all on prayer_requests using ((select staff_can_see('requests')));

-- Staff deciding (Show on the website / Don't show) marks a request
-- reviewed: when, and by whom. The admin sends any reviewed_at to say
-- "decided" when show_publicly stays false.
create or replace function public.prayer_requests_reviewed() returns trigger
language plpgsql as $$
declare
  decided boolean;
begin
  if tg_op = 'INSERT' then
    decided := true;
  else
    decided := new.show_publicly is distinct from old.show_publicly or new.reviewed_at is distinct from old.reviewed_at;
  end if;
  if decided then
    if new.show_publicly or new.reviewed_at is not null then
      new.reviewed_at := now();
      new.reviewed_by_name := current_staff_name();
    else
      new.reviewed_by_name := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prayer_requests_reviewed on prayer_requests;
create trigger trg_prayer_requests_reviewed before insert or update on prayer_requests
for each row execute function public.prayer_requests_reviewed();

-- ---- "Nag-ampo ko" ----------------------------------------------------------------

create table if not exists prayer_request_prayers (
  request_id  integer not null references prayer_requests(id) on delete cascade,
  visitor     text not null,  -- md5 of the browser's random id (prayer_visitor_key)
  created_at  timestamptz not null default now(),
  primary key (request_id, visitor)
);

alter table prayer_request_prayers enable row level security;
revoke all on prayer_request_prayers from anon, authenticated;
grant select on prayer_request_prayers to authenticated;
drop policy if exists prayer_request_prayers_staff_select on prayer_request_prayers;
create policy prayer_request_prayers_staff_select on prayer_request_prayers for select to authenticated
  using ((select staff_can_see('requests')));

/** The stored form of a browser's id; null for anything that isn't one. */
create or replace function public.prayer_visitor_key(p_visitor text) returns text
language sql immutable as $$
  select case when p_visitor ~ '^[A-Za-z0-9-]{16,64}$' then md5('olg-prayer|' || p_visitor) end;
$$;

/** Whether the website shows `r` today. Same rule as isShownNow() in client/src/lib/prayers.js. */
create or replace function public.prayer_request_is_public(r prayer_requests) returns boolean
language sql stable set search_path = public as $$
  select r.allow_public and r.show_publicly and r.status <> 'Archived'
     and r.show_until is not null and r.show_until >= parish_today();
$$;

/** What the website gets of one request: no contact details, the name only when they chose to show it. */
create or replace function public.prayer_request_public_json(r prayer_requests, p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id,
    'type', r.intention_type,
    'for_name', r.for_name,
    'name', case when r.show_name then r.requester_name end,
    'intention', r.intention,
    'date', (r.created_at at time zone 'Asia/Manila')::date,
    'show_until', r.show_until,
    'offered_on', case when r.status = 'Prayed for' then r.offered_on end,
    'prayed', (select count(*) from prayer_request_prayers p where p.request_id = r.id),
    'prayed_by_me', p_key is not null and exists (select 1 from prayer_request_prayers p where p.request_id = r.id and p.visitor = p_key)
  );
$$;

-- ---- the website: send, read, pray --------------------------------------------------

-- As 0012's, with the date to show until, whether to show the name, and
-- consent. The name is asked for (staff see it); the mobile is optional.
-- Keep PRAYER_MAX_DAYS in client/src/lib/prayers.js at the same 90 days.
create or replace function public.submit_prayer_request(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  itype text := coalesce(payload_text(payload, 'intentionType', 40), 'Special intention');
  shown boolean := coalesce((payload->>'allowPublic')::boolean, false);
  mobile text := payload_text(payload, 'requesterMobile', 30);
  until date;
  saved prayer_requests;
begin
  if payload_text(payload, 'website') is not null then
    return jsonb_build_object('ref_no', generate_request_ref('PR'));
  end if;
  if coalesce((payload->>'consent')::boolean, false) is not true then
    raise exception 'Palihug i-check ang pagtugot (consent) sa dili pa ipadala.';
  end if;
  if itype not in ('For the sick', 'Thanksgiving', 'For the departed', 'Special intention') then
    itype := 'Special intention';
  end if;
  if payload_text(payload, 'intention') is null then
    raise exception 'Palihug isulat ang inyong hangyo sa pag-ampo.';
  end if;
  if payload_text(payload, 'requesterName') is null then
    raise exception 'Palihug isulat ang inyong ngalan.';
  end if;
  if shown then
    begin
      until := payload_text(payload, 'showUntil', 10)::date;
    exception when others then
      until := null;
    end;
    if until is null or until < parish_today() or until > parish_today() + 90 then
      raise exception 'Palihug pilia kung hangtod kanus-a kini ipakita: sulod sa 90 ka adlaw gikan karon.';
    end if;
  end if;
  if mobile is not null then
    mobile := require_mobile(mobile);
  end if;
  perform public_request_guard('prayer', 10, 300);

  insert into prayer_requests (intention_type, intention, for_name, requester_name, requester_mobile, allow_public, show_until, show_name)
  values (
    itype,
    payload_text(payload, 'intention', 1000),
    payload_text(payload, 'forName', 120),
    payload_text(payload, 'requesterName', 120),
    mobile,
    shown,
    case when shown then until end,
    shown and coalesce((payload->>'showName')::boolean, false)
  ) returning * into saved;

  return jsonb_build_object('ref_no', saved.ref_no);
end;
$$;

/** The prayer wall: what shows today, newest on the wall first. `p_visitor` marks the ones this browser prayed for. */
create or replace function public.public_prayer_requests(p_visitor text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(prayer_request_public_json(r, prayer_visitor_key(p_visitor))
                            order by coalesce(r.reviewed_at, r.created_at) desc, r.id desc), '[]'::jsonb)
  from prayer_requests r
  where r.id in (select p.id from prayer_requests p
                 where prayer_request_is_public(p)
                 order by coalesce(p.reviewed_at, p.created_at) desc, p.id desc
                 limit 200);
$$;

/** One request's page, or null when it doesn't show (any more). */
create or replace function public.public_prayer_request(p_id integer, p_visitor text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select prayer_request_public_json(r, prayer_visitor_key(p_visitor))
  from prayer_requests r
  where r.id = p_id and prayer_request_is_public(r);
$$;

-- "Nag-ampo ko": once per request per browser; again just answers the count.
-- 120 taps an hour from one internet address (a family or the parish Wi-Fi
-- shares one), 5,000 an hour in all.
create or replace function public.pray_for_request(p_id integer, p_visitor text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  key text := prayer_visitor_key(p_visitor);
  r prayer_requests;
begin
  if key is null then
    raise exception 'Wala ma-ihap. Palihug i-refresh ang page ug sulayi pag-usab.';
  end if;
  select * into r from prayer_requests where id = p_id;
  if not found or not prayer_request_is_public(r) then
    raise exception 'Wala na kini nga hangyo sa pag-ampo sa website.';
  end if;
  if not exists (select 1 from prayer_request_prayers where request_id = p_id and visitor = key) then
    perform public_request_guard('prayed', 120, 5000);
    insert into prayer_request_prayers (request_id, visitor) values (p_id, key) on conflict do nothing;
  end if;
  return jsonb_build_object(
    'prayed', (select count(*) from prayer_request_prayers where request_id = p_id),
    'prayed_by_me', true
  );
end;
$$;

revoke all on function public.prayer_visitor_key(text) from public, anon, authenticated;
revoke all on function public.prayer_request_is_public(prayer_requests) from public, anon, authenticated;
revoke all on function public.prayer_request_public_json(prayer_requests, text) from public, anon, authenticated;
grant execute on function public.submit_prayer_request(jsonb) to anon, authenticated;
grant execute on function public.public_prayer_requests(text) to anon, authenticated;
grant execute on function public.public_prayer_request(integer, text) to anon, authenticated;
grant execute on function public.pray_for_request(integer, text) to anon, authenticated;

-- ---- staff: the badge, the bell, phones and the morning summary ------------------------

-- As in 0035, with prayer requests: the ones waiting to be reviewed for
-- the website, and the private ones not yet prayed for at Mass. Same rule
-- as needsAttention() in client/src/lib/prayers.js.
create or replace function public.request_inbox_counts() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'certificates', (select count(*) from certificate_requests where status in ('Received', 'Being prepared')),
    'ready', (select count(*) from certificate_requests where status = 'Ready for pick-up'),
    'blood', (select count(*) from blood_requests where status in ('Open', 'Contacting donors')),
    'sacraments', (select count(*) from sacrament_requests where status = 'New'),
    'prayers', (select count(*) from prayer_requests
                where (allow_public and not show_publicly and reviewed_at is null and status <> 'Archived')
                   or (not allow_public and status = 'New'))
  );
$$;

revoke all on function public.request_inbox_counts() from public, anon;
grant execute on function public.request_inbox_counts() to authenticated;

-- As in 0083, with a branch for prayer requests (and its trigger below).
create or replace function public.notify_new_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    when 'prayer_requests' then
      insert into staff_notifications (kind, area, ref_no, title, detail, link)
      values ('prayer', 'requests', (r->>'ref_no'),
        case when (r->>'allow_public')::boolean then 'Prayer request to review for the website' else 'Prayer request for the priest' end,
        concat_ws(' · ', r->>'intention_type', r->>'for_name'),
        '/admin/requests?tab=prayers&view=All&q=' || (r->>'ref_no'));

    when 'households' then
      insert into staff_notifications (kind, area, gkk, ref_no, title, detail, link)
      values ('registration', 'registry', r->>'gkk', (r->>'ref_no'), 'New household registration',
        concat_ws(' · ', r->>'household_name', r->>'gkk'),
        '/admin/households?status=All&q=' || (r->>'ref_no'));

    when 'census_submissions' then
      select * into hh from households where id = (r->>'household_id')::integer;
      if coalesce(r->>'status', 'Pending') = 'Pending' then
        insert into staff_notifications (kind, area, gkk, ref_no, title, detail, link)
        values ('census', 'registry', hh.gkk, hh.ref_no, 'Census update to review',
          concat_ws(' · ', hh.household_name, hh.gkk),
          '/admin/census?tab=updates' || coalesce('&q=' || hh.ref_no, ''));
      elsif nullif(trim(r->>'message'), '') is not null then
        insert into staff_notifications (kind, area, gkk, ref_no, title, detail, link)
        values ('census', 'registry', hh.gkk, hh.ref_no, 'Census message from a family',
          concat_ws(' · ', hh.household_name, hh.gkk),
          '/admin/census?tab=updates&status=' || (r->>'status') || coalesce('&q=' || hh.ref_no, ''));
      end if;

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
$function$;

drop trigger if exists trg_zz_notify_staff on prayer_requests;
create trigger trg_zz_notify_staff after insert on prayer_requests
for each row execute function public.notify_new_request();

-- As in 0094, with prayer requests on "Member requests only".
-- Keep the list in sync with MEMBER_REQUEST_KINDS in client/src/lib/notifications.js.
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
            when 'requests' then n.kind in ('anointing', 'certificate', 'ocia', 'blood', 'donor', 'prayer', 'census', 'gkk_history',
                                            'gkk_structure', 'gkk_structure_review', 'duplicate_flag', 'duplicate_flag_review')
            when 'urgent' then n.urgent
            else false
          end
        end;
$$;

revoke all on function public.notification_push_targets(bigint) from public, anon, authenticated;
grant execute on function public.notification_push_targets(bigint) to service_role;

-- As in 0034, with the prayer requests waiting (request_inbox_counts' rule).
create or replace function public.send_morning_digest() returns void
language plpgsql security definer set search_path = public as $$
declare
  certs bigint; ocia bigint; anoint bigint; blood bigint; prayers bigint;
  pending bigint; census bigint; overdue bigint;
  requests bigint; parts text[]; title text;
begin
  delete from staff_notifications where created_at < now() - interval '60 days';

  select count(*) into certs from certificate_requests where status in ('Received', 'Being prepared');
  select count(*) filter (where sacrament = 'ocia'), count(*) filter (where sacrament = 'anointing')
    into ocia, anoint from sacrament_requests where status = 'New';
  select count(*) into blood from blood_requests where status in ('Open', 'Contacting donors');
  select count(*) into prayers from prayer_requests
    where (allow_public and not show_publicly and reviewed_at is null and status <> 'Archived')
       or (not allow_public and status = 'New');
  select count(*) into pending from households where status = 'Pending';
  select count(*) into census from census_submissions s join census_cycles c on c.id = s.cycle_id
    where s.status = 'Pending' and c.status = 'Open';
  select (select count(*) from certificate_requests where status in ('Received', 'Being prepared') and created_at < now() - interval '3 days')
       + (select count(*) from sacrament_requests where status = 'New' and created_at < now() - interval '3 days')
       + (select count(*) from blood_requests where status = 'Open' and created_at < now() - interval '3 days')
    into overdue;

  requests := certs + ocia + anoint + blood + prayers;
  if requests + pending + census = 0 then
    return;
  end if;

  parts := array_remove(array[
    count_phrase(anoint, 'Anointing of the Sick', 'Anointing of the Sick'),
    count_phrase(blood, 'blood request', 'blood requests'),
    count_phrase(certs, 'certificate', 'certificates'),
    count_phrase(ocia, 'OCIA enrolment', 'OCIA enrolments'),
    count_phrase(prayers, 'prayer request', 'prayer requests'),
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
