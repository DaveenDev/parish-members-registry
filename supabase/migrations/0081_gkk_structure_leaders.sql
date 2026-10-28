-- GKK Structure filled in by each GKK, approved by the parish office. Run
-- after 0080_history_video.sql. Safe to re-run.
--
-- Screens: GKK Config → My GKK → Leaders & Structure (the GKK leader) and
-- Parish Config → Parish GKK → a GKK → Leaders & Structure (the parish office).
--
-- * The GKK Structure (00571) stays one template for every GKK, now with
--   the Formation Ministry's form: officers, the Formation, Service and
--   Worship ministries and the family groups. Missing positions are added;
--   nothing the office already set up is moved or removed. Each position
--   says how many people it takes (org_nodes.max_holders; null: any number).
-- * org_gkk_officers: each GKK's people in each position, several per
--   position, a registered member of the GKK or a typed full name. Rows with
--   `draft` are the leader's changes waiting for approval; the others are on
--   the website. The website and the registry no longer read the officers
--   from members.gkk_role: what it showed is copied in once, here.
-- * org_gkk_structures: per GKK, where its changes are (draft, sent to the
--   office, sent back with a note) and when it was last approved.
-- * The GKK leader saves a draft and sends it (save_gkk_structure); the
--   office is alerted, then approves it (save_gkk_structure 'publish', full
--   access) or sends it back with a note (return_gkk_structure); the leader
--   is alerted either way (a new notification area, 'leader').
-- * On approval each registered officer's service list (member_service,
--   0071) gets the position "since this year", and a position given up is
--   closed with this year. Their Katungdanan sa GKK (members.gkk_role)
--   follows their main position.
-- * org_gkk_holders keeps only each GKK's photo and note for a position.

do $$
begin
  if to_regclass('public.org_gkk_holders') is null or to_regclass('public.member_service') is null
     or to_regprocedure('public.merge_members(integer, integer)') is null then
    raise exception 'Run the migrations up to 0080_history_video.sql before this one';
  end if;
end;
$$;

-- ---- how many people a position takes ---------------------------------------

do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'org_nodes' and column_name = 'max_holders') then
    alter table org_nodes add column max_holders smallint check (max_holders is null or max_holders between 1 and 50);
    -- Until now every position had one holder.
    update org_nodes set max_holders = case when gkk_role = 'Business Manager' then 2 else 1 end;
  end if;
end;
$$;

-- ---- the tables -------------------------------------------------------------------

create table if not exists org_gkk_officers (
  id          serial primary key,
  node_id     integer not null references org_nodes on delete cascade,
  gkk         text not null references gkks(name) on update cascade on delete cascade,
  draft       boolean not null default false,
  member_id   integer references members on delete set null,
  -- Typed, or the member's name when saved (kept if the member record goes).
  holder_name text not null check (length(trim(holder_name)) between 1 and 120),
  note        text check (note is null or length(note) <= 60),  -- e.g. "Family Group 1"
  sort_order  integer not null default 0
);
create index if not exists org_gkk_officers_gkk_idx on org_gkk_officers (gkk, draft, node_id, sort_order);
create index if not exists org_gkk_officers_member_idx on org_gkk_officers (member_id) where member_id is not null;

create table if not exists org_gkk_structures (
  gkk               text primary key references gkks(name) on update cascade on delete cascade,
  status            text check (status in ('draft', 'submitted', 'returned')),  -- null: no changes waiting
  saved_at          timestamptz,
  saved_by          uuid references auth.users(id) on delete set null,
  saved_by_name     text,
  submitted_at      timestamptz,
  submitted_by_name text,
  review_note       text,
  reviewed_at       timestamptz,
  reviewed_by_name  text,
  approved_at       timestamptz,
  approved_by_name  text
);

alter table org_gkk_officers enable row level security;
alter table org_gkk_structures enable row level security;

drop policy if exists org_gkk_officers_select on org_gkk_officers;
create policy org_gkk_officers_select on org_gkk_officers for select to authenticated
  using ((select staff_access()) in ('full', 'read_only', 'website')
         or ((select staff_access()) = 'gkk_leader' and gkk = (select staff_gkk())));
