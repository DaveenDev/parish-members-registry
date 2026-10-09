-- A "Clergy" access level, for the parish's priests. Run after
-- 0086_young_children_bata_pa.sql. Safe to re-run.
--
-- Full access lets a priest change and delete anything, export the registry
-- and edit the website; Read only can't verify a sacrament or answer a sick
-- call. Clergy sits between them:
--   sees      the registry, sacraments, census and its results, reports, the
--             Requests queues, the duplicates and the organization structure
--   changes   sacrament verifications (verify, take back) and the Requests
--             queues (certificate, sacrament and blood requests)
--   not       blood types (member_blood_types stays Full, Read only and
--             Website & requests; its policy already leaves clergy out), the
--             activity log (it shows blood type changes), exports, census
--             codes, GKK documents, the trash, the website, the lists, the
--             parish settings, and no change to households or members.
-- Staff admins still need full access (manage-staff).

do $$
begin
  if to_regprocedure('public.gkk_structure_access(text, boolean)') is null
     or to_regprocedure('public.undismiss_duplicate_group(integer[])') is null
     or to_regclass('public.member_blood_types') is null then
    raise exception 'Run the migrations up to 0086_young_children_bata_pa.sql before this one';
  end if;
end;
$$;

-- ---- the level ---------------------------------------------------------------

alter table profiles drop constraint if exists profiles_access_check;
alter table profiles add constraint profiles_access_check
  check (access in ('full', 'read_only', 'gkk_leader', 'website', 'clergy'));

-- ---- what it sees -------------------------------------------------------------

-- As in 0014, with clergy: the registry and the requests, no activity or trash.
create or replace function public.staff_can_see(area text) returns boolean
language sql stable set search_path = public as $$
  select case staff_access()
    when 'full' then true
    when 'read_only' then area in ('registry', 'requests', 'activity')
    when 'website' then area in ('registry', 'requests')
    when 'clergy' then area in ('registry', 'requests')
    else false
  end;
$$;

-- As in 0062: every GKK's census.
create or replace function public.staff_sees_census() returns boolean
language sql stable set search_path = public as $$
  select staff_access() in ('full', 'read_only', 'clergy');
$$;

alter policy org_charts_staff_select on org_charts using ((select staff_access()) in ('full', 'read_only', 'gkk_leader', 'website', 'clergy'));
alter policy org_nodes_staff_select on org_nodes using ((select staff_access()) in ('full', 'read_only', 'gkk_leader', 'website', 'clergy'));
alter policy org_gkk_holders_staff_select on org_gkk_holders using ((select staff_access()) in ('full', 'read_only', 'gkk_leader', 'website', 'clergy'));

alter policy org_gkk_officers_select on org_gkk_officers
  using ((select staff_access()) in ('full', 'read_only', 'website', 'clergy')
         or ((select staff_access()) = 'gkk_leader' and gkk = (select staff_gkk())));
alter policy org_gkk_structures_select on org_gkk_structures
  using ((select staff_access()) in ('full', 'read_only', 'website', 'clergy')
         or ((select staff_access()) = 'gkk_leader' and gkk = (select staff_gkk())));

-- As in 0081, with clergy seeing (not changing) every GKK's structure.
create or replace function public.gkk_structure_access(p_gkk text, p_edit boolean) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  acc text := staff_access();
begin
  if not exists (select 1 from gkks where name = p_gkk) then raise exception 'Unknown GKK: %', p_gkk; end if;
  if acc = 'full' then return; end if;
  if acc = 'gkk_leader' and p_gkk = staff_gkk() then return; end if;
  if not p_edit and acc in ('read_only', 'website', 'clergy') then return; end if;
  raise exception '%', case
    when acc = 'gkk_leader' then 'Your account can only ' || case when p_edit then 'change' else 'see' end
                                 || ' the structure of ' || coalesce(staff_gkk(), 'your GKK')
    when acc in ('read_only', 'website', 'clergy') then 'Your account can view records but not change them'
    else 'Your account can''t see this. Ask a staff admin.'
  end using errcode = '42501';
end;
$$;

-- As in 0081: requests and registry alerts, as Read only gets.
create or replace function public.notification_visible_to(acc text, acc_gkk text, area text, gkk text) returns boolean
language sql immutable as $$
  select case
    when acc is null then false
    when area = 'leader' then acc = 'gkk_leader' and gkk is not null and gkk = acc_gkk
    when acc = 'full' then true
    when acc in ('read_only', 'clergy') then area in ('requests', 'registry')
    when acc = 'website' then area = 'requests'
    when acc = 'gkk_leader' then area = 'registry' and gkk is not null and gkk = acc_gkk
    else false
  end;
