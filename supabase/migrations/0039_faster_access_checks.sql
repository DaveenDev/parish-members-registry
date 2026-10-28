-- Faster access checks: every admin page loads faster with no change to who
-- sees what. Run after 0038_men_only_ministries.sql. Safe to re-run.
--
-- The access rules (0014) call staff_can_see(), staff_sees_gkk(),
-- staff_access() and staff_gkk() inside each row's check. Each call looks up
-- the signed-in account in profiles, so a query over 2,000 members made
-- thousands of lookups: about 1 s per members count with 500 households, and
-- the Dashboard runs fifteen of them. Wrapped in (select ...), Postgres works
-- the answer out once per query and reuses it for every row.
--
-- staff_sees_gkk(gkk) is written out in full below for the same reason (it
-- takes the row's GKK, so it can't be wrapped as a whole). The functions
-- themselves are unchanged and still used elsewhere.
--
-- members_with_household worked out each member's last census and practice
-- details in its FROM list, so even a count or one page of 20 did that for
-- every member. Those columns now come from the select list (the practice
-- ones through member_practice()), which Postgres skips when a query doesn't
-- use them and works out only for the rows it returns. Same columns, types
-- and values. The sidebar counts also count waiting sacrament claims from
-- the tables instead of the view.

-- ---------------------------------------------------------------------------
-- Registry: households, members, sacrament verifications
-- ---------------------------------------------------------------------------

alter policy households_admin_all on households
  using ((select staff_can_see('registry'))
         or ((select staff_access()) = 'gkk_leader' and gkk = (select staff_gkk())));

alter policy members_admin_all on members
  using ((select staff_can_see('registry'))
         or exists (select 1 from households h
                    where h.id = members.household_id
                      and (select staff_access()) = 'gkk_leader' and h.gkk = (select staff_gkk())));

alter policy sacrament_verifications_admin_select on sacrament_verifications
  using ((select staff_can_see('registry'))
         or exists (select 1 from members m join households h on h.id = m.household_id
                    where m.id = sacrament_verifications.member_id
                      and (select staff_access()) = 'gkk_leader' and h.gkk = (select staff_gkk())));

alter policy census_household_snapshots_admin_select on census_household_snapshots using ((select staff_can_see('registry')));
alter policy census_member_responses_admin_select on census_member_responses using ((select staff_can_see('registry')));
alter policy census_submissions_admin_select on census_submissions using ((select staff_can_see('registry')));
alter policy duplicate_dismissals_admin_select on duplicate_dismissals using ((select staff_can_see('registry')));
alter policy household_access_codes_admin_select on household_access_codes using ((select staff_access()) = 'full');

-- ---------------------------------------------------------------------------
-- Requests, activity log, trash
-- ---------------------------------------------------------------------------

alter policy certificate_requests_admin_all on certificate_requests using ((select staff_can_see('requests')));
alter policy sacrament_requests_admin_all on sacrament_requests using ((select staff_can_see('requests')));
alter policy blood_requests_admin_all on blood_requests using ((select staff_can_see('requests')));
alter policy blood_request_contacts_admin_all on blood_request_contacts using ((select staff_can_see('requests')));
alter policy blood_donors_admin_all on blood_donors using ((select staff_can_see('requests')));
alter policy activity_log_staff_select on activity_log using ((select staff_can_see('activity')));
alter policy deleted_records_staff_select on deleted_records using ((select staff_can_see('trash')));

-- ---------------------------------------------------------------------------
-- Own rows: profile, notifications
-- ---------------------------------------------------------------------------

alter policy profiles_select_own on profiles using (id = (select auth.uid()));
alter policy staff_notify_prefs_own on staff_notify_prefs
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy staff_push_subscriptions_own on staff_push_subscriptions
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy staff_notifications_select on staff_notifications
  using (notification_visible_to((select staff_access()), (select staff_gkk()), area, gkk));

-- ---------------------------------------------------------------------------
-- members_with_household: census and practice details only where used
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'member_practice_t' and typnamespace = 'public'::regnamespace) then
    create type public.member_practice_t as (
      score numeric, level text, participation numeric, sacraments numeric, involvement numeric,
      source text, source_label text, trend numeric);
  end if;
end $$;

-- A member's Practicing Catholic score and where it came from (0017): the
-- latest census answers with participation, else the household's survey.
-- PL/pgSQL so its queries are planned once per session, not on every call.
create or replace function public.member_practice(m members, household_participation jsonb)
returns member_practice_t
language plpgsql stable set search_path = public as $$
declare
  cur_part jsonb;
  cur_label text;
  prev_part jsonb;
  v_age int := case when m.dob is null then null else date_part('year', age(m.dob::timestamptz))::int end;
  v_part numeric;
  v_sac numeric;
  v_inv numeric;
  v_score numeric;
  result member_practice_t;
