-- Each GKK's barangay is its own field, set by the parish office in Parish
-- Config → Parish GKK (required there), instead of being read from the end
-- of the GKK's name ("Santo Rosario -Meohao" → Meohao), which not every name
-- has. Run after 0088_census_main_menu.sql. Safe to re-run.
--
-- Every GKK starts with the barangay its name gives (none if its name has
-- none: Parish GKK flags those to fill in). From then on:
--   • registration lists the barangays from this field, and the GKKs of the
--     barangay picked first (public_gkk_barangays());
--   • a household's reference number code (0047) is its GKK's barangay's;
--     gkk_barangay() reads this field, falling back to the name;
--   • the website's GKK directory shows it (public_gkk_directory()).
-- GKK leaders can't change it (it's not one of gkk_leader_fields()).

do $$
begin
  if to_regprocedure('public.gkk_barangay(text)') is null or to_regprocedure('public.public_gkk_directory()') is null then
    raise exception 'Run the migrations up to 0059_gkk_directory_photo.sql (and 0047_household_ref_format.sql) before this one';
  end if;
end;
$$;

alter table gkks add column if not exists barangay text;

/** The barangay at the end of a GKK name: the part after the last " -" (null if none). As 0047's gkk_barangay(); gkkParts() in client/src/lib/site.js. */
create or replace function public.gkk_name_barangay(gkk text) returns text
language sql immutable as $$
  select nullif(trim(substring(coalesce(gkk, '') from '^.* -(.*)$')), '');
$$;

-- Fill in the barangay of the GKKs that have none yet, from their names.
update gkks set barangay = gkk_name_barangay(name)
where nullif(trim(barangay), '') is null and gkk_name_barangay(name) is not null;

/**
 * A GKK's barangay: the one saved for it, else the part of its name after
 * " -" (a GKK added before this, or a name not in the list). Used for the
 * households' reference number codes (0047).
 */
create or replace function public.gkk_barangay(gkk text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(trim(g.barangay), '') from gkks g where g.name = gkk), gkk_name_barangay(gkk));
$$;

/** Every GKK's name and barangay, for the registration forms: [{ name, barangay }], by name. */
create or replace function public.public_gkk_barangays() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', g.name, 'barangay', gkk_barangay(g.name)) order by g.name), '[]'::jsonb)
  from gkks g;
$$;
grant execute on function public.public_gkk_barangays() to anon, authenticated;

-- As in 0059, plus barangay.
create or replace function public.public_gkk_directory() returns jsonb
language sql stable security definer set search_path = public as $$
  with hh as (select gkk, count(*)::int as n from households where gkk is not null group by gkk),
  cen as (select * from public_census_gkk_rows())
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', g.name,
           'barangay', gkk_barangay(g.name),
           'puroks', g.puroks,
           'chapel_address', nullif(trim(g.chapel_address), ''),
           'year_established', g.year_established,
           'meeting_schedule', g.meeting_schedule,
           'meeting_place', g.meeting_place,
           'photo_url', nullif(trim(g.photo_url), ''),
           'households', case when coalesce(hh.n, 0) >= 5 then hh.n end,
           'census_pct', case when coalesce(cen.households, 0) >= 5 then round(100.0 * cen.confirmed / cen.households)::int end,
           'coordinator', case when g.coordinator_public and nullif(trim(g.coordinator_name), '') is not null
                               then jsonb_build_object('name', g.coordinator_name, 'mobile', nullif(trim(g.coordinator_mobile), '')) end
         ) order by g.name), '[]'::jsonb)
  from gkks g
  left join hh on hh.gkk = g.name
  left join cen on cen.gkk = g.name;
$$;
grant execute on function public.public_gkk_directory() to anon, authenticated;
