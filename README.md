# Parish Members Online Registry

A full-stack parish membership registry: a public household registration wizard for parishioners, and an admin panel for parish staff to manage households, members, sacraments, ministries, organizations, and reports.

Built with **React + Tailwind CSS**, talking directly to **Supabase** (Postgres + Auth) — no separate backend server. Row Level Security policies and Postgres functions (in `supabase/migrations/`) enforce who can read/write what.

## Features

**Public registration portal**
- Landing page and a 5-step household registration wizard (household info → members → sacraments → engagement → review)
- Client-side validation, review-before-submit, printable confirmation with a reference number

**Admin panel**
- Staff sign-in (Supabase Auth)
- Dashboard with registration trends, age distribution, GKK and ministry breakdowns, sacrament stats; every card links to the matching filtered list, plus a queue of households awaiting verification with one-click Verify
- Households: search, filter, expand members, verify/unverify (recording who verified and when), add new households on a family's behalf, print
- Possible duplicates: members who share a name and date of birth, to catch families who registered twice
- Members: sortable/filterable directory with a full editable detail view (personal info, sacraments, ministries, organizations)
- Sacraments overview table with per-sacrament filters
- Ministry & organization directories with per-group rosters
- Reports: registration status by GKK, sacramental completion, ministry/org participation, blood type directory, and an ad-hoc report builder
- CSV exports for members, households, and blood type directory
- Parish census: start a census whenever the parish decides (yearly, every two years…), print pre-filled census forms by GKK, record each member's participation and status (Active, Inactive, Moved away, Deceased, Left the Church), and see results by GKK
- Census family portal: families update their record online at `/census` with the reference number and access code from their census form; staff review and approve each update
- Parish configuration: parish name, logo, GKK list, ministries, and organizations management
- Parish website content: one page with tabs for the Mass & confession schedule, sacrament guides (steps, documents, fees), announcements, the weekly bulletin, the events calendar, and office hours / contact details / map. Every item is a draft until staff publish it
- Requests: staff queues for certificate requests (linked to the member record and its sacrament verification, tracked from Received to Released), prayer intentions (printable list for Mass, bulk "prayed for"), and blood calls (compatible donors listed with their rest period, a call/text contact log). Donors opt in; the blood type directory stays staff-only. The public forms submit through rate-limited database functions that return a reference number
- Staff accounts (staff admins only): add staff with a temporary password, reset passwords, disable/enable accounts, and choose each account's access level (see [Staff access levels](#staff-access-levels))
- Activity log: who added, changed or deleted each household, member and sacrament verification, with the old and new values; also shown as History in the member window and the household panel
- Trash: deleted households and members are kept for 30 days and can be restored with everything attached to them; deleting shows an Undo
- Quick search (Ctrl+K / ⌘K) across pages, households, members and requests
- Dashboard "Today" panel with what's waiting (requests, census, sacraments to verify, the week's events and bulletin), and sidebar badges for each queue
- Households: sortable columns, bulk Verify / Print / Export for selected rows; Members: removable filter chips and Export this view; phone-friendly card layouts
- Dark mode for the admin panel (Light / Dark / Auto, per device) and a parish-wide default color theme
- Staff are signed out after 20 minutes without activity, after a one-minute warning
- List filters, search and page are kept in the address bar, so refresh, Back and shared links keep the view

## Tech stack

| Layer    | Tech |
|----------|------|
| Frontend | React 18, React Router, Tailwind CSS, Vite |
| Backend  | Supabase (Postgres, Row Level Security, Auth, Postgres functions, one Edge Function for staff accounts) |
| Hosting  | Vercel (frontend) + Supabase (database), both free-tier |

## Project structure

```
supabase/migrations/  Schema, RLS policies, and Postgres functions (ref numbers,
                       rename/delete-guard, public registration RPC, admin totals)
supabase/functions/   manage-staff Edge Function (staff accounts; needs the
                       service-role key, so it can't run in the browser)
scripts/               Local demo/reset seeding against a Supabase project
client/                React + Tailwind frontend (Vite), with its own package.json
docs/                  Testing guide and browser beta-testing playbooks
project/               Original Claude Design source files this app was built from
```

## Getting started

### 1. Create a Supabase project

Follow [`guadalupe-registry-deployment-guide.md`](guadalupe-registry-deployment-guide.md) Part 1, or in short:

