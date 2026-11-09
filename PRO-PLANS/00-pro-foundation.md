# PRO Foundation: keeping PRO apart from the free app

> **Status:** proposed 2026-11-05, not started.
> **Build this first.** Every module plan in this folder (01–07) depends on it.
> How Free and PRO parishes get updates (tracks, the `release-parish`
> command, upgrading a parish to PRO): [08-release-tracks.md](08-release-tracks.md).

## Context

- The free app is public on GitHub (`DaveenDev/parish-members-registry`)
  under MIT with the "Built For Free by DaveenDev" condition. Anything pushed
  there stays free for good, and the README promises that every feature in it
  stays free. **No existing feature moves behind PRO.**
- Each parish has its own copy: its own GitHub repository, Vercel project and
  Supabase project, usually on the parish's own accounts
  (`deploy/03-new-parish.md`). Updates go out with `npm run release:db`,
  `npm run release:functions` and a cherry-pick into each parish's copy
  (`deploy/04-releases.md`).
- The business model: a **₱5,000 setup fee** gets a parish the Free version.
  PRO is a **separate license per parish** for new modules.

## Goals

1. No PRO code or SQL ever reaches the public repository.
2. A free release works unchanged on a PRO parish, and a PRO release never
   breaks a free release.
3. A parish receives only the modules it paid for.
4. One command releases PRO to every PRO parish, in the same order as the free
   app: database, then functions, then website.

## The modules

| # | Plan | Sold as |
|---|---|---|
| 01 | [Sacramental Registers & Certificates](01-sacramental-registers.md) | PRO (flagship) |
| 02 | [Mass Intentions](02-mass-intentions.md) | PRO |
| 03 | [SMS & Credits](03-sms-credits.md) | PRO, plus prepaid credits |
| 04 | [Bookings & Calendar](04-bookings-calendar.md) | PRO |
| 05 | [Parish Cashbook](05-parish-cashbook.md) | PRO |
| 06 | [Columbarium](06-columbarium.md) | Add-on, priced on its own |
| 07 | [Diocese Dashboard](07-diocese-dashboard.md) | Sold to the diocese, priced on its own |
| 08 | [Release tracks](08-release-tracks.md) | How Free and PRO parishes get updates |
| 09 | [Advertising PRO in the free app](09-pro-promotion.md) | Free app code: tip cards and the monthly showcase |

