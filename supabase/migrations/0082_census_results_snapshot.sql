-- Each census keeps its results. Run after 0081_gkk_structure_leaders.sql.
-- Safe to re-run.
--
-- Until now closing a census only marked it closed, and Census → Results by
-- GKK (and Reports, and Parish GKK's census column) worked its numbers out
-- again from today's registry every time: households registered later
-- showed as "not started", members added later as "not confirmed", and a
-- household that moved GKK took its answers along. Now the results as they
-- stood when the census closed are kept, and a closed census shows those.
--
-- census_results: per census, the results for the whole parish (gkk null)
-- and for each GKK (what its leader sees): the members per status
-- (census_summary rows) and the households and families against last year
-- or the previous census, as the Census page works them out
-- (api.censusVsLastYear()). The page works them out and sends them with
-- "Close census"; census_close_cycle() keeps them in the same step.
-- Reopening a census drops them (it's live again). A census closed before
-- this migration has none until full-access staff press "Record these
-- results" (census_record_results()).
--
-- Read like the households: the whole parish's by staff who see the whole
-- registry, a GKK's also by that GKK's leader.

do $$
begin
  if to_regclass('public.org_gkk_officers') is null then
    raise exception 'Run the migrations up to 0081_gkk_structure_leaders.sql before this one';
  end if;
end;
$$;

create table if not exists census_results (
  cycle_id      integer not null references census_cycles(id) on delete cascade,
  -- null: every GKK. A renamed GKK keeps its results; a deleted one loses them.
  gkk           text references gkks(name) on update cascade on delete cascade,
  summary       jsonb not null default '[]'::jsonb,
  vs_last_year  jsonb,
  saved_at      timestamptz not null default now(),
  saved_by_name text
);
create unique index if not exists census_results_scope on census_results (cycle_id, coalesce(gkk, ''));

alter table census_results enable row level security;
drop policy if exists census_results_select on census_results;
create policy census_results_select on census_results for select to authenticated
  using ((select staff_can_see('registry'))
         or (gkk is not null and (select staff_access()) = 'gkk_leader' and gkk = (select staff_gkk())));
revoke all on census_results from anon;
revoke insert, update, delete, truncate on census_results from authenticated;
grant select on census_results to authenticated;

/**
 * Keep a census's results: `p_results` is [{ gkk (null for every GKK),
 * summary, vsLastYear }]. Replaces what it had. Rows for a GKK no longer in
 * the list are skipped.
 */
create or replace function public.census_keep_results(p_cycle_id integer, p_results jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  g text;
  n integer := 0;
  who text := census_staff_name();
begin
  if jsonb_typeof(p_results) is distinct from 'array' then raise exception 'No results to keep'; end if;
  if jsonb_array_length(p_results) > 1000 then raise exception 'Too many results to keep'; end if;
  delete from census_results where cycle_id = p_cycle_id;
  for r in select * from jsonb_array_elements(p_results) loop
    g := nullif(trim(coalesce(r->>'gkk', '')), '');
    continue when g is not null and not exists (select 1 from gkks where name = g);
    insert into census_results (cycle_id, gkk, summary, vs_last_year, saved_by_name)
    values (p_cycle_id, g,
            case when jsonb_typeof(r->'summary') = 'array' then r->'summary' else '[]'::jsonb end,
            case when jsonb_typeof(r->'vsLastYear') = 'object' then r->'vsLastYear' end,
            who)
    on conflict (cycle_id, coalesce(gkk, '')) do update set
      summary = excluded.summary, vs_last_year = excluded.vs_last_year, saved_at = now(), saved_by_name = excluded.saved_by_name;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.census_keep_results(integer, jsonb) from public, anon, authenticated;

-- As in 0007, keeping the results sent with it (none from an older page).
drop function if exists public.census_close_cycle(integer);
create or replace function public.census_close_cycle(p_cycle_id integer, p_results jsonb default null)
returns census_cycles
language plpgsql security definer set search_path = public as $$
declare saved census_cycles;
begin
  if census_staff_name() is null then raise exception 'Only parish staff can close a census'; end if;
  update census_cycles set status = 'Closed', closed_at = now()
  where id = p_cycle_id and status = 'Open'
  returning * into saved;
  if saved.id is null then raise exception 'This census is not open'; end if;
  if p_results is not null then perform census_keep_results(p_cycle_id, p_results); end if;
  return saved;
end;
$$;

-- As in 0007; a reopened census is live again, so its kept results go.
create or replace function public.census_reopen_cycle(p_cycle_id integer)
returns census_cycles
language plpgsql security definer set search_path = public as $$
declare
  open_label text;
  saved census_cycles;
begin
  if census_staff_name() is null then raise exception 'Only parish staff can reopen a census'; end if;
  select label into open_label from census_cycles where status = 'Open' and id <> p_cycle_id;
  if open_label is not null then
    raise exception 'Close the open census (%) before reopening another one', open_label;
  end if;
  update census_cycles set status = 'Open', closed_at = null
  where id = p_cycle_id and status = 'Closed'
  returning * into saved;
  if saved.id is null then raise exception 'This census is not closed'; end if;
  delete from census_results where cycle_id = p_cycle_id;
  return saved;
end;
$$;

/** Full access: keep the results of a census closed before 0082, worked out now. Returns how many were kept. */
create or replace function public.census_record_results(p_cycle_id integer, p_results jsonb) returns integer
language plpgsql security definer set search_path = public as $$
begin
  perform require_full_access('record a census''s results');
  if not exists (select 1 from census_cycles where id = p_cycle_id and status = 'Closed') then
    raise exception 'Only a closed census keeps its results';
  end if;
  return census_keep_results(p_cycle_id, p_results);
end;
$$;

revoke all on function public.census_close_cycle(integer, jsonb) from public, anon;
revoke all on function public.census_reopen_cycle(integer) from public, anon;
revoke all on function public.census_record_results(integer, jsonb) from public, anon;
grant execute on function public.census_close_cycle(integer, jsonb) to authenticated;
grant execute on function public.census_reopen_cycle(integer) to authenticated;
grant execute on function public.census_record_results(integer, jsonb) to authenticated;