1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) — this creates every table, view, RLS policy, and function, and seeds the default GKKs/ministries/organizations. Then run each later migration in order ([`0002_head_first_registration.sql`](supabase/migrations/0002_head_first_registration.sql) adds the Household Head fields, the participation survey, and the public GKK list; [`0003_public_stats_groups_names.sql`](supabase/migrations/0003_public_stats_groups_names.sql) adds the homepage stats, the public organization list, unique household names, and fixes renaming ministries/organizations; [`0004_public_parish_logo.sql`](supabase/migrations/0004_public_parish_logo.sql) lets the public registration site show the uploaded parish logo; [`0005_sacrament_verification.sql`](supabase/migrations/0005_sacrament_verification.sql) lets staff mark self-reported sacraments as verified against a certificate or the parish register; [`0006_parish_positions.sql`](supabase/migrations/0006_parish_positions.sql) adds the Parish Organization Structure list and each member's "Katungdanan sa Parish"; [`0007_census.sql`](supabase/migrations/0007_census.sql) adds the parish census; [`0008_census_portal.sql`](supabase/migrations/0008_census_portal.sql) adds the census family portal; [`0009_admin_household_wizard.sql`](supabase/migrations/0009_admin_household_wizard.sql) lets the admin New Household panel save the participation survey, volunteer, consent and religion; [`0010_admin_tools.sql`](supabase/migrations/0010_admin_tools.sql) records who verified a household and when, adds "last updated" times, computes dashboard/report totals in the database, adds the duplicate-member finder, and adds the staff-admin flag — every account that exists when it runs becomes a staff admin; [`0011_website_content.sql`](supabase/migrations/0011_website_content.sql) adds the parish website content: Mass schedule, sacrament guides, announcements, bulletins, events, and office hours/contact details; [`0012_requests.sql`](supabase/migrations/0012_requests.sql) adds certificate requests, prayer requests, blood requests and the blood donor list, with the public submit functions; [`0013_public_site.sql`](supabase/migrations/0013_public_site.sql) adds what the public website reads; [`0014_roles_activity_trash.sql`](supabase/migrations/0014_roles_activity_trash.sql) adds staff access levels, the activity log, the trash, the sidebar counts and the parish default theme — every account that exists when it runs keeps full access; [`0015_staff_hardening.sql`](supabase/migrations/0015_staff_hardening.sql) stops signed-out visitors from calling the staff functions and leaves staff with read-only access to staff profiles; [`0016_mass_types.sql`](supabase/migrations/0016_mass_types.sql) adds the Mass types — Regular Mass (Sunday), Daily Mass, GKK Mass and Special Mass for feasts and holy days of obligation, with their dates — and turns existing "Mass" rows into Regular or Daily Masses). Existing projects only need the migrations they haven't run yet.
3. Create your first admin: **Authentication → Users → Add user**, then, with that user's UUID, run:
   ```sql
   insert into profiles (id, name, role, is_admin)
   values ('<paste-uuid-here>', 'Ma. Assumpta R.', 'Parish Secretary', true);
   ```
   After that, staff admins add everyone else from **Settings → Staff** in the admin panel.
4. **Authentication → Providers → Email → turn off "Allow new users to sign up."**
5. Copy your **Project URL** and **anon/publishable key** from **Project Settings → API**.
6. Deploy the staff-accounts Edge Function (needed for **Settings → Staff**; the rest of the app works without it):
   ```bash
   npx supabase login
   npx supabase functions deploy manage-staff --project-ref <your-project-ref>
   ```
   Or, in the dashboard: **Edge Functions → Deploy a new function**, name it `manage-staff`, and paste in [`index.ts`](supabase/functions/manage-staff/index.ts) and [`handler.js`](supabase/functions/manage-staff/handler.js). Supabase provides the URL and service-role key to the function automatically; there's nothing to configure.

### 2. Install dependencies

```bash
npm run install:all
```

### 3. Configure the client

```bash
cd client
cp .env.example .env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
cd ..
```

### 4. Run the app

```bash
npm run dev
```

- Registration portal: `http://localhost:5173/`
- Admin panel: `http://localhost:5173/admin/login` (sign in with the admin account from step 1)

### 5. Sample data (optional)

`scripts/supabase-seed.mjs` inserts/clears demo households directly against your Supabase project using the **service-role key** — keep it out of the client and out of Vercel's env vars. Set it in a root, gitignored `.env` (see `.env.example`):

```bash
npm run db:demo    # insert six fictional sample households
npm run db:reset   # delete every household (and, via cascade, every member)
```

## Staff access levels

Staff admins set each account's access under **Settings → Staff** (after the
0014 migration). The database enforces it: row level security limits what an
account can read, and a trigger on each table refuses changes the account
isn't allowed to make, with a message saying why.

| Access | Can see | Can change |
|---|---|---|
| Full access | Everything | Everything (the only level that can delete, restore from the Trash, verify sacraments, run the census and edit settings) |
| Read only | Every page except the Trash | Nothing |
| GKK leader | The households and members of one GKK | Those households and members, but can't delete them |
| Website & requests | The registry (to match certificate requests), the Parish Website and Requests | The Parish Website and Requests |

Staff admins always have full access. The registration and census portals
aren't affected: they don't sign in as staff.

If the `manage-staff` Edge Function was deployed before 0014, deploy it again
(step 6 above) so Settings → Staff can save access levels.

## Running a parish census

The **Census** page in the admin panel replaces the hand-filled census sheet.

1. **Start a census** (e.g. "2026 Census"). Only one can be open at a time. The
   *Schedule* setting (every year, every 2 years, …) only drives the "next
   census due" reminder; the administrator still decides when to start one.
2. **Print the forms.** Choose a GKK and print its forms: one page per
   household, pre-filled with what the registry has on file, with an A / P / W
   (Aktibo / Panagsa / Wala) grid and status choices per member and blank rows
   for new members.
