-- The Kaabag on other days too: a parish with a Saturday Mass, or a cathedral
-- with a Wednesday Mass, that needs Kaabag at it. Run after
-- 0115_kaabag_directory.sql. Safe to re-run.
--
-- * kaabag_settings.days: the days besides Sunday that get Kaabag (1 =
--   Monday … 6 = Saturday), ticked under Parish Website → Kaabag Schedule →
--   Rules. Only a day with a published weekly Mass is offered, and none is
--   ticked to start with, so a parish's schedule stays Sundays only until the
--   office says otherwise.
-- * kaabag_masses(): the Masses that can be ticked: Sunday's (Regular Mass,
--   as before) and the weekly Anticipated and Daily Masses of the other
--   days. A Mass on one date (a Special Mass, a dated GKK Mass) isn't one.
-- * The rules for each Mass (a different number, or no Kaabag) work the same
--   on every day.
-- * The scheduler (0113) now fills every day of the month with a Mass to
--   serve, not just Sundays, by the same rules: "not serving yet this
--   Sunday" is now "this day", so a Saturday and the Sunday after it are two
--   days. The automatic run is 7 days before the month's first day with a
--   Mass to serve, which with Sundays only is the first Sunday, as before.

do $$
begin
  if to_regclass('public.kaabag_settings') is null or to_regprocedure('public.public_kaabag_directory()') is null then
    raise exception 'Run the migrations up to 0115_kaabag_directory.sql before this one';
  end if;
end;
$$;

alter table kaabag_settings add column if not exists days smallint[] not null default '{}';
alter table kaabag_settings drop constraint if exists kaabag_settings_days_check;
alter table kaabag_settings add constraint kaabag_settings_days_check
  check (days <@ array[1, 2, 3, 4, 5, 6]::smallint[]);

-- A Mass on a Saturday or a Wednesday is now a service too.
alter table kaabag_services drop constraint if exists kaabag_services_service_date_check;

-- ---- which Masses ------------------------------------------------------------------

/** The weekly Masses the Kaabag can serve, ticked or not: Sunday's, and the other days' Anticipated and Daily Masses. */
create or replace function public.kaabag_masses()
returns table (id integer, day_of_week smallint, start_time time, location text, language text, kind text)
language sql stable security definer set search_path = public as $$
  select m.id, m.day_of_week, m.start_time, m.location, m.language, m.kind
  from mass_schedules m
  where m.published and m.mass_date is null
    and case when m.day_of_week = 0 then m.kind = 'Regular Mass' else m.kind in ('Anticipated Mass', 'Daily Mass') end
  order by m.day_of_week, m.start_time, m.location, m.id;
$$;

-- It now says which day; a function's columns can't change in place.
drop function if exists public.kaabag_masses_to_serve();
/** The Masses the rules leave in: Sunday's, and those of the days ticked, each with how many serve. */
create function public.kaabag_masses_to_serve()
returns table (id integer, day_of_week smallint, start_time time, location text, language text, needed integer)
language sql stable security definer set search_path = public as $$
  select m.id, m.day_of_week, m.start_time, m.location, m.language,
         coalesce((s.mass_rules -> m.id::text ->> 'servers')::integer, s.servers_per_mass)
  from kaabag_masses() m cross join kaabag_settings s
  where (m.day_of_week = 0 or m.day_of_week = any(s.days))
    and coalesce((s.mass_rules -> m.id::text ->> 'skip')::boolean, false) = false
  order by m.day_of_week, m.start_time, m.location, m.id;
$$;

/** The days from `p_from` up to before `p_to` with a Mass to serve, in order. */
create or replace function public.kaabag_days_in(p_from date, p_to date) returns setof date
language sql stable security definer set search_path = public as $$
  select d::date from generate_series(p_from::timestamp, (p_to - 1)::timestamp, interval '1 day') d
  where extract(dow from d)::integer in (select k.day_of_week from kaabag_masses_to_serve() k)
  order by 1;
$$;

-- ---- the scheduler -------------------------------------------------------------------

/**
 * Fills the days of `p_month` from `p_from` on, as 0113 describes, a day at
 * a time instead of a Sunday at a time. Days must be clear first.
 * { masses, places, filled }.
 */