drop policy if exists org_gkk_structures_select on org_gkk_structures;
create policy org_gkk_structures_select on org_gkk_structures for select to authenticated
  using ((select staff_access()) in ('full', 'read_only', 'website')
         or ((select staff_access()) = 'gkk_leader' and gkk = (select staff_gkk())));

revoke all on org_gkk_officers, org_gkk_structures from anon;
revoke insert, update, delete, truncate on org_gkk_officers, org_gkk_structures from authenticated;
grant select on org_gkk_officers, org_gkk_structures to authenticated;

-- ---- once: the officers the website shows now ----------------------------------------

do $$
begin
  if exists (select 1 from org_gkk_officers) then return; end if;
  -- Set per GKK in "Officers per GKK".
  insert into org_gkk_officers (node_id, gkk, member_id, holder_name)
  select h.node_id, h.gkk, h.member_id, coalesce(org_member_name(h.member_id), nullif(trim(h.holder_name), ''))
  from org_gkk_holders h
  where coalesce(org_member_name(h.member_id), nullif(trim(h.holder_name), '')) is not null;
  -- From members' GKK roles, where the GKK set nobody.
  insert into org_gkk_officers (node_id, gkk, member_id, holder_name, sort_order)
  select n.id, hh.gkk, m.id, org_member_name(m.id), (row_number() over (partition by n.id, hh.gkk order by m.id))::integer - 1
  from org_nodes n
  join org_charts c on c.id = n.chart_id and c.scope = 'gkk'
  join members m on m.gkk_role = n.gkk_role
  join households hh on hh.id = m.household_id and hh.gkk is not null
  where n.gkk_role is not null
    and coalesce(m.membership_status not in ('Moved away', 'Deceased', 'Left the Church'), true)
    and org_member_name(m.id) is not null
    and not exists (select 1 from org_gkk_officers x where x.node_id = n.id and x.gkk = hh.gkk);
end;
$$;

update org_gkk_holders set member_id = null, holder_name = null where member_id is not null or holder_name is not null;
delete from org_gkk_holders where nullif(trim(coalesce(photo_url, '')), '') is null and nullif(trim(coalesce(note, '')), '') is null;

-- ---- the template: the Formation Ministry's GKK Structure ------------------------------

do $$
declare
  chart integer;
  top integer;
  p record;
  parent integer;
