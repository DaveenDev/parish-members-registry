-- Mass schedule types: a Mass now says what kind it is instead of the site
-- guessing from the day. Regular Mass (always Sunday), Daily Mass, GKK Mass
-- (weekly or on a date) and Special Mass (a feast, holy day of obligation,
-- the patronal fiesta, Simbang Gabi…, always on a date or a run of dates).
-- Existing "Mass" rows become Regular Mass on Sunday and Daily Mass otherwise.
-- Run after 0011_website_content.sql. Safe to re-run.

do $$
begin
  if to_regclass('public.mass_schedules') is null then
    raise exception 'Run 0011_website_content.sql before this migration';
  end if;
end;
$$;

alter table mass_schedules add column if not exists mass_date     date;    -- null = repeats every week
alter table mass_schedules add column if not exists mass_end_date date;    -- last day of a run, e.g. Simbang Gabi Dec 16–24
alter table mass_schedules add column if not exists occasion      text;    -- a Special Mass's name
alter table mass_schedules add column if not exists obligation    boolean not null default false; -- holy day of obligation

alter table mass_schedules drop constraint if exists mass_schedules_kind_check;

update mass_schedules
set kind = case when day_of_week = 0 then 'Regular Mass' else 'Daily Mass' end
where kind = 'Mass';

alter table mass_schedules alter column kind set default 'Regular Mass';
alter table mass_schedules add constraint mass_schedules_kind_check
  check (kind in ('Regular Mass', 'Daily Mass', 'Anticipated Mass', 'GKK Mass', 'Special Mass', 'Confession', 'Adoration', 'Other'));

alter table mass_schedules drop constraint if exists mass_schedules_regular_sunday;
alter table mass_schedules add constraint mass_schedules_regular_sunday
  check (kind <> 'Regular Mass' or (day_of_week = 0 and mass_date is null));

alter table mass_schedules drop constraint if exists mass_schedules_daily_weekly;
alter table mass_schedules add constraint mass_schedules_daily_weekly
  check (kind <> 'Daily Mass' or mass_date is null);

alter table mass_schedules drop constraint if exists mass_schedules_special_dated;
alter table mass_schedules add constraint mass_schedules_special_dated
  check (kind <> 'Special Mass' or (mass_date is not null and coalesce(trim(occasion), '') <> ''));

alter table mass_schedules drop constraint if exists mass_schedules_end_after_start;
alter table mass_schedules add constraint mass_schedules_end_after_start
  check (mass_end_date is null or (mass_date is not null and mass_end_date >= mass_date));

alter table mass_schedules drop constraint if exists mass_schedules_day_matches_date;
alter table mass_schedules add constraint mass_schedules_day_matches_date
  check (mass_date is null or day_of_week = extract(dow from mass_date));
