# Org Chart Builder (React Flow admin + d3-org-chart website)

## Context
The secretary should be able to build the parish's organization structure (PPC, councils, commissions, GKK clusters, lay-org officers, …) freely and publish it on the website.

Today the only structure is `parish_positions` (0006_parish_positions.sql). It's a **flat list of names** that registrants pick as "Katungdanan sa Parish" (`members.parish_role`), edited in Settings → Ministries & organizations → "Parish Organization Structure" (`client/src/pages/admin/ManageOrgs.jsx`). It has no hierarchy, no holder and no chart.

Goal:
- **Admin:** a drag-and-drop canvas built with **React Flow** (`@xyflow/react`, MIT) where the secretary adds, edits, links and reorders positions and assigns holders.
- **Website:** a read-only, zoomable, collapsible chart built with **d3-org-chart** (MIT) on the public site.
- Both cost nothing (fits the free Vercel Hobby plan).

## Data model: migration `supabase/migrations/0047_org_chart.sql`
(Use the next free number at implementation time.) Follow the house style: a guard `do $$` block that checks the previous migration ran, `if not exists`, safe to re-run.

```sql
create table if not exists org_charts (          -- several charts: PPC, Lay Orgs, …
  id serial primary key,
  title text not null,
  slug text unique not null,
  published boolean not null default false,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists org_nodes (
  id serial primary key,
  chart_id int not null references org_charts on delete cascade,
  parent_id int references org_nodes on delete set null,  -- null = top
  title text not null,                 -- "PPC President"
  position_name text references parish_positions(name) on update cascade, -- optional link
  member_id int references members on delete set null,    -- optional holder
  holder_name text,                    -- free-text holder when not a registered member
  photo_url text,                      -- optional (media-upload function, like gkks.photo_url in 0046)
  note text,                           -- term, e.g. "2025–2028"
  sort_order int not null default 0,   -- order among siblings
  pos_x real, pos_y real               -- React Flow canvas position (admin only)
);
```
- **RLS:** read for staff who `staff_can_see('website')`, write for `editWebsite` roles. Use the `staff_can_see` pattern from 0014_roles_activity_trash.sql.
- **Public RPC** `public_org_chart(slug text) returns jsonb`: a `security definer` function, granted to `anon`, that returns only published charts and only safe fields (id, parentId, title, holder display name, photo, note). It never returns member ids or contact details. This follows the pattern of `list_public_parish_positions()` in 0006.
- **Save RPC** `save_org_chart(chart_id, nodes jsonb)`: saves the whole canvas in one transaction (upsert nodes, delete removed ones). Edges are stored as `parent_id`. Log the change in the activity log, as the other admin writes do.
- **Cycles:** reject any node that would become its own ancestor (check in the save RPC).

## Admin: React Flow editor
- `npm i @xyflow/react @dagrejs/dagre` in `client/`.
- **New page:** `client/src/pages/admin/OrgChart.jsx`, route `/admin/org-chart`. Add a nav item in `client/src/components/adminNav.js` under "Parish life" (`need: 'website'`). Load it with `React.lazy` in `client/src/App.jsx` so React Flow stays out of the public bundle. (No route is lazy-loaded today, so this is the first.)
- **Layout:** chart picker plus "New chart" at the top, the canvas in the middle, and a side drawer for the selected node, reusing the drawer and form bits in `components/admin.jsx` and `ui.jsx`.
- **Interactions:**
  - "+ Add position" adds a node. A "+" handle on a node adds a child under it.
  - Drag one node's handle to another to set its parent. Each node has a single incoming edge, so a new edge replaces the old parent.
  - Delete removes the node with a `ConfirmDialog`. Its children move up to the deleted node's parent.
  - "Tidy layout" button: dagre top-down auto-layout. Positions are saved in `pos_x`/`pos_y` so manual placement sticks.
  - Node drawer:
    - title, or a pick from `parish_positions` via `api.listParishPositions()`
    - holder: search members (reuse the member lookup used in `MemberDetailModal` / Members), or type a free-text name
    - photo upload (reuse the media-upload function and `lib/images.js`)
    - note
  - Save / Discard buttons, and a "Published" toggle per chart. Warn about unsaved changes on leave.
- **Read-only staff** (`read_only`) see the canvas but can't edit (`nodesDraggable={false}` etc., gated by `can(user, 'editWebsite')` from `lib/access.js`).
- **Mobile:** pan and zoom work. Editing is desktop-first. Show a hint on narrow screens.
- **API:** add `listOrgCharts`, `getOrgChart`, `saveOrgChart`, `createOrgChart`, `renameOrgChart`, `deleteOrgChart` and `publicOrgChart` to `client/src/api.js`, alongside the existing parish-position calls (~line 675).

## Website: d3-org-chart view
- `npm i d3-org-chart d3` in `client/` (d3-org-chart needs d3 as a peer).
- **Pure helper** `client/src/lib/orgChart.js`:
  - `toD3Rows(nodes)` turns flat rows into `{id, parentId, …}`
  - for a forest of several top nodes, add a hidden root
  - sort siblings by `sort_order`
  - `hasCycle(nodes)` for the admin pre-save check
- **Component:** `client/src/components/site/OrgChartView.jsx` wraps `new OrgChart().container(ref).data(rows).nodeContent(...).render()` in a `useEffect`.
  - Node card HTML uses the site palette (`--p-navy`, `--p-gold`) and shows photo, title, holder and note.
  - Buttons: fit, expand all, collapse, export PNG.
  - Escape all text inserted into `nodeContent` HTML, because it comes from the database.
- **Placement:** a new view on Komunidad. Add `['organisasyon', 'Organisasyon']` to `VIEWS` in `client/src/pages/site/Komunidad.jsx`, with one tab or pill per published chart. Fetch via a `useOrgChart(slug)` hook in `client/src/pages/site/data.js`, following the existing `useGkkDirectory` pattern. Lazy-load the component (d3 is about 80 KB gzipped).
- **States:** use `DataState`, `Skeleton` and `EmptyNote` from `components/site/kit.jsx`.

## Steps (suggested order)
1. Migration 0047 and RPCs. Run it on Supabase.
2. `lib/orgChart.js` and `client/test/org-chart.test.js` (node --test): tree building, cycle detection, children moving up on delete.
3. API functions in `api.js`.
4. Admin `OrgChart.jsx` (React Flow), the nav item and the lazy route.
5. Public `OrgChartView.jsx` (d3-org-chart) and the Komunidad view.
6. Optional: when a node is linked to a `parish_positions` name and a member, also set that member's `members.parish_role`, so the registry and the chart agree.

## Open questions (decide before building)
- Who edits: `full` + `website` roles (assumed), or `full` only?
- Show holders' photos and names publicly? (Assumed yes. The secretary picks per node.)
- One chart or several (PPC, each lay org, GKK clusters)? (Schema supports several.)
- Should `parish_positions` eventually be replaced by org nodes, or stay as the pick-list?

## Verification
- `npm test`: the new `org-chart.test.js` passes along with the existing suite.
- `preview_start` the dev server:
  - In `/admin/org-chart`: build a 3-level chart, drag to reparent, tidy, save, reload, and confirm it persists.
  - Try to make a cycle and confirm it's rejected.
  - Sign in as a read-only user and confirm editing is blocked.
- Publish, then on `/komunidad?view=organisasyon`: confirm the chart renders, collapse, expand and fit work, and it's usable at 375 px width in light and dark.
- Unpublish and confirm the public RPC returns nothing. Confirm no member ids or contacts appear in the public network response.
- `npm run build`: React Flow and d3 end up in separate lazy chunks, not the main bundle.
