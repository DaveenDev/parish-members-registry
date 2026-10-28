-- Last year's list: fixing how a name is matched to its household in the
-- registry (see matchListToRegistry() in client/src/lib/census.js). Run after
-- 0051_gkk_leader_census_writes.sql. Safe to re-run.
--
-- A name on the list is found in the registry by its head of household's
-- name. Staff or the GKK's leader can now correct that:
--   household_id       (already there since 0041, unused until now): "Choose
--                      household" links the name to a household by hand, for
--                      when someone else registered as head (the wife, a
--                      son) or under another name. A linked name counts as
--                      registered while the household is in the registry.
--   not_household_ids  "Not this household": households this name must
--                      never be matched to automatically, e.g. the father
--                      when it's the son who registered.
-- Who may change a GKK's names is unchanged (0041).

do $$
begin
  if to_regclass('public.census_last_year_list') is null then
    raise exception 'Run 0041_census_last_year_list.sql before this migration';
  end if;
end;
$$;

alter table census_last_year_list add column if not exists not_household_ids integer[] not null default '{}';

create index if not exists idx_census_last_year_list_household on census_last_year_list(household_id) where household_id is not null;
