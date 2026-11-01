-- The website's Komunidad → Census page: with no census open, the results of
-- the last one closed. Run after 0101_demo_access.sql. Safe to re-run.
--
-- public_census_result(): the most recently closed census, as it stood when it
-- closed (its census_results snapshot, 0082; worked out from the registry
-- now for a census closed before 0082 and never recorded), or null when no
-- census has closed yet:
--   { label, starts_on, ends_on, closed_at,
--     members, confirmed, pct,          -- members counted / who answered
--     statuses: { Active: n|null, … },  -- the answers, parish-wide
--     gkks: [{ name, pct|null }] }      -- each GKK's share who answered
-- Numbers only, never a name. As on the census progress, a GKK under 5
-- households gets no percentage, and a status under 5 members no count.

do $$
begin
  if to_regclass('public.census_results') is null then
    raise exception 'Run the migrations up to 0082_census_results_snapshot.sql before this one';
  end if;
end;
$$;

create or replace function public.public_census_result() returns jsonb
language sql stable security definer set search_path = public as $$
  with c as (
    select id, label, starts_on, ends_on, closed_at
    from census_cycles
    where status = 'Closed'
    order by closed_at desc nulls last, id desc
    limit 1
  ),
  snap as (
    select r.summary from census_results r
    where r.cycle_id = (select id from c) and r.gkk is null
  ),
  rows as (
    -- The snapshot's rows ({ gkk, status, members }), else today's.
    select nullif(s->>'gkk', '') as gkk, s->>'status' as status, coalesce((s->>'members')::int, 0) as members
    from snap, jsonb_array_elements(snap.summary) s
    union all
    select cs.gkk, cs.status, cs.members
    from census_summary((select id from c)) cs
    where exists (select 1 from c) and not exists (select 1 from snap)
  ),
  per_gkk as (
    select gkk, sum(members)::int as total,
           sum(members) filter (where status <> 'Not confirmed')::int as confirmed
    from rows where gkk is not null group by gkk
  ),
  hh as (select gkk, count(*)::int as n from households where gkk is not null group by gkk),
  tot as (
    select coalesce(sum(members), 0)::int as total,
           coalesce(sum(members) filter (where status <> 'Not confirmed'), 0)::int as confirmed
    from rows
  )
  select case when not exists (select 1 from c) then null else jsonb_build_object(
    'label', (select label from c),
    'starts_on', (select starts_on from c),
    'ends_on', (select ends_on from c),
    'closed_at', (select closed_at from c),
    'members', (select total from tot),
    'confirmed', (select confirmed from tot),
    'pct', (select case when total > 0 then round(100.0 * confirmed / total)::int end from tot),
    'statuses', (select jsonb_object_agg(st, case when n >= 5 then n end)
                 from (select st, coalesce((select sum(members) from rows where status = st), 0)::int as n
                       from unnest(census_member_statuses()) st) x),
    'gkks', (select coalesce(jsonb_agg(jsonb_build_object(
               'name', g.name,
               'pct', case when coalesce(hh.n, 0) >= 5 and coalesce(p.total, 0) > 0
                           then round(100.0 * coalesce(p.confirmed, 0) / p.total)::int end
             ) order by g.name), '[]'::jsonb)
             from gkks g left join per_gkk p on p.gkk = g.name left join hh on hh.gkk = g.name)
  ) end;
$$;

revoke all on function public.public_census_result() from public;
grant execute on function public.public_census_result() to anon, authenticated;

notify pgrst, 'reload schema';
