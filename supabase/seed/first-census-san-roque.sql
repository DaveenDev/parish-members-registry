-- Training scenario: a GKK's first census in the registry, with last year's
-- paper list. For GKK Sr. San Roque -Meohao on the training site, after
-- load-test.sql.
--
-- Nobody in the GKK had a record before this census. Last year's paper
-- census had 30 heads of household; they're typed in as last year's list.
-- Since the census opened, 14 families have registered on the website
-- ("Register household"):
--   12 from the list   7 waiting to be verified (Pending), 5 verified
--    2 new families    not on last year's list, Pending
-- and the other 18 names are still to be visited.
--
-- Cases on the list to practise with:
--   "Paderanga, Ma. Erlinda", "Fuentes, Eduardo S.", "Jumawan, Alfredo Sr.",
--   "Gallardo, Mark Anthony", "Pedro Dumdum"
--       written differently from how the family registered: still found.
--   "Tumulak, Ricardo"
--       his wife Joy registered as head, so the name isn't found by itself:
--       link it with "Choose household" (Joy Tumulak Family).
--   The last name in Purok 7 (taken from GKK Santo Rosario -Meohao)
--       registered in another GKK: the list shows a note to report it.
--
-- How: 14 of the GKK's load-test households are made into these families
-- (heads renamed, members who died or moved away dropped, registered between
-- 1 and 9 October 2026 with new reference numbers, the members' census
-- answers recorded by the registration, an access code each, no sacrament
-- checks or earlier census updates). The GKK's other load-test households
-- are deleted. Households not made by load-test.sql are never touched: if
-- the GKK has any, this stops.
--
-- Run: paste into the training project's SQL Editor, or from the repo root
--   npx supabase db query --linked --project-ref qyoyuukpdjrwfhovtrwd -f supabase/seed/first-census-san-roque.sql
-- (never --linked alone: the folder is linked to the live project).
-- Needs an open census. Refuses to run while the GKK has names on last
-- year's list. To run it again, clear the list first:
--   delete from census_last_year_list where gkk = 'GKK Sr. San Roque -Meohao';
-- (it then reuses the 14 households, which load-test-clean.sql still removes).
-- The activity log is skipped and staff get no notifications.

do $$
declare
  g constant text := 'GKK Sr. San Roque -Meohao';
  cyc integer;
  s record;
  v_hh integer;
  head_id integer;
  old_last text;
  other_name text;
