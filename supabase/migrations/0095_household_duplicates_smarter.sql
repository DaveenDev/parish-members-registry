-- Possible duplicate households, found the way a person would check: where
-- the two are, how to reach them, then who lives there. Run after
-- 0094_duplicates_across_gkks.sql. Safe to re-run.
--
-- 0092 added up whatever two households shared. Now each pair is compared
-- step by step:
--   1. address     the street / house number and barangay, with "Prk",
--                  "P-3", "St.", "Street", "Brgy." and the like read alike:
--                  the same address 20, the same purok only 8, the same
--                  barangay only 5, different barangays -20;
--   2. contact     the same phone number (35… and +6391… alike) 30, the same
--                  email 20, from the household or any member (at most 40);
--   3. members     the people, matched across the two by surname and:
--                    first name and birthday           30 each ("same")
--                    birthday, the first name spelled
--                    differently but starting alike
--                    (Ma. Cristina / Maria Cristina)  25 each ("near")
--                    first name, a different or no birthday    10 each
--                  and when at least two people match by birthday, half of
--                  the smaller household 20 more, four in five 30;
-- plus the same previous census reference number 40 and the same household
-- name 10. A pair shows from 50. It's "very likely" from 90 and only when
-- someone in it matches by name and birthday: the members are what confirm
-- that two records are one house. Two households at one address with one
-- phone and nobody in common still show, as possibly one house registered
-- twice, or two families of one house registered apart.
-- What brings a pair up to be compared is as in 0092 (a value at most 4
-- households share), with people by surname and birthday (by name only
-- when there's no birthday).
--
-- household_duplicate_matches() does the matching, for every household;
-- household_duplicate_pairs() keeps 0094's choice of what the caller sees and
-- leaves out "Not the same household"; find_duplicate_households() is 0094's,
-- with each pair's steps for the page:
--   address       'same' | 'purok' | 'barangay' | 'different' | null
--   phone, email, previous_ref, name    what they share, or null ('' when
--                                       it's another GKK's, see below)
--   same_people   ["Juan Dela Cruz", …]      name and birthday
--   near_people   ["Ma. Cristina Dela Cruz / Maria Cristina Dela Cruz", …]
--   name_only     ["Ana Dela Cruz", …]       name, not birthday
--   members_a, members_b                     how many each household has

do $$
begin
  if to_regprocedure('public.duplicate_flag_json(text, integer[])') is null
     or to_regprocedure('public.gkk_unassigned(text)') is null
     or to_regprocedure('public.household_duplicate_pairs()') is null then
    raise exception 'Run the migrations up to 0094_duplicates_across_gkks.sql before this one';
  end if;
end;
$$;

/**
 * A street, purok or barangay as dup_text_key() leaves it, with the usual
 * ways of writing it read alike: "Prk. 3" and "P-3" as "Purok 3", "St." and
 * "Street" left out, "Brgy." left out. Words replaced one by one, as in
 * dup_household_name_key().
 */
create or replace function public.dup_place_key(t text) returns text
language sql immutable as $$
  select nullif(replace(
    replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
      ' ' || regexp_replace(lower(coalesce(t, '')), '[^[:alnum:]]+', ' ', 'g') || ' ',
      ' prk ', ' purok '), ' pk ', ' purok '), ' p ', ' purok '), ' street ', ' '), ' st ', ' '), ' str ', ' '),
      ' road ', ' '), ' rd ', ' '), ' barangay ', ' '), ' brgy ', ' '), ' bgy ', ' '), ' brg ', ' '),
    ' ', ''), '');
$$;

-- ---- the matching -----------------------------------------------------------------

/**
 * Every pair of households (a < b) that may be one house, with its score and
 * steps (see the top). For every household, "Not the same household" ones
 * included: household_duplicate_pairs() picks what the caller sees.
 */
create or replace function public.household_duplicate_matches()
returns table (a integer, b integer, score integer, likely boolean, address text,
               phone text, email text, previous_ref text, name text,
               same_people jsonb, near_people jsonb, name_only jsonb, members_a integer, members_b integer)
