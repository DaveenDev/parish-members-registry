-- The census counts families as well as households. Run after
-- 0078_members_by_gkk.sql. Safe to re-run.
--
-- A household (one house) can hold more than one family, each with its own
-- head (0054). The census measured households only; it now also measures
-- each GKK's families:
-- - gkks.previous_families: the number of families the GKK had last year,
--   typed in Parish Config -> Parish GKK beside "Households last year"
--   (0040). Null = not entered. It is the families baseline while the parish
--   uses last year's list, and with the list off until a census is recorded
--   in the registry. Staff only, like the household count.
-- - census_family_progress(cycle): every family (a household and its
--   family number) with whether any of its members answered in that census,
--   so a census can be measured against the families in the one before.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'members' and column_name = 'family_no') then
    raise exception 'Run 0054_household_families.sql before this migration';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'gkks' and column_name = 'previous_households') then
    raise exception 'Run 0040_gkk_previous_households.sql before this migration';
  end if;
end;
$$;

alter table gkks add column if not exists previous_families integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gkks_previous_families_check') then
    alter table gkks add constraint gkks_previous_families_check
      check (previous_families is null or previous_families between 0 and 100000);
  end if;
end;
$$;

-- One row per family among the members who are current or answered in the
-- census; took_part when any of them answered. Runs as the signed-in
-- account, so a GKK leader sees their own GKK's families.
create or replace function public.census_family_progress(p_cycle_id integer)
returns table (household_id integer, family_no integer, gkk text, took_part boolean)
language sql stable set search_path = public as $$
  select m.household_id, m.family_no::int, h.gkk, bool_or(r.member_id is not null)
  from members m
  join households h on h.id = m.household_id
  left join census_member_responses r on r.member_id = m.id and r.cycle_id = p_cycle_id
  where r.member_id is not null or member_is_current(m.membership_status)
  group by m.household_id, m.family_no, h.gkk;
$$;

revoke execute on function public.census_family_progress(integer) from public, anon;
grant execute on function public.census_family_progress(integer) to authenticated;