3. **Record what comes back.** Open a household with **Record census**, mark
   each member's answers and status, and save. The status is suggested from
   the answers (Mass *Aktibo*, or two items *Aktibo/Panagsa*, suggests Active;
   all *Wala* suggests Inactive), but staff always choose it. Corrections to
   names, sacraments and so on use the usual member window, and new members
   can be added from the same panel.
4. **Or let families do it online.** Each printed form carries the household's
   access code and the address of the portal (`<your site>/census`). The
   family signs in with its reference number and that code, corrects its
   details, answers the census for each member and can add new members.
   Nothing changes in the registry until staff open **Census → Online
   updates**, review what changed, and approve (or reject) it. Approval only
   applies the fields the family changed, so corrections staff made in the
   meantime are kept. Five wrong codes lock that household's sign-in for 15
   minutes. If a form is lost, **New code** in the household's census panel
   makes the old code stop working.
5. **Close the census** when forms stop coming in. Closing changes no data.
   Members nobody confirmed show up under the *Not confirmed in census* filter
   on the Members page, and in the census results by GKK.

The census is per member, not per household. Members marked *Moved away* or
*Deceased* stay on record but drop out of lists, counts and the next census's
forms. Before staff first change a household in a census, a snapshot of it is
saved in `census_household_snapshots`.

## Staying on the free tier: keep-alive and backups

Two GitHub Actions workflows in `.github/workflows/` cover what the free
Supabase plan doesn't. Each one does nothing (and says so in its log) until
its secrets are added under **Settings → Secrets and variables → Actions**.

| Workflow | What it does | Secrets |
|---|---|---|
| `keep-alive.yml` | Every 3 days, calls one tiny read-only function so the free project never hits Supabase's 7-days-idle pause | `SUPABASE_URL`, `SUPABASE_ANON_KEY` (the same values as the website's) |
| `backup.yml` | Every Sunday, dumps roles, schema and data, encrypts them with your passphrase (AES-256, `gpg`), and keeps the file as a workflow artifact for 90 days | `SUPABASE_DB_URL` (Supabase → **Connect** → *Session pooler* string, with the password), `BACKUP_PASSPHRASE` |

Both can also be run by hand from the **Actions** tab. GitHub pauses scheduled
workflows in repositories with no commits for 60 days. If that happens it
emails the repository owner, and one click re-enables them.

**Restoring a backup:** download the artifact from the workflow run, then run
`gpg --decrypt parish-backup-YYYY-MM-DD.tar.gz.gpg | tar -xz`. Load
`roles.sql`, then `schema.sql`, then `data.sql` into a new Supabase project with
`psql "<connection string>" -f <file>`. Keep the passphrase somewhere safe
offline: the backups can't be opened without it.

## Available scripts

Run from the project root:

| Command | Description |
|---|---|
| `npm run install:all` | Install root and `client/` dependencies |
| `npm run dev` | Run the Vite client with hot reload |
| `npm run build` | Production build of the client |
| `npm run db:demo` | Load sample households and members (see above) |
| `npm run db:reset` | Delete all households and members |
| `npm run db:wipe-test -- --yes` | Empty every registry table on the **test** project before a browser playbook run (needs `PLAYBOOK_TEST_PROJECT=yes`; see `.claude/playbooks/staff-journey-playbook.md`) |
| `npm test` | Run the client test suite |
| `npm run test:watch` | Client tests, watch mode |

Sample records are fictional and live in
[`scripts/demo-data.mjs`](scripts/demo-data.mjs) — edit that file to tailor them
to your parish.

## Deploying

See [`guadalupe-registry-deployment-guide.md`](guadalupe-registry-deployment-guide.md) for the full Vercel + Supabase walkthrough. In short: push to GitHub, import the repo into Vercel with **Root Directory set to `client`**, add `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` as Vercel env vars, and deploy — `client/vercel.json` handles the SPA routing rewrite.

## Testing

Two halves, both needed before a release.

**Automated** — Node's built-in test runner, no framework to install:

```bash
npm test
```

Covers pure browser-side logic (CSV building, shared constants/helpers). The
RLS policies and Postgres functions in `supabase/migrations/0001_init.sql` are
the source of truth for server-side behavior and aren't covered by this suite —
verify them against a real Supabase project (see [`docs/testing.md`](docs/testing.md)).

**Manual** — scripted browser walkthroughs for beta testers, covering the public
registration wizard, the admin panel, reports and exports, plus responsive,
keyboard, printing and data-protection checks:
[`docs/beta-testing/`](docs/beta-testing/README.md). Each check has an ID so bug
reports can point at exactly what failed, and there are templates for bug
reports and for the round's run log.

> Note: both testing docs still describe the retired Express/PostgreSQL setup
> in places (e.g. `TEST_DATABASE_URL`, `db:setup`) — treat those specific
> mentions as stale pending a follow-up pass.

## License

MIT

## Credit

Built by [DaveenDev](https://github.com/DaveenDev).
