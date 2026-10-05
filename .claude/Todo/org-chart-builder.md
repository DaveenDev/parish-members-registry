# Org Chart Builder (React Flow admin + d3-org-chart website)

> **Status:** idea saved for later. Not a priority. Decisions recorded 2026-10-05 (see "Decisions").

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
  - **GKK level:** the officers inside a GKK.
- **`parish_positions`:** stays as the pick-list for registrants ("Katungdanan sa Parish") and for node titles. The chart uses it but doesn't replace it.

## Data model: migration `supabase/migrations/00NN_org_chart.sql`
(Use the next free number at implementation time.) Follow the house style: a guard `do $$` block that checks the previous migration ran, `if not exists`, safe to re-run.

```sql
create table if not exists org_charts (          -- several charts: Parish (PPC + clusters), GKK level, …
  id serial primary key,
  title text not null,
  slug text unique not null,
  scope text not null default 'parish' check (scope in ('parish', 'gkk')),
  gkk text,                            -- the GKK a GKK-level chart belongs to; null = parish chart
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
  member_id int references members on delete set null,    -- optional holder
  holder_name text,                    -- free-text holder when not a registered member
  photo_url text,                      -- holder photo (media-upload function, like gkks.photo_url in 0046)
  note text,                           -- term, e.g. "2025–2028"
  sort_order int not null default 0,   -- order among siblings
  pos_x real, pos_y real               -- React Flow canvas position (admin only)
);
```
- **RLS:** read for all signed-in staff. Write for `full` access only, the same rule as `manageLists` in `lib/access.js`. Check `staff_access() = 'full'` in the policies and in the save RPC, following 0014_roles_activity_trash.sql.
- **`org_charts.gkk`:** link it to `gkks` (by name with `on update cascade`, or by id). Check how other tables reference GKKs at implementation time.
- **Public RPC** `public_org_chart(slug text) returns jsonb`: a `security definer` function, granted to `anon`, that returns only published charts and only safe fields (id, parentId, title, holder display name, holder photo, note). It never returns member ids or contact details. Members have no photo column, so the photo is the node's `photo_url`. This follows the pattern of `list_public_parish_positions()` in 0006. Add a `public_org_charts()` list too (title, slug, scope, gkk), for the site's pills and GKK pages.
- **Save RPC** `save_org_chart(chart_id, nodes jsonb)`: saves the whole canvas in one transaction (upsert nodes, delete removed ones). Edges are stored as `parent_id`. Log the change in the activity log, as the other admin writes do.
- **Cycles:** reject any node that would become its own ancestor (check in the save RPC).

## Admin: React Flow editor
- `npm i @xyflow/react @dagrejs/dagre` in `client/`.
- **New page:** `client/src/pages/admin/OrgChart.jsx`, route `/admin/settings/org-chart`.
  - Add a nav item in `client/src/components/adminNav.js` under "Settings", next to "Ministries & organizations" (`need: 'manageLists'`, `notForLeaders: true`).
  - Load it with `React.lazy` in `client/src/App.jsx` so React Flow stays out of the public bundle. No route is lazy-loaded today, so this would be the first.
- **Layout:** chart picker plus "New chart" at the top, the canvas in the middle, and a side drawer for the selected node, reusing the drawer and form bits in `components/admin.jsx` and `ui.jsx`.
- **New chart dialog:** asks for the title and scope (Parish or GKK). For GKK scope, it also asks which GKK.
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
- **GKK-level charts:** show on that GKK's page (`GkkDetail` in `Komunidad.jsx`, route `/komunidad/gkk/:name`) as a "Mga Opisyal" section, when a published chart exists for that GKK.
- **States:** use `DataState`, `Skeleton` and `EmptyNote` from `components/site/kit.jsx`.

## Steps (suggested order)
1. Migration and RPCs. Run it on Supabase.
2. `lib/orgChart.js` and `client/test/org-chart.test.js` (node --test): tree building, cycle detection, children moving up on delete, initials.
3. API functions in `api.js`.
4. Admin `OrgChart.jsx` (React Flow), the nav item and the lazy route.
5. Public `OrgChartView.jsx` (d3-org-chart) and the Komunidad "Organisasyon" view.
6. GKK-level charts on the GKK detail page.
7. Optional: when a node is linked to a `parish_positions` name and a member, also set that member's `members.parish_role`, so the registry and the chart agree.

## Still open
- **GKK level:** one chart per GKK (assumed; each GKK fills in its own officers), or a single chart of the standard GKK structure shared by every GKK?

## Verification
- `npm test`: the new `org-chart.test.js` passes along with the existing suite.
- `preview_start` the dev server:
  - In `/admin/settings/org-chart`: build a 3-level chart, drag to reparent, tidy, save, reload, and confirm it persists.
  - Try to make a cycle and confirm it's rejected.
  - Sign in as a non-full user (read-only, website, GKK leader) and confirm they can't open or save the editor. The database must refuse the save as well, not just the UI.
- Publish a parish chart, then on `/komunidad?view=organisasyon`: confirm the chart renders with names and photos, collapse, expand and fit work, and it's usable at 375 px width in light and dark.
- Publish a GKK chart and confirm it appears on `/komunidad/gkk/<name>`.
- Unpublish and confirm the public RPC returns nothing. Confirm no member ids or contacts appear in the public network response.
- `npm run build`: React Flow and d3 end up in separate lazy chunks, not the main bundle.
