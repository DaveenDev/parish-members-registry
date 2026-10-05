-- Stricter sacrament verification. Run after 0042. Safe to re-run.
--
-- 1. A verification is tied to what was checked: if the family (or staff)
--    later changes the date or the parish of a verified sacrament, the
--    verification is dropped and the sacrament shows as "Claimed" until it is
--    verified again. (Unticking the sacrament already did this.)
-- 2. Matrimony is verified only against a marriage document or the parish
--    register, and always with a reference (book / page / entry or certificate
--    no.), since it decides whether someone is free to marry in church.

create or replace function public.members_drop_stale_verifications() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from sacrament_verifications v
  where v.member_id = new.id
    and ((v.sacrament = 'baptism' and (not new.has_baptism
            or new.baptism_date is distinct from old.baptism_date
            or new.baptism_church is distinct from old.baptism_church))
      or (v.sacrament = 'communion' and (not new.has_communion
            or new.communion_date is distinct from old.communion_date
            or new.communion_church is distinct from old.communion_church))
      or (v.sacrament = 'confirmation' and (not new.has_confirmation
            or new.conf_date is distinct from old.conf_date
            or new.conf_church is distinct from old.conf_church))
      or (v.sacrament = 'matrimony' and (not new.has_matrimony
            or new.mat_date is distinct from old.mat_date
            or new.mat_church is distinct from old.mat_church)));
  return new;
end;
$$;

drop trigger if exists trg_members_drop_stale_verifications on members;
create trigger trg_members_drop_stale_verifications
after update of has_baptism, baptism_date, baptism_church,
                has_communion, communion_date, communion_church,
                has_confirmation, conf_date, conf_church,
                has_matrimony, mat_date, mat_church on members
for each row execute function public.members_drop_stale_verifications();

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
  if p_sacrament = 'matrimony' then
    if trim(p_source) not in ('Marriage contract / certificate', 'Parish register entry') then
      raise exception 'Matrimony is verified with the marriage certificate or the parish register';
    end if;
    if coalesce(trim(p_reference), '') = '' then
      raise exception 'Enter the book / page / entry or certificate number for the marriage';
    end if;
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
