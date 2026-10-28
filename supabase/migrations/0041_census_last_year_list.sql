-- Last year's household list: the families on last year's paper census,
-- typed in (or uploaded) per GKK so the ongoing census can show which of
-- them have not registered yet. Run after 0040_gkk_previous_households.sql.
-- Safe to re-run.
--
-- These are not households or members: only a head of household's name, a
-- purok and a note, kept as a checklist. Staff or the GKK's leader tick
-- each name off as Registered, or set it aside (moved away, deceased,
-- duplicate) so it no longer counts as "not yet". The names belong to
-- families who haven't consented to the registry, so only staff who see
-- the whole registry and the GKK's own leader can read them, and the list
-- can be cleared once the census is done.
--
-- When a GKK has a list, the census uses it as the GKK's baseline in place
-- of the typed count from 0040.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'gkks' and column_name = 'previous_households') then
    raise exception 'Run 0040_gkk_previous_households.sql before this migration';
  end if;
  if to_regprocedure('public.staff_sees_gkk(text)') is null or to_regprocedure('public.census_staff_name()') is null then
    raise exception 'Run 0007_census.sql and 0014_roles_activity_trash.sql before this migration';
  end if;
end;
$$;

-- Keep in sync with LAST_YEAR_STATUSES in client/src/lib/census.js.
create table if not exists census_last_year_list (
  id              serial primary key,
  -- Renaming a GKK carries its list along; deleting a GKK deletes its list.
  gkk             text not null references gkks(name) on update cascade on delete cascade,
  head_name       text not null check (length(trim(head_name)) between 1 and 200),
  purok           text check (purok is null or length(purok) <= 200),
  note            text check (note is null or length(note) <= 500),
  status          text not null default 'Not yet'
                  check (status in ('Not yet', 'Registered', 'Moved away', 'Deceased', 'Duplicate')),
  -- For matching a name to its registered household later; unused for now.
  household_id    integer references households(id) on delete set null,
  checked_by      uuid references auth.users(id) on delete set null,
  checked_by_name text,
  checked_at      timestamptz,
  created_by      uuid references auth.users(id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now()
);

create index if not exists idx_census_last_year_list_gkk on census_last_year_list(gkk, status);

-- Who ticked a name off, and when (set here, not by the browser).
create or replace function public.census_last_year_list_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.head_name := trim(new.head_name);
  new.purok := nullif(trim(new.purok), '');
  new.note := nullif(trim(new.note), '');
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  end if;
  if tg_op = 'INSERT' and new.status <> 'Not yet' or tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'Not yet' then
      new.checked_by := null; new.checked_by_name := null; new.checked_at := null;
    else
      new.checked_by := auth.uid(); new.checked_by_name := census_staff_name(); new.checked_at := now();
    end if;
  elsif tg_op = 'UPDATE' then
    new.checked_by := old.checked_by; new.checked_by_name := old.checked_by_name; new.checked_at := old.checked_at;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_census_last_year_list_stamp on census_last_year_list;
create trigger trg_census_last_year_list_stamp before insert or update on census_last_year_list
  for each row execute function census_last_year_list_stamp();

-- Writes: full access for any GKK, a GKK leader for their own GKK only.
create or replace function public.guard_last_year_list_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  acc text := staff_access();
  mine text := staff_gkk();
begin
  if acc = 'full' then
    return coalesce(new, old);
  end if;
  if acc = 'gkk_leader'
     and (tg_op = 'INSERT' or old.gkk = mine)
     and (tg_op = 'DELETE' or new.gkk = mine) then
    return coalesce(new, old);
  end if;
  raise exception '%', case acc
    when 'read_only' then 'Your account can view records but not change them'
    when 'gkk_leader' then 'Your account can only change the list for ' || coalesce(mine, 'your GKK')
    else 'Your account can''t change this. Ask a staff admin.'
  end using errcode = '42501';
end;
$$;

revoke all on function public.guard_last_year_list_write() from public, anon, authenticated;
revoke all on function public.census_last_year_list_stamp() from public, anon, authenticated;

drop trigger if exists trg_00_guard_staff_write on census_last_year_list;
create trigger trg_00_guard_staff_write before insert or update or delete on census_last_year_list
  for each row execute function guard_last_year_list_write();

-- Reads: as for households (0039's form, worked out once per query).
alter table census_last_year_list enable row level security;

drop policy if exists "census_last_year_list_staff" on census_last_year_list;
create policy "census_last_year_list_staff" on census_last_year_list
  for all to authenticated
  using ((select staff_can_see('registry'))
         or ((select staff_access()) = 'gkk_leader' and gkk = (select staff_gkk())))
  with check (true);

revoke all on census_last_year_list from anon, authenticated;
grant select, insert, update, delete on census_last_year_list to authenticated;
grant usage, select on sequence census_last_year_list_id_seq to authenticated;