begin
  perform set_config('app.audit_skip', 'on', true);

  if exists (select 1 from census_last_year_list where gkk = g) then
    raise exception '% already has names on last year''s list. Clear them first (see the top of this file).', g;
  end if;
  select id into cyc from census_cycles where status = 'Open' order by id desc limit 1;
  if cyc is null then
    raise exception 'No census is open. Open one in Census first.';
  end if;
  if exists (select 1 from households where gkk = g and coalesce(previous_ref_no, '') not like 'SEED-%') then
    raise exception '% has households not made by load-test.sql; this scenario only reuses load-test ones.', g;
  end if;
  if (select count(*) from households where gkk = g) < 14 then
    raise exception '% needs at least 14 load-test households. Run load-test.sql first.', g;
  end if;

  -- Kept out of the activity log, notifications and "last updated", and lets
  -- the list be written without a staff login. Switched back on at the end
  -- (and never left off: if anything fails, this whole block is undone).
  alter table households disable trigger trg_00_guard_staff_write, disable trigger trg_households_log,
    disable trigger trg_households_track_changes, disable trigger trg_zz_notify_staff;
  alter table members disable trigger trg_00_guard_staff_write, disable trigger trg_members_log,
    disable trigger trg_members_touch_updated_at, disable trigger trg_members_drop_stale_verifications,
    disable trigger trg_members_men_only, disable trigger trg_members_service;
  alter table census_last_year_list disable trigger trg_00_guard_staff_write;

  -- The families who have registered. kind: pending / verified on the list,
  -- wife (on the list under her husband's name), new (not on the list).
  create temp table first_census_families on commit drop as
  select * from (values
    ( 1, 'pending',  'Ampoon, Manuel',         'Purok 1', 'Manuel',   'Ampoon',     'Male',   '2026-10-03 09:15+08'::timestamptz, null::timestamptz),
    ( 2, 'pending',  'Fuentes, Eduardo S.',    'Purok 2', 'Eduardo',  'Fuentes',    'Male',   '2026-10-04 16:40+08', null),
    ( 3, 'pending',  'Cagas, Rodel',           'Purok 3', 'Rodel',    'Cagas',      'Male',   '2026-10-05 10:05+08', null),
    ( 4, 'pending',  'Pedro Dumdum',           'Purok 4', 'Pedro',    'Dumdum',     'Male',   '2026-10-06 19:22+08', null),
    ( 5, 'pending',  'Gallardo, Mark Anthony', 'Purok 5', 'Mark',     'Gallardo',   'Male',   '2026-10-07 08:30+08', null),
    ( 6, 'pending',  'Inting, Ronald',         'Purok 6', 'Ronald',   'Inting',     'Male',   '2026-10-08 20:10+08', null),
    ( 7, 'wife',     'Tumulak, Ricardo',       'Purok 2', 'Joy',      'Tumulak',    'Female', '2026-10-09 09:05+08', null),
    ( 8, 'verified', 'Paderanga, Ma. Erlinda', 'Purok 1', 'Erlinda',  'Paderanga',  'Female', '2026-10-01 10:30+08', '2026-10-03 14:00+08'),
    ( 9, 'verified', 'Jumawan, Alfredo Sr.',   'Purok 3', 'Alfredo',  'Jumawan',    'Male',   '2026-10-01 15:45+08', '2026-10-03 14:10+08'),
    (10, 'verified', 'Antonio Lacorte',        'Purok 4', 'Antonio',  'Lacorte',    'Male',   '2026-10-02 09:20+08', '2026-10-05 11:00+08'),
    (11, 'verified', 'Macarayan, Jesus',       'Purok 5', 'Jesus',    'Macarayan',  'Male',   '2026-10-02 18:05+08', '2026-10-05 11:15+08'),
    (12, 'verified', 'Ocampo, Ricardo',        'Purok 7', 'Ricardo',  'Ocampo',     'Male',   '2026-10-04 07:50+08', '2026-10-07 15:30+08'),
    (13, 'new',      null,                     'Purok 6', 'Junrey',   'Sarausa',    'Male',   '2026-10-05 13:30+08', null),
    (14, 'new',      null,                     'Purok 7', 'Miguel',   'Villacorta', 'Male',   '2026-10-07 17:45+08', null)
  ) v(ord, kind, list_name, purok, first_name, last_name, sex, reg_at, ver_at);
  alter table first_census_families add column hh integer;

  -- Pick a load-test household for each: one with a spouse for the wife,
  -- a woman as head for the women where there is one.
  for s in select * from first_census_families
           order by case when kind = 'wife' then 0 when sex = 'Female' then 1 else 2 end, ord loop
    select h.id into v_hh
    from households h
    join lateral (select m.sex from members m where m.household_id = h.id and m.relationship = 'Head of Household'
                  order by m.id limit 1) head on true
    where h.gkk = g
      and h.id not in (select f.hh from first_census_families f where f.hh is not null)
      and (s.kind <> 'wife' or exists (select 1 from members sp where sp.household_id = h.id and sp.relationship = 'Spouse'))
    order by (head.sex = s.sex) desc, h.id
    limit 1;
    if v_hh is null then
      raise exception 'No household with a head and spouse left in % for %', g, s.list_name;
    end if;
    update first_census_families set hh = v_hh where ord = s.ord;
  end loop;

  -- Nobody else in the GKK has registered yet.
  delete from households where gkk = g and id not in (select f.hh from first_census_families f);

  -- Oldest registration first, so the reference numbers follow the dates.
  for s in select * from first_census_families order by reg_at loop
    v_hh := s.hh;
    select id, last_name into head_id, old_last from members
     where household_id = v_hh and relationship = 'Head of Household' order by id limit 1;

    -- What the family would have sent: the people living there now.
    delete from members where household_id = v_hh and id <> head_id
       and membership_status in ('Deceased', 'Moved away')
       and not (s.kind = 'wife' and relationship = 'Spouse');
    update members set last_name = s.last_name where household_id = v_hh and last_name = old_last;
    update members set first_name = s.first_name, last_name = s.last_name, sex = s.sex where id = head_id;
    if s.kind = 'wife' then
      update members set first_name = 'Ricardo', last_name = s.last_name, sex = 'Male'
       where id = (select id from members where household_id = v_hh and relationship = 'Spouse' order by id limit 1);
    end if;

    -- No history before this census.
    delete from sacrament_verifications where member_id in (select id from members where household_id = v_hh);
    delete from census_member_responses where member_id in (select id from members where household_id = v_hh);
    delete from census_submissions where household_id = v_hh;
    delete from census_household_snapshots where household_id = v_hh;
    delete from household_access_codes where household_id = v_hh;

    update households h set
      household_name = s.first_name || ' ' || s.last_name || ' Family',
      street = s.purok,
      email = case when h.email is not null then lower(s.first_name) || '.' || lower(s.last_name) || '@example.com' end,
      status = 'Pending', verified_at = null, verified_by = null, verified_by_name = null,
      consent = true, created_at = s.reg_at, updated_at = s.reg_at,
      ref_no = next_household_ref(g, h.barangay, s.reg_at)
    where h.id = v_hh;

    -- Registration asks every member the census questions (0055).
    update members m set
      membership_status = case when m.membership_status in ('Active', 'Inactive', 'Left the Church') then m.membership_status else 'Active' end,
      registration_participation = case when m.membership_status = 'Left the Church' then '{}'::jsonb
                                        else census_clean_participation(h.participation) end,
      status_updated_at = s.reg_at, created_at = s.reg_at, updated_at = s.reg_at
    from households h
    where h.id = v_hh and m.household_id = v_hh;

    -- As submit_registration() does during a census: the household as sent,
    -- the members' answers in this census, and the family's access code.
    perform census_take_snapshot(cyc, v_hh);
    update census_household_snapshots set taken_at = s.reg_at where cycle_id = cyc and household_id = v_hh;
    insert into census_member_responses (cycle_id, member_id, status, suggested_status, participation, source, confirmed_at)
    select cyc, m.id, m.membership_status, census_suggest_status(m.registration_participation),
           m.registration_participation, 'Registration', s.reg_at
    from members m where m.household_id = v_hh;
    insert into household_access_codes (household_id, code, issued_at) values (v_hh, census_new_access_code(), s.reg_at);

    if s.kind = 'verified' then
      update households set status = 'Verified', verified_at = s.ver_at, verified_by_name = 'Seed data', updated_at = s.ver_at
       where id = v_hh;
    end if;
  end loop;

  -- A head registered in another GKK, for the "registered in another GKK" note.
  select m.last_name || ', ' || m.first_name into other_name
  from households h
  join members m on m.household_id = h.id and m.relationship = 'Head of Household'
  where h.gkk <> g and coalesce(trim(m.last_name), '') <> '' and coalesce(trim(m.first_name), '') <> ''
  order by (h.gkk = 'GKK Santo Rosario -Meohao') desc, h.id
  limit 1;

  -- Last year's list, in purok order as on the paper.
  insert into census_last_year_list (gkk, head_name, purok, note)
  select g, head_name, purok, note from (
    select list_name as head_name, purok, null::text as note from first_census_families where list_name is not null
    union all
    select * from (values
      ('Balansag, Teresa',    'Purok 1', 'Widow'),
      ('Espinosa, Arnel B.',  'Purok 1', null),
      ('Abarquez, Danilo',    'Purok 2', null),
      ('Quiñones, Ariel',     'Purok 2', null),
      ('Sanchez, Nestor',     'Purok 3', null),
      ('Bendanillo, Corazon', 'Purok 3', null),
      ('Nacua, Joel',         'Purok 3', null),
      ('Ybañez, Felipe',      'Purok 4', null),
      ('Calunod, Rogelio',    'Purok 4', null),
      ('Dacalos, Noel',       'Purok 5', null),
      ('Enriquez, Imelda',    'Purok 5', null),
      ('Opura, Romeo',        'Purok 5', null),
      ('Gabutero, Jose',      'Purok 6', null),
      ('Hinampas, Florencia', 'Purok 6', null),
      ('Pacaña, Benjie',      'Purok 6', null),
      ('Laput, Ramon Jr.',    'Purok 7', 'Near the chapel'),
      ('Mabanag, Vicente',    'Purok 7', null)
    ) v(head_name, purok, note)
    union all
    select other_name, 'Purok 7', null where other_name is not null
  ) names
  order by purok, head_name;

  alter table households enable trigger trg_00_guard_staff_write, enable trigger trg_households_log,
    enable trigger trg_households_track_changes, enable trigger trg_zz_notify_staff;
  alter table members enable trigger trg_00_guard_staff_write, enable trigger trg_members_log,
    enable trigger trg_members_touch_updated_at, enable trigger trg_members_drop_stale_verifications,
    enable trigger trg_members_men_only, enable trigger trg_members_service;
  alter table census_last_year_list enable trigger trg_00_guard_staff_write;
end;
$$;

select h.ref_no, h.household_name, h.status, (h.created_at at time zone 'Asia/Manila')::date as registered,
       (select count(*) from members m where m.household_id = h.id) as members,
       (select count(*) from census_member_responses r join members m on m.id = r.member_id
         where m.household_id = h.id and r.source = 'Registration') as census_answers
from households h
where h.gkk = 'GKK Sr. San Roque -Meohao'
order by h.created_at;
