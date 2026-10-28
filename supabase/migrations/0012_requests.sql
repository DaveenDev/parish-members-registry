-- Requests from parishioners that feed a staff queue: certificate requests,
-- prayer requests, and the blood donor call (blood requests plus a list of
-- donors who agreed to be contacted). Run after 0011_website_content.sql.
-- Safe to re-run.
--
-- The public never touches these tables directly. It submits through the
-- security-definer functions at the bottom, which validate the input, limit
-- how often one visitor can submit, and return only a reference number.
-- Staff (any signed-in account) work the queues from the admin panel.

-- Stop early, naming the missing file, if an earlier migration hasn't run.
do $$
begin
  if to_regprocedure('public.parish_today()') is null then
    raise exception 'Run 0011_website_content.sql before this migration';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The signed-in staff member's display name, or null for the public.
create or replace function public.current_staff_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(p.name), ''), u.email)
  from profiles p join auth.users u on u.id = p.id
  where p.id = auth.uid();
$$;

-- Reference numbers like CR-2026-7KX4QM: same unambiguous alphabet as the
-- household numbers (no 0/O/1/I), so they read well over the phone.
create or replace function public.generate_request_ref(p_prefix text) returns text
language plpgsql as $$
declare
  alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  suffix text := '';
begin
  for i in 1..6 loop
    suffix := suffix || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return p_prefix || '-' || extract(year from now())::int || '-' || suffix;
end;
$$;

-- BEFORE INSERT trigger: fills ref_no with TG_ARGV[0] as the prefix.
create or replace function public.requests_set_ref_no() returns trigger
language plpgsql as $$
declare
  candidate text;
  taken boolean;
begin
  if new.ref_no is not null then return new; end if;
  for attempt in 1..20 loop
    candidate := generate_request_ref(tg_argv[0]);
    execute format('select exists (select 1 from %I where ref_no = $1)', tg_table_name) into taken using candidate;
    if not taken then
      new.ref_no := candidate;
      return new;
    end if;
  end loop;
  raise exception 'Could not generate a unique reference number';
end;
$$;

-- BEFORE UPDATE trigger: keeps updated_at, and records who changed the
-- status and when, from the signed-in account.
create or replace function public.requests_stamp() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    new.status_changed_at := now();
    new.handled_by := auth.uid();
    new.handled_by_name := current_staff_name();
  end if;
  return new;
end;
$$;

