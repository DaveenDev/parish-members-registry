-- GKK leaders: only their own GKK, and no blood types. Run after
-- 0049_maintenance_mode.sql. Safe to re-run.
--
-- What a GKK leader reads already follows the row rules (0014, 0039): the
-- households, members and sacrament checks of their GKK, so the Dashboard,
-- Reports and Duplicates counts are their GKK's. This migration closes what
-- was left:
--   census     0039 rewrote the census read rules for speed and dropped the
--              GKK leader part 0024 had added, so a leader's Census page lost
--              their GKK's answers, online updates and snapshots. Restored.
--   duplicates A leader couldn't read the dismissed groups, so a group they
--              dismissed came back; and they could dismiss members of any
--              GKK. Now they see and dismiss only their GKK's.
--   GKK list   admin_list_counts('gkks'), behind every GKK filter, lists only
--              the leader's GKK.
--   blood      Reports leaves blood types out for a leader, and a leader's
--              changes never set or change a member's blood type (the admin
--              hides the field from them).

do $$
begin
  if to_regprocedure('public.staff_sees_gkk(text)') is null or to_regclass('public.duplicate_dismissals') is null
     or to_regprocedure('public.admin_report_stats()') is null then
    raise exception 'Run 0010_admin_tools.sql, 0014_roles_activity_trash.sql and 0039_faster_access_checks.sql before this migration';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Census: the leader's GKK again (as 0024, in 0039's faster form)
-- ---------------------------------------------------------------------------

alter policy census_member_responses_admin_select on census_member_responses
  using ((select staff_can_see('registry'))
         or exists (select 1 from members m join households h on h.id = m.household_id
                    where m.id = census_member_responses.member_id
                      and (select staff_access()) = 'gkk_leader' and h.gkk = (select staff_gkk())));

alter policy census_submissions_admin_select on census_submissions
  using ((select staff_can_see('registry'))
         or exists (select 1 from households h
                    where h.id = census_submissions.household_id
                      and (select staff_access()) = 'gkk_leader' and h.gkk = (select staff_gkk())));

alter policy census_household_snapshots_admin_select on census_household_snapshots
  using ((select staff_can_see('registry'))
         or exists (select 1 from households h
                    where h.id = census_household_snapshots.household_id
                      and (select staff_access()) = 'gkk_leader' and h.gkk = (select staff_gkk())));

-- ---------------------------------------------------------------------------
-- Duplicates
-- ---------------------------------------------------------------------------

/** True when every one of `ids` is a member of the signed-in GKK leader's GKK. */
create or replace function public.members_in_leader_gkk(ids integer[]) returns boolean
language sql stable security definer set search_path = public as $$
  select staff_access() = 'gkk_leader' and cardinality(ids) > 0 and not exists (
    select 1 from unnest(ids) as x
    where not exists (select 1 from members m join households h on h.id = m.household_id
                      where m.id = x and h.gkk = staff_gkk()));
$$;
revoke execute on function public.members_in_leader_gkk(integer[]) from public, anon;
grant execute on function public.members_in_leader_gkk(integer[]) to authenticated;

alter policy duplicate_dismissals_admin_select on duplicate_dismissals
  using ((select staff_can_see('registry')) or members_in_leader_gkk(member_ids));

-- Staff can't write this table directly (0010), only through
-- dismiss_duplicate_group below, which checks who may dismiss what. 0014's
-- "admin" write guard refused every GKK leader there, so it goes.
drop trigger if exists trg_00_guard_staff_write on duplicate_dismissals;

