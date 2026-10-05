-- Organization Structure: org charts the secretary draws in the admin
-- (Parish life → Organization Structure) and publishes on the website
-- (Komunidad → Organisasyon, and "Mga Opisyal" on each GKK's page).
-- Run after 0056_member_answers_edit.sql. Safe to re-run.
--
-- Two charts come with it and can't be deleted:
--   Church Structure  the parish (Parish Priest, PPC, clusters, …)
--   GKK Structure     one structure shared by every GKK. A position can be
--                     linked to a GKK role (members.gkk_role), and each GKK's
--                     page fills it with that GKK's member holding the role.
-- Staff with full access can add more charts.
--
-- A position linked to the parish positions list (e.g. "PPC Secretary") and
-- held by a registered member sets that member's Katungdanan sa Parish
-- (members.parish_role) when the chart is saved, so the registry and the
-- chart agree; taking them off the position clears it again.
--
-- Everyone signed in to the admin can look at the charts; only full access
-- can change them (the same rule as the Ministries & organizations lists).
-- All changes go through the functions below, which log them in the
-- activity log. The website reads published charts through
-- public_org_charts() and public_org_chart(), which return names, photos and
-- notes only: no member ids or contact details.

do $$
begin
  if to_regprocedure('public.save_member_answers(integer, jsonb)') is null then
    raise exception 'Run 0056_member_answers_edit.sql before this migration';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists org_charts (
  id         serial primary key,
  title      text not null,
  slug       text unique not null,
  scope      text not null default 'parish' check (scope in ('parish', 'gkk')),
  builtin    boolean not null default false,  -- Church Structure and GKK Structure: can't be deleted
  published  boolean not null default false,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);

-- One GKK Structure: it's the template every GKK's page shares.
create unique index if not exists org_charts_one_gkk_structure on org_charts (scope) where scope = 'gkk';

create table if not exists org_nodes (
  id            serial primary key,
  chart_id      integer not null references org_charts on delete cascade,
  parent_id     integer references org_nodes on delete set null,  -- null: a top position
  title         text not null,
  -- Linked to the parish positions list: the chart shows that name, and
  -- follows it when the position is renamed.
  position_name text references parish_positions(name) on update cascade on delete set null,
  gkk_role      text,           -- GKK Structure only: one of org_gkk_roles()
  member_id     integer references members on delete set null,  -- the holder, when registered (not on the GKK Structure)
  holder_name   text,           -- the holder, typed in, when not registered
  photo_url     text,           -- shown on the website
  note          text,           -- e.g. the term, "2025–2028"
  sort_order    integer not null default 0,  -- among its siblings, left to right
  pos_x         real,           -- where the admin editor draws it
  pos_y         real
);
create index if not exists org_nodes_chart_idx on org_nodes (chart_id);

-- GKK Structure only: one GKK's holder of one position. For positions with
-- no GKK role (e.g. "Lector Coordinator"), or to put another name or a photo
-- on a position the registry fills.
create table if not exists org_gkk_holders (
  node_id     integer not null references org_nodes on delete cascade,
  gkk         text not null references gkks(name) on update cascade on delete cascade,
  member_id   integer references members on delete set null,
  holder_name text,
  photo_url   text,
  note        text,
  primary key (node_id, gkk)
);

-- Read by every signed-in staff account; written only through the functions below.
alter table org_charts enable row level security;
alter table org_nodes enable row level security;
alter table org_gkk_holders enable row level security;

drop policy if exists org_charts_staff_select on org_charts;
create policy org_charts_staff_select on org_charts for select to authenticated using ((select staff_access()) is not null);
drop policy if exists org_nodes_staff_select on org_nodes;
create policy org_nodes_staff_select on org_nodes for select to authenticated using ((select staff_access()) is not null);
drop policy if exists org_gkk_holders_staff_select on org_gkk_holders;
create policy org_gkk_holders_staff_select on org_gkk_holders for select to authenticated using ((select staff_access()) is not null);

revoke all on org_charts, org_nodes, org_gkk_holders from anon;
revoke insert, update, delete, truncate on org_charts, org_nodes, org_gkk_holders from authenticated;
grant select on org_charts, org_nodes, org_gkk_holders to authenticated;

-- The GKK roles a GKK Structure position can be linked to. Keep in sync with
-- GKK_ROLES in client/src/constants.js.
create or replace function public.org_gkk_roles() returns text[]
language sql immutable as $$
  select array['GKK President', 'Vice-President', 'Secretary', 'Treasurer', 'Business Manager'];
$$;

-- ---------------------------------------------------------------------------
-- The two built-in charts, with a starting structure the secretary can change.
-- ---------------------------------------------------------------------------

do $$
declare
  church integer;
  gkk integer;
  top integer;
  ppc integer;
begin
  insert into org_charts (title, slug, scope, builtin, sort_order)
  values ('Church Structure', 'church-structure', 'parish', true, 0)
  on conflict (slug) do nothing
  returning id into church;
  if church is not null then
    insert into org_nodes (chart_id, title, sort_order) values (church, 'Parish Priest', 0) returning id into top;
    insert into org_nodes (chart_id, parent_id, title, position_name, sort_order)
    values (church, top, 'PPC President', (select name from parish_positions where name = 'PPC President'), 0)
    returning id into ppc;
    insert into org_nodes (chart_id, parent_id, title, position_name, sort_order)
    select church, ppc, t.name, (select name from parish_positions p where p.name = t.name), t.ord
    from (values ('PPC Vice-President', 0), ('PPC Secretary', 1), ('PPC Treasurer', 2)) as t(name, ord);
  end if;

  if not exists (select 1 from org_charts where scope = 'gkk') then
    insert into org_charts (title, slug, scope, builtin, sort_order)
    values ('GKK Structure', 'gkk-structure', 'gkk', true, 1)
    on conflict (slug) do nothing
    returning id into gkk;
  end if;
  if gkk is not null then
    insert into org_nodes (chart_id, title, gkk_role, sort_order) values (gkk, 'GKK President', 'GKK President', 0) returning id into top;
    insert into org_nodes (chart_id, parent_id, title, gkk_role, sort_order)
    select gkk, top, r.role, r.role, r.ord
    from (values ('Vice-President', 0), ('Secretary', 1), ('Treasurer', 2), ('Business Manager', 3)) as r(role, ord);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- A chart as a tree of positions and their holders
-- ---------------------------------------------------------------------------

create or replace function public.org_member_name(p_id integer) returns text
language sql stable security definer set search_path = public as $$
  select nullif(trim(concat_ws(' ', first_name, last_name, suffix)), '') from members where id = p_id;
$$;

/**
 * [{ id, parentId, title, holders: [name…], photo, note, source }] for a
 * chart, siblings in order. On the GKK Structure, `p_gkk` fills in that
 * GKK's holders: its org_gkk_holders row, else its members (still in the
 * parish) whose GKK role is the position's, oldest record first; without
 * `p_gkk` the structure comes back bare. `source` is 'set' (typed or picked
 * for the position), 'registry' (from members' GKK roles) or null (vacant).
 * Not for the public directly: public_org_chart() checks it's published.
 */
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
        when (select scope from c) = 'parish' then coalesce(org_member_name(n.member_id), nullif(trim(n.holder_name), ''))
        when (n.h).node_id is not null then coalesce(org_member_name((n.h).member_id), nullif(trim((n.h).holder_name), ''))
      end as set_name,
      case when (select scope from c) = 'gkk' and p_gkk is not null and n.gkk_role is not null then (
        select coalesce(jsonb_agg(nullif(trim(concat_ws(' ', m.first_name, m.last_name, m.suffix)), '') order by m.id), '[]'::jsonb)
        from members m join households hh on hh.id = m.household_id
        where hh.gkk = p_gkk and m.gkk_role = n.gkk_role
          and coalesce(m.membership_status not in ('Moved away', 'Deceased', 'Left the Church'), true)
      ) else '[]'::jsonb end as role_names
    from n
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'parentId', r.parent_id,
      'title', coalesce(r.position_name, r.title),
      'holders', case when r.set_name is not null then jsonb_build_array(r.set_name) else r.role_names end,
      'photo', case when (select scope from c) = 'gkk' then nullif(trim((r.h).photo_url), '') else nullif(trim(r.photo_url), '') end,
      'note', coalesce(nullif(trim((r.h).note), ''), nullif(trim(r.note), '')),
      'source', case when r.set_name is not null then 'set' when jsonb_array_length(r.role_names) > 0 then 'registry' end
    ) order by r.sort_order, r.id), '[]'::jsonb)
  from r;
