# Recurring Playbook — Staff Journey (empty-DB, non-admin staff role-scoped tester)

**Created:** 2026-10-01
**Updated:** 2026-10-01 — pointed at the repo's test Supabase project (new `sb_publishable_`/`sb_secret_` keys); REST wipe via `npm run db:wipe-test`; corrected after the first full run (portal fields, request/contact columns, anon-executable staff functions, Chromium CA trust)
**Recurrence:** on demand (re-execute this file any time)
**Driver:** Playwright MCP (interactive — AI drives a real browser via accessibility snapshots). **Read §A "How to drive the browser" before starting** — it is the concrete how-to; everything below it is the what-to-do.
**App URL:** `http://localhost:<PORT>` — **pick any free port** at run start (see §1 step 0). **Do NOT use port 5173** — that's Vite's default and the user's own manual-test server; never bind or navigate to it. Everything else is fair game; the only goal is to get the app up on *some* free port and browser-test it.
**Data isolation:** a dedicated **test** Supabase project, wiped to **EMPTY** registry data (no demo households) every run. **Never the live parish project.**

> **Port convention — read once, applies everywhere below.** This file writes
> example URLs as `http://localhost:5174/...`. Wherever you see **`5174`** (or
> `<PORT>`), substitute **the free port you actually chose** in §1 step 0. `5174`
> is just a suggested first try, not a requirement — if it's taken, use the next
> free one (5175, 5180, 4173, 8080, …). The URLs are otherwise identical.

> **Purpose.** Pretend you are a **non-admin parish staff member** — a volunteer
> encoder or office helper given an ordinary staff login, *without* the "Staff
> admin" box ticked. This app has **four** kinds of visitor, each with its own
> boundary:
>
> | Who | How they get in | What they may do |
> |---|---|---|
> | **Anonymous visitor** | nothing — the public website | read *published* website content; submit registrations and requests through rate-limited database functions; **never** read a household, member, request or census row |
> | **Census family** | reference number + access code at `/census` | open and update **their own** household only, and only while a census is open |
> | **Staff** (`profiles.is_admin = false`) | `/admin/login` | see and change **every registry record** (by design — see the note on the Staff page) but **not** manage staff accounts, and **not** read other staff profiles or promote themselves |
> | **Staff admin** (`profiles.is_admin = true`) | `/admin/login` | everything staff can do, plus **Settings → Staff** (the `manage-staff` Edge Function) |
>
> The database starts **empty**, so the admin first does a **minimal bootstrap**
> (create the non-admin staff login, seed a connected chain of records), then you
> **log out and log back in AS the staff member** and confirm the role is
> **correctly caged** — and that everything it *should* be able to do actually
> works for a non-admin account. You will:
>
> 1. **Phase 1 — Role-boundary audit.** Prove the staff nav hides exactly the
>    admin-only item (**Settings → Staff**), and walk **every** route in
>    `client/src/App.jsx` — public site, registration, census portal, all 18 admin
>    routes, tab and filter deep-links — confirming each renders, redirects or
>    refuses exactly as it should for this role.
> 2. **Phase 2 — Use what's allowed, page by page.** One real action per admin
>    page as the non-admin account, because most server writes go through
>    Postgres functions with their own `grant execute … to authenticated` — a
>    function granted only to the admin's session, or one that records the wrong
>    staff name, only shows up when a *non-admin* drives it.
> 3. **Phase 2.5 — Server-side authorization sweep.** The UI hiding the Staff page
>    is not the boundary — Supabase RLS, function grants and the `manage-staff`
>    function are. Probe them directly from the staff member's own session: the
>    Edge Function, `profiles` self-promotion, other staff profiles.
> 4. **Phase A — Anonymous cage.** Sign out and probe the same REST and RPC
>    surface with only the public anon key: no registry row, no draft website
>    item, no request or donor PII may come back.
> 5. **Phase D — Disabled account.** Admin disables the staff account; prove it
>    can no longer sign in or reach `manage-staff`, and record how long an
>    already-open session keeps working.
> 6. **Phase R / Phase S / Phase F — Responsive, session lifecycle, friction.**
>
> This is a **journey / role-boundary** test, not the per-screen walkthroughs for
> human testers (those live in `docs/beta-testing/`). Its distinct value is
> proving the boundaries between the four visitor kinds hold — and that an
> ordinary, non-admin staff login gets a fully working registry, not one that
> only works for whoever set the project up.
>
> **Report only** — never send a real SMS, email or blood-donor call to a real
> person. Write a separate results file (§7).

---

## HOW TO USE THIS FILE (read this first — it is written for a low-effort agent)

Do the steps **strictly in order, top to bottom.** Do not skip ahead. Every step
tells you exactly:
- **WHERE** to go (a URL to `browser_navigate` to),
- **WHAT** to click/type (by the on-screen button/field name),
- **the EXACT VALUES** to enter (copy them literally from the data tables in §2),
- **HOW to prove it worked** (the assertion), and
- **what to write down** (a one-line result keyed by the step id).

If a value isn't given, use the one from the **§2 persona data tables** — never
invent your own. Every action uses the **same 5-move loop** from §A.1
(snapshot → find → act → re-snapshot → assert). When unsure how to do *anything*,
copy the worked example in §A.8. If you get stuck, use the recovery moves in §A.6.

**Which login am I?** This playbook has three identities, in this order:
1. **Anonymous** (§1.A) — no login; you seed the public submissions.
2. **Staff admin** (§1.B) — the account in `$PLAYBOOK_ADMIN_EMAIL` /
   `$PLAYBOOK_ADMIN_PASSWORD` (Codespaces secrets, §0b). Only an admin can create staff accounts.
3. **Staff** (from §1 step B6 on) — the non-admin account you create in B4.

If you see **Staff** under *Settings* in the sidebar during Phase 1–2, you are
still the admin: sign out and back in as the staff member before continuing.

---

## A. How to drive the browser (Playwright MCP) — read first

You control a **real Chromium browser** through Playwright MCP tools. You never
"see" the page as pixels by default — you read its **accessibility snapshot** (a
text tree of roles + names), find the element you want in that tree, and act on
it by its `ref`. Learn this loop once and every step below becomes mechanical.

### A.0 The tools (and the one job of each)
Every tool name is prefixed `mcp__playwright__` in this environment (e.g.
`mcp__playwright__browser_click`); the short names are used below for brevity.

| Tool | What it does | Needs `ref`? |
|---|---|---|
| `browser_navigate` | Go to a URL (e.g. `http://localhost:5174/admin/members`) | no |
| `browser_snapshot` | **Your eyes.** Returns the a11y tree with a `ref` for each element | no |
| `browser_click` | Click an element | **yes** — `element` (human description) + `ref` |
| `browser_type` | Type text into a field | **yes** — `element` + `ref` + `text` |
| `browser_fill_form` | Fill several fields in one call | yes — array of `{name, type, ref, value}` |
| `browser_select_option` | Pick from a `<select>` / combobox | **yes** |
| `browser_press_key` | Press a key (`Escape`, `Enter`, `Tab`) | no |
| `browser_hover` | Hover (reveals tooltips) | **yes** |
| `browser_wait_for` | Wait until text appears / disappears (use instead of sleeping) | no |
| `browser_network_requests` | List requests + status codes — see which Supabase REST/RPC/function calls a page made and what they returned | no |
| `browser_console_messages` | Read JS console — catch errors / error-boundary crashes | no |
| `browser_take_screenshot` | Pixel image — only for a `NEEDS-HUMAN` visual record | no |
| `browser_resize` | Change viewport (use for mobile/responsive items) | no |
| `browser_handle_dialog` | Accept/dismiss a **native** `alert`/`confirm`/`print` dialog | no |
| `browser_navigate_back` | Browser back button | no |
| `browser_tabs` | List/open/close/select tabs | no |
| `browser_evaluate` | Run JS in the page — used in Phase 2.5 / A for direct REST, RPC and Edge Function probes | no |

> `ref` values come **from the most recent `browser_snapshot`** and are only
> valid for that snapshot. After any navigation, dialog/drawer open/close, or list
> refresh, the old refs are **stale** — take a fresh snapshot before acting.

### A.1 The core loop (do this for every action)
1. **Snapshot** — `browser_snapshot`. Read the tree.
2. **Locate** — find your target by **role + accessible name** (priority:
   `role+name` → visible text → label/placeholder). Note its `ref`.
3. **Act** — `browser_click` / `browser_type` / etc., passing a short human
   `element` description *and* the `ref` from step 1.
4. **Re-snapshot** — `browser_snapshot` again (the page changed; refs are stale).
5. **Assert** — confirm the expected change in the new tree (a row appeared, a
   toast showed, a redirect happened). Reload first if the change is meant to
   persist.

### A.2 Finding elements
- Match on role + name, e.g. `link "Households"`, `button "Sign out"`,
  `navigation "Admin sections"`, `heading "Staff accounts"`.
- **Drawers, dialogs and confirm prompts** appear in the snapshot as a `dialog`
  (the confirm prompt is `alertdialog`). Target the element *inside* that node by
  its contained text. The mobile nav drawer is `dialog "Navigation menu"`.
