-- Admin tools: who verified a household and when, "last updated" times,
-- registry totals computed in the database, a duplicate-member finder, and
-- a staff-admin flag for managing staff accounts. Run after
-- 0009_admin_household_wizard.sql. Safe to re-run.
--
-- Totals follow the census rules from 0007_census.sql: members who moved
-- away or died stay on record but are left out of the figures.

-- Stop early, naming the missing file, if an earlier migration hasn't run.
do $$
begin
  if to_regclass('public.parish_positions') is null then
    raise exception 'Run 0006_parish_positions.sql (then 0007, 0008, 0009) before this migration';
  end if;
  if to_regprocedure('public.census_member_statuses()') is null then
    raise exception 'Run 0007_census.sql (then 0008, 0009) before this migration';
  end if;
  if to_regclass('public.household_access_codes') is null then
    raise exception 'Run 0008_census_portal.sql (then 0009) before this migration';
  end if;
  if not exists (select 1 from pg_proc where proname = 'create_household' and prosrc like '%religion%') then
    raise exception 'Run 0009_admin_household_wizard.sql before this migration';
  end if;
end;
$$;

-- Still on the household roster: not moved away or deceased. The same rule
-- as members_with_household.is_current (0007_census.sql).
create or replace function public.member_is_current(p_status text) returns boolean
language sql immutable as $$
  select coalesce(p_status not in ('Moved away', 'Deceased'), true);
$$;

-- ---------------------------------------------------------------------------
-- Staff admins
--
-- Only staff admins can add, reset or disable staff accounts (through the
-- manage-staff Edge Function). Everyone who could sign in before this
-- migration already had full access, so they all start as admins; later
-- accounts are regular staff unless an admin ticks "admin". Clients can only
-- read their own profile, so nobody can promote themselves.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_admin') then
    alter table profiles add column is_admin boolean not null default false;
    update profiles set is_admin = true;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Verification history and "last updated"
-- ---------------------------------------------------------------------------

alter table households add column if not exists verified_at      timestamptz;
alter table households add column if not exists verified_by      uuid references auth.users(id) on delete set null;
alter table households add column if not exists verified_by_name text;

-- Existing rows start at their registration time rather than at whenever
-- this migration happened to run.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'households' and column_name = 'updated_at') then
    alter table households add column updated_at timestamptz not null default now();
    update households set updated_at = created_at;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'members' and column_name = 'updated_at') then
    alter table members add column updated_at timestamptz not null default now();
    update members set updated_at = created_at;
  end if;
end;
$$;

-- Who verified and when is set here from the signed-in account, so it can't
-- be filled in by hand (the same rule as sacrament verifications). Security
-- definer to read the staff member's email from auth.users.
create or replace function public.households_track_changes() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  staff_name text;
begin
  if new.status = 'Verified' and (tg_op = 'INSERT' or old.status is distinct from 'Verified') then
    select coalesce(nullif(trim(p.name), ''), u.email) into staff_name
    from auth.users u left join profiles p on p.id = u.id
    where u.id = auth.uid();
    new.verified_at := now();
    new.verified_by := auth.uid();
    new.verified_by_name := staff_name;
  elsif new.status = 'Verified' then
    new.verified_at := old.verified_at;
    new.verified_by := old.verified_by;
    new.verified_by_name := old.verified_by_name;
  else
    new.verified_at := null;
    new.verified_by := null;
    new.verified_by_name := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_households_track_changes on households;
create trigger trg_households_track_changes
before insert or update on households
for each row execute function public.households_track_changes();

create or replace function public.members_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_members_touch_updated_at on members;
create trigger trg_members_touch_updated_at
before update on members
for each row execute function public.members_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Views: `h.*` / `m.*` are expanded when a view is created, so both are
-- rebuilt to pick up the new columns. Same definitions as 0002 / 0007_census.
-- ---------------------------------------------------------------------------

drop view if exists households_with_count;
create view households_with_count
with (security_invoker = true) as
select
  h.*,
  (select count(*)::int from members m where m.household_id = h.id) as member_count,
  (select concat_ws(' ', m.first_name, m.last_name, nullif(m.suffix, ''))
     from members m
    where m.household_id = h.id and m.relationship = 'Head of Household'
    order by m.id limit 1) as head_name
from households h;

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

grant select on households_with_count to authenticated;
grant select on members_with_household to authenticated;

-- ---------------------------------------------------------------------------
-- Possible duplicate members
--
-- Families register anonymously, so the same person can be entered twice.
-- Members match on first name, last name and date of birth, compared
-- ignoring case and extra spaces. Middle name and suffix are often left out,
-- so they don't count; members with no date of birth are skipped to avoid
-- false matches. Staff can mark a group "not duplicates"; it stays hidden
-- unless another matching member turns up and the group changes.
-- ---------------------------------------------------------------------------

