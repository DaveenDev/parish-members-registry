-- Sacrament verification by parish staff. Run after 0004_public_parish_logo.sql.
-- Safe to re-run.
--
-- Families self-report sacraments in the public wizard. Staff confirm each
-- claim against proof (a certificate or the parish register) and the admin
-- panel shows "claimed" vs "verified". Who verified and when is set by the
-- server from the signed-in account, so it can't be filled in by hand.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------

create table if not exists sacrament_verifications (
  member_id        integer not null references members(id) on delete cascade,
  sacrament        text not null check (sacrament in ('baptism', 'communion', 'confirmation', 'matrimony')),
  source           text not null,
  reference        text,
  verified_by      uuid references auth.users(id) on delete set null,
  verified_by_name text,
  verified_at      timestamptz not null default now(),
  primary key (member_id, sacrament)
);

alter table sacrament_verifications enable row level security;

drop policy if exists "sacrament_verifications_admin_select" on sacrament_verifications;
create policy "sacrament_verifications_admin_select" on sacrament_verifications
  for select to authenticated using (true);

-- Read-only for staff; every write goes through verify/unverify below.
revoke all on sacrament_verifications from anon, authenticated;
grant select on sacrament_verifications to authenticated;

-- ---------------------------------------------------------------------------
-- Verify / unverify
-- ---------------------------------------------------------------------------

-- Keep in sync with VERIFICATION_SOURCES in client/src/constants.js.
create or replace function public.sacrament_verification_sources() returns text[]
language sql immutable as $$
  select array['Baptismal certificate', 'First Communion certificate', 'Confirmation certificate',
               'Marriage contract / certificate', 'Parish register entry', 'Other document'];
$$;

-- Whether the member currently claims the sacrament (has_<x> is true).
create or replace function public.member_claims_sacrament(p_member_id integer, p_sacrament text) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_sacrament
           when 'baptism' then m.has_baptism
           when 'communion' then m.has_communion
           when 'confirmation' then m.has_confirmation
           when 'matrimony' then m.has_matrimony
         end
  from members m where m.id = p_member_id;
$$;

create or replace function public.verify_sacrament(p_member_id integer, p_sacrament text, p_source text, p_reference text default null)
returns sacrament_verifications
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_name text;
  saved sacrament_verifications;
begin
  select coalesce(nullif(trim(p.name), ''), u.email) into staff_name
  from profiles p join auth.users u on u.id = p.id
  where p.id = auth.uid();
  if staff_name is null then raise exception 'Only parish staff can verify sacraments'; end if;

  if p_sacrament not in ('baptism', 'communion', 'confirmation', 'matrimony') then
    raise exception 'Unknown sacrament: %', p_sacrament;
  end if;
  if coalesce(trim(p_source), '') = '' or not (trim(p_source) = any(sacrament_verification_sources())) then
    raise exception 'Choose how this was verified';
  end if;
  if coalesce(member_claims_sacrament(p_member_id, p_sacrament), false) is not true then
    raise exception 'This member has no % on record to verify', p_sacrament;
  end if;

  insert into sacrament_verifications (member_id, sacrament, source, reference, verified_by, verified_by_name, verified_at)
  values (p_member_id, p_sacrament, trim(p_source), nullif(trim(p_reference), ''), auth.uid(), staff_name, now())
  on conflict (member_id, sacrament) do update
    set source = excluded.source, reference = excluded.reference,
        verified_by = excluded.verified_by, verified_by_name = excluded.verified_by_name, verified_at = excluded.verified_at
  returning * into saved;

  return saved;
end;
$$;

create or replace function public.unverify_sacrament(p_member_id integer, p_sacrament text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'Only parish staff can change sacrament verification';
  end if;
  delete from sacrament_verifications where member_id = p_member_id and sacrament = p_sacrament;
end;
$$;

revoke all on function public.verify_sacrament(integer, text, text, text) from public, anon;
revoke all on function public.unverify_sacrament(integer, text) from public, anon;
revoke all on function public.member_claims_sacrament(integer, text) from public, anon;
grant execute on function public.verify_sacrament(integer, text, text, text) to authenticated;
grant execute on function public.unverify_sacrament(integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- A verification never outlives the claim: unticking a sacrament on the
-- member removes its verification.
-- ---------------------------------------------------------------------------

create or replace function public.members_drop_stale_verifications() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from sacrament_verifications v
  where v.member_id = new.id
    and ((v.sacrament = 'baptism' and not new.has_baptism)
      or (v.sacrament = 'communion' and not new.has_communion)
      or (v.sacrament = 'confirmation' and not new.has_confirmation)
      or (v.sacrament = 'matrimony' and not new.has_matrimony));
  return new;
end;
$$;

drop trigger if exists trg_members_drop_stale_verifications on members;
create trigger trg_members_drop_stale_verifications
after update of has_baptism, has_communion, has_confirmation, has_matrimony on members
for each row execute function public.members_drop_stale_verifications();

-- ---------------------------------------------------------------------------
-- View: add <sacrament>_verified flags for listing and filtering.
-- ---------------------------------------------------------------------------

drop view if exists members_with_household;
create view members_with_household
with (security_invoker = true) as
select
  m.*,
  h.household_name,
  h.status as household_status,
  h.gkk as household_gkk,
  h.street, h.barangay, h.city, h.province, h.zip,
  case when m.dob is null then null else date_part('year', age(m.dob))::int end as age,
  (m.first_name || ' ' || m.last_name) as full_name,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'baptism') as baptism_verified,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'communion') as communion_verified,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'confirmation') as confirmation_verified,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'matrimony') as matrimony_verified
from members m
join households h on h.id = m.household_id;

grant select on members_with_household to authenticated;
