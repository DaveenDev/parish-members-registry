-- Load-test seed: 500 households with members and everything that hangs off
-- them, plus requests and website content, so list pages, reports and the
-- public site can be timed with realistic volumes.
--
-- Run:     npm run db:seed-load     (supabase db query --linked -f supabase/seed/load-test.sql)
-- Remove:  npm run db:clean-load    (supabase/seed/load-test-clean.sql)
--
-- Not seeded: settings (parish, media, email, notifications), staff accounts,
-- the activity log / trash, rate-limit logs, census access codes and the
-- reference lists (GKKs, ministries, organizations, positions), which are
-- used as they are.
--
-- Every seeded row is marked so the cleanup removes exactly these and nothing
-- real:
--   households            ref_no 'SEED-0001' … (members, sacrament
--                         verifications and census rows go with them)
--   requests              ref_no 'SEED-CR-…' / 'SEED-SR-…' / 'SEED-BR-…'
--   blood donors          notes 'Load-test seed'
--   website content       title starting '[Test] '
--
-- One transaction: if anything fails, nothing is kept. The activity log is
-- skipped (app.audit_skip). Staff get no notifications: those only fire for
-- anonymous public submissions. Refuses to run twice.

begin;
set local app.audit_skip = 'on';

do $$
declare
  first_m text[] := array['Juan','Jose','Pedro','Antonio','Manuel','Ramon','Roberto','Eduardo','Ricardo','Fernando','Carlos','Miguel','Rafael','Jesus','Francisco','Mark','John','Christian','Jerome','Romeo','Danilo','Rodel','Arnel','Joel','Noel','Ariel','Rogelio','Benjie','Junrey','Kenneth','Paolo','Vincent','Jayson','Ronald','Alfredo'];
  first_f text[] := array['Maria','Ana','Rosa','Carmen','Teresa','Josefina','Elena','Luz','Gloria','Cristina','Marites','Mylene','Lorna','Rowena','Jocelyn','Analyn','Grace','Joy','Mary Ann','Kristine','Angelica','Jessa','Rhea','Lovely','Princess','Janine','Charmaine','Liezel','Divina','Nenita','Corazon','Imelda','Florencia','Erlinda','Evangeline'];
  lasts text[] := array['Dela Cruz','Santos','Reyes','Garcia','Mendoza','Bautista','Villanueva','Ramos','Aquino','Castillo','Rivera','Flores','Gonzales','Torres','Navarro','Panes','Duran','Bartolome','Alquiza','Cabahug','Sumagaysay','Lumacad','Dagohoy','Mangubat','Tampos','Gumapac','Abellana','Bacus','Cuizon','Labitad','Omandam','Pepito','Rosales','Saavedra','Tagalog','Ugbinada','Valmores','Yap','Zamora','Ebarle','Pasaol','Alcantara','Montero','Sabado','Lagrosa'];
  tribes text[] := array['Bisaya','Bisaya','Bisaya','Illongo','Bol-anon','Manobo','Bagobo','Waray','Karay-a','Maguindanaon'];
  occupations text[] := array['Farmer','Teacher','Driver','Vendor','Housewife','OFW','Carpenter','Nurse','Student','Laborer','Government employee','Businessman','Retired','Security guard','Tricycle driver'];
  churches text[] := array['Our Lady of Guadalupe, Mua-an','Our Lady of Mount Carmel Cathedral, Kidapawan','St. Mary Parish, Makilala','Sto. Niño Parish, Matalam','San Isidro Labrador Parish, Kidapawan'];
  streets text[] := array['Purok 1','Purok 2','Purok 3','Purok 4','Purok 5','Purok 6','Purok 7','Sitio Lower','Sitio Upper','Rizal St.','Quezon Ave.','Mabini St.'];
  levels text[] := array['Aktibo','Aktibo','Panagsa','Wala'];
  help_keys text[] := array['sunday_mass','bible_service','devotions','meetings','pintakasi','financial'];
  part_keys text[] := array['mass','bible_service','devotions','meetings','pintakasi','financial'];
  gkk_roles text[] := array['GKK President','Vice-President','Secretary','Treasurer','Business Manager'];
  gkk_list text[];
  ministry_list text[];
  org_list text[];
  position_list text[];
  open_cycle integer;
  hh_id integer;
  m_id integer;
  gkk_name text;
  last_name text;
  head_first text;
  head_sex text;
  head_age integer;
  head_civil text;
  partnered boolean;
  wedding text;
  n_children integer;
  hh_name text;
  created timestamptz;
  status_val text;
  i integer;
  k integer;
  member_count integer := 0;
  part jsonb;
  helps text[];
  part_key text;
