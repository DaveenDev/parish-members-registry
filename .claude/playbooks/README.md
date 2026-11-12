# Role playbooks

One playbook per kind of person who uses the app. In each one, Claude drives
the built-in browser **as that person would**: starting where they start,
clicking what's on the screen, reading the wording as they would. The
goal is to find bugs, gaps (things the person needs and can't do), friction,
and ideas for improvement, and write them up in one result file per run.

These are different from `docs/beta-testing/`, which are step-by-step scripts
for human testers, one per screen. These are organised by **person and job**,
and they look at the whole journey and where it breaks.

## Set up first (once)

```bash
npm run install:all
npm run db:dev:up      # local dev Postgres in Docker, all migrations applied
npm run db:dev:seed    # sample households + role accounts, app pointed at it
```

The browser tool is the built-in browser, or the Playwright MCP server that
`.mcp.json` declares (approve it when asked). Details in
[`_shared.md`](_shared.md) §0.

## How to run one

Ask Claude, for example:

> Run the gkk-leader playbook.

Claude reads [`_shared.md`](_shared.md) (setup, safety, how to drive, how to
report), then the role file, runs the missions on the local app against the
**dev** database (or the shared demo one), and writes:

```
.claude/playbooks/results/<role>-run-YYYY-MM-DD-result.md
```

(`-2`, `-3` … for a second run on the same day). The layout is in
[`_result-template.md`](_result-template.md).

**Before the first staff-role run:** `npm run db:dev:seed` already creates the
role accounts and fills `accounts.local.json`. On the shared demo site instead, copy `accounts.example.json` to
`accounts.local.json` (gitignored) and fill it in, or run the staff-admin
playbook's mission SA-0, which creates the role accounts on the demo site.

## The roles

| Playbook | Who | Signs in | Device | Time |
|---|---|---|---|---|
| [public-visitor](public-visitor.md) | A parishioner using the parish website | no | phone | 35 min |
| [registering-family](registering-family.md) | A household head registering the family online | no | phone | 40 min |
| [census-family](census-family.md) | A family updating their record during the census | reference no. + access code at `/census` | phone | 30 min |
| [gkk-leader](gkk-leader.md) | A GKK census coordinator (GKK leader access) | `/admin/login` | phone + laptop | 60 min |
| [full-access](full-access.md) | The parish secretary (Full access, not a staff admin) | `/admin/login` | desktop | 75 min |
| [staff-admin](staff-admin.md) | The parish office head who manages staff accounts | `/admin/login` | desktop | 50 min |
| [website-staff](website-staff.md) | The volunteer who runs the website and the requests queues | `/admin/login` | desktop + phone | 50 min |
| [clergy](clergy.md) | A parish priest | `/admin/login` | tablet / desktop | 40 min |
| [read-only](read-only.md) | A parish council member or auditor | `/admin/login` | desktop | 30 min |
| [demo-visitor](demo-visitor.md) | Someone from another parish trying the demo site | "Login to Demo Site" | desktop | 35 min |
| [no-access](no-access.md) | A new login no one has given access yet | `/admin/login` | phone | 15 min |

The access levels and what each may do are defined in
`client/src/lib/access.js` (`ACCESS_LEVELS`, `RULES`) and the sidebar in
`client/src/components/adminNav.js`. The database enforces the same rules.

A good order for a full round, because later roles use what earlier ones
create: staff-admin (SA-0 accounts) → public-visitor → registering-family →
gkk-leader → census-family → website-staff → clergy → full-access →
read-only → demo-visitor → no-access.

## Safety in one paragraph

Local app, dev or demo database only, never live (the purple **Demo site**
banner must show). The dev database is yours to reset; the demo one is shared
with other parishes, so no wipes there: tag everything
you create with the run tag (`PB<MMDD><code>`) and clean it up. Fictional
people and `0917 555 01xx` numbers only, never send a real message, never
write a password anywhere. Details in `_shared.md` §2–§4.

## Other files here

- `staff-journey-playbook.md` and `staff-journey-results/`: the older, deep
  role-boundary audit from 2026-10-01 (direct REST/RPC probes, disabled
  accounts). It **wipes the database** at the start, which no longer suits
  the shared demo site; ask the user before running it.
- `results/`: one file per run of these role playbooks.
