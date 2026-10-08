-- Census: change a census's name, start date or target end after it has
-- started, and delete one started by mistake. Run after
-- 0071_census_update_links.sql. Safe to re-run.
--
--   * census_update_cycle: the name (still unique), start and target end.
--   * census_delete_cycle: removes the census with its recorded answers,
--     snapshots and online updates (they cascade). Members' records keep
--     what was saved to them; only the census and its answers go.
--
-- Both are full access only, like starting or closing a census: the
-- census_cycles write guard (0014) refuses anyone else.

do $$
begin
  if to_regprocedure('public.census_staff_name()') is null or to_regprocedure('public.guard_staff_write()') is null then
    raise exception 'Run the migrations up to 0014_roles_activity_trash.sql before this one';
  end if;
end;
$$;

create or replace function public.census_update_cycle(p_cycle_id integer, p_label text, p_starts_on date, p_ends_on date default null)
returns census_cycles
language plpgsql security definer set search_path = public as $$
declare
  saved census_cycles;
  name text := trim(coalesce(p_label, ''));
begin
  if census_staff_name() is null then raise exception 'Only parish staff can change a census'; end if;
  if name = '' then raise exception 'Give the census a name, e.g. "2026 Census"'; end if;
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

create or replace function public.census_delete_cycle(p_cycle_id integer)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if census_staff_name() is null then raise exception 'Only parish staff can delete a census'; end if;
  delete from census_cycles where id = p_cycle_id;
  if not found then raise exception 'This census no longer exists'; end if;
end;
$$;

revoke execute on function public.census_update_cycle(integer, text, date, date) from public, anon;
revoke execute on function public.census_delete_cycle(integer) from public, anon;
grant execute on function public.census_update_cycle(integer, text, date, date) to authenticated;
grant execute on function public.census_delete_cycle(integer) to authenticated;
