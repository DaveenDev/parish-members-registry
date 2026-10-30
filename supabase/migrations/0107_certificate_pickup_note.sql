-- Certificate requests: how the requester will pick the certificate up, and
-- a note from the office about the processing time and fee. Run after
-- 0106_sacrament_milestones.sql. Safe to re-run.
--
-- * certificate_requests.pickup: "Ako mismo" (I'll come), "Ang akong
--   representante" (someone I send, with a letter and ID) or "Ipadala sa
--   courier" (the office sends it); the office sees it in the Requests inbox.
-- * parish_settings.certificate_note: what the office says on the request
--   form, set in Parish Website → Office & Contact ("Kasagarang 3 ka adlaw
--   ang pag-andam. Donasyon: ₱100 kada kopya."). Blank shows nothing: the
--   fee is the parish's own to publish. public_office_details() carries it.

alter table certificate_requests add column if not exists pickup text;
alter table parish_settings add column if not exists certificate_note text not null default '';

create or replace function public.website_office_fields() returns text[]
language sql immutable as $$
  select array['address', 'contact', 'email', 'mobile', 'facebook_url', 'sick_call_contact', 'directions',
               'map_url', 'secretary_messenger', 'office_hours', 'latitude', 'longitude', 'certificate_note'];
$$;

create or replace function public.public_office_details() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'name', name, 'address', address, 'contact', contact, 'email', email,
    'mobile', mobile, 'facebook_url', facebook_url, 'sick_call_contact', sick_call_contact,
    'directions', directions, 'map_url', map_url, 'latitude', latitude, 'longitude', longitude,
    'office_hours', office_hours, 'secretary_messenger', secretary_messenger,
    'certificate_note', nullif(trim(certificate_note), '')
  ) from parish_settings where id = 1;
$$;

grant execute on function public.public_office_details() to anon, authenticated;

create or replace function public.submit_certificate_request(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ctype text := payload_text(payload, 'certType', 20);
  pick text := payload_text(payload, 'pickup', 60);
  saved certificate_requests;
begin
  if payload_text(payload, 'website') is not null then
    return jsonb_build_object('ref_no', generate_request_ref('CR'));
  end if;
  if coalesce((payload->>'consent')::boolean, false) is not true then
    raise exception 'Palihug i-check ang pagtugot (consent) sa dili pa ipadala.';
  end if;
  if ctype is null or ctype not in ('baptism', 'confirmation', 'matrimony') then
    raise exception 'Palihug pilia ang klase sa sertipiko.';
  end if;
  if payload_text(payload, 'subjectFirstName') is null or payload_text(payload, 'subjectLastName') is null then
    raise exception 'Palihug isulat ang ngalan sa tawo nga anaa sa sertipiko.';
  end if;
  if payload_text(payload, 'requesterName') is null then
    raise exception 'Palihug isulat ang inyong ngalan.';
  end if;
  if pick is not null and pick not in ('Ako mismo', 'Ang akong representante', 'Ipadala sa courier') then
    pick := null;
  end if;
  perform public_request_guard('certificate', 5, 200);

  insert into certificate_requests (
    cert_type, subject_first_name, subject_middle_name, subject_last_name, subject_birth_date,
    sacrament_date, sacrament_year, sacrament_place, father_name, mother_name, spouse_name,
    purpose, copies, requester_name, requester_mobile, requester_email, relationship, message, pickup
  ) values (
    ctype,
    payload_text(payload, 'subjectFirstName', 80), payload_text(payload, 'subjectMiddleName', 80), payload_text(payload, 'subjectLastName', 80),
    nullif(payload->>'subjectBirthDate', '')::date,
    nullif(payload->>'sacramentDate', '')::date,
    nullif(payload->>'sacramentYear', '')::smallint,
    payload_text(payload, 'sacramentPlace', 150),
    payload_text(payload, 'fatherName', 120), payload_text(payload, 'motherName', 120), payload_text(payload, 'spouseName', 120),
    payload_text(payload, 'purpose', 150),
    greatest(1, least(10, coalesce(nullif(payload->>'copies', '')::smallint, 1))),
    payload_text(payload, 'requesterName', 120),
    require_mobile(payload_text(payload, 'requesterMobile', 30)),
    payload_text(payload, 'requesterEmail', 120),
    payload_text(payload, 'relationship', 60),
    payload_text(payload, 'message', 1000),
    pick
  ) returning * into saved;

  return jsonb_build_object('ref_no', saved.ref_no);
end;
$$;
