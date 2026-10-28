-- Parish census: the administrator opens a census cycle (yearly, every two
-- years, or whenever they decide), staff re-confirm every member against the
-- printed census form, and each member gets a membership status for that
-- cycle. Run after 0006_parish_positions.sql. Safe to re-run.
--
-- The census is per member, not per household: the father can be inactive
-- while his wife and children are active. Closing a cycle changes no data;
-- members nobody confirmed are only reported as "not confirmed".

-- Stop early, naming the missing file, if an earlier migration hasn't run.
do $$
begin
  if to_regclass('public.sacrament_verifications') is null then
    raise exception 'Run 0005_sacrament_verification.sql (then 0006) before this migration';
  end if;
  if to_regclass('public.parish_positions') is null then
    raise exception 'Run 0006_parish_positions.sql before this migration';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lists (keep in sync with MEMBERSHIP_STATUSES / PARTICIPATION_* in
-- client/src/constants.js and client/src/lib/census.js)
-- ---------------------------------------------------------------------------

create or replace function public.census_member_statuses() returns text[]
language sql immutable as $$
  select array['Active', 'Inactive', 'Moved away', 'Deceased', 'Left the Church'];
$$;

-- Only the survey keys and answers the wizard knows; anything else is dropped.
create or replace function public.census_clean_participation(p jsonb) returns jsonb
language sql immutable as $$
  select case when jsonb_typeof(p) = 'object' then
    coalesce((
      select jsonb_object_agg(k, v)
      from jsonb_each_text(p) as t(k, v)
      where k in ('mass', 'bible_service', 'devotions', 'meetings', 'pintakasi', 'financial')
        and v in ('Aktibo', 'Panagsa', 'Wala')
    ), '{}'::jsonb)
  else '{}'::jsonb end;
$$;

-- The suggestion staff see before choosing a status (suggestStatus() in
-- client/src/lib/census.js mirrors this — keep them in sync):
--   Active   — Mass is Aktibo, or at least two items are Aktibo / Panagsa
--   Inactive — something was answered and every answer is Wala
--   null     — not enough to go on; staff decide
-- Moved away / Deceased / Left the Church are never suggested.
create or replace function public.census_suggest_status(p jsonb) returns text
language sql immutable as $$
  with a as (select k, v from jsonb_each_text(census_clean_participation(p)) as t(k, v))
  select case
    when exists (select 1 from a where k = 'mass' and v = 'Aktibo') then 'Active'
    when (select count(*) from a where v in ('Aktibo', 'Panagsa')) >= 2 then 'Active'
    when exists (select 1 from a) and not exists (select 1 from a where v <> 'Wala') then 'Inactive'
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Tables and columns
-- ---------------------------------------------------------------------------

create table if not exists census_cycles (
  id         serial primary key,
  label      text unique not null,
  starts_on  date not null default current_date,
  ends_on    date,
  status     text not null default 'Open' check (status in ('Open', 'Closed')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);

-- At most one census is open at a time.
create unique index if not exists census_cycles_one_open on census_cycles ((true)) where status = 'Open';

-- null = not yet assessed in any census (every member before the first one).
alter table members add column if not exists membership_status text;
alter table members add column if not exists status_updated_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'members_membership_status_check') then
    alter table members add constraint members_membership_status_check
      check (membership_status is null or membership_status = any(census_member_statuses()));
  end if;
end;
$$;

-- One answer per member per census.
create table if not exists census_member_responses (
  cycle_id          integer not null references census_cycles(id) on delete cascade,
  member_id         integer not null references members(id) on delete cascade,
  status            text not null check (status = any(census_member_statuses())),
  suggested_status  text,
  participation     jsonb not null default '{}',
  source            text not null check (source in ('Paper', 'Staff visit', 'Portal')),
  notes             text,
  confirmed_by      uuid references auth.users(id) on delete set null,
  confirmed_by_name text,
  confirmed_at      timestamptz not null default now(),
  primary key (cycle_id, member_id)
);

create index if not exists idx_census_member_responses_member on census_member_responses(member_id);

-- The household and its members as they were when this census first touched
-- them — the record of what changed, since the free tier has no backups.
create table if not exists census_household_snapshots (
  cycle_id     integer not null references census_cycles(id) on delete cascade,
  household_id integer not null references households(id) on delete cascade,
  snapshot     jsonb not null,
  taken_at     timestamptz not null default now(),
  primary key (cycle_id, household_id)
);

-- Only drives the "next census due" reminder; cycles are still opened by hand.
alter table parish_settings add column if not exists census_interval_months smallint not null default 12;

