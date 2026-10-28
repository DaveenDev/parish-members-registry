-- Prayer requests are no longer offered: the website form was replaced by
-- the anointing schedule request, and the admin's Prayer Requests tab is
-- gone. Run after 0032_sacrament_requests.sql. Safe to re-run.
--
-- This removes the public ways in (the submit and public-list functions)
-- and the sidebar count. The prayer_requests table and the intentions
-- already saved in it are kept; staff can still read them in the Supabase
-- table editor. To delete them for good, run:
--   drop table if exists prayer_requests cascade;

drop function if exists public.submit_prayer_request(jsonb);
drop function if exists public.public_prayer_intentions();

-- Sidebar badge (0012, 0032) without prayer requests.
create or replace function public.request_inbox_counts() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'certificates', (select count(*) from certificate_requests where status in ('Received', 'Being prepared')),
    'ready', (select count(*) from certificate_requests where status = 'Ready for pick-up'),
    'blood', (select count(*) from blood_requests where status in ('Open', 'Contacting donors')),
    'sacraments', (select count(*) from sacrament_requests where status = 'New')
  );
$$;

revoke all on function public.request_inbox_counts() from public, anon;
grant execute on function public.request_inbox_counts() to authenticated;
