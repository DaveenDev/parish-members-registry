-- The website keeps showing a census's final results for 30 days after it
-- closes (the design brief, 1.3). Run after 0108_registration_correction.sql.
-- Safe to re-run.
--
-- * census_public_results: when a census closes, what the public progress page
--   showed at that moment is kept: the parish-wide percentage and each GKK's
--   (null under 5 households, as while it was open). It's taken by a trigger
--   just before the cycle is marked Closed, so later registrations don't move
--   the numbers. Reopening a census drops it. A census closed before this
--   migration has none, so the website shows nothing for it.
-- * public_census_progress(): while a census is open, as before. Otherwise,
--   within 30 days of the latest one closing, { open: false, closed: true,
--   label, closed_on, pct, gkks } from that snapshot, else { open: false }.
--   Percentages only, no names, no household details.

do $$
begin
  if to_regclass('public.census_cycles') is null then
    raise exception 'Run the migrations up to 0007_census.sql before this one';
  end if;
end;
$$;

create table if not exists census_public_results (
  cycle_id   integer primary key references census_cycles(id) on delete cascade,
  pct        integer,
  gkks       jsonb not null default '[]'::jsonb,
  saved_at   timestamptz not null default now()
);

alter table census_public_results enable row level security;
revoke all on census_public_results from anon, authenticated;

create or replace function public.census_public_snapshot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.status = 'Open' and new.status = 'Closed' then
    -- Still open in the table here, so public_census_gkk_rows() has the cycle's numbers.
    insert into census_public_results (cycle_id, pct, gkks)
    select old.id,
           (select case when sum(households) > 0 then round(100.0 * sum(confirmed) / sum(households))::int end from public_census_gkk_rows()),
           (select coalesce(jsonb_agg(jsonb_build_object(
                     'name', g.name,
                     'pct', case when coalesce(r.households, 0) >= 5 then round(100.0 * r.confirmed / r.households)::int end
                   ) order by g.name), '[]'::jsonb)
            from gkks g left join public_census_gkk_rows() r on r.gkk = g.name)
    on conflict (cycle_id) do update set pct = excluded.pct, gkks = excluded.gkks, saved_at = now();
  elsif tg_op = 'UPDATE' and old.status = 'Closed' and new.status = 'Open' then
    delete from census_public_results where cycle_id = old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists census_public_snapshot on census_cycles;
create trigger census_public_snapshot
  before update of status on census_cycles
  for each row execute function public.census_public_snapshot();

create or replace function public.public_census_progress() returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when c.id is not null then jsonb_build_object(
      'open', true,
      'label', c.label,
      'ends_on', c.ends_on,
      'households', (select coalesce(sum(households), 0) from public_census_gkk_rows()),
      'pct', (select case when sum(households) > 0 then round(100.0 * sum(confirmed) / sum(households))::int end from public_census_gkk_rows()),
      'gkks', (select coalesce(jsonb_agg(jsonb_build_object(
                 'name', g.name,
                 'pct', case when coalesce(r.households, 0) >= 5 then round(100.0 * r.confirmed / r.households)::int end
               ) order by g.name), '[]'::jsonb)
               from gkks g left join public_census_gkk_rows() r on r.gkk = g.name)
    )
    when s.cycle_id is not null then jsonb_build_object(
      'open', false, 'closed', true,
      'label', s.label, 'closed_on', s.closed_on, 'pct', s.pct, 'gkks', s.gkks
    )
    else jsonb_build_object('open', false)
  end
  from (select 1) one
  left join census_cycles c on c.status = 'Open'
  left join lateral (
    select r.cycle_id, r.pct, r.gkks, cc.label, (cc.closed_at at time zone 'Asia/Manila')::date as closed_on
    from census_public_results r join census_cycles cc on cc.id = r.cycle_id
    where cc.status = 'Closed' and cc.closed_at >= now() - interval '30 days'
    order by cc.closed_at desc limit 1
  ) s on c.id is null;
$$;

grant execute on function public.public_census_progress() to anon, authenticated;