begin
  if exists (select 1 from households where ref_no like 'SEED-%') then
    raise exception 'Load-test seed is already in the database. Run the cleanup (npm run db:clean-load) first.';
  end if;

  perform setseed(0.4242);
  select array_agg(name order by name) into gkk_list from gkks;
  select coalesce(array_agg(name order by name), '{}') into ministry_list from ministries;
  select coalesce(array_agg(name order by name), '{}') into org_list from organizations;
  select coalesce(array_agg(name order by name), '{}') into position_list from parish_positions;
  select id into open_cycle from census_cycles where status = 'Open' order by id desc limit 1;
  if gkk_list is null then raise exception 'Add at least one GKK before seeding.'; end if;

  -- -------------------------------------------------------------------------
  -- Households and members
  -- -------------------------------------------------------------------------
  for i in 1..500 loop
    gkk_name := gkk_list[1 + (i - 1) % array_length(gkk_list, 1)];  -- spread evenly over every GKK
    last_name := lasts[1 + floor(random() * array_length(lasts, 1))::int];
    head_sex := case when random() < 0.78 then 'Male' else 'Female' end;
    head_first := case when head_sex = 'Male' then first_m[1 + floor(random() * array_length(first_m, 1))::int]
                       else first_f[1 + floor(random() * array_length(first_f, 1))::int] end;
    head_age := 24 + floor(random() * 56)::int;
    head_civil := case when random() < 0.70 then 'Married' when random() < 0.40 then 'Live-in' when head_age > 60 then 'Widowed' else 'Single' end;
    partnered := head_civil in ('Married', 'Live-in');
    wedding := case when head_civil <> 'Married' then null when random() < 0.75 then 'Catholic Marriage' when random() < 0.6 then 'Civil Wedding' else 'Other Sect Wedding' end;
    created := now() - (random() * interval '730 days');
    status_val := case when random() < 0.65 then 'Verified' else 'Pending' end;

    hh_name := head_first || ' ' || last_name || ' Family';
    if exists (select 1 from households where lower(household_name) = lower(hh_name)) then
      hh_name := head_first || ' ' || last_name || ' Family (' || i || ')';
    end if;

    part := '{}'::jsonb;
    foreach part_key in array part_keys loop
      if random() < 0.85 then part := part || jsonb_build_object(part_key, levels[1 + floor(random() * 4)::int]); end if;
    end loop;
    select coalesce(array_agg(x), '{}') into helps from unnest(help_keys) x where random() < 0.4;

    insert into households (household_name, street, barangay, city, province, zip, contact, email, gkk, family_grouping,
                            status, volunteer, notify_optin, consent, ref_no, created_at, updated_at, participation, help_ways,
                            verified_at, verified_by_name)
    values (hh_name,
            streets[1 + floor(random() * array_length(streets, 1))::int],
            coalesce(nullif(trim(split_part(gkk_name, '-', 2)), ''), 'Mua-an'),
            'Kidapawan City', 'North Cotabato', '9400',
            '09' || lpad((100000000 + i * 7919 % 899999999)::text, 9, '0'),
            case when random() < 0.25 then lower(replace(head_first, ' ', '')) || '.' || lower(replace(last_name, ' ', '')) || i || '@example.com' end,
            gkk_name,
            'FG ' || (1 + floor(random() * 10)::int),
            status_val,
            (array['Yes', 'Maybe', 'No', null])[1 + floor(random() * 4)::int],
            random() < 0.5, true,
            'SEED-' || lpad(i::text, 4, '0'),
            created, created, part, helps,
            case when status_val = 'Verified' then created + interval '3 days' end,
            case when status_val = 'Verified' then 'Seed data' end)
    returning id into hh_id;

    -- Head, spouse, children, sometimes a parent or grandchild.
    n_children := floor(random() * 5)::int;
    for k in 0..(1 + n_children + case when random() < 0.15 then 1 else 0 end) loop
      declare
        rel text;
        sex text;
        fname text;
        age integer;
        civil text;
        mtype text := null;
        lname text := last_name;
        dob date;
        bapt boolean;
        comm boolean;
        conf boolean;
        mem_status text := 'Active';
      begin
        if k = 0 then
          rel := 'Head of Household'; sex := head_sex; fname := head_first; age := head_age; civil := head_civil; mtype := wedding;
        elsif k = 1 then
          continue when not partnered;
          rel := 'Spouse'; sex := case when head_sex = 'Male' then 'Female' else 'Male' end;
          age := greatest(18, head_age + floor(random() * 9)::int - 4); civil := head_civil; mtype := wedding;
          fname := case when sex = 'Male' then first_m[1 + floor(random() * array_length(first_m, 1))::int] else first_f[1 + floor(random() * array_length(first_f, 1))::int] end;
        elsif k <= 1 + n_children then
          rel := case when random() < 0.5 then 'Son' else 'Daughter' end; sex := case when rel = 'Son' then 'Male' else 'Female' end;
          age := greatest(0, head_age - 20 - floor(random() * 15)::int); civil := case when age >= 23 and random() < 0.3 then 'Married' else 'Single' end;
          if civil = 'Married' then mtype := case when random() < 0.8 then 'Catholic Marriage' else 'Civil Wedding' end; end if;
          fname := case when sex = 'Male' then first_m[1 + floor(random() * array_length(first_m, 1))::int] else first_f[1 + floor(random() * array_length(first_f, 1))::int] end;
        else
          if head_age > 55 then
            rel := 'Grandchild'; age := floor(random() * 12)::int; civil := 'Single';
          else
            rel := case when random() < 0.5 then 'Father' else 'Mother' end; age := head_age + 22 + floor(random() * 10)::int; civil := 'Widowed';
            lname := lasts[1 + floor(random() * array_length(lasts, 1))::int];
          end if;
          sex := case when rel in ('Father') or (rel = 'Grandchild' and random() < 0.5) then 'Male' else 'Female' end;
          fname := case when sex = 'Male' then first_m[1 + floor(random() * array_length(first_m, 1))::int] else first_f[1 + floor(random() * array_length(first_f, 1))::int] end;
        end if;

        dob := current_date - (age * 365 + floor(random() * 360)::int);
        bapt := random() < 0.92;
        comm := bapt and age >= 8 and random() < 0.85;
        conf := comm and age >= 13 and random() < 0.75;
        if age > 70 and random() < 0.08 then mem_status := 'Deceased';
        elsif random() < 0.04 then mem_status := 'Moved away';
        elsif random() < 0.05 then mem_status := 'Inactive';
        end if;

        insert into members (household_id, first_name, middle_name, last_name, relationship, sex, dob, place_of_birth, civil_status,
                             contact, occupation, religion, blood_type, tribe,
                             has_baptism, baptism_date, baptism_church,
                             has_communion, communion_date, communion_church,
                             has_confirmation, conf_date, conf_church, conf_name, conf_sponsor,
                             has_matrimony, mat_date, mat_church, mat_type,
                             ministries, organizations, gkk_role, parish_role, membership_status, created_at, updated_at)
        values (hh_id, fname,
                case when random() < 0.8 then lasts[1 + floor(random() * array_length(lasts, 1))::int] end,
                lname, rel, sex, dob,
                (array['Kidapawan City','Makilala','Matalam','Davao City','Mlang','Kabacan'])[1 + floor(random() * 6)::int],
                civil,
                case when age >= 16 and random() < 0.6 then '09' || lpad(floor(random() * 999999999)::text, 9, '0') end,
                case when age >= 18 then occupations[1 + floor(random() * array_length(occupations, 1))::int] when age >= 5 then 'Student' end,
                case when random() < 0.94 then 'Roman Catholic' else (array['Iglesia ni Cristo','Protestant','Born Again','Islam'])[1 + floor(random() * 4)::int] end,
                case when random() < 0.55 then (array['A+','A-','B+','B-','AB+','AB-','O+','O-'])[1 + floor(random() * 8)::int] end,
                tribes[1 + floor(random() * array_length(tribes, 1))::int],
                bapt, case when bapt then dob + 60 + floor(random() * 300)::int end, case when bapt then churches[1 + floor(random() * array_length(churches, 1))::int] end,
                comm, case when comm then dob + 8 * 365 + floor(random() * 700)::int end, case when comm then churches[1 + floor(random() * array_length(churches, 1))::int] end,
                conf, case when conf then dob + 13 * 365 + floor(random() * 1500)::int end, case when conf then churches[1 + floor(random() * array_length(churches, 1))::int] end,
                case when conf then (array['Pedro','Pablo','Maria','Teresa','Jose','Miguel'])[1 + floor(random() * 6)::int] end,
                case when conf then first_m[1 + floor(random() * array_length(first_m, 1))::int] || ' ' || lasts[1 + floor(random() * array_length(lasts, 1))::int] end,
                coalesce(mtype = 'Catholic Marriage', false),
                case when mtype is not null then least(current_date, dob + 23 * 365 + floor(random() * 3000)::int) end,
                case when mtype = 'Catholic Marriage' then churches[1 + floor(random() * array_length(churches, 1))::int] end,
                mtype,
                case when age >= 15 and array_length(ministry_list, 1) > 0 and random() < 0.15 then array[ministry_list[1 + floor(random() * array_length(ministry_list, 1))::int]] else '{}' end,
                case when age >= 18 and array_length(org_list, 1) > 0 and random() < 0.2 then array[org_list[1 + floor(random() * array_length(org_list, 1))::int]] else '{}' end,
                case when k = 0 and random() < 0.06 then gkk_roles[1 + floor(random() * array_length(gkk_roles, 1))::int] end,
                case when age >= 18 and array_length(position_list, 1) > 0 and random() < 0.01 then position_list[1 + floor(random() * array_length(position_list, 1))::int] end,
                mem_status, created, created)
        returning id into m_id;
        member_count := member_count + 1;

        -- Staff verified about a third of the sacraments on record.
        if bapt and random() < 0.35 then
          insert into sacrament_verifications (member_id, sacrament, source, reference, verified_by_name, verified_at)
          values (m_id, 'baptism', case when random() < 0.7 then 'Baptismal certificate' else 'Parish register entry' end,
                  'Book ' || (1 + floor(random() * 30)::int) || ', Page ' || (1 + floor(random() * 300)::int), 'Seed data', created + interval '5 days');
        end if;
        if conf and random() < 0.25 then
          insert into sacrament_verifications (member_id, sacrament, source, verified_by_name, verified_at)
          values (m_id, 'confirmation', 'Confirmation certificate', 'Seed data', created + interval '5 days');
        end if;
        if mtype = 'Catholic Marriage' and random() < 0.3 then
          insert into sacrament_verifications (member_id, sacrament, source, verified_by_name, verified_at)
          values (m_id, 'matrimony', 'Marriage contract / certificate', 'Seed data', created + interval '5 days');
        end if;

        -- About 40% answered in the open census.
        if open_cycle is not null and mem_status <> 'Deceased' and random() < 0.4 then
          insert into census_member_responses (cycle_id, member_id, status, participation, source, confirmed_by_name, confirmed_at)
          values (open_cycle, m_id, case when mem_status = 'Moved away' then 'Moved away' when random() < 0.85 then 'Active' else 'Inactive' end,
                  part, (array['Paper','Staff visit','Portal'])[1 + floor(random() * 3)::int], 'Seed data', now() - random() * interval '1 day');
        end if;
      end;
    end loop;

    -- A few online census updates waiting for review (one pending per household at most).
    if open_cycle is not null and random() < 0.08 then
      insert into census_submissions (cycle_id, household_id, before, proposed, message, status, submitted_at)
      select open_cycle, h.id,
             jsonb_build_object('household', portal_household_fields(h),
                                'members', (select jsonb_object_agg(m.id::text, portal_member_fields(m)) from members m where m.household_id = h.id)),
             jsonb_build_object('household', portal_household_fields(h) || jsonb_build_object('contact', '0917' || lpad(floor(random() * 9999999)::text, 7, '0')),
                                'members', (select jsonb_agg(jsonb_build_object('id', m.id, 'fields', portal_member_fields(m), 'status', 'Active', 'participation', part, 'notes', null))
                                              from members m where m.household_id = h.id),
                                'newMembers', '[]'::jsonb),
             case when random() < 0.5 then 'Nausab ang among numero.' end,
             'Pending', now() - random() * interval '1 day'
      from households h where h.id = hh_id;
    end if;
  end loop;

  raise notice 'Seeded 500 households and % members.', member_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Requests