language sql stable set search_path = public set work_mem = '16MB' as $$
  -- Each table read once, each name and place keyed once.
  with m as materialized (
    select id, household_id as hid, dup_text_key(first_name) as fk, dup_text_key(last_name) as lk, dob,
           trim(first_name) || ' ' || trim(last_name) as label,
           dup_phone_key(contact) as phone, trim(contact) as contact, lower(trim(email)) as email
    from members
  ),
  h as materialized (
    select hid, phone, contact, email, ref, ref_label, street, barangay,
           -- The street without its purok: a house number or street name, if any.
           nullif(regexp_replace(coalesce(street, ''), 'purok[0-9]*', '', 'g'), '') as house,
           address, name, name_label
    from (select id as hid, dup_phone_key(contact) as phone, trim(contact) as contact, lower(trim(email)) as email,
                 dup_text_key(previous_ref_no) as ref, trim(previous_ref_no) as ref_label,
                 dup_place_key(street) as street, dup_place_key(barangay) as barangay,
                 concat_ws(', ', nullif(trim(street), ''), nullif(trim(barangay), '')) as address,
                 dup_household_name_key(household_name) as name, trim(household_name) as name_label
          from households) x
  ),
  -- What brings two households up to be compared. A person by surname and
  -- birthday; by name only when there's no birthday (a pair matching by name
  -- with different birthdays needs an address, phone or reference number in
  -- common to show, and that brings it up).
  sig as (
    select hid, 'born'::text as kind, lk || '|' || dob::text as val, label from m where lk is not null and dob is not null
    union all
    select hid, 'person', fk || '|' || lk, label from m where fk is not null and lk is not null and dob is null
    union all
    select hid, 'phone', phone, contact from m where phone is not null
    union all
    select hid, 'email', email, email from m where email like '%_@_%'
    union all
    select hid, 'phone', phone, contact from h where phone is not null
    union all
    select hid, 'email', email, email from h where email like '%_@_%'
    union all
    select hid, 'previous_ref', ref, ref_label from h where ref is not null
    union all
    select hid, 'address', street || '|' || coalesce(barangay, ''), address from h where house is not null
    union all
    select hid, 'name', name, name_label from h where length(name) >= 3
  ),
  -- Only values that point to a few households: counted first, without
  -- their labels, so that few rows go further.
  telling as (
    select kind, val
    from (select hid, kind, val from sig group by hid, kind, val) x
    group by kind, val
    having count(*) between 2 and 4
  ),
  hits as (
    select s.hid, s.kind, s.val, s.label from sig s join telling t on t.kind = s.kind and t.val = s.val
  ),
  -- Shown as the household registered first wrote it.
  labels as (
    select distinct on (kind, val) kind, val, label from hits order by kind, val, hid, label
  ),
  matched as (
    select x.hid as a, y.hid as b, x.kind, x.val, l.label
    from (select distinct hid, kind, val from hits) x
    join (select distinct hid, kind, val from hits) y on y.kind = x.kind and y.val = x.val and y.hid > x.hid
    join labels l on l.kind = x.kind and l.val = x.val
  ),
  candidates as (
    select distinct a, b from matched
  ),
  -- 2. contact (and the reference number and name): what the two share.
  shared as (
    select a, b,
           min(label) filter (where kind = 'phone') as phone,
           min(label) filter (where kind = 'email') as email,
           min(label) filter (where kind = 'previous_ref') as previous_ref,
           min(label) filter (where kind = 'name') as name
    from matched where kind in ('phone', 'email', 'previous_ref', 'name') group by a, b
  ),
  -- 3. members: each of a's members at its best match among b's, same surname.
  people as (
    select distinct on (c.a, c.b, ma.id) c.a, c.b, ma.label, mb.label as other_label,
           case when ma.fk = mb.fk and ma.dob = mb.dob then 3
                -- Same surname and birthday already: "Ma." and "Maria" are near enough.
                when ma.dob = mb.dob and left(ma.fk, 2) = left(mb.fk, 2) then 2
                when ma.fk = mb.fk then 1
                else 0 end as strength
    from candidates c
    join m ma on ma.hid = c.a
    join m mb on mb.hid = c.b and mb.lk = ma.lk
    where ma.fk is not null and mb.fk is not null
    order by c.a, c.b, ma.id, strength desc
  ),
  people_sum as (
    select a, b,
           count(*) filter (where strength = 3) as same_n,
           count(*) filter (where strength = 2) as near_n,
           count(*) filter (where strength = 1) as name_n,
           coalesce(jsonb_agg(label order by label) filter (where strength = 3), '[]') as same_people,
           coalesce(jsonb_agg(label || ' / ' || other_label order by label) filter (where strength = 2), '[]') as near_people,
           coalesce(jsonb_agg(label order by label) filter (where strength = 1), '[]') as name_only
    from people where strength > 0 group by a, b
  ),
  sizes as (
    select hid, count(*)::integer as n from m group by hid
  ),
  steps as (
    select c.a, c.b, s.phone, s.email, s.previous_ref, s.name,
           -- 1. address
           case when ha.house is not null and ha.street = hb.street and ha.barangay is not distinct from hb.barangay then 'same'
                when ha.street = hb.street and ha.barangay = hb.barangay then 'purok'
                when ha.barangay = hb.barangay then 'barangay'
                when ha.barangay <> hb.barangay then 'different' end as address,
           coalesce(p.same_n, 0) as same_n, coalesce(p.near_n, 0) as near_n, coalesce(p.name_n, 0) as name_n,
           coalesce(p.same_people, '[]') as same_people, coalesce(p.near_people, '[]') as near_people,
           coalesce(p.name_only, '[]') as name_only,
           coalesce(za.n, 0) as members_a, coalesce(zb.n, 0) as members_b
    from candidates c
    join h ha on ha.hid = c.a
    join h hb on hb.hid = c.b
    left join shared s on s.a = c.a and s.b = c.b
    left join people_sum p on p.a = c.a and p.b = c.b
    left join sizes za on za.hid = c.a
    left join sizes zb on zb.hid = c.b
  ),
  scored as (
    select x.*, x.same_n + x.near_n as confirmed,
           30 * x.same_n + 25 * x.near_n + 10 * x.name_n
             + case when x.same_n + x.near_n >= 2 and x.same_n + x.near_n >= 0.8 * least(x.members_a, x.members_b) then 30
                    when x.same_n + x.near_n >= 2 and x.same_n + x.near_n >= 0.5 * least(x.members_a, x.members_b) then 20
                    else 0 end
             + case x.address when 'same' then 20 when 'purok' then 8 when 'barangay' then 5 when 'different' then -20 else 0 end
             + least(40, case when x.phone is not null then 30 else 0 end + case when x.email is not null then 20 else 0 end)
             + case when x.previous_ref is not null then 40 else 0 end
             + case when x.name is not null then 10 else 0 end as score
    from steps x
  )
  select a, b, score::integer, confirmed >= 1 and score >= 90, address, phone, email, previous_ref, name,
         same_people, near_people, name_only, members_a, members_b
  from scored
  where score >= 50;