- The admin sidebar is `navigation "Admin sections"`; the Requests badge is a
  count with the accessible name `"<n> waiting"`.
- Test-ids are essentially absent in this codebase — drive by role/name/text.

### A.3 Waiting (don't fixed-sleep, don't snapshot in a loop)
- After navigation, `browser_wait_for` the **text you expect to appear** (e.g.
  "Households") or **disappear** (e.g. "Loading…").
- `RequireAuth` renders **nothing** until Supabase has restored the session
  (`ready`), so a blank admin page for a moment is normal — wait for the page
  heading, not for "anything".

### A.4 Verifying without eyeballs
- **Network** — this app has no backend of its own: every data call goes
  straight to `https://<project>.supabase.co/rest/v1/…` (tables/views),
  `/rest/v1/rpc/<fn>` (Postgres functions), `/auth/v1/…` (sign-in) or
  `/functions/v1/manage-staff` (staff accounts). `browser_network_requests`
  shows each with its status — a refused RLS/grant check is typically **401** or
  **403** (`permission denied`), while an RLS *filter* answers **200 with `[]`**.
  Both count as "blocked" — but a 200 with rows is a leak.
- **Console** — `browser_console_messages` surfaces JS errors and
  `ErrorBoundary` (`client/src/components/ErrorBoundary.jsx`) crashes; a page that
  "renders" but logged a thrown error is a FAIL.
- **Screenshot** — only when the check is genuinely visual; pair it with a
  `NEEDS-HUMAN` result line.

### A.5 Dialogs, confirms & external-send safety
- The app's confirm prompt (`useConfirm`, `client/src/components/ConfirmDialog.jsx`)
  is an in-page `alertdialog` — snapshot, then click the confirm button by its
  label (e.g. "Disable account", "Delete").
- **Print** buttons (household print, census forms, prayer list) open the
  browser's native print dialog — dismiss it with `browser_handle_dialog` or
  `browser_press_key Escape`; never send anything to a real printer.
- **Blood requests → donor contact log**: recording a call/text in the app is
  fine (it only writes a log row). **Never** actually dial or text a number, and
  only ever use the fictional `0917 555 …` numbers from §2.
- **Clipboard** — the temporary-password "Copy" button may fail headless; read
  the password from the snapshot (`code "Temporary password"`) instead.

### A.6 Recovery moves (when you get stuck)
- **Click did nothing** → almost always a stale `ref`. Re-snapshot and click the
  current ref.
- **A page shows admin-only content** → confirm identity: is **Staff** listed
  under *Settings* in the sidebar? If yes, you're the admin — sign out and back
  in as the staff member.
- **Not sure whether a probe was refused** → read the response body, not just the
  status (§Phase 2.5 helper returns both).
- **Lost / unexpected page** → `browser_navigate` to `/admin` (signed in) or `/`
  (signed out) and resume.
- **"Too many attempts" (Bisaya: *Daghan na kaayo nga pagsulay*)** → a public
  form hit its hourly rate limit (`public_request_guard`). Don't retry in a loop:
  record `BLOCKED (rate-limited)` and carry on; it resets within an hour.

### A.7 Mobile / responsive items
The admin sidebar becomes a drawer below **1024 px** (Tailwind `lg`). For any
responsive check: `browser_resize` to a narrow width (e.g. 390×844), snapshot,
open the drawer with `button "Open navigation menu"`, assert, then
`browser_resize` back to 1440×900.

### A.8 Worked example — one full step, end-to-end (COPY THIS PATTERN)
This is a role-boundary check done literally. **Every** step in this file is this
same loop; when in doubt, imitate this exactly.

```
1. browser_navigate            url: http://localhost:5174/admin/settings/staff   (admin-only page)
2. browser_snapshot            → assert heading "Staff accounts" AND the empty state
                                  "Staff admins only"; assert NO table "Staff accounts",
                                  NO button "Add staff", NO email addresses listed
3. browser_network_requests    → assert NO request to /functions/v1/manage-staff was made
                                  (the page must not even ask, for a non-admin)
4. (if the staff table rendered) → P0 boundary leak: record FAIL + a §7c bug
→ Record:  PASS   s-p1-guard-staff   /admin/settings/staff shows "Staff admins only", no list, no function call
```
Notes that generalise: tag every record you create with the run suffix
`SV<runid>` (§2.0). If a control you expected to be **absent** is present, that is
itself the finding — decide whether it's a correct limit or a leak before
choosing PASS/FAIL.

---

## 0. One-time setup (skip if already done)

### 0a. Browser driver (Playwright MCP)
- The `mcp__playwright__*` tools must be available. If they aren't, register the
  Playwright MCP server for this project (e.g. `claude mcp add playwright -- npx
  @playwright/mcp@latest`), approve it, reconnect, then re-run. In the Claude
  Code cloud container Chromium is pre-installed — do **not** run
  `playwright install`.

### 0b. The TEST Supabase project, and where the credentials live
This app has no local database: the browser talks straight to a Supabase project.
Runs use a **separate test project**, never the parish's live one.

**This repository's test project** (created 2026-10-01 for these runs):

| | Value |
|---|---|
| Project URL | `https://qyoyuukpdjrwfhovtrwd.supabase.co` |
| Publishable key (the browser's "anon" key) | `sb_publishable_bSXrlvkN9er_uRkcqzRD1A_e9BvDKdN` |
| JWKS | `https://qyoyuukpdjrwfhovtrwd.supabase.co/auth/v1/.well-known/jwks.json` |
| Secret key (service-role) | **not in the repo.** Ask the project owner, or copy it from Supabase → Project Settings → API Keys |
| Session storage key in the browser | `sb-qyoyuukpdjrwfhovtrwd-auth-token` |

The publishable key is public by design (it ships in every page the app
serves), so it lives here. RLS is what protects the data, and that is what this
playbook tests. The secret key bypasses RLS, so it stays in the gitignored root
`.env`.

The project needs every migration in `supabase/migrations/` run in order
(README §1 step 2) and the `manage-staff` Edge Function deployed (README §1
step 6). §1 step 1 checks both. If you ever replace this project, a local stack
works too: `npx supabase start` (needs Docker), `npx supabase db reset`, and
`npx supabase functions serve manage-staff` in the background.

> **Network access.** The machine running the playbook must be able to reach
> `qyoyuukpdjrwfhovtrwd.supabase.co`. In a Claude Code cloud session, add that
> host to the environment's allowed domains first. A `CONNECT tunnel failed,
> response 403` from `curl` means it isn't allowed yet.

> **Key format.** This project uses the new `sb_publishable_…` / `sb_secret_…`
> keys, not the older JWT-style anon / service-role keys. They go in the same
> variables, and supabase-js accepts both. The one difference that matters here:
> a new-format key is **not a JWT**, so send it only as the `apikey` header and
> **never** as `Authorization: Bearer …`. The gateway rejects that as an invalid
> JWT. The §2.5 helper handles this already.

Credentials go in **two gitignored files** (`.gitignore` already covers `.env`
and `client/.env.local`):

`client/.env.local` — what the browser uses:
```
VITE_SUPABASE_URL=https://qyoyuukpdjrwfhovtrwd.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_bSXrlvkN9er_uRkcqzRD1A_e9BvDKdN
```

root `.env` — what the shell steps use:
```
SUPABASE_URL=https://qyoyuukpdjrwfhovtrwd.supabase.co      # MUST equal VITE_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=<the sb_secret_… key>              # never commit, never in the browser
SUPABASE_DB_URL=<Postgres connection string>                 # optional; enables the psql wipe
PLAYBOOK_TEST_PROJECT=yes                                    # you assert this project is disposable
```

**Admin login — `PLAYBOOK_ADMIN_EMAIL` / `PLAYBOOK_ADMIN_PASSWORD`.** These are
stored as **GitHub Codespaces secrets** on this repository, so inside a
codespace they are already **environment variables**. Read them from the
environment first:
```
test -n "$PLAYBOOK_ADMIN_EMAIL" && test -n "$PLAYBOOK_ADMIN_PASSWORD" && echo "admin login present"
```
Never `echo` the values themselves, and never write them into this file, the
results file, a commit or a screenshot. Type them straight into the sign-in form.
Fallbacks, in order: the same two keys in the gitignored root `.env`; or ask the
user at run start and write them **only** to the root `.env`. Codespaces secrets
don't reach other environments, such as a Claude Code cloud session or a local
clone. There, use a fallback. If the account belongs to the **live** project and
not a test project, stop and ask for a test-project account.

If the test project has **no admin yet**, create one exactly as README §1 step 3
describes (Authentication → Users → Add user, then the `insert into profiles …
is_admin true` SQL).

### 0c. Install
```
npm run install:all
```

## 1. Per-run setup — **wipe to EMPTY, then seed as anon, then admin bootstrap**

> **Three sets of credentials, don't confuse them.**
> - **Admin app login:** `$PLAYBOOK_ADMIN_EMAIL` / `$PLAYBOOK_ADMIN_PASSWORD` (Codespaces secrets → env vars; else the
>   root `.env`), used for the §1.B bootstrap and in Phase D / F's second tab.
> - **Staff app login (you create it in B4):** `staff.sv<runid>@example.test`, the
>   temporary password the app shows you once (later changed in Phase F).
> - **Supabase keys** (anon / service-role / DB URL) are **not** app logins. The
>   service-role key is only ever used from the shell, **never** in the browser.

0. **Pick a free port** (do this first). Try **5174**; if it's in use, walk up
   until you find a free one. **Never pick 5173.** Check a candidate with
   `ss -ltn | grep :5174` (Linux), `lsof -i :5174` (macOS) or
   `netstat -ano | findstr :5174` (Windows) — empty output means free. Remember it
   as `<PORT>`.

1. **Prove you are pointed at the test project, and that it's ready** (shell,
   before anything destructive):
   - `client/.env.local` exists and `VITE_SUPABASE_URL` equals `SUPABASE_URL` in
     root `.env`, and both are `https://qyoyuukpdjrwfhovtrwd.supabase.co` (or a
     project the user has named as the test project in this run);
   - root `.env` has `PLAYBOOK_TEST_PROJECT=yes`;
   - **the schema exists:** `curl -s "$SUPABASE_URL/rest/v1/articles?select=id&limit=1" -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"`
     answers `[]` or rows. A `PGRST205` *Could not find the table* means the
     migrations haven't run (`articles` comes from 0013). Also check the last one, 0015, ran: an anon
     `POST $SUPABASE_URL/rest/v1/rpc/delete_gkk` `{"target_name":"x"}` must answer *permission denied* (42501), not 204/400.
     Record `BLOCKED u0-schema` and ask the user to run them in the SQL editor;
   - **`manage-staff` is deployed:** `curl -s -o /dev/null -w "%{http_code}" -X POST "$SUPABASE_URL/functions/v1/manage-staff" -H "apikey: $VITE_SUPABASE_ANON_KEY"`
     answers **401** (deployed, no session). **404** means not deployed; carry
     on, but B4 uses its fallback.

   If any check fails, or you have any reason to think this is the live parish
   project, **stop and ask the user**. Do not run steps 2–3 on a guess.

