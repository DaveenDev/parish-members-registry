# Staff admin run — 2026-11-12

| | |
|---|---|
| Playbook | `.claude/playbooks/staff-admin.md` |
| Persona | Sir Arnel Lim, parish office manager |
| Account | fullstaff@gmail.com |
| App | http://127.0.0.1:5173 (local dev server) |
| Database | demo (`qyoyuukpdjrwfhovtrwd`), Demo banner seen: yes; network requests go to qyoyuukpdjrwfhovtrwd.supabase.co |
| Browser / widths | Playwright MCP (headless Chromium); 1440 × 900 |
| App version | v1.3.0 |
| Run tag | PB1112SA |

## Summary

Could not run: the account provided (fullstaff@gmail.com) signs in fine on the demo site but is **Full access, not a staff admin**. Settings shows only the Parish Config, Parish GKK and Personal Settings tabs (no Staff, no Platform Integrations), and opening `/admin/settings/staff` shows "Not available for your account. Your access level is Full access. Ask a staff admin if you need this page." Every mission needs the Staff page, so all are BLOCKED. Nothing was created or changed on the demo database. A staff-admin account is needed (or this account must be made a staff admin from the demo Supabase dashboard / by an existing admin).

**Verdict:** Not ready to assess for this role (blocked)

## Mission results

| Mission | Result | Time | Findings | Notes |
|---|---|---|---|---|
| SA-0 to SA-8 | BLOCKED | 5 min | SA-2 | Account is not a staff admin; Staff page refused |

## Findings

### SA-1 · P2 · Bug · Dashboard RPC `census_household_progress` returns 400

- **Where:** /admin (Dashboard) right after sign-in
- **Expected:** dashboard loads with no failed requests
- **Actual:** two `POST .../rest/v1/rpc/census_household_progress` calls returned 400 (console errors)
- **Evidence:** console error log, 2 occurrences
- **Seen before:** new
- **Code pointer:** pointer added after the run

### SA-2 · P3 · Copy · Staff-admin account used for the run lacks the admin flag

- **Where:** Settings (no Staff tab); `/admin/settings/staff`
- **Actual:** refusal message is clear and names the access level, but the playbook's account was not an admin.
- **Suggestion:** provide a real staff-admin account for `accounts.local.json`.
- **Seen before:** new

## Boundary checks

| Check | Expected | Actual | Result |
|---|---|---|---|
| Non-admin (Full access) opens /admin/settings/staff | refused | "Not available for your account" message, no data shown | PASS |
| Demo banner and demo project | banner + qyoyuukpdjrwfhovtrwd | both seen | PASS |

## Cleanup

- Created: nothing
- Signed out: yes. Dev server stopped.
