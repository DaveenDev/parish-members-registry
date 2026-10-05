# Org Chart Builder (React Flow admin + d3-org-chart website)

> **Status:** implemented 2026-10-05 (migration `00571_org_chart.sql`). Decisions recorded 2026-10-05 (see "Decisions").
>
> **Where it differs from the plan below:**
> - The admin page is **Parish life → Organization Structure** (`/admin/org-structure`, `client/src/pages/admin/OrgStructure.jsx`), not under Settings. One tab per chart: **Church Structure** (the default tab) and **GKK Structure** come with the migration and can't be deleted; **+ New chart** adds more. Each tab is the chart editor (`client/src/components/orgchart/`).
> - `org_charts` has a `builtin` column for the two charts that can't be deleted.
> - Writes go only through the functions (`create_org_chart`, `update_org_chart`, `delete_org_chart`, `save_org_chart`, `save_org_gkk_holder`); the tables are read-only to staff. `org_chart_preview` is the staff "Preview as GKK…".
> - Tidy layout is a small tidy-tree in `client/src/lib/orgChartLayout.js` instead of dagre: dagre reorders siblings, and their left-to-right order is the order the website shows.
> - `d3` isn't installed: d3-org-chart brings the d3 modules it uses; only `d3-transition` is added.
> - Holder photos go to R2 under `org/` (redeploy `media-upload`).
> - Step 7 is done in the database: saving a chart (`save_org_chart` → `org_sync_parish_roles`) sets the Katungdanan sa Parish of each registered holder of a position linked to the parish positions list. A member with several such positions keeps their role if it's one of them, else gets the first; taking them off (or deleting the chart) clears the role the chart gave them. The save message lists what changed, and it shows in the activity log as the staff member's edit.
> - The website charts moved from Komunidad to **Ang Simbahan** (`/simbahan?tab=organisasyon`, the old Misa page), as a tab beside the sacrament guides. `/komunidad?view=organisasyon` redirects there. "Mga Opisyal" stays on each GKK's page.
> - Leaving the page inside the admin with unsaved changes isn't caught (the app uses `BrowserRouter`, which has no `useBlocker`); switching tabs and closing/reloading the browser tab are.

## Context
The secretary should be able to build the parish's organization structure (PPC, councils, commissions, GKK clusters, GKK officers, …) freely and publish it on the website.

Today the only structure is `parish_positions` (0006_parish_positions.sql). It's a **flat list of names** that registrants pick as "Katungdanan sa Parish" (`members.parish_role`), edited in Settings → Ministries & organizations → "Parish Organization Structure" (`client/src/pages/admin/ManageOrgs.jsx`). It has no hierarchy, no holder and no chart.

Goal:
- **Admin:** a drag-and-drop canvas built with **React Flow** (`@xyflow/react`, MIT) where the secretary adds, edits, links and reorders positions and assigns holders.
- **Website:** a read-only, zoomable, collapsible chart built with **d3-org-chart** (MIT) on the public site.
- Both cost nothing (fits the free Vercel Hobby plan).

## Decisions
- **Who edits:** full access only. Everyone else on staff can view.
- **Public names and photos:** yes, show the holder's name and photo on the website. A node with no photo shows initials instead.
- **Charts:** several. The first two:
  - **Parish:** PPC and the GKK clusters.
  - **GKK level:** **one uniform structure** shared by every GKK. The secretary draws it once. Each GKK's page shows that same structure with its own officers filled in.
- **`parish_positions`:** stays as the pick-list for registrants ("Katungdanan sa Parish") and for node titles. The chart uses it but doesn't replace it.
- **GKK officers come from the registry.** Members already have `members.gkk_role`, picked from `GKK_ROLES` in `client/src/constants.js` (GKK President, Vice-President, Secretary, Treasurer, Business Manager). A node in the GKK structure can link to one of those roles. Its holder in a given GKK is then the member of that GKK with that role, so nobody types officers in twice.

## Data model: migration `supabase/migrations/00NN_org_chart.sql`
(Use the next free number at implementation time.) Follow the house style: a guard `do $$` block that checks the previous migration ran, `if not exists`, safe to re-run.

