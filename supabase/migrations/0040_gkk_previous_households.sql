-- Each GKK's household count from the previous year's census: the baseline
-- the ongoing census is measured against (how many households have already
-- registered in this census and how many have not yet). Entered by hand in
-- Parish Config → Parish GKK. Run after 0018_gkk_chapel.sql. Safe to re-run.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'gkks' and column_name = 'year_established') then
    raise exception 'Run 0018_gkk_chapel.sql before this migration';
  end if;
end;
$$;

-- null = not entered; the census then shows no baseline for that GKK.
alter table gkks add column if not exists previous_households integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'gkks_previous_households_check') then
    alter table gkks add constraint gkks_previous_households_check
      check (previous_households is null or previous_households between 0 and 100000);
  end if;
end;
$$;
