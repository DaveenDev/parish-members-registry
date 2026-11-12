# Read only run — 2026-11-12 (second run)

The first run the same day (`read-only-run-2026-11-12-result.md`) was BLOCKED for lack of an account.

| | |
|---|---|
| Playbook | `.claude/playbooks/read-only.md` |
| Persona | Engr. Tony Bacalso, Parish Pastoral Council vice-president |
| Account | readonly@gmail.com (Read only; created 12 Nov 2026 by Dave Rooben, per the Activity log) |
| App | http://127.0.0.1:5173 (local dev server) |
| Database | demo (`qyoyuukpdjrwfhovtrwd`), Demo banner seen: yes. Requests went only to qyoyuukpdjrwfhovtrwd.supabase.co |
| Browser / widths | Playwright MCP (headless Chromium); 1440 × 900 and 390 × 844 |
| App version | v1.3.0 (admin sidebar) |
| Run tag | PB1112RO (nothing created) |
| Started / finished | about 16:06 / 16:10 (server time, UTC) |

## Summary

Tony can see the registry, requests, website and activity log, and in everything I tried he could not change anything. Exports and Trash are refused with a clear message, and "Requests" and "Website" say "Your account can view this page but not change it." The Dashboard and Reports agree on every figure I compared (489 households, 296 verified, 193 pending, 1849 members, 16 GKKs). The Activity log answers "who changed this?" in plain words. Not everything was tested; see "Not covered" below.

Top things to fix: **RO-1** (Export CSV works for a read-only account, contrary to the role definition), **RO-2** (Census progress tiles are empty because a request fails with a 400), **RO-3** (no "new registrations this quarter" or "sacraments this year" figure anywhere Tony looked).

**Verdict:** Ready with fixes

## Mission results

| Mission | Result | Time | Findings | Notes |
|---|---|---|---|---|
| RO-1 The quarterly numbers | PASS WITH ISSUES | 3 min | RO-3 | Households and members per GKK found and consistent. No quarter or sacraments-this-year figure found. |
| RO-2 "Who changed this?" | PASS | 1 min | RO-5 | Search "Pasaol" gave one entry: "Verified the household · Joel Pasaol Family · daveendev07@gmail.com · Oct 8, 2026". |
| RO-3 Census progress | FAIL | 1 min | RO-2 | Summary tiles show "—"; progress request returns 400 (twice, also on Dashboard). Gkk-leader comparison not done (no gkk-leader result file). |
| RO-4 Requests and website | PASS | 2 min | none | Both pages show a clear "view but not change" note; no edit buttons seen. |
| RO-5 On his phone | PASS | 1 min | none | At 390 × 844 the Dashboard cards (Households 489, Members 1849 …) are readable, no horizontal scroll seen. |
| RO-6 "Can I just get it in Excel?" | PASS WITH ISSUES | 1 min | RO-1 | A CSV export exists on Reports and it worked. |

## Findings

### RO-1 · P2 · Permission · Read-only account can download "Export CSV" on Reports

- **Where:** /admin/reports → Report Stats → Export CSV, mission RO-6
- **Steps:** 1. Sign in as read-only. 2. Open Reports. 3. Click Export CSV.
- **Expected:** The role definition says "No exports". The button should be hidden or disabled, or the role definition should say Reports exports are allowed.
- **Actual:** `report-statistics.csv` downloaded (85 lines). It holds aggregate figures (e.g. "Registration status by GKK"), not member rows. `/admin/exports` itself is correctly refused.
- **Evidence:** "Downloaded file report-statistics.csv"; no write request.
- **Suggestion:** Decide whether council members may take the statistics sheet. If yes, update the playbook and this is a good thing (it answers RO-6). If no, hide the button.
- **Seen before:** new
- **Code pointer:** pointer added after the run: not yet looked up.

### RO-2 · P1 · Bug · Census progress tiles empty; `census_household_progress` returns 400

- **Where:** /admin/census (tiles "Members confirmed", "Active", "Moved / deceased", "Households done"), also fires on the Dashboard; mission RO-3
- **Steps:** 1. Sign in. 2. Open Census (or the Dashboard). 3. Wait 3 s.
- **Expected:** Overall progress numbers.
- **Actual:** All four tiles show "—". Console: 2 errors per load; request `POST /rest/v1/rpc/census_household_progress?select=progress&order=household_id.asc&offset=0&limit=1000` → 400, `proxy-status: PostgREST; error=42703` (undefined column). The same RPC with `select=household_id,household_name,head_name,ref_no,gkk,progress` returns 200.
- **Evidence:** network requests #927/#933 in the session; console log.
- **Suggestion:** Check whether the demo project is missing a migration, or the client selects a column the RPC does not return. Check whether other roles see the same.
- **Seen before:** new
- **Code pointer:** pointer added after the run: not yet looked up.

### RO-3 · P2 · Gap · No "new registrations this quarter" or "sacraments this year" figure

- **Where:** Dashboard, Reports (Report Stats), mission RO-1
- **Expected:** Tony needs both for the quarterly council report.
- **Actual:** Dashboard and Report Stats show totals, verified/pending, families and sacrament completion shares only. I did not open "Generate Report" or "Analysis Report", which may offer this, so treat as unconfirmed.
- **Suggestion:** Add a date-range count of new registrations and of sacraments received, or point to where it lives.
- **Seen before:** new

### RO-4 · P3 · Friction · Dashboard figures cannot be traced to a list without extra clicks (partly)

- **Where:** Dashboard cards link to lists ("Open the list"); the GKK chart bars show "Other (8 GKKs): 845 members (46%)" with no per-GKK numbers for those 8.
- **Suggestion:** Show all 16 GKKs or a "show all" control. Reports has per-GKK household counts but not member counts.

### RO-5 · P3 · Privacy · Staff email addresses visible to a read-only user

- **Where:** Households → "Verified by" column shows "Verified by daveendev07@gmail.com" on some rows and "a staff member" on others; Activity log shows staff emails as actors and in "Added the staff account" entries.
- **Expected:** Consistent. If emails are meant to be private from read-only users, hide them; for an auditor the Activity log showing who is likely intended.
- **Seen before:** new

## Boundary checks

| Check | Expected | Actual | Result |
|---|---|---|---|
| Household list "More actions" menu | no change actions | only "Print record" | PASS |
| Household View panel | no edit/verify/delete | none seen | PASS |
| Edit a member, verify a sacrament | none / refused | not tried | NOT TESTED |
| Census answers, census codes | none | Census page note: "Your account can view this page but not change it." Codes not looked for beyond that | PARTIAL |
| New website item, request status change | none | none seen on Requests and Website; both show the view-only note | PASS |
| `/admin/exports` | refused | "Not available for your account" | PASS |
| `/admin/settings/trash` | refused | "Not available for your account" | PASS |
| Reports → Export CSV | refused (role says no exports) | downloaded aggregate CSV | FAIL (see RO-1) |
| GKK documents (Parish Config) | not visible | Settings menu lists only My Account, Notifications, Activity log; Parish GKK not reachable | PASS |
| Network | no successful POST/PATCH/DELETE write | no PATCH/DELETE/PUT; no non-RPC POST; RPC POSTs were reads | PASS |

## Not covered

Member edit and sacrament verification attempts, the Sacraments page, Generate/Analysis reports, print views (print dialogs not opened), Census codes, the "Online updates" tab, reload-to-confirm after an attempted change (no change was attempted), and the gkk-leader comparison in RO-3.

## Cleanup

- **Created:** nothing in the database. Downloaded `report-statistics.csv` locally (deleted).
- Signed out: yes. Viewport reset: yes.