$$;

-- ---- what it changes ------------------------------------------------------------

-- As in 0067, with clergy changing sacrament verifications and requests.
create or replace function public.guard_staff_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  acc text := staff_access();
  area text := tg_argv[0];
  mine text := staff_gkk();
  ok boolean := false;
begin
  if acc is null or acc = 'full' then
    ok := true;
  elsif acc = 'clergy' then
    ok := area in ('verification', 'requests');
  elsif acc = 'website' then
    ok := area in ('website', 'requests');
    if ok and tg_table_name = 'parish_settings' then
      ok := tg_op = 'UPDATE'
        and (to_jsonb(new) - website_office_fields()) = (to_jsonb(old) - website_office_fields());
      if not ok then
        raise exception 'Your account can only change the office and contact details. Ask a staff admin for the rest.' using errcode = '42501';
      end if;
    end if;
  elsif acc = 'gkk_leader' and area = 'registry' and tg_op <> 'DELETE' then
    if tg_table_name = 'households' then
      ok := new.gkk = mine and (tg_op = 'INSERT' or old.gkk = mine);
    else
      ok := exists (select 1 from households h where h.id = new.household_id and h.gkk = mine)
        and (tg_op = 'INSERT' or exists (select 1 from households h where h.id = old.household_id and h.gkk = mine));
    end if;
    if not ok then
      raise exception 'Your account can only change households in %', mine using errcode = '42501';
    end if;
  elsif acc = 'gkk_leader' and area = 'verification' and tg_op = 'DELETE' then
    ok := exists (select 1 from members m join households h on h.id = m.household_id
                  where m.id = old.member_id and h.gkk = mine);
  elsif acc = 'gkk_leader' and area = 'gkks' and tg_op = 'UPDATE' then
    -- Everything but the leader's fields must stay as it was.
    ok := old.name = mine
      and (to_jsonb(new) - gkk_leader_fields()) = (to_jsonb(old) - gkk_leader_fields());
    if not ok then
      raise exception 'Your account can only change the chapel details and history of %', coalesce(mine, 'your GKK') using errcode = '42501';
    end if;
  end if;

  if not ok then
    raise exception '%', case
      when acc = 'none' then 'Your account hasn''t been given access yet. Ask a staff admin to set it in Settings → Staff.'
      when acc = 'read_only' then 'Your account can view records but not change them'
      when area = 'registry' and tg_op = 'DELETE' then 'Only staff with full access can delete households and members. Ask a staff admin.'
      when area = 'registry' then 'Your account can view the registry but not change it. Ask a staff admin.'
      when acc = 'gkk_leader' and area = 'verification' and tg_op = 'DELETE' then 'Your account can only change the sacraments of members in ' || coalesce(mine, 'your GKK')
      when area = 'verification' then 'Only full access and clergy can verify sacraments. Ask a staff admin.'
      when tg_table_name = 'census_cycles' then 'Only staff with full access can start, close or reopen a census. Ask a staff admin.'
      when tg_table_name in ('ministries', 'organizations', 'parish_positions') then 'Only staff with full access can change the ministry, organization and position lists. Ask a staff admin.'
      when tg_table_name = 'parish_settings' then 'Only staff with full access can change the parish settings. Ask a staff admin.'
      when area = 'gkks' then 'Only staff with full access can change the GKK list. Ask a staff admin.'
      when area = 'website' then 'Your account can''t change the parish website. Ask a staff admin.'
      when area = 'requests' then 'Your account can''t handle requests. Ask a staff admin.'
      else 'Your account can''t change this. Ask a staff admin.'
    end using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$function$;

-- As in 0075, refusing every account that can't change records (as
-- dismiss_duplicate_group does since 0065), clergy included.
create or replace function public.undismiss_duplicate_group(p_member_ids integer[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  ids integer[];
begin
  if current_staff_name() is null then raise exception 'Only parish staff can change possible duplicates'; end if;
  select array_agg(distinct x order by x) into ids from unnest(p_member_ids) as x where x is not null;
  if staff_access() is distinct from 'full' and staff_access() is distinct from 'gkk_leader' then
    raise exception 'Your account can view records but not change them' using errcode = '42501';
  end if;
  if staff_access() = 'gkk_leader' and not members_in_leader_gkk(ids) then
    raise exception 'Your account can only review the members of %', staff_gkk() using errcode = '42501';
  end if;
  delete from duplicate_dismissals where member_ids = ids;
end;
$$;

revoke all on function public.undismiss_duplicate_group(integer[]) from public, anon;
grant execute on function public.undismiss_duplicate_group(integer[]) to authenticated;
