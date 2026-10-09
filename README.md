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
- Organization Structure (Parish life): org charts drawn on a drag-and-drop canvas (React Flow), one tab per chart: Church Structure, the GKK Structure every GKK shares (its officers filled in from members' GKK roles), and any chart staff add. Published charts show on the website under Ang Simbahan → Organisasyon (zoomable and collapsible, d3-org-chart), and each GKK's page lists its officers under “Mga Opisyal”. A member placed on a position from the parish positions list gets it as their Katungdanan sa Parish
- Reports: registration status by GKK, sacramental completion (counted among members old enough for each sacrament), ministry/org participation and blood types, printable and exportable as one CSV; and a report builder with:
  - Members: by GKK, sacrament (received, or not yet received though old enough), ministry/organization, age group, age and sex, civil status, tribe, religion; deceased; moved away or left the Church
  - Celebrations: birthdays and wedding anniversaries in a month
  - Households: by status, GKK and registration month; waiting for verification (longest first); the volunteer pool and how each household can help; verifications by staff per month
  - Sacraments: verification progress, candidates per GKK (not baptized, no First Communion, not confirmed), couples who could be married in church (live-in, civil or another church's wedding), sacraments received by year
  - Ministries & organizations: each group's make-up by sex, age and GKK; small or empty groups; members in three or more groups; GKK officers with vacant roles; parish roles
  - Census: results by GKK, compared with the census before, households vs last year, not yet registered, members not confirmed in the chosen census
  - Requests: certificate turnaround and fees by month, sacrament requests (OCIA, Anointing) and blood requests outcomes
  - Data quality: missing details by GKK, members with missing details, households with no GKK, head, members or contact number
- CSV exports for members, households, and blood type directory
- Parish census: start a census whenever the parish decides (yearly, every two years…), print pre-filled census forms by GKK, record each member's participation and status (Active, Inactive, Moved away, Deceased, Left the Church), and see results by GKK
- Census family portal: families update their record online at `/census` with the reference number and access code from their census form; staff review and approve each update
- Parish configuration: parish name, logo, GKK list, ministries, and organizations management
- Parish website content: one page with tabs for the Mass & confession schedule, sacrament guides (steps, documents, fees), announcements, the weekly bulletin, the events calendar, and office hours / contact details / map. Every item is a draft until staff publish it
- Ang Simbahan page on the website (`/simbahan`, formerly Misa ug Sakramento at `/misa`, which still redirects): a Bible verse each day from 100 on the core teachings of the faith, with the Catechism's teaching on it (paragraph numbers and a short explanation); the Mass schedule; then the sacrament guides and the organization charts as two tabs
- Requests: staff queues for certificate requests (linked to the member record and its sacrament verification, tracked from Received to Released), sacrament requests (joining OCIA, the Anointing of the Sick: contacted, scheduled, done), and blood calls (compatible donors listed with their rest period, a call/text contact log). Donors opt in; the blood type directory stays staff-only. The public forms submit through rate-limited database functions that return a reference number
- Staff accounts (staff admins only): add staff with a temporary password, reset passwords, disable/enable accounts, and choose each account's access level (see [Staff access levels](#staff-access-levels))
- Activity log: who added, changed or deleted each household, member and sacrament verification, with the old and new values; also shown as History in the member window and the household panel
- Trash: deleted households and members are kept for 30 days and can be restored with everything attached to them; deleting shows an Undo
- Quick search (Ctrl+K / ⌘K) across pages, households, members and requests
- Dashboard "Today" panel with what's waiting (requests, census, sacraments to verify, the week's events and bulletin), and sidebar badges for each queue
- Staff notifications when someone sends a request from the website (certificates, OCIA, Anointing of the Sick, blood requests, registrations, census updates): a live bell in the admin panel, phone and computer notifications that each staff member turns on under Settings → Notifications (works on iPhone from the Home Screen), and a 7:00 AM summary of what's still waiting. Phones only see the kind of request and its number, never names. See [docs/notifications.md](docs/notifications.md)
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
supabase/functions/   Edge Functions: manage-staff (staff accounts), media-upload
                       (Blog Article photos on R2) and notify-staff (phone
                       notifications for staff); they hold server-side keys,
                       so they can't run in the browser
scripts/               Local demo/reset seeding against a Supabase project
supabase/seed/         500-household load-test data and its cleanup — see
                       docs/load-test-data.md — and a first-census scenario
                       for one GKK (deploy/02-staging.md)
client/                React + Tailwind frontend (Vite), with its own package.json
docs/                  Testing guide and browser beta-testing playbooks
project/               Original Claude Design source files this app was built from
```

## Getting started

### 1. Create a Supabase project

Follow [`guadalupe-registry-deployment-guide.md`](guadalupe-registry-deployment-guide.md) Part 1, or in short:

1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) — this creates every table, view, RLS policy, and function, and seeds the default GKKs/ministries/organizations. Then run each later migration in order ([`0002_head_first_registration.sql`](supabase/migrations/0002_head_first_registration.sql) adds the Household Head fields, the participation survey, and the public GKK list; [`0003_public_stats_groups_names.sql`](supabase/migrations/0003_public_stats_groups_names.sql) adds the homepage stats, the public organization list, unique household names, and fixes renaming ministries/organizations; [`0004_public_parish_logo.sql`](supabase/migrations/0004_public_parish_logo.sql) lets the public registration site show the uploaded parish logo; [`0005_sacrament_verification.sql`](supabase/migrations/0005_sacrament_verification.sql) lets staff mark self-reported sacraments as verified against a certificate or the parish register; [`0006_parish_positions.sql`](supabase/migrations/0006_parish_positions.sql) adds the Parish Organization Structure list and each member's "Katungdanan sa Parish"; [`0007_census.sql`](supabase/migrations/0007_census.sql) adds the parish census; [`0008_census_portal.sql`](supabase/migrations/0008_census_portal.sql) adds the census family portal; [`0009_admin_household_wizard.sql`](supabase/migrations/0009_admin_household_wizard.sql) lets the admin New Household panel save the participation survey, volunteer, consent and religion; [`0010_admin_tools.sql`](supabase/migrations/0010_admin_tools.sql) records who verified a household and when, adds "last updated" times, computes dashboard/report totals in the database, adds the duplicate-member finder, and adds the staff-admin flag — every account that exists when it runs becomes a staff admin; [`0011_website_content.sql`](supabase/migrations/0011_website_content.sql) adds the parish website content: Mass schedule, sacrament guides, announcements, bulletins, events, and office hours/contact details; [`0012_requests.sql`](supabase/migrations/0012_requests.sql) adds certificate requests, prayer requests, blood requests and the blood donor list, with the public submit functions; [`0013_public_site.sql`](supabase/migrations/0013_public_site.sql) adds what the public website reads; [`0014_roles_activity_trash.sql`](supabase/migrations/0014_roles_activity_trash.sql) adds staff access levels, the activity log, the trash, the sidebar counts and the parish default theme — every account that exists when it runs keeps full access; [`0015_staff_hardening.sql`](supabase/migrations/0015_staff_hardening.sql) stops signed-out visitors from calling the staff functions and leaves staff with read-only access to staff profiles; [`0016_mass_types.sql`](supabase/migrations/0016_mass_types.sql) adds the Mass types — Regular Mass (Sunday), Daily Mass, GKK Mass and Special Mass for feasts and holy days of obligation, with their dates — and turns existing "Mass" rows into Regular or Daily Masses; [`0017_practicing_status.sql`](supabase/migrations/0017_practicing_status.sql) adds each member's Practicing Catholic status — a score from their own census participation answers (or the household survey before their first census), their sacraments for their age and their ministries/roles — re-evaluated at every census; [`0018_gkk_chapel.sql`](supabase/migrations/0018_gkk_chapel.sql) adds each GKK's chapel address and year established; [`0019_public_parish_stats.sql`](supabase/migrations/0019_public_parish_stats.sql) adds the home page's member, ministry and organization totals (run after 0018); [`00191_sacrament_guide_drafts.sql`](supabase/migrations/00191_sacrament_guide_drafts.sql) adds the OCIA guide and fills the Baptism, Wedding and OCIA guides with the usual requirements as drafts for staff to check and publish; [`00201_staff_profiles.sql`](supabase/migrations/00201_staff_profiles.sql) fixes "Only parish staff can start a census" for an account with no staff profile — it adds the missing profiles and makes every new account get one, so the manual `insert into profiles` step is no longer needed; [`0020_parish_hero_image.sql`](supabase/migrations/0020_parish_hero_image.sql) adds the parish photo for the home page, set in Parish Config; [`0021_article_gallery.sql`](supabase/migrations/0021_article_gallery.sql) adds Blog Article photo galleries and the History tag — photos need the Cloudflare R2 setup in [docs/media-storage.md](docs/media-storage.md); [`0022_access_code_race.sql`](supabase/migrations/0022_access_code_race.sql) stops two "Get codes" calls at once from failing; [`0023_gkk_leader_codes.sql`](supabase/migrations/0023_gkk_leader_codes.sql) lets GKK leaders get and renew the census codes of their own GKK's households, keeps other GKKs' codes out of their reach, and fixes "Get codes" failing for every account after 0022; [`0024_gkk_leader_census.sql`](supabase/migrations/0024_gkk_leader_census.sql) lets GKK leaders use the Census page for their own GKK; [`0025_media_storage_settings.sql`](supabase/migrations/0025_media_storage_settings.sql) lets a staff admin enter the Cloudflare R2 photo storage settings under Parish Config — redeploy the `media-upload` function after running it; [`0026_secretary_messenger.sql`](supabase/migrations/0026_secretary_messenger.sql) adds the office secretary's Messenger to Office & Contact, shown on the website as a "Message Me" button; [`0027_media_base_url_move.sql`](supabase/migrations/0027_media_base_url_move.sql) rewrites article photo links when the photo storage Public URL changes; [`0028_event_cover_photo.sql`](supabase/migrations/0028_event_cover_photo.sql) adds an optional cover photo to each event — redeploy the `media-upload` function after running it; [`0031_sacrament_guides_anointing.sql`](supabase/migrations/0031_sacrament_guides_anointing.sql) replaces the Funeral guide with Anointing of the Sick and removes Blessings; [`0034_staff_notifications.sql`](supabase/migrations/0034_staff_notifications.sql) adds staff notifications for requests from the website — the bell, phone notifications and the 7:00 AM summary, see [docs/notifications.md](docs/notifications.md); [`0036_email_integration.sql`](supabase/migrations/0036_email_integration.sql) adds the parish email under Parish Config → Platform Integrations, for "Forgot password?" reset emails sent through the parish Gmail — set up as in [docs/email-setup.md](docs/email-setup.md); [`0037_notify_member_requests.sql`](supabase/migrations/0037_notify_member_requests.sql) makes "Member requests only" the default phone notification (Dihog, certificates, OCIA, the blood donor call and census updates) and notifies new blood donors; [`0038_men_only_ministries.sql`](supabase/migrations/0038_men_only_ministries.sql) makes Kaabag a men-only ministry: only male members can be added to it; [`0039_faster_access_checks.sql`](supabase/migrations/0039_faster_access_checks.sql) makes every admin page load faster, with no change to who sees what — the access checks run once per query instead of once per row, and the members list works out census and practice details only for the members on screen; [`0040_gkk_previous_households.sql`](supabase/migrations/0040_gkk_previous_households.sql) adds each GKK's household count from last year, entered in Parish Config → Parish GKK, which the Census page measures registered and not-yet-registered households against; [`0041_census_last_year_list.sql`](supabase/migrations/0041_census_last_year_list.sql) adds the Census page's "Last year's list": the households from last year's paper census, typed in or uploaded as a CSV per GKK, ticked off as they register, with a printable list of those not yet registered — visible only to staff and the GKK's own leader; [`0044_gkk_history_documents.sql`](supabase/migrations/0044_gkk_history_documents.sql) adds each GKK's history (text and photos, shown on its website page once published) and its documents — land titles, deeds and the like, in a private Supabase Storage bucket that only full-access staff and the GKK's own leader can open — under Parish Config → Parish GKK; redeploy the `media-upload` function after running it; [`0045_gkk_leader_my_gkk.sql`](supabase/migrations/0045_gkk_leader_my_gkk.sql) gives GKK leaders a My GKK page: they keep their own GKK's chapel details and history (a leader's change sends the history back to a draft until full-access staff publish it), its documents and last year's names — redeploy the `media-upload` function after running it; [`0046_gkk_photos.sql`](supabase/migrations/0046_gkk_photos.sql) adds each GKK's main photo and a gallery of up to 5 photos, shown on its website page and kept on the Details tab of Parish GKK and of My GKK (GKK Config) — redeploy the `media-upload` function after running it; [`0047_household_ref_format.sql`](supabase/migrations/0047_household_ref_format.sql) changes household reference numbers to the GKK's barangay code, the year and a number counted per barangay (`MEO-2026-0001`), with the barangay's code kept on each GKK's Details tab under Parish Config → Parish GKK; it renumbers every existing household in the order they registered, keeps the old `OLG-…` number working on Check Status and the census portal, and stops Check Status showing the family name; [`0048_last_year_list_switch.sql`](supabase/migrations/0048_last_year_list_switch.sql) adds the on/off switch under Census → Last year's list (it was under Parish Config until October 2026; since then it only decides the first census held in the registry, as later ones always compare with the census before): off, the census measures itself against the previous census in the registry and lists the households from it not registered yet (Census → Results by GKK); [`0050_gkk_leader_scope.sql`](supabase/migrations/0050_gkk_leader_scope.sql) keeps GKK leaders to their own GKK everywhere and away from blood types: it gives them back their GKK's census answers and online updates (lost in 0039), lets them see and dismiss possible duplicates in their GKK only, limits every GKK filter to their GKK, leaves blood types out of their Reports and keeps a member's blood type unchanged when they save; [`0052_last_year_list_links.sql`](supabase/migrations/0052_last_year_list_links.sql) lets staff and GKK leaders correct how a name on last year's list is found in the registry: "Not this household" for a wrong match, "Choose household" to link a family that registered under another head or name; [`0055_registration_member_census.sql`](supabase/migrations/0055_registration_member_census.sql) makes registration (the website and admin New Household) ask every member the census questions, like the census portal: their status and Aktibo / Panagsa / Wala per activity, kept as their own answers for the Practicing Catholic score, and counted as their census answers while a census is open; [`00571_org_chart.sql`](supabase/migrations/00571_org_chart.sql) adds Parish life → Organization Structure: the Church Structure and GKK Structure org charts (and any staff add), drawn in the admin by full-access staff and shown on the website once published — redeploy the `media-upload` function after running it, for the holders' photos; [`0070_report_sacrament_ages.sql`](supabase/migrations/0070_report_sacrament_ages.sql) makes Reports → Sacramental Completion count each sacrament's "not yet" among members old enough for it, so infants no longer count as missing Confirmation — before it, every member counts; [`0071_member_service_history.sql`](supabase/migrations/0071_member_service_history.sql) adds each member's Service history — the ministries, organizations and parish / GKK responsibilities they used to be in, by year (a former Kaabag, CFC member or PPC officer) — recorded when one is taken off the member and added by hand in the member's record; [`0072_census_update_links.sql`](supabase/migrations/0072_census_update_links.sql) makes census update notifications open Census → Online updates on that household; [`0073_census_edit_delete.sql`](supabase/migrations/0073_census_edit_delete.sql) lets full-access staff rename a census, change its dates, or delete one started by mistake; [`0074_sacrament_request_member.sql`](supabase/migrations/0074_sacrament_request_member.sql) links OCIA and Anointing requests to the person's member record, which then lists them; [`0075_duplicates_merge.sql`](supabase/migrations/0075_duplicates_merge.sql) adds Merge and undoing "Not duplicates" on the Duplicates page; [`0076_activity_more_records.sql`](supabase/migrations/0076_activity_more_records.sql) adds requests, the census, the website, parish settings and the GKK, ministry and organization lists to the activity log — redeploy the `manage-staff` function after running it, so staff account changes are logged too; [`0077_faster_activeness_report.sql`](supabase/migrations/0077_faster_activeness_report.sql) stops Reports → Analysis Report timing out for the whole parish ("canceling statement due to statement timeout"), with the same scores; [`0078_members_by_gkk.sql`](supabase/migrations/0078_members_by_gkk.sql) makes the Dashboard's Members by GKK chart count members — before it, the chart shows households by GKK; [`0079_census_families.sql`](supabase/migrations/0079_census_families.sql) makes the census count families as well as households: each GKK's "Families last year" in Parish GKK, and with the list off, the families that took part in the census before — shown on Census → Results by GKK, in the "Households vs last year" report and in Parish GKK's census column; [`0081_gkk_structure_leaders.sql`](supabase/migrations/0081_gkk_structure_leaders.sql) lets each GKK leader fill in their GKK's structure (My GKK → Leaders & Structure: the GKK Structure chart, then the Formation Ministry form's positions, several people per position, registered members or typed names), sent to the parish office, which approves it or sends it back (Parish GKK → the GKK → Leaders & Structure); approved officers get the position in their service history and their Katungdanan sa GKK — it also adds the form's positions to the GKK Structure template and copies in the officers the website shows now; [`0082_census_results_snapshot.sql`](supabase/migrations/0082_census_results_snapshot.sql) keeps each census's results by GKK as they stood when it closed (whole parish and each GKK), so a closed census shows what happened during it instead of being worked out again from today's registry — reopening a census makes it live again, and a census closed earlier gets a "Record these results" button on Census → Results by GKK; from the second census on, results always count the households that answered against those that answered the census before; [`0083_census_auto_approve.sql`](supabase/migrations/0083_census_auto_approve.sql) approves a census portal update at once when the family only answered the census and changed none of the household's or members' details — an update that changes details or adds a member still waits under Census → Online updates, and staff are notified of an automatic one only when it carries a message; [`0084_activeness_by_census.sql`](supabase/migrations/0084_activeness_by_census.sql) adds a Census choice to Reports → Analysis Report: “Latest answers” (each member's latest, as before) or one census, which shows that census as it stood — its members, each scored on their answers in it alone, with their status in it (their sacraments, ministries and roles are as they are now); the Census page's Analysis Report buttons open it on that census; [`0085_census_status_review.sql`](supabase/migrations/0085_census_status_review.sql) makes an online census update that marks a member moved away, deceased or left the Church wait under Census → Online updates for staff to approve, even when no details changed — after 0083 it went straight into the registry and took the member off the household; [`0086_young_children_bata_pa.sql`](supabase/migrations/0086_young_children_bata_pa.sql) makes the Practicing Catholic status "Bata pa" (not rated) cover children aged 8 and under, the age the census treats as young children, so 7- and 8-year-olds no longer show as "Wala pa matino" in the Analysis Report and on the Members list). Existing projects only need the migrations they haven't run yet. To have them run from GitHub when a pull request merges instead, see [docs/github-migrations.md](docs/github-migrations.md).
3. Create your first admin: **Authentication → Users → Add user**, then, with that user's UUID, run:
   ```sql
   insert into profiles (id, name, role, is_admin, access)
   values ('<paste-uuid-here>', 'Ma. Assumpta R.', 'Parish Secretary', true, 'full')
   on conflict (id) do update set name = excluded.name, role = excluded.role, is_admin = true, access = 'full';
   ```
   (`on conflict` because, once `00201_staff_profiles.sql` has run, every new account already gets a blank profile.)
   After that, staff admins add everyone else from **Settings → Staff** in the admin panel.
4. **Authentication → Providers → Email → turn off "Allow new users to sign up."**
5. Copy your **Project URL** and **anon/publishable key** from **Project Settings → API**.
6. Deploy the staff-accounts Edge Function (needed for **Settings → Staff**; the rest of the app works without it):
   ```bash
   npx supabase login
   npx supabase functions deploy manage-staff --project-ref <your-project-ref>
   ```
   Or, in the dashboard: **Edge Functions → Deploy a new function**, name it `manage-staff`, and paste in [`index.ts`](supabase/functions/manage-staff/index.ts) and [`handler.js`](supabase/functions/manage-staff/handler.js). Supabase provides the URL and service-role key to the function automatically; there's nothing to configure.
7. For phone notifications of new requests (optional; the bell in the admin panel works without it), deploy the notify-staff Edge Function with JWT verification off — the database calls it, and it checks staff logins itself:
   ```bash
   npx supabase functions deploy notify-staff --no-verify-jwt --project-ref <your-project-ref>
   ```
   There are no secrets to set. See [docs/notifications.md](docs/notifications.md).

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
Supabase plan doesn't. A run that can't do its job fails, so GitHub emails
the repository owner instead of showing a green tick.

| Workflow | What it does | Setup |
|---|---|---|
| `keep-alive.yml` | Every 3 days, calls one tiny read-only function so the free project never hits Supabase's 7-days-idle pause | None: it uses the public address and key in `client/.env.production` |
| `backup.yml` | Every Sunday, dumps roles, schema and data, encrypts them with your passphrase (AES-256, `gpg`), stores the file in a private Cloudflare R2 bucket and keeps the newest 26 | Six repository secrets: see [docs/backups.md](docs/backups.md) |

Both can also be run by hand from the **Actions** tab. GitHub pauses scheduled
workflows in repositories with no commits for 60 days. If that happens it
emails the repository owner, and one click re-enables them.

**Restoring a backup:** see [docs/backups.md](docs/backups.md). Keep the
passphrase somewhere safe offline: the backups can't be opened without it.

## Available scripts

Run from the project root:

| Command | Description |
|---|---|
| `npm run install:all` | Install root and `client/` dependencies |
| `npm run dev` | Run the Vite client with hot reload |
| `npm run build` | Production build of the client |
| `npm run lint` | ESLint on the client (`client/eslint.config.js`): errors are likely bugs (hooks called conditionally, undefined names); warnings are worth a look |
| `npm run db:demo` | Load sample households and members (see above) |
| `npm run db:reset` | Delete all households and members |
| `npm run db:wipe-test -- --yes` | Empty every registry table on the **test** project before a browser playbook run (needs `PLAYBOOK_TEST_PROJECT=yes`; see `.claude/playbooks/staff-journey-playbook.md`) |
| `npm run db:seed-load` | Add 500 marked test households and the records around them to the **training** project (`qyoyuukpdjrwfhovtrwd`, whichever project the folder is linked to), for load testing (see [`docs/load-test-data.md`](docs/load-test-data.md)) |
| `npm run db:clean-load` | Remove that load-test data from the training project, and nothing else |
| `npm test` | Run the client test suite |
| `npm run test:watch` | Client tests, watch mode |

Sample records are fictional and live in
[`scripts/demo-data.mjs`](scripts/demo-data.mjs) — edit that file to tailor them
to your parish.

## Deploying

Setting up the live site and the training site from scratch (Supabase, Vercel, Cloudflare R2, email, backups), and setting the site up for another parish: see [`deploy/`](deploy/README.md). In short: import the repo into Vercel with **Root Directory set to `client`**, add `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` as Vercel env vars, and deploy — `client/vercel.json` handles the SPA routing rewrite and the `/media` photo proxy (one bucket for the training site's address, another for the live site).

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

**Load**: to see how the app copes with a full parish, add 500 test
households (removable in one step). Setup, removing and reseeding are in
[`docs/load-test-data.md`](docs/load-test-data.md).

> Note: both testing docs still describe the retired Express/PostgreSQL setup
> in places (e.g. `TEST_DATABASE_URL`, `db:setup`) — treat those specific
> mentions as stale pending a follow-up pass.

## License

MIT

## Credit

Built for free by [DaveenDev](https://daveendev.vercel.app/).