create table if not exists duplicate_dismissals (
  member_ids        integer[] primary key, -- sorted
  dismissed_by      uuid references auth.users(id) on delete set null,
  dismissed_by_name text,
  dismissed_at      timestamptz not null default now()
);

alter table duplicate_dismissals enable row level security;

drop policy if exists "duplicate_dismissals_admin_select" on duplicate_dismissals;
create policy "duplicate_dismissals_admin_select" on duplicate_dismissals
  for select to authenticated using (true);

-- Read-only for staff; writes go through dismiss_duplicate_group below.
revoke all on duplicate_dismissals from anon, authenticated;
grant select on duplicate_dismissals to authenticated;

create or replace function public.member_match_key(first_name text, last_name text, dob date) returns text
language sql immutable as $$
  select lower(regexp_replace(trim(first_name), '\s+', ' ', 'g')) || '|'
      || lower(regexp_replace(trim(last_name), '\s+', ' ', 'g')) || '|' || dob::text;
$$;

create or replace function public.find_duplicate_members() returns jsonb
language sql stable set search_path = public as $$
  with keyed as (
    select m.id, m.first_name, m.middle_name, m.last_name, m.suffix, m.dob, m.relationship, m.household_id,
           h.household_name, h.status as household_status, h.ref_no, h.created_at as registered_at,
           member_match_key(m.first_name, m.last_name, m.dob) as match_key
    from members m
    join households h on h.id = m.household_id
    where m.dob is not null and trim(m.first_name) <> '' and trim(m.last_name) <> ''
  ),
  groups as (
    select match_key, array_agg(id order by id) as ids, count(distinct household_id) as households
    from keyed
    group by match_key
    having count(*) > 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', g.match_key,
           'member_ids', to_jsonb(g.ids),
           'same_household', g.households = 1,
           'members', (select jsonb_agg(jsonb_build_object(
                          'id', k.id, 'first_name', k.first_name, 'middle_name', k.middle_name,
                          'last_name', k.last_name, 'suffix', k.suffix, 'dob', k.dob,
                          'relationship', k.relationship, 'household_id', k.household_id,
                          'household_name', k.household_name, 'household_status', k.household_status,
                          'ref_no', k.ref_no, 'registered_at', k.registered_at)
                        order by k.registered_at, k.id)
                       from keyed k where k.match_key = g.match_key)
         ) order by g.match_key), '[]'::jsonb)
  from groups g
  where not exists (select 1 from duplicate_dismissals d where d.member_ids = g.ids);
$$;

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

  insert into duplicate_dismissals (member_ids, dismissed_by, dismissed_by_name)
  values (ids, auth.uid(), staff_name)
  on conflict (member_ids) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Registry totals for the dashboard, reports and settings lists
--
-- Counted here instead of downloading every row to the browser. These run as
-- the signed-in user (security invoker), so row level security still applies.
-- ---------------------------------------------------------------------------

-- `p_tz` is the browser's time zone, so "registered in October" means the
-- staff member's October rather than the server's.
create or replace function public.admin_dashboard_stats(p_tz text default 'UTC') returns jsonb
language plpgsql stable set search_path = public as $$
declare
  tz text := coalesce((select name from pg_timezone_names where name = p_tz limit 1), 'UTC');
  this_month timestamp := date_trunc('month', now() at time zone tz);
begin
  return jsonb_build_object(
    'households', (select count(*) from households),
    'verified',   (select count(*) from households where status = 'Verified'),
    'pending',    (select count(*) from households where status = 'Pending'),
    'members',    (select count(*) from members where member_is_current(membership_status)),
    -- Census status of current members (0007_census).
    'active',     (select count(*) from members where membership_status = 'Active'),
    'inactive',   (select count(*) from members where membership_status = 'Inactive'),
    'unassessed', (select count(*) from members where membership_status is null),
    'gkks',       (select count(distinct gkk) from households where gkk is not null),
    'reg_months', (
      select jsonb_agg(jsonb_build_object(
               'month', to_char(mo, 'YYYY-MM'),
               'n', (select count(*) from members m
                      where member_is_current(m.membership_status)
                        and m.created_at >= (mo at time zone tz)
                        and m.created_at < ((mo + interval '1 month') at time zone tz)))
             order by mo)
      from generate_series(this_month - interval '5 months', this_month, interval '1 month') as mo
    ),
    'age_buckets', (
      select jsonb_agg(jsonb_build_object('label', b.label, 'n', coalesce(c.n, 0)) order by b.lo)
      from (values ('0-9', 0, 9), ('10-19', 10, 19), ('20-34', 20, 34), ('35-49', 35, 49), ('50-64', 50, 64), ('65+', 65, 200))
             as b(label, lo, hi)
      left join lateral (
        select count(*) as n from members m
        where member_is_current(m.membership_status)
          and m.dob is not null and date_part('year', age(m.dob)) between b.lo and b.hi
      ) c on true
    ),
    'by_gkk', (
      select coalesce(jsonb_agg(jsonb_build_object('label', t.gkk, 'n', t.n) order by t.gkk), '[]'::jsonb)
      from (select gkk, count(*) as n from households where gkk is not null group by gkk) t
    ),
    'top_groups', (
      select coalesce(jsonb_agg(jsonb_build_object('label', t.g, 'n', t.n) order by t.n desc, t.g), '[]'::jsonb)
      from (
        select g, count(distinct m.id) as n
        from members m, unnest(m.ministries || m.organizations) as g
        where member_is_current(m.membership_status)
        group by g order by n desc, g limit 6
      ) t
    ),
    'sacraments', (
      select jsonb_build_object(
        'baptism', count(*) filter (where has_baptism),
        'communion', count(*) filter (where has_communion),
        'confirmation', count(*) filter (where has_confirmation),
        'matrimony', count(*) filter (where has_matrimony))
      from members where member_is_current(membership_status)
    ),
    'duplicate_groups', jsonb_array_length(find_duplicate_members())
  );