-- ---------------------------------------------------------------------------

-- Certificate requests (150), some linked to a seeded member.
insert into certificate_requests (ref_no, cert_type, status, source, subject_first_name, subject_middle_name, subject_last_name, subject_birth_date,
                                  sacrament_year, sacrament_place, father_name, mother_name, purpose, copies,
                                  requester_name, requester_mobile, relationship, member_id, staff_notes, handled_by_name, created_at, updated_at, status_changed_at)
select 'SEED-CR-' || lpad(g::text, 4, '0'),
       (array['baptism','confirmation','matrimony'])[1 + (g % 3)],
       (array['Received','Being prepared','Ready for pick-up','Released','Cannot issue'])[1 + floor(random() * 5)::int],
       (array['Online','Walk-in','Phone'])[1 + floor(random() * 3)::int],
       m.first_name, m.middle_name, m.last_name, m.dob,
       greatest(1950, extract(year from coalesce(m.baptism_date, m.dob))::int), 'Our Lady of Guadalupe, Mua-an',
       'Ramon ' || m.last_name, 'Rosa ' || m.last_name,
       (array['School requirement','Marriage preparation','Passport application','Employment','Personal records'])[1 + floor(random() * 5)::int],
       1 + floor(random() * 3)::int,
       m.first_name || ' ' || m.last_name, '09' || lpad(floor(random() * 999999999)::text, 9, '0'), 'Self', m.id,
       null, case when random() < 0.5 then 'Seed data' end,
       c, c, c
