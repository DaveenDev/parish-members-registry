-- Ministries and organizations on the website, with "Interesado ko" (the
-- design brief, 1.4 and the Interested queue of Part 4). Run after
-- 0110_bulletin_pdf.sql. Safe to re-run.
--
-- * ministries / organizations: what the website says about each (published
--   [off until staff turn it on], a short purpose, who can join, when and
--   where it meets) and an optional contact person, shown only when
--   contact_public is ticked (the person agreed; the day is kept).
-- * public_groups(): the published ones for the website, each with its
--   current member count (null under 5, so a small group can't be
--   singled out), never a member's name.
-- * group_interests: "I'm interested" sign-ups. Like the other requests
--   (0012, 0032): staff only through row level security, the public through
--   submit_group_interest() with the rate limit, reference numbers start with
--   GI, and website staff may handle them. Statuses: New, Contacted, Joined,
--   Closed (not joining / handled otherwise).
-- * request_inbox_counts() counts the new ones, for the Requests badge.

do $$
begin
  if to_regclass('public.sacrament_requests') is null then
    raise exception 'Run the migrations up to 0032_sacrament_requests.sql before this one';
  end if;
end;
$$;

-- ---- what the website says about each group --------------------------------------------

alter table ministries add column if not exists published boolean not null default false;
alter table ministries add column if not exists public_blurb text;
alter table ministries add column if not exists who_can_join text;
alter table ministries add column if not exists meets text;
alter table ministries add column if not exists contact_name text;
alter table ministries add column if not exists contact_mobile text;
alter table ministries add column if not exists contact_public boolean not null default false;
alter table ministries add column if not exists contact_consent_on date;

alter table organizations add column if not exists published boolean not null default false;
alter table organizations add column if not exists public_blurb text;
alter table organizations add column if not exists who_can_join text;
alter table organizations add column if not exists meets text;
alter table organizations add column if not exists contact_name text;
alter table organizations add column if not exists contact_mobile text;
alter table organizations add column if not exists contact_public boolean not null default false;
alter table organizations add column if not exists contact_consent_on date;

create or replace function public.public_groups() returns jsonb
language sql stable security definer set search_path = public as $$
  with g as (
    select 'ministry'::text as kind, id, name, public_blurb, who_can_join, meets, contact_name, contact_mobile, contact_public,
           (select count(*) from members m where member_is_current(m.membership_status) and name = any(m.ministries)) as n
    from ministries where published
    union all
    select 'organization', id, name, public_blurb, who_can_join, meets, contact_name, contact_mobile, contact_public,
           (select count(*) from members m where member_is_current(m.membership_status) and name = any(m.organizations))
    from organizations where published
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'kind', kind, 'id', id, 'name', name,
    'blurb', nullif(trim(public_blurb), ''),
    'who_can_join', nullif(trim(who_can_join), ''),
    'meets', nullif(trim(meets), ''),
    'members', case when n >= 5 then n end,
    'contact', case when contact_public and nullif(trim(contact_name), '') is not null
                    then jsonb_build_object('name', trim(contact_name), 'mobile', nullif(trim(contact_mobile), '')) end
  ) order by kind desc, name), '[]'::jsonb)
  from g;
$$;

grant execute on function public.public_groups() to anon, authenticated;

-- ---- "I'm interested" -----------------------------------------------------------------------

create table if not exists group_interests (
  id                serial primary key,
  ref_no            text unique,
  group_kind        text not null check (group_kind in ('ministry', 'organization')),
  group_name        text not null,
  full_name         text not null,
  mobile            text not null,
  gkk               text,
  message           text,
  status            text not null default 'New' check (status in ('New', 'Contacted', 'Joined', 'Closed')),
  source            text not null default 'Online' check (source in ('Online', 'Walk-in', 'Phone')),
  staff_notes       text,
  status_changed_at timestamptz not null default now(),
  handled_by        uuid references auth.users(id) on delete set null,
  handled_by_name   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists group_interests_status_idx on group_interests (status, created_at desc);

drop trigger if exists trg_group_interests_ref on group_interests;
create trigger trg_group_interests_ref before insert on group_interests
for each row execute function public.requests_set_ref_no('GI');

drop trigger if exists trg_group_interests_stamp on group_interests;
create trigger trg_group_interests_stamp before update on group_interests
for each row execute function public.requests_stamp();

-- Who may change them (0014): full access and website staff.
drop trigger if exists trg_00_guard_staff_write on group_interests;
create trigger trg_00_guard_staff_write before insert or update or delete on group_interests
for each row execute function guard_staff_write('requests');

alter table group_interests enable row level security;
drop policy if exists group_interests_admin_all on group_interests;
create policy group_interests_admin_all on group_interests for all to authenticated
  using (staff_can_see('requests')) with check (true);
revoke all on group_interests from anon;
grant select, insert, update, delete on group_interests to authenticated;
grant usage, select on sequence group_interests_id_seq to authenticated;

-- Public submit: returns { ref_no }. Errors are in Bisaya for the website. Only
-- a group the parish has put on the website can be signed up for.
create or replace function public.submit_group_interest(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  kind text := payload_text(payload, 'groupKind', 20);
  gname text := payload_text(payload, 'groupName', 120);
  found_kind text;
  saved group_interests;
begin
  -- The hidden "website" field is only filled in by bots.
  if payload_text(payload, 'website') is not null then
    return jsonb_build_object('ref_no', generate_request_ref('GI'));
  end if;
  if coalesce((payload->>'consent')::boolean, false) is not true then
    raise exception 'Palihug i-check ang pagtugot (consent) sa dili pa ipadala.';
  end if;
  if payload_text(payload, 'fullName') is null then
    raise exception 'Palihug isulat ang inyong ngalan.';
  end if;
  perform require_mobile(payload_text(payload, 'mobile', 30));
  if gname is null then raise exception 'Wala mailhi ang grupo.'; end if;

  select 'ministry' into found_kind from ministries where name = gname and published and (kind is null or kind = 'ministry');
  if found_kind is null then
    select 'organization' into found_kind from organizations where name = gname and published and (kind is null or kind = 'organization');
  end if;
  if found_kind is null then raise exception 'Wala na kini nga grupo sa website.'; end if;

  perform public_request_guard('group_interest', 5, 200);

  insert into group_interests (group_kind, group_name, full_name, mobile, gkk, message)
  values (
    found_kind, gname,
    payload_text(payload, 'fullName', 120),
    payload_text(payload, 'mobile', 30),
    payload_text(payload, 'gkk', 120),
    payload_text(payload, 'message', 1000)
  ) returning * into saved;

  return jsonb_build_object('ref_no', saved.ref_no);
end;
$$;

grant execute on function public.submit_group_interest(jsonb) to anon, authenticated;

-- Sidebar badge (0100), now with new "I'm interested" sign-ups.
create or replace function public.request_inbox_counts() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'certificates', (select count(*) from certificate_requests where status in ('Received', 'Being prepared')),
    'ready', (select count(*) from certificate_requests where status = 'Ready for pick-up'),
    'blood', (select count(*) from blood_requests where status in ('Open', 'Contacting donors')),
    'sacraments', (select count(*) from sacrament_requests where status = 'New'),
    'prayers', (select count(*) from prayer_requests
                where (allow_public and not show_publicly and reviewed_at is null and status <> 'Archived')
                   or (not allow_public and status = 'New')),
    'interests', (select count(*) from group_interests where status = 'New')
  );
$$;

revoke all on function public.request_inbox_counts() from public, anon;
grant execute on function public.request_inbox_counts() to authenticated;
