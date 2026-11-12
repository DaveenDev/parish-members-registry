# Website & requests staff run — 2026-11-12

| | |
|---|---|
| Playbook | `.claude/playbooks/website-staff.md` |
| Persona | Paolo, 24, youth ministry volunteer and parish media person |
| Account | web@gmail.com (access level shown as "Website & requests") |
| App | http://localhost:5173 (local dev server) |
| Database | demo (`qyoyuukpdjrwfhovtrwd`), Demo banner seen: yes |
| Browser / widths | Playwright MCP, headless Chromium, default desktop viewport only (no 390 px pass) |
| App version | client/package.json 1.0.0 |
| Run tag | PB1112WR |

## Summary

PARTIAL RUN. Only WR-1 and the boundary checks were done, plus the exports list from WR-9.
WR-2 to WR-8 were not run. The website role could write, draft, publish and delete an
announcement without trouble, and the public page showed it straight away. Every page this
role must not reach was refused with a clear message, and Exports offers only Requests files.
Nothing here is a leak. The two findings are small.

**Verdict:** Not enough covered to say. No blockers in the parts that ran.

## Mission results

| Mission | Result | Findings | Notes |
|---|---|---|---|
| WR-1 Announcement | PASS WITH ISSUES | WR-1, WR-2 | Draft, publish, public page and delete all worked. No photo tried, no scheduling tried, no phone check. |
| WR-2 Event and bulletin | SKIPPED | - | not run |
| WR-3 Mass schedule | SKIPPED | - | not run |
| WR-4 Certificates | SKIPPED | - | not run |
| WR-5 Prayers | SKIPPED | - | not run |
| WR-6 Blood request | SKIPPED | - | not run |
| WR-7 Office, Downloads, History | SKIPPED | - | not run |
| WR-8 Phone | SKIPPED | - | not run |
| WR-9 Requests export | PASS (partial) | - | Exports lists 5 Requests files only. Nothing downloaded. |

## Findings

### WR-1 · P3 · Gap · Announcements form has no Preview
Steps: Parish Website, Announcements, New announcement.
Expected: a way to preview the announcement before publishing (the playbook assumes one).
Actual: the form has only Cancel and Save. Draft then Publish is the only check, and the
public page is where it first shows.
Suggestion: a Preview button, or a link that opens the draft's public page for staff.

### WR-2 · P3 · Friction · "Show on the public website" is ticked by default
Expected: save as draft first is the safer path for a new volunteer.
Actual: the box is ticked on a new announcement, so one careless Save publishes it. Drafting
means knowing to untick it. The helper text under the box does explain it.
Suggestion: default to unticked, or make the Save button say "Save and publish".

## Boundary checks

| Check | Result |
|---|---|
| `/admin/census` | refused: "Not available for your account" |
| `/admin/reports` | refused |
| `/admin/settings/staff`, `/activity`, `/trash` | refused |
| `/admin/settings?tab=config` | shows My Account only |
| Exports | only the five Requests files |
| Edit a household or member | NOT CHECKED |

Method note: the admin addresses were reached by changing the route from the page script, not
by typing in the address bar. That is a small departure from the shared rules.

## Cleanup

- Announcement "Sunday Mass with Youth Choir PB1112WR": deleted. The app says it goes to the
  Trash for 3 months. Left for staff admin: empty it from the Trash if wanted.
- No requests were touched. Signed out. Browser viewport was never changed.
- The dev server is still running on port 5173.

## Setup notes

- The environment network policy blocked the demo host. `qyoyuukpdjrwfhovtrwd.supabase.co` was
  added to the Default environment's allowed hosts, with the user's approval.
- Login came from `.claude/playbooks/accounts.local.json`, which git ignores.