```sql
create table if not exists org_charts (          -- several charts: Parish (PPC + clusters), GKK structure, …
  id serial primary key,
  title text not null,
  slug text unique not null,
  scope text not null default 'parish' check (scope in ('parish', 'gkk')),
  published boolean not null default false,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists org_nodes (
  id serial primary key,
  chart_id int not null references org_charts on delete cascade,
  parent_id int references org_nodes on delete set null,  -- null = top
  title text not null,                 -- "PPC President"
  position_name text references parish_positions(name) on update cascade, -- optional link to the pick-list
  gkk_role text,                       -- GKK structure only: one of GKK_ROLES; fills the holder per GKK
  member_id int references members on delete set null,    -- optional holder (parish charts)
  holder_name text,                    -- free-text holder when not a registered member
  photo_url text,                      -- holder photo (media-upload function, like gkks.photo_url in 0046)
  note text,                           -- term, e.g. "2025–2028"
  sort_order int not null default 0,   -- order among siblings
  pos_x real, pos_y real               -- React Flow canvas position (admin only)
);

-- GKK structure only: one GKK's holder for one node. Used for nodes with no
-- gkk_role (e.g. "Lector Coordinator"), or to add a photo or name to a
-- role-filled node.
create table if not exists org_gkk_holders (
  node_id int not null references org_nodes on delete cascade,
  gkk text not null,                   -- link to gkks the way other tables do
  member_id int references members on delete set null,
  holder_name text,
  photo_url text,
  note text,
  primary key (node_id, gkk)
);
```
- **Only one GKK-scope chart.** It's the uniform template. Enforce this with a partial unique index on `org_charts (scope) where scope = 'gkk'`.
- **Holder of a GKK-structure node in GKK X**, in this order:
  1. the `org_gkk_holders` row for (node, X), if there is one
  2. otherwise, the member of a household in GKK X whose `gkk_role` equals the node's `gkk_role`
  3. otherwise, vacant
  If two members of one GKK hold the same role, show both, oldest record first.
- **RLS:** read for all signed-in staff. Write for `full` access only, the same rule as `manageLists` in `lib/access.js`. Check `staff_access() = 'full'` in the policies and in the save RPC, following 0014_roles_activity_trash.sql.
- **Public RPC** `public_org_chart(slug text, gkk text default null) returns jsonb`: a `security definer` function, granted to `anon`, that returns only published charts and only safe fields (id, parentId, title, holder display name, holder photo, note). It never returns member ids or contact details. This follows the pattern of `list_public_parish_positions()` in 0006.
  - For the GKK structure, pass `gkk` and it resolves holders as above.
  - Members have no photo column, so the photo comes from `photo_url` on the node or holder row.
  - Add a `public_org_charts()` list too (title, slug, scope), for the site's pills.
- **Save RPC** `save_org_chart(chart_id, nodes jsonb)`: saves the whole canvas in one transaction (upsert nodes, delete removed ones). Edges are stored as `parent_id`. Log the change in the activity log, as the other admin writes do.
- **Cycles:** reject any node that would become its own ancestor (check in the save RPC).

## Admin: React Flow editor
- `npm i @xyflow/react @dagrejs/dagre` in `client/`.
- **New page:** `client/src/pages/admin/OrgChart.jsx`, route `/admin/settings/org-chart`.
  - Add a nav item in `client/src/components/adminNav.js` under "Settings", next to "Ministries & organizations" (`need: 'manageLists'`, `notForLeaders: true`).
  - Load it with `React.lazy` in `client/src/App.jsx` so React Flow stays out of the public bundle. No route is lazy-loaded today, so this would be the first.
- **Layout:** chart picker plus "New chart" at the top, the canvas in the middle, and a side drawer for the selected node, reusing the drawer and form bits in `components/admin.jsx` and `ui.jsx`.
- **New chart dialog:** asks for the title. New charts are parish-scope. The single "GKK Structure" chart is created by the migration, so it can't be duplicated or deleted.
- **GKK Structure chart:**
  - the node drawer has a "GKK role" pick from `GKK_ROLES` instead of a member search
  - a "Preview as GKK…" selector shows any GKK's officers filled in
  - an "Officers per GKK" table (GKK × role-less node) edits `org_gkk_holders`, for the positions the registry doesn't cover
- **Interactions:**
  - "+ Add position" adds a node. A "+" handle on a node adds a child under it.
  - Drag one node's handle to another to set its parent. Each node has a single incoming edge, so a new edge replaces the old parent.
  - Delete removes the node with a `ConfirmDialog`. Its children move up to the deleted node's parent.
  - "Tidy layout" button: dagre top-down auto-layout. Positions are saved in `pos_x`/`pos_y` so manual placement sticks.
  - Node drawer:
    - title, or a pick from `parish_positions` via `api.listParishPositions()`
    - holder: search members (reuse the member lookup used in `MemberDetailModal` / Members), or type a free-text name
    - photo upload (reuse the media-upload function and `lib/images.js`), with a note that the photo shows on the website
    - note
  - Save / Discard buttons, and a "Published" toggle per chart. Warn about unsaved changes on leave.
