-- Last year's list: names registered in another GKK. Run after
-- 0052_last_year_list_links.sql. Safe to re-run.
--
-- A name on a GKK's list is only matched to a household of the same GKK. When
-- it's still "Not yet" there but a household in another GKK has a head with
-- that name, the list shows a note, so the GKK officer can report it to the
-- parish office (a duplicate, a family that moved, or a household filed under
-- the wrong GKK).
--
-- A GKK leader can't read other GKKs' households, so this function hands out
-- just enough to raise the note: the heads in other GKKs whose last name is
-- in one of this GKK's "Not yet" names, with their GKK. The household's id,
-- name and status only go to staff who see the whole registry. The page
-- applies the same name rules as the matching (matchListToRegistry()).

do $$
begin
  if to_regclass('public.census_last_year_list') is null or to_regprocedure('public.staff_gkk()') is null then
    raise exception 'Run 0014_roles_activity_trash.sql and 0041_census_last_year_list.sql before this migration';
  end if;
end;
$$;

create or replace function public.last_year_other_gkk_heads(p_gkk text)
returns table (household_id integer, household_name text, status text, gkk text,
               first_name text, middle_name text, last_name text, suffix text)
language plpgsql stable security definer set search_path = public as $$
declare
  whole boolean := staff_can_see('registry');
begin
  if not whole and not (staff_access() = 'gkk_leader' and p_gkk = staff_gkk()) then
    raise exception 'Your account can''t see this list' using errcode = '42501';
  end if;
  return query
    select case when whole then h.id end, case when whole then h.household_name end, case when whole then h.status end,
           h.gkk, m.first_name, m.middle_name, m.last_name, m.suffix
    from households h
    join lateral (
      select mm.first_name, mm.middle_name, mm.last_name, mm.suffix from members mm
      where mm.household_id = h.id and mm.relationship = 'Head of Household'
      order by mm.id limit 1
    ) m on true
    where h.gkk is distinct from p_gkk
      and coalesce(trim(m.last_name), '') <> ''
      and exists (select 1 from census_last_year_list l
                  where l.gkk = p_gkk and l.status = 'Not yet' and l.household_id is null
                    and l.head_name ilike '%' || trim(m.last_name) || '%');
end;
$$;

revoke all on function public.last_year_other_gkk_heads(text) from public, anon;
grant execute on function public.last_year_other_gkk_heads(text) to authenticated;