$$;

-- Through household_duplicate_pairs() only.
revoke all on function public.household_duplicate_matches() from public, anon, authenticated;

-- ---- what the caller sees -----------------------------------------------------------

-- As in 0094 (run as the database; GKK leaders the pairs with a household of
-- their GKK, the rest of the registry staff all), with 0095's matching.
drop function if exists public.household_duplicate_pairs();
create function public.household_duplicate_pairs()
returns table (a integer, b integer, score integer, likely boolean, address text,
               phone text, email text, previous_ref text, name text,
               same_people jsonb, near_people jsonb, name_only jsonb, members_a integer, members_b integer)
language sql stable security definer set search_path = public as $$
  with viewer as materialized (
    select staff_access() as acc, staff_gkk() as gkk, staff_can_see('registry') as sees_all
  )
  select s.*
  from household_duplicate_matches() s cross join viewer v
  where not exists (select 1 from household_duplicate_dismissals d where d.household_ids = array[s.a, s.b])
    and case when v.acc = 'gkk_leader'
             then exists (select 1 from households x where x.id in (s.a, s.b) and x.gkk = v.gkk)
             else v.sees_all end;
$$;

revoke all on function public.household_duplicate_pairs() from public, anon;
grant execute on function public.household_duplicate_pairs() to authenticated;

