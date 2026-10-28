-- Household reference numbers in an easier form: the 3-letter code of the
-- barangay the household's GKK is in, the year, then a number counted per
-- barangay and year, e.g. MEO-2026-0001 for the first family registered in
-- a Meohao GKK in 2026. The barangay is the part of the GKK name after " -"
-- (as on the website). Each barangay's code is filled in from its name
-- (Meohao -> MEO; two words take the first letter, the next consonant and
-- the last word's first letter, so Birada Center -> BRC) and can be changed
-- under Parish Config -> Parish GKK; a change only affects new numbers.
--
-- Every existing household is renumbered, in the order they registered. The
-- old OLG-… number is kept in previous_ref_no, so a printed slip or census
-- code sheet with the old number still works on Check Status and the census
-- portal. Check Status now shows only the status and registration date, not
-- the family name, since numbers in order are easy to guess.
--
-- Run after 0046_gkk_photos.sql. Safe to re-run: households that already
-- have a new-form number keep it.

do $$
begin
  if to_regprocedure('public.portal_check(text,text)') is null or to_regprocedure('public.registration_status(text)') is null then
    raise exception 'Run 0008_census_portal.sql and 0013_public_site.sql before this migration';
  end if;
end;
$$;

alter table households add column if not exists previous_ref_no text;
create index if not exists idx_households_previous_ref_no on households (upper(previous_ref_no));

-- One code per barangay. Only reached through the functions below.
create table if not exists barangay_ref_codes (
  barangay   text primary key,
  code       text not null unique check (code ~ '^[A-Z]{3}$'),
  updated_at timestamptz not null default now()
);
create unique index if not exists barangay_ref_codes_lower_idx on barangay_ref_codes (lower(barangay));
alter table barangay_ref_codes enable row level security;

-- The last number given out for each code and year.
create table if not exists household_ref_counters (
  code    text not null,
  year    integer not null,
  last_no integer not null,
  primary key (code, year)
);
alter table household_ref_counters enable row level security;

/** The barangay in a GKK name: the part after the last " -" (null if none). Same as gkkParts() in client/src/lib/site.js. */
create or replace function public.gkk_barangay(gkk text) returns text
language sql immutable as $$
  select nullif(trim(substring(coalesce(gkk, '') from '^.* -(.*)$')), '');
$$;

/** The code a barangay gets by default: MEO for Meohao, BRC for Birada Center. */
create or replace function public.barangay_code_suggestion(barangay text) returns text
language plpgsql immutable as $$
declare
  clean text := regexp_replace(upper(translate(coalesce(barangay, ''), 'ñÑáéíóúÁÉÍÓÚ', 'NNAEIOUAEIOU')), '[^A-Z ]', '', 'g');
  words text[] := regexp_split_to_array(trim(clean), '\s+');
  first text := words[1];
begin
  if coalesce(first, '') = '' then return 'XXX'; end if;
  if cardinality(words) = 1 then return rpad(left(first, 3), 3, 'X'); end if;
  return left(first, 1)
    || coalesce(substring(substr(first, 2) from '[B-DF-HJ-NP-TV-Z]'), nullif(substr(first, 2, 1), ''), 'X')
    || left(words[cardinality(words)], 1);
end;
$$;

-- The barangay's code, giving it one first if it has none. When the
-- suggested code is taken, the third letter changes (BRC, then BRA, BRB…).
-- OLG is kept for households with no barangay at all.
create or replace function public.barangay_ref_code(p_barangay text) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_name text := nullif(trim(coalesce(p_barangay, '')), '');
  found_code text;
  suggestion text;
  candidate text;
begin
  if v_name is null then return 'OLG'; end if;
  select code into found_code from barangay_ref_codes where lower(barangay) = lower(v_name);
  if found_code is not null then return found_code; end if;

  suggestion := barangay_code_suggestion(v_name);
  foreach candidate in array array[suggestion] || array(select left(suggestion, 2) || chr(c) from generate_series(65, 90) c)
                                              || array(select left(suggestion, 1) || chr(a) || chr(b) from generate_series(65, 90) a, generate_series(65, 90) b) loop
    continue when candidate = 'OLG' or exists (select 1 from barangay_ref_codes where code = candidate);
    begin
      insert into barangay_ref_codes (barangay, code) values (v_name, candidate);
      return candidate;
    exception when unique_violation then
      -- Someone else just gave this barangay a code, or took this code.
      select code into found_code from barangay_ref_codes where lower(barangay) = lower(v_name);
      if found_code is not null then return found_code; end if;
    end;
  end loop;
  raise exception 'No reference code left for barangay %', v_name;
end;
$$;

/** MEO-2026-0001: the code, the year, then the number in at least 4 digits. */
create or replace function public.household_ref(p_code text, p_year integer, p_no integer) returns text
language sql immutable as $$
  select p_code || '-' || p_year || '-' || case when p_no < 10000 then lpad(p_no::text, 4, '0') else p_no::text end;
$$;

/** True for a number in the new form (MEO-2026-0001). */
create or replace function public.is_household_ref(ref text) returns boolean
language sql immutable as $$
  select coalesce(ref ~ '^[A-Z]{3}-[0-9]{4}-[0-9]{4,}$', false);
$$;

/** The next number for a household in GKK `p_gkk` (or, when that name has no barangay, at `p_barangay`), registered at `p_at`. */
create or replace function public.next_household_ref(p_gkk text, p_barangay text, p_at timestamptz) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text := barangay_ref_code(coalesce(gkk_barangay(p_gkk), p_barangay));
  v_year integer := extract(year from (coalesce(p_at, now()) at time zone 'Asia/Manila'))::integer;
  n integer;
  candidate text;
begin
  for attempt in 1..50 loop
    insert into household_ref_counters as c (code, year, last_no) values (v_code, v_year, 1)
    on conflict (code, year) do update set last_no = c.last_no + 1
    returning c.last_no into n;
    candidate := household_ref(v_code, v_year, n);
    -- Only taken if a code was changed back to one used before.
    if not exists (select 1 from households where ref_no = candidate) then return candidate; end if;
  end loop;
  raise exception 'Could not generate a unique reference number';
end;
$$;

revoke execute on function public.barangay_ref_code(text) from public, anon, authenticated;
revoke execute on function public.next_household_ref(text, text, timestamptz) from public, anon, authenticated;

-- A new household gets the next number. A restored household from the
-- trash that still has an old OLG-… number gets a new one too.
create or replace function public.households_set_ref_no() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if is_household_ref(new.ref_no) then return new; end if;
  if new.ref_no is not null then
    new.previous_ref_no := coalesce(new.previous_ref_no, new.ref_no);
  end if;
  new.ref_no := next_household_ref(new.gkk, new.barangay, new.created_at);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Renumber the existing households, oldest first. The activity log, the
-- "last updated" times and the staff write guard are left out of it.
-- ---------------------------------------------------------------------------
-- Codes first, A to Z, so Birada Center gets BRC before Birada Martinez gets BRM.
do $$
declare
  b text;
begin
  for b in select distinct gkk_barangay(name) from gkks where gkk_barangay(name) is not null order by 1 loop
    perform barangay_ref_code(b);
  end loop;
end;
$$;

-- One block, so the triggers are never left switched off: if anything
-- fails, the whole block (switching them off included) is undone. (No
-- temporary tables: the Supabase SQL editor may not keep one session.)
do $$
declare
  h record;
  t text;
begin
  foreach t in array array['trg_households_log', 'trg_households_track_changes', 'trg_00_guard_staff_write'] loop
    if exists (select 1 from pg_trigger where tgrelid = 'public.households'::regclass and tgname = t) then
      execute format('alter table households disable trigger %I', t);
    end if;
  end loop;

  for h in select id, ref_no, gkk, barangay, created_at from households
           where not is_household_ref(ref_no) order by created_at, id loop
    update households set ref_no = next_household_ref(h.gkk, h.barangay, h.created_at),
                          previous_ref_no = coalesce(previous_ref_no, h.ref_no)
    where id = h.id;
  end loop;

  foreach t in array array['trg_households_log', 'trg_households_track_changes', 'trg_00_guard_staff_write'] loop
    if exists (select 1 from pg_trigger where tgrelid = 'public.households'::regclass and tgname = t) then
      execute format('alter table households enable trigger %I', t);
    end if;
  end loop;

  -- The bell's registration and census notifications show the number and link to it.
  if to_regclass('public.staff_notifications') is not null then
    update staff_notifications n set ref_no = hh.ref_no, link = replace(n.link, hh.previous_ref_no, hh.ref_no)
    from households hh where hh.previous_ref_no is not null and n.ref_no = hh.previous_ref_no;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lookups by number also take the old OLG-… number.
-- ---------------------------------------------------------------------------
create or replace function public.household_by_ref(p_ref text) returns integer
language sql stable security definer set search_path = public as $$
  select id from households
  where upper(ref_no) = upper(trim(coalesce(p_ref, '')))
     or upper(previous_ref_no) = upper(trim(coalesce(p_ref, '')))
  order by upper(ref_no) = upper(trim(coalesce(p_ref, ''))) desc
  limit 1;
$$;
revoke execute on function public.household_by_ref(text) from public, anon, authenticated;

-- As in 0008, finding the household by either number.
create or replace function public.portal_check(p_ref text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  hid integer;
  ac household_access_codes;
begin
  if not exists (select 1 from census_cycles where status = 'Open') then
    return jsonb_build_object('ok', false, 'error', 'closed');
  end if;
  hid := household_by_ref(p_ref);
  if hid is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;

  select * into ac from household_access_codes where household_id = hid for update;
  if ac.household_id is null then return jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  if ac.locked_until is not null and ac.locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'locked');
  end if;

  if ac.code <> census_normalize_code(p_code) then
    update household_access_codes set
      failed_attempts = case when failed_attempts + 1 >= 5 then 0 else failed_attempts + 1 end,
      locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end
    where household_id = hid;
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  update household_access_codes set failed_attempts = 0, locked_until = null
  where household_id = hid and (failed_attempts <> 0 or locked_until is not null);
  return jsonb_build_object('ok', true, 'householdId', hid);
end;
$$;
revoke execute on function public.portal_check(text, text) from public, anon, authenticated;

-- Registration status by number: the status and date only. The current
-- number comes back too, so an old number shows the new one.
create or replace function public.registration_status(p_ref text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  hid integer;
  h households;
begin
  perform public_request_guard('status', 30, 2000);
  hid := household_by_ref(p_ref);
  select * into h from households where id = hid;
  if not found then return null; end if;
  return jsonb_build_object(
    'ref_no', h.ref_no,
    'status', h.status,
    'registered_on', (h.created_at at time zone 'Asia/Manila')::date
  );
end;
$$;
grant execute on function public.registration_status(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Parish Config -> Parish GKK: the codes, for full-access staff.
-- ---------------------------------------------------------------------------

/**
 * Every barangay with a GKK (given a code if it has none yet), plus any
 * other barangay that has a code: [{ barangay, code, gkks, next_ref }].
 */
create or replace function public.list_barangay_ref_codes() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b text;
  yr integer := extract(year from (now() at time zone 'Asia/Manila'))::integer;
begin
  if staff_access() is distinct from 'full' then
    raise exception 'Only full-access staff can see the reference codes' using errcode = '42501';
  end if;
  for b in select distinct gkk_barangay(name) from gkks where gkk_barangay(name) is not null loop
    perform barangay_ref_code(b);
  end loop;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'barangay', c.barangay,
      'code', c.code,
      'gkks', (select count(*) from gkks g where lower(gkk_barangay(g.name)) = lower(c.barangay)),
      'next_ref', household_ref(c.code, yr, coalesce((select last_no from household_ref_counters k where k.code = c.code and k.year = yr), 0) + 1)
    ) order by c.barangay)
    from barangay_ref_codes c), '[]'::jsonb);
