-- Census: a closed census can be reopened, and its start date and target
-- end changed, as long as it is still the census's year (the year it
-- started in). Run after 0082_census_results_snapshot.sql and
-- 0073_census_edit_delete.sql. Safe to re-run.
--
--   * census_reopen_cycle: takes the new start date and target end too,
--     saved in the same step as the reopen. Refused for a census that
--     started in an earlier year.
--   * census_update_cycle: a closed census from an earlier year keeps its
--     dates; its name can still be changed. An open census, or one closed
--     this year, can change both, as before.
--
-- Both stay full access only: the census_cycles write guard (0014) refuses
-- anyone else.

do $$
begin
  if to_regprocedure('public.census_reopen_cycle(integer)') is null
     and to_regprocedure('public.census_reopen_cycle(integer, date, date)') is null then
    raise exception 'Run the migrations up to 0082_census_results_snapshot.sql before this one';
  end if;
  if to_regprocedure('public.census_update_cycle(integer, text, date, date)') is null then
    raise exception 'Run 0073_census_edit_delete.sql before this one';
  end if;
end;
$$;

-- Replaces the one-argument version: with both, a call naming only the
-- census would not know which to use.
drop function if exists public.census_reopen_cycle(integer);
create or replace function public.census_reopen_cycle(p_cycle_id integer, p_starts_on date default null, p_ends_on date default null)
returns census_cycles
language plpgsql security definer set search_path = public as $$
declare
  open_label text;
  cyc census_cycles;
  saved census_cycles;
  new_start date;
begin
  if census_staff_name() is null then raise exception 'Only parish staff can reopen a census'; end if;
  select * into cyc from census_cycles where id = p_cycle_id;
  if cyc.id is null then raise exception 'This census no longer exists'; end if;
  if cyc.status <> 'Closed' then raise exception 'This census is not closed'; end if;
  if extract(year from cyc.starts_on) <> extract(year from current_date) then
    raise exception 'The % started in %. Only a census from this year can be reopened; start a new census instead.',
      cyc.label, extract(year from cyc.starts_on)::int;
  end if;
  select label into open_label from census_cycles where status = 'Open' and id <> p_cycle_id;
  if open_label is not null then
    raise exception 'Close the open census (%) before reopening another one', open_label;
  end if;
  new_start := coalesce(p_starts_on, cyc.starts_on);
  if p_ends_on is not null and p_ends_on < new_start then
    raise exception 'The target end date is before the start date';
  end if;

  -- No dates given (an older app): the census keeps its target end.
  update census_cycles
  set status = 'Open', closed_at = null, starts_on = new_start,
      ends_on = case when p_starts_on is null and p_ends_on is null then ends_on else p_ends_on end
  where id = p_cycle_id and status = 'Closed'
  returning * into saved;
  if saved.id is null then raise exception 'This census is not closed'; end if;
  -- As in 0082: a reopened census is live again, so its kept results go.
  delete from census_results where cycle_id = p_cycle_id;
  return saved;
end;
$$;

-- As in 0073, but a closed census from an earlier year keeps its dates.
create or replace function public.census_update_cycle(p_cycle_id integer, p_label text, p_starts_on date, p_ends_on date default null)
returns census_cycles
language plpgsql security definer set search_path = public as $$
declare
  saved census_cycles;
  cyc census_cycles;
  name text := trim(coalesce(p_label, ''));
begin
  if census_staff_name() is null then raise exception 'Only parish staff can change a census'; end if;
  if name = '' then raise exception 'Give the census a name, e.g. "2026 Census"'; end if;
  select * into cyc from census_cycles where id = p_cycle_id;
  if cyc.id is null then raise exception 'This census no longer exists'; end if;
  if cyc.status = 'Closed'
     and extract(year from cyc.starts_on) <> extract(year from current_date)
     and (coalesce(p_starts_on, cyc.starts_on) <> cyc.starts_on or p_ends_on is distinct from cyc.ends_on) then
    raise exception 'The % is closed and started in %, so its dates stay as they are. Its name can still be changed.',
      cyc.label, extract(year from cyc.starts_on)::int;
  end if;
  if p_ends_on is not null and p_ends_on < coalesce(p_starts_on, current_date) then
    raise exception 'The target end date is before the start date';
  end if;
  if exists (select 1 from census_cycles where lower(label) = lower(name) and id <> p_cycle_id) then
    raise exception 'A census named "%" already exists', name;
  end if;

  update census_cycles
  set label = name, starts_on = coalesce(p_starts_on, starts_on), ends_on = p_ends_on
  where id = p_cycle_id
  returning * into saved;
  if saved.id is null then raise exception 'This census no longer exists'; end if;
  return saved;
end;
$$;

revoke all on function public.census_reopen_cycle(integer, date, date) from public, anon;
grant execute on function public.census_reopen_cycle(integer, date, date) to authenticated;
revoke execute on function public.census_update_cycle(integer, text, date, date) from public, anon;
grant execute on function public.census_update_cycle(integer, text, date, date) to authenticated;