begin
  select r.participation, c.label into cur_part, cur_label
  from census_member_responses r join census_cycles c on c.id = r.cycle_id
  where r.member_id = m.id and practice_participation_points(r.participation) is not null
  order by r.cycle_id desc limit 1;
  -- The census before it, for the trend (only needed when there is a latest one).
  if cur_part is not null then
    select r.participation into prev_part
    from census_member_responses r
    where r.member_id = m.id and practice_participation_points(r.participation) is not null
    order by r.cycle_id desc offset 1 limit 1;
  end if;

  v_part := practice_participation_points(coalesce(cur_part, household_participation));
  v_sac := practice_sacrament_points(v_age, m.has_baptism, m.has_communion, m.has_confirmation);
  v_inv := practice_involvement_points(m.ministries, m.organizations, m.gkk_role, m.parish_role);
  v_score := case when v_part is null then null else v_part + v_sac + v_inv end;

  result := (
    v_score,
    practice_level(v_score, v_part, v_age, m.religion, member_is_current(m.membership_status)),
    v_part, v_sac, v_inv,
    case when cur_part is not null then 'census' when v_part is not null then 'household' end,
    cur_label,
    case when cur_part is not null and prev_part is not null
         then round(v_part - practice_participation_points(prev_part), 1) end);
  return result;
end;
$$;

create or replace view members_with_household with (security_invoker = true) as
select m.id, m.household_id, m.first_name, m.middle_name, m.last_name, m.relationship, m.sex, m.dob,
  m.place_of_birth, m.civil_status, m.contact, m.email, m.occupation, m.religion, m.blood_type,
  m.has_baptism, m.baptism_date, m.baptism_church, m.has_communion, m.communion_date, m.communion_church,
  m.has_confirmation, m.conf_date, m.conf_church, m.conf_name, m.conf_sponsor,
  m.has_matrimony, m.mat_date, m.mat_church, m.mat_type, m.ministries, m.organizations, m.created_at,
  m.suffix, m.tribe, m.gkk_role, m.parish_role, m.membership_status, m.status_updated_at, m.updated_at,
  h.household_name, h.status as household_status, h.gkk as household_gkk,
  h.street, h.barangay, h.city, h.province, h.zip,
  case when m.dob is null then null::integer else date_part('year', age(m.dob::timestamptz))::integer end as age,
  (m.first_name || ' ') || m.last_name as full_name,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'baptism') as baptism_verified,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'communion') as communion_verified,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'confirmation') as confirmation_verified,
  exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = 'matrimony') as matrimony_verified,
  coalesce(m.membership_status <> all (array['Moved away', 'Deceased']), true) as is_current,
  (select r.cycle_id from census_member_responses r join census_cycles c on c.id = r.cycle_id
    where r.member_id = m.id order by r.cycle_id desc limit 1) as last_census_cycle_id,
  (select c.label from census_member_responses r join census_cycles c on c.id = r.cycle_id
    where r.member_id = m.id order by r.cycle_id desc limit 1) as last_census_label,
  (select r.confirmed_at from census_member_responses r join census_cycles c on c.id = r.cycle_id
    where r.member_id = m.id order by r.cycle_id desc limit 1) as last_confirmed_at,
  exists (select 1 from census_member_responses r where r.member_id = m.id and r.cycle_id = census_reference_cycle_id()) as census_confirmed,
  (member_practice(m, h.participation)).score as practice_score,
  (member_practice(m, h.participation)).level as practice_level,
  (member_practice(m, h.participation)).participation as practice_participation,
  (member_practice(m, h.participation)).sacraments as practice_sacraments,
  (member_practice(m, h.participation)).involvement as practice_involvement,
  (member_practice(m, h.participation)).source as practice_source,
  (member_practice(m, h.participation)).source_label as practice_source_label,
  (member_practice(m, h.participation)).trend as practice_trend
from members m
join households h on h.id = m.household_id;

grant select on members_with_household to authenticated;

-- ---------------------------------------------------------------------------
-- Sidebar counts (every admin page): sacrament claims waiting, from the tables
-- ---------------------------------------------------------------------------

create or replace function public.admin_nav_counts() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'pending_households', (select count(*) from households where status = 'Pending'),
    'duplicate_groups', case when (select staff_can_see('registry')) then jsonb_array_length(find_duplicate_members()) else 0 end,
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