end;
$$;

/** Change a barangay's code. Numbers already given out keep the old code. */
create or replace function public.set_barangay_ref_code(p_barangay text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  new_code text := upper(trim(coalesce(p_code, '')));
  other text;
begin
  if staff_access() is distinct from 'full' then
    raise exception 'Only full-access staff can change the reference codes' using errcode = '42501';
  end if;
  if new_code !~ '^[A-Z]{3}$' then
    raise exception 'A code is exactly 3 letters, A to Z' using errcode = '22023';
  end if;
  if new_code = 'OLG' then
    raise exception 'OLG is kept for households with no barangay. Choose another code.' using errcode = '22023';
  end if;
  select barangay into other from barangay_ref_codes where code = new_code and lower(barangay) <> lower(trim(p_barangay));
  if other is not null then
    raise exception '% already uses %', other, new_code using errcode = '22023';
  end if;
  update barangay_ref_codes set code = new_code, updated_at = now() where lower(barangay) = lower(trim(p_barangay));
  if not found then raise exception 'Unknown barangay %', p_barangay using errcode = '22023'; end if;
  return jsonb_build_object('barangay', trim(p_barangay), 'code', new_code);
end;
$$;

revoke execute on function public.list_barangay_ref_codes() from public, anon;
revoke execute on function public.set_barangay_ref_code(text, text) from public, anon;
grant execute on function public.list_barangay_ref_codes() to authenticated;
grant execute on function public.set_barangay_ref_code(text, text) to authenticated;
