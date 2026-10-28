-- Possible duplicates across GKKs, and sending them to the parish office.
-- Run after 0093_leader_unassigned_households.sql. Safe to re-run.
--
-- A GKK leader saw only the possible duplicates inside their own GKK: Dave
-- Duran registered in Meohao and again in San Isidro showed to neither GKK's
-- leader. Now a leader sees every group of members (0010) and every pair of
-- households (0092) with at least one record of their GKK. Of another GKK's
-- records they see what tells the two apart (name, birth date, household,
-- GKK, status, reference number), not its address, phone or email.
--
-- A leader can't merge records, nor mark another GKK's records "Not
-- duplicates", so they send the group to the parish office:
--   duplicate_flags                     one open flag per group or pair
--   flag_duplicate(kind, ids, note)     GKK leaders; full-access staff are
--                                       alerted (the bell and their phones)
--   unflag_duplicate(id)                the leader's GKK takes it back
--   close_duplicate_flag(id)            full access: fixed some other way
-- A flag also closes by itself when the office merges or deletes one of the
-- records, or marks them "Not duplicates"; the GKK that sent it is told.
--
-- find_duplicate_members(), household_duplicate_pairs() and
-- find_duplicate_households() now run as the database and pick what the
-- caller may see themselves, so the row rules (and 0093's
-- 'parish:own_gkk_only') no longer decide it: a leader gets the groups with
-- a record of their GKK, not those of households with no GKK alone. Each
-- record says whether it's the leader's GKK's (`mine`: theirs to mark "Not
-- duplicates") and whether they can open it (`can_open`: theirs, or with no
-- GKK, 0093); each group or pair carries its open flag (`flag`), flagged
-- ones first.
-- The sidebar badges now count a GKK leader's groups too (0092 counted none
-- for them).

do $$
begin
  if to_regprocedure('public.household_duplicate_pairs()') is null
     or to_regclass('public.household_duplicate_dismissals') is null
     or to_regprocedure('public.gkk_unassigned(text)') is null then
    raise exception 'Run the migrations up to 0093_leader_unassigned_households.sql before this one';
  end if;
end;
$$;

-- ---- the flags --------------------------------------------------------------------

create table if not exists duplicate_flags (
  id              bigserial primary key,
  kind            text not null check (kind in ('members', 'households')),
  record_ids      integer[] not null,          -- the members, or the two households; sorted
  gkks            text[] not null default '{}', -- their GKKs when flagged
  label           text,                        -- "Dave Duran, born Mar 4, 1990", for the alerts
  note            text check (char_length(note) <= 500),
  flagged_by      uuid references auth.users(id) on delete set null,
  flagged_by_name text,
  flagged_gkk     text,
  flagged_at      timestamptz not null default now(),
  closed_at       timestamptz,
  closed_by_name  text,
  outcome         text check (outcome in ('removed', 'not_duplicates', 'closed'))
);

create unique index if not exists duplicate_flags_open_idx on duplicate_flags (kind, record_ids) where closed_at is null;

alter table duplicate_flags enable row level security;

drop policy if exists duplicate_flags_select on duplicate_flags;
create policy duplicate_flags_select on duplicate_flags
  for select to authenticated
  using ((select staff_can_see('registry'))
         or ((select staff_access()) = 'gkk_leader'
             and (flagged_gkk = (select staff_gkk()) or (select staff_gkk()) = any(gkks))));

-- Read-only for staff; writes go through the functions below.
revoke all on duplicate_flags from anon, authenticated;
grant select on duplicate_flags to authenticated;

