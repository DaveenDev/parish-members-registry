-- A GKK's officers show on its public page only when each person has agreed
-- (the Data Privacy Act, and the website design brief: no names unless the
-- person agreed). Run after 0104_backup_status.sql. Safe to re-run.
--
-- * org_gkk_officers.show_publicly / consent_on: whether this person's name
--   is on the website, and the day the office noted their agreement. The
--   GKK leader or the office ticks "Show on the website" beside each person
--   in Leaders & Structure.
-- * Officers already on the website keep showing (the office decided that
--   earlier): they are marked as showing, with no date. To start from
--   nobody, run:  update org_gkk_officers set show_publicly = false;
-- * A new person starts hidden. A position with nobody showing reads "—"
--   on the website, not "Bakante".
-- * org_chart_tree (the website's chart) leaves out officers not showing;
--   gkk_structure_officers (the editor) returns the flag; save_gkk_structure
--   takes it as `showPublicly`.

do $$
begin
  if to_regclass('public.org_gkk_officers') is null then
    raise exception 'Run the migrations up to 0081_gkk_structure_leaders.sql before this one';
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'org_gkk_officers' and column_name = 'show_publicly') then
    alter table org_gkk_officers add column show_publicly boolean not null default false;
    alter table org_gkk_officers add column consent_on date;
    -- Those on the website now keep showing.
    update org_gkk_officers set show_publicly = true where not draft;
    update org_gkk_officers d set show_publicly = true
    where d.draft and exists (select 1 from org_gkk_officers l
                              where l.gkk = d.gkk and not l.draft and l.node_id = d.node_id
                                and l.show_publicly
                                and case when d.member_id is not null then l.member_id = d.member_id
                                         else l.member_id is null and lower(l.holder_name) = lower(d.holder_name) end);
  end if;
end;
$$;

create or replace function public.org_chart_tree(p_chart_id integer, p_gkk text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with c as (select * from org_charts where id = p_chart_id),
  n as (
    select o.*,
      case when c.scope = 'gkk' and p_gkk is not null
        then (select h from org_gkk_holders h where h.node_id = o.id and h.gkk = p_gkk) end as h
    from org_nodes o cross join c
    where o.chart_id = c.id
  ),
  r as (
    select n.*,
      case
        when (select scope from c) = 'parish' then
          case when coalesce(org_member_name(n.member_id), nullif(trim(n.holder_name), '')) is not null
               then jsonb_build_array(coalesce(org_member_name(n.member_id), nullif(trim(n.holder_name), '')))
               else '[]'::jsonb end
        when p_gkk is not null then (
          select coalesce(jsonb_agg(coalesce(org_member_name(x.member_id), x.holder_name)
                                    || case when x.note is not null then ' (' || x.note || ')' else '' end
                                    order by x.sort_order, x.id), '[]'::jsonb)
          from org_gkk_officers x
          where x.node_id = n.id and x.gkk = p_gkk and not x.draft and x.show_publicly)
        else '[]'::jsonb
      end as names
    from n
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'parentId', r.parent_id,
      'title', coalesce(r.position_name, r.title),
      'holders', r.names,
      'photo', case when (select scope from c) = 'gkk' then nullif(trim((r.h).photo_url), '') else nullif(trim(r.photo_url), '') end,
      'note', coalesce(nullif(trim((r.h).note), ''), nullif(trim(r.note), '')),
      'source', case when jsonb_array_length(r.names) > 0 then 'set' end
    ) order by r.sort_order, r.id), '[]'::jsonb)
  from r;
$$;

create or replace function public.gkk_structure_officers(p_gkk text, p_draft boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'nodeId', o.node_id, 'memberId', o.member_id,
      'name', coalesce(org_member_name(o.member_id), o.holder_name),
      'firstName', m.first_name, 'middleName', m.middle_name, 'lastName', m.last_name, 'suffix', m.suffix,
      'dob', m.dob, 'note', o.note,
      'showPublicly', o.show_publicly, 'consentOn', o.consent_on
    ) order by o.node_id, o.sort_order, o.id), '[]'::jsonb)
  from org_gkk_officers o left join members m on m.id = o.member_id
  where o.gkk = p_gkk and o.draft = p_draft;
$$;

/**
 * Save a GKK's officers: `p_officers` is every person, in order:
 * [{ nodeId, memberId?, name?, note?, showPublicly? }] (a member of the GKK,
 * or a typed full name; showPublicly: they agreed to be on the website).
 * `p_action`:
 *   'draft'    the leader's changes, kept for later (takes back a sent one);
 *   'submit'   sent to the parish office, which is alerted;
 *   'publish'  full access: approved, on the website now.
 * Returns gkk_structure().
 */