- **Who sees the page:** only full-access staff edit, gated by `can(user, 'manageLists')` from `lib/access.js`. If other staff are ever shown the page, render the canvas read-only (`nodesDraggable={false}` etc.).
- **Mobile:** pan and zoom work. Editing is desktop-first. Show a hint on narrow screens.
- **API:** add `listOrgCharts`, `getOrgChart`, `saveOrgChart`, `createOrgChart`, `renameOrgChart`, `deleteOrgChart`, `publicOrgCharts` and `publicOrgChart` to `client/src/api.js`, alongside the existing parish-position calls (~line 675).

## Website: d3-org-chart view
- `npm i d3-org-chart d3` in `client/` (d3-org-chart needs d3 as a peer).
- **Pure helper** `client/src/lib/orgChart.js`:
  - `toD3Rows(nodes)` turns flat rows into `{id, parentId, …}`
  - for a forest of several top nodes, add a hidden root
  - sort siblings by `sort_order`
  - `hasCycle(nodes)` for the admin pre-save check
  - `initials(name)` for nodes without a photo
- **Component:** `client/src/components/site/OrgChartView.jsx` wraps `new OrgChart().container(ref).data(rows).nodeContent(...).render()` in a `useEffect`. Lazy-load it (d3 is about 80 KB gzipped).
  - Node card HTML uses the site palette (`--p-navy`, `--p-gold`) and shows photo (or initials), title, holder and note.
  - Buttons: fit, expand all, collapse, export PNG.
  - Escape all text inserted into `nodeContent` HTML, because it comes from the database.
- **Parish charts:** a new view on Komunidad. Add `['organisasyon', 'Organisasyon']` to `VIEWS` in `client/src/pages/site/Komunidad.jsx`, with one pill per published parish-scope chart (e.g. "PPC ug Cluster"). Fetch via `useOrgCharts()` / `useOrgChart(slug)` hooks in `client/src/pages/site/data.js`, following the existing `useGkkDirectory` pattern.
- **GKK Structure:** when it's published, every GKK's page (`GkkDetail` in `Komunidad.jsx`, route `/komunidad/gkk/:name`) gets a "Mga Opisyal" section. It shows the same structure with that GKK's officers, and vacant positions show "Bakante". The Organisasyon view can also show the bare structure (no names) as "Estruktura sa GKK".
- **States:** use `DataState`, `Skeleton` and `EmptyNote` from `components/site/kit.jsx`.

## Steps (suggested order)
1. Migration and RPCs. Run it on Supabase.
2. `lib/orgChart.js` and `client/test/org-chart.test.js` (node --test): tree building, cycle detection, children moving up on delete, initials.
3. API functions in `api.js`.
4. Admin `OrgChart.jsx` (React Flow), the nav item and the lazy route.
5. Public `OrgChartView.jsx` (d3-org-chart) and the Komunidad "Organisasyon" view.
6. The GKK Structure: role links, officers per GKK, and "Mga Opisyal" on each GKK page.
7. Optional: when a node is linked to a `parish_positions` name and a member, also set that member's `members.parish_role`, so the registry and the chart agree.

## Ideas for later
- Let GKK leaders fill in `org_gkk_holders` (photos, role-less positions) for their own GKK. Today, only full access can edit.

## Verification
- `npm test`: the new `org-chart.test.js` passes along with the existing suite.
- `preview_start` the dev server:
  - In `/admin/settings/org-chart`: build a 3-level chart, drag to reparent, tidy, save, reload, and confirm it persists.
  - Try to make a cycle and confirm it's rejected.
  - Sign in as a non-full user (read-only, website, GKK leader) and confirm they can't open or save the editor. The database must refuse the save as well, not just the UI.
- Publish a parish chart, then on `/simbahan?tab=organisasyon`: confirm the chart renders with names and photos, collapse, expand and fit work, and it's usable at 375 px width in light and dark.
- Publish the GKK Structure and open two GKK pages (`/komunidad/gkk/<name>`). Confirm:
  - both show the same structure with their own officers taken from `gkk_role`
  - a GKK with no Treasurer shows "Bakante"
  - an `org_gkk_holders` entry overrides the role holder
- Change a member's `gkk_role` in the registry and confirm the GKK page follows.
- Unpublish and confirm the public RPC returns nothing. Confirm no member ids or contacts appear in the public network response.
- `npm run build`: React Flow and d3 end up in separate lazy chunks, not the main bundle.