begin
  select id into chart from org_charts where scope = 'gkk';
  if chart is null then return; end if;
  select id into top from org_nodes where chart_id = chart and gkk_role = 'GKK President' order by id limit 1;
  if top is null then
    select id into top from org_nodes where chart_id = chart and parent_id is null order by sort_order, id limit 1;
  end if;
  if top is null then
    insert into org_nodes (chart_id, title, gkk_role, sort_order, max_holders)
    values (chart, 'GKK President', 'GKK President', 0, 1) returning id into top;
  end if;
  for p in select * from (values
    ( 1, 'Vice-President',                                    null,                                   'Vice-President',   1),
    ( 2, 'Secretary',                                         null,                                   'Secretary',        1),
    ( 3, 'Treasurer',                                         null,                                   'Treasurer',        1),
    ( 4, 'Auditor',                                           null,                                   null,               1),
    ( 5, 'Business Manager',                                  null,                                   'Business Manager', 2),
    ( 6, 'Formation Ministry Head (Catechist)',               null,                                   null,               1),
    ( 7, 'Catechists',                                        'Formation Ministry Head (Catechist)',  null,               null),
    ( 8, 'Family and Life Apostolate Ministry Head Couple',   'Formation Ministry Head (Catechist)',  null,               2),
    ( 9, 'Bible Apostolate Animator',                         'Formation Ministry Head (Catechist)',  null,               1),
    (10, 'Vocation Coordinator',                              'Formation Ministry Head (Catechist)',  null,               1),
    (11, 'Youth Coordinator',                                 'Formation Ministry Head (Catechist)',  null,               1),
    (12, 'Service Ministry Head',                             null,                                   null,               1),
    (13, 'Social Action Center (SAC) Coordinator',            'Service Ministry Head',                null,               1),
    (14, 'Women Empowerment Program (WEP) Coordinator',       'Service Ministry Head',                null,               1),
    (15, 'Ecology Coordinator',                               'Service Ministry Head',                null,               1),
    (16, 'Community-Based Health Program (CBHP) Coordinator', 'Service Ministry Head',                null,               1),
    (17, 'JPIC, Ecumenism and IP Coordinator',                'Service Ministry Head',                null,               1),
    (18, 'Worship Ministry Head (Lay Minister)',              null,                                   null,               1),
    (19, 'Lay Ministers',                                     'Worship Ministry Head (Lay Minister)', null,               null),
    (20, 'Lectors',                                           'Worship Ministry Head (Lay Minister)', null,               null),
    (21, 'Dames of the Holy Eucharist',                       'Worship Ministry Head (Lay Minister)', null,               null),
    (22, 'Knights of the Altar Servers',                      'Worship Ministry Head (Lay Minister)', null,               null),
    (23, 'Psalmists',                                         'Worship Ministry Head (Lay Minister)', null,               null),
    (24, 'Family Group Leaders',                              null,                                   null,               null),
    (25, 'Family Group Treasurers',                           'Family Group Leaders',                 null,               null)
  ) v(ord, title, parent_title, gkk_role, max_holders) order by ord loop
    continue when exists (select 1 from org_nodes where chart_id = chart
                          and (lower(title) = lower(p.title) or (p.gkk_role is not null and gkk_role = p.gkk_role)));
    parent := null;
    if p.parent_title is not null then
      select id into parent from org_nodes where chart_id = chart and lower(title) = lower(p.parent_title) order by id limit 1;
    end if;
    insert into org_nodes (chart_id, parent_id, title, gkk_role, sort_order, max_holders)
    values (chart, coalesce(parent, top), p.title, p.gkk_role, p.ord, p.max_holders);
  end loop;
end;
$$;

-- ---- the chart on the website: each GKK's approved officers ---------------------------------

-- As in 00571, with the GKK Structure's names from org_gkk_officers.
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
          from org_gkk_officers x where x.node_id = n.id and x.gkk = p_gkk and not x.draft)
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

revoke all on function public.org_chart_tree(integer, text) from public, anon, authenticated;

-- ---- notifications: a GKK leader's own area ---------------------------------------------

-- 'leader': only the GKK's leader sees it (their structure approved or sent back).
alter table staff_notifications drop constraint if exists staff_notifications_area_check;
alter table staff_notifications add constraint staff_notifications_area_check
  check (area in ('requests', 'registry', 'website', 'leader'));

-- As in 0062, with 'leader'.
create or replace function public.notification_visible_to(acc text, acc_gkk text, area text, gkk text) returns boolean
language sql immutable as $$
  select case
    when acc is null then false
    when area = 'leader' then acc = 'gkk_leader' and gkk is not null and gkk = acc_gkk
    when acc = 'full' then true
    when acc = 'read_only' then area in ('requests', 'registry')
    when acc = 'website' then area = 'requests'
    when acc = 'gkk_leader' then area = 'registry' and gkk is not null and gkk = acc_gkk
    else false
  end;
$$;

-- Phones: as in 0065, with the structure alerts on "Member requests only".
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
            when 'requests' then n.kind in ('anointing', 'certificate', 'ocia', 'blood', 'donor', 'census', 'gkk_history', 'gkk_structure', 'gkk_structure_review')
            when 'urgent' then n.urgent
            else false
          end
        end;
$$;

revoke all on function public.notification_push_targets(bigint) from public, anon, authenticated;
grant execute on function public.notification_push_targets(bigint) to service_role;

-- ---- reading a GKK's structure ---------------------------------------------------------