/** The open flag of a group or pair, for the lists below; null when none. */
create or replace function public.duplicate_flag_json(p_kind text, p_ids integer[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'note', f.note, 'flagged_by_name', f.flagged_by_name,
                            'flagged_gkk', f.flagged_gkk, 'flagged_at', f.flagged_at,
                            'mine', f.flagged_by = auth.uid())
  from duplicate_flags f
  where f.kind = p_kind and f.closed_at is null and f.record_ids <@ p_ids
  order by f.flagged_at
  limit 1;
$$;
revoke all on function public.duplicate_flag_json(text, integer[]) from public, anon, authenticated;

/**
 * Close the given open flags and tell the GKK that sent each one (unless the
 * person closing it sent it). `p_outcome`: 'removed' (one of the records was
 * merged or deleted), 'not_duplicates', 'closed' (fixed some other way).
 * An alert never stops the change it comes with.
 */
create or replace function public.close_duplicate_flags(p_ids bigint[], p_outcome text) returns void
language plpgsql security definer set search_path = public as $$
declare
  f duplicate_flags;
begin
  if coalesce(cardinality(p_ids), 0) = 0 then return; end if;
  for f in
    update duplicate_flags
    set closed_at = now(), closed_by_name = current_staff_name(), outcome = p_outcome
    where id = any(p_ids) and closed_at is null
    returning *
  loop
    if f.flagged_gkk is not null and f.flagged_by is distinct from auth.uid() then
      begin
        insert into staff_notifications (kind, area, gkk, title, detail, link)
        values ('duplicate_flag_review', 'leader', f.flagged_gkk,
          case when p_outcome = 'not_duplicates' then 'Possible duplicate checked' else 'Possible duplicate fixed' end,
          coalesce(f.label, 'The possible duplicate you sent') || ': ' || case p_outcome
            when 'not_duplicates' then 'the parish office checked and they are not the same '
                                       || case when f.kind = 'members' then 'person.' else 'household.' end
            when 'removed' then 'the parish office merged or deleted the extra record.'
            else 'the parish office fixed the records.'
          end,
          case when f.kind = 'members' then '/admin/members?view=duplicates' else '/admin/households?status=Duplicates' end);
      exception when others then
        raise warning 'close_duplicate_flags: %', sqlerrm;
      end;
    end if;
  end loop;
end;
$$;
revoke all on function public.close_duplicate_flags(bigint[], text) from public, anon, authenticated;

/**
 * Send a group of members (`p_kind` 'members') or a pair of households
 * ('households') to the parish office, with an optional note. GKK leaders,
 * for groups with at least one record of their GKK. Returns the flag's id
 * (the open one already there, if someone sent it before).
 */
create or replace function public.flag_duplicate(p_kind text, p_ids integer[], p_note text default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  who text := current_staff_name();
  mine text := staff_gkk();
  ids integer[];
  n integer;
  n_keys integer;
  gk text[];
  touches boolean;
  lbl text;
  note_val text := nullif(trim(coalesce(p_note, '')), '');
  fid bigint;
begin
  if who is null then raise exception 'Only parish staff can flag possible duplicates'; end if;
  if staff_access() is distinct from 'gkk_leader' then
    raise exception 'Only GKK leaders send possible duplicates to the parish office' using errcode = '42501';
  end if;
  if char_length(note_val) > 500 then raise exception 'Keep the note under 500 characters'; end if;
  select array_agg(distinct x order by x) into ids from unnest(p_ids) as x where x is not null;

  if p_kind = 'members' then
    if coalesce(array_length(ids, 1), 0) < 2 then raise exception 'Choose at least two members'; end if;
    select count(*), count(distinct member_match_key(m.first_name, m.last_name, m.dob)),
           array_agg(distinct h.gkk order by h.gkk) filter (where h.gkk is not null), bool_or(h.gkk = mine),
           min(trim(m.first_name) || ' ' || trim(m.last_name)) || coalesce(', born ' || to_char(min(m.dob), 'FMMon FMDD, YYYY'), '')
      into n, n_keys, gk, touches, lbl
    from members m join households h on h.id = m.household_id
    where m.id = any(ids);
    if n <> cardinality(ids) then raise exception 'One of these members is no longer in the registry. Reload the page.'; end if;
    if n_keys <> 1 or exists (select 1 from members m where m.id = any(ids) and m.dob is null) then
      raise exception 'These members no longer share a name and date of birth. Reload the page.';
    end if;
  elsif p_kind = 'households' then
    if coalesce(array_length(ids, 1), 0) <> 2 then raise exception 'Choose two households'; end if;
    if not exists (select 1 from household_duplicate_pairs() s where s.a = ids[1] and s.b = ids[2]) then
      raise exception 'These households are no longer possible duplicates. Reload the page.';
    end if;
    select array_agg(distinct h.gkk order by h.gkk) filter (where h.gkk is not null), bool_or(h.gkk = mine),
           string_agg(h.household_name, ' and ' order by h.created_at, h.id)
      into gk, touches, lbl
    from households h where h.id = any(ids);
  else
    raise exception 'Unknown kind of duplicate: %', p_kind;
  end if;

  if not coalesce(touches, false) then
    raise exception 'Your account can only send possible duplicates that include a record of %', mine using errcode = '42501';
  end if;

  -- Sent already (for these records, or some of them while the group grew).
  select f.id into fid from duplicate_flags f
  where f.kind = p_kind and f.closed_at is null and f.record_ids <@ ids
  order by f.flagged_at limit 1;
  if fid is not null then return fid; end if;

  insert into duplicate_flags (kind, record_ids, gkks, label, note, flagged_by, flagged_by_name, flagged_gkk)
  values (p_kind, ids, coalesce(gk, '{}'), lbl, note_val, auth.uid(), who, mine)
  returning id into fid;

  -- Area 'website': full-access staff only (notification_visible_to, 0087), as for GKK structures (0081).
  -- The title goes to phones, so no names.
  begin
    insert into staff_notifications (kind, area, gkk, title, detail, link)
    values ('duplicate_flag', 'website', mine,
      case when p_kind = 'members' then 'Possible duplicate member to fix' else 'Possible duplicate household to fix' end,
      mine || ': ' || who || ' sent ' || coalesce(lbl, 'a possible duplicate')
        || case when cardinality(gk) > 1 then ' (' || array_to_string(gk, ', ') || ')' else '' end
        || coalesce(' — "' || note_val || '"', '') || '.',
      case when p_kind = 'members' then '/admin/members?view=duplicates' else '/admin/households?status=Duplicates' end);
  exception when others then
    raise warning 'flag_duplicate: %', sqlerrm;
  end;
  return fid;
end;
$$;

/** Take back a flag sent by mistake: GKK leaders of the GKK that sent it, while it's open. */
create or replace function public.unflag_duplicate(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if staff_access() is distinct from 'gkk_leader' then
    raise exception 'Only GKK leaders take back what they sent' using errcode = '42501';
  end if;
  delete from duplicate_flags where id = p_id and closed_at is null and flagged_gkk = staff_gkk();
  if not found then raise exception 'This was already handled by the parish office, or sent by another GKK. Reload the page.'; end if;
end;
$$;

/** Full access: the records were fixed some other way (a name or birth date corrected). */
create or replace function public.close_duplicate_flag(p_id bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_full_access('close a flagged duplicate');
  perform close_duplicate_flags(array[p_id], 'closed');
end;
$$;

revoke all on function public.flag_duplicate(text, integer[], text) from public, anon;
revoke all on function public.unflag_duplicate(bigint) from public, anon;
revoke all on function public.close_duplicate_flag(bigint) from public, anon;
grant execute on function public.flag_duplicate(text, integer[], text) to authenticated;
grant execute on function public.unflag_duplicate(bigint) to authenticated;
grant execute on function public.close_duplicate_flag(bigint) to authenticated;

-- ---- closing them by themselves ------------------------------------------------------

/** Marked "Not duplicates": the flags for those members. */
create or replace function public.duplicate_flags_on_member_dismissal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform close_duplicate_flags(
      (select array_agg(id) from duplicate_flags where kind = 'members' and closed_at is null and record_ids <@ new.member_ids),
      'not_duplicates');
  exception when others then
    raise warning 'duplicate_flags_on_member_dismissal: %', sqlerrm;
  end;
  return null;
end;
$$;

/** Marked "Not the same household": the pair's flag. */
create or replace function public.duplicate_flags_on_household_dismissal() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform close_duplicate_flags(
      (select array_agg(id) from duplicate_flags where kind = 'households' and closed_at is null and record_ids = new.household_ids),
      'not_duplicates');
  exception when others then
    raise warning 'duplicate_flags_on_household_dismissal: %', sqlerrm;
  end;
  return null;
end;
$$;

/**
 * A member or household merged away or deleted (to the Trash): its flags.
 * In a group of three, the other two may still match; they show again,
 * unflagged.
 */
create or replace function public.duplicate_flags_on_delete() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  k text := case when tg_table_name = 'members' then 'members' else 'households' end;
begin
  begin
    perform close_duplicate_flags(
      (select array_agg(id) from duplicate_flags where kind = k and closed_at is null and old.id = any(record_ids)),
      'removed');
  exception when others then
    raise warning 'duplicate_flags_on_delete: %', sqlerrm;
  end;
  return null;
end;
$$;

revoke all on function public.duplicate_flags_on_member_dismissal() from public, anon, authenticated;
revoke all on function public.duplicate_flags_on_household_dismissal() from public, anon, authenticated;
revoke all on function public.duplicate_flags_on_delete() from public, anon, authenticated;

drop trigger if exists trg_duplicate_flags_dismissed on duplicate_dismissals;
create trigger trg_duplicate_flags_dismissed after insert on duplicate_dismissals
  for each row execute function public.duplicate_flags_on_member_dismissal();

drop trigger if exists trg_duplicate_flags_dismissed on household_duplicate_dismissals;
create trigger trg_duplicate_flags_dismissed after insert on household_duplicate_dismissals
  for each row execute function public.duplicate_flags_on_household_dismissal();

drop trigger if exists trg_duplicate_flags_deleted on members;
create trigger trg_duplicate_flags_deleted after delete on members
  for each row execute function public.duplicate_flags_on_delete();

drop trigger if exists trg_duplicate_flags_deleted on households;
create trigger trg_duplicate_flags_deleted after delete on households
  for each row execute function public.duplicate_flags_on_delete();

-- ---- possible duplicate members ----------------------------------------------------

/**
 * As in 0010, run as the database: GKK leaders get every group with a member
 * of their GKK, the rest of the registry staff every group, others none.
 * Each member also has `gkk`, `mine` and `can_open` (see the top); each
 * group `across_gkks` and `flag`. Flagged groups first.
 */
create or replace function public.find_duplicate_members() returns jsonb
language sql stable security definer set search_path = public as $$
  with viewer as materialized (
    select staff_access() as acc, staff_gkk() as gkk, staff_can_see('registry') as sees_all
  ),
  keyed as materialized (
    select m.id, m.first_name, m.middle_name, m.last_name, m.suffix, m.dob, m.relationship, m.household_id,
           h.household_name, h.status as household_status, h.ref_no, h.created_at as registered_at, h.gkk,
           member_match_key(m.first_name, m.last_name, m.dob) as match_key
    from members m
    join households h on h.id = m.household_id
    where m.dob is not null and trim(m.first_name) <> '' and trim(m.last_name) <> ''
  ),
  groups as (
    select k.match_key, array_agg(k.id order by k.id) as ids, count(distinct k.household_id) as households,
           count(distinct coalesce(k.gkk, '')) > 1 as across_gkks,
           coalesce(bool_or(k.gkk = v.gkk), false) as touches_mine
    from keyed k cross join viewer v
    group by k.match_key
    having count(*) > 1
  ),
  shown as (
    select g.*, duplicate_flag_json('members', g.ids) as flag
    from groups g cross join viewer v
    where not exists (select 1 from duplicate_dismissals d where d.member_ids = g.ids)
      and case when v.acc = 'gkk_leader' then g.touches_mine else v.sees_all end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', g.match_key,
           'member_ids', to_jsonb(g.ids),
           'same_household', g.households = 1,
           'across_gkks', g.across_gkks,
           'flag', g.flag,
           'members', (select jsonb_agg(jsonb_build_object(
                          'id', k.id, 'first_name', k.first_name, 'middle_name', k.middle_name,
                          'last_name', k.last_name, 'suffix', k.suffix, 'dob', k.dob,
                          'relationship', k.relationship, 'household_id', k.household_id,
                          'household_name', k.household_name, 'household_status', k.household_status,
                          'ref_no', k.ref_no, 'registered_at', k.registered_at, 'gkk', k.gkk,
                          'mine', v.acc is distinct from 'gkk_leader' or coalesce(k.gkk = v.gkk, false),
                          'can_open', v.acc is distinct from 'gkk_leader' or coalesce(k.gkk = v.gkk, false) or gkk_unassigned(k.gkk))
                        order by k.registered_at, k.id)
                       from keyed k cross join viewer v where k.match_key = g.match_key)
         ) order by g.flag is null, g.match_key), '[]'::jsonb)
  from shown g;
$$;

revoke all on function public.find_duplicate_members() from public, anon;
grant execute on function public.find_duplicate_members() to authenticated;

-- ---- possible duplicate households -------------------------------------------------

-- As in 0092, run as the database, so a pair with a household of another GKK
-- is found, and then only the pairs the caller may see: GKK leaders the ones
-- with a household of their GKK, the rest of the registry staff all.
create or replace function public.household_duplicate_pairs()
returns table (a integer, b integer, score integer, members jsonb, names jsonb,
               phone text, email text, previous_ref text, address text, name text)
language sql stable security definer set search_path = public set work_mem = '16MB' as $$
  with m as materialized (
    select household_id as hid, dup_text_key(first_name) as fk, dup_text_key(last_name) as lk, dob,
           trim(first_name) || ' ' || trim(last_name) as label,
           dup_phone_key(contact) as phone, trim(contact) as contact, lower(trim(email)) as email
    from members
  ),
  h as materialized (
    select id as hid, dup_phone_key(contact) as phone, trim(contact) as contact, lower(trim(email)) as email,
           dup_text_key(previous_ref_no) as ref, trim(previous_ref_no) as ref_label,
           dup_text_key(street) as street, dup_text_key(barangay) as barangay,
           concat_ws(', ', nullif(trim(street), ''), nullif(trim(barangay), '')) as address,
           dup_household_name_key(household_name) as name, trim(household_name) as name_label
    from households
  ),
  sig as (
    select hid, 'member'::text as kind, fk || '|' || lk || '|' || dob::text as val, label from m
    where fk is not null and lk is not null and dob is not null
    union all
    select hid, 'person', fk || '|' || lk, label from m where fk is not null and lk is not null
    union all
    select hid, 'phone', phone, contact from m where phone is not null
    union all
    select hid, 'email', email, email from m where email like '%_@_%'
    union all
    select hid, 'phone', phone, contact from h where phone is not null
    union all
    select hid, 'email', email, email from h where email like '%_@_%'
    union all
    select hid, 'previous_ref', ref, ref_label from h where ref is not null
    union all
    select hid, 'address', street || '|' || coalesce(barangay, ''), address from h where length(street) >= 4
    union all
    select hid, 'name', name, name_label from h where length(name) >= 3
  ),
  telling as (
    select kind, val
    from (select hid, kind, val from sig group by hid, kind, val) x
    group by kind, val
    having count(*) between 2 and 4
  ),
  hits as (
    select s.hid, s.kind, s.val, s.label from sig s join telling t on t.kind = s.kind and t.val = s.val
  ),
  labels as (
    select distinct on (kind, val) kind, val, label from hits order by kind, val, hid, label
  ),
  matched as (
    select x.hid as a, y.hid as b, x.kind, x.val, l.label
    from (select distinct hid, kind, val from hits) x
    join (select distinct hid, kind, val from hits) y on y.kind = x.kind and y.val = x.val and y.hid > x.hid
    join labels l on l.kind = x.kind and l.val = x.val
  ),
  people as (
    select a, b, min(label) as label, bool_or(kind = 'member') as same_dob
    from (select a, b, kind, label,
                 case when kind = 'member' then split_part(val, '|', 1) || '|' || split_part(val, '|', 2) else val end as person
          from matched where kind in ('member', 'person')) x
    group by a, b, person
  ),
  shared_people as (
    select a, b,
           count(*) filter (where same_dob) as n_members,
           count(*) filter (where not same_dob) as n_names,
           coalesce(jsonb_agg(label order by label) filter (where same_dob), '[]') as members,
           coalesce(jsonb_agg(label order by label) filter (where not same_dob), '[]') as names
    from people group by a, b
  ),
  shared_details as (
    select a, b,
           min(label) filter (where kind = 'phone') as phone,
           min(label) filter (where kind = 'email') as email,
           min(label) filter (where kind = 'previous_ref') as previous_ref,
           min(label) filter (where kind = 'address') as address,
           min(label) filter (where kind = 'name') as name
    from matched where kind not in ('member', 'person') group by a, b
  ),
  scored as (
    select coalesce(p.a, d.a) as a, coalesce(p.b, d.b) as b,
           coalesce(p.members, '[]') as members, coalesce(p.names, '[]') as names,
           d.phone, d.email, d.previous_ref, d.address, d.name,
           40 * coalesce(p.n_members, 0) + 20 * coalesce(p.n_names, 0)
             + case when d.previous_ref is not null then 50 else 0 end
             + case when d.phone is not null then 35 else 0 end
             + case when d.email is not null then 35 else 0 end
             + case when d.address is not null then 15 else 0 end
             + case when d.name is not null then 15 else 0 end as score
    from shared_people p
    full join shared_details d on d.a = p.a and d.b = p.b
  ),
  viewer as materialized (
    select staff_access() as acc, staff_gkk() as gkk, staff_can_see('registry') as sees_all
  )
  select s.a, s.b, s.score::integer, s.members, s.names, s.phone, s.email, s.previous_ref, s.address, s.name
  from scored s cross join viewer v
  where s.score >= 50
    and not exists (select 1 from household_duplicate_dismissals d where d.household_ids = array[s.a, s.b])
    and case when v.acc = 'gkk_leader'
             then exists (select 1 from households x where x.id in (s.a, s.b) and x.gkk = v.gkk)
             else v.sees_all end;
$$;

revoke all on function public.household_duplicate_pairs() from public, anon;
grant execute on function public.household_duplicate_pairs() to authenticated;

/**
 * As in 0092, run as the database, plus `flag` for each pair and `mine` and
 * `can_open` for each household. A GKK leader gets a household they can't
 * open without its street, phone, email or previous reference number.
 * Flagged pairs first.
 */
create or replace function public.find_duplicate_households() returns jsonb
language sql stable security definer set search_path = public as $$
  with viewer as materialized (
    select staff_access() as acc, staff_gkk() as gkk
  ),
  pairs as (
    select s.*, duplicate_flag_json('households', array[s.a, s.b]) as flag from household_duplicate_pairs() s
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', s.a || '-' || s.b,
           'household_ids', jsonb_build_array(s.a, s.b),
           'score', s.score,
           'likely', s.score >= 90,
           'members', s.members, 'names', s.names,
           'phone', s.phone, 'email', s.email, 'previous_ref', s.previous_ref, 'address', s.address, 'name', s.name,
           'flag', s.flag,
           'households', (
             select jsonb_agg(jsonb_build_object(
                      'id', h.id, 'household_name', h.household_name, 'ref_no', h.ref_no, 'status', h.status,
                      'gkk', h.gkk, 'barangay', h.barangay, 'registered_at', h.created_at,
                      'mine', x.mine, 'can_open', x.can_open,
                      'street', case when x.can_open then h.street end,
                      'contact', case when x.can_open then h.contact end,
                      'email', case when x.can_open then h.email end,
                      'previous_ref_no', case when x.can_open then h.previous_ref_no end,
                      'members', (
                        select coalesce(jsonb_agg(jsonb_build_object(
                                 'id', m.id, 'first_name', m.first_name, 'last_name', m.last_name, 'suffix', m.suffix,
                                 'relationship', m.relationship, 'dob', m.dob, 'family_no', m.family_no)
                               order by m.family_no, m.relationship is distinct from 'Head of Household', m.id), '[]')
                        from members m where m.household_id = h.id))
                    order by h.created_at, h.id)
             from households h
             cross join lateral (select y.mine, y.mine or gkk_unassigned(h.gkk) as can_open
                                 from (select v.acc is distinct from 'gkk_leader' or coalesce(h.gkk = v.gkk, false) as mine) y) x
             where h.id in (s.a, s.b))
         ) order by s.flag is null, s.score desc, s.a, s.b), '[]'::jsonb)
  from pairs s cross join viewer v;