from generate_series(1, 150) g
cross join lateral (select now() - random() * interval '365 days' as c) t
cross join lateral (select * from members where household_id in (select id from households where ref_no like 'SEED-%')
                    order by md5(g::text || id::text) limit 1) m;

-- Sacrament requests (40): OCIA enrolments and Anointing of the Sick.
insert into sacrament_requests (ref_no, sacrament, person_name, baptism_status, location, preferred_date, urgent,
                                requester_name, requester_mobile, relationship, message, status, source, created_at, updated_at, status_changed_at)
select 'SEED-SR-' || lpad(g::text, 4, '0'),
       case when g % 3 = 0 then 'anointing' else 'ocia' end,
       (array['Juan','Maria','Pedro','Ana','Jose','Rosa'])[1 + g % 6] || ' ' || (array['Santos','Reyes','Duran','Panes','Flores'])[1 + g % 5],
       case when g % 3 <> 0 then (array['Not baptized','Baptized in another church','Not sure'])[1 + g % 3] end,
       case when g % 3 = 0 then (array['Purok 3, Mua-an','Kidapawan Doctors Hospital','Purok 1, Meohao'])[1 + g % 3] end,
       (current_date + (g % 30))::date,
       g % 3 = 0 and g % 2 = 0,
       'Requester ' || g, '09' || lpad(floor(random() * 999999999)::text, 9, '0'),
       (array['Self','Daughter','Son','Spouse'])[1 + g % 4], null,
       (array['New','Contacted','Scheduled','Done','Cancelled'])[1 + floor(random() * 5)::int],
       (array['Online','Walk-in','Phone'])[1 + floor(random() * 3)::int],
       c, c, c
