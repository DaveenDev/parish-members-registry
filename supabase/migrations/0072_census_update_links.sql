-- Census update notifications open Census → Online updates on that
-- household, not the Households tab (where the update had to be found by
-- hand). Older notifications get the same link. Run after
-- 0071_member_service_history.sql. Safe to re-run.

do $$
begin
  if to_regprocedure('public.notify_new_request()') is null then
    raise exception 'Run 0034_staff_notifications.sql before this migration';
  end if;
end;
$$;

-- As in 0066, with the census update link on the Online updates tab.
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
        concat_ws(' · ', hh.household_name, hh.gkk),
        '/admin/census?tab=updates' || coalesce('&q=' || hh.ref_no, ''));

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

update staff_notifications set link = '/admin/census?tab=updates' || coalesce('&q=' || ref_no, '')
where kind = 'census' and link = '/admin/census';