2. **Wipe registry data to EMPTY.** Use the first that's available, foreground,
   and confirm it exits 0:
   - **(default) the REST wipe**, which only needs the secret key in root `.env`:
     ```
     npm run db:wipe-test -- --yes
     ```
     `scripts/playbook-wipe.mjs` refuses without `PLAYBOOK_TEST_PROJECT=yes`
     and `--yes`. It does the same as the SQL below, except that ids keep
     counting up rather than restarting at 1 (so never assume an id of `1`).
   - with `SUPABASE_DB_URL` set: the SQL below via `psql "$SUPABASE_DB_URL"`;
   - otherwise paste the SQL into the test project's SQL editor.

   If you can do none of them, record `BLOCKED u0-wipe (no DB access)` and **stop**.
   ```sql
   truncate households, members, sacrament_verifications, duplicate_dismissals,
            census_cycles, census_member_responses, census_household_snapshots,
            household_access_codes, census_submissions,
            mass_schedules, announcements, bulletins, events, articles,
            certificate_requests, prayer_requests, blood_donors, blood_requests,
            blood_request_contacts, public_request_log
     restart identity cascade;
   -- Pick-list rows a previous run added (Phase F), and its staff logins:
   delete from gkks             where name ~ ' SV[0-9]{4}';
   delete from ministries       where name ~ ' SV[0-9]{4}';
   delete from organizations    where name ~ ' SV[0-9]{4}';
   delete from parish_positions where name ~ ' SV[0-9]{4}';
   delete from auth.users where email ~* '^(staff|leak|nobody)\.sv[0-9-]+@example\.test$';  -- cascades to profiles
   ```
   > Deliberately **kept**: `profiles` for real accounts (incl. the admin),
   > `parish_settings`, the stock GKKs / ministries / organizations / parish
   > positions, and the seeded `sacrament_guides` rows. Do **not** run
   > `npm run db:demo` — this playbook starts from an empty register.

3. **Start the app** on your port, with the shell tool **in the background**:
   ```
   cd client && PORT=<PORT> npx vite --strictPort
   ```
   (`client/vite.config.js` reads `PORT`; `--strictPort` makes Vite fail rather
   than silently drift to another port.) Then `browser_navigate`
   `http://localhost:<PORT>/` and `browser_wait_for` the parish name. If Vite
   reports the port in use, go back to step 0.

4. Generate a `runid` (e.g. `1001` from today's month+day, or `1001-1430` if you
   run more than once a day) and tag every record with `SV<runid>`. In this file
   **`SV1001`** stands for your real suffix — substitute yours.

### 1.A — Anonymous seeding (signed out; the public website does it)

These four records reach the database **only** through the public, rate-limited
functions — which is exactly how real parishioners create them. Record each
reference number the app shows; later phases need them.

**A1 · Public registration.** `/register` → complete the 5-step wizard with the
§2.2 *Abad* household (head + spouse). On the review step submit, and record
the reference number from the confirmation screen as `<regRef>`.

**A2 · Certificate request.** `/serbisyo/hangyo/sertipiko` → baptismal
certificate for `Lorna Abad SV1001`, mobile `0917 555 1001`, tick consent, submit.
Record `<certRef>`.

**A3 · Prayer request.** `/serbisyo/hangyo/pag-ampo` → intention
`Para sa panglawas ni Lola SV1001`, submit. Record `<prayerRef>` if shown.

**A4 · Blood donor opt-in.** `/serbisyo/hangyo/donor` → donor
`Ramon Abad SV1001`, blood type **O+**, mobile `0917 555 1002`, submit.

### 1.B — Admin bootstrap (sign in as the admin; do this ONCE)

> **Why this exists.** A staff account can't create itself, and every probe in
> Phase 1 / 2.5 / A needs a **real** record id to point at. So the admin builds a
> small *connected chain*. Do every B-step as **admin**, then **B6 hands the
> session to the staff member**.

**B0.** `/admin/login` → type the values of `$PLAYBOOK_ADMIN_EMAIL` and `$PLAYBOOK_ADMIN_PASSWORD` (§0b — Codespaces secrets / env)
→ click **Sign in** → `browser_wait_for` "Dashboard". Snapshot and confirm that
**Staff** appears under *Settings* in `navigation "Admin sections"` — your proof
you're the admin, to contrast against Phase 1.

**B1 · Seed the connected chain** (all tagged `SV1001`, values from §2.2):
1. **Household (admin-created)** — Households → **New Household** → `Villar
   Family SV1001`, GKK **GKK San Isidro**, head `Nena Villar SV1001` + one child
   `Paolo Villar SV1001`. Save; record its reference number `<hhRef>` and, from
   `browser_network_requests`, the numeric household id `<hhId>` and one member
   id `<memberId>`.
2. **Verify the public registration** — find `<regRef>` (Abad) on the
   Dashboard's awaiting-verification queue and **Verify** it.
3. **Census** — Census → start `Census SV1001` and record its id `<cycleId>`
   from the network log. Open the `Villar Family SV1001` census panel and record
   its **access code** `<accessCode>` (printed form or the panel).
4. **Website** — Parish Website → Announcements: one **published**
   `Pahibalo SV1001` and one left as **draft** `Draft notice SV1001` (record
   its id `<draftId>` from the network log). Events: one **draft** event
   `Draft event SV1001` (`<draftEventId>`).
5. **Blood request** — Requests → Blood Requests: one request for **O+**, 2
   units, hospital `Test Hospital SV1001`, **not** shown publicly.

Write down every ref/id — the route tables and probes below use them. If any one
step isn't reachable in this build, record `SKIPPED (not reachable)` for that
record and carry on; use a fabricated id for the dependent probes and say so in
the result line.

**B2 · Check the Staff page works for the admin.** `/admin/settings/staff`:
the staff table loads (this proves `manage-staff` is deployed — if it says
*Staff management isn't set up yet*, record `BLOCKED u0-staff-fn` and use the
fallback in B4).

**B3 · (reserved).**

**B4 · Create the staff login.** On `/admin/settings/staff` → **Add staff** →
Name `Lito Ramos SV1001`, Email `staff.sv1001@example.test`, Role / title
`Parish Encoder`, **leave "Staff admin" unticked** → **Create account**. Read the
temporary password from `code "Temporary password"` and keep it **only in your
working memory and the root `.env`** (`PLAYBOOK_STAFF_PASSWORD=`), never in the
results file. Click **Done**; assert the new row shows role *Parish Encoder*,
status *Active*, and **no** *Admin* badge.

> **Fallback if `manage-staff` isn't deployed:** create the user with the
> service-role key from the shell (`supabase.auth.admin.createUser({ email,
> password, email_confirm: true })`, then insert its `profiles` row with
> `is_admin: false`). Phase 2.5's Edge-Function rows then become
> `BLOCKED (manage-staff not deployed)`.

**B5 · Record the admin's own user id** (`<adminId>`) from the Staff table's
network response — Phase 2.5 tries to read and modify it.

**B6 · Hand the session to the staff member.** Click `button "Sign out"`. At
`/admin/login` sign in as `staff.sv1001@example.test` with the temporary password.
`browser_wait_for` "Dashboard". **From here on you are the staff member.**