create or replace function public.save_gkk_structure(p_gkk text, p_officers jsonb, p_action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  chart integer;
  o jsonb;
  node org_nodes;
  mem integer;
  nm text;
  note_val text;
  i integer := 0;
  s org_gkk_structures;
  who text := current_staff_name();
  gid integer;
  label text;
  show_val boolean;
  prev_on date;
begin
  if p_action is null or p_action not in ('draft', 'submit', 'publish') then raise exception 'Unknown action'; end if;
  perform gkk_structure_access(p_gkk, true);
  if p_action = 'publish' then perform require_full_access('approve a GKK structure'); end if;
  if jsonb_typeof(p_officers) is distinct from 'array' then raise exception 'Nothing to save'; end if;
  if jsonb_array_length(p_officers) > 500 then raise exception 'A structure can have at most 500 names'; end if;
  select id into chart from org_charts where scope = 'gkk';
  select id into gid from gkks where name = p_gkk;

  -- One save at a time per GKK.
  insert into org_gkk_structures (gkk) values (p_gkk) on conflict (gkk) do nothing;
  select * into s from org_gkk_structures where gkk = p_gkk for update;

  delete from org_gkk_officers where gkk = p_gkk and draft;
  for o in select * from jsonb_array_elements(p_officers) loop
    i := i + 1;
    node := null;
    select * into node from org_nodes
    where chart_id = chart and id = case when (o->>'nodeId') ~ '^\d+$' then (o->>'nodeId')::integer end;
    if node.id is null then raise exception 'A position here is no longer on the GKK Structure. Reload the page.'; end if;
    label := coalesce(node.position_name, node.title);
    mem := case when (o->>'memberId') ~ '^\d+$' then (o->>'memberId')::integer end;
    if mem is not null then
      if not exists (select 1 from members m join households h on h.id = m.household_id where m.id = mem and h.gkk = p_gkk)
         and not exists (select 1 from org_gkk_officers x where x.gkk = p_gkk and not x.draft and x.member_id = mem) then
        raise exception '% isn''t a member of %. Pick a member of this GKK, or type the name.', coalesce(org_member_name(mem), 'This person'), p_gkk;
      end if;
      nm := coalesce(org_member_name(mem), nullif(trim(o->>'name'), ''));
      if nm is null then raise exception 'A member picked for % is no longer in the registry', label; end if;
    else
      nm := nullif(trim(regexp_replace(coalesce(o->>'name', ''), '\s+', ' ', 'g')), '');
      if nm is null then raise exception 'Type the full name for %, or pick a member', label; end if;
    end if;
    if length(nm) > 120 then raise exception 'Keep names under 120 characters'; end if;
    note_val := nullif(trim(coalesce(o->>'note', '')), '');
    if length(note_val) > 60 then raise exception 'Keep the note by % under 60 characters', nm; end if;
    if exists (select 1 from org_gkk_officers x where x.gkk = p_gkk and x.draft and x.node_id = node.id
               and case when mem is not null then x.member_id = mem
                        else x.member_id is null and lower(x.holder_name) = lower(nm) end) then
      raise exception '% is in % twice', nm, label;
    end if;
    if node.max_holders is not null
       and (select count(*) from org_gkk_officers x where x.gkk = p_gkk and x.draft and x.node_id = node.id) >= node.max_holders then
      raise exception '% takes % at most', label, case when node.max_holders = 1 then 'one person' else node.max_holders || ' people' end;
    end if;
    show_val := coalesce((o->>'showPublicly')::boolean, false);
    -- The day the agreement was noted: kept while it stays ticked.
    select x.consent_on into prev_on from org_gkk_officers x
    where x.gkk = p_gkk and not x.draft and x.node_id = node.id
      and case when mem is not null then x.member_id = mem
               else x.member_id is null and lower(x.holder_name) = lower(nm) end
    limit 1;
    insert into org_gkk_officers (node_id, gkk, draft, member_id, holder_name, note, sort_order, show_publicly, consent_on)
    values (node.id, p_gkk, true, mem, nm, note_val, i, show_val,
            case when show_val then coalesce(prev_on, nullif(o->>'consentOn', '')::date, public.parish_today()) end);
  end loop;

  if p_action = 'publish' then
    perform gkk_structure_apply(p_gkk);
    update org_gkk_structures set
      status = null, review_note = null,
      saved_at = now(), saved_by = auth.uid(), saved_by_name = who,
      reviewed_at = case when s.status = 'submitted' then now() else reviewed_at end,
      reviewed_by_name = case when s.status = 'submitted' then who else reviewed_by_name end,
      approved_at = now(), approved_by_name = who
    where gkk = p_gkk;
    perform gkk_structure_log(p_gkk, case when s.status = 'submitted' then 'approved' else 'saved by the parish office' end);
    if s.status = 'submitted' then
      perform gkk_structure_notify('gkk_structure_review', 'leader', p_gkk, 'GKK structure approved',
        p_gkk || ': the parish office approved the officers. Those who agreed are on the website now.', '/admin/settings?tab=mygkk&view=structure');
    end if;
  else
    update org_gkk_structures set
      status = case when p_action = 'submit' then 'submitted' else 'draft' end,
      saved_at = now(), saved_by = auth.uid(), saved_by_name = who,
      submitted_at = case when p_action = 'submit' then now() else submitted_at end,
      submitted_by_name = case when p_action = 'submit' then who else submitted_by_name end,
      review_note = case when p_action = 'submit' then null else review_note end
    where gkk = p_gkk;
    perform gkk_structure_log(p_gkk, case when p_action = 'submit' then 'sent for approval' else 'draft saved' end);
    if p_action = 'submit' then
      perform gkk_structure_notify('gkk_structure', 'website', p_gkk, 'GKK structure to approve',
        p_gkk || ': ' || coalesce(who, 'the GKK leader') || ' sent the GKK officers for approval.',
        '/admin/settings?tab=gkk&structure=' || gid);
    end if;
  end if;
  return gkk_structure(p_gkk);
end;
$$;
