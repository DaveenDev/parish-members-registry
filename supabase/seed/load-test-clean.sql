-- Remove everything supabase/seed/load-test.sql added, and nothing else.
-- Matches only the seed's markers:
--   households            previous_ref_no 'SEED-%' (members, sacrament verifications,
--                         census answers / submissions / snapshots and access
--                         codes go with them, by cascade)
--   requests              ref_no 'SEED-%'
--   blood donors          notes 'Load-test seed'
--   website content       title starting '[Test] '
-- The activity log is skipped, as when seeding.
--
-- Run: paste into the SQL Editor of the project that was seeded (the training
-- site's: deploy/02-staging.md). npm run db:clean-load runs it on the
-- training project. The GKKs the seed added stay.

do $$
begin
  perform set_config('app.audit_skip', 'on', true);  -- this statement only: kept out of the activity log

-- Donor links first, then donors, and requests before households, because
-- donors and certificate requests can point at a seeded member.
delete from blood_request_contacts
where request_id in (select id from blood_requests where ref_no like 'SEED-%')
   or donor_id in (select id from blood_donors where notes = 'Load-test seed');
delete from blood_donors where notes = 'Load-test seed';
delete from blood_requests where ref_no like 'SEED-%';
delete from certificate_requests where ref_no like 'SEED-%';
delete from sacrament_requests where ref_no like 'SEED-%';

delete from announcements where title like '[Test] %';
delete from articles where title like '[Test] %';
delete from bulletins where title like '[Test] %';
delete from events where title like '[Test] %';

-- Activity-log entries for the test households. A seed run in the SQL Editor
-- before October 2026 wasn't kept out of the log; those entries have no staff
-- account (actor), unlike anything a staff member did.
delete from activity_log
where actor is null
  and household_id in (select id from households where previous_ref_no like 'SEED-%' or ref_no like 'SEED-%');

delete from households where previous_ref_no like 'SEED-%' or ref_no like 'SEED-%';

end;
$$;

select (select count(*) from households where previous_ref_no like 'SEED-%' or ref_no like 'SEED-%') as households_left,
       (select count(*) from certificate_requests where ref_no like 'SEED-%')
     + (select count(*) from sacrament_requests where ref_no like 'SEED-%')
     + (select count(*) from blood_requests where ref_no like 'SEED-%') as requests_left,
       (select count(*) from blood_donors where notes = 'Load-test seed') as donors_left,
       (select count(*) from announcements where title like '[Test] %')
     + (select count(*) from articles where title like '[Test] %')
     + (select count(*) from bulletins where title like '[Test] %')
     + (select count(*) from events where title like '[Test] %') as website_items_left,
       (select count(*) from households) as households_now;
