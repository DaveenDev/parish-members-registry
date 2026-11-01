-- "Kinahanglan og koreksyon": staff can tell a family what to fix on its
-- registration. Run after 0107_certificate_pickup_note.sql. Safe to re-run.
--
-- A household stays Pending or Verified (those two are counted all over the
-- admin and the reports), and a household that needs correcting is a Pending
-- one with a note:
--   * households.correction_note / correction_asked_at: set by staff from the
--     household's panel (Needs correction), a short note for the family.
--   * Verifying the household clears both.
--   * registration_status() (the website's "Susiha ang akong rehistro") sends
--     the note while the household is Pending, so the family sees what to fix
--     and where to do it (the census update, or the office).
-- The note is shown only with the status lookup: the reference number and the
-- note, never the household's name or members.

alter table households add column if not exists correction_note text;
alter table households add column if not exists correction_asked_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'households_correction_note_len') then
    alter table households add constraint households_correction_note_len
      check (correction_note is null or length(correction_note) <= 500);
  end if;
end;
$$;

create or replace function public.households_clear_correction() returns trigger
language plpgsql as $$
begin
  if new.status = 'Verified' then
    new.correction_note := null;
    new.correction_asked_at := null;
  elsif new.correction_note is distinct from old.correction_note then
    new.correction_note := nullif(trim(coalesce(new.correction_note, '')), '');
    new.correction_asked_at := case when new.correction_note is null then null else now() end;
  end if;
  return new;
end;
$$;

drop trigger if exists households_clear_correction on households;
create trigger households_clear_correction
  before update on households
  for each row execute function public.households_clear_correction();

create or replace function public.registration_status(p_ref text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  hid integer;
  h households;
begin
  perform public_request_guard('status', 30, 2000);
  hid := household_by_ref(p_ref);
  select * into h from households where id = hid;
  if not found then return null; end if;
  return jsonb_build_object(
    'ref_no', h.ref_no,
    'status', h.status,
    'registered_on', (h.created_at at time zone 'Asia/Manila')::date,
    'correction_note', case when h.status <> 'Verified' then nullif(trim(h.correction_note), '') end
  );
end;
$$;