$$;

revoke all on function public.org_chart_tree(integer, text) from public, anon, authenticated;
revoke all on function public.org_member_name(integer) from public, anon, authenticated;

/** The tree for staff, published or not: the editor's "Preview as GKK…". */
create or replace function public.org_chart_preview(p_chart_id integer, p_gkk text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if staff_access() is null then
    raise exception 'Please sign in again' using errcode = '42501';
  end if;
  return org_chart_tree(p_chart_id, p_gkk);
end;
$$;

revoke all on function public.org_chart_preview(integer, text) from public, anon;
grant execute on function public.org_chart_preview(integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Public website
-- ---------------------------------------------------------------------------

/** The published charts, in order: [{ title, slug, scope }]. */
create or replace function public.public_org_charts() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('title', title, 'slug', slug, 'scope', scope) order by sort_order, id), '[]'::jsonb)
  from org_charts where published;
$$;

/**
 * One published chart: { title, slug, scope, nodes } (nodes as in
 * org_chart_tree), or null. `p_gkk` fills in the GKK Structure for that GKK.
 */
create or replace function public.public_org_chart(p_slug text, p_gkk text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'title', c.title, 'slug', c.slug, 'scope', c.scope,
    'nodes', org_chart_tree(c.id, case when c.scope = 'gkk' then (select name from gkks where name = p_gkk) end))
  from org_charts c
  where c.slug = p_slug and c.published;