**B7 · Baseline.** Snapshot and assert: (a) Dashboard rendered with no error
boundary; (b) the sidebar footer shows `Lito Ramos SV1001` / `Parish Encoder`;
(c) **Staff** is **absent** under *Settings*. Record
`u0-baseline PASS staff signed in, name/role shown, no Staff nav item`. If Staff
is visible you are still the admin — repeat B6.

---

## 2. The staff member & their access — persona & data tables (USE THESE EXACT VALUES)

You are **Lito Ramos**, a volunteer encoder in the parish office. You can work
the whole registry, but you are **not** a staff admin. Append your run suffix
`SV1001` where noted. Where a field isn't listed, leave the form default.

### 2.0 Naming rule
- Every record you create gets the suffix appended, e.g. `Villar Family SV1001`.
- All emails end in `@example.test` and all mobile numbers are fictional
  `0917 555 xxxx` — never a real person's.

### 2.1 Logins
| Identity | Email | Password | Used for |
|---|---|---|---|
| Admin | `$PLAYBOOK_ADMIN_EMAIL` (Codespaces secret) | `$PLAYBOOK_ADMIN_PASSWORD` (Codespaces secret) | §1.B, Phase D, Phase F second tab |
| Staff | `staff.sv1001@example.test` | temporary password from B4, then `StaffPass-SV1001!` after Phase F | Phase 1 onward |
| Census family | reference `<hhRef>` | access code `<accessCode>` | Phase 1 Group 2, Phase A |

### 2.2 Seed content
| Kind | Value | Created by | Used by |
|---|---|---|---|
| Public registration | `Abad Family SV1001` — head `Lorna Abad SV1001` (F, 1980-03-14, Married), spouse `Ramon Abad SV1001` (M, 1978-07-02, Married), GKK **GKK San Lorenzo Ruiz**, mobile `0917 555 1001` | anon (A1) | `<regRef>`, verify queue, `registration_status` probe |
| Certificate request | baptismal, for `Lorna Abad SV1001` | anon (A2) | `<certRef>`, Requests → Certificates, anon RPC probe |
| Prayer request | `Para sa panglawas ni Lola SV1001` | anon (A3) | Requests → Prayer, anon PII probe |
| Blood donor | `Ramon Abad SV1001`, O+, `0917 555 1002` | anon (A4) | Requests → Blood Donors, anon PII probe |
| Household | `Villar Family SV1001` — `Nena Villar SV1001` (head, F, 1985-09-20) + `Paolo Villar SV1001` (child, M, 2012-01-15), GKK San Isidro | admin (B1) | `<hhRef>`, `<hhId>`, `<memberId>` |
| Census | `Census SV1001` (open) + Villar access code | admin (B1) | `<accessCode>`, census portal |
| Announcements | `Pahibalo SV1001` (published), `Draft notice SV1001` (draft) | admin (B1) | `<draftId>` — must never reach anon |
| Event | `Draft event SV1001` (draft) | admin (B1) | `<draftEventId>` |
| Blood request | O+, 2 units, `Test Hospital SV1001`, not public | admin (B1) | donor matching, `public_blood_calls` probe |

### 2.3 What the staff role allows (source of truth: the migrations + `manage-staff`)
| **Allowed (by design)** | **Refused** |
|---|---|
| Read + write every registry table: households, members, sacraments, ministries, organizations, census, website content, requests, donors (RLS policies `*_admin_all` are `to authenticated using (true)`) | `manage-staff` Edge Function — any action (`handler.js`: *Only staff admins can manage staff accounts*) |
| Every staff Postgres function granted `to authenticated` (verify sacrament, census open/close/record, approve portal updates, duplicates, dashboard/report stats, request inbox counts) | Reading **other** staff profiles (`profiles_select_own`) |
| Change **their own** password (Parish Config → Change password) | Writing `profiles` at all — including flipping their own `is_admin` (only `select` is granted) |
| Parish Config, including parish name / logo / GKK list | Reaching the staff list through the UI (`ManageStaff` shows *Staff admins only*) |

> Note the asymmetry: the staff role is *wide* (every registry record) but
> *hard-edged* (zero staff-account power). The Staff page itself warns
> admins: *"Every staff account can see and change all registry records."* So a
> staff member editing a household is **PASS**, not a leak — the leak would be
> any route to more staff accounts, other staff details, or admin rights.

---

## PHASE 1 — Role-boundary audit (as staff) — *the heart of this playbook*

### s-p1-nav · Navigation is role-scoped
1. On `/admin`, snapshot `navigation "Admin sections"`.
2. Assert it shows the 13 main items — **Dashboard, Households, Members,
   Duplicates, Sacraments, Blood Types, Organizations, Ministries, Census,
   Requests, Parish Website, Reports, Exports** — then the *Settings* label and
   **Parish Config, Ministries, Organizations**.
3. Assert **Staff** is **not** listed (`NAV_SETTINGS … adminOnly`,
   `client/src/pages/admin/AdminLayout.jsx`).
4. Record `s-p1-nav` — PASS only if the list is exactly the above. A missing
   allowed item is a FAIL too (staff would lose a working page).

### s-p1-guard · Full route census
`browser_navigate` **directly** to each route and compare against "Expected".
Unless a row says otherwise, the check is: correct page heading, no
`ErrorBoundary` text, console clean of thrown errors. The source of every row is
`client/src/App.jsx`.

**Group 0 — public website (`SiteLayout`; must render the same whether signed in or not):**
| ID | Route | Expected |
|---|---|---|
| `s-p1-open-home` | `/` | renders; parish stats from `public_parish_stats` |
| `s-p1-open-misa` | `/misa` and `/misa?view=kalendaryo` | renders; only **published** schedule / events |
| `s-p1-open-event-draft` | `/misa/kalihokan/<draftEventId>` | the draft event must **not** render (not-found state or redirect) — even though a staff session is open, the public page must read as the public would; record what it does |
| `s-p1-open-pahibalo` | `/pahibalo` | shows `Pahibalo SV1001`, **not** `Draft notice SV1001` |
| `s-p1-open-pahibalo-draft` | `/pahibalo/<draftId>` | the draft must not render publicly — same rule as above |
| `s-p1-open-bulletin` | `/pahibalo/bulletin/999999` | clean not-found state, not a crash |
| `s-p1-open-komunidad` | `/komunidad`, `/komunidad/gkk/GKK San Isidro`, `/komunidad/balita/999999` | renders; household counts hidden for GKKs under 5 households (`public_gkk_directory`) |
| `s-p1-open-serbisyo` | `/serbisyo`, `/serbisyo/dugo`, `/kontak` | renders; blood calls list does **not** show the non-public `Test Hospital SV1001` request |
| `s-p1-open-forms` | `/serbisyo/hangyo/sertipiko`, `…/pag-ampo`, `…/dugo`, `…/donor` | each form renders |
| `s-p1-open-form-bogus` | `/serbisyo/hangyo/bogus` | redirects to `/serbisyo` |
| `s-p1-open-susiha` | `/serbisyo/susiha` → look up `<certRef>`, then `<regRef>` | shows status only — **no** household or member names, no mobile numbers |

