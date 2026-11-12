# Staff admin run — 2026-11-12

| | |
|---|---|
| Playbook | `.claude/playbooks/staff-admin.md` |
| Persona | Sir Arnel Lim, parish office manager |
| Account | staffadmin@gmail.com (Full access, staff admin) |
| App | http://127.0.0.1:5173 (local dev server) |
| Database | demo (`qyoyuukpdjrwfhovtrwd`), Demo banner seen: yes; all requests went to qyoyuukpdjrwfhovtrwd.supabase.co |
| Browser / widths | Playwright MCP (headless Chromium); 1440 × 900 only (phone width not repeated) |
| App version | v1.3.0 |
| Run tag | PB1112SA |
| Started / finished | about 16:03 / 16:12 (container clock) |

An earlier attempt the same day used `fullstaff@gmail.com`, which is Full access but not a staff admin: the Staff page refused it ("Not available for your account"), so nothing could run. That refusal counts as a passed boundary check.

## Summary

Arnel could do the core job: the five playbook accounts were created, two throwaway leaders were added in bulk, reset, disabled, enabled, edited and deleted, and the confirmation dialogs name the person and explain the effect. Three things would trip him up: (1) the Staff page stopped working part-way through a bulk save (401s from `manage-staff`) with a misleading "Please sign in again", (2) after Edit, Delete and Disable the list keeps showing the old row until a reload, and (3) the half-filled and bad-email rows are counted as "to create" before the sheet shows its errors. A few policy checks (self un-admin, Demo account as admin) show no warning in the dialog; I did not press Save on those to avoid breaking shared accounts.

**Verdict:** Ready with fixes

## Mission results

| Mission | Result | Findings | Notes |
|---|---|---|---|
| SA-0 Set up playbook accounts | PASS WITH ISSUES | SA-1 | 4 of 5 created (full, read-only, website, clergy, GKK leader = 5 created); no-access account not created (needs the Supabase dashboard). Temporary passwords saved to `accounts.local.json` only. |
| SA-1 Twenty GKK leaders in one sitting | PASS WITH ISSUES | SA-1, SA-2 | Row errors are shown per row and nothing is silently skipped. Counted 4 "to create" before validation. B failed with a 401 mid-batch. |
| SA-2 Find, filter, sort | PASS | SA-6 | Chips, GKK-name search and last sign-in sort work; filter state is in the URL. CSV not downloaded (playbook says ask first): SKIPPED. |
| SA-3 Forgot password | PASS | | Reset dialog names the person and says the old password stops working. Old password refused; temp password leads to "Set a new password". Did not check whether the Staff page mentions "Forgot password?". |
| SA-4 Someone leaves | PASS WITH ISSUES | SA-3, SA-4 | Disabled sign-in shows raw "User is banned". Disable does not warn that the GKK loses its coordinator. Delete confirmation explains history. |
| SA-5 Change access | PASS WITH ISSUES | SA-2 | Read only and back to GKK leader (another GKK) saved. Did not sign in as the changed user or check already-signed-in behaviour. |
| SA-6 Make another admin and undo | PASS WITH ISSUES | SA-5 | Ticking Staff admin forces Full access. Not saved, so not undone. Own-account demotion not saved (see SA-5). |
| SA-7 Platform Integrations | PASS | SA-7 | Read only; Database, Photo storage and Email each say what they are for and a status. |
| SA-8 Demo account rules | PASS WITH ISSUES | SA-8 | Demo account text explains the rules, but the UI still lets Staff admin be ticked. |

## Findings

### SA-1 · P1 · Bug · `manage-staff` returns 401 mid-session; error says "Please sign in again"

- **Where:** `/admin/settings/staff`, mission SA-1 (bulk add leaders)
- **Steps:** sign in as the staff admin, add five accounts one by one, then bulk-add; save 2 rows.
- **Expected:** both leaders created; list refreshes.
- **Actual:** Leader A created, Leader B failed with "Please sign in again", and the list showed "Couldn't load this / Please sign in again". A reload did not help (still 401). Signing out and in again fixed it. Rest of the admin kept working with the same session.
- **Evidence:** POST `/functions/v1/manage-staff` returned 401 three times, then 401 on reload; 13 earlier calls returned 200. Also one 403 on `/auth/v1/logout?scope=global`.
- **Suggestion:** find out why the function rejects a still-valid session (token refresh race? rate limit?) and, if the session really expired, redirect to sign-in instead of showing an error in place.
- **Seen before:** new

