-- The Kaabag's Sunday schedule: who serves at each Sunday Mass, made from the
-- Kaabag list by rules the office sets (Parish Website → Kaabag Schedule) and
-- shown on the website at /simbahan/kaabag. Run after
-- 0112_announcement_photo.sql. Safe to re-run.
--
-- * kaabag_settings: the rules (one row). How many serve at each Mass, a
--   different number or no Kaabag at all for a Mass, and whether the schedule
--   is made automatically.
-- * kaabag_roster: everyone who can be scheduled. Members whose ministries
--   include Kaabag come in by themselves (kaabag_sync_roster; the registry
--   stays the list) and the office can type in names, for a parish with nobody
--   registered yet. A typed name becomes the member's row once that person is
--   registered under the same name.
-- * kaabag_services / kaabag_assignments: one Mass on one Sunday, and who
--   serves it. They keep their own copy of the Mass's time and place and the
--   person's name, so a schedule already out survives a later edit.
-- * kaabag_generate(): the Generate button. kaabag_auto_generate(): the same,
--   by itself, from pg_cron, 7 days before a month's first Sunday. That day
--   is always the last Sunday of the month before. It never replaces a
--   schedule; if it's missed it tries again each day up to the first Sunday.
-- * public_kaabag_schedule(): the website's copy, from today on. No member
--   names in public unless the person agreed (the design brief, as in 0105):
--   a person shows by name only once the office ticks "Show on the website",
--   which notes the day; anyone else comes back as null and reads "Kaabag".
--   A new person starts hidden.
--
-- The schedule is drawn so the work is shared out evenly and at random. For
-- each Mass, in Sunday and time order, it takes:
--   1. those not serving yet this Sunday, then those who are (only when there
--      aren't enough people, and never at Masses under 90 minutes apart);
--   2. of those, whoever has served least this month, so nobody serves again
--      until everyone has had a turn;
--   3. then whoever has been at this Mass least in the last 3 months, so
--      nobody is always given the same one;
--   4. then whoever has served least in the last 3 months;
--   5. then at random.

do $$
begin
  if to_regclass('public.mass_schedules') is null or to_regprocedure('public.log_record_activity()') is null then
    raise exception 'Run the migrations up to 0112_announcement_photo.sql before this one';
  end if;
end;
$$;

-- ---- tables --------------------------------------------------------------------------

create table if not exists kaabag_settings (
  id               integer primary key default 1 check (id = 1),
  label            text not null default 'Kaabag schedule rules', -- its name in the activity log
  servers_per_mass integer not null default 2 check (servers_per_mass between 1 and 12),
  -- By mass_schedules.id, for the Masses that differ: { "3": { "skip": true }, "4": { "servers": 3 } }.
  mass_rules       jsonb not null default '{}'::jsonb,
  auto_generate    boolean not null default true
);
insert into kaabag_settings (id) values (1) on conflict (id) do nothing;

create table if not exists kaabag_roster (
  id            serial primary key,
  member_id     integer unique references members(id) on delete cascade, -- null: a name the office typed
  name          text not null check (length(trim(name)) > 0),
  on_rotation   boolean not null default true,
  show_publicly boolean not null default false,
  consent_on    date,
  created_at    timestamptz not null default now()
);
create unique index if not exists kaabag_roster_typed_name_idx on kaabag_roster (lower(trim(name))) where member_id is null;

create table if not exists kaabag_services (
  id           serial primary key,
  service_date date not null check (extract(dow from service_date) = 0),
  mass_id      integer references mass_schedules(id) on delete set null,
  start_time   time not null,
  location     text not null,
  language     text,
  needed       integer not null check (needed > 0),
  generated_by text not null, -- a staff name, or 'Automatic'
  created_at   timestamptz not null default now()
);
create index if not exists kaabag_services_date_idx on kaabag_services (service_date, start_time);

create table if not exists kaabag_assignments (
  id         serial primary key,
  service_id integer not null references kaabag_services(id) on delete cascade,
  roster_id  integer references kaabag_roster(id) on delete set null,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (service_id, roster_id)
);
create index if not exists kaabag_assignments_roster_idx on kaabag_assignments (roster_id);

-- Those who run the website change these, those who may see it read them
-- (lib/access.js: editWebsite, website). No guard_staff_write trigger: opening
-- the page brings the list up to date, also for a read-only account, through
-- kaabag_admin(), which row level security doesn't stop.
do $$
declare
  t text;
begin
  foreach t in array array['kaabag_settings', 'kaabag_roster', 'kaabag_services', 'kaabag_assignments'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_staff_read', t);
    execute format('create policy %I on %I for select to authenticated using (staff_access() in (''full'', ''read_only'', ''website''))', t || '_staff_read', t);
    execute format('drop policy if exists %I on %I', t || '_staff_write', t);
    execute format('create policy %I on %I for all to authenticated using (staff_access() in (''full'', ''website'')) with check (staff_access() in (''full'', ''website''))', t || '_staff_write', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end;
$$;

grant select, update on kaabag_settings to authenticated;
grant select on kaabag_services to authenticated;
grant select, insert, update, delete on kaabag_roster, kaabag_assignments to authenticated;
grant usage, select on sequence kaabag_roster_id_seq, kaabag_assignments_id_seq to authenticated;

-- In the activity log, with what log_record_activity already does. A whole
-- schedule being made is one entry (kaabag_generate), not one per person.
do $$
declare
  t text;
begin
  foreach t in array array['kaabag_settings', 'kaabag_roster', 'kaabag_assignments'] loop
    execute format('drop trigger if exists trg_zz_activity_log on %I', t);
    execute format('create trigger trg_zz_activity_log after insert or update or delete on %I
                    for each row execute function log_record_activity()', t);
  end loop;
end;
$$;

-- ---- who and what can be scheduled ---------------------------------------------------

/** The first Sunday of the month `p_month` falls in. */
create or replace function public.kaabag_first_sunday(p_month date) returns date
language sql immutable as $$
  select d + ((7 - extract(dow from d)::integer) % 7)
  from (select date_trunc('month', p_month::timestamp)::date as d) f;
$$;

/** Current members with a Kaabag ministry ("Kaabag", or a longer name that starts with it). */
create or replace function public.kaabag_registered() returns table (id integer, name text)
language sql stable security definer set search_path = public as $$
  select m.id, org_member_name(m.id)
  from members m
  where member_is_current(m.membership_status)
    and exists (select 1 from unnest(m.ministries) x where lower(trim(x)) like 'kaabag%');
$$;

/** Brings the roster in line with the registry; the office's ticks stay with each person. */
create or replace function public.kaabag_sync_roster() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform set_config('app.audit_skip', 'on', true);
  update kaabag_roster r set member_id = k.id, name = k.name
  from kaabag_registered() k
  where r.member_id is null and lower(trim(r.name)) = lower(k.name)
    and not exists (select 1 from kaabag_roster x where x.member_id = k.id);
  delete from kaabag_roster r
  where r.member_id is not null and r.member_id not in (select k.id from kaabag_registered() k);
  insert into kaabag_roster (member_id, name)
  select k.id, k.name from kaabag_registered() k
  on conflict (member_id) do update set name = excluded.name
  where kaabag_roster.name is distinct from excluded.name;
  perform set_config('app.audit_skip', 'off', true);
end;
$$;

/** The published Sunday Masses the rules leave in, each with how many serve. */
create or replace function public.kaabag_masses_to_serve()
returns table (id integer, start_time time, location text, language text, needed integer)
language sql stable security definer set search_path = public as $$
  select m.id, m.start_time, m.location, m.language,
         coalesce((s.mass_rules -> m.id::text ->> 'servers')::integer, s.servers_per_mass)
  from mass_schedules m cross join kaabag_settings s
  where m.published and m.kind = 'Regular Mass'
    and coalesce((s.mass_rules -> m.id::text ->> 'skip')::boolean, false) = false
  order by m.start_time, m.location, m.id;
$$;

-- ---- the scheduler -------------------------------------------------------------------

/**
 * Fills the Sundays of `p_month` from `p_from` on, as the top of this file
 * describes. Sundays must be clear first. { masses, places, filled }.
 */
create or replace function public.kaabag_fill(p_month date, p_from date, p_by text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  month_start date := date_trunc('month', p_month::timestamp)::date;
  next_month date := (date_trunc('month', p_month::timestamp) + interval '1 month')::date;
  history_from date := (date_trunc('month', p_month::timestamp) - interval '3 months')::date;
  sunday date;
  m record;
  service integer;
  got integer;
  masses integer := 0;
  places integer := 0;
  filled integer := 0;
begin
  perform set_config('app.audit_skip', 'on', true);
  for sunday in
    select d::date from generate_series(kaabag_first_sunday(month_start)::timestamp, (next_month - 1)::timestamp, interval '7 days') d
    where d::date >= p_from
  loop
    for m in select * from kaabag_masses_to_serve() loop
      insert into kaabag_services (service_date, mass_id, start_time, location, language, needed, generated_by)
      values (sunday, m.id, m.start_time, m.location, m.language, m.needed, p_by)
      returning id into service;

      insert into kaabag_assignments (service_id, roster_id, name)
      select service, r.id, r.name
      from kaabag_roster r
      cross join lateral (
        select count(*) filter (where s.service_date = sunday) as this_sunday,
               count(*) filter (where s.service_date >= month_start) as this_month,
               count(*) filter (where s.mass_id = m.id) as this_mass,
               count(*) as lately
        from kaabag_assignments a join kaabag_services s on s.id = a.service_id
        where a.roster_id = r.id and s.service_date >= history_from and s.service_date < next_month
      ) c
      where r.on_rotation
        and not exists (
          select 1 from kaabag_assignments a join kaabag_services s on s.id = a.service_id
          where a.roster_id = r.id and s.service_date = sunday
            and abs(extract(epoch from s.start_time - m.start_time)) < 5400
        )
      order by c.this_sunday, c.this_month, c.this_mass, c.lately, random()
      limit m.needed;

      get diagnostics got = row_count;
      masses := masses + 1;
      places := places + m.needed;
      filled := filled + got;
    end loop;
  end loop;
  perform set_config('app.audit_skip', 'off', true);
  return jsonb_build_object('masses', masses, 'places', places, 'filled', filled);
end;
$$;

/**
 * Makes a month's schedule from the Generate button. `p_replace` redoes a
 * month that has one: Sundays already past stay as they were, and the rest
 * are drawn again, the office's own changes to them included. Those past
 * Sundays still count towards who has served.
 */
create or replace function public.kaabag_generate(p_month date, p_replace boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  today date := parish_today();
  month_start date := date_trunc('month', p_month::timestamp)::date;
  next_month date := (date_trunc('month', p_month::timestamp) + interval '1 month')::date;
  from_day date := greatest(month_start, today);
  replacing boolean;
  summary jsonb;
begin
  if coalesce(staff_access(), '') not in ('full', 'website') then
    raise exception 'Your account can''t change this. Ask a staff admin.' using errcode = '42501';
  end if;
  -- The month's next Sunday from today (from_day is at most a week short of it).
  if from_day + ((7 - extract(dow from from_day)::integer) % 7) >= next_month then
    raise exception 'There are no Sundays left in that month.';
  end if;

  perform pg_advisory_xact_lock(hashtext('kaabag_generate'));
  perform kaabag_sync_roster();
  if not exists (select 1 from kaabag_masses_to_serve()) then
    raise exception 'There are no Sunday Masses to schedule. Publish them in the Mass Schedule tab, or check the rules below.';
  end if;
  if not exists (select 1 from kaabag_roster where on_rotation) then
    raise exception 'There is nobody on the Kaabag list yet. Add names below, or add members to the Kaabag ministry.';
  end if;

  replacing := exists (select 1 from kaabag_services where service_date >= from_day and service_date < next_month);
  if replacing and not p_replace then raise exception 'That month already has a schedule.'; end if;

  perform set_config('app.audit_skip', 'on', true);
  delete from kaabag_services where service_date >= from_day and service_date < next_month;
  summary := kaabag_fill(month_start, from_day, coalesce(current_staff_name(), 'Staff'));

  insert into activity_log (actor, actor_name, action, table_name, record_id, label, changes)
  values (auth.uid(), current_staff_name(), case when replacing then 'update' else 'insert' end, 'kaabag_services', to_char(month_start, 'YYYY-MM'),
          trim(to_char(month_start, 'FMMonth YYYY')), summary);
  return summary;
end;
$$;

/**
 * pg_cron, every morning: from 7 days before a month's first Sunday up to
 * that Sunday, makes the month's schedule if it has none. A rule, a Mass or a
 * name still missing just means trying again the next morning.
 */
create or replace function public.kaabag_auto_generate() returns void
language plpgsql security definer set search_path = public as $$
declare
  today date := parish_today();
  this_month date := date_trunc('month', today::timestamp)::date;
  month_start date;
  first_sunday date;
  summary jsonb;
begin
  if not coalesce((select auto_generate from kaabag_settings), false) then return; end if;
  perform pg_advisory_xact_lock(hashtext('kaabag_generate'));
  perform kaabag_sync_roster();
  if not exists (select 1 from kaabag_masses_to_serve()) or not exists (select 1 from kaabag_roster where on_rotation) then return; end if;

  foreach month_start in array array[this_month, (date_trunc('month', today::timestamp) + interval '1 month')::date] loop
    first_sunday := kaabag_first_sunday(month_start);
    continue when today not between first_sunday - 7 and first_sunday;
    continue when exists (select 1 from kaabag_services
                          where service_date >= month_start and service_date < (month_start::timestamp + interval '1 month')::date);
    summary := kaabag_fill(month_start, greatest(month_start, today), 'Automatic');
    insert into activity_log (actor_name, action, table_name, record_id, label, changes)
    values ('Automatic', 'insert', 'kaabag_services', to_char(month_start, 'YYYY-MM'), trim(to_char(month_start, 'FMMonth YYYY')), summary);
  end loop;
end;
$$;

-- ---- what the pages read -------------------------------------------------------------

/** All the admin tab needs: the rules, the Sunday Masses, the list and this month on. */
create or replace function public.kaabag_admin() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  automatic boolean := false;
begin
  if coalesce(staff_access(), '') not in ('full', 'read_only', 'website') then
    raise exception 'Your account can''t see this page.' using errcode = '42501';
  end if;
  perform kaabag_sync_roster();
  -- Only a note on the page depends on this, so it can't stop the page opening.
  begin
    if to_regclass('cron.job') is not null then
      execute $q$select exists (select 1 from cron.job where jobname = 'kaabag-monthly-schedule' and active)$q$ into automatic;
    end if;
  exception when others then
    automatic := false;
  end;
  return jsonb_build_object(
    'settings', (select to_jsonb(s) - 'id' - 'label' from kaabag_settings s),
    'cron', automatic,
    'masses', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'start_time', m.start_time, 'location', m.location, 'language', m.language)
                                         order by m.start_time, m.location, m.id), '[]'::jsonb)
               from mass_schedules m where m.published and m.kind = 'Regular Mass'),
    'roster', (select coalesce(jsonb_agg(to_jsonb(r) - 'created_at' order by lower(r.name)), '[]'::jsonb) from kaabag_roster r),
    'services', (select coalesce(jsonb_agg(jsonb_build_object(
                   'id', s.id, 'service_date', s.service_date, 'start_time', s.start_time, 'location', s.location, 'language', s.language,
                   'needed', s.needed, 'generated_by', s.generated_by, 'created_at', s.created_at,
                   'people', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'roster_id', a.roster_id, 'name', a.name) order by a.id), '[]'::jsonb)
                              from kaabag_assignments a where a.service_id = s.id)
                 ) order by s.service_date, s.start_time, s.location, s.id), '[]'::jsonb)
                 from kaabag_services s
                 where s.service_date >= date_trunc('month', parish_today()::timestamp)::date)
  );
