-- Possible duplicate households: the same house registered twice. Run after
-- 0091_census_reopen_same_year.sql. Safe to re-run.
--
-- A family that registers with the wrong Household Head (the wife instead of
-- the husband, a son) often registers again with the right one. The
-- possible duplicate members (0010) show each person twice, one at a time;
-- nothing showed that the two households are one house.
--
-- household_duplicate_pairs() pairs households that share enough of:
--   members       the same first name, last name and date of birth  40 each
--   member names  the same first and last name, the birth date
--                 different or missing                                20 each
--   previous ref  the same reference number from the previous census     50
--   phone         a contact number, the household's or a member's
--                 (the last 10 digits, so 0917… and +63917… match)          35
--   email         the household's or a member's                           35
--   address       the same street / house no. / purok and barangay        15
--   name          the same household name (ignoring "Household",
--                 "Family", spacing and punctuation)                       15
-- A pair shows from 50 points: two people in common, one person and the
-- same phone, the same phone and address, and so on. One person in common
-- alone doesn't (the member duplicates show that, and a married son can be
-- in his parents' house and his own). Very likely from 90.
-- A value more than 4 households share (a GKK leader's phone given for every
-- family they helped register, "Purok 1, Meohao", a common name) says
-- nothing about which house, so it's left out.
-- Like find_duplicate_members(), it runs as the caller, so a GKK leader only
-- sees households of their GKK.
--
-- household_duplicate_dismissals, dismiss_household_duplicate(),
-- undismiss_household_duplicate(): "Not the same household", by the same
-- rules as members (0050, 0065, 0087): full access and GKK leaders (their
-- GKK's households only).
--
-- household_duplicate_pairs() finds the pairs; find_duplicate_households()
-- adds each household's details and members for the Duplicates page, and
-- admin_nav_counts() counts the pairs (duplicate_households) for its badge.

do $$
begin
  if to_regprocedure('public.member_match_key(text, text, date)') is null
     or to_regprocedure('public.current_staff_name()') is null
     or to_regprocedure('public.staff_gkk()') is null
     or to_regprocedure('public.undismiss_duplicate_group(integer[])') is null
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'households' and column_name = 'previous_ref_no')
     or not exists (select 1 from information_schema.columns
                    where table_schema = 'public' and table_name = 'members' and column_name = 'family_no') then
    raise exception 'Run the migrations up to 0091_census_reopen_same_year.sql before this one';
  end if;
end;
$$;

-- ---- matching keys --------------------------------------------------------------

/** Lower case, letters and digits only; null when nothing is left. */
create or replace function public.dup_text_key(t text) returns text
language sql immutable as $$
  select nullif(regexp_replace(lower(coalesce(t, '')), '[^[:alnum:]]+', '', 'g'), '');
$$;

/** A phone number's last 10 digits; null for fewer than 7 digits. */
create or replace function public.dup_phone_key(t text) returns text
language sql immutable as $$
  select right(substring(regexp_replace(coalesce(t, ''), '\D', '', 'g') from '^\d{7,}$'), 10);
$$;

/**
 * A household name without "Household", "Family" and the like, as
 * dup_text_key() leaves it. Words replaced one by one: a regular expression
 * for them is several times slower.
 */
create or replace function public.dup_household_name_key(t text) returns text
language sql immutable as $$
  select nullif(replace(
    replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(
      ' ' || regexp_replace(lower(coalesce(t, '')), '[^[:alnum:]]+', ' ', 'g') || ' ',
      ' household ', ' '), ' households ', ' '), ' family ', ' '), ' families ', ' '), ' pamilya ', ' '),
      ' panimalay ', ' '), ' balay ', ' '), ' the ', ' '), ' sa ', ' '), ' ang ', ' '), ' mga ', ' '),
    ' ', ''), '');
$$;

-- ---- "Not the same household" -----------------------------------------------------

create table if not exists household_duplicate_dismissals (
  household_ids     integer[] primary key, -- the pair, sorted
  dismissed_by      uuid references auth.users(id) on delete set null,
  dismissed_by_name text,
  dismissed_at      timestamptz not null default now()
);

alter table household_duplicate_dismissals enable row level security;

/** True when every one of `ids` is a household of the signed-in GKK leader's GKK. */
create or replace function public.households_in_leader_gkk(ids integer[]) returns boolean
language sql stable security definer set search_path = public as $$
  select staff_access() = 'gkk_leader' and cardinality(ids) > 0 and not exists (
    select 1 from unnest(ids) as x
    where not exists (select 1 from households h where h.id = x and h.gkk = staff_gkk()));
$$;
revoke execute on function public.households_in_leader_gkk(integer[]) from public, anon;
grant execute on function public.households_in_leader_gkk(integer[]) to authenticated;