from generate_series(1, 40) g
cross join lateral (select now() - random() * interval '180 days' as c) t;

-- Blood donors (80).
insert into blood_donors (full_name, mobile, blood_type, gkk, last_donated_on, source, consent_at, notes, created_at, updated_at)
select (array['Mark','Jessa','Paolo','Grace','Ramon','Liezel','Junrey','Analyn'])[1 + g % 8] || ' ' || (array['Cabahug','Lumacad','Tampos','Gumapac','Bacus','Yap','Zamora','Ebarle','Pepito','Sabado'])[1 + g % 10],
       '0998' || lpad((7000000 + g)::text, 7, '0'),
       (array['A+','A-','B+','B-','AB+','AB-','O+','O-'])[1 + floor(random() * 8)::int],
       (select name from gkks order by md5(g::text || name) limit 1),
       case when random() < 0.6 then (current_date - floor(random() * 500)::int) end,
       (array['Online','Added by staff'])[1 + floor(random() * 2)::int],
       c, 'Load-test seed', c, c
from generate_series(1, 80) g
cross join lateral (select now() - random() * interval '400 days' as c) t;

-- Blood requests (30); about half have donors being contacted.
insert into blood_requests (ref_no, patient_name, blood_type, units, hospital, needed_by, contact_name, contact_mobile, relationship,
                            notes, allow_public, show_publicly, status, source, created_at, updated_at, status_changed_at)