end;
$$;

create or replace function public.admin_report_stats() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'households', (select count(*) from households),
    'verified',   (select count(*) from households where status = 'Verified'),
    'pending',    (select count(*) from households where status = 'Pending'),
    'members',    (select count(*) from members where member_is_current(membership_status)),
    'by_gkk', (
      select coalesce(jsonb_agg(jsonb_build_object('label', t.gkk, 'verified', t.verified, 'pending', t.pending) order by t.gkk), '[]'::jsonb)
      from (
        select gkk, count(*) filter (where status = 'Verified') as verified, count(*) filter (where status = 'Pending') as pending
        from households where gkk is not null group by gkk
      ) t
    ),
    'sacraments', (
      select jsonb_build_object(
        'baptism', count(*) filter (where has_baptism),
        'communion', count(*) filter (where has_communion),
        'confirmation', count(*) filter (where has_confirmation),
        'matrimony', count(*) filter (where has_matrimony))
      from members where member_is_current(membership_status)
    ),
    'participation', (
      select coalesce(jsonb_agg(jsonb_build_object('label', t.g, 'n', t.n) order by t.n desc, t.g), '[]'::jsonb)
      from (
        select g, count(distinct m.id) as n
        from members m, unnest(m.ministries || m.organizations) as g
        where member_is_current(m.membership_status)
        group by g
      ) t
    ),
    'any_group', (select count(*) from members
                  where member_is_current(membership_status) and (cardinality(ministries) > 0 or cardinality(organizations) > 0)),
    'blood', (
      select coalesce(jsonb_object_agg(blood_type, n), '{}'::jsonb)
      from (select blood_type, count(*) as n from members
            where member_is_current(membership_status) and coalesce(blood_type, '') <> '' group by blood_type) t
    ),
    'blood_unknown', (select count(*) from members where member_is_current(membership_status) and coalesce(blood_type, '') = '')
  );
$$;

-- How many households use each GKK, or how many members are in each
-- ministry / organization (current members, optionally within one GKK, to
-- match the rosters) / parish position.
-- Every configured name is listed, including ones nobody uses yet.
create or replace function public.admin_list_counts(p_list text, p_gkk text default null)
returns table (name text, n integer)
language plpgsql stable set search_path = public as $$
begin
  if p_list = 'gkks' then
    return query
      select g.name, (select count(*)::int from households h where h.gkk = g.name)
      from gkks g order by g.name;
  elsif p_list in ('ministries', 'organizations') then
    return query execute format(
      'select l.name, (select count(*)::int from members m join households h on h.id = m.household_id
                        where l.name = any(m.%I) and member_is_current(m.membership_status)
                          and ($1 is null or h.gkk = $1))
       from %I l order by l.name', p_list, p_list)
      using p_gkk;
  elsif p_list = 'parish_positions' then
    return query
      select p.name, (select count(*)::int from members m where m.parish_role = p.name)
      from parish_positions p order by p.name;
  else
    raise exception 'Unknown list: %', p_list;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: staff only. (New functions are executable by everyone by default.)
-- ---------------------------------------------------------------------------

revoke all on function public.find_duplicate_members() from public, anon;
revoke all on function public.dismiss_duplicate_group(integer[]) from public, anon;
revoke all on function public.admin_dashboard_stats(text) from public, anon;
revoke all on function public.admin_report_stats() from public, anon;
revoke all on function public.admin_list_counts(text, text) from public, anon;
revoke all on function public.households_track_changes() from public, anon, authenticated;

grant execute on function public.find_duplicate_members() to authenticated;
grant execute on function public.dismiss_duplicate_group(integer[]) to authenticated;
grant execute on function public.admin_dashboard_stats(text) to authenticated;
grant execute on function public.admin_report_stats() to authenticated;
grant execute on function public.admin_list_counts(text, text) to authenticated;