drop policy if exists household_duplicate_dismissals_select on household_duplicate_dismissals;
create policy household_duplicate_dismissals_select on household_duplicate_dismissals
  for select to authenticated
  using ((select staff_can_see('registry')) or households_in_leader_gkk(household_ids));

-- Read-only for staff; writes go through the functions below.
revoke all on household_duplicate_dismissals from anon, authenticated;
grant select on household_duplicate_dismissals to authenticated;

/** The two households of a pair, sorted, or an error. */
create or replace function public.household_duplicate_pair(p_household_ids integer[]) returns integer[]
language plpgsql stable security definer set search_path = public as $$
declare
  ids integer[];
begin
  if current_staff_name() is null then raise exception 'Only parish staff can change possible duplicates'; end if;
  select array_agg(distinct x order by x) into ids from unnest(p_household_ids) as x where x is not null;
  if coalesce(array_length(ids, 1), 0) <> 2 then raise exception 'Choose two households'; end if;
  if staff_access() is distinct from 'full' and staff_access() is distinct from 'gkk_leader' then
    raise exception 'Your account can view records but not change them' using errcode = '42501';
  end if;
  if staff_access() = 'gkk_leader' and not households_in_leader_gkk(ids) then
    raise exception 'Your account can only review the households of %', staff_gkk() using errcode = '42501';
  end if;
  return ids;
end;
$$;
revoke all on function public.household_duplicate_pair(integer[]) from public, anon;