create or replace function public.kaabag_fill(p_month date, p_from date, p_by text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  month_start date := date_trunc('month', p_month::timestamp)::date;
  next_month date := (date_trunc('month', p_month::timestamp) + interval '1 month')::date;
  history_from date := (date_trunc('month', p_month::timestamp) - interval '3 months')::date;
  serve_day date;
  m record;
  service integer;
  got integer;
  masses integer := 0;
  places integer := 0;
  filled integer := 0;
begin
  perform set_config('app.audit_skip', 'on', true);
  for serve_day in select * from kaabag_days_in(greatest(month_start, p_from), next_month) loop
    for m in select * from kaabag_masses_to_serve() k where k.day_of_week = extract(dow from serve_day) loop
      insert into kaabag_services (service_date, mass_id, start_time, location, language, needed, generated_by)
      values (serve_day, m.id, m.start_time, m.location, m.language, m.needed, p_by)
      returning id into service;

      insert into kaabag_assignments (service_id, roster_id, name)
      select service, r.id, r.name
      from kaabag_roster r
      cross join lateral (
        select count(*) filter (where s.service_date = serve_day) as this_day,
               count(*) filter (where s.service_date >= month_start) as this_month,
               count(*) filter (where s.mass_id = m.id) as this_mass,
               count(*) as lately
        from kaabag_assignments a join kaabag_services s on s.id = a.service_id
        where a.roster_id = r.id and s.service_date >= history_from and s.service_date < next_month
      ) c
      where r.on_rotation
        and not exists (
          select 1 from kaabag_assignments a join kaabag_services s on s.id = a.service_id
          where a.roster_id = r.id and s.service_date = serve_day
            and abs(extract(epoch from s.start_time - m.start_time)) < 5400
        )
      order by c.this_day, c.this_month, c.this_mass, c.lately, random()
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
 * The Generate button (0113): days already past stay as they were, and the
 * rest are drawn again when `p_replace`.
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

  perform pg_advisory_xact_lock(hashtext('kaabag_generate'));
  perform kaabag_sync_roster();
  if not exists (select 1 from kaabag_masses_to_serve()) then
    raise exception 'There are no Masses to schedule. Publish them in the Mass Schedule tab, or check the rules below.';
  end if;
  if not exists (select 1 from kaabag_days_in(from_day, next_month)) then
    raise exception 'There are no Mass days left in that month.';
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
 * pg_cron, every morning (0113): from 7 days before a month's first day with
 * a Mass to serve up to that day, makes the month's schedule if it has none.
 */
create or replace function public.kaabag_auto_generate() returns void
language plpgsql security definer set search_path = public as $$
declare
  today date := parish_today();
  this_month date := date_trunc('month', today::timestamp)::date;
  month_start date;
  next_month date;
  first_day date;
  summary jsonb;
begin
  if not coalesce((select auto_generate from kaabag_settings), false) then return; end if;
  perform pg_advisory_xact_lock(hashtext('kaabag_generate'));
  perform kaabag_sync_roster();
  if not exists (select 1 from kaabag_masses_to_serve()) or not exists (select 1 from kaabag_roster where on_rotation) then return; end if;

  foreach month_start in array array[this_month, (date_trunc('month', today::timestamp) + interval '1 month')::date] loop
    next_month := (month_start::timestamp + interval '1 month')::date;
    first_day := (select min(d) from kaabag_days_in(month_start, next_month) d);
    continue when first_day is null or today not between first_day - 7 and first_day;
    continue when exists (select 1 from kaabag_services where service_date >= month_start and service_date < next_month);
    summary := kaabag_fill(month_start, greatest(month_start, today), 'Automatic');
    insert into activity_log (actor_name, action, table_name, record_id, label, changes)
    values ('Automatic', 'insert', 'kaabag_services', to_char(month_start, 'YYYY-MM'), trim(to_char(month_start, 'FMMonth YYYY')), summary);
  end loop;
end;
$$;

-- ---- what the admin tab reads ---------------------------------------------------------

/** As in 0113, with every Mass that can be ticked and its day. */
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
    'masses', (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'day_of_week', m.day_of_week, 'start_time', m.start_time,
                                                            'location', m.location, 'language', m.language, 'kind', m.kind)
                                         order by m.day_of_week, m.start_time, m.location, m.id), '[]'::jsonb)
               from kaabag_masses() m),
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

-- ---- grants --------------------------------------------------------------------------

revoke all on function public.kaabag_masses() from public, anon, authenticated;
revoke all on function public.kaabag_masses_to_serve() from public, anon, authenticated;
revoke all on function public.kaabag_days_in(date, date) from public, anon, authenticated;
