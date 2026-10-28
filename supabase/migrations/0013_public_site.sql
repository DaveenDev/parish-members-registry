-- What the public website needs beyond 0011/0012: "Latest updates" articles
-- about activities the parish held, public GKK directory details (with the
-- coordinator shown only when they agreed), the public office details, the
-- census progress by GKK, and a registration status lookup by reference
-- number. Run after 0012_requests.sql. Safe to re-run.
--
-- Privacy rules for everything here: no member names, counts below 5 come
-- back as null (the site shows "Ubos sa 5"), and only people who agreed to
-- be shown appear.

-- Stop early, naming the missing file, if an earlier migration hasn't run.
do $$
begin
  if to_regprocedure('public.public_request_guard(text, integer, integer)') is null then
    raise exception 'Run 0012_requests.sql before this migration';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Latest updates: short written articles about activities the parish held.
-- ---------------------------------------------------------------------------
create table if not exists articles (
  id          serial primary key,
  title       text not null,
  tag         text not null default 'Parish' check (tag in ('Parish', 'GKK', 'Ministry')),
  held_on     date not null default public.parish_today(),
  place       text,
  summary     text,
  body        text,
  photo_url   text,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists articles_held_on_idx on articles (held_on desc);

drop trigger if exists trg_articles_touch on articles;
create trigger trg_articles_touch before update on articles
for each row execute function public.website_touch_updated_at();

alter table articles enable row level security;
drop policy if exists articles_admin_all on articles;
create policy articles_admin_all on articles for all to authenticated using (true) with check (true);
drop policy if exists articles_public_select on articles;
create policy articles_public_select on articles for select to anon using (published);
revoke all on articles from anon;
grant select on articles to anon;
grant select, insert, update, delete on articles to authenticated;
grant usage, select on sequence articles_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- GKK directory details, kept on the existing gkks rows. The coordinator is
-- shown publicly only while coordinator_public is on; the date records when
-- they agreed.
-- ---------------------------------------------------------------------------
alter table gkks add column if not exists puroks              text;
alter table gkks add column if not exists meeting_schedule    text;
alter table gkks add column if not exists meeting_place       text;
alter table gkks add column if not exists coordinator_name    text;
alter table gkks add column if not exists coordinator_mobile  text;
alter table gkks add column if not exists coordinator_public  boolean not null default false;
alter table gkks add column if not exists coordinator_consent_on date;

-- Households in the census that are fully confirmed, per GKK, for the open
-- census (or null when none is open).
create or replace function public.public_census_gkk_rows()
returns table (gkk text, households integer, confirmed integer)
language sql stable security definer set search_path = public as $$
  with cyc as (select id from census_cycles where status = 'Open' limit 1),
  per as (
    select h.id, h.gkk,
      count(m.id) filter (where r.member_id is not null or coalesce(m.membership_status not in ('Moved away', 'Deceased'), true)) as expected,
      count(r.member_id) as done
    from households h
    left join members m on m.household_id = h.id
    left join census_member_responses r on r.member_id = m.id and r.cycle_id = (select id from cyc)
    where exists (select 1 from cyc)
    group by h.id
  )
  select gkk, count(*)::int, count(*) filter (where expected > 0 and done >= expected)::int
  from per where gkk is not null group by gkk;
$$;
revoke all on function public.public_census_gkk_rows() from public, anon, authenticated;

-- One entry per GKK. households / census_pct are null below 5 households.
create or replace function public.public_gkk_directory() returns jsonb
language sql stable security definer set search_path = public as $$
  with hh as (select gkk, count(*)::int as n from households where gkk is not null group by gkk),
  cen as (select * from public_census_gkk_rows())
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', g.name,
           'puroks', g.puroks,
           'meeting_schedule', g.meeting_schedule,
           'meeting_place', g.meeting_place,
           'households', case when coalesce(hh.n, 0) >= 5 then hh.n end,
           'census_pct', case when coalesce(cen.households, 0) >= 5 then round(100.0 * cen.confirmed / cen.households)::int end,
           'coordinator', case when g.coordinator_public and nullif(trim(g.coordinator_name), '') is not null
                               then jsonb_build_object('name', g.coordinator_name, 'mobile', nullif(trim(g.coordinator_mobile), '')) end
         ) order by g.name), '[]'::jsonb)
  from gkks g
  left join hh on hh.gkk = g.name
  left join cen on cen.gkk = g.name;
$$;

-- Census progress for the open census: { open, label, ends_on, pct, gkks }.
-- pct is the share of households fully updated; GKKs under 5 households get
-- a null pct.
create or replace function public.public_census_progress() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when c.id is null then jsonb_build_object('open', false) else jsonb_build_object(
    'open', true,
    'label', c.label,
    'ends_on', c.ends_on,
    'households', (select coalesce(sum(households), 0) from public_census_gkk_rows()),
    'pct', (select case when sum(households) > 0 then round(100.0 * sum(confirmed) / sum(households))::int end from public_census_gkk_rows()),
    'gkks', (select coalesce(jsonb_agg(jsonb_build_object(
               'name', g.name,
               'pct', case when coalesce(r.households, 0) >= 5 then round(100.0 * r.confirmed / r.households)::int end
             ) order by g.name), '[]'::jsonb)
             from gkks g left join public_census_gkk_rows() r on r.gkk = g.name)
  ) end
  from (select 1) one left join census_cycles c on c.status = 'Open';
$$;

-- ---------------------------------------------------------------------------
-- Office details for the Contact page (0011 kept them staff-only).
-- ---------------------------------------------------------------------------
create or replace function public.public_office_details() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', name, 'address', address, 'contact', contact, 'email', email,
    'mobile', mobile, 'facebook_url', facebook_url, 'sick_call_contact', sick_call_contact,
    'directions', directions, 'map_url', map_url, 'latitude', latitude, 'longitude', longitude,
    'office_hours', office_hours
  ) from parish_settings where id = 1;
$$;

-- ---------------------------------------------------------------------------
-- Registration status by reference number: the household name and status
-- only, never members. Limited like the request status check.
-- ---------------------------------------------------------------------------
create or replace function public.registration_status(p_ref text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  h households;
begin
  perform public_request_guard('status', 30, 2000);
  select * into h from households where upper(ref_no) = upper(trim(coalesce(p_ref, '')));
  if not found then return null; end if;
  return jsonb_build_object(
    'ref_no', h.ref_no,
    'household_name', h.household_name,
    'status', h.status,
    'registered_on', (h.created_at at time zone 'Asia/Manila')::date
  );
end;
$$;

grant execute on function public.public_gkk_directory() to anon, authenticated;
grant execute on function public.public_census_progress() to anon, authenticated;
grant execute on function public.public_office_details() to anon, authenticated;
grant execute on function public.registration_status(text) to anon, authenticated;
