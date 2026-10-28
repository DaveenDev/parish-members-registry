-- Status check for sacrament requests (OCIA, Anointing of the Sick; 0032)
-- by reference number (SR-…), for the website's "Susiha" box on Mga
-- Serbisyo. Like certificate_request_status (0012): no names or contact
-- details, and the same rate limit. Run after 0032_sacrament_requests.sql.
-- Safe to re-run.

create or replace function public.sacrament_request_status(p_ref text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r sacrament_requests;
begin
  perform public_request_guard('status', 30, 2000);
  select * into r from sacrament_requests where ref_no = upper(trim(coalesce(p_ref, '')));
  if not found then return null; end if;
  return jsonb_build_object(
    'ref_no', r.ref_no,
    'sacrament', r.sacrament,
    'status', r.status,
    'requested_on', (r.created_at at time zone 'Asia/Manila')::date,
    'updated_on', (r.status_changed_at at time zone 'Asia/Manila')::date,
    'scheduled_on', r.scheduled_on
  );
end;
$$;

grant execute on function public.sacrament_request_status(text) to anon, authenticated;