-- ---------------------------------------------------------------------------
-- Row Level Security: staff can read, every write goes through the RPCs
-- below (which set who/when from the signed-in account). anon gets nothing.
-- ---------------------------------------------------------------------------

alter table census_cycles              enable row level security;
alter table census_member_responses    enable row level security;
alter table census_household_snapshots enable row level security;

drop policy if exists "census_cycles_admin_select" on census_cycles;
create policy "census_cycles_admin_select" on census_cycles
  for select to authenticated using (true);

drop policy if exists "census_member_responses_admin_select" on census_member_responses;
create policy "census_member_responses_admin_select" on census_member_responses
  for select to authenticated using (true);

drop policy if exists "census_household_snapshots_admin_select" on census_household_snapshots;
create policy "census_household_snapshots_admin_select" on census_household_snapshots
  for select to authenticated using (true);

revoke all on census_cycles, census_member_responses, census_household_snapshots from anon, authenticated;
grant select on census_cycles, census_member_responses, census_household_snapshots to authenticated;

-- ---------------------------------------------------------------------------
-- Views — `m.*` is expanded when the view is created, so it is rebuilt for
-- the new member columns. Same definition as 0006, plus the census columns.
-- ---------------------------------------------------------------------------

-- The census the admin panel reports on: the open one, else the latest.
create or replace function public.census_reference_cycle_id() returns integer
language sql stable as $$
  select id from census_cycles order by (status = 'Open') desc, id desc limit 1;
$$;

drop view if exists members_with_household;
create view members_with_household
with (security_invoker = true) as
select
  m.*,
  h.household_name,
  h.status as household_status,
  h.gkk as household_gkk,
  h.street, h.barangay, h.city, h.province, h.zip,
  case when m.dob is null then null else date_part('year', age(m.dob))::int end as age,
  (m.first_name || ' ' || m.last_name) as full_name,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'baptism') as baptism_verified,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'communion') as communion_verified,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'confirmation') as confirmation_verified,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'matrimony') as matrimony_verified,
  -- Still part of the household roster (not moved away or deceased).
  coalesce(m.membership_status not in ('Moved away', 'Deceased'), true) as is_current,
  last_r.cycle_id as last_census_cycle_id,
  last_r.label as last_census_label,
  last_r.confirmed_at as last_confirmed_at,
  exists (
    select 1 from census_member_responses r
    where r.member_id = m.id and r.cycle_id = census_reference_cycle_id()
  ) as census_confirmed
from members m
join households h on h.id = m.household_id
left join lateral (
  select r.cycle_id, c.label, r.confirmed_at
  from census_member_responses r join census_cycles c on c.id = r.cycle_id
  where r.member_id = m.id
  order by r.cycle_id desc
  limit 1
) last_r on true;

grant select on members_with_household to authenticated;

-- ---------------------------------------------------------------------------
-- Staff helpers
-- ---------------------------------------------------------------------------

-- The signed-in staff member's display name, or null for anyone else.
create or replace function public.census_staff_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(p.name), ''), u.email)
  from profiles p join auth.users u on u.id = p.id
  where p.id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Open / close / reopen a census
-- ---------------------------------------------------------------------------

create or replace function public.census_open_cycle(p_label text, p_starts_on date default null, p_ends_on date default null)
returns census_cycles
language plpgsql security definer set search_path = public as $$
declare
  open_label text;
  saved census_cycles;
begin
  if census_staff_name() is null then raise exception 'Only parish staff can start a census'; end if;
  if coalesce(trim(p_label), '') = '' then raise exception 'Give the census a name, e.g. "2026 Census"'; end if;
  select label into open_label from census_cycles where status = 'Open';
  if open_label is not null then
    raise exception 'Close the open census (%) before starting a new one', open_label;
  end if;
  if p_ends_on is not null and p_ends_on < coalesce(p_starts_on, current_date) then
    raise exception 'The target end date is before the start date';
  end if;
  if exists (select 1 from census_cycles where lower(label) = lower(trim(p_label))) then
    raise exception 'A census named "%" already exists', trim(p_label);
  end if;

  insert into census_cycles (label, starts_on, ends_on, created_by)
  values (trim(p_label), coalesce(p_starts_on, current_date), p_ends_on, auth.uid())
  returning * into saved;
  return saved;
end;
$$;

-- Closing only stamps the cycle; it never changes any member's data.
create or replace function public.census_close_cycle(p_cycle_id integer)
returns census_cycles
language plpgsql security definer set search_path = public as $$
declare saved census_cycles;
begin
  if census_staff_name() is null then raise exception 'Only parish staff can close a census'; end if;
  update census_cycles set status = 'Closed', closed_at = now()
  where id = p_cycle_id and status = 'Open'
  returning * into saved;
  if saved.id is null then raise exception 'This census is not open'; end if;
  return saved;
