-- Parish website content that staff type in: the Mass & confession
-- schedule, sacrament guides, announcements, the weekly bulletin, events,
-- and the office hours / contact details. Run after 0010_admin_tools.sql.
-- Safe to re-run.
--
-- Every item starts as a draft. The public site may read published items
-- only; the office details stay staff-only until the public pages add a
-- read function for them.

-- Stop early, naming the missing file, if an earlier migration hasn't run.
do $$
begin
  if to_regprocedure('public.find_duplicate_members()') is null then
    raise exception 'Run 0010_admin_tools.sql before this migration';
  end if;
end;
$$;

-- Today in the parish's time zone, for announcement start and end dates.
create or replace function public.parish_today() returns date
language sql stable as $$
  select (now() at time zone 'Asia/Manila')::date;
$$;

create or replace function public.website_touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mass & confession schedule: one row per weekly time slot.
-- ---------------------------------------------------------------------------
create table if not exists mass_schedules (
  id          serial primary key,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday
  start_time  time not null,
  kind        text not null default 'Mass'
              check (kind in ('Mass', 'Anticipated Mass', 'Confession', 'Adoration', 'Other')),
  location    text not null default 'Main church',
  language    text not null default 'Bisaya'
              check (language in ('Bisaya', 'English', 'Bisaya & English')),
  notes       text,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sacrament guides: requirements and steps, one row per sacrament/service.
-- steps is [{ "title": text, "detail": text }]; requirements is [text].
-- ---------------------------------------------------------------------------
create table if not exists sacrament_guides (
  id           serial primary key,
  key          text not null unique,
  title        text not null,
  summary      text,
  steps        jsonb not null default '[]'::jsonb,
  requirements jsonb not null default '[]'::jsonb,
  schedule     text,
  fees         text,
  notes        text,
  sort         smallint not null default 0,
  published    boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

insert into sacrament_guides (key, title, sort) values
  ('baptism',         'Bunyag (Baptism)',               1),
  ('first_communion', 'Unang Kalawat (First Communion)', 2),
  ('confirmation',    'Kumpil (Confirmation)',          3),
  ('wedding',         'Kasal (Wedding)',                4),
  ('funeral',         'Lubong (Funeral)',               5),
  ('blessing',        'Panalangin (Blessings)',         6)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Announcements. publish_on / expires_on let staff schedule them ahead.
-- ---------------------------------------------------------------------------
create table if not exists announcements (
  id          serial primary key,
  title       text not null,
  body        text,
  category    text not null default 'Parish'
              check (category in ('Parish', 'GKK', 'Ministry', 'Schedule change')),
  urgent      boolean not null default false,
  pinned      boolean not null default false,
  publish_on  date not null default public.parish_today(),
  expires_on  date,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (expires_on is null or expires_on >= publish_on)
);

-- ---------------------------------------------------------------------------
-- Weekly bulletin, typed in. One per week.
-- ---------------------------------------------------------------------------
create table if not exists bulletins (
  id          serial primary key,
  week_of     date not null unique,
  title       text not null,
  body        text,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Events calendar. end_date is for multi-day events such as a novena. The
-- GKK follows renames (rename_gkk updates gkks.name) and clears on delete.
-- ---------------------------------------------------------------------------
create table if not exists events (
  id          serial primary key,
  title       text not null,
  type        text not null default 'Other'
              check (type in ('Fiesta', 'Novena', 'Recollection / Retreat', 'GKK Rotation', 'Seminar', 'Meeting', 'Other')),
  start_date  date not null,
  end_date    date,
  start_time  time,
  end_time    time,
  location    text,
  gkk         text references gkks(name) on update cascade on delete set null,
  organizer   text,
  description text,
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create index if not exists events_start_date_idx on events (start_date);
create index if not exists announcements_publish_on_idx on announcements (publish_on desc);

-- ---------------------------------------------------------------------------
-- Office hours and contact details, on the existing settings row.
-- office_hours is 7 entries, Sunday first:
--   [{ "closed": bool, "open": "08:00", "close": "17:00",
--      "break_from": "12:00", "break_to": "13:00" }, …]
-- ---------------------------------------------------------------------------
alter table parish_settings add column if not exists office_hours      jsonb;
alter table parish_settings add column if not exists mobile            text not null default '';
alter table parish_settings add column if not exists facebook_url      text not null default '';
alter table parish_settings add column if not exists sick_call_contact text not null default '';
alter table parish_settings add column if not exists directions        text not null default '';
alter table parish_settings add column if not exists map_url           text not null default '';
alter table parish_settings add column if not exists latitude          numeric(9, 6);
alter table parish_settings add column if not exists longitude         numeric(9, 6);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['mass_schedules', 'sacrament_guides', 'announcements', 'bulletins', 'events'] loop
    execute format('drop trigger if exists trg_%1$s_touch on %1$I', t);
    execute format('create trigger trg_%1$s_touch before update on %1$I
                    for each row execute function public.website_touch_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security: staff manage everything; the public reads only what
-- is published (announcements only between their start and end dates).
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['mass_schedules', 'sacrament_guides', 'announcements', 'bulletins', 'events'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_admin_all', t);
    execute format('create policy %I on %I for all to authenticated using (true) with check (true)', t || '_admin_all', t);
    execute format('drop policy if exists %I on %I', t || '_public_select', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select on %I to anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('grant usage, select on sequence %I to authenticated', t || '_id_seq');
  end loop;
end;
$$;

create policy "mass_schedules_public_select" on mass_schedules
  for select to anon using (published);
create policy "sacrament_guides_public_select" on sacrament_guides
  for select to anon using (published);
create policy "bulletins_public_select" on bulletins
  for select to anon using (published);
create policy "events_public_select" on events
  for select to anon using (published);
create policy "announcements_public_select" on announcements
  for select to anon using (
    published
    and publish_on <= public.parish_today()
    and (expires_on is null or expires_on >= public.parish_today())
  );

grant execute on function public.parish_today() to anon, authenticated;