end;
$$;

/** The website's schedule, today on. A person who hasn't agreed to be shown is null. */
create or replace function public.public_kaabag_schedule() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'date', s.service_date, 'time', s.start_time, 'location', s.location, 'language', s.language,
    'names', (select coalesce(jsonb_agg(case when r.show_publicly then r.name end order by a.id), '[]'::jsonb)
              from kaabag_assignments a left join kaabag_roster r on r.id = a.roster_id
              where a.service_id = s.id)
  ) order by s.service_date, s.start_time, s.location, s.id), '[]'::jsonb)
  from kaabag_services s
  where s.service_date >= parish_today();
$$;

-- ---- grants --------------------------------------------------------------------------

revoke all on function public.kaabag_first_sunday(date) from public, anon, authenticated;
revoke all on function public.kaabag_registered() from public, anon, authenticated;
revoke all on function public.kaabag_sync_roster() from public, anon, authenticated;
revoke all on function public.kaabag_masses_to_serve() from public, anon, authenticated;
revoke all on function public.kaabag_fill(date, date, text) from public, anon, authenticated;
revoke all on function public.kaabag_auto_generate() from public, anon, authenticated;
revoke all on function public.kaabag_generate(date, boolean) from public, anon;
revoke all on function public.kaabag_admin() from public, anon;
revoke all on function public.public_kaabag_schedule() from public;

grant execute on function public.kaabag_generate(date, boolean) to authenticated;
grant execute on function public.kaabag_admin() to authenticated;
grant execute on function public.public_kaabag_schedule() to anon, authenticated;

-- ---- the monthly run -----------------------------------------------------------------

-- 21:00 UTC is 5:00 AM in the Philippines. Every day, so a missed day is made
-- up; the function itself knows which days count. Scheduling again under the
-- same name replaces the old schedule.
do $$
begin
  if to_regnamespace('cron') is not null then
    perform cron.schedule('kaabag-monthly-schedule', '0 21 * * *', 'select public.kaabag_auto_generate()');
  else
    raise notice 'pg_cron is not on: the Kaabag schedule is only made from the Generate button. Turn it on and run this file again';
  end if;
exception when others then
  raise notice 'Could not schedule the Kaabag schedule: %', sqlerrm;
end;
$$;
