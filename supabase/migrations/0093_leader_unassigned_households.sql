-- GKK leaders see the households with no GKK, and can take them into
-- theirs. Run after 0092_household_duplicates.sql. Safe to re-run.
--
-- Some households have no GKK (older records), or a GKK name that isn't in
-- the GKK list any more: the same "No assigned GKK" as the Households filter.
-- A GKK leader saw only their own GKK's households, so nobody but full access
-- could find these families and put them in a GKK. Now a leader also sees
-- them, with their members, on the Households and Members pages and opens
-- and edits them as their own:
--   households  saved with the leader's GKK (the edit drawer's Parish GKK,
--               or "Move to my GKK") becomes theirs. Saved with the GKK left
--               as it was, it stays unassigned. A leader still can't take a
--               household out of their GKK, or put one in another GKK (and
--               no longer can clear their own household's GKK, which a null
--               check let through).
--   members     changed, added or moved as in their own households.
--   also read   sacrament verifications and service history, so a member's
--               record shows in full.
-- Census answers, codes and online updates stay with each GKK's own
-- households: a leader records the census once the household is theirs.
--
-- A leader's totals stay their GKK's: the Dashboard, the Reports statistics
-- and activeness list, the Census progress, and the possible duplicates (a
-- leader can only dismiss or merge their own). Those functions run with
-- application_name 'parish:own_gkk_only' (set on each function below, put
-- back when it returns), and the row rules leave the unassigned households
-- out while it is. (Supabase refuses a custom setting such as
-- parish.own_gkk_only on a function, so the flag borrows application_name,
-- which any role may set.) The sidebar badges do count them, as the
-- Households lists show them.
-- A later "create or replace" of one of those functions drops its setting:
-- give it "set application_name = 'parish:own_gkk_only'" again there.

do $$
begin
  if to_regprocedure('public.find_duplicate_households()') is null
     or to_regprocedure('public.staff_gkk()') is null
     or to_regclass('public.member_service') is null then
    raise exception 'Run the migrations up to 0092_household_duplicates.sql before this one';
  end if;
end;
$$;

-- ---- which households ---------------------------------------------------------

-- No GKK, or a name not in the GKK list. Security definer so the GKK list is
-- always read whole: a name missing from a partial list would look unassigned.
create or replace function public.gkk_unassigned(p_gkk text) returns boolean
language sql stable security definer set search_path = public as $$
  select nullif(trim(p_gkk), '') is null or not exists (select 1 from gkks g where g.name = p_gkk);
$$;
revoke execute on function public.gkk_unassigned(text) from public, anon;
grant execute on function public.gkk_unassigned(text) to authenticated;

-- Whether a GKK leader sees the unassigned households now: not inside the
-- functions that count their GKK (application_name 'parish:own_gkk_only').
create or replace function public.leader_sees_unassigned() returns boolean
language sql stable set search_path = public as $$
  select current_setting('application_name', true) is distinct from 'parish:own_gkk_only';
$$;
revoke execute on function public.leader_sees_unassigned() from public, anon;
grant execute on function public.leader_sees_unassigned() to authenticated;

-- ---- the row rules (as in 0039 and 0071, plus the unassigned households) ------

alter policy households_admin_all on households
  using ((select staff_can_see('registry'))
         or ((select staff_access()) = 'gkk_leader'
             and (gkk = (select staff_gkk())
                  or ((select leader_sees_unassigned()) and gkk_unassigned(gkk)))));

alter policy members_admin_all on members
  using ((select staff_can_see('registry'))
         or exists (select 1 from households h
                    where h.id = members.household_id
                      and (select staff_access()) = 'gkk_leader'
                      and (h.gkk = (select staff_gkk())
                           or ((select leader_sees_unassigned()) and gkk_unassigned(h.gkk)))));

alter policy sacrament_verifications_admin_select on sacrament_verifications
  using ((select staff_can_see('registry'))
         or exists (select 1 from members m join households h on h.id = m.household_id
                    where m.id = sacrament_verifications.member_id
                      and (select staff_access()) = 'gkk_leader'
                      and (h.gkk = (select staff_gkk())
                           or ((select leader_sees_unassigned()) and gkk_unassigned(h.gkk)))));

alter policy member_service_select on member_service
  using ((select staff_can_see('registry'))
         or exists (select 1 from members m join households h on h.id = m.household_id
                    where m.id = member_service.member_id
                      and (select staff_access()) = 'gkk_leader'
                      and (h.gkk = (select staff_gkk())
                           or ((select leader_sees_unassigned()) and gkk_unassigned(h.gkk)))));

alter policy member_service_write on member_service
  using ((select staff_access()) = 'full'
         or exists (select 1 from members m join households h on h.id = m.household_id
                    where m.id = member_service.member_id
                      and (select staff_access()) = 'gkk_leader'
                      and (h.gkk = (select staff_gkk()) or gkk_unassigned(h.gkk))))
  with check ((select staff_access()) = 'full'
         or exists (select 1 from members m join households h on h.id = m.household_id
                    where m.id = member_service.member_id
                      and (select staff_access()) = 'gkk_leader'
                      and (h.gkk = (select staff_gkk()) or gkk_unassigned(h.gkk))));

-- ---- what a leader may change -----------------------------------------------------

-- As in 0087, with a GKK leader also changing the unassigned households and
-- their members.
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
      -- Into their GKK (new, theirs, or unassigned until now); or an
      -- unassigned household edited with its GKK left as it was. (Before,
      -- an empty GKK made the check null, which let a leader clear the GKK
      -- of their own household.)
      ok := coalesce((new.gkk = mine and (tg_op = 'INSERT' or old.gkk = mine or gkk_unassigned(old.gkk)))
        or (tg_op = 'UPDATE' and gkk_unassigned(old.gkk)
            and nullif(trim(new.gkk), '') is not distinct from nullif(trim(old.gkk), '')), false);
    else
      ok := exists (select 1 from households h where h.id = new.household_id and (h.gkk = mine or gkk_unassigned(h.gkk)))
        and (tg_op = 'INSERT' or exists (select 1 from households h where h.id = old.household_id and (h.gkk = mine or gkk_unassigned(h.gkk))));
    end if;
    if not ok then
      raise exception 'Your account can only change households in % or with no GKK', mine using errcode = '42501';
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

-- ---- a leader's totals: their GKK only --------------------------------------------

alter function public.admin_dashboard_stats(text) set application_name = 'parish:own_gkk_only';
alter function public.admin_report_stats() set application_name = 'parish:own_gkk_only';
alter function public.family_stats() set application_name = 'parish:own_gkk_only';
alter function public.members_by_gkk() set application_name = 'parish:own_gkk_only';
alter function public.activeness_members(text, integer) set application_name = 'parish:own_gkk_only';
alter function public.census_summary(integer) set application_name = 'parish:own_gkk_only';
alter function public.census_household_progress(integer) set application_name = 'parish:own_gkk_only';
alter function public.census_family_progress(integer) set application_name = 'parish:own_gkk_only';
alter function public.find_duplicate_members() set application_name = 'parish:own_gkk_only';
alter function public.find_duplicate_households() set application_name = 'parish:own_gkk_only';

notify pgrst, 'reload schema';