$$;

grant execute on function public.public_org_charts() to anon, authenticated;
grant execute on function public.public_org_chart(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Changes (full access), each logged in the activity log
-- ---------------------------------------------------------------------------

create or replace function public.org_chart_log(p_action text, p_chart org_charts, p_changes jsonb) returns void
language sql security definer set search_path = public as $$
  insert into activity_log (actor, actor_name, action, table_name, record_id, label, changes)
  values (auth.uid(), current_staff_name(), p_action, 'org_charts', p_chart.id::text, p_chart.title, p_changes);
$$;

revoke all on function public.org_chart_log(text, org_charts, jsonb) from public, anon, authenticated;

/** A new chart (on the parish level) after the others. Returns the row. */
create or replace function public.create_org_chart(p_title text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t text := trim(coalesce(p_title, ''));
  base text;
  s text;
  i integer := 2;
  c org_charts;
begin
  perform require_full_access('change the organization charts');
  if t = '' then raise exception 'Give the chart a title'; end if;
  if length(t) > 80 then raise exception 'Keep the title under 80 characters'; end if;
  base := coalesce(nullif(trim(both '-' from regexp_replace(lower(t), '[^a-z0-9]+', '-', 'g')), ''), 'chart');
  s := base;
  while exists (select 1 from org_charts where slug = s) loop
    s := base || '-' || i;
    i := i + 1;
  end loop;
  insert into org_charts (title, slug, scope, sort_order)
  values (t, s, 'parish', coalesce((select max(sort_order) from org_charts), 0) + 1)
  returning * into c;
  perform org_chart_log('insert', c, null);
  return to_jsonb(c);
end;
$$;

/** Rename a chart and/or publish or unpublish it (a null leaves that as it is). Returns the row. */
create or replace function public.update_org_chart(p_id integer, p_title text default null, p_published boolean default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  old org_charts;
  c org_charts;
  t text := nullif(trim(coalesce(p_title, '')), '');
  diff jsonb := '{}'::jsonb;
begin
  perform require_full_access('change the organization charts');
  select * into old from org_charts where id = p_id for update;
  if old.id is null then raise exception 'Chart not found'; end if;
  if p_title is not null and t is null then raise exception 'Give the chart a title'; end if;
  if length(t) > 80 then raise exception 'Keep the title under 80 characters'; end if;
  update org_charts set
    title = coalesce(t, title),
    published = coalesce(p_published, published),
    updated_at = now()
  where id = p_id
  returning * into c;
  if c.title is distinct from old.title then diff := diff || jsonb_build_object('title', jsonb_build_array(old.title, c.title)); end if;
  if c.published is distinct from old.published then diff := diff || jsonb_build_object('published', jsonb_build_array(old.published, c.published)); end if;
  if diff <> '{}'::jsonb then perform org_chart_log('update', c, diff); end if;
  return to_jsonb(c);
end;
$$;

/** The (member, parish position) pairs a chart's positions link: [{ m, p }]. */
create or replace function public.org_parish_links(p_chart_id integer) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('m', n.member_id, 'p', n.position_name)), '[]'::jsonb)
  from org_nodes n join org_charts c on c.id = n.chart_id
  where n.chart_id = p_chart_id and c.scope = 'parish' and n.member_id is not null and n.position_name is not null;
$$;

/**
 * Keep each member's "Katungdanan sa Parish" (members.parish_role) in step
 * with the charts, for the members in `p_old` (a chart's links before a
 * change) and `p_new` (after). A member holding a position linked to the
 * parish positions list gets it as their parish role; one holding several
 * keeps theirs if it's one of them, else gets the first. A member who no
 * longer holds any loses the role the chart gave them, and only that one.
 * Returns what changed: [{ memberId, name, from, to }].
 */
create or replace function public.org_sync_parish_roles(p_old jsonb, p_new jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  mid integer;
  held text[];
  cur text;
  target text;
  changes jsonb := '[]'::jsonb;
begin
  for mid in
    select distinct (e->>'m')::integer from jsonb_array_elements(coalesce(p_old, '[]'::jsonb) || coalesce(p_new, '[]'::jsonb)) e
  loop
    select parish_role into cur from members where id = mid;
    continue when not found;
    held := array(
      select n.position_name from org_nodes n join org_charts c on c.id = n.chart_id
      where c.scope = 'parish' and n.member_id = mid and n.position_name is not null
      group by n.position_name order by min(n.id));
    if cardinality(held) > 0 then
      target := case when cur = any(held) then cur else held[1] end;
    elsif exists (select 1 from jsonb_array_elements(coalesce(p_old, '[]'::jsonb)) e where (e->>'m')::integer = mid and e->>'p' = cur) then
      target := null;
    else
      continue;
    end if;
    if target is distinct from cur then
      -- The members write guard and activity log see this as the staff member's change.
      update members set parish_role = target where id = mid;
      changes := changes || jsonb_build_array(jsonb_build_object('memberId', mid, 'name', org_member_name(mid), 'from', cur, 'to', target));
    end if;
  end loop;
  return changes;
end;
$$;

revoke all on function public.org_parish_links(integer) from public, anon, authenticated;
revoke all on function public.org_sync_parish_roles(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.delete_org_chart(p_id integer) returns void
language plpgsql security definer set search_path = public as $$
declare
  c org_charts;
  positions integer;
  links jsonb;
begin
  perform require_full_access('change the organization charts');
  select * into c from org_charts where id = p_id;
  if c.id is null then raise exception 'Chart not found'; end if;
  if c.builtin then raise exception '% can''t be deleted. Unpublish it to take it off the website.', c.title; end if;
  select count(*) into positions from org_nodes where chart_id = p_id;
  links := org_parish_links(p_id);
  delete from org_charts where id = p_id;
  perform org_chart_log('delete', c, jsonb_build_object('positions', positions));
  perform org_sync_parish_roles(links, null);
end;
$$;

/**
 * Save the whole chart from the editor in one go. `p_nodes` is every
 * position: [{ key, id?, parentKey?, title, positionName?, gkkRole?,
 * memberId?, holderName?, photoUrl?, note?, sortOrder, x, y }]. `key` names
 * a position within this call (its id, or a temporary key for a new one) and
 * `parentKey` is its parent's key. Positions not in the list are deleted.
 * Refuses a position placed under itself, directly or further down.
 * Holders' parish roles follow (org_sync_parish_roles).
 * Returns { keys: { key: id }, roles: [{ memberId, name, from, to }] }.
 */
create or replace function public.save_org_chart(p_chart_id integer, p_nodes jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c org_charts;
  n jsonb;
  keymap jsonb := '{}'::jsonb;
  kept integer[] := '{}';
  nid integer;
  pid integer;
  old_count integer;
  t text;
  pos text;
  role text;
  mem integer;
  photo text;
  looped text;
  links jsonb;
  roles jsonb;
begin
  perform require_full_access('change the organization charts');
  select * into c from org_charts where id = p_chart_id for update;
  if c.id is null then raise exception 'Chart not found'; end if;
  if jsonb_typeof(p_nodes) is distinct from 'array' then raise exception 'Nothing to save'; end if;
  if jsonb_array_length(p_nodes) > 500 then raise exception 'A chart can have at most 500 positions'; end if;
  select count(*) into old_count from org_nodes where chart_id = p_chart_id;
  links := org_parish_links(p_chart_id);

  -- Each position, without its parent yet (a new parent may come later in the list).
  for n in select * from jsonb_array_elements(p_nodes) loop
    if coalesce(n->>'key', '') = '' then raise exception 'Each position needs a key'; end if;
    if keymap ? (n->>'key') then raise exception 'Two positions have the same key'; end if;
    pos := (select name from parish_positions where name = nullif(trim(n->>'positionName'), ''));
    t := coalesce(pos, nullif(trim(n->>'title'), ''));
    if t is null then raise exception 'Every position needs a title'; end if;
    if length(t) > 120 then raise exception 'Keep position titles under 120 characters'; end if;
    if length(coalesce(n->>'note', '')) > 300 then raise exception 'Keep the note on "%" under 300 characters', t; end if;
    if length(coalesce(n->>'holderName', '')) > 120 then raise exception 'Keep the name on "%" under 120 characters', t; end if;
    photo := nullif(trim(n->>'photoUrl'), '');
    if photo is not null and photo !~* '^https://' then raise exception 'The photo on "%" isn''t an uploaded photo', t; end if;

    role := nullif(trim(n->>'gkkRole'), '');
    mem := case when (n->>'memberId') ~ '^\d+$' then (n->>'memberId')::integer end;
    if c.scope = 'gkk' then
      if role is not null and not (role = any(org_gkk_roles())) then raise exception 'Unknown GKK role: %', role; end if;
      -- Each GKK has its own holders (org_gkk_holders).
      mem := null;
    else
      role := null;
      if mem is not null and not exists (select 1 from members where id = mem) then
        raise exception 'The member holding "%" is no longer in the registry', t;
      end if;
    end if;

    nid := case when (n->>'id') ~ '^\d+$' then (n->>'id')::integer end;
    if nid is not null and exists (select 1 from org_nodes where id = nid and chart_id = p_chart_id) then
      update org_nodes set
        title = t, position_name = pos, gkk_role = role, member_id = mem,
        holder_name = case when c.scope = 'gkk' then null else nullif(trim(n->>'holderName'), '') end,
        photo_url = case when c.scope = 'gkk' then null else photo end,
        note = nullif(trim(n->>'note'), ''),
        sort_order = coalesce((n->>'sortOrder')::integer, 0),
        pos_x = (n->>'x')::real, pos_y = (n->>'y')::real
      where id = nid;
    else
      insert into org_nodes (chart_id, title, position_name, gkk_role, member_id, holder_name, photo_url, note, sort_order, pos_x, pos_y)
      values (p_chart_id, t, pos, role, mem,
              case when c.scope = 'gkk' then null else nullif(trim(n->>'holderName'), '') end,
              case when c.scope = 'gkk' then null else photo end,
              nullif(trim(n->>'note'), ''), coalesce((n->>'sortOrder')::integer, 0), (n->>'x')::real, (n->>'y')::real)
      returning id into nid;
    end if;
    keymap := keymap || jsonb_build_object(n->>'key', nid);
    kept := kept || nid;
  end loop;

  -- Then the parents.
  for n in select * from jsonb_array_elements(p_nodes) loop
    nid := (keymap->>(n->>'key'))::integer;
    pid := null;
    if coalesce(n->>'parentKey', '') <> '' then
      if not keymap ? (n->>'parentKey') then raise exception 'A position is under one that isn''t in this chart'; end if;
      pid := (keymap->>(n->>'parentKey'))::integer;
    end if;
    update org_nodes set parent_id = pid where id = nid and parent_id is distinct from pid;
  end loop;

  delete from org_nodes where chart_id = p_chart_id and not (id = any(kept));

  -- No position under itself: walk up from each one.
  with recursive up(start_id, cur_id, depth) as (
    select id, parent_id, 1 from org_nodes where chart_id = p_chart_id and parent_id is not null
    union all
    select up.start_id, o.parent_id, up.depth + 1
    from up join org_nodes o on o.id = up.cur_id
    where o.parent_id is not null and up.cur_id <> up.start_id and up.depth <= 501
  )
  select coalesce(o.position_name, o.title) into looped
  from up join org_nodes o on o.id = up.start_id
  where up.cur_id = up.start_id
  limit 1;
  if looped is not null then
    raise exception '"%" can''t be under one of the positions below it', looped;
  end if;

  update org_charts set updated_at = now() where id = p_chart_id;
  perform org_chart_log('update', c, jsonb_build_object('positions', jsonb_build_array(old_count, cardinality(kept))));
  -- A holder picked from the registry for a linked position gets it as their Katungdanan sa Parish.
  roles := org_sync_parish_roles(links, org_parish_links(p_chart_id));
  return jsonb_build_object('keys', keymap, 'roles', roles);
end;
$$;

/**
 * One GKK's holder of a GKK Structure position: a member of that GKK or a
 * typed name, a photo and a note. All empty takes the row away, so the
 * position goes back to the member with its GKK role (or vacant).
 */
create or replace function public.save_org_gkk_holder(
  p_node_id integer, p_gkk text, p_member_id integer, p_holder_name text, p_photo_url text, p_note text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  c org_charts;
  node org_nodes;
  name_val text := nullif(trim(coalesce(p_holder_name, '')), '');
  photo text := nullif(trim(coalesce(p_photo_url, '')), '');
  note_val text := nullif(trim(coalesce(p_note, '')), '');
  before text;
  after text;
begin
  perform require_full_access('change the organization charts');
  select * into node from org_nodes where id = p_node_id;
  select * into c from org_charts where id = node.chart_id;
  if node.id is null or c.scope is distinct from 'gkk' then raise exception 'That position isn''t on the GKK Structure'; end if;
  if not exists (select 1 from gkks where name = p_gkk) then raise exception 'Unknown GKK: %', p_gkk; end if;
  if p_member_id is not null and not exists (
    select 1 from members m join households h on h.id = m.household_id where m.id = p_member_id and h.gkk = p_gkk
  ) then
    raise exception 'Pick a member of %', p_gkk;
  end if;
  if length(name_val) > 120 then raise exception 'Keep the name under 120 characters'; end if;
  if length(note_val) > 300 then raise exception 'Keep the note under 300 characters'; end if;
  if photo is not null and photo !~* '^https://' then raise exception 'That photo isn''t an uploaded photo'; end if;

  select coalesce(org_member_name(member_id), holder_name) into before from org_gkk_holders where node_id = p_node_id and gkk = p_gkk;
  if p_member_id is null and name_val is null and photo is null and note_val is null then
    delete from org_gkk_holders where node_id = p_node_id and gkk = p_gkk;
  else
    insert into org_gkk_holders (node_id, gkk, member_id, holder_name, photo_url, note)
    values (p_node_id, p_gkk, p_member_id, case when p_member_id is null then name_val end, photo, note_val)
    on conflict (node_id, gkk) do update set
      member_id = excluded.member_id, holder_name = excluded.holder_name,
      photo_url = excluded.photo_url, note = excluded.note;
  end if;
  after := coalesce(org_member_name(p_member_id), case when p_member_id is null then name_val end);
  perform org_chart_log('update', c, jsonb_build_object(
    'gkk', p_gkk, 'position', coalesce(node.position_name, node.title), 'holder', jsonb_build_array(before, after)));
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'create_org_chart(text)', 'update_org_chart(integer, text, boolean)', 'delete_org_chart(integer)',
    'save_org_chart(integer, jsonb)', 'save_org_gkk_holder(integer, text, integer, text, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
