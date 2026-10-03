-- Load-test seed: line up each test member's census status (the "Active" /
-- "Inactive" badge beside their name) with their Practicing Catholic score.
--
-- The seed used to pick the census status at random, so a member could score
-- 39% "Dili aktibo" and still carry an "Active" badge. This sets it from the
-- score the admin panel shows (members_with_household.practice_level):
--   Dili aktibo        -> Inactive
--   Aktibo, Panagsa    -> Active
-- Only "Active" and "Inactive" are changed; moved away and deceased members,
-- children ("Bata pa"), members of another religion and members not yet
-- rated keep theirs. Their census answer in the open census gets the same
-- status. Only test data (SEED- households); nothing real is touched.
--
-- Run:  npm run db:fix-load-status
-- (load-test.sql does the same at its end, so a fresh seed needs no fix.)
-- Safe to run again: a second run changes nothing.

begin;

-- No activity-log entries for test data, as in load-test.sql.
set local app.audit_skip = 'on';

create temp table seed_status_fix on commit drop as
select v.id as member_id,
       case v.practice_level when 'Dili aktibo' then 'Inactive' when 'Aktibo' then 'Active' when 'Panagsa' then 'Active' end as status
from members_with_household v
join households h on h.id = v.household_id
where h.ref_no like 'SEED-%'
  and v.membership_status in ('Active', 'Inactive');

delete from seed_status_fix f
using members m
where m.id = f.member_id and (f.status is null or m.membership_status = f.status);

update members m
set membership_status = f.status, status_updated_at = now()
from seed_status_fix f
where m.id = f.member_id;

update census_member_responses r
set status = f.status
from seed_status_fix f
where r.member_id = f.member_id and r.status in ('Active', 'Inactive') and r.status <> f.status;

commit;

-- What the test members look like now (the last statement's rows are what the CLI prints).
select count(*) filter (where v.practice_level = 'Dili aktibo' and v.membership_status = 'Active') as dili_aktibo_but_active,
       count(*) filter (where v.practice_level in ('Aktibo', 'Panagsa') and v.membership_status = 'Inactive') as active_score_but_inactive,
       count(*) filter (where v.membership_status = 'Active') as active,
       count(*) filter (where v.membership_status = 'Inactive') as inactive
from members_with_household v
join households h on h.id = v.household_id
where h.ref_no like 'SEED-%';
