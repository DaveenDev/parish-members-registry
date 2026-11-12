-- One more occupation group, 'Hotel, restaurant or cleaning', so the public
-- forms' Category list can follow the OFW answer: someone abroad now or a
-- former OFW picks from the kinds of work OFWs do (domestic helper,
-- seaman, construction, factory, hotel and restaurant, nurse…), everyone
-- else from the common kinds of work at home. The two lists are kept in
-- the app (OFW_OCCUPATION_GROUPS and LOCAL_OCCUPATION_GROUPS in
-- client/src/constants.js); the database keeps one list of every group, so
-- the reports count them together. Run after 0122_ofw_work_fields.sql.
-- Safe to re-run.
--
-- members_occupation_group_check, the registration functions, the census
-- portal and Report Stats all read occupation_groups(), so nothing else
-- changes. No member's group changes.

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'members' and column_name = 'ofw_country') then
    raise exception 'Run the migrations up to 0122_ofw_work_fields.sql before this one';
  end if;
end;
$$;

-- Keep in step with OCCUPATION_GROUPS in client/src/constants.js.
create or replace function public.occupation_groups() returns text[]
language sql immutable as $$
  select array['Farming or fishing', 'Business or vendor', 'Driver or transport', 'Construction or skilled trade',
               'Factory or labourer', 'Office or sales staff', 'Teacher', 'Health worker', 'Government, police or military',
               'Seafarer', 'Household service or caregiver', 'Hotel, restaurant or cleaning', 'Professional', 'Student',
               'Homemaker', 'Retired', 'Looking for work', 'Other'];
$$;