/** Raises unless the signed-in account may see (or, with p_edit, change) the GKK's structure. */
create or replace function public.gkk_structure_access(p_gkk text, p_edit boolean) returns void
language plpgsql stable security definer set search_path = public as $$
declare
  acc text := staff_access();
begin
  if not exists (select 1 from gkks where name = p_gkk) then raise exception 'Unknown GKK: %', p_gkk; end if;
  if acc = 'full' then return; end if;
  if acc = 'gkk_leader' and p_gkk = staff_gkk() then return; end if;
  if not p_edit and acc in ('read_only', 'website') then return; end if;
  raise exception '%', case
    when acc = 'gkk_leader' then 'Your account can only ' || case when p_edit then 'change' else 'see' end
                                 || ' the structure of ' || coalesce(staff_gkk(), 'your GKK')
    when acc in ('read_only', 'website') then 'Your account can view records but not change them'
    else 'Your account can''t see this. Ask a staff admin.'
  end using errcode = '42501';
end;
$$;

/** One GKK's officers, the approved ones or the draft, with the member's name parts and birthdate. */
create or replace function public.gkk_structure_officers(p_gkk text, p_draft boolean) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', o.id, 'nodeId', o.node_id, 'memberId', o.member_id,
      'name', coalesce(org_member_name(o.member_id), o.holder_name),
      'firstName', m.first_name, 'middleName', m.middle_name, 'lastName', m.last_name, 'suffix', m.suffix,
      'dob', m.dob, 'note', o.note
    ) order by o.node_id, o.sort_order, o.id), '[]'::jsonb)
  from org_gkk_officers o left join members m on m.id = o.member_id
  where o.gkk = p_gkk and o.draft = p_draft;
$$;

/**
 * { positions: [{ id, parentId, title, gkkRole, max }], live: [officer],
 *   draft: [officer] or null, state: {…} or null } for the structure tab.
 */
create or replace function public.gkk_structure(p_gkk text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s org_gkk_structures;
begin
  perform gkk_structure_access(p_gkk, false);
  select * into s from org_gkk_structures where gkk = p_gkk;
  return jsonb_build_object(
    'positions', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', n.id, 'parentId', n.parent_id, 'title', coalesce(n.position_name, n.title),
          'gkkRole', n.gkk_role, 'max', n.max_holders
        ) order by n.sort_order, n.id), '[]'::jsonb)
      from org_nodes n join org_charts c on c.id = n.chart_id and c.scope = 'gkk'),
    'live', gkk_structure_officers(p_gkk, false),
    'draft', case when s.status is not null then gkk_structure_officers(p_gkk, true) end,
    'state', case when s.gkk is not null then jsonb_build_object(
      'status', s.status, 'savedAt', s.saved_at, 'savedBy', s.saved_by_name,
      'submittedAt', s.submitted_at, 'submittedBy', s.submitted_by_name,
      'reviewNote', s.review_note, 'reviewedAt', s.reviewed_at, 'reviewedBy', s.reviewed_by_name,
      'approvedAt', s.approved_at, 'approvedBy', s.approved_by_name) end
  );
end;
$$;

-- ---- applying an approved structure -----------------------------------------------------

/** The GKK Structure's positions top to bottom, each level in order: (node_id, rank). */
create or replace function public.org_gkk_node_rank() returns table (node_id integer, rank bigint)
language sql stable security definer set search_path = public as $$
  with recursive t as (
    select n.id, array[n.sort_order, n.id] as path
    from org_nodes n join org_charts c on c.id = n.chart_id and c.scope = 'gkk'
    where n.parent_id is null
    union all
    select n.id, t.path || array[n.sort_order, n.id]
    from org_nodes n join t on n.parent_id = t.id
    where cardinality(t.path) < 200
  )
  select id, row_number() over (order by path) from t;
$$;

/**
 * The draft becomes the GKK's officers. Each registered member who holds a
 * position now, or held one before, gets their service list (member_service)
 * and Katungdanan sa GKK (members.gkk_role) brought in line:
 *   - a position held now: an entry "since this year", unless one is open;
 *   - a position given up: its open entry ends this year (or one is added);
 *   - gkk_role: kept if it's one of their positions now, else their main
 *     one (a position linked to a GKK role first, then top to bottom);
 *     cleared if it was a position they gave up.
 */