select 'SEED-BR-' || lpad(g::text, 4, '0'),
       (array['Lorna','Danilo','Rowena','Noel','Imelda','Rodel'])[1 + g % 6] || ' ' || (array['Mangubat','Omandam','Labitad','Cuizon','Saavedra'])[1 + g % 5],
       (array['A+','B+','O+','AB+','O-','A-'])[1 + g % 6],
       1 + floor(random() * 4)::int,
       (array['Kidapawan Doctors Hospital','Cotabato Provincial Hospital','Kidapawan Medical Specialists Center'])[1 + g % 3],
       (current_date + (g % 14) - 5)::date,
       'Family of patient ' || g, '09' || lpad(floor(random() * 999999999)::text, 9, '0'),
       (array['Daughter','Son','Spouse','Sibling'])[1 + g % 4], null,
       false, false,
       (array['Open','Contacting donors','Fulfilled','Closed'])[1 + floor(random() * 4)::int],
       (array['Online','Walk-in','Phone'])[1 + floor(random() * 3)::int],
       c, c, c
from generate_series(1, 30) g
cross join lateral (select now() - random() * interval '120 days' as c) t;

insert into blood_request_contacts (request_id, donor_id, status, note, updated_by_name)
select r.id, d.id, (array['Contacted','No answer','Agreed','Declined','Donated'])[1 + floor(random() * 5)::int], null, 'Seed data'
from blood_requests r
cross join lateral (select id from blood_donors where notes = 'Load-test seed' order by md5(r.id::text || id::text) limit 3) d
where r.ref_no like 'SEED-BR-%' and r.status <> 'Open';

-- ---------------------------------------------------------------------------
-- Website content (titles start with "[Test] ")
-- ---------------------------------------------------------------------------

insert into announcements (title, body, category, urgent, pinned, publish_on, expires_on, published)
select '[Test] ' || (array['Parish clean-up drive','Change in Mass schedule','GKK assembly this Sunday','Youth ministry recruitment','Collection for typhoon victims','Seminar for baptism sponsors'])[1 + g % 6] || ' #' || g,
       'Test announcement for load testing. ' || repeat('Lorem ipsum dolor sit amet, consectetur adipiscing elit. ', 4),
       (array['Parish','GKK','Ministry','Schedule change'])[1 + g % 4],
       false, g % 25 = 0,
       p, case when g % 3 = 0 then p + 30 end, true
