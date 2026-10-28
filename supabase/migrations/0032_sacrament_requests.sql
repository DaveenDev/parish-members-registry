-- Requests to avail of a sacrament from the website's Misa ug Sakramento
-- page: joining OCIA, or Pagdihog sa Masakiton (Anointing of the Sick) for
-- someone who is ill. Staff see them under Requests → Sacraments. Run after
-- 0014_roles_activity_trash.sql and 0031_sacrament_guides_anointing.sql.
-- Safe to re-run.
--
-- Like the other requests (0012): staff only through row level security,
-- the public goes through submit_sacrament_request(), reference numbers
-- start with SR, and website-only staff may handle them (0014).

create table if not exists sacrament_requests (
  id                serial primary key,
  ref_no            text unique,
  sacrament         text not null check (sacrament in ('ocia', 'anointing')),
  person_name       text not null,  -- who will receive the sacrament
  baptism_status    text,           -- OCIA: baptized yet, and where
  location          text,           -- Anointing: where the sick person is; OCIA: address or GKK
  preferred_date    date,
  urgent            boolean not null default false,  -- Anointing: the person is gravely ill
  requester_name    text not null,
  requester_mobile  text not null,
  relationship      text,
  message           text,
  status            text not null default 'New'
                    check (status in ('New', 'Contacted', 'Scheduled', 'Done', 'Cancelled')),
  source            text not null default 'Online' check (source in ('Online', 'Walk-in', 'Phone')),
  scheduled_on      date,           -- the priest's visit, or the first OCIA session
  staff_notes       text,
  status_changed_at timestamptz not null default now(),
  handled_by        uuid references auth.users(id) on delete set null,
  handled_by_name   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists sacrament_requests_status_idx on sacrament_requests (status, created_at desc);

drop trigger if exists trg_sacrament_requests_ref on sacrament_requests;
create trigger trg_sacrament_requests_ref before insert on sacrament_requests
for each row execute function public.requests_set_ref_no('SR');

drop trigger if exists trg_sacrament_requests_stamp on sacrament_requests;
create trigger trg_sacrament_requests_stamp before update on sacrament_requests
for each row execute function public.requests_stamp();

-- Who may change them (0014): full access and website staff.
drop trigger if exists trg_00_guard_staff_write on sacrament_requests;
create trigger trg_00_guard_staff_write before insert or update or delete on sacrament_requests
for each row execute function guard_staff_write('requests');

alter table sacrament_requests enable row level security;
drop policy if exists sacrament_requests_admin_all on sacrament_requests;
create policy sacrament_requests_admin_all on sacrament_requests for all to authenticated
  using (staff_can_see('requests')) with check (true);
revoke all on sacrament_requests from anon;
grant select, insert, update, delete on sacrament_requests to authenticated;
grant usage, select on sequence sacrament_requests_id_seq to authenticated;

-- Public submit: returns { ref_no }. Errors are in Bisaya for the website.
create or replace function public.submit_sacrament_request(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  kind text := payload_text(payload, 'sacrament', 20);
  saved sacrament_requests;
begin
  -- The hidden "website" field is only filled in by bots.
  if payload_text(payload, 'website') is not null then
    return jsonb_build_object('ref_no', generate_request_ref('SR'));
  end if;
  if kind is null or kind not in ('ocia', 'anointing') then
    raise exception 'Wala mailhi ang sakramento.';
  end if;
  if payload_text(payload, 'personName') is null then
    raise exception 'Palihug isulat ang ngalan.';
  end if;
  if payload_text(payload, 'requesterName') is null then
    raise exception 'Palihug isulat ang imong ngalan.';
  end if;
  perform require_mobile(payload_text(payload, 'requesterMobile', 30));
  perform public_request_guard('sacrament', 5, 200);

  insert into sacrament_requests (
    sacrament, person_name, baptism_status, location, preferred_date, urgent,
    requester_name, requester_mobile, relationship, message
  ) values (
    kind,
    payload_text(payload, 'personName', 120),
    payload_text(payload, 'baptismStatus', 80),
    payload_text(payload, 'location', 200),
    case when payload_text(payload, 'preferredDate', 10) ~ '^\d{4}-\d{2}-\d{2}$'
         then (payload->>'preferredDate')::date end,
    coalesce((payload->>'urgent')::boolean, false),
    payload_text(payload, 'requesterName', 120),
    payload_text(payload, 'requesterMobile', 30),
    payload_text(payload, 'relationship', 60),
    payload_text(payload, 'message', 1000)
  ) returning * into saved;

  return jsonb_build_object('ref_no', saved.ref_no);
end;
$$;

grant execute on function public.submit_sacrament_request(jsonb) to anon, authenticated;

-- Sidebar badge (0012), now with new sacrament requests.
create or replace function public.request_inbox_counts() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'certificates', (select count(*) from certificate_requests where status in ('Received', 'Being prepared')),
    'ready', (select count(*) from certificate_requests where status = 'Ready for pick-up'),
    'prayers', (select count(*) from prayer_requests where status = 'New'),
    'blood', (select count(*) from blood_requests where status in ('Open', 'Contacting donors')),
    'sacraments', (select count(*) from sacrament_requests where status = 'New')
  );
$$;

revoke all on function public.request_inbox_counts() from public, anon;
grant execute on function public.request_inbox_counts() to authenticated;