-- As in 0010, plus: a GKK leader only dismisses members of their GKK, and
-- read-only and website staff (who can't change records) none.
create or replace function public.dismiss_duplicate_group(p_member_ids integer[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  staff_name text;
  ids integer[];
begin
  select coalesce(nullif(trim(p.name), ''), u.email) into staff_name
  from profiles p join auth.users u on u.id = p.id
  where p.id = auth.uid();
  if staff_name is null then raise exception 'Only parish staff can dismiss possible duplicates'; end if;

  select array_agg(distinct x order by x) into ids from unnest(p_member_ids) as x where x is not null;
  if coalesce(array_length(ids, 1), 0) < 2 then raise exception 'Choose at least two members'; end if;

  if staff_access() in ('read_only', 'website') then
    raise exception 'Your account can view records but not change them' using errcode = '42501';
  end if;
  if staff_access() = 'gkk_leader' and not members_in_leader_gkk(ids) then
    raise exception 'Your account can only review the members of %', staff_gkk() using errcode = '42501';
  end if;

  insert into duplicate_dismissals (member_ids, dismissed_by, dismissed_by_name)
  values (ids, auth.uid(), staff_name)
  on conflict (member_ids) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- The GKK list behind every GKK filter: a leader's own GKK only
-- ---------------------------------------------------------------------------

-- As in 0010, with the GKK list limited for GKK leaders.
create or replace function public.admin_list_counts(p_list text, p_gkk text default null)
returns table (name text, n integer)
language plpgsql stable set search_path = public as $$
begin
  if p_list = 'gkks' then
    return query
      select g.name, (select count(*)::int from households h where h.gkk = g.name)
      from gkks g
      where staff_access() is distinct from 'gkk_leader' or g.name = staff_gkk()
      order by g.name;
  elsif p_list in ('ministries', 'organizations') then
    return query execute format(
      'select l.name, (select count(*)::int from members m join households h on h.id = m.household_id
                        where l.name = any(m.%I) and member_is_current(m.membership_status)
                          and ($1 is null or h.gkk = $1))
       from %I l order by l.name', p_list, p_list)
      using p_gkk;
  elsif p_list = 'parish_positions' then
    return query
      select p.name, (select count(*)::int from members m where m.parish_role = p.name)
      from parish_positions p order by p.name;
  else
    raise exception 'Unknown list: %', p_list;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Blood types: not for GKK leaders
-- ---------------------------------------------------------------------------

-- As in 0010, with the blood types left out for a GKK leader.
create or replace function public.admin_report_stats() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'households', (select count(*) from households),
    'verified',   (select count(*) from households where status = 'Verified'),
    'pending',    (select count(*) from households where status = 'Pending'),
    'members',    (select count(*) from members where member_is_current(membership_status)),
    'by_gkk', (
      select coalesce(jsonb_agg(jsonb_build_object('label', t.gkk, 'verified', t.verified, 'pending', t.pending) order by t.gkk), '[]'::jsonb)
      from (
        select gkk, count(*) filter (where status = 'Verified') as verified, count(*) filter (where status = 'Pending') as pending
        from households where gkk is not null group by gkk
      ) t
    ),
    'sacraments', (
      select jsonb_build_object(
        'baptism', count(*) filter (where has_baptism),
        'communion', count(*) filter (where has_communion),
        'confirmation', count(*) filter (where has_confirmation),
        'matrimony', count(*) filter (where has_matrimony))
      from members where member_is_current(membership_status)
    ),
    'participation', (
      select coalesce(jsonb_agg(jsonb_build_object('label', t.g, 'n', t.n) order by t.n desc, t.g), '[]'::jsonb)
      from (
        select g, count(distinct m.id) as n
        from members m, unnest(m.ministries || m.organizations) as g
        where member_is_current(m.membership_status)
        group by g
      ) t
    ),
    'any_group', (select count(*) from members
                  where member_is_current(membership_status) and (cardinality(ministries) > 0 or cardinality(organizations) > 0)),
    'blood', case when staff_access() = 'gkk_leader' then '{}'::jsonb else (
      select coalesce(jsonb_object_agg(blood_type, n), '{}'::jsonb)
      from (select blood_type, count(*) as n from members
            where member_is_current(membership_status) and coalesce(blood_type, '') <> '' group by blood_type) t
    ) end,
    'blood_unknown', case when staff_access() = 'gkk_leader' then 0 else
      (select count(*) from members where member_is_current(membership_status) and coalesce(blood_type, '') = '') end
  );
$$;

-- A GKK leader's changes keep a member's blood type as it was. (The admin
-- doesn't show them the field. A family registering on the public form,
-- even on a leader's signed-in phone, still gives its own.)
create or replace function public.members_leader_keep_blood_type() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if staff_access() = 'gkk_leader' then
    new.blood_type := old.blood_type;
  end if;
  return new;
end;
$$;
revoke execute on function public.members_leader_keep_blood_type() from public, anon, authenticated;

drop trigger if exists trg_members_leader_keep_blood_type on members;
create trigger trg_members_leader_keep_blood_type before update on members
  for each row execute function members_leader_keep_blood_type();