from generate_series(1, 60) g
cross join lateral (select (current_date - floor(random() * 240)::int)::date as p) t;

insert into articles (title, tag, held_on, place, summary, body, published, photos, author)
select '[Test] ' || (array['Fiesta celebration','History of the parish','GKK outreach program','Ministry formation day','Bible month activities'])[1 + g % 5] || ' #' || g,
       (array['Parish','GKK','Ministry','History'])[1 + g % 4],
       (current_date - floor(random() * 500)::int)::date,
       (array['Mua-an Church','Meohao Chapel','Birada Center','Ginatilan'])[1 + g % 4],
       'Test article for load testing.',
       repeat('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore. ', 12),
       true, '[]'::jsonb, 'Seed data'
from generate_series(1, 30) g;

-- One bulletin per Sunday for the past year, skipping weeks that already have one.
insert into bulletins (week_of, title, body, published)
select w, '[Test] Bulletin for the week of ' || to_char(w, 'Mon DD, YYYY'),
       'Test bulletin for load testing. ' || repeat('Lorem ipsum dolor sit amet. ', 20), true
from generate_series(1, 52) n
cross join lateral (select (date_trunc('week', current_date)::date - 1 - 7 * n) as w) x   -- Sundays before this one
on conflict (week_of) do nothing;

insert into events (title, type, start_date, end_date, start_time, end_time, location, gkk, organizer, description, published)
select '[Test] ' || (array['Novena Mass','GKK Rotation','Parish Recollection','Couples Seminar','Pastoral Council Meeting','Fiesta Procession','Youth Camp'])[1 + g % 7] || ' #' || g,
       (array['Novena','GKK Rotation','Recollection / Retreat','Seminar','Meeting','Fiesta','Other'])[1 + g % 7],
       d, case when g % 5 = 0 then d + 2 end,
       time '08:00' + (g % 10) * interval '1 hour', time '10:00' + (g % 10) * interval '1 hour',
       (array['Mua-an Church','Parish Hall','Meohao Chapel','Birada Center'])[1 + g % 4],
       case when g % 7 = 1 then (select name from gkks order by md5(g::text || name) limit 1) end,
       'Seed data', 'Test event for load testing. ' || repeat('Lorem ipsum dolor sit amet. ', 6), true
from generate_series(1, 40) g
cross join lateral (select (current_date + floor(random() * 360)::int - 180)::date as d) t;

commit;

-- What was added (the last statement's rows are what the CLI prints).
select (select count(*) from households where ref_no like 'SEED-%') as households,
       (select count(*) from members m join households h on h.id = m.household_id where h.ref_no like 'SEED-%') as members,
       (select count(*) from sacrament_verifications v join members m on m.id = v.member_id join households h on h.id = m.household_id where h.ref_no like 'SEED-%') as verifications,
       (select count(*) from census_member_responses r join members m on m.id = r.member_id join households h on h.id = m.household_id where h.ref_no like 'SEED-%') as census_answers,
       (select count(*) from census_submissions s join households h on h.id = s.household_id where h.ref_no like 'SEED-%') as census_submissions,
       (select count(*) from certificate_requests where ref_no like 'SEED-%') as certificate_requests,
       (select count(*) from sacrament_requests where ref_no like 'SEED-%') as sacrament_requests,
       (select count(*) from blood_requests where ref_no like 'SEED-%') as blood_requests,
       (select count(*) from blood_donors where notes = 'Load-test seed') as blood_donors,
       (select count(*) from announcements where title like '[Test] %') as announcements,
       (select count(*) from articles where title like '[Test] %') as articles,
       (select count(*) from bulletins where title like '[Test] %') as bulletins,
       (select count(*) from events where title like '[Test] %') as events;