create or replace function public.dismiss_household_duplicate(p_household_ids integer[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into household_duplicate_dismissals (household_ids, dismissed_by, dismissed_by_name)
  values (household_duplicate_pair(p_household_ids), auth.uid(), current_staff_name())
  on conflict (household_ids) do nothing;
end;
$$;

create or replace function public.undismiss_household_duplicate(p_household_ids integer[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from household_duplicate_dismissals where household_ids = household_duplicate_pair(p_household_ids);
end;
$$;

revoke all on function public.dismiss_household_duplicate(integer[]) from public, anon;
revoke all on function public.undismiss_household_duplicate(integer[]) from public, anon;
grant execute on function public.dismiss_household_duplicate(integer[]) to authenticated;
grant execute on function public.undismiss_household_duplicate(integer[]) to authenticated;

-- ---- finding them -----------------------------------------------------------------

/**
 * Pairs of households (a < b) that look like one house registered twice,
 * with their score and what they share, "Not the same household" ones left
 * out. `members` are the people in both with the same birth date, `names`
 * the ones whose birth dates differ or are missing.
 */
create or replace function public.household_duplicate_pairs()
returns table (a integer, b integer, score integer, members jsonb, names jsonb,
               phone text, email text, previous_ref text, address text, name text)
-- Enough memory to group every name and number without going to disk.
language sql stable set search_path = public set work_mem = '16MB' as $$
  -- Each table read once, each name keyed once.
  with m as materialized (
    select household_id as hid, dup_text_key(first_name) as fk, dup_text_key(last_name) as lk, dob,
           trim(first_name) || ' ' || trim(last_name) as label,
           dup_phone_key(contact) as phone, trim(contact) as contact, lower(trim(email)) as email
    from members
  ),
  h as materialized (
    select id as hid, dup_phone_key(contact) as phone, trim(contact) as contact, lower(trim(email)) as email,
           dup_text_key(previous_ref_no) as ref, trim(previous_ref_no) as ref_label,
           dup_text_key(street) as street, dup_text_key(barangay) as barangay,
           concat_ws(', ', nullif(trim(street), ''), nullif(trim(barangay), '')) as address,
           dup_household_name_key(household_name) as name, trim(household_name) as name_label
    from households
  ),
  sig as (
    -- A person: first name | last name | date of birth; and the same by name only.
    select hid, 'member'::text as kind, fk || '|' || lk || '|' || dob::text as val, label from m
    where fk is not null and lk is not null and dob is not null
    union all
    select hid, 'person', fk || '|' || lk, label from m where fk is not null and lk is not null
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
    select hid, 'address', street || '|' || coalesce(barangay, ''), address from h where length(street) >= 4
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
  -- Each person in both households once: with the same birth date, or by name only.
  people as (
    select a, b, min(label) as label, bool_or(kind = 'member') as same_dob
    from (select a, b, kind, label,
                 case when kind = 'member' then split_part(val, '|', 1) || '|' || split_part(val, '|', 2) else val end as person
          from matched where kind in ('member', 'person')) x
    group by a, b, person
  ),
  shared_people as (
    select a, b,
           count(*) filter (where same_dob) as n_members,
           count(*) filter (where not same_dob) as n_names,
           coalesce(jsonb_agg(label order by label) filter (where same_dob), '[]') as members,
           coalesce(jsonb_agg(label order by label) filter (where not same_dob), '[]') as names
    from people group by a, b
  ),
  shared_details as (
    select a, b,
           min(label) filter (where kind = 'phone') as phone,
           min(label) filter (where kind = 'email') as email,
           min(label) filter (where kind = 'previous_ref') as previous_ref,
           min(label) filter (where kind = 'address') as address,
           min(label) filter (where kind = 'name') as name
    from matched where kind not in ('member', 'person') group by a, b
  ),
  scored as (
    select coalesce(p.a, d.a) as a, coalesce(p.b, d.b) as b,
           coalesce(p.members, '[]') as members, coalesce(p.names, '[]') as names,
           d.phone, d.email, d.previous_ref, d.address, d.name,
           40 * coalesce(p.n_members, 0) + 20 * coalesce(p.n_names, 0)
             + case when d.previous_ref is not null then 50 else 0 end
             + case when d.phone is not null then 35 else 0 end
             + case when d.email is not null then 35 else 0 end
             + case when d.address is not null then 15 else 0 end
             + case when d.name is not null then 15 else 0 end as score
    from shared_people p
    full join shared_details d on d.a = p.a and d.b = p.b
  )
  select s.a, s.b, s.score::integer, s.members, s.names, s.phone, s.email, s.previous_ref, s.address, s.name
  from scored s
  where s.score >= 50
    and not exists (select 1 from household_duplicate_dismissals d where d.household_ids = array[s.a, s.b]);
$$;

revoke all on function public.household_duplicate_pairs() from public, anon;
grant execute on function public.household_duplicate_pairs() to authenticated;

/**
 * The pairs for the Duplicates page, most likely first: [{ key,
 * household_ids, score, likely, members, names, phone, email, previous_ref,
 * address, name, households }]. Each household comes with its members; the
 * one registered first comes first.
 */
create or replace function public.find_duplicate_households() returns jsonb
language sql stable set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', s.a || '-' || s.b,
           'household_ids', jsonb_build_array(s.a, s.b),
           'score', s.score,
           'likely', s.score >= 90,
           'members', s.members, 'names', s.names,
           'phone', s.phone, 'email', s.email, 'previous_ref', s.previous_ref, 'address', s.address, 'name', s.name,
           'households', (
             select jsonb_agg(jsonb_build_object(
                      'id', h.id, 'household_name', h.household_name, 'ref_no', h.ref_no, 'status', h.status,
                      'gkk', h.gkk, 'street', h.street, 'barangay', h.barangay, 'contact', h.contact, 'email', h.email,
                      'previous_ref_no', h.previous_ref_no, 'registered_at', h.created_at,
                      'members', (
                        select coalesce(jsonb_agg(jsonb_build_object(
                                 'id', m.id, 'first_name', m.first_name, 'last_name', m.last_name, 'suffix', m.suffix,
                                 'relationship', m.relationship, 'dob', m.dob, 'family_no', m.family_no)
                               order by m.family_no, m.relationship is distinct from 'Head of Household', m.id), '[]')
                        from members m where m.household_id = h.id))
                    order by h.created_at, h.id)
             from households h where h.id in (s.a, s.b))
         ) order by s.score desc, s.a, s.b), '[]'::jsonb)
  from household_duplicate_pairs() s;
$$;

revoke all on function public.find_duplicate_households() from public, anon;
grant execute on function public.find_duplicate_households() to authenticated;

-- ---- the sidebar badge ------------------------------------------------------------

-- As in 0039, plus duplicate_households.
create or replace function public.admin_nav_counts() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'pending_households', (select count(*) from households where status = 'Pending'),
    'duplicate_groups', case when (select staff_can_see('registry')) then jsonb_array_length(find_duplicate_members()) else 0 end,
    'duplicate_households', case when (select staff_can_see('registry')) then (select count(*) from household_duplicate_pairs()) else 0 end,
    'census_updates', (select count(*) from census_submissions s join census_cycles c on c.id = s.cycle_id
                       where s.status = 'Pending' and c.status = 'Open'),
    'sacraments_waiting', (
      select count(*) from members m
      cross join lateral (values ('baptism', m.has_baptism), ('communion', m.has_communion),
                                 ('confirmation', m.has_confirmation), ('matrimony', m.has_matrimony)) as c(sacrament, claimed)
      where member_is_current(m.membership_status) and c.claimed
        and not exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = c.sacrament)),
    'requests', case when (select staff_can_see('requests')) then request_inbox_counts()
                     else jsonb_build_object('certificates', 0, 'ready', 0, 'prayers', 0, 'blood', 0) end
  );
$$;