**Group 1 — public entry points outside `SiteLayout`:**
| ID | Route | Expected |
|---|---|---|
| `s-p1-open-register` | `/register` | wizard renders at step 1 (a staff session doesn't change it) |
| `s-p1-open-census` | `/census` | portal sign-in renders, says a census is open (`Census SV1001`) |
| `s-p1-open-census-bogus` | `/census` with ref `<hhRef>` + code `WRONG-CODE` | refused with a clean message; nothing about the household shown |
| `s-p1-open-census-other` | `/census` with ref `<regRef>` + Villar's `<accessCode>` | refused — one household's code must not open another household |
| `s-p1-open-login-signed-in` | `/admin/login` | already signed in → redirected to `/admin` (`AdminLogin`) |
| `s-p1-open-404` | `/this-route-does-not-exist` | redirected to `/` (catch-all `Navigate`), no crash |

**Group 2 — admin pages (`RequireAuth` → `AdminLayout`); all allowed for staff:**
| ID | Route | Expected |
|---|---|---|
| `s-p1-admin-dashboard` | `/admin` | renders; counts include the two seeded households |
| `s-p1-admin-households` | `/admin/households` | lists `Villar Family SV1001` and `Abad Family SV1001` |
| `s-p1-admin-households-new` | `/admin/households/new` | redirects to `/admin/households` **with the New Household panel open** |
| `s-p1-admin-households-filter` | `/admin/households?q=Villar` (and whatever filter/page params the page writes — read them off the URL after filtering once) | filter survives a reload and a pasted URL |
| `s-p1-admin-members` | `/admin/members` | lists the 4 seeded members |
| `s-p1-admin-duplicates` | `/admin/duplicates` | renders a clean empty state (no duplicates seeded) |
| `s-p1-admin-sacraments` | `/admin/sacraments` | renders |
| `s-p1-admin-blood` | `/admin/blood` | renders blood type directory |
| `s-p1-admin-organizations` | `/admin/organizations` | renders |
| `s-p1-admin-ministries` | `/admin/ministries` | renders |
| `s-p1-admin-census` | `/admin/census` | renders `Census SV1001` with Households / Online updates / Results by GKK tabs |
| `s-p1-admin-requests` | `/admin/requests`, `?tab=prayers`, `?tab=blood`, `?tab=donors`, `?tab=bogus` | each tab renders its seeded row; `bogus` falls back to Certificates |
| `s-p1-admin-website` | `/admin/website`, `?tab=sacraments`, `?tab=announcements`, `?tab=bulletin`, `?tab=events`, `?tab=office`, `?tab=bogus` | each tab renders; `bogus` falls back to Mass Schedule |
| `s-p1-admin-reports` | `/admin/reports` | renders |
| `s-p1-admin-exports` | `/admin/exports` | renders |
| `s-p1-admin-settings` | `/admin/settings` | Parish Config renders, incl. **Change password** card |
| `s-p1-admin-settings-min` | `/admin/settings/ministries` | renders |
| `s-p1-admin-settings-org` | `/admin/settings/organizations` | renders |
| `s-p1-guard-staff` | `/admin/settings/staff` | **admin-only.** Heading "Staff accounts" + empty state *Staff admins only*; **no** table, **no** "Add staff", **no** request to `/functions/v1/manage-staff` (§A.8) |
| `s-p1-admin-unknown` | `/admin/bogus` | stays on `/admin/bogus` inside the admin shell (sidebar visible) with the heading **Page not found** and a *Back to the Dashboard* link. Landing on the public `/` is a regression |

Record one line per id. Group 0–1 rows that involve drafts or other households
are boundary checks: a draft or another family's data rendering is a **P0**.

---

## PHASE 2 — Use what's allowed, page by page (act as staff)

Every row is one real action as **Lito**. The point is not CRUD depth (that's
`docs/beta-testing/03…08`) but proving that each server path works for a
**non-admin** session and records **Lito** — not the admin, not blank — as the
person who did it.

### s-A · Dashboard
1. **s-dash-render** — `/admin`: no error boundary, console clean.
2. **s-dash-cards** — each card links to its filtered list (README: *every card
   links to the matching filtered list*). Follow two; the list's filter matches.
3. **s-dash-verify-queue** — the queue of households awaiting verification is
   empty (Abad was verified in B1) or shows only unverified ones.

### s-B · Households & members
1. **s-hh-create** — **New Household** → `Cruz Family SV1001`, head `Ana Cruz
   SV1001` (F, 1990-05-05), GKK San Pedro Calungsod → Save. Appears in the list
   with a reference number.
2. **s-hh-verify** — **Verify** `Cruz Family SV1001`. Assert the verified-by line
   names **Lito Ramos SV1001** (`households.verified_by`, `VerifiedLine.jsx`).
3. **s-hh-edit** — edit `Villar Family SV1001`'s street → save → reload → kept.
4. **s-member-edit** — open `Paolo Villar SV1001` → add ministry **Altar Servers**
   → save → reload → kept.
5. **s-sacrament-verify** — on `Nena Villar SV1001`, mark Baptism verified
   (source: certificate) — `verify_sacrament` must succeed for staff and show
   Lito as the verifier.
6. **s-hh-print** — Print a household; dismiss the print dialog (§A.5).

### s-C · Duplicates, sacraments, blood types, groups
1. **s-dup-detect** — add a member `Ana Cruz SV1001` (same DOB) to `Villar
   Family SV1001`; `/admin/duplicates` now lists the pair. **Not duplicates** →
   the group disappears (`dismiss_duplicate_group`).
2. **s-sacraments-filter**, **s-blood-filter**, **s-groups-roster** — apply one
   filter on each page; the seeded members appear where expected.

### s-D · Census
1. **s-census-record** — record census for `Cruz Family SV1001` (Ana: *Aktibo*
   for Mass, status Active) → save. Progress updates.
2. **s-census-portal-approve** — in a **second tab, signed out** (or a private
   window), `/census` with `<hhRef>` + `<accessCode>` → change Paolo's
   contact number to `0917 555 7777` → submit. (The portal only corrects personal details — name, relationship, sex, date of birth, civil status, contact — not occupation.) Back as Lito: **Census → Online
   updates** shows it; **approve** it, and record its id `<submissionId>` from the
   network log. Paolo's record now shows the change (`census_approve_submission`).
3. **s-census-new-code** — **New code** for Villar → the old `<accessCode>` no
   longer opens `/census` (verify in the signed-out tab).
4. **s-census-close** — leave the census **open** (Phase A needs it). Record
   `SKIPPED s-census-close (kept open for Phase A)`; close it after Phase A.

### s-E · Requests
1. **s-req-cert** — open `<certRef>`, link it to member `Lorna Abad SV1001`
   (`MemberMatch`), move it to the next status. `/serbisyo/susiha` with
   `<certRef>` (signed-out tab) shows the new status.
2. **s-req-prayer** — mark the prayer request **Prayed for**; **Print this
   list** (dismiss the dialog).
3. **s-req-blood** — open the O+ request: `Ramon Abad SV1001` is listed as a
   compatible donor. Log one contact attempt (it only writes a `blood_request_contacts` row with `status` *Contacted* and a note — **never**
   actually call the number); `updated_by_name` must read **Lito Ramos SV1001**.
4. **s-req-badge** — the sidebar `"<n> waiting"` badge drops after each action
   without a reload (`refreshRequestCounts`).

### s-F · Parish Website
1. **s-web-publish** — publish `Draft notice SV1001`. In the signed-out tab,
   `/pahibalo` now shows it — then **unpublish** it again (Phase A needs a draft).
2. **s-web-tabs** — open each tab (Mass Schedule, Sacraments, Announcements,
   Bulletin, Events, Office & Contact); each loads its list without error.

### s-G · Reports & exports
1. **s-reports** — each report renders; the ad-hoc report builder returns the
   seeded members.
2. **s-exports** — download members, households and blood-type CSVs. Each
   downloads (check `browser_network_requests` / the download event), and
   contains the `SV1001` rows. No real email address in them apart from
   `@example.test` ones.

### s-H · Parish Config (wide by design — record behaviour, don't judge it)
1. **s-cfg-gkk** — add GKK `GKK Test SV1001`. It appears in the list.
2. **s-cfg-identity** — note (don't change) that staff can edit the parish name
   and logo. Record `PASS (editable by staff by design)` — and add a §7b line if
   you think a non-admin renaming the parish is a product risk.
3. Keep **Change password** for Phase F (`f2-profile`).

Record `s-*` lines.

---

## PHASE 2.5 — Server-side authorization sweep (as staff, from the browser)

Hidden nav and the *Staff admins only* empty state are cosmetic; RLS, function
grants and `manage-staff` are the real boundary. Run these with
`browser_evaluate` **inside Lito's signed-in page**, so the real session token is
used.

**Helper — paste once per probe.** `SB_URL` and `ANON` are this repo's test
project (§0b; the publishable key is public, so it may appear in a probe — the
**secret key must never**). The function reads the session supabase-js stored in
`localStorage` (key `sb-qyoyuukpdjrwfhovtrwd-auth-token`). With no session it
sends the publishable key alone, because a new-format key isn't a JWT and must not
go in `Authorization` (§0b):
```js
async () => {
  const SB_URL = 'https://qyoyuukpdjrwfhovtrwd.supabase.co';
  const ANON   = 'sb_publishable_bSXrlvkN9er_uRkcqzRD1A_e9BvDKdN';
  const k = Object.keys(localStorage).find((x) => /^sb-.+-auth-token$/.test(x));
  const token = k ? JSON.parse(localStorage.getItem(k)).access_token : null;
  const call = async (path, init = {}) => {
    const r = await fetch(SB_URL + path, { ...init, headers: {
      apikey: ANON, ...(token ? { Authorization: 'Bearer ' + token } : {}),
      'Content-Type': 'application/json', Prefer: 'return=representation',
      ...(init.headers || {}) } });
    return { status: r.status, body: (await r.text()).slice(0, 300) };
  };
  return await call('/functions/v1/manage-staff', { method: 'POST', body: JSON.stringify({ action: 'list' }) });
}
```
Change only the last `return` line for each row.

### s-api-staff-fn · `manage-staff` refuses a non-admin
| ID | Call (body for `POST /functions/v1/manage-staff`) | Expected |
|---|---|---|
| `s-api-fn-list` | `{"action":"list"}` | **403** *Only staff admins can manage staff accounts* — and **no** staff emails in the body |
| `s-api-fn-create` | `{"action":"create","name":"Leak SV1001","email":"leak.sv1001@example.test","password":"LeakProbe-1234"}` | 403; then (as admin, Phase D) confirm no such account exists |
| `s-api-fn-update-self` | `{"action":"update","id":"<Lito's own id>","name":"Lito Ramos SV1001","is_admin":true}` | 403 — **the self-promotion probe**; a 200 here is the worst leak in the app (**P0**) |
| `s-api-fn-reset` | `{"action":"reset_password","id":"<adminId>","password":"Hijack-SV1001!"}` | 403; admin can still sign in with their own password (verify in Phase D) |
| `s-api-fn-disable` | `{"action":"disable","id":"<adminId>"}` | 403 |
| `s-api-fn-noauth` | same `list` call with `headers: { Authorization: '' }` (no session token) | 401 *Please sign in again* |

Lito's own id is the `sub` in the access token
(`JSON.parse(atob(token.split('.')[1])).sub`).

### s-api-profiles · No self-promotion, no peeking at other staff
| ID | Call | Expected |
|---|---|---|
| `s-api-profiles-read-all` | `GET /rest/v1/profiles?select=*` | exactly **one** row — Lito's own (`profiles_select_own`); the admin's row must not appear |
| `s-api-profiles-read-admin` | `GET /rest/v1/profiles?id=eq.<adminId>` | `[]` |
| `s-api-profiles-promote` | `PATCH /rest/v1/profiles?id=eq.<own id>` body `{"is_admin":true}` | refused: 403 *permission denied for table profiles* (0015 revokes writes; before 0015 it was 200 `[]`, stopped by RLS only). Then **reload `/admin`**: Staff must still be absent from the nav. A silent success is **P0** |
| `s-api-profiles-insert` | `POST /rest/v1/profiles` body `{"id":"00000000-0000-0000-0000-000000000001","name":"x","is_admin":true}` | refused — *permission denied* (0015), not an RLS violation |
| `s-api-profiles-delete` | `DELETE /rest/v1/profiles?id=eq.<adminId>` | refused — *permission denied* (0015); the admin can still sign in |

### s-api-staff-allowed · Things staff *must* be able to do over the API
A refusal here is a bug too (a page would break for every non-admin):
| ID | Call | Expected |
|---|---|---|
| `s-api-dashboard-stats` | `POST /rest/v1/rpc/admin_dashboard_stats` body `{"p_tz":"Asia/Manila"}` | 200 with totals |
| `s-api-inbox-counts` | `POST /rest/v1/rpc/request_inbox_counts` | 200 |
| `s-api-dupes` | `POST /rest/v1/rpc/find_duplicate_members` | 200 |
| `s-api-access-codes` | `POST /rest/v1/rpc/census_access_codes` body `{"p_household_ids":[<hhId>]}` | 200 |
| `s-api-members-view` | `GET /rest/v1/members_with_household?select=id&limit=1` | 200 with a row |

### s-api-internal · Functions nobody should call directly, staff included
| ID | Call | Expected |
|---|---|---|
| `s-api-take-snapshot` | `POST /rest/v1/rpc/census_take_snapshot` body `{"p_cycle_id":<cycleId>,"p_household_id":<hhId>}` | refused (revoked from `authenticated` in 0008) |
| `s-api-portal-check` | `POST /rest/v1/rpc/portal_check` body `{"p_ref":"<hhRef>","p_code":"x"}` | refused (only `portal_open`/`portal_submit` are public) |
| `s-api-request-guard` | `POST /rest/v1/rpc/public_request_guard` body `{"p_kind":"x","p_per_visitor":1,"p_overall":1}` | refused |
| `s-api-request-log` | `GET /rest/v1/public_request_log?select=*` | refused — the hashed visitor keys stay private |

Record one line per id: `status · first 80 chars of body`.

---

## PHASE A — Anonymous cage (signed out, anon key only)

Sign out (`button "Sign out"`), confirm you land on `/admin/login`, then
`browser_navigate` to `/` so the probes run from the public site. Re-run the
§2.5 helper — with no session in `localStorage` it falls back to the anon key.
Verify that first with `GET /auth/v1/user` (must be 401/403).

### a-ui · Admin is closed to anon
| ID | Route | Expected |
|---|---|---|
| `a-ui-admin` | `/admin`, `/admin/members`, `/admin/settings/staff`, `/admin/requests?tab=donors` | each redirects to `/admin/login`; no registry text flashes first |

### a-api-read · No registry row may come back (expect 401/403, or 200 `[]`)
| ID | Endpoint (`GET /rest/v1/…?select=*&limit=5`) |
|---|---|
| `a-api-households` | `households` |
| `a-api-members` | `members` |
| `a-api-view-members` | `members_with_household` |
| `a-api-view-households` | `households_with_count` |
| `a-api-profiles` | `profiles` |
| `a-api-sacr-verif` | `sacrament_verifications` |
| `a-api-census-cycles` | `census_cycles` |
| `a-api-census-resp` | `census_member_responses` |
| `a-api-census-snap` | `census_household_snapshots` |
| `a-api-access-codes` | `household_access_codes` — **the one to check first**; leaking these opens every family's portal |
| `a-api-census-subs` | `census_submissions` |
| `a-api-dup-dismiss` | `duplicate_dismissals` |
| `a-api-cert-req` | `certificate_requests` |
| `a-api-prayer-req` | `prayer_requests` |
| `a-api-donors` | `blood_donors` — names + mobiles of donors |
| `a-api-blood-req` | `blood_requests` |
| `a-api-blood-contacts` | `blood_request_contacts` |
| `a-api-settings` | `parish_settings` (office details are public only through `public_office_details`) |

### a-api-drafts · Website tables: published rows only
| ID | Endpoint | Expected |
|---|---|---|
| `a-api-announce` | `GET /rest/v1/announcements?select=id,title,published` | `Pahibalo SV1001` only — **no** `Draft notice SV1001` |
| `a-api-announce-draft` | `GET /rest/v1/announcements?id=eq.<draftId>` | `[]` |
| `a-api-events-draft` | `GET /rest/v1/events?id=eq.<draftEventId>` | `[]` |
| `a-api-mass`, `a-api-bulletins`, `a-api-articles`, `a-api-guides` | `mass_schedules`, `bulletins`, `articles`, `sacrament_guides` | only `published = true` rows |

### a-api-rpc · Staff functions refuse anon
| ID | Call (`POST /rest/v1/rpc/<fn>`) | Expected |
|---|---|---|
| `a-rpc-dashboard` | `admin_dashboard_stats` `{"p_tz":"UTC"}` | refused |
| `a-rpc-report` | `admin_report_stats` | refused |
| `a-rpc-dupes` | `find_duplicate_members` | refused |
| `a-rpc-inbox` | `request_inbox_counts` | refused |
| `a-rpc-access-codes` | `census_access_codes` `{"p_household_ids":[<hhId>]}` | refused |
| `a-rpc-reset-code` | `census_reset_access_code` `{"p_household_id":<hhId>}` | refused — and the Villar code still works afterwards |
| `a-rpc-approve` | `census_approve_submission` `{"p_id":<submissionId>}` (the portal update approved in `s-census-portal-approve`) | refused |
| `a-rpc-verify-sacr` | `verify_sacrament` `{"p_member_id":<memberId>,"p_sacrament":"baptism","p_source":"x"}` | refused |
| `a-rpc-census-open` | `census_open_cycle` `{"p_label":"Leak SV1001"}` | refused |
| `a-rpc-create-hh` | `create_household` `{"payload":{}}` | refused (*permission denied*, 42501). 0015 revokes these staff functions from `public, anon` (hardening note H1 of the 2026-10-01 run); a 400 validation error means 0015 hasn't run — record it as a P2. A row actually created is **P0** |
| `a-rpc-rename-gkk` | `rename_gkk` `{"old_name":"GKK San Isidro","new_name":"Leak SV1001"}` | refused (*permission denied*, 0015). **Read the body.** Confirm afterwards (service key) that the GKK name is unchanged |
| `a-rpc-delete-gkk` | `delete_gkk` `{"target_name":"GKK Sto. Niño"}` | refused (*permission denied*, 0015). The GKK must still exist afterwards. Use a GKK no household uses, so the function's own in-use guard is not what stops it |
| `a-rpc-census-progress` | `census_household_progress` `{"p_cycle_id":<cycleId>}` and `census_summary` `{"p_cycle_id":<cycleId>}` | refused — *permission denied for function* (0015); never per-household names |

### a-api-public · What anon *may* call returns no PII
| ID | Call | Expected |
|---|---|---|
| `a-pub-stats` | `public_parish_stats` | totals only |
| `a-pub-gkk-dir` | `public_gkk_directory` | GKK names; household counts `null` below 5 households; coordinator only when marked public |
| `a-pub-census` | `public_census_progress` | `open: true`, label `Census SV1001`, no household names |
| `a-pub-reg-status` | `registration_status` `{"p_ref":"<regRef>"}` | ref, status, date — **no** household name, members, contacts or addresses |
| `a-pub-cert-status` | `certificate_request_status` `{"p_ref":"<certRef>"}` | status fields only — no requester name/mobile |
| `a-pub-blood-calls` | `public_blood_calls` | does **not** list the non-public `Test Hospital SV1001` request; never donor names |
| `a-pub-prayers` | `public_prayer_intentions` | no requester details |
| `a-pub-portal-bad` | `portal_open` `{"p_ref":"<hhRef>","p_code":"WRONG"}` | `ok: false` — repeat 5× total, then the correct code → `locked` for 15 min (README). Use **Cruz** (`s-census-new-code` changed Villar's) so Phase 2 isn't affected |

### a-api-write · Direct writes refused
| ID | Call | Expected |
|---|---|---|
| `a-write-hh` | `POST /rest/v1/households` `{"household_name":"Leak SV1001"}` | refused |
| `a-write-member` | `PATCH /rest/v1/members?id=eq.<memberId>` `{"first_name":"Leak"}` | refused or 0 rows |
| `a-write-announce` | `PATCH /rest/v1/announcements?id=eq.<draftId>` `{"published":true}` | refused; `/pahibalo` still hides the draft |
| `a-write-donor` | `DELETE /rest/v1/blood_donors?id=gt.0` | refused or 0 rows |

**Verify as staff afterwards** (sign back in as Lito): no `Leak SV1001`
household, Paolo's name unchanged, draft still a draft, donor still listed.
Record `a-verify-no-side-effects`. Then close `Census SV1001`
(`s-census-close`).

---

## PHASE D — Disabled account

Needs two tabs: **tab 1** stays signed in as Lito; **tab 2** signs in as admin.
1. **d-disable** — tab 2: `/admin/settings/staff` → **Disable** Lito → confirm
   *Disable account*. Row shows *Disabled*.
2. **d-fn-refused** — tab 1: re-run `s-api-fn-list`. Body must say *This account
   has been disabled* (403) — `handler.js` checks the account, not the token.
3. **d-session-window** — tab 1: navigate `/admin/households` and try one edit.
   Record what happens. Supabase RLS doesn't look at `banned_until`, so the
   already-issued access token may keep working **until it expires (up to an
   hour)** — the confirm dialog itself warns *"their session ends within the
   hour"*. That is documented behaviour: record `PASS (documented ≤1h window)`
   if it matches, `FAIL` if the session survives past token expiry or a
   refresh.
4. **d-login-refused** — tab 1: sign out, sign in again as Lito → refused with a
   clear message (not a blank page, not a generic crash).
5. **d-admin-intact** — tab 2: the Staff list contains **no**
   `leak.sv1001@example.test` (from `s-api-fn-create`); the admin's own row is
   still Active and Admin; sign out and back in as admin with
   `PLAYBOOK_ADMIN_PASSWORD` (proves `s-api-fn-reset` didn't change it).
6. **d-enable** — tab 2: **Enable** Lito. Tab 1: Lito can sign in again.

Record `d-*` lines.

---

## PHASE R — Responsive (the staff nav under real viewports)

1. **r-mobile-nav** — `browser_resize` 390×844. The sidebar is gone; the top bar
   has `button "Open navigation menu"` and the parish name. Open it:
   `dialog "Navigation menu"` lists the same items as `s-p1-nav`, still **no
   Staff**. Choosing an item navigates **and** closes the drawer; Escape and the
   dimmed backdrop both close it.
2. **r-mobile-pages** — at 390×844 re-check Dashboard, Households (New Household
   panel) and Requests: no horizontal page scroll, nothing cut off.
3. **r-mobile-public** — at 390×844 the public site (`/`, `/serbisyo`,
   `/register` step 1) is usable.
4. **r-tablet-nav** — 768×1024: still the drawer. **r-laptop-nav** — 1024×768:
   the permanent sidebar appears, no menu button.
5. `browser_resize` back to 1440×900.

Visual-only judgements are `NEEDS-HUMAN` with a screenshot.

---

## PHASE S — Session & auth lifecycle

1. **s-deeplink-redirect** — signed out, `browser_navigate` `/admin/members`.
   Assert redirect to `/admin/login`. Sign in as Lito: you land back on
   `/admin/members` (also try `/admin/requests?tab=donors` — the query survives).
   Landing on `/admin` instead is a regression (S4 usability, per
   `docs/beta-testing/02-admin-access.md` AA-16).
2. **s-reload-persists** — signed in, reload `/admin/requests?tab=donors`: still
   signed in, same tab, no flash of the sign-in page.
3. **s-bad-login** — wrong password for Lito, and an unknown email
   `nobody.sv1001@example.test`: the two messages are **identical** (different
   messages reveal which staff emails exist — S2).
4. **s-broken-token** — `browser_evaluate` to overwrite the `sb-…-auth-token`
   value with `"broken"`, then reload `/admin`: back to `/admin/login`, no blank
   page or crash; signing in again works.
5. **s-logout-clears** — **Sign out** → `/admin/login`. Press Back: the admin
   page must **not** reappear with data (RequireAuth must bounce it).

---

## PHASE F — Friction sweep (the checks the happy path never makes)

The other playbooks use this phase to catch two bug classes a happy-path journey
structurally cannot see: **(a) stale client cache** — a record created on one
screen isn't offered by a picker on another until the page is reloaded, and
**(b) validation that doesn't recover** — a required-field message that stays on
screen after its field has been filled.

Unlike a read-only role, **staff create things**, so all of it applies.

Two rules:
- **No reloading.** Move between screens with the in-app nav only. A reload
  (F5, or `browser_navigate` to a fresh URL) refetches everything and hides
  staleness. If you reload by accident, that step's result is void — redo it.
- **Assert the negative.** "No message remains", "the new item *is* offered" are
  assertions — read them out of the snapshot.

### F-1 · Create here, consume there (no reload)
| ID | Create (Settings / page) | Then, via in-app nav only | Assert |
|---|---|---|---|
| `f1-gkk-picker` | Parish Config → add GKK `GKK Fresh SV1001` | Households → New Household → GKK picker | `GKK Fresh SV1001` is offered |
| `f1-ministry-picker` | Settings → Ministries → add `Ministry Fresh SV1001` | Members → open `Nena Villar SV1001` → ministries | offered |
| `f1-org-picker` | Settings → Organizations → add `Org Fresh SV1001` | member detail → organizations | offered |
| `f1-position-picker` | Parish Config → add parish position `Position Fresh SV1001` | member detail → *Katungdanan sa Parish* | offered |
| `f1-hh-to-census` | New Household `Fresh Family SV1001` | Census → Households tab | listed for the open census (or record that new households only join the next census) |
| `f1-admin-write` | **as admin in tab 2:** verify a household / add an announcement | Lito's tab: in-app nav Dashboard ⇄ Households / Website | the change is visible |

Stale-until-reload is a **P1 bug**.

### F-2 · Validation recovery
Drive each form **empty-first**: submit with everything blank, note every
message verbatim, then fill the fields **one at a time** and assert each message
— and its field highlight — clears as soon as that field is valid.

| ID | Form |
|---|---|
| `f2-login` | `/admin/login`: blank → *Enter your email and password.* (no request sent); wrong password → error; correct → error gone, signed in |
| `f2-profile` | Parish Config → **Change password**: blank; mismatched confirm (*The new passwords do not match.*); 9 chars (*at least 10 characters*); wrong current (*Current password is incorrect*); then current = temporary password, new = `StaffPass-SV1001!` → *Password changed*. Sign out and in with the new password. Update `PLAYBOOK_STAFF_PASSWORD` in root `.env` |
| `f2-new-household` | New Household drawer, blank **Next →** (step 1). Find fields by accessible name, e.g. `getByRole('textbox', { name: 'Last name', exact: true })` — see §2.6 |
| `f2-register` | `/register` step 1 (signed-out tab), blank Next |
| `f2-website` | Parish Website → Announcements → new, blank save |

A message that survives its field being filled is a **P1 bug**; a login error
that persists after a successful correction is **P0** (it reads as a failed
login).

### F-3 · Recovery after a refusal
After `s-p1-guard-staff`, in-app navigation to Households must render normally
— no leftover *Staff admins only* fragment. Record `f3-nav-recovery`.

---

## 2.6 Known pitfalls when driving this app (learned in the 2026-10-01 run)
- **Chromium and the proxy CA.** In the Claude Code cloud container Chromium rejects the proxy's certificate (`net::ERR_CERT_AUTHORITY_INVALID`), so every Supabase
  call from the browser fails and pages "render" with no data — a false PASS. Import `/root/.ccr/ca-bundle.crt` into `~/.pki/nssdb`
  (`apt-get install libnss3-tools`, split the bundle into single certs, `certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n <name> -i <cert>`). Prove it with a request to
  `$SUPABASE_URL/auth/v1/health` that answers 401, not a cert error. Never ignore HTTPS errors.
- **Payload shapes differ between the public and staff RPCs.** `submit_registration` takes `householdName` / `firstName` / `lastName` / `relationship` / `civilStatus`;
  the staff `create_household` takes `household.name` plus `first` / `last` / `rel` / `pob` / `civil` (see `client/src/api.js`).
- **Selectors.** Parish Config → **Parish GKK** has two text boxes — use the placeholder *New GKK name…*, not "the last textbox" (that is the search box). The Reports page's GKK
  picker only appears after choosing a data source and a report type (**Households → By GKK**). The sidebar link text includes a count badge for Requests.
- **Errors are `role="alert"`.** The sign-in, change-password and per-field errors all are, so read them with `getByRole('alert')` (scope it to the dialog for drawers —
  otherwise you also collect other alerts on the page). A blank change-password form now says *Enter your current password.*
- **Required-field labels.** The label text is `Last name *`, but the `*` is `aria-hidden` and the input carries `aria-required`, so the
  accessible name is exactly `Last name`. Use `getByRole('textbox', { name: 'Last name', exact: true })`; `getByLabel(..., { exact: true })` matches the
  label's raw text including the `*` and finds nothing (the cause of the 2026-10-01 NEEDS-HUMAN on `f2-new-household-message-clears-on-fill`).
- **Ids.** `npm run db:wipe-test` does not reset sequences, so ids keep counting up — read real ids from responses, never assume `1`.

## 3. Per-step procedure (applies to every step above)
1. **Act** — perform the action as the current identity would (§A loop).
2. **Assert** — through the UI *and* the network: the right page, the right
   rows, the right refusal. Reload where a change is meant to persist (outside
   Phase F).
3. **Record** one result line (§4), keyed by the step id.
4. **Record every bug — always, in the same pass.** Anything broken or any
   boundary that leaks (a FAIL, an admin-only control reachable by staff, a row
   anon can read, a draft shown publicly, a console/`ErrorBoundary` throw, a
   broken empty state) gets its own **§7c** entry: step id, symptom, exact
   reproduction steps, and the affected file / migration / function if known.
   Boundaries live in: `client/src/App.jsx` (`RequireAuth`),
   `client/src/pages/admin/AdminLayout.jsx` (nav), `ManageStaff.jsx`,
   `supabase/functions/manage-staff/handler.js`, and the RLS policies / grants
   in `supabase/migrations/*.sql`.
5. **Note UX friction** in **§7b** — even when the step PASSes: an empty state
   with no explanation, a refusal that reads like a crash, Bisaya/English mixed
   in a confusing way, an action with no feedback for more than ~5 seconds.

> **Bug + UX improvement travel together.** Whenever a step surfaces a bug,
> record **both**: the bug in §7c *and* the improvement it implies in §7b.

> **Two bug shapes to name explicitly.** A **stale view** (correct only after a
> reload) and a **sticky validation message** (still showing after its field is
> filled). Both are real bugs — log them in §7c whenever you notice one, in any
> phase.

## 4. Result statuses
- **PASS** — the assertion held (including "correctly refused").
- **FAIL** — it didn't, **or a boundary leaked**. Add a short symptom.
- **BLOCKED** — a prerequisite failed (name it), or a rate limit / missing Edge
  Function stopped the step.
- **NEEDS-HUMAN** — driven, but the check is visual.
- **SKIPPED (external)** — would contact a real person or service. Shouldn't
  arise; never trigger it.

## 5. Scope & safe-skips
- Only ever the **test** Supabase project (§1 step 1). The §1 wipe is the only
  bulk-destructive action and is intentional there.
- The service-role key stays in the shell — never in `browser_evaluate`, a
  screenshot, or the results file. Same for both app passwords.
- Do the admin bootstrap only to set up the run; the test subject is the
  **staff** session (and, in Phase A, the anonymous one).
- Public forms are rate-limited per visitor per hour: don't loop on them.

## 6. Orientation aids (selectors & sources of truth)
- Sidebar: `navigation "Admin sections"`; mobile drawer `dialog "Navigation
  menu"`, opened by `button "Open navigation menu"`; sign-out `button "Sign out"`.
- Admin-only: only `NAV_SETTINGS` → `Staff` (`adminOnly: true`) in the UI, and
  everything in `supabase/functions/manage-staff/handler.js` on the server.
- Role source of truth: `profiles.is_admin` (added in
  `supabase/migrations/0010_admin_tools.sql`), read into `user.isAdmin` by
  `client/src/AuthContext.jsx`.
- RLS: `*_admin_all` policies grant every `authenticated` user full access to
  the registry tables (0001, 0006, 0011, 0012, 0013); `profiles_select_own` limits
  profiles; anon gets `select … using (published)` on website tables (0011,
  0013) and nothing on registry/request tables.
- Public RPCs (anon-callable): `submit_registration`, `list_public_gkks`,
  `public_parish_stats`, `list_public_organizations`, `household_name_available`,
  `public_parish_logo`, `list_public_parish_positions`, `portal_status`,
  `portal_open`, `portal_submit`, `census_normalize_code`, `parish_today`, the
  `submit_*` / `register_blood_donor` request functions, `certificate_request_status`,
  `public_blood_calls`, `public_prayer_intentions`, `public_gkk_directory`,
  `public_census_progress`, `public_office_details`, `registration_status`.
  Anything else answering anon is a finding.
- Tab deep-links: Requests `?tab=certificates|prayers|blood|donors`, Website
  `?tab=mass|sacraments|announcements|bulletin|events|office`.

## 7. Output (the artifact that matters)
Write one file — phase-grouped, terse, one line per step id:
- `.claude/playbooks/staff-journey-results/staff-run-YYYYMMDD-HHMM.md`
  (create the `staff-journey-results/` folder if it doesn't exist)

**Never write a password, the service-role key, an access code or an access
token into it.** Reference numbers and ids are fine.

The file has **three** required sections: **§7a results table**, **§7b UX /
friction notes**, and **§7c Bugs found**. A run that found bugs but recorded no
§7c entries is an **incomplete run**.

### 7a. Results format
```
# Staff Journey — <YYYY-MM-DD HH:MM> (empty test project, port <PORT>)

Seeded: registration <regRef> (Abad), household <hhRef> (Villar, id <hhId>),
census "Census SV1001", cert <certRef>, prayer, donor, blood request,
announcements (1 published, draft <draftId>), draft event <draftEventId>.

## Setup
PASS   u0-wipe         registry tables emptied on the test project
PASS   u0-baseline     staff signed in, name/role shown, no Staff nav item

## Phase 1 — Role-boundary audit (as staff) — full route census
PASS   s-p1-nav                 13 main + 3 settings items, no Staff
PASS   s-p1-open-pahibalo-draft /pahibalo/<draftId> not rendered publicly
PASS   s-p1-open-census-other   Villar's code refused for the Abad reference
PASS   s-p1-guard-staff         "Staff admins only", no list, no manage-staff call
... (one line per id in Groups 0–2)

## Phase 2 — Using what's allowed
PASS   s-hh-verify              verified-by shows Lito Ramos SV1001
PASS   s-sacrament-verify       verify_sacrament ok for staff, verifier = Lito
...

## Phase 2.5 — Server-side sweep (staff session)
PASS   s-api-fn-update-self     403 · Only staff admins can manage staff accounts
PASS   s-api-profiles-promote   401 · permission denied for table profiles
...

## Phase A — Anonymous cage
PASS   a-api-access-codes       401 · permission denied
PASS   a-api-announce-draft     200 · []
...

## Phase D — Disabled account
## Phase R — Responsive
## Phase S — Session & auth lifecycle
## Phase F — Friction sweep

— Items: N · PASS x · FAIL y · BLOCKED z · NEEDS-HUMAN w · SKIPPED s
```
If every checkable item passed: `Staff role-scoped journey passing — N checkable
items (M NEEDS-HUMAN).`

### 7b. UX / friction notes (required — append to every run's file)
A **`## Friction observations`** section. One line each — where, what happened,
file(s) if known, and a concrete **`→ Suggestion:`**. Group by **P0** (a
boundary leak / crash), **P1** (an allowed page that feels broken, stale or
misleading), **P2** (polish). This role's special value is noticing where a
non-admin is left guessing *why* something isn't there (the Staff page, a
refusal toast). "No friction noted this run" is a valid line — write it
explicitly.

### 7c. Bugs found (required — append to every run's file)
A **`## Bugs found`** section, grouped **P0** (boundary leak: staff reaching
staff-account powers or other profiles, anon reading any registry/request/donor
row or a draft, a cross-household census portal open; a write that should be
refused succeeding; an error-boundary crash), **P1** (a broken allowed page, a
stale view, a sticky validation message, a staff function refusing a non-admin),
**P2** (polish):
```
## Bugs found

### P0
- **a-api-donors** — Symptom: anon GET /rest/v1/blood_donors returned names and
  mobiles.
  Repro: sign out → browser_evaluate helper → GET /rest/v1/blood_donors?select=*.
  File: supabase/migrations/0012_requests.sql (grants on blood_donors).

### P1
- **s-sacrament-verify** — Symptom: verifying a sacrament as non-admin staff
  failed with "permission denied for function verify_sacrament".
  Repro: sign in as staff → Members → Nena → Baptism → Verify.
  File: supabase/migrations/0005_sacrament_verification.sql (grant execute).
```
Every bug here needs a matching §7b improvement line. If a run found none, write
`No bugs found this run.` — never omit the section.

## 8. Cleanup
- Sign out of both tabs. Leave Lito's account **enabled** (the next run's §1
  wipe deletes it).
- Stop the Vite process you started.
- Remove `PLAYBOOK_STAFF_PASSWORD` from root `.env`.

## 9. Re-run
Execute this file (`.claude/playbooks/staff-journey-playbook.md`). It complements
the human beta-testing playbooks in `docs/beta-testing/` (screen-by-screen
walkthroughs) and the `npm test` unit suite (pure client logic, plus
`client/test/staff-handler.test.js` for the `manage-staff` handler). This one is
the **empty-project, non-admin staff + anonymous** boundary journey. Re-run it
whenever `client/src/App.jsx`, `client/src/AuthContext.jsx`,
`client/src/pages/admin/AdminLayout.jsx`, `ManageStaff.jsx`,
`supabase/functions/manage-staff/`, or any file in `supabase/migrations/`
changes. Can later be wired to `/loop` or `/schedule`.
