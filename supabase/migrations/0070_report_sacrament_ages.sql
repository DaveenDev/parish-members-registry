-- Reports → Report Stats: Sacramental Completion counts each sacrament's
-- "not yet" among members old enough for it, so babies no longer count as
-- missing Confirmation and children as missing Matrimony. Ages follow the
-- registration form (First Communion and Confirmation from 7) and 18 for
-- Matrimony; members with no birth date still count. Run after
-- 0069_history_body_photo.sql. Safe to re-run.

do $$
begin
  if to_regclass('public.member_blood_types') is null or to_regprocedure('public.member_is_current(text)') is null then
    raise exception 'Run the migrations up to 0062_access_hardening.sql before this one';
  end if;
end;
$$;

-- True when someone born on p_dob is at least p_years old today, or the
-- birth date isn't known.
create or replace function public.report_age_at_least(p_dob date, p_years integer) returns boolean
language sql stable set search_path = public as $$
  select p_dob is null or p_dob <= (current_date - make_interval(years => p_years))::date;
$$;

-- As in 0062, with sacrament_eligible and sacrament_missing.
CREATE OR REPLACE FUNCTION public.admin_report_stats()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
    -- Members old enough for each sacrament (no birth date: can't be ruled
    -- out), and how many of them haven't received it.
    'sacrament_eligible', (
      select jsonb_build_object(
        'baptism', count(*),
        'communion', count(*) filter (where report_age_at_least(dob, 7)),
        'confirmation', count(*) filter (where report_age_at_least(dob, 7)),
        'matrimony', count(*) filter (where report_age_at_least(dob, 18)))
      from members where member_is_current(membership_status)
    ),
    'sacrament_missing', (
      select jsonb_build_object(
        'baptism', count(*) filter (where not has_baptism),
        'communion', count(*) filter (where not has_communion and report_age_at_least(dob, 7)),
        'confirmation', count(*) filter (where not has_confirmation and report_age_at_least(dob, 7)),
        'matrimony', count(*) filter (where not has_matrimony and report_age_at_least(dob, 18)))
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
      from (select b.blood_type, count(*) as n from members m join member_blood_types b on b.member_id = m.id
            where member_is_current(m.membership_status) and coalesce(b.blood_type, '') <> '' group by b.blood_type) t
    ) end,
    'blood_unknown', case when staff_access() = 'gkk_leader' then 0 else
      (select count(*) from members m where member_is_current(m.membership_status)
         and not exists (select 1 from member_blood_types b where b.member_id = m.id and coalesce(b.blood_type, '') <> '')) end
  );
$function$;