end;
$$;

create or replace function public.census_reopen_cycle(p_cycle_id integer)
returns census_cycles
language plpgsql security definer set search_path = public as $$
declare
  open_label text;
  saved census_cycles;
begin
  if census_staff_name() is null then raise exception 'Only parish staff can reopen a census'; end if;
  select label into open_label from census_cycles where status = 'Open' and id <> p_cycle_id;
  if open_label is not null then
    raise exception 'Close the open census (%) before reopening another one', open_label;
  end if;
  update census_cycles set status = 'Open', closed_at = null
  where id = p_cycle_id and status = 'Closed'
  returning * into saved;
  if saved.id is null then raise exception 'This census is not closed'; end if;
  return saved;
end;
$$;

-- ---------------------------------------------------------------------------
-- Record one household's census answers (from the paper form or a visit)
--
-- p_responses: [{ memberId, status, participation: {mass: 'Aktibo', …}, notes }]
-- Members left out are simply not confirmed yet (e.g. away that day).
-- p_household_participation / p_help_ways: optional household survey update.
-- ---------------------------------------------------------------------------

create or replace function public.census_record_household(
  p_cycle_id integer,
  p_household_id integer,
  p_responses jsonb,
  p_source text default 'Paper',
  p_household_participation jsonb default null,
  p_help_ways jsonb default null
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  staff_name text := census_staff_name();
  cycle_status text;
  r jsonb;
  member_id_val integer;
  status_val text;
  participation_val jsonb;
  saved_count integer := 0;
begin
  if staff_name is null then raise exception 'Only parish staff can record census answers'; end if;

  select status into cycle_status from census_cycles where id = p_cycle_id;
  if cycle_status is null then raise exception 'Census not found'; end if;
  if cycle_status <> 'Open' then raise exception 'This census is closed. Reopen it to record changes.'; end if;

  if not exists (select 1 from households where id = p_household_id) then
    raise exception 'Household not found';
  end if;
  if coalesce(p_source, '') not in ('Paper', 'Staff visit') then
    raise exception 'Choose where these answers came from';
  end if;
  if jsonb_typeof(p_responses) <> 'array' or jsonb_array_length(p_responses) = 0 then
    raise exception 'Choose a status for at least one member';
  end if;

  -- Validate everything before writing anything.
  for r in select * from jsonb_array_elements(p_responses) loop
    member_id_val := nullif(r->>'memberId', '')::integer;
    if member_id_val is null or not exists (select 1 from members where id = member_id_val and household_id = p_household_id) then
      raise exception 'A member in this census form is not in this household';
    end if;
    if not (coalesce(r->>'status', '') = any(census_member_statuses())) then
      raise exception 'Choose a status for every member you are confirming';
    end if;
  end loop;

  -- Keep how the household looked before this census first changed it.
  insert into census_household_snapshots (cycle_id, household_id, snapshot)
  select p_cycle_id, h.id,
         to_jsonb(h) || jsonb_build_object('members', coalesce((
           select jsonb_agg(to_jsonb(m) order by m.id) from members m where m.household_id = h.id
         ), '[]'::jsonb))
  from households h where h.id = p_household_id
  on conflict (cycle_id, household_id) do nothing;

  for r in select * from jsonb_array_elements(p_responses) loop
    member_id_val := (r->>'memberId')::integer;
    status_val := r->>'status';
    participation_val := census_clean_participation(r->'participation');

    insert into census_member_responses
      (cycle_id, member_id, status, suggested_status, participation, source, notes, confirmed_by, confirmed_by_name, confirmed_at)
    values
      (p_cycle_id, member_id_val, status_val, census_suggest_status(participation_val), participation_val, p_source,
       nullif(trim(r->>'notes'), ''), auth.uid(), staff_name, now())
    on conflict (cycle_id, member_id) do update set
      status = excluded.status,
      suggested_status = excluded.suggested_status,
      participation = excluded.participation,
      source = excluded.source,
      notes = excluded.notes,
      confirmed_by = excluded.confirmed_by,
      confirmed_by_name = excluded.confirmed_by_name,
      confirmed_at = excluded.confirmed_at;

    update members set membership_status = status_val, status_updated_at = now()
    where id = member_id_val and membership_status is distinct from status_val;

    saved_count := saved_count + 1;
  end loop;

  if jsonb_typeof(p_household_participation) = 'object' then
    update households set participation = census_clean_participation(p_household_participation) where id = p_household_id;
  end if;
  if jsonb_typeof(p_help_ways) = 'array' then
    update households set help_ways = coalesce((
      select array_agg(distinct x) from jsonb_array_elements_text(p_help_ways) x
      where x in ('sunday_mass', 'bible_service', 'devotions', 'meetings', 'pintakasi', 'financial')
    ), '{}')
    where id = p_household_id;
  end if;

  return saved_count;
end;
$$;

-- Undo one member's answer in an open census (entered by mistake). Their
-- membership status goes back to their latest answer in another census.
create or replace function public.census_clear_member(p_cycle_id integer, p_member_id integer)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if census_staff_name() is null then raise exception 'Only parish staff can change census answers'; end if;
  if not exists (select 1 from census_cycles where id = p_cycle_id and status = 'Open') then
    raise exception 'This census is closed. Reopen it to record changes.';
  end if;
  delete from census_member_responses where cycle_id = p_cycle_id and member_id = p_member_id;
  update members set
    membership_status = (select r.status from census_member_responses r where r.member_id = p_member_id order by r.cycle_id desc limit 1),
    status_updated_at = now()
  where id = p_member_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reporting
-- ---------------------------------------------------------------------------

-- Per household progress in a census. "Expected" members are the current
-- ones plus anyone confirmed in this census (so a member marked Deceased in
-- this census still counts as done, while one who died in an earlier census
-- is not expected again).
create or replace function public.census_household_progress(p_cycle_id integer)
returns table (
  household_id integer, household_name text, ref_no text, gkk text, head_name text,
  members_expected integer, members_confirmed integer, progress text
)
language sql stable as $$
  with per as (
    select h.id, h.household_name, h.ref_no, h.gkk,
      (select concat_ws(' ', m.first_name, m.last_name, nullif(m.suffix, ''))
         from members m where m.household_id = h.id and m.relationship = 'Head of Household'
        order by m.id limit 1) as head_name,
      count(m.id) filter (where r.member_id is not null or coalesce(m.membership_status not in ('Moved away', 'Deceased'), true))::int as expected,
      count(r.member_id)::int as confirmed
    from households h
    left join members m on m.household_id = h.id
    left join census_member_responses r on r.member_id = m.id and r.cycle_id = p_cycle_id
    group by h.id
  )
  select id, household_name, ref_no, gkk, head_name, expected, confirmed,
    case when confirmed = 0 then 'Not started'
         when confirmed >= expected then 'Confirmed'
         else 'Partly confirmed' end
  from per;
$$;

-- Census result by GKK: one row per (GKK, status), plus 'Not confirmed' for
-- current members with no answer in this census. gkk is null for households
-- without one.
create or replace function public.census_summary(p_cycle_id integer)
returns table (gkk text, status text, members integer)
language sql stable as $$
  select h.gkk, coalesce(r.status, 'Not confirmed'), count(*)::int
  from members m
  join households h on h.id = m.household_id
  left join census_member_responses r on r.member_id = m.id and r.cycle_id = p_cycle_id
  where r.member_id is not null or coalesce(m.membership_status not in ('Moved away', 'Deceased'), true)
  group by h.gkk, coalesce(r.status, 'Not confirmed');
$$;

revoke execute on function public.census_open_cycle(text, date, date) from public, anon;
revoke execute on function public.census_close_cycle(integer) from public, anon;
revoke execute on function public.census_reopen_cycle(integer) from public, anon;
revoke execute on function public.census_record_household(integer, integer, jsonb, text, jsonb, jsonb) from public, anon;
revoke execute on function public.census_clear_member(integer, integer) from public, anon;
revoke execute on function public.census_staff_name() from public, anon;

grant execute on function public.census_member_statuses() to authenticated;
grant execute on function public.census_clean_participation(jsonb) to authenticated;
grant execute on function public.census_suggest_status(jsonb) to authenticated;
grant execute on function public.census_reference_cycle_id() to authenticated;
grant execute on function public.census_staff_name() to authenticated;
grant execute on function public.census_open_cycle(text, date, date) to authenticated;
grant execute on function public.census_close_cycle(integer) to authenticated;
grant execute on function public.census_reopen_cycle(integer) to authenticated;
grant execute on function public.census_record_household(integer, integer, jsonb, text, jsonb, jsonb) to authenticated;
grant execute on function public.census_clear_member(integer, integer) to authenticated;
grant execute on function public.census_household_progress(integer) to authenticated;
grant execute on function public.census_summary(integer) to authenticated;
