-- Census → Households and Households: lists grouped by GKK, or by Family
-- Grouping when filtered to one GKK. Run after 0054_household_families.sql.
-- Safe to re-run.
--
-- family_grouping_no is a Family Grouping's number ('FG 3' → 3), so FG 10
-- sorts after FG 2; null when the grouping is unset or has no number.
--
-- - census_household_progress gains family_grouping and family_grouping_no.
--   The return type changes, so the function is dropped and created again
--   with 0008's body plus those columns.
-- - households_with_count gains family_grouping_no: 0054's view plus that
--   column at the end.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'members' and column_name = 'family_no') then
    raise exception 'Run 0054_household_families.sql before this migration';
  end if;
end;
$$;

drop function if exists public.census_household_progress(integer);
create function public.census_household_progress(p_cycle_id integer)
returns table (
  household_id integer, household_name text, ref_no text, gkk text, head_name text,
  members_expected integer, members_confirmed integer, progress text, pending_update boolean,
  family_grouping text, family_grouping_no integer
)
language sql stable as $$
  with per as (
    select h.id, h.household_name, h.ref_no, h.gkk, h.family_grouping,
      (select concat_ws(' ', m.first_name, m.last_name, nullif(m.suffix, ''))
         from members m where m.household_id = h.id and m.relationship = 'Head of Household'
        order by m.id limit 1) as head_name,
      count(m.id) filter (where r.member_id is not null or coalesce(m.membership_status not in ('Moved away', 'Deceased'), true))::int as expected,
      count(r.member_id)::int as confirmed
    from households h
    left join members m on m.household_id = h.id
    left join census_member_responses r on r.member_id = m.id and r.cycle_id = p_cycle_id
    group by h.id
  )
  select id, household_name, ref_no, gkk, head_name, expected, confirmed,
    case when confirmed = 0 then 'Not started'
         when confirmed >= expected then 'Confirmed'
         else 'Partly confirmed' end,
    exists (select 1 from census_submissions s where s.household_id = per.id and s.cycle_id = p_cycle_id and s.status = 'Pending'),
    nullif(btrim(family_grouping), ''),
    (substring(family_grouping from '\d{1,9}'))::int
  from per;
$$;

revoke execute on function public.census_household_progress(integer) from public, anon;
grant execute on function public.census_household_progress(integer) to authenticated;

drop view if exists households_with_count;
create view households_with_count
with (security_invoker = true) as
select
  h.*,
  (select count(*)::int from members m where m.household_id = h.id) as member_count,
  (select concat_ws(' ', m.first_name, m.last_name, nullif(m.suffix, ''))
     from members m
    where m.household_id = h.id and m.relationship = 'Head of Household'
    order by m.id limit 1) as head_name,
  greatest(1, (select count(distinct m.family_no)::int from members m
                where m.household_id = h.id and member_is_current(m.membership_status))) as family_count,
  (substring(h.family_grouping from '\d{1,9}'))::int as family_grouping_no
from households h;

grant select on households_with_count to authenticated;
