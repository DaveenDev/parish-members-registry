-- "Bata pa" (a child, not rated) now covers members aged 8 and under, the
-- age the census treats as a young child. Run after
-- 0084_activeness_by_census.sql. Safe to re-run.
--
-- The census counts children of 8 and under as Active with no questions to
-- answer (the portal, the printed form and the staff census panel), but the
-- Practicing Catholic score only left out children under 7. So 7- and
-- 8-year-olds never had answers and showed as "Wala pa matino" (no answers
-- yet) in the Analysis Report and on the Members list, census after census.
-- Now they are "Bata pa" like younger children: not rated, and counted
-- apart. Keep 8 in step with YOUNG_CHILD_MAX_AGE in client/src/lib/census.js.

-- As in 0017, with "Bata pa" up to 8 instead of under 7.
create or replace function public.practice_level(p_score numeric, p_participation numeric, p_age integer, p_religion text, p_is_current boolean)
returns text
language sql immutable as $$
  select case
    when not coalesce(p_is_current, true) then null
    when coalesce(nullif(trim(p_religion), ''), 'Roman Catholic') <> 'Roman Catholic' then 'Dili Katoliko'
    when p_age is not null and p_age <= 8 then 'Bata pa'
    when p_participation is null then 'Wala pa matino'
    when p_score >= 70 then 'Aktibo'
    when p_score >= 40 then 'Panagsa'
    else 'Dili aktibo'
  end;
$$;
