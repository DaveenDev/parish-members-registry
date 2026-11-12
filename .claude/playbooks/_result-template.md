# <Role> run — YYYY-MM-DD

<!-- Copy to results/<role>-run-YYYY-MM-DD-result.md and fill in as you go. -->

| | |
|---|---|
| Playbook | `.claude/playbooks/<role>.md` |
| Persona | <name, one line> |
| Account | <email only, never the password> / not signed in |
| App | http://localhost:<port> (local dev server) |
| Database | dev (local, 127.0.0.1:54321) / demo (`qyoyuukpdjrwfhovtrwd`), Demo banner seen: yes / no |
| Browser / widths | built-in browser / Playwright MCP; 390 × 844 and 1440 × 900 |
| App version | <from the admin sidebar, or client/package.json> |
| Run tag | PB<MMDD><code> |
| Started / finished | HH:MM / HH:MM (Asia/Manila) |

## Summary

<3–6 sentences for a busy parish coordinator: could this person do their job
with the app? What worked well? The top three things to fix, by ID.>

**Verdict:** Ready / Ready with fixes / Not ready for this role

## Mission results

| Mission | Result | Time | Findings | Notes |
|---|---|---|---|---|
| XX-1 <short name> | PASS / PASS WITH ISSUES / FAIL / BLOCKED / SKIPPED | 4 min | XX-2 | <one line> |

## Findings

### XX-1 · P1 · Bug · <short title>

- **Where:** <URL> → <screen / tab / button>, mission XX-n step n
- **Steps:** 1. … 2. … 3. …
- **Expected:** <what the persona expected>
- **Actual:** <what happened>
- **Evidence:** <console error text, request + status, or "screenshot taken">
- **Suggestion:** <what would fix or improve it>
- **Seen before:** <earlier result file, or "new">
- **Code pointer:** <file:line, "pointer added after the run", or blank>

<!-- One block per finding, most severe first. -->

## Improvement ideas

<Suggestions that aren't faults, each with the persona's reason and how much
it would help. Keep the big ones as findings of type Suggestion instead.>

## Boundary checks

| Check | Expected | Actual | Result |
|---|---|---|---|
| <e.g. open /admin/settings/staff> | <refused / hidden> | <what happened> | PASS / FAIL |

## Think-aloud notes

<The short running notes from §1 of _shared.md, trimmed to what explains a
finding or a good moment.>

## Cleanup

- **Created:** <every record with the run tag: type, name / reference no.>
- **Removed:** <which, and how>
- **Left for staff admin:** <tagged records this role couldn't remove>
- Signed out: yes / no. Viewport reset: yes / no.