/**
 * As in 0094 (`flag` for each pair, `mine` and `can_open` for each household,
 * a GKK leader getting a household they can't open without its street, phone,
 * email or previous reference number; flagged pairs first), with each pair's
 * steps (see the top) in place of 0092's `members` and `names`. The pair's
 * phone, email and previous reference number are '' (the same, not shown)
 * when the caller can't open both households: 0094 gave them in full.
 */
create or replace function public.find_duplicate_households() returns jsonb
language sql stable security definer set search_path = public as $$
  with viewer as materialized (
    select staff_access() as acc, staff_gkk() as gkk
  ),
  pairs as (
    select s.*, duplicate_flag_json('households', array[s.a, s.b]) as flag,
           -- A GKK leader who can't open one of the two gets "the same phone"
           -- without the number (''), as for the household itself.
           v.acc is distinct from 'gkk_leader' or not exists (
             select 1 from households x
             where x.id in (s.a, s.b) and not (coalesce(x.gkk = v.gkk, false) or gkk_unassigned(x.gkk))) as open_both
    from household_duplicate_pairs() s cross join viewer v
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', s.a || '-' || s.b,
           'household_ids', jsonb_build_array(s.a, s.b),
           'score', s.score,
           'likely', s.likely,
           'address', s.address,
           'phone', case when s.open_both then s.phone when s.phone is not null then '' end,
           'email', case when s.open_both then s.email when s.email is not null then '' end,
           'previous_ref', case when s.open_both then s.previous_ref when s.previous_ref is not null then '' end,
           'name', s.name,
           'same_people', s.same_people, 'near_people', s.near_people, 'name_only', s.name_only,
           'members_a', s.members_a, 'members_b', s.members_b,
           'flag', s.flag,
           'households', (
             select jsonb_agg(jsonb_build_object(
                      'id', h.id, 'household_name', h.household_name, 'ref_no', h.ref_no, 'status', h.status,
                      'gkk', h.gkk, 'barangay', h.barangay, 'registered_at', h.created_at,
                      'mine', x.mine, 'can_open', x.can_open,
                      'street', case when x.can_open then h.street end,
                      'contact', case when x.can_open then h.contact end,
                      'email', case when x.can_open then h.email end,
                      'previous_ref_no', case when x.can_open then h.previous_ref_no end,
                      'members', (
                        select coalesce(jsonb_agg(jsonb_build_object(
                                 'id', m.id, 'first_name', m.first_name, 'last_name', m.last_name, 'suffix', m.suffix,
                                 'relationship', m.relationship, 'dob', m.dob, 'family_no', m.family_no)
                               order by m.family_no, m.relationship is distinct from 'Head of Household', m.id), '[]')
                        from members m where m.household_id = h.id))
                    order by h.created_at, h.id)
             from households h
             cross join lateral (select y.mine, y.mine or gkk_unassigned(h.gkk) as can_open
                                 from (select v.acc is distinct from 'gkk_leader' or coalesce(h.gkk = v.gkk, false) as mine) y) x
             where h.id in (s.a, s.b))
         ) order by s.flag is null, s.likely desc, s.score desc, s.a, s.b), '[]'::jsonb)
  from pairs s cross join viewer v;
$$;

revoke all on function public.find_duplicate_households() from public, anon;
grant execute on function public.find_duplicate_households() to authenticated;
