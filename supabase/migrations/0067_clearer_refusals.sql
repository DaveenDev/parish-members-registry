-- Clearer refusals from the staff write guard. Run after
-- 0066_notification_links_indexes.sql. Safe to re-run.
--
-- guard_staff_write refused with one line per access level, so a GKK leader
-- closing a census or changing the parish name read "Your account can only
-- update the households and members of your GKK", and a login without access
-- read "Your account can't change this". It now says what was refused and
-- who can do it: deleting records, verifying sacraments, the census, the
-- lists, the parish settings, the GKK list, the website or requests, and for
-- a new login that it is still waiting for access (0065).

do $$
begin
  if to_regprocedure('public.guard_staff_write()') is null or to_regprocedure('public.gkk_leader_fields()') is null then
    raise exception 'Run the migrations up to 0065_new_logins_no_access.sql before this one';
  end if;
end;
$$;

-- As in 0062, with the refusals below.
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

  -- Say what was refused and who can do it, rather than one line per access
  -- level ("can only update the households and members of your GKK" was also
  -- what a GKK leader saw on closing a census or changing the parish name).
  if not ok then
    raise exception '%', case
      when acc = 'none' then 'Your account hasn''t been given access yet. Ask a staff admin to set it in Settings → Staff.'
      when acc = 'read_only' then 'Your account can view records but not change them'
      when area = 'registry' and tg_op = 'DELETE' then 'Only staff with full access can delete households and members. Ask a staff admin.'
      when area = 'registry' then 'Your account can view the registry but not change it. Ask a staff admin.'
      when acc = 'gkk_leader' and area = 'verification' and tg_op = 'DELETE' then 'Your account can only change the sacraments of members in ' || coalesce(mine, 'your GKK')
      when area = 'verification' then 'Only staff with full access can verify sacraments. Ask a staff admin.'
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