**Build order:** this foundation (with 08's release command) → 01 → 02 →
**09** (the free release that starts advertising PRO, once there's a PRO
demo to show) → 03 → 04 → 05. Build 06 and 07 only when a parish or diocese
asks and pays a deposit.

## Pricing (starting points, in ₱)

| Item | Price | Notes |
|---|---|---|
| Setup (Free version) | ₱5,000 | Write down what it includes: accounts under the parish Gmail, branding, GKKs, ministries, photo storage, email, backups, first staff accounts, one walkthrough, and **1 year of managed free updates**. Travel and extra training days are charged separately. Raise to ₱8–10k after 3–5 parishes. |
| Free managed renewal (optional) | ₱3,000/year | Managed free updates after the first year, in a batch every 3 months. Otherwise you hand the parish over and it updates itself (plan 08). |
| PRO license, one-time per parish | ₱20,000 regular; ₱12–15k founding price for the first 5 parishes | Includes 1 year of PRO updates and support |
| Yearly renewal (optional) | ₱6,000/year | Keeps updates and support coming, **including new PRO modules as they ship**. If a parish stops paying, what it has keeps working. |
| SMS credits | ₱1 per text, packs of ₱500 / ₱1,000 | See plan 03 |
| Columbarium add-on | starting idea ₱15,000 one-time | See plan 06 |
| Diocese dashboard | starting idea ₱25,000 setup + ₱2,000 per parish connected | See plan 07 |

For comparison, Ekklesia (a Davao-based church-management app) charges
₱5,799 a month.

**Founding offer:** Mua-an gets PRO free as the pilot parish, in exchange for
a testimonial and being the reference parish. Before building 01, ask the
Mua-an and SJMV secretaries which modules they'd pay for, and get one
paying parish to commit with a deposit.

## Decisions

### 1. A private repository that is a fork of the free one

`DaveenDev/parish-registry-pro`, **private**. It starts as a copy of the
free repository, and the free `main` is merged into it regularly, so PRO
development runs on the whole app (`npm run dev` shows free + PRO together).

The **free repo stays public** (plan 08 has the reasons). Only the PRO repo
and the parish copies you manage are private. Releases to every managed
parish run from the PRO repo folder, which holds the only `parishes.json`.

```
(every free file, merged from the free main, never edited here)
client/src/pro/<module>/        PRO client code, one folder per module
client/src/pro/core/            shared PRO client code (proCan, PRO API helpers)
pro/supabase/migrations/        P0001_pro_core.sql, P0002_registers.sql, …
pro/supabase/functions/         PRO Edge Functions (send-sms, …)
pro/hub/                        Dave's own central project (SMS relay), plan 03
pro/scripts/release-parish.mjs  one command per parish, free and PRO (plan 08)
pro/scripts/release-pro.mjs     the PRO database part, called by release-parish
pro/scripts/pro-sync.mjs        copies a parish's modules into its copy
parishes.json                   gitignored; the only copy, moved here from the free folder
pro/docs/                       PRO setup and release notes
pro/LICENSE-PRO.md              the PRO license (not MIT)
```

**The rule that keeps merges painless:** a PRO commit never changes a free
file. No edits to `package.json`, `client/package.json`, App.jsx, the free
migrations or functions. Scripts run as `node pro/scripts/…` instead of npm
scripts. PRO uses only the npm packages the free client already has. If a
module truly needs a new package, add it to the free repo first (it does no
harm there).

**Leak guard**, set once in the private repo:

```bash
git remote add upstream https://github.com/DaveenDev/parish-members-registry.git
git remote set-url --push upstream DISABLED   # can pull from free, can never push to it
```

Never add the private repo as a remote in the free repo's folder.

### 2. One extension point in the free repo (public, generic, done once)

The free app gets a small, generic "extensions" slot. On its own it does
nothing; it's harmless to publish and gives nothing away.

- `client/src/pro/index.js`: picks up whatever module folders exist with
  `import.meta.glob('./*/index.js', { eager: true })`, and exports
  `proRoutes` (admin and website routes), `proNavItems` (sidebar entries,
  each naming its `NAV_GROUPS` group), `proSlots` (named UI slots) and
  `proActivityLabels`. In the free repo there are no module folders, so
  everything comes back empty.
- `client/src/components/ProSlot.jsx`: `<ProSlot name="…" {...props} />`
  renders every component registered for that slot, or nothing.
- Hooks in free code (each one line):
  - `App.jsx`: add `proRoutes` under the admin layout and the site layout.
    Each module's pages are `React.lazy`, so free parishes' bundles don't
    grow.
  - `components/adminNav.js`: merge `proNavItems` into `NAV_GROUPS`.
  - `lib/activity.js`: merge `proActivityLabels`, so PRO tables show readable
    names in the Activity log.
  - Named slots: `certificateRequestActions` (in
    `components/requests/CertificatesTab.jsx`), `bloodRequestActions` (in
    `components/requests/BloodRequestsTab.jsx`), `memberPanels` (in
    `components/MemberDetailModal.jsx`), `serbisyoButtons` (in
    `pages/site/Serbisyo.jsx`), `checkStatusLookups` (in
    `pages/site/CheckStatus.jsx`), `dashboardToday` (the Dashboard's
    "Today" panel), `parishConfigTabs` (in `pages/admin/ParishConfig.jsx`).
- After this change, **the free repo doesn't touch `client/src/pro/`
  again** except on purpose, with a note in the release notes.

A PRO parish's copy gets its module folders under `client/src/pro/` from
`pro-sync.mjs`. Nothing else in the copy changes.

### 3. PRO database changes keep their own history

`supabase db push` keeps one history per database
(`supabase_migrations.schema_migrations`). If PRO files went in there, a free
`release:db` would stop on "remote versions not found locally" for every PRO
parish. So:

- PRO migrations live in `pro/supabase/migrations/`, named `P0001_…sql`.
- `release-pro.mjs` runs them itself and records each in its own table,
  `pro_migrations (version text primary key, applied_at timestamptz)`.
  Use the same connection strings as `parishes.json`. Check
  `npx supabase db query --help` for a remote/db-url flag first; if it has
  none, use the `pg` npm package in the private repo's scripts only.
- Free migrations keep running through `release:db` exactly as now.

**Rules for a PRO migration** (on top of the free rules in
`deploy/04-releases.md`):

1. Starts with the house-style guard block, naming the **free** migration it
   needs (e.g. `0118_hero_position.sql`) and the PRO one before it. Safe to
   re-run.
2. **Never `create or replace` a free function**, never alter a free check
   constraint, never drop or rename anything free. A later free migration
   would overwrite the change, or break on it.
3. May add its own tables, views, functions, policies and triggers, and may
   add a column to a free table only when nothing else will do (say so in the
   file).
4. May call these free functions, which become the **"free API"**:
   `staff_access()`, `staff_gkk()`, `staff_can_see(area)`,
   `current_staff_name()`, `public_request_guard(kind, per_visitor, overall)`,
   `payload_text(p, key, max)`, `require_mobile(text)`. Add one line to the
   free `deploy/04-releases.md` rules: "Don't change what these functions
   take or return; PRO depends on them."
5. Treats the `demo` access level like `full` (as 0101 does).

### 4. Which modules a parish has, and who may use them

Migration `P0001_pro_core.sql`:

```sql
-- Which PRO modules this parish has. Written only by release-pro.mjs
-- (as the database owner); staff can read it, never change it.
create table if not exists pro_license (
  id            smallint primary key default 1 check (id = 1),
  parish        text not null,
  modules       text[] not null default '{}',   -- 'registers', 'intentions', 'sms', 'bookings', 'cashbook', 'columbarium', 'diocese'
  licensed_on   date not null,
  updates_until date not null,                   -- renewal date; nothing stops working after it
  note          text
);

create or replace function public.pro_module_on(p_module text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p_module = any(modules) from pro_license where id = 1), false);
$$;

-- Each module's default level for each free access level, seeded by the
-- module's own migration, e.g. ('registers', 'website', 'view').
create table if not exists pro_module_defaults (
  module text not null,
  access text not null,     -- a profiles.access value
  level  text not null check (level in ('view', 'edit')),
  primary key (module, access)
);

-- Extra rights a staff admin gives one account (a treasurer, a columbarium clerk).
create table if not exists pro_grants (
  user_id    uuid not null references auth.users(id) on delete cascade,
  module     text not null,
  level      text not null check (level in ('view', 'edit')),
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, module)
);

-- True when the signed-in account may view (or edit) a module.
create or replace function public.pro_can(p_module text, p_level text default 'view') returns boolean
language sql stable security definer set search_path = public as $$
  select pro_module_on(p_module) and exists (
    select 1 from (
      select level from pro_module_defaults
       where module = p_module and access = case staff_access() when 'demo' then 'full' else staff_access() end
      union all
      select level from pro_grants where user_id = auth.uid() and module = p_module
    ) l where l.level = 'edit' or p_level = 'view'
  );
$$;
```

- Every PRO table's RLS policy uses `pro_can('<module>')` to read and
  `pro_can('<module>', 'edit')` to change. Turning a module off hides its
  data without deleting it.
- `pro_grants` is changed only by staff admins (`profiles.is_admin`), through
  a function, from **Settings → PRO** (a `parishConfigTabs` slot): the
  modules this parish has, until when updates run, and the extra grants.
- The client gets `pro_modules()` (modules + `updates_until`) once at sign-in.
  `client/src/pro/core/access.js` has `proCan(user, module, level)` to decide
  which pages and buttons to show; the database enforces the same rules.

### 5. Activity log, notifications, trash

- **Activity log:** the free `log_activity()` is written for households,
  members and verifications, and `log_record_activity()` (0076) names records
  by title/label/name. PRO adds **its own** trigger function,
  `pro_log_activity()`, which writes to the free `activity_log` table with
  PRO-specific labels (an entry's book/page/number, an intention's reference
  number). Same rules as 0076: skip bookkeeping columns, never log anything
  that looks like a key or secret.
- **Notifications:** PRO inserts into the free `staff_notifications` table
  with `area = 'requests'` or `'registry'`, so the free
  `notification_visible_to()` and the push function work unchanged. Use a new
  `kind` (e.g. `intention`, `booking`) and a `link` to the PRO page.
- **Trash:** the free trash's kinds are a check constraint, so PRO can't use
  it. PRO tables get `deleted_at`, `deleted_by`, `delete_reason`, and each
  module's page has a "Deleted" filter with Restore. A daily `pg_cron` job
  removes what's been deleted for over 3 months, like 0103.

### 6. `parishes.json` and releasing PRO

Every managed parish in `parishes.json` (in the PRO repo folder, gitignored)
gets a `track`, an `updatesUntil` and its `worktree`; a PRO parish also gets
a `pro` block:

```json
{
  "name": "muaan",
  "label": "Guadalupe, Mua-an",
  "projectRef": "…",
  "dbUrl": "…",
  "track": "pro",
  "updatesUntil": "2027-12-01",
  "worktree": "../registry-muaan",
  "pro": {
    "modules": ["registers", "intentions"],
    "licensedOn": "2026-12-01"
  }
}
```

`updatesUntil` is what `pro_license.updates_until` is written from.

`node pro/scripts/release-pro.mjs <status|demo|name|all>`:

1. Refuses unless the private repo is on `main` with nothing uncommitted in
   `pro/` (same as `release-db.mjs`).
2. For each PRO parish, **after** its free `release:db`: runs the PRO
   migrations its modules need that `pro_migrations` doesn't list yet, then
   writes its `pro_license` row from `parishes.json`.
3. Deploys the PRO Edge Functions its modules need:
   `npx supabase --workdir pro functions deploy <name> --project-ref <ref> --use-api`.
4. Runs `pro-sync.mjs`: copies `client/src/pro/core/` and only the parish's
   module folders into its worktree, removes module folders it no longer
   has, commits as the parish (the Hobby-plan author rule in
   `deploy/03-new-parish.md`) and pushes.

**Order for a PRO parish, every release:** free database → PRO database →
free functions → PRO functions → website (cherry-pick the free commits as
now, then `pro-sync`, then push). Backup first for live parishes, as now.

In practice you don't run these one by one: `release-parish.mjs` (plan 08)
does the whole order for one parish, or for every parish on a track
(`pro`, `free`), and `track` in `parishes.json` (`demo`, `free-managed`,
`pro`, `frozen`) decides what each one gets.

**PRO parishes' repositories must be private.** Check SJMV's
(`SJMVparish/website`) and any other copy that will get PRO.

### 7. PRO demo site

- A second Vercel project, built from the **private** repo, against the
  existing demo Supabase project (`qyoyuukpdjrwfhovtrwd`) with every PRO
  migration run on it and every module in its `pro_license`.
- Same "Login to Demo Site" button. PRO pages carry a small "PRO" badge.
- The free demo keeps working: it has no PRO client code, and the PRO tables
  in the shared demo database are simply unused there.
- Sample data: `node pro/scripts/sample-pro.mjs seed|clean` (made-up
  register entries, intentions, bookings, cashbook lines).

### 8. License and agreement

- `pro/LICENSE-PRO.md`: the PRO code is licensed per parish, not MIT. The
  parish may use and change it for itself, and may not copy it to another
  parish or publish it.
- A one-page agreement, signed by the parish priest **in the parish's name**
  (priests get reassigned; the license stays with the parish): modules,
  price, `updates_until`, support scope (what's included, response time),
  data ownership (the parish owns its data and accounts, as now), and what
  happens if renewal stops (everything keeps working, no new updates).
- Free README: add a short "PRO modules" section: what they are, that every
  free feature stays free, and how to ask.

## Free repo changes, in one commit

1. `client/src/pro/index.js` (the glob registry, empty in free) and
   `client/src/components/ProSlot.jsx`.
2. The hooks in App.jsx, adminNav.js, lib/activity.js and the seven named
   slots.
3. The "free API" line in `deploy/04-releases.md`.
4. README: the "PRO modules" section.
5. Tests: `client/test/pro-registry.test.js`: with no modules, routes, nav
   items and slots come back empty and the app's routes are unchanged.

## Steps

1. Free repo: the commit above. Release it as a normal free update.
2. Create the private repo from the free one; set the leak guard.
3. `P0001_pro_core.sql`, `release-pro.mjs`, `pro-sync.mjs`.
4. `client/src/pro/core/`: `proCan`, the `pro_modules()` call in the
   auth flow (through a slot or a PRO wrapper, not by editing
   `AuthContext.jsx`), Settings → PRO tab.
5. A throwaway module `client/src/pro/hello/` (one page, one nav item, one
   migration) to prove the whole path: demo database, PRO demo site, then one
   parish worktree. Delete it after.
6. PRO demo site on Vercel.
7. `pro/LICENSE-PRO.md`, the agreement template, the README section.

## Testing

- Free parish: a free release with the extension point changes nothing
  visible (pages, sidebar, bundle size within a few KB).
- PRO parish: a free `release:db` still runs clean after PRO migrations
  (no "remote versions not found locally").
- A parish with only `registers` gets no intentions code in its copy, and
  `pro_can('intentions')` is false even if someone calls the API directly.
- `pro_license` can't be changed by any staff account, a staff admin
  included.
- `git push upstream` from the private repo fails.

## Open questions

- Does `npx supabase db query` take a remote connection string, or should
  `release-pro.mjs` use `pg`?
- Is SJMV's repository private? Does SJMV want PRO?
- Support scope for the agreement: how fast a reply, and through what
  channel?