-- Digits of a mobile number, last 10 only, so 0917…, +63917… and 63917…
-- are the same number.
create or replace function public.mobile_key(p_mobile text) returns text
language sql immutable as $$
  select nullif(right(regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g'), 10), '');
$$;

create or replace function public.blood_types() returns text[]
language sql immutable as $$
  select array['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
$$;

-- ---------------------------------------------------------------------------
-- Certificate requests
-- ---------------------------------------------------------------------------
create table if not exists certificate_requests (
  id                  serial primary key,
  ref_no              text unique,
  cert_type           text not null check (cert_type in ('baptism', 'confirmation', 'matrimony')),
  status              text not null default 'Received'
                      check (status in ('Received', 'Being prepared', 'Ready for pick-up', 'Released', 'Cannot issue')),
  source              text not null default 'Online' check (source in ('Online', 'Walk-in', 'Phone')),
  -- Whose record: the person named on the certificate.
  subject_first_name  text not null,
  subject_middle_name text,
  subject_last_name   text not null,
  subject_birth_date  date,
  sacrament_date      date,
  sacrament_year      smallint check (sacrament_year between 1900 and 2100),
  sacrament_place     text,
  father_name         text,
  mother_name         text,
  spouse_name         text,
  purpose             text,
  copies              smallint not null default 1 check (copies between 1 and 10),
  -- Who asked, and how to reach them.
  requester_name      text not null,
  requester_mobile    text not null,
  requester_email     text,
  relationship        text,
  message             text,
  -- Staff side.
  member_id           integer references members(id) on delete set null,
  fee                 text,
  or_number           text,
  released_to         text,
  released_at         timestamptz,
  public_note         text,  -- shown to the requester on the status check
  staff_notes         text,
  status_changed_at   timestamptz not null default now(),
  handled_by          uuid references auth.users(id) on delete set null,
  handled_by_name     text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists certificate_requests_status_idx on certificate_requests (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Prayer requests
-- ---------------------------------------------------------------------------
create table if not exists prayer_requests (
  id                serial primary key,
  ref_no            text unique,
  intention_type    text not null default 'Special intention'
                    check (intention_type in ('For the sick', 'Thanksgiving', 'For the departed', 'Special intention')),
  intention         text not null,
  for_name          text,  -- who it is for (optional)
  requester_name    text,
  requester_mobile  text,
  allow_public      boolean not null default false,  -- the requester's consent
  show_publicly     boolean not null default false,  -- staff approval, only with consent
  status            text not null default 'New' check (status in ('New', 'Prayed for', 'Archived')),
  source            text not null default 'Online' check (source in ('Online', 'Walk-in', 'Phone')),
  offered_on        date,
  staff_notes       text,
  status_changed_at timestamptz not null default now(),
  handled_by        uuid references auth.users(id) on delete set null,
  handled_by_name   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (not show_publicly or allow_public)
);

create index if not exists prayer_requests_status_idx on prayer_requests (status, created_at desc);

-- ---------------------------------------------------------------------------
-- Blood donors: people who agreed to be contacted for blood calls. Separate
-- from members' blood types, which stay staff-only and are never used to
-- contact anyone who hasn't opted in here.
-- ---------------------------------------------------------------------------
create table if not exists blood_donors (
  id              serial primary key,
  full_name       text not null,
  mobile          text not null,
  mobile_key      text generated always as (public.mobile_key(mobile)) stored,
  blood_type      text check (blood_type is null or blood_type = any(public.blood_types())),
  gkk             text references gkks(name) on update cascade on delete set null,
  member_id       integer references members(id) on delete set null,
  last_donated_on date,
  source          text not null default 'Online' check (source in ('Online', 'Added by staff')),
  consent_at      timestamptz not null default now(),
  opted_out_at    timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists blood_donors_mobile_key_idx on blood_donors (mobile_key);

-- ---------------------------------------------------------------------------
-- Blood requests and who staff contacted for each.
-- ---------------------------------------------------------------------------
create table if not exists blood_requests (
  id                serial primary key,
  ref_no            text unique,
  patient_name      text not null,
  blood_type        text not null check (blood_type = any(public.blood_types())),
  units             smallint not null default 1 check (units between 1 and 20),
  hospital          text not null,
  needed_by         date,
  contact_name      text not null,
  contact_mobile    text not null,
  relationship      text,
  notes             text,
  allow_public      boolean not null default false,  -- consent to post blood type + hospital
  show_publicly     boolean not null default false,  -- staff approval, only with consent
  status            text not null default 'Open'
                    check (status in ('Open', 'Contacting donors', 'Fulfilled', 'Closed')),
  source            text not null default 'Online' check (source in ('Online', 'Walk-in', 'Phone')),
  staff_notes       text,
  status_changed_at timestamptz not null default now(),
  handled_by        uuid references auth.users(id) on delete set null,
  handled_by_name   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (not show_publicly or allow_public)
);

create index if not exists blood_requests_status_idx on blood_requests (status, created_at desc);

create table if not exists blood_request_contacts (
  request_id      integer not null references blood_requests(id) on delete cascade,
  donor_id        integer not null references blood_donors(id) on delete cascade,
  status          text not null check (status in ('Contacted', 'No answer', 'Agreed', 'Declined', 'Donated')),
  note            text,
  updated_at      timestamptz not null default now(),
  updated_by_name text,
  primary key (request_id, donor_id)
);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
drop trigger if exists trg_certificate_requests_ref on certificate_requests;
create trigger trg_certificate_requests_ref before insert on certificate_requests
for each row execute function public.requests_set_ref_no('CR');

drop trigger if exists trg_prayer_requests_ref on prayer_requests;
create trigger trg_prayer_requests_ref before insert on prayer_requests
for each row execute function public.requests_set_ref_no('PR');

drop trigger if exists trg_blood_requests_ref on blood_requests;
create trigger trg_blood_requests_ref before insert on blood_requests
for each row execute function public.requests_set_ref_no('BR');

do $$
declare t text;
begin
  foreach t in array array['certificate_requests', 'prayer_requests', 'blood_requests'] loop
    execute format('drop trigger if exists trg_%1$s_stamp on %1$I', t);
    execute format('create trigger trg_%1$s_stamp before update on %1$I
                    for each row execute function public.requests_stamp()', t);
  end loop;
end;
$$;

-- Released: note when, unless staff already set it.
create or replace function public.certificate_requests_released() returns trigger
language plpgsql as $$
begin
  if new.status = 'Released' and new.released_at is null then new.released_at := now(); end if;
  return new;
end;
$$;

drop trigger if exists trg_certificate_requests_released on certificate_requests;
create trigger trg_certificate_requests_released before insert or update on certificate_requests
for each row execute function public.certificate_requests_released();

drop trigger if exists trg_blood_donors_touch on blood_donors;
create trigger trg_blood_donors_touch before update on blood_donors
for each row execute function public.website_touch_updated_at();

-- A contact marked Donated moves the donor's last donation date forward,
-- so they rest before the next call.
create or replace function public.blood_request_contacts_stamp() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by_name := current_staff_name();
  if new.status = 'Donated' then
    update blood_donors
       set last_donated_on = greatest(coalesce(last_donated_on, '1900-01-01'::date), parish_today())
     where id = new.donor_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_blood_request_contacts_stamp on blood_request_contacts;
create trigger trg_blood_request_contacts_stamp before insert or update on blood_request_contacts
for each row execute function public.blood_request_contacts_stamp();

-- ---------------------------------------------------------------------------
-- Row level security: staff only. The public goes through the functions.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['certificate_requests', 'prayer_requests', 'blood_donors', 'blood_requests', 'blood_request_contacts'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_admin_all', t);
    execute format('create policy %I on %I for all to authenticated using (true) with check (true)', t || '_admin_all', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
  foreach t in array array['certificate_requests', 'prayer_requests', 'blood_donors', 'blood_requests'] loop
    execute format('grant usage, select on sequence %I to authenticated', t || '_id_seq');
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Abuse limits for the public forms. Each visitor (by IP address, stored
-- only as a hash and kept one day) may submit a few times an hour, and each
-- form has an overall hourly cap so a flood can't bury the real requests.
-- ---------------------------------------------------------------------------
create table if not exists public_request_log (
  kind       text not null,
  client_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists public_request_log_idx on public_request_log (kind, created_at);
alter table public_request_log enable row level security;
revoke all on public_request_log from anon, authenticated;

create or replace function public.public_request_guard(p_kind text, p_per_visitor integer, p_overall integer)
returns void
language plpgsql security definer set search_path = public as $$
declare
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  ip text := coalesce(split_part(headers->>'x-forwarded-for', ',', 1), headers->>'x-real-ip', 'unknown');
  key text := md5('olg-request|' || trim(ip));
begin
  delete from public_request_log where created_at < now() - interval '1 day';
  if (select count(*) from public_request_log
      where kind = p_kind and client_key = key and created_at > now() - interval '1 hour') >= p_per_visitor
     or (select count(*) from public_request_log
         where kind = p_kind and created_at > now() - interval '1 hour') >= p_overall then
    raise exception 'Daghan na kaayo nga pagsulay. Palihug sulayi pag-usab human sa usa ka oras.'
      using errcode = 'P0001', hint = 'rate_limited';
  end if;
  insert into public_request_log (kind, client_key) values (p_kind, key);
end;
$$;

-- Trimmed text from a JSON payload, null when blank, cut to p_max characters.
create or replace function public.payload_text(p jsonb, p_key text, p_max integer default 200) returns text
language sql immutable as $$
  select nullif(left(trim(coalesce(p->>p_key, '')), p_max), '');
$$;

create or replace function public.require_mobile(p_mobile text) returns text
language plpgsql immutable as $$
begin
  if p_mobile is null or length(regexp_replace(p_mobile, '\D', '', 'g')) < 10 then
    raise exception 'Palihug isulat ang husto nga mobile number (e.g. 0917 123 4567).';
  end if;
  return p_mobile;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public submit functions. Each returns { ref_no } (donors: { ok }).
-- A filled-in "website" field is a bot trap: it gets a normal-looking reply
-- and nothing is saved.
-- ---------------------------------------------------------------------------
create or replace function public.submit_certificate_request(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ctype text := payload_text(payload, 'certType', 20);
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
  perform public_request_guard('certificate', 5, 200);

  insert into certificate_requests (
    cert_type, subject_first_name, subject_middle_name, subject_last_name, subject_birth_date,
    sacrament_date, sacrament_year, sacrament_place, father_name, mother_name, spouse_name,
    purpose, copies, requester_name, requester_mobile, requester_email, relationship, message
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
    payload_text(payload, 'message', 1000)
  ) returning * into saved;

  return jsonb_build_object('ref_no', saved.ref_no);
end;
$$;

-- Status check by reference number. Returns no names or contact details.
create or replace function public.certificate_request_status(p_ref text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r certificate_requests;
begin
  perform public_request_guard('status', 30, 2000);
  select * into r from certificate_requests where ref_no = upper(trim(coalesce(p_ref, '')));
  if not found then return null; end if;
  return jsonb_build_object(
    'ref_no', r.ref_no,
    'cert_type', r.cert_type,
    'status', r.status,
    'requested_on', (r.created_at at time zone 'Asia/Manila')::date,
    'updated_on', (r.status_changed_at at time zone 'Asia/Manila')::date,
    'note', r.public_note
  );
end;
$$;

create or replace function public.submit_prayer_request(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  itype text := coalesce(payload_text(payload, 'intentionType', 40), 'Special intention');
  saved prayer_requests;
begin
  if payload_text(payload, 'website') is not null then
    return jsonb_build_object('ref_no', generate_request_ref('PR'));
  end if;
  if itype not in ('For the sick', 'Thanksgiving', 'For the departed', 'Special intention') then
    itype := 'Special intention';
  end if;
  if payload_text(payload, 'intention') is null then
    raise exception 'Palihug isulat ang inyong intensyon.';
  end if;
  perform public_request_guard('prayer', 5, 300);

  insert into prayer_requests (intention_type, intention, for_name, requester_name, requester_mobile, allow_public)
  values (
    itype,
    payload_text(payload, 'intention', 1000),
    payload_text(payload, 'forName', 120),
    payload_text(payload, 'requesterName', 120),
    payload_text(payload, 'requesterMobile', 30),
    coalesce((payload->>'allowPublic')::boolean, false)
  ) returning * into saved;

  return jsonb_build_object('ref_no', saved.ref_no);
end;
$$;

-- Opt in as a donor. Signing up again with the same mobile number updates
-- the entry (and undoes an earlier opt-out) instead of adding a duplicate.
create or replace function public.register_blood_donor(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  btype text := payload_text(payload, 'bloodType', 5);
  mobile text;
  gkk_val text := payload_text(payload, 'gkk', 120);
begin
  if payload_text(payload, 'website') is not null then
    return jsonb_build_object('ok', true);
  end if;
  if coalesce((payload->>'consent')::boolean, false) is not true then
    raise exception 'Palihug i-check ang pagtugot nga kontakon kamo sa parokya.';
  end if;
  if payload_text(payload, 'fullName') is null then
    raise exception 'Palihug isulat ang inyong ngalan.';
  end if;
  mobile := require_mobile(payload_text(payload, 'mobile', 30));
  if btype is not null and not (btype = any(blood_types())) then btype := null; end if;
  if gkk_val is not null and not exists (select 1 from gkks where name = gkk_val) then gkk_val := null; end if;
  perform public_request_guard('donor', 5, 300);

  insert into blood_donors (full_name, mobile, blood_type, gkk, source)
  values (payload_text(payload, 'fullName', 120), mobile, btype, gkk_val, 'Online')
  on conflict (mobile_key) do update
    set full_name = excluded.full_name,
        mobile = excluded.mobile,
        blood_type = coalesce(excluded.blood_type, blood_donors.blood_type),
        gkk = coalesce(excluded.gkk, blood_donors.gkk),
        consent_at = now(),
        opted_out_at = null;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.submit_blood_request(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  btype text := payload_text(payload, 'bloodType', 5);
  saved blood_requests;
begin
  if payload_text(payload, 'website') is not null then
    return jsonb_build_object('ref_no', generate_request_ref('BR'));
  end if;
  if coalesce((payload->>'consent')::boolean, false) is not true then
    raise exception 'Palihug i-check ang pagtugot (consent) sa dili pa ipadala.';
  end if;
  if btype is null or not (btype = any(blood_types())) then
    raise exception 'Palihug pilia ang blood type nga kinahanglan.';
  end if;
  if payload_text(payload, 'patientName') is null or payload_text(payload, 'hospital') is null or payload_text(payload, 'contactName') is null then
    raise exception 'Palihug kompletoha ang ngalan sa pasyente, ospital, ug kontak nga tawo.';
  end if;
  perform public_request_guard('blood', 3, 100);

  insert into blood_requests (patient_name, blood_type, units, hospital, needed_by, contact_name, contact_mobile, relationship, notes, allow_public)
  values (
    payload_text(payload, 'patientName', 120),
    btype,
    greatest(1, least(20, coalesce(nullif(payload->>'units', '')::smallint, 1))),
    payload_text(payload, 'hospital', 150),
    nullif(payload->>'neededBy', '')::date,
    payload_text(payload, 'contactName', 120),
    require_mobile(payload_text(payload, 'contactMobile', 30)),
    payload_text(payload, 'relationship', 60),
    payload_text(payload, 'notes', 1000),
    coalesce((payload->>'allowPublic')::boolean, false)
  ) returning * into saved;

  return jsonb_build_object('ref_no', saved.ref_no);
end;
$$;

-- ---------------------------------------------------------------------------
-- Public read functions for the website (only what staff approved, and only
-- what the requester agreed to share).
-- ---------------------------------------------------------------------------

-- Open blood calls: blood type, units, hospital and date. No names.
create or replace function public.public_blood_calls() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'blood_type', blood_type, 'units', units, 'hospital', hospital, 'needed_by', needed_by
         ) order by needed_by nulls last, created_at), '[]'::jsonb)
  from blood_requests
  where show_publicly and status in ('Open', 'Contacting donors')
    and (needed_by is null or needed_by >= parish_today());
$$;

-- Prayer intentions shared on the website, last 30 days. No requester details.
create or replace function public.public_prayer_intentions() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'type', intention_type, 'for_name', for_name, 'intention', intention,
           'date', (created_at at time zone 'Asia/Manila')::date
         ) order by created_at desc), '[]'::jsonb)
  from prayer_requests
  where show_publicly and status <> 'Archived' and created_at > now() - interval '30 days';
$$;

-- ---------------------------------------------------------------------------
-- Staff: how many items are waiting in each queue (sidebar badge).
-- ---------------------------------------------------------------------------
create or replace function public.request_inbox_counts() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'certificates', (select count(*) from certificate_requests where status in ('Received', 'Being prepared')),
    'ready', (select count(*) from certificate_requests where status = 'Ready for pick-up'),
    'prayers', (select count(*) from prayer_requests where status = 'New'),
    'blood', (select count(*) from blood_requests where status in ('Open', 'Contacting donors'))
  );
$$;

revoke all on function public.request_inbox_counts() from public, anon;
grant execute on function public.request_inbox_counts() to authenticated;

revoke all on function public.public_request_guard(text, integer, integer) from public, anon, authenticated;
revoke all on function public.current_staff_name() from public, anon;
grant execute on function public.current_staff_name() to authenticated;

grant execute on function public.submit_certificate_request(jsonb) to anon, authenticated;
grant execute on function public.certificate_request_status(text) to anon, authenticated;
grant execute on function public.submit_prayer_request(jsonb) to anon, authenticated;
grant execute on function public.register_blood_donor(jsonb) to anon, authenticated;
grant execute on function public.submit_blood_request(jsonb) to anon, authenticated;
grant execute on function public.public_blood_calls() to anon, authenticated;
grant execute on function public.public_prayer_intentions() to anon, authenticated;