### SA-2 · P2 · Bug · Staff list and coverage stay stale after Edit, Delete and Disable

- **Where:** Staff page after saving an edit or deleting
- **Actual:** toast says "Changes saved" / "Account deleted" but the row still shows the old access/GKK (and a deleted account still appears) until a reload. Coverage ("X of 16 GKKs") also lags one step behind, which made the numbers look wrong.
- **Expected:** list and coverage refresh right after the action.
- **Seen before:** new

### SA-3 · P2 · Copy · Disabled user sees "User is banned"

- **Where:** `/admin/login`, signing in as a disabled account
- **Actual:** "User is banned" (raw auth wording).
- **Suggestion:** "This account has been disabled. Please contact the parish office."
- **Seen before:** new

### SA-4 · P2 · Gap · Disable does not warn that the GKK becomes uncovered

- **Where:** Staff → More → Disable account
- **Actual:** dialog names the person and says the session ends within the hour, but says nothing about the GKK losing its coordinator.
- **Suggestion:** when the person is the only leader of a GKK, add "GKK … will have no coordinator."
- **Seen before:** new

### SA-5 · P2 · Gap · Un-ticking Staff admin on your own account gives no warning

- **Where:** Staff → Edit on own account
- **Actual:** the switch can be un-ticked and Save is enabled with no warning. I cancelled without saving, so what the server does is untested.
- **Expected:** a warning before un-admining yourself, and a refusal if it would leave no staff admin.
- **Seen before:** new (server side still to test, ideally with a spare admin)

### SA-6 · P3 · Friction · Bulk sheet counts invalid rows as "to create"

- **Where:** Add several leaders
- **Actual:** with one row half-filled and one with a bad email, the footer said "4 to create" and only showed the errors after clicking Create. Errors were clear and row-specific; nothing was skipped.
- **Suggestion:** mark invalid rows as soon as the field is left, and count only valid ones.
- **Seen before:** new

### SA-7 · P3 · Suggestion · Platform Integrations shows the R2 Account ID and Access Key ID in plain text

- **Where:** Parish Config → Platform Integrations → Photo storage
- **Actual:** secret key is hidden, but account ID and access key ID are visible. Only staff admins see the tab, so this is probably fine; noting it for a decision.
- **Seen before:** new

### SA-8 · P2 · Permission · Demo account's Staff admin switch can be ticked

- **Where:** Staff → Edit on the Demo account (demo@gmail.com)
- **Actual:** the text says the account is never a staff admin, but the switch can be ticked (and forces Full access). Not saved, so the server's answer is untested.
- **Suggestion:** disable the switch for Demo access, and make sure the server refuses it too.
- **Seen before:** new

### SA-9 · P2 · Bug · Dashboard RPC `census_household_progress` returns 400

- **Where:** `/admin` right after sign-in (every time)
- **Actual:** two POSTs to `/rest/v1/rpc/census_household_progress` return 400 on each dashboard load.
- **Suggestion:** the function may be missing or out of date on the demo project; check migrations were applied.
- **Seen before:** new

## Boundary checks

| Check | Expected | Actual | Result |
|---|---|---|---|
| Non-admin (Full access, `fullstaff@gmail.com`) opens `/admin/settings/staff` | refused | "Not available for your account" | PASS |
| Demo banner and demo project | banner + qyoyuukpdjrwfhovtrwd | both seen | PASS |
| Temporary password shown again later | no, only once | dialogs say "won't be shown again"; not reopened | PASS |
| Staff list exposes passwords (page) | never | none seen | PASS (CSV and network bodies not checked) |
| Self-demotion leaving zero admins | refused | dialog gives no warning; not saved | NOT TESTED |
| Demo account made staff admin | refused | switch can be ticked; not saved | NOT TESTED |
| Old password after reset | stops working | "Invalid login credentials" | PASS |

## Cleanup

- **Created:** `pb.full`, `pb.readonly`, `pb.website`, `pb.clergy`, `pb.leader` `@example.test` (kept per playbook), and throwaway Leader A and Leader B (`PB1112SA`).
- **Removed:** Leader A and Leader B, deleted from the Staff page.
- **Not created:** `pb.noaccess@example.test` (needs the demo project's Supabase dashboard: Authentication → Add user).
- Signed out: yes. Dev server stopped. Viewport left at 1440 × 900.