$$;

revoke all on function public.find_duplicate_households() from public, anon;
grant execute on function public.find_duplicate_households() to authenticated;

-- ---- the sidebar badges ------------------------------------------------------------

-- As in 0092, with GKK leaders' duplicates counted (the functions above pick theirs).
create or replace function public.admin_nav_counts() returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object(
    'pending_households', (select count(*) from households where status = 'Pending'),
    'duplicate_groups', case when (select staff_can_see('registry') or staff_access() = 'gkk_leader')
                             then jsonb_array_length(find_duplicate_members()) else 0 end,
    'duplicate_households', case when (select staff_can_see('registry') or staff_access() = 'gkk_leader')
                                 then (select count(*) from household_duplicate_pairs()) else 0 end,
    'census_updates', (select count(*) from census_submissions s join census_cycles c on c.id = s.cycle_id
                       where s.status = 'Pending' and c.status = 'Open'),
    'sacraments_waiting', (
      select count(*) from members m
      cross join lateral (values ('baptism', m.has_baptism), ('communion', m.has_communion),
                                 ('confirmation', m.has_confirmation), ('matrimony', m.has_matrimony)) as c(sacrament, claimed)
      where member_is_current(m.membership_status) and c.claimed
        and not exists (select 1 from sacrament_verifications v where v.member_id = m.id and v.sacrament = c.sacrament)),
    'requests', case when (select staff_can_see('requests')) then request_inbox_counts()
                     else jsonb_build_object('certificates', 0, 'ready', 0, 'prayers', 0, 'blood', 0) end
  );
