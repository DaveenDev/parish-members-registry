-- Parish Members Online Registry — Supabase schema
--
-- Ports server/src/db/schema.sql + the business logic that used to live in the
-- Express routes (server/src/routes/*.js) into Postgres, since the frontend
-- now talks to Supabase directly and there is no backend left to enforce it.
--
-- Run this once in the Supabase SQL editor (or via `supabase db push`) on a
-- fresh project, then see the bottom of this file for the manual admin-user
-- step that has to happen in the Auth UI (can't be scripted from SQL alone).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per admin, keyed to auth.users. There is no role-based access
-- control today (every authenticated user could do everything in the old
-- Express app) — `role`/`name` here are display-only, shown in the sidebar.
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null default '',
  role       text not null default 'Parish Secretary',
  created_at timestamptz not null default now()
);

create table if not exists gkks (
  id   serial primary key,
  name text unique not null
);

create table if not exists ministries (
  id   serial primary key,
  name text unique not null
);

create table if not exists organizations (
  id   serial primary key,
  name text unique not null
);

create table if not exists parish_settings (
  id      smallint primary key default 1 check (id = 1),
  name    text not null default 'Our Lady of Guadalupe',
  address text not null default '',
  contact text not null default '',
  email   text not null default '',
  logo    text
);

create table if not exists households (
  id              serial primary key,
  household_name  text not null,
  street          text not null,
  barangay        text not null,
  city            text not null,
  province        text not null,
  zip             text not null,
  contact         text,
  email           text,
  gkk             text,
  family_grouping text,
  status          text not null default 'Pending' check (status in ('Pending', 'Verified')),
  volunteer       text, -- Yes | Maybe | No
  notify_optin    boolean not null default false,
  consent         boolean not null default false,
  ref_no          text unique,
  created_at      timestamptz not null default now()
);

create index if not exists idx_households_status on households(status);
create index if not exists idx_households_gkk on households(gkk);

create table if not exists members (
  id             serial primary key,
  household_id   integer not null references households(id) on delete cascade,
  first_name     text not null,
  middle_name    text,
  last_name      text not null,
  relationship   text,
  sex            text,
  dob            date,
  place_of_birth text,
  civil_status   text,
  contact        text,
  email          text,
  occupation     text,
  religion       text default 'Roman Catholic',
  blood_type     text,

  has_baptism      boolean not null default false,
  baptism_date     date,
  baptism_church   text,

  has_communion    boolean not null default false,
  communion_date   date,
  communion_church text,

  has_confirmation boolean not null default false,
  conf_date        date,
  conf_church      text,
  conf_name        text,
  conf_sponsor     text,

  has_matrimony    boolean not null default false,
  mat_date         date,
  mat_church       text,
  mat_type         text,

  ministries    text[] not null default '{}',
  organizations text[] not null default '{}',

  created_at timestamptz not null default now()
);

create index if not exists idx_members_household on members(household_id);

-- ---------------------------------------------------------------------------
-- Views used by the admin panel for filterable/sortable listings
-- (`security_invoker` so a view still enforces the *querying* role's RLS
-- instead of running with the view owner's privileges)
-- ---------------------------------------------------------------------------

create or replace view members_with_household
with (security_invoker = true) as
select
  m.*,
  h.household_name,
  h.status as household_status,
  h.gkk as household_gkk,
  h.street, h.barangay, h.city, h.province, h.zip,
  case when m.dob is null then null else date_part('year', age(m.dob))::int end as age,
  (m.first_name || ' ' || m.last_name) as full_name
from members m
join households h on h.id = m.household_id;

create or replace view households_with_count
with (security_invoker = true) as
select h.*, (select count(*)::int from members m where m.household_id = h.id) as member_count
from households h;

grant select on members_with_household to authenticated;
grant select on households_with_count to authenticated;

-- ---------------------------------------------------------------------------
-- Reference-number generation (server/src/lib/ref-no.js)
--
-- OLG-{year}-{6-char code}, alphabet excludes 0/O/1/I so it reads and
-- transcribes over the phone unambiguously. Runs as a BEFORE INSERT trigger
-- so it works the same whether the row comes from the admin panel or the
-- public registration RPC below.
-- ---------------------------------------------------------------------------

create or replace function generate_ref_no() returns text
language plpgsql as $$
declare
  alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  suffix text := '';
  i int;
begin
  for i in 1..6 loop
    suffix := suffix || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return 'OLG-' || extract(year from now())::int || '-' || suffix;
end;
$$;

create or replace function households_set_ref_no() returns trigger
language plpgsql as $$
declare
  attempt int := 0;
  candidate text;
begin
  if new.ref_no is not null then
    return new;
  end if;
  loop
    attempt := attempt + 1;
    candidate := generate_ref_no();
    if not exists (select 1 from households where ref_no = candidate) then
      new.ref_no := candidate;
      return new;
    end if;
    if attempt >= 20 then
      raise exception 'Could not generate a unique reference number';
    end if;
  end loop;
end;
$$;

drop trigger if exists trg_households_set_ref_no on households;
create trigger trg_households_set_ref_no
before insert on households
for each row execute function households_set_ref_no();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- No RBAC existed in the old app either — any authenticated admin could do
-- anything. The only unauthenticated write path is public registration, and
-- that goes through the security-definer RPC below rather than direct table
-- grants, so `anon` gets zero direct table privileges.
-- ---------------------------------------------------------------------------

alter table profiles       enable row level security;
alter table parish_settings enable row level security;
alter table gkks           enable row level security;
alter table ministries     enable row level security;
alter table organizations  enable row level security;
alter table households     enable row level security;
alter table members        enable row level security;

create policy "profiles_select_own" on profiles
  for select to authenticated using (id = auth.uid());

create policy "settings_admin_all" on parish_settings
  for all to authenticated using (true) with check (true);

create policy "gkks_admin_all" on gkks
  for all to authenticated using (true) with check (true);

create policy "ministries_admin_all" on ministries
  for all to authenticated using (true) with check (true);

create policy "organizations_admin_all" on organizations
  for all to authenticated using (true) with check (true);

create policy "households_admin_all" on households
  for all to authenticated using (true) with check (true);

create policy "members_admin_all" on members
  for all to authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant select on profiles to authenticated;
grant select, insert, update, delete on parish_settings, gkks, ministries, organizations, households, members to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- Public registration (server/src/routes/registrations.js)
--
-- A single security-definer RPC instead of direct anon INSERT grants: it
-- avoids the Postgres rule that a RETURNING clause is itself subject to
-- SELECT policies (anon has none), does the household+members insert
-- transactionally, and reproduces every validation the Express route had —
-- including forcing status='Pending' and never accepting an `organizations`
-- list from the public wizard.
-- ---------------------------------------------------------------------------

create or replace function public.submit_registration(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hh jsonb := payload->'household';
  mem jsonb;
  member_count integer;
  new_household_id integer;
  new_ref_no text;
begin
  if hh is null then
    raise exception 'Household details are required';
  end if;

  if coalesce(trim(hh->>'householdName'), '') = '' then raise exception 'Family (household) name is required'; end if;
  if coalesce(trim(hh->>'street'), '') = '' then raise exception 'Street is required'; end if;
  if coalesce(trim(hh->>'barangay'), '') = '' then raise exception 'Barangay is required'; end if;
  if coalesce(trim(hh->>'city'), '') = '' then raise exception 'City / Municipality is required'; end if;
  if coalesce(trim(hh->>'province'), '') = '' then raise exception 'Province is required'; end if;
  if coalesce(trim(hh->>'zip'), '') = '' then raise exception 'ZIP code is required'; end if;

  if payload->'members' is null or jsonb_typeof(payload->'members') <> 'array' then
    raise exception 'At least one household member is required';
  end if;

  member_count := jsonb_array_length(payload->'members');
  if member_count = 0 then raise exception 'At least one household member is required'; end if;
  if member_count > 30 then raise exception 'A household can have at most 30 members'; end if;
  if coalesce((payload->>'consent')::boolean, false) is not true then
    raise exception 'Data privacy consent is required';
  end if;

  for mem in select * from jsonb_array_elements(payload->'members') loop
    if coalesce(trim(mem->>'firstName'), '') = '' then raise exception 'Member first name is required'; end if;
    if coalesce(trim(mem->>'lastName'), '') = '' then raise exception 'Member last name is required'; end if;
    if coalesce(trim(mem->>'relationship'), '') = '' then raise exception 'Member relationship is required'; end if;
    if coalesce(trim(mem->>'sex'), '') = '' then raise exception 'Member sex is required'; end if;
    if coalesce(trim(mem->>'dob'), '') = '' then raise exception 'Member date of birth is required'; end if;
    if coalesce(trim(mem->>'civilStatus'), '') = '' then raise exception 'Member civil status is required'; end if;
  end loop;

  insert into households
    (household_name, street, barangay, city, province, zip, contact, email, gkk, family_grouping,
     status, volunteer, notify_optin, consent)
  values
    (trim(hh->>'householdName'), trim(hh->>'street'), trim(hh->>'barangay'), trim(hh->>'city'),
     trim(hh->>'province'), trim(hh->>'zip'),
     nullif(trim(hh->>'contact'), ''), nullif(trim(hh->>'email'), ''),
     nullif(trim(hh->>'gkk'), ''), nullif(trim(hh->>'familyGrouping'), ''),
     'Pending', nullif(trim(payload->>'volunteer'), ''),
     coalesce((payload->>'notifyOptin')::boolean, false), true)
  returning id, ref_no into new_household_id, new_ref_no;

  for mem in select * from jsonb_array_elements(payload->'members') loop
    insert into members
      (household_id, first_name, middle_name, last_name, relationship, sex, dob, place_of_birth, civil_status,
       contact, email, occupation, religion, blood_type,
       has_baptism, baptism_date, baptism_church,
       has_communion, communion_date, communion_church,
       has_confirmation, conf_date, conf_church, conf_name, conf_sponsor,
       has_matrimony, mat_date, mat_church, mat_type, ministries)
    values
      (new_household_id, trim(mem->>'firstName'), nullif(trim(mem->>'middleName'), ''), trim(mem->>'lastName'),
       nullif(trim(mem->>'relationship'), ''), nullif(trim(mem->>'sex'), ''),
       nullif(trim(mem->>'dob'), '')::date, nullif(trim(mem->>'placeOfBirth'), ''),
       nullif(trim(mem->>'civilStatus'), ''), nullif(trim(mem->>'contact'), ''), nullif(trim(mem->>'email'), ''),
       nullif(trim(mem->>'occupation'), ''),
       coalesce(nullif(trim(mem->>'religion'), ''), 'Roman Catholic'), nullif(trim(mem->>'bloodType'), ''),
       coalesce((mem->>'hasBaptism')::boolean, false), nullif(trim(mem->>'baptismDate'), '')::date, nullif(trim(mem->>'baptismChurch'), ''),
       coalesce((mem->>'hasCommunion')::boolean, false), nullif(trim(mem->>'communionDate'), '')::date, nullif(trim(mem->>'communionChurch'), ''),
       coalesce((mem->>'hasConfirmation')::boolean, false), nullif(trim(mem->>'confDate'), '')::date, nullif(trim(mem->>'confChurch'), ''),
       nullif(trim(mem->>'confName'), ''), nullif(trim(mem->>'confSponsor'), ''),
       coalesce((mem->>'hasMatrimony')::boolean, false), nullif(trim(mem->>'matDate'), '')::date, nullif(trim(mem->>'matChurch'), ''),
       nullif(trim(mem->>'matType'), ''),
       coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(mem->'ministries', '[]'::jsonb)) x), '{}'));
  end loop;

  return jsonb_build_object('refNo', new_ref_no, 'householdId', new_household_id);
end;
$$;

grant execute on function public.submit_registration(jsonb) to anon;

-- ---------------------------------------------------------------------------
-- Admin household creation (server/src/routes/households.js POST /)
--
-- Kept as one RPC (rather than two separate client-side inserts) so a bad
-- member row can't leave behind a household with no members.
-- ---------------------------------------------------------------------------

create or replace function public.create_household(payload jsonb)
returns integer
language plpgsql as $$
declare
  hh jsonb := payload->'household';
  mem jsonb;
  new_household_id integer;
  status_val text;
begin
  if hh is null then raise exception 'Household details are required'; end if;
  if coalesce(trim(hh->>'name'), '') = '' then raise exception 'Household name is required'; end if;
  if coalesce(trim(hh->>'street'), '') = '' then raise exception 'Street is required'; end if;
  if coalesce(trim(hh->>'barangay'), '') = '' then raise exception 'Barangay is required'; end if;
  if coalesce(trim(hh->>'city'), '') = '' then raise exception 'City / Municipality is required'; end if;
  if coalesce(trim(hh->>'province'), '') = '' then raise exception 'Province is required'; end if;
  if coalesce(trim(hh->>'zip'), '') = '' then raise exception 'ZIP code is required'; end if;

  if payload->'members' is null or jsonb_typeof(payload->'members') <> 'array'
     or jsonb_array_length(payload->'members') = 0 then
    raise exception 'At least one member is required';
  end if;

  for mem in select * from jsonb_array_elements(payload->'members') loop
    if coalesce(trim(mem->>'first'), '') = '' then raise exception 'Member first name is required'; end if;
    if coalesce(trim(mem->>'last'), '') = '' then raise exception 'Member last name is required'; end if;
  end loop;

  status_val := case when hh->>'status' = 'Verified' then 'Verified' else 'Pending' end;

  insert into households
    (household_name, street, barangay, city, province, zip, contact, email, gkk, family_grouping, status)
  values
    (trim(hh->>'name'), trim(hh->>'street'), trim(hh->>'barangay'), trim(hh->>'city'), trim(hh->>'province'), trim(hh->>'zip'),
     nullif(trim(hh->>'contact'), ''), nullif(trim(hh->>'email'), ''), nullif(trim(hh->>'gkk'), ''), nullif(trim(hh->>'grouping'), ''),
     status_val)
  returning id into new_household_id;

  for mem in select * from jsonb_array_elements(payload->'members') loop
    insert into members
      (household_id, first_name, middle_name, last_name, relationship, sex, dob, place_of_birth, civil_status,
       contact, email, occupation, blood_type,
       has_baptism, baptism_date, baptism_church,
       has_communion, communion_date, communion_church,
       has_confirmation, conf_date, conf_church, conf_name, conf_sponsor,
       has_matrimony, mat_date, mat_church, mat_type, ministries, organizations)
    values
      (new_household_id, trim(mem->>'first'), nullif(trim(mem->>'middle'), ''), trim(mem->>'last'),
       nullif(trim(mem->>'rel'), ''), nullif(trim(mem->>'sex'), ''), nullif(trim(mem->>'dob'), '')::date, nullif(trim(mem->>'pob'), ''),
       nullif(trim(mem->>'civil'), ''), nullif(trim(mem->>'contact'), ''), nullif(trim(mem->>'email'), ''), nullif(trim(mem->>'occupation'), ''),
       nullif(trim(mem->>'bloodType'), ''),
       coalesce((mem->>'hasBaptism')::boolean, false), nullif(trim(mem->>'baptismDate'), '')::date, nullif(trim(mem->>'baptismChurch'), ''),
       coalesce((mem->>'hasCommunion')::boolean, false), nullif(trim(mem->>'communionDate'), '')::date, nullif(trim(mem->>'communionChurch'), ''),
       coalesce((mem->>'hasConfirmation')::boolean, false), nullif(trim(mem->>'confDate'), '')::date, nullif(trim(mem->>'confChurch'), ''),
       nullif(trim(mem->>'confName'), ''), nullif(trim(mem->>'confSponsor'), ''),
       coalesce((mem->>'hasMatrimony')::boolean, false), nullif(trim(mem->>'matDate'), '')::date, nullif(trim(mem->>'matChurch'), ''),
       nullif(trim(mem->>'matType'), ''),
       coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(mem->'ministries', '[]'::jsonb)) x), '{}'),
       coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(mem->'organizations', '[]'::jsonb)) x), '{}'));
  end loop;

  return new_household_id;
end;
$$;

grant execute on function public.create_household(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- GKK / ministry / organization rename+cascade and delete-if-unused
-- (server/src/routes/config.js's `groupRoutes` factory)
--
-- These run as the calling (authenticated) role, not security-definer — RLS
-- above already gives authenticated full access to these tables, the
-- functions just keep the rename-cascade / delete-guard atomic. Ministries
-- and organizations get separate functions rather than one parameterized by
-- table/column name, since that name would otherwise have to be interpolated
-- into dynamic SQL from a client-supplied argument.
-- ---------------------------------------------------------------------------

create or replace function public.rename_gkk(old_name text, new_name text) returns void
language plpgsql as $$
begin
  if coalesce(trim(new_name), '') = '' then raise exception 'Name is required'; end if;
  update gkks set name = trim(new_name) where name = old_name;
  if not found then raise exception 'GKK not found'; end if;
  update households set gkk = trim(new_name) where gkk = old_name;
end;
$$;

create or replace function public.delete_gkk(target_name text) returns void
language plpgsql as $$
declare in_use integer;
begin
  select count(*) into in_use from households where gkk = target_name;
  if in_use > 0 then raise exception 'This GKK is assigned to a household and cannot be deleted'; end if;
  delete from gkks where name = target_name;
end;
$$;

create or replace function public.rename_ministry(old_name text, new_name text) returns void
language plpgsql as $$
begin
  if coalesce(trim(new_name), '') = '' then raise exception 'Name is required'; end if;
  update ministries set name = trim(new_name) where name = old_name;
  if not found then raise exception 'Item not found'; end if;
  update members set ministries = array_replace(ministries, old_name, trim(new_name));
end;
$$;

create or replace function public.delete_ministry(target_name text) returns void
language plpgsql as $$
declare in_use integer;
begin
  select count(*) into in_use from members where target_name = any(ministries);
  if in_use > 0 then raise exception 'Members are assigned to this item and it cannot be deleted'; end if;
  delete from ministries where name = target_name;
end;
$$;

create or replace function public.rename_organization(old_name text, new_name text) returns void
language plpgsql as $$
begin
  if coalesce(trim(new_name), '') = '' then raise exception 'Name is required'; end if;
  update organizations set name = trim(new_name) where name = old_name;
  if not found then raise exception 'Item not found'; end if;
  update members set organizations = array_replace(organizations, old_name, trim(new_name));
end;
$$;

create or replace function public.delete_organization(target_name text) returns void
language plpgsql as $$
declare in_use integer;
begin
  select count(*) into in_use from members where target_name = any(organizations);
  if in_use > 0 then raise exception 'Members are assigned to this item and it cannot be deleted'; end if;
  delete from organizations where name = target_name;
end;
$$;

grant execute on function public.rename_gkk(text, text) to authenticated;
grant execute on function public.delete_gkk(text) to authenticated;
grant execute on function public.rename_ministry(text, text) to authenticated;
grant execute on function public.delete_ministry(text) to authenticated;
grant execute on function public.rename_organization(text, text) to authenticated;
grant execute on function public.delete_organization(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed data (server/src/db/defaults.js) — idempotent
-- ---------------------------------------------------------------------------

insert into parish_settings (id, name, address, contact, email)
values (1, 'Our Lady of Guadalupe', 'Purok 3, Mua-an, Kidapawan City, North Cotabato', '', '')
on conflict (id) do nothing;

insert into gkks (name)
values ('GKK San Lorenzo Ruiz'), ('GKK San Pedro Calungsod'), ('GKK San Isidro'), ('GKK Sto. Niño')
on conflict (name) do nothing;

insert into ministries (name)
values ('Choir'), ('Lector & Commentator'), ('Catechist'), ('Altar Servers'), ('Ushers & Collectors'), ('Sacristan / Money Counters'), ('Kaabag')
on conflict (name) do nothing;

insert into organizations (name)
values ('Youth Ministry'), ('Knights of Columbus'), ('Catholic Women''s League'), ('Legion of Mary'), ('Parish Pastoral Council'), ('Couples for Christ (CFC)')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Manual step (cannot be scripted from SQL): create the first admin account
--
-- 1. Supabase dashboard → Authentication → Users → Add user. Use a real
--    email and a strong password (this replaces SEED_ADMIN_EMAIL /
--    SEED_ADMIN_PASSWORD from the old .env).
-- 2. Copy the new user's UUID, then run:
--
--      insert into profiles (id, name, role)
--      values ('<paste-uuid-here>', 'Ma. Assumpta R.', 'Parish Secretary');
--
-- 3. Authentication → Providers → Email → turn OFF "Allow new users to sign
--    up". Public registrants never get an auth account (they only ever hit
--    the submit_registration RPC), so this is what keeps "every authenticated
--    user is an admin" safe.
-- ---------------------------------------------------------------------------
