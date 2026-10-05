-- Last year's list takes priority over the household count. Run after
-- 0057_family_grouping_order.sql. Safe to re-run.
--
-- A GKK's baseline for the census is its names on last year's list (0041)
-- while the parish uses the list (0048), or else the count typed in Parish
-- GKK -> Households last year (0040). When the list is on and a GKK has
-- names on it (not set aside as moved away, deceased or duplicate) that
-- don't add up to the typed count, the count is cleared so the two never
-- disagree later: the list is the baseline. This happens
-- - when names are added, changed, set aside or removed (by staff or the
--   GKK's leader),
-- - when staff type a count that doesn't match the list: it saves empty,
-- - when the list is turned back on, and once now for what's there.
-- A count that matches the list is kept. With the list off the count is
-- the baseline until a census is recorded in the registry.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'parish_settings' and column_name = 'last_year_list_enabled') then
    raise exception 'Run 0048_last_year_list_switch.sql before this migration';
  end if;
  if to_regprocedure('public.gkk_leader_fields()') is null then
    raise exception 'Run 0045_gkk_leader_my_gkk.sql before this migration';
  end if;
end;
$$;

-- Names on a GKK's list that still count (keep in sync with LAST_YEAR_SET_ASIDE in client/src/lib/census.js).
create or replace function public.last_year_list_names(p_gkk text) returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int from census_last_year_list
   where gkk = p_gkk and status not in ('Moved away', 'Deceased', 'Duplicate');
$$;

create or replace function public.last_year_list_on() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select last_year_list_enabled from parish_settings where id = 1), true);
$$;

-- Clear one GKK's count (or every GKK's, for null) where it doesn't match its list.
create or replace function public.last_year_count_reset(p_gkk text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not last_year_list_on() then
    return;
  end if;
  -- Lets guard_staff_write pass this for a GKK leader, who can't change the count themselves.
  perform set_config('parish.last_year_count_reset', 'on', true);
  update gkks g set previous_households = null
   where (p_gkk is null or g.name = p_gkk)
     and g.previous_households is not null
     and last_year_list_names(g.name) > 0
     and g.previous_households <> last_year_list_names(g.name);
  perform set_config('parish.last_year_count_reset', 'off', true);
end;
$$;

-- After any change to the list.
create or replace function public.census_last_year_list_count_reset() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'DELETE' then
    perform last_year_count_reset(new.gkk);
  end if;
  if tg_op <> 'INSERT' and (tg_op = 'DELETE' or old.gkk is distinct from new.gkk) then
    perform last_year_count_reset(old.gkk);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_census_last_year_list_count_reset on census_last_year_list;
create trigger trg_census_last_year_list_count_reset after insert or update or delete on census_last_year_list
  for each row execute function census_last_year_list_count_reset();

-- A count typed while the GKK has names on the list: kept only if it matches them.
create or replace function public.gkks_last_year_count() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  names integer;
begin
  if new.previous_households is not null and last_year_list_on() then
    names := last_year_list_names(new.name);
    if names > 0 and new.previous_households <> names then
      new.previous_households := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_gkks_last_year_count on gkks;
create trigger trg_gkks_last_year_count before update of previous_households on gkks
  for each row execute function gkks_last_year_count();

-- Turning the list back on.
create or replace function public.parish_settings_last_year_count_reset() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.last_year_list_enabled and old.last_year_list_enabled is distinct from true then
    perform last_year_count_reset(null);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_parish_settings_last_year_count_reset on parish_settings;
create trigger trg_parish_settings_last_year_count_reset after update of last_year_list_enabled on parish_settings
  for each row execute function parish_settings_last_year_count_reset();

-- As in 0045, plus: a GKK leader's change to their list may clear their
-- GKK's count through last_year_count_reset().
create or replace function public.guard_staff_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  acc text := staff_access();
  area text := tg_argv[0];
  mine text := staff_gkk();
  ok boolean := false;
  reset text[] := '{}';
begin
  if acc is null or acc = 'full' then
    ok := true;
  elsif acc = 'website' then
    ok := area in ('website', 'requests');
    -- (nested, since only gkks rows have a name to compare)
    if area = 'gkks' and tg_op = 'UPDATE' then
      ok := new.name = old.name;
    end if;
  elsif acc = 'gkk_leader' and area = 'registry' and tg_op <> 'DELETE' then
    if tg_table_name = 'households' then
      ok := new.gkk = mine and (tg_op = 'INSERT' or old.gkk = mine);
    else
      ok := exists (select 1 from households h where h.id = new.household_id and h.gkk = mine)
        and (tg_op = 'INSERT' or exists (select 1 from households h where h.id = old.household_id and h.gkk = mine));
    end if;
    if not ok then
      raise exception 'Your account can only change households in %', mine using errcode = '42501';
    end if;
  elsif acc = 'gkk_leader' and area = 'verification' and tg_op = 'DELETE' then
    ok := exists (select 1 from members m join households h on h.id = m.household_id
                  where m.id = old.member_id and h.gkk = mine);
  elsif acc = 'gkk_leader' and area = 'gkks' and tg_op = 'UPDATE' then
    if current_setting('parish.last_year_count_reset', true) = 'on' and new.previous_households is null then
      reset := array['previous_households'];
    end if;
    -- Everything but the leader's fields must stay as it was.
    ok := old.name = mine
      and (to_jsonb(new) - gkk_leader_fields() - reset) = (to_jsonb(old) - gkk_leader_fields() - reset);
    if not ok then
      raise exception 'Your account can only change the chapel details and history of %', coalesce(mine, 'your GKK') using errcode = '42501';
    end if;
  end if;

  if not ok then
    raise exception '%', case acc
      when 'read_only' then 'Your account can view records but not change them'
      when 'gkk_leader' then 'Your account can only update the households and members of your GKK'
      else 'Your account can''t change this. Ask a staff admin.'
    end using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.guard_staff_write() from public, anon, authenticated;
revoke all on function public.last_year_list_names(text) from public, anon, authenticated;
revoke all on function public.last_year_list_on() from public, anon, authenticated;
revoke all on function public.last_year_count_reset(text) from public, anon, authenticated;
revoke all on function public.census_last_year_list_count_reset() from public, anon, authenticated;
revoke all on function public.gkks_last_year_count() from public, anon, authenticated;
revoke all on function public.parish_settings_last_year_count_reset() from public, anon, authenticated;

-- What's there now.
do $$ begin perform public.last_year_count_reset(null); end $$;
