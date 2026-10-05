-- Whether the parish uses last year's household list (0041). Run after
-- 0047_household_ref_format.sql. Safe to re-run.
--
-- On (the default, as before): the census measures each GKK against its
-- names on last year's list, or the household count typed in Parish GKK,
-- and the names not yet ticked off are the families to visit.
-- Off: the census measures itself against the previous census in the
-- registry: the households that took part then and have nobody confirmed in
-- this one yet are the families to visit. The list's names are kept, just
-- not used or shown, so it can be turned back on.
-- Set in Parish Config -> Last year's list by staff with full access.

do $$
begin
  if to_regclass('public.census_last_year_list') is null then
    raise exception 'Run 0041_census_last_year_list.sql before this migration';
  end if;
end;
$$;

alter table parish_settings add column if not exists last_year_list_enabled boolean not null default true;
