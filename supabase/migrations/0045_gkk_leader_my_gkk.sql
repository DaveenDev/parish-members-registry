-- My GKK: a GKK leader keeps their own GKK's page. Run after
-- 0044_gkk_history_documents.sql, then redeploy the media-upload function
-- (GKK leaders may now add photos to their GKK's history). Safe to re-run.
--
-- A GKK leader may change, for their own GKK only: the chapel address,
-- puroks, year established, meeting schedule and place, and the history
-- (text and photos). Not its name, last year's household count or anything
-- else, and never another GKK. Staff with full access publish the history:
-- a leader can't tick "Show on the public website", and when a leader
-- changes a history, it goes back to a draft until staff publish it again.

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'gkks' and column_name = 'history_published') then
    raise exception 'Run 0044_gkk_history_documents.sql before this migration';
  end if;
end;
$$;

-- Keep in sync with LEADER_GKK_FIELDS in client/src/components/MyGkk.jsx.
create or replace function public.gkk_leader_fields() returns text[]
language sql immutable as $$
  select array['chapel_address', 'puroks', 'year_established', 'meeting_schedule', 'meeting_place', 'history', 'history_photos'];
$$;

-- As in 0014, plus: a GKK leader may update those fields of their own GKK.
create or replace function public.guard_staff_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  acc text := staff_access();
  area text := tg_argv[0];
  mine text := staff_gkk();
  ok boolean := false;
begin
  if acc is null or acc = 'full' then
    ok := true;
  elsif acc = 'website' then
    ok := area in ('website', 'requests');
    -- (nested, since only gkks rows have a name to compare)
    if area = 'gkks' and tg_op = 'UPDATE' then
      ok := new.name = old.name;
    end if;
  elsif acc = 'gkk_leader' and area = 'registry' and tg_op <> 'DELETE' then
    if tg_table_name = 'households' then
      ok := new.gkk = mine and (tg_op = 'INSERT' or old.gkk = mine);
    else
      ok := exists (select 1 from households h where h.id = new.household_id and h.gkk = mine)
        and (tg_op = 'INSERT' or exists (select 1 from households h where h.id = old.household_id and h.gkk = mine));
    end if;
    if not ok then
      raise exception 'Your account can only change households in %', mine using errcode = '42501';
    end if;
  elsif acc = 'gkk_leader' and area = 'verification' and tg_op = 'DELETE' then
    ok := exists (select 1 from members m join households h on h.id = m.household_id
                  where m.id = old.member_id and h.gkk = mine);
  elsif acc = 'gkk_leader' and area = 'gkks' and tg_op = 'UPDATE' then
    -- Everything but the leader's fields must stay as it was.
    ok := old.name = mine
      and (to_jsonb(new) - gkk_leader_fields()) = (to_jsonb(old) - gkk_leader_fields());
    if not ok then
      raise exception 'Your account can only change the chapel details and history of %', coalesce(mine, 'your GKK') using errcode = '42501';
    end if;
  end if;

  if not ok then
    raise exception '%', case acc
      when 'read_only' then 'Your account can view records but not change them'
      when 'gkk_leader' then 'Your account can only update the households and members of your GKK'
      else 'Your account can''t change this. Ask a staff admin.'
    end using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.guard_staff_write() from public, anon, authenticated;

-- A leader's change to a history takes it off the website until staff
-- publish it again. Runs after trg_00_guard_staff_write.
create or replace function public.gkks_leader_history_draft() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if staff_access() = 'gkk_leader'
     and (new.history is distinct from old.history or new.history_photos is distinct from old.history_photos) then
    new.history_published := false;
  end if;
  return new;
end;
$$;

revoke all on function public.gkks_leader_history_draft() from public, anon, authenticated;

drop trigger if exists trg_gkks_leader_history_draft on gkks;
create trigger trg_gkks_leader_history_draft before update on gkks
  for each row execute function gkks_leader_history_draft();
