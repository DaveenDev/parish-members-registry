-- Registration notifications that still find the household once it is
-- verified, and indexes for GKK leaders' census access checks. Run after
-- 0065_new_logins_no_access.sql. Safe to re-run.
--
--   * A new-registration notification linked to the household on the
--     Households page's Pending tab, so once the household was verified the
--     link showed "No households found". It now opens the All tab; older
--     notifications get the same link.
--   * A GKK leader reads census submissions and snapshots through their
--     household (0062), and notifications by GKK: those columns get an index.

do $$
begin
  if to_regprocedure('public.notify_new_request()') is null then
    raise exception 'Run 0034_staff_notifications.sql before this migration';
  end if;
end;
$$;

-- As in 0037, with the household link on the All tab.
create or replace function public.notify_new_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r jsonb := to_jsonb(new);
  hh households;
begin
  if coalesce(auth.role(), '') <> 'anon' then
    return new;
  end if;

  begin
    case tg_table_name
    when 'certificate_requests' then
      insert into staff_notifications (kind, area, ref_no, title, detail, link)
      values ('certificate', 'requests', (r->>'ref_no'),
        'Certificate request: ' || case r->>'cert_type' when 'baptism' then 'Baptismal' when 'confirmation' then 'Confirmation'
                                                        when 'matrimony' then 'Marriage' else coalesce(r->>'cert_type', '') end,
        concat_ws(' ', r->>'subject_first_name', r->>'subject_last_name'),
        '/admin/requests?q=' || (r->>'ref_no'));

    when 'sacrament_requests' then
      if r->>'sacrament' = 'anointing' then
        insert into staff_notifications (kind, area, ref_no, title, detail, link, urgent)
        values ('anointing', 'requests', (r->>'ref_no'),
          case when (r->>'urgent')::boolean then 'Anointing of the Sick: gravely ill' else 'Anointing of the Sick request' end,
          concat_ws(' · ', r->>'person_name', r->>'location'),
          '/admin/requests?tab=sacraments&q=' || (r->>'ref_no'), true);
      else
        insert into staff_notifications (kind, area, ref_no, title, detail, link)
        values ('ocia', 'requests', (r->>'ref_no'), 'OCIA enrolment',
          r->>'person_name', '/admin/requests?tab=sacraments&q=' || (r->>'ref_no'));
      end if;

    when 'blood_requests' then
      insert into staff_notifications (kind, area, ref_no, title, detail, link, urgent)
      values ('blood', 'requests', (r->>'ref_no'), 'Blood request: ' || coalesce(r->>'blood_type', ''),
        concat_ws(' · ', r->>'patient_name', r->>'hospital'), '/admin/requests?tab=blood', true);

    when 'households' then
      insert into staff_notifications (kind, area, gkk, ref_no, title, detail, link)
      values ('registration', 'registry', r->>'gkk', (r->>'ref_no'), 'New household registration',
        concat_ws(' · ', r->>'household_name', r->>'gkk'),
        '/admin/households?status=All&q=' || (r->>'ref_no'));

    when 'census_submissions' then
      select * into hh from households where id = (r->>'household_id')::integer;
      insert into staff_notifications (kind, area, gkk, ref_no, title, detail, link)
      values ('census', 'registry', hh.gkk, hh.ref_no, 'Census update to review',
        concat_ws(' · ', hh.household_name, hh.gkk), '/admin/census');

    when 'blood_donors' then
      insert into staff_notifications (kind, area, gkk, title, detail, link)
      values ('donor', 'requests', r->>'gkk', 'New blood donor' || coalesce(': ' || (r->>'blood_type'), ''),
        concat_ws(' · ', r->>'full_name', r->>'gkk'), '/admin/requests?tab=blood');

    else
      null;
    end case;
  exception when others then
    raise warning 'notify_new_request on %: %', tg_table_name, sqlerrm;
  end;
  return new;
end;
$function$;

update staff_notifications set link = replace(link, '/admin/households?status=Pending&q=', '/admin/households?status=All&q=')
where link like '/admin/households?status=Pending&q=%';

create index if not exists census_submissions_household_idx on census_submissions (household_id);
create index if not exists census_household_snapshots_household_idx on census_household_snapshots (household_id);
create index if not exists staff_notifications_gkk_idx on staff_notifications (gkk);
create index if not exists certificate_requests_member_idx on certificate_requests (member_id);
