# Website & requests staff run — 2026-11-12

| | |
|---|---|
| Playbook | `.claude/playbooks/website-staff.md` |
| Persona | Paolo, 24, youth ministry volunteer and parish media person |
| Account | not signed in (no `website-staff` entry: `accounts.local.json` is missing) |
| App | http://localhost:5173 (local dev server) |
| Database | demo (`qyoyuukpdjrwfhovtrwd`), Demo banner seen: yes |
| Browser / widths | Playwright MCP (headless Chromium), default viewport only |
| App version | client/package.json 1.0.0 |
| Run tag | PB1112WR |

## Summary

BLOCKED before mission 1. The app runs locally and is pointed at the demo project:
the purple Demo banner shows on `/admin/login`, and network requests go to
`qyoyuukpdjrwfhovtrwd.supabase.co` only (none to the live project). No data was changed.
The run stopped because there is no `website-staff` account to sign in with. The only
login available is the shared "Login to Demo Site" button, which is a different role
and would not test this one.

**Verdict:** Not run

## Mission results

| Mission | Result | Time | Findings | Notes |
|---|---|---|---|---|
| WR-1 to WR-9 | BLOCKED | - | - | no `website-staff` credentials |
| Boundary checks | BLOCKED | - | - | need the role's session |

## Findings

None recorded.

## Cleanup

Nothing was created. The dev server is still running on port 5173.

## Setup notes

- The environment's network policy blocked the demo host. `qyoyuukpdjrwfhovtrwd.supabase.co` was
  added to the allowed hosts of the Default environment, with the user's approval.
- `client/.env.local` came in with main (commit `d074aee`).