create or replace function public.gkk_structure_apply(p_gkk text) returns void
language plpgsql security definer set search_path = public as $$
declare
  yr integer := extract(year from now() at time zone 'Asia/Manila')::integer;
  old_rows jsonb;
  mid integer;
  titles_new text[];
  titles_old text[];
  roles_new text[];
  roles_old text[];
  cur text;
  target text;
  t text;
begin
  select coalesce(jsonb_agg(jsonb_build_object('m', o.member_id, 'n', o.node_id)), '[]'::jsonb) into old_rows
  from org_gkk_officers o where o.gkk = p_gkk and not o.draft and o.member_id is not null;
  delete from org_gkk_officers where gkk = p_gkk and not draft;
  update org_gkk_officers set draft = false where gkk = p_gkk and draft;

  for mid in
    select (e->>'m')::integer from jsonb_array_elements(old_rows) e
    union
    select member_id from org_gkk_officers where gkk = p_gkk and not draft and member_id is not null
  loop
    continue when not exists (select 1 from members where id = mid);
    select array_agg(x.title order by x.rank), array_agg(x.role order by x.has_role desc, x.rank) into titles_new, roles_new
    from (select coalesce(n.position_name, n.title) as title, coalesce(n.gkk_role, n.position_name, n.title) as role,
                 n.gkk_role is not null as has_role, min(r.rank) as rank
          from org_gkk_officers o join org_nodes n on n.id = o.node_id left join org_gkk_node_rank() r on r.node_id = n.id
          where o.gkk = p_gkk and not o.draft and o.member_id = mid
          group by n.id) x;
    select array_agg(coalesce(n.position_name, n.title)), array_agg(coalesce(n.gkk_role, n.position_name, n.title)) into titles_old, roles_old
    from org_nodes n
    where n.id in (select (e->>'n')::integer from jsonb_array_elements(old_rows) e where (e->>'m')::integer = mid);
    titles_new := coalesce(titles_new, '{}');
    titles_old := coalesce(titles_old, '{}');
    roles_new := coalesce(roles_new, '{}');
    roles_old := coalesce(roles_old, '{}');

    foreach t in array titles_new loop
      if not exists (select 1 from member_service where member_id = mid and kind = 'gkk' and name = t and to_year is null) then
        insert into member_service (member_id, kind, name, from_year, notes, source) values (mid, 'gkk', t, yr, p_gkk, 'auto');
      end if;
    end loop;
    foreach t in array titles_old loop
      continue when t = any(titles_new);
      update member_service set to_year = yr
      where member_id = mid and kind = 'gkk' and name = t and to_year is null and coalesce(from_year, yr) <= yr;
      if not found and not exists (select 1 from member_service where member_id = mid and kind = 'gkk' and name = t and to_year = yr) then
        insert into member_service (member_id, kind, name, to_year, notes, source) values (mid, 'gkk', t, yr, p_gkk, 'auto');
      end if;
    end loop;

    select gkk_role into cur from members where id = mid;
    if cardinality(roles_new) > 0 then
      target := case when coalesce(cur = any(roles_new), false) then cur else roles_new[1] end;
    elsif coalesce(cur = any(roles_old), false) then
      target := null;
    else
      target := cur;
    end if;
    if target is distinct from cur then
      -- The service list is already brought in line above.
      perform set_config('app.service_skip', 'on', true);
      update members set gkk_role = target where id = mid;
      perform set_config('app.service_skip', 'off', true);
    end if;
  end loop;
end;
$$;

create or replace function public.gkk_structure_log(p_gkk text, p_what text) returns void
language sql security definer set search_path = public as $$
  insert into activity_log (actor, actor_name, action, table_name, record_id, label, changes)
  select auth.uid(), current_staff_name(), 'update', 'org_charts', c.id::text, 'GKK Structure · ' || p_gkk,
         jsonb_build_object('gkk', p_gkk, 'structure', p_what)
  from org_charts c where c.scope = 'gkk';