$$;

-- ---- phones ------------------------------------------------------------------------

-- As in 0081, with the duplicate alerts on "Member requests only".
-- Keep the list in sync with MEMBER_REQUEST_KINDS in client/src/lib/notifications.js.
create or replace function public.notification_push_targets(p_id bigint)
returns table (id bigint, endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = public as $$
  select s.id, s.endpoint, s.p256dh, s.auth
  from staff_notifications n
  cross join staff_push_subscriptions s
  join auth.users u on u.id = s.user_id
  left join profiles p on p.id = s.user_id
  left join gkks lg on lg.id = p.access_gkk_id
  left join staff_notify_prefs pr on pr.user_id = s.user_id
  where n.id = p_id
    and (u.banned_until is null or u.banned_until <= now())
    and notification_visible_to(coalesce(p.access, 'none'), lg.name, n.area, n.gkk)
    and case
          when n.kind = 'digest' then coalesce(pr.digest, true)
          else case coalesce(pr.push_level, 'requests')
            when 'all' then true
            when 'requests' then n.kind in ('anointing', 'certificate', 'ocia', 'blood', 'donor', 'census', 'gkk_history',
                                            'gkk_structure', 'gkk_structure_review', 'duplicate_flag', 'duplicate_flag_review')
            when 'urgent' then n.urgent
            else false
          end
        end;
$$;

revoke all on function public.notification_push_targets(bigint) from public, anon, authenticated;
grant execute on function public.notification_push_targets(bigint) to service_role;
