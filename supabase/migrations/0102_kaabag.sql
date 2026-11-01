-- Kaabag on the public website: its own page (/simbahan/kaabag, under Ang
-- Simbahan in the menu) with the month's rotation of Kaabag at the Masses,
-- the Kaabag directory (names and photos) and the Kaabag Structure org
-- chart. Run after 0101_demo_access.sql. Safe to re-run.
--
-- 1. The directory (kaabag_members): each Kaabag the website may name, a
--    member of the registry (staff pick them from those in the Kaabag
--    ministry) or a typed name, with a photo, a role ("Presidente",
--    "Grupo 1") and their order. Only those shown in the directory
--    (published) are listed there.
-- 2. The rotation: a month (kaabag_months) is a draft until published; its
--    Masses (kaabag_services: the date, time, place and a note) each have
--    their Kaabag (kaabag_service_servers). A month is saved in one go
--    through save_kaabag_month(), which writes one activity log entry.
-- 3. The Kaabag Structure chart in Parish life → Organization Structure,
--    built in like the Church Structure (it can't be deleted), with a
--    starting set of officers to change. Off the website until published.
--
-- Parish Website → Kaabag keeps the directory and the rotation: staff who
-- run the website (Full access, Website & requests) change them, read-only
-- staff look. The website reads them through public_kaabag(): names, roles,
-- photos and the published months only, never a member id. Photos go to the
-- same R2 folder as the org chart's ('org'), so media-upload needs no
-- redeploy.

do $$
begin
  if to_regprocedure('public.guard_demo_login()') is null
     or to_regprocedure('public.staff_edits_website()') is null
     or to_regclass('public.org_charts') is null then
    raise exception 'Run the migrations up to 0101_demo_access.sql before this one';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. The directory
-- ---------------------------------------------------------------------------

create table if not exists kaabag_members (
  id          serial primary key,
  -- The registry member, when picked from it; the directory keeps its own
  -- name for them (filled in from the registry, and changeable).
  member_id   integer references members on delete set null,
  name        text not null check (length(trim(name)) between 1 and 120),
  role        text check (role is null or length(role) <= 80),
  photo_url   text check (photo_url is null or photo_url ~* '^https://'),
  sort_order  integer not null default 0,
  -- Shown in the website's directory. A Kaabag on a published month's
  -- rotation is named there either way; their photo only when shown here.
  published   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A registry member is in the directory once.
create unique index if not exists kaabag_members_member_idx on kaabag_members (member_id) where member_id is not null;

drop trigger if exists trg_kaabag_members_touch on kaabag_members;
create trigger trg_kaabag_members_touch before update on kaabag_members
  for each row execute function public.website_touch_updated_at();

-- The website's staff, like the other website tables (0014, 0067).
drop trigger if exists trg_00_guard_staff_write on kaabag_members;
create trigger trg_00_guard_staff_write before insert or update or delete on kaabag_members
  for each row execute function guard_staff_write('website');

-- Each insert, change and delete in the activity log (0076).
drop trigger if exists trg_zz_activity_log on kaabag_members;
create trigger trg_zz_activity_log after insert or update or delete on kaabag_members
  for each row execute function log_record_activity();

-- ---------------------------------------------------------------------------
-- 2. The rotation
-- ---------------------------------------------------------------------------

create table if not exists kaabag_months (
  month       date primary key check (month = date_trunc('month', month)::date),
  published   boolean not null default false,
  -- A line above the month's rotation, e.g. who to call to swap a turn.
  note        text check (note is null or length(note) <= 500),
  updated_at  timestamptz not null default now()
);

create table if not exists kaabag_services (
  id            serial primary key,
  month         date not null references kaabag_months on delete cascade,
  service_date  date not null,
  start_time    time not null,
  location      text check (location is null or length(location) <= 120),
  note          text check (note is null or length(note) <= 200),
  constraint kaabag_services_in_month check (date_trunc('month', service_date)::date = month)
);
create index if not exists kaabag_services_month_idx on kaabag_services (month, service_date, start_time);

create table if not exists kaabag_service_servers (
  service_id  integer not null references kaabag_services on delete cascade,
  -- Taken off the directory: off every rotation too.
  kaabag_id   integer not null references kaabag_members on delete cascade,
  sort_order  smallint not null default 0,
  primary key (service_id, kaabag_id)
);
create index if not exists kaabag_service_servers_kaabag_idx on kaabag_service_servers (kaabag_id);

-- ---------------------------------------------------------------------------
-- Who reads and writes
-- ---------------------------------------------------------------------------

/** True when the signed-in account sees the Parish Website pages: Full access, Read only, Website & requests. */
create or replace function public.staff_sees_website() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(staff_access() in ('full', 'read_only', 'website'), false);
$$;

revoke all on function public.staff_sees_website() from public, anon;
grant execute on function public.staff_sees_website() to authenticated;

alter table kaabag_members enable row level security;
alter table kaabag_months enable row level security;
alter table kaabag_services enable row level security;
alter table kaabag_service_servers enable row level security;

-- The directory: written directly, the guard trigger above saying who may.
drop policy if exists kaabag_members_staff on kaabag_members;
create policy kaabag_members_staff on kaabag_members for all to authenticated
  using ((select staff_sees_website())) with check (true);

-- The rotation: read here, written only through save_kaabag_month().
do $$
declare
  t text;
begin
  foreach t in array array['kaabag_months', 'kaabag_services', 'kaabag_service_servers'] loop
    execute format('drop policy if exists %I on %I', t || '_staff_select', t);
    execute format('create policy %I on %I for select to authenticated using ((select staff_sees_website()))', t || '_staff_select', t);
  end loop;
end;
$$;

revoke all on kaabag_members, kaabag_months, kaabag_services, kaabag_service_servers from anon;
revoke insert, update, delete, truncate on kaabag_months, kaabag_services, kaabag_service_servers from authenticated;
grant select, insert, update, delete on kaabag_members to authenticated;
grant select on kaabag_months, kaabag_services, kaabag_service_servers to authenticated;
grant usage, select on sequence kaabag_members_id_seq to authenticated;

/** Refuse an account that doesn't run the website (the SQL editor, with no account, may). */
create or replace function public.kaabag_require_website() returns void
language plpgsql stable security definer set search_path = public as $$
declare
  acc text := staff_access();
begin
  if acc is not null and acc not in ('full', 'website') then
    raise exception '%', case
      when acc = 'none' then 'Your account hasn''t been given access yet. Ask a staff admin to set it in Settings → Staff.'
      when acc = 'read_only' then 'Your account can view records but not change them'
      else 'Your account can''t change the parish website. Ask a staff admin.'
    end using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.kaabag_require_website() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Changes
-- ---------------------------------------------------------------------------

/**
 * The directory's order, top to bottom: `p_ids` are kaabag_members ids.
 * One activity log entry for the whole move, not one per row.
 */
create or replace function public.reorder_kaabag_members(p_ids integer[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform kaabag_require_website();
  if cardinality(coalesce(p_ids, '{}')) = 0 then return; end if;
  perform set_config('app.audit_skip', 'on', true);
  update kaabag_members k set sort_order = x.ord
  from unnest(p_ids) with ordinality as x(id, ord)
  where k.id = x.id and k.sort_order is distinct from x.ord::integer;
  perform set_config('app.audit_skip', 'off', true);
  insert into activity_log (actor, actor_name, action, table_name, record_id, label, changes)
  values (auth.uid(), current_staff_name(), 'update', 'kaabag_members', null, 'Kaabag directory', jsonb_build_object('order', 'changed'));
end;
$$;

/**
 * Save one month of the rotation. `p_month` is any day in it. `p_services`
 * is every Mass that month: [{ date, time, location?, note?, servers:
 * [kaabag_members id…] }], replacing what was saved; null leaves them as
 * they are (to publish or unpublish only). A null `p_published` or
 * `p_note` leaves that as it is. Returns the month's row.
 */
create or replace function public.save_kaabag_month(
  p_month date, p_services jsonb default null, p_published boolean default null, p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m date := date_trunc('month', p_month)::date;
  label_month text := to_char(date_trunc('month', p_month), 'FMMonth YYYY');
  old kaabag_months;
  cur kaabag_months;
  s jsonb;
  k jsonb;
  sid integer;
  kid integer;
  d date;
  t time;
  ord integer;
  old_count integer := 0;
  new_count integer;
  diff jsonb := '{}'::jsonb;
begin
  perform kaabag_require_website();
  if p_month is null then raise exception 'Choose the month'; end if;
  if p_services is not null and jsonb_typeof(p_services) <> 'array' then raise exception 'Nothing to save'; end if;
  if p_services is not null and jsonb_array_length(p_services) > 200 then raise exception 'A month can have at most 200 Masses'; end if;
  if length(trim(coalesce(p_note, ''))) > 500 then raise exception 'Keep the note under 500 characters'; end if;

  select * into old from kaabag_months where month = m for update;
  select count(*) into old_count from kaabag_services where month = m;

  insert into kaabag_months (month, published, note)
  values (m, coalesce(p_published, false), nullif(trim(coalesce(p_note, '')), ''))
  on conflict (month) do update set
    published = coalesce(p_published, kaabag_months.published),
    note = case when p_note is null then kaabag_months.note else nullif(trim(p_note), '') end,
    updated_at = now()
  returning * into cur;

  if p_services is not null then
    delete from kaabag_services where month = m;
    for s in select * from jsonb_array_elements(p_services) loop
      if coalesce(s->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Each Mass needs its date'; end if;
      d := (s->>'date')::date;
      if date_trunc('month', d)::date <> m then raise exception 'Each Mass must be on a day in %', label_month; end if;
      if coalesce(s->>'time', '') !~ '^\d{1,2}:\d{2}(:\d{2})?$' then raise exception 'The Mass on % needs its time', to_char(d, 'FMMonth FMDD'); end if;
      t := (s->>'time')::time;
      if length(coalesce(s->>'location', '')) > 120 then raise exception 'Keep the place of the Mass on % under 120 characters', to_char(d, 'FMMonth FMDD'); end if;
      if length(coalesce(s->>'note', '')) > 200 then raise exception 'Keep the note on the Mass on % under 200 characters', to_char(d, 'FMMonth FMDD'); end if;
      if jsonb_typeof(coalesce(s->'servers', '[]'::jsonb)) <> 'array' then raise exception 'The Kaabag on % aren''t a list', to_char(d, 'FMMonth FMDD'); end if;
      if jsonb_array_length(coalesce(s->'servers', '[]'::jsonb)) > 30 then raise exception 'At most 30 Kaabag per Mass'; end if;

      insert into kaabag_services (month, service_date, start_time, location, note)
      values (m, d, t, nullif(trim(s->>'location'), ''), nullif(trim(s->>'note'), ''))
      returning id into sid;

      ord := 0;
      for k in select * from jsonb_array_elements(coalesce(s->'servers', '[]'::jsonb)) loop
        kid := case when (k #>> '{}') ~ '^\d+$' then (k #>> '{}')::integer end;
        if kid is null or not exists (select 1 from kaabag_members where id = kid) then
          raise exception 'A Kaabag on the Mass of % is no longer in the directory. Reload the page and try again.', to_char(d, 'FMMonth FMDD');
        end if;
        insert into kaabag_service_servers (service_id, kaabag_id, sort_order) values (sid, kid, ord)
        on conflict do nothing;
        ord := ord + 1;
      end loop;
    end loop;
  end if;

  select count(*) into new_count from kaabag_services where month = m;
  if p_services is not null then diff := diff || jsonb_build_object('services', jsonb_build_array(old_count, new_count)); end if;
  if old.month is null or cur.published is distinct from old.published then
    diff := diff || jsonb_build_object('published', jsonb_build_array(old.published, cur.published));
  end if;
  if cur.note is distinct from old.note then diff := diff || jsonb_build_object('note', jsonb_build_array(activity_short(to_jsonb(old.note)), activity_short(to_jsonb(cur.note)))); end if;

  if diff <> '{}'::jsonb then
    insert into activity_log (actor, actor_name, action, table_name, record_id, label, changes)
    values (auth.uid(), current_staff_name(), case when old.month is null then 'insert' else 'update' end,
            'kaabag_months', m::text, 'Kaabag rotation, ' || label_month, diff);
  end if;
  return to_jsonb(cur);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['reorder_kaabag_members(integer[])', 'save_kaabag_month(date, jsonb, boolean, text)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- The website
-- ---------------------------------------------------------------------------

/**
 * The Kaabag page: { directory: [{ id, name, role, photo }], months: [{
 * month, note, services: [{ date, time, location, note, servers: [{ id,
 * name, photo }] }] }] }. The directory as shown there, in order; the
 * published months from last month on. On the rotation, a Kaabag left out
 * of the directory keeps their name but not their photo or id.
 */
create or replace function public.public_kaabag() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'directory', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', k.id, 'name', trim(k.name), 'role', nullif(trim(k.role), ''), 'photo', nullif(trim(k.photo_url), ''))
             order by k.sort_order, lower(k.name), k.id)
      from kaabag_members k where k.published), '[]'::jsonb),
    'months', coalesce((
      select jsonb_agg(jsonb_build_object(
               'month', m.month,
               'note', m.note,
               'services', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'date', s.service_date,
                          'time', s.start_time,
                          'location', s.location,
                          'note', s.note,
                          'servers', coalesce((
                            select jsonb_agg(jsonb_build_object(
                                     'id', case when k.published then k.id end,
                                     'name', trim(k.name),
                                     'photo', case when k.published then nullif(trim(k.photo_url), '') end)
                                   order by ss.sort_order, k.id)
                            from kaabag_service_servers ss join kaabag_members k on k.id = ss.kaabag_id
                            where ss.service_id = s.id), '[]'::jsonb))
                        order by s.service_date, s.start_time, s.id)
                 from kaabag_services s where s.month = m.month), '[]'::jsonb))
             order by m.month)
      from kaabag_months m
      where m.published and m.month >= (date_trunc('month', parish_today()) - interval '1 month')::date), '[]'::jsonb));
$$;

revoke all on function public.public_kaabag() from public;
grant execute on function public.public_kaabag() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The Kaabag Structure chart
-- ---------------------------------------------------------------------------

do $$
declare
  c integer;
  top integer;
begin
  -- A chart staff already made under this name becomes the built-in one.
  update org_charts set builtin = true where slug = 'kaabag-structure' and not builtin;
  if not exists (select 1 from org_charts where slug = 'kaabag-structure') then
    insert into org_charts (title, slug, scope, builtin, sort_order)
    values ('Kaabag Structure', 'kaabag-structure', 'parish', true, coalesce((select max(sort_order) from org_charts), 0) + 1)
    returning id into c;
    insert into org_nodes (chart_id, title, sort_order) values (c, 'Kaabag President', 0) returning id into top;
    insert into org_nodes (chart_id, parent_id, title, sort_order)
    select c, top, t.name, t.ord
    from (values ('Vice-President', 0), ('Secretary', 1), ('Treasurer', 2)) as t(name, ord);
  end if;
end;
$$;