$$;

/** An alert, never stopping the save it comes with. */
create or replace function public.gkk_structure_notify(p_kind text, p_area text, p_gkk text, p_title text, p_detail text, p_link text) returns void
language plpgsql security definer set search_path = public as $$
begin
  begin
    if not exists (select 1 from staff_notifications
                   where kind = p_kind and gkk = p_gkk and title = p_title and created_at > now() - interval '30 minutes') then
      insert into staff_notifications (kind, area, gkk, title, detail, link) values (p_kind, p_area, p_gkk, p_title, p_detail, p_link);
    end if;
  exception when others then
    raise warning 'gkk_structure_notify: %', sqlerrm;
  end;
end;
$$;

-- ---- saving, sending, approving -----------------------------------------------------------

/**
 * Save a GKK's officers: `p_officers` is every person, in order:
 * [{ nodeId, memberId?, name?, note? }] (a member of the GKK, or a typed
 * full name). `p_action`:
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
    insert into org_gkk_officers (node_id, gkk, draft, member_id, holder_name, note, sort_order)
    values (node.id, p_gkk, true, mem, nm, note_val, i);
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
        p_gkk || ': the parish office approved the officers. They are on the website now.', '/admin/settings?tab=mygkk&view=structure');
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

/** Full access: send a structure back to the GKK with a note. Returns gkk_structure(). */
create or replace function public.return_gkk_structure(p_gkk text, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  note_val text := nullif(trim(coalesce(p_note, '')), '');
begin
  perform require_full_access('send back a GKK structure');
  perform gkk_structure_access(p_gkk, true);
  if note_val is null then raise exception 'Say what needs changing'; end if;
  if length(note_val) > 500 then raise exception 'Keep the note under 500 characters'; end if;
  update org_gkk_structures set status = 'returned', review_note = note_val, reviewed_at = now(), reviewed_by_name = current_staff_name()
  where gkk = p_gkk and status = 'submitted';
  if not found then raise exception 'This structure isn''t waiting for approval any more. Reload the page.'; end if;
  perform gkk_structure_log(p_gkk, 'sent back');
  perform gkk_structure_notify('gkk_structure_review', 'leader', p_gkk, 'GKK structure sent back',
    p_gkk || ': ' || note_val, '/admin/settings?tab=mygkk&view=structure');
  return gkk_structure(p_gkk);
end;
$$;

/** Drop the changes waiting (draft, sent or sent back): the approved officers stay. Returns gkk_structure(). */
create or replace function public.discard_gkk_structure(p_gkk text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform gkk_structure_access(p_gkk, true);
  delete from org_gkk_officers where gkk = p_gkk and draft;
  update org_gkk_structures set status = null, review_note = null where gkk = p_gkk;
  perform gkk_structure_log(p_gkk, 'changes discarded');
  return gkk_structure(p_gkk);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'gkk_structure_access(text, boolean)', 'gkk_structure_officers(text, boolean)', 'org_gkk_node_rank()',
    'gkk_structure_apply(text)', 'gkk_structure_log(text, text)', 'gkk_structure_notify(text, text, text, text, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  foreach f in array array[
    'gkk_structure(text)', 'save_gkk_structure(text, jsonb, text)', 'return_gkk_structure(text, text)', 'discard_gkk_structure(text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

-- ---- each GKK's photo and note on a position (no longer its holder) ----------------------

-- As in 00571, for the photo and note only: the people are the GKK's officers.
-- p_member_id and p_holder_name are ignored.
create or replace function public.save_org_gkk_holder(
  p_node_id integer, p_gkk text, p_member_id integer, p_holder_name text, p_photo_url text, p_note text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  c org_charts;
  node org_nodes;
  photo text := nullif(trim(coalesce(p_photo_url, '')), '');
  note_val text := nullif(trim(coalesce(p_note, '')), '');
begin
  perform require_full_access('change the organization charts');
  select * into node from org_nodes where id = p_node_id;
  select * into c from org_charts where id = node.chart_id;
  if node.id is null or c.scope is distinct from 'gkk' then raise exception 'That position isn''t on the GKK Structure'; end if;
  if not exists (select 1 from gkks where name = p_gkk) then raise exception 'Unknown GKK: %', p_gkk; end if;
  if length(note_val) > 300 then raise exception 'Keep the note under 300 characters'; end if;
  if photo is not null and photo !~* '^https://' then raise exception 'That photo isn''t an uploaded photo'; end if;
  if photo is null and note_val is null then
    delete from org_gkk_holders where node_id = p_node_id and gkk = p_gkk;
  else
    insert into org_gkk_holders (node_id, gkk, photo_url, note) values (p_node_id, p_gkk, photo, note_val)
    on conflict (node_id, gkk) do update set member_id = null, holder_name = null, photo_url = excluded.photo_url, note = excluded.note;
  end if;
  perform org_chart_log('update', c, jsonb_build_object('gkk', p_gkk, 'position', coalesce(node.position_name, node.title), 'photo', photo is not null));
end;
$$;

-- ---- the template editor saves how many people each position takes ------------------------

-- As in 00571, with maxHolders (blank: any number).
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
  maxh smallint;
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
    maxh := case when (n->>'maxHolders') ~ '^\d+$' then least(greatest((n->>'maxHolders')::integer, 1), 50) end;

    role := nullif(trim(n->>'gkkRole'), '');
    mem := case when (n->>'memberId') ~ '^\d+$' then (n->>'memberId')::integer end;
    if c.scope = 'gkk' then
      if role is not null and not (role = any(org_gkk_roles())) then raise exception 'Unknown GKK role: %', role; end if;
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
        max_holders = maxh,
        sort_order = coalesce((n->>'sortOrder')::integer, 0),
        pos_x = (n->>'x')::real, pos_y = (n->>'y')::real
      where id = nid;
    else
      insert into org_nodes (chart_id, title, position_name, gkk_role, member_id, holder_name, photo_url, note, max_holders, sort_order, pos_x, pos_y)
      values (p_chart_id, t, pos, role, mem,
              case when c.scope = 'gkk' then null else nullif(trim(n->>'holderName'), '') end,
              case when c.scope = 'gkk' then null else photo end,
              nullif(trim(n->>'note'), ''), maxh, coalesce((n->>'sortOrder')::integer, 0), (n->>'x')::real, (n->>'y')::real)
      returning id into nid;
    end if;
    keymap := keymap || jsonb_build_object(n->>'key', nid);
    kept := kept || nid;
  end loop;

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
  roles := org_sync_parish_roles(links, org_parish_links(p_chart_id));
  return jsonb_build_object('keys', keymap, 'roles', roles);
end;
$$;

-- ---- merging duplicate members moves their GKK positions too -------------------------------

-- As in 0075, with org_gkk_officers.
create or replace function public.merge_members(p_keep integer, p_other integer) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  k members;
  o members;
  trash_id bigint;
  other_label text;
  other_household text;
begin
  perform require_full_access('merge members');
  if p_keep is null or p_other is null or p_keep = p_other then raise exception 'Choose two different members'; end if;
  select * into k from members where id = p_keep for update;
  select * into o from members where id = p_other for update;
  if k.id is null or o.id is null then raise exception 'One of these members is no longer in the registry'; end if;
  other_label := concat_ws(' ', o.first_name, o.last_name, o.suffix);
  select household_name into other_household from households where id = o.household_id;

  update members set
    middle_name      = coalesce(nullif(trim(k.middle_name), ''), o.middle_name),
    suffix           = coalesce(nullif(trim(k.suffix), ''), o.suffix),
    sex              = coalesce(nullif(trim(k.sex), ''), o.sex),
    place_of_birth   = coalesce(nullif(trim(k.place_of_birth), ''), o.place_of_birth),
    civil_status     = coalesce(nullif(trim(k.civil_status), ''), o.civil_status),
    contact          = coalesce(nullif(trim(k.contact), ''), o.contact),
    email            = coalesce(nullif(trim(k.email), ''), o.email),
    occupation       = coalesce(nullif(trim(k.occupation), ''), o.occupation),
    religion         = coalesce(nullif(trim(k.religion), ''), o.religion),
    tribe            = coalesce(nullif(trim(k.tribe), ''), o.tribe),
    gkk_role         = coalesce(nullif(trim(k.gkk_role), ''), o.gkk_role),
    parish_role      = coalesce(nullif(trim(k.parish_role), ''), o.parish_role),
    membership_status = coalesce(k.membership_status, o.membership_status),
    has_baptism      = k.has_baptism or o.has_baptism,
    baptism_date     = coalesce(k.baptism_date, o.baptism_date),
    baptism_church   = coalesce(nullif(trim(k.baptism_church), ''), o.baptism_church),
    has_communion    = k.has_communion or o.has_communion,
    communion_date   = coalesce(k.communion_date, o.communion_date),
    communion_church = coalesce(nullif(trim(k.communion_church), ''), o.communion_church),
    has_confirmation = k.has_confirmation or o.has_confirmation,
    conf_date        = coalesce(k.conf_date, o.conf_date),
    conf_church      = coalesce(nullif(trim(k.conf_church), ''), o.conf_church),
    conf_name        = coalesce(nullif(trim(k.conf_name), ''), o.conf_name),
    conf_sponsor     = coalesce(nullif(trim(k.conf_sponsor), ''), o.conf_sponsor),
    has_matrimony    = k.has_matrimony or o.has_matrimony,
    mat_date         = coalesce(k.mat_date, o.mat_date),
    mat_church       = coalesce(nullif(trim(k.mat_church), ''), o.mat_church),
    mat_type         = coalesce(nullif(trim(k.mat_type), ''), o.mat_type),
    ministries       = array(select distinct x from unnest(coalesce(k.ministries, '{}') || coalesce(o.ministries, '{}')) x order by x),
    organizations    = array(select distinct x from unnest(coalesce(k.organizations, '{}') || coalesce(o.organizations, '{}')) x order by x)
  where id = p_keep;

  insert into member_blood_types (member_id, blood_type)
  select p_keep, blood_type from member_blood_types where member_id = p_other
  on conflict (member_id) do nothing;
  update sacrament_verifications set member_id = p_keep
  where member_id = p_other and sacrament not in (select sacrament from sacrament_verifications where member_id = p_keep);
  update census_member_responses set member_id = p_keep
  where member_id = p_other and cycle_id not in (select cycle_id from census_member_responses where member_id = p_keep);
  update member_service ms set member_id = p_keep
  where ms.member_id = p_other and not exists (
    select 1 from member_service ks
    where ks.member_id = p_keep and ks.kind = ms.kind and lower(ks.name) = lower(ms.name)
      and ks.from_year is not distinct from ms.from_year and ks.to_year is not distinct from ms.to_year);
  update certificate_requests set member_id = p_keep where member_id = p_other;
  update sacrament_requests set member_id = p_keep where member_id = p_other;
  update blood_donors set member_id = p_keep where member_id = p_other;
  update org_nodes set member_id = p_keep where member_id = p_other;
  update org_gkk_holders set member_id = p_keep where member_id = p_other;
  update org_gkk_officers set member_id = p_keep where member_id = p_other;

  trash_id := trash_member(p_other);

  insert into activity_log (actor, actor_name, action, table_name, record_id, household_id, member_id, label, changes)
  values (auth.uid(), current_staff_name(), 'merge', 'members', p_keep::text, k.household_id, p_keep,
          concat_ws(' ', k.first_name, k.last_name),
          jsonb_build_object('merged', other_label, 'household', other_household));
  return trash_id;
end;
$$;

revoke all on function public.merge_members(integer, integer) from public, anon;
grant execute on function public.merge_members(integer, integer) to authenticated;
