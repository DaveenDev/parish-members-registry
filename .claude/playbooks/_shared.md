# Shared rules for every role playbook

Every playbook in this folder points here first. Read this whole file before
step 1 of any role playbook. The role file says **who** you are and **what**
you try to do; this file says **how** to do it, how to stay safe, and how to
write the result.

---

## 0. Set up once per machine (browser tool + dev database)

Do this before the first run. Both steps are repeatable.

**Browser tool.** The playbooks drive a real browser. The built-in browser
(`mcp__Claude_Browser__*`) needs nothing installed. Otherwise use the
Playwright MCP server, which `.mcp.json` at the repo root already declares
(`npx -y @playwright/mcp@latest`): approve the `playwright` server when
Claude Code asks, or run `claude mcp add playwright -- npx -y @playwright/mcp@latest`.
Check it with `/mcp`. Tool names differ, the steps do not:

| This file says | Playwright MCP |
|---|---|
| `screenshot` | `browser_take_screenshot` |
| `read_page`, `get_page_text` | `browser_snapshot` |
| `computer` click / type, `form_input` | `browser_click`, `browser_type`, `browser_fill_form` |
| `read_console_messages` | `browser_console_messages` |
| `read_network_requests` | `browser_network_requests` |
| `resize_window` | `browser_resize` |
| `preview_start` | start `npm run dev` in the background, then `browser_navigate` |

**Dev database.** A local, disposable Postgres (the Supabase stack in Docker,
with every migration applied), so a run never touches the shared demo site:

```bash
npm run install:all     # once
npm run db:dev:up       # start Postgres + auth + API on 127.0.0.1:54321/54322
npm run db:dev:seed     # sample households, role accounts, point the app at it
```

`db:dev:seed` writes the role accounts' sign-in details to
`accounts.local.json` and `client/.env.development.local` (both gitignored),
so SA-0 is not needed on this database. `npm run db:dev:reset` rebuilds it
from scratch at any time, `db:dev:down` stops it. It needs Docker. If Docker
is not available, fall back to the shared demo database (§2).

---

## 1. The idea: be the person, not the tester

You are not checking boxes. You are a real person with a real job to get done,
and the app is the tool they were given. A finding is anything that would make
that person stuck, confused, slow, wrong, or exposed.

- **Act like a human.** Start from the address that person would actually
  have (the parish website, a link the office texted them, the admin sign-in
  page). From there, move by **clicking what is on the screen**: links, menus,
  buttons. Type an address by hand only when the playbook says so, or when a
  real person would plausibly do it (a bookmarked page, a link a colleague
  sent, a curious "what if I try /admin/settings/staff?").
- **Read what is on the screen, the way they would.** If the persona reads
  Bisaya better than English, judge the wording as them. If a word is
  technical ("RLS", "cycle", "snapshot") and the persona would not know it,
  that is a finding.
- **Do not cheat with developer tools.** Don't fill forms or click buttons
  with `javascript_tool`, and don't read the source code to find out how to do
  a task. If you can't work out how to do something from the screen, that is
  the finding (type **Gap** or **Friction**). The only allowed uses of
  developer tools are listed in §5 (checking for errors after each mission).
- **Think aloud in your notes.** At each step jot one line: what you expected,
  what you saw, how sure you were about what to do next. These notes are what
  make a good result file.
- **Try the things real people do.** Double-click a submit button. Press
  Back halfway through a form. Leave a required field empty. Type a name with
  an ñ or an apostrophe (Peñaflor, D'Souza). Paste a mobile number with
  spaces. Rotate to a phone width. Reload in the middle of a task. Open the
  same thing in two tabs.
- **Each persona has a time budget.** If a mission takes much longer than
  the budget says, note where the time went.

---

## 2. Where to run: the local app on the dev database. Never the live site.

The app has no server of its own; the browser talks straight to a Supabase
project. **Default: the local dev database from §0** (`http://127.0.0.1:54321`),
which `client/.env.development.local` points the local app at. It is yours
alone, so you may wipe and reseed it (`npm run db:dev:reset`). **Fallback:**
the shared **demo** project (`qyoyuukpdjrwfhovtrwd`, set in `client/.env.local`)
when Docker is unavailable. The live parish project is `rmlkowkbonbrtaqocsvo`
and runs `guadalupe-muaan.vercel.app`.

**Before any step that changes data, prove you are not on the live site:**

1. Start the app with the built-in browser: `preview_start` with
   `{ "name": "app" }` (from `.claude/launch.json`; it picks a free port if
   5173 is taken). Never start the dev server through Bash with the built-in
   browser; with Playwright MCP, run `npm run dev` in the background.
2. On the first admin or public page, the purple banner **"Demo site: sample
   data only. Nothing here changes a real parish registry."** must be on
   screen (`client/src/components/DemoBanner.jsx`; it shows for any database
   but the live one, local included). For public-only roles, also check with
   `read_network_requests` that requests go to `127.0.0.1:54321` (dev
   database) or `qyoyuukpdjrwfhovtrwd.supabase.co` (demo).
3. **If there is no banner, or requests go to `rmlkowkbonbrtaqocsvo`,
   stop.** Write `BLOCKED: pointed at the live project` in the result file
   and tell the user. Never run a playbook against the live site, and never
   open `guadalupe-muaan.vercel.app` to "just look" as a staff role.

**On the dev database** you may reset freely. **On the shared demo
database** (other parishes try the app there and the parish trains staff on
it):

- **Do not wipe it.** Don't run `npm run db:wipe-test`, `db:reset` or any
  truncate. (The older `staff-journey-playbook.md` wipes; these playbooks
  don't.)
- **Work on your own records.** Tag everything you create with the run tag
  (§3) and change or delete only tagged records, unless a mission explicitly
  says to read or open someone else's.
- **Clean up at the end** (§7).

Use the built-in browser (`mcp__Claude_Browser__*`) unless the user asks for
another. If it is unavailable, use the Playwright MCP server from §0 (or
Claude in Chrome): the steps are the same, only the tool names differ.

---

## 3. The run tag and test data

Every record you create carries the run tag, so it can be found and removed:

```
PB<MMDD><role code>      e.g. PB1112GL for a GKK leader run on 12 November
```

| Role | Code | Role | Code |
|---|---|---|---|
| Public visitor | PV | GKK leader | GL |
| Registering family | RF | Website & requests | WR |
| Census family | CF | Clergy | CL |
| Staff admin | SA | Demo visitor | DV |
| Full access | FA | No access | NA |
| Read only | RO | | |

Put the tag in the **last name** of people you create (`Dela Cruz PB1112GL`),
in the **title** of website items, and in the **note / reason** field of
requests. Use only fictional data:

- Mobile numbers: `0917 555 01xx` (any two digits). Never a real number.
- Email: `<anything>@example.test`.
- Addresses: a real barangay and purok from the GKK pick-list are fine; house
  numbers are made up.
- Birthdays: any plausible date. Include at least one child under 7, one
  teenager, one senior over 60, so age-based screens have something to show.

**Never send a real message.** Recording a call or text in the app (donor
contact log, "notify" toggles) is fine. Actually dialing, texting, or
emailing a real person is not. Print buttons open the browser's print
dialog: press Escape, never print.

---

## 4. Accounts and signing in

Staff roles sign in at `/admin/login`. Their test accounts are listed in
`.claude/playbooks/accounts.local.json` (gitignored; the shape is in
`accounts.example.json`). Each entry is one account on the **demo** project
with the right access level.

- **Missing accounts:** on the dev database run `npm run db:dev:seed`; on
  the demo database run the account set-up mission in `staff-admin.md`
  (mission SA-0) first, or ask the user to create them in Settings → Staff on
  the demo site and fill in the file.
- **Never write a password into a result file, a commit, a screenshot
  caption, or the chat.** Read it from the file and type it into the sign-in
  form only.
- **If you may not type the password yourself** (your safety rules stop you,
  or the account isn't in the file), ask the user to sign in in the browser
  pane, wait until they say it's done, and carry on.
- A brand-new account is sent to **Change password** first. Choose a new
  test password, use it, and update `accounts.local.json` straight away.
- **Sign out at the end of every staff run** (and before switching to another
  role in the same browser), so the next run starts as a stranger.

The demo site's shared **"Login to Demo Site"** button only appears when
`VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD` are set in `client/.env.local`. If
it is missing, the demo-visitor playbook says what to do.

---

## 5. The loop for every mission

For each mission in a role playbook:

1. **Read the goal**, then put the playbook down and try to reach it from
   the screen alone, the way the persona would.
2. **Look**: `screenshot` (what a human sees) and `get_page_text` /
   `read_page` (to read text and find refs). Prefer `read_page` for finding
   what to click; take a screenshot when layout, colour or "does this look
   right" matters.
3. **Act** by clicking and typing with `computer` / `form_input`. After a
   page change, take a fresh `read_page`: old refs go stale.
4. **Check the result** the way a human would: did a message appear, did the
   row show up, does it **survive a reload**?
5. **After the mission, check the plumbing** (this is the one allowed use of
   developer tools):
   - `read_console_messages` with `onlyErrors: true`: any red error is a
     finding, even if the page looked fine.
   - `read_network_requests`: any `4xx`/`5xx` you didn't expect is a finding.
     A refused permission is `401`/`403`, or `200` with `[]`. For "must not
     see" checks, a `200` with rows of someone else's data is a **P0 leak**.
6. **Write the result line** for the mission (§6) before starting the next.

**Phone first for phone people.** Parishioners, census families and GKK
leaders mostly use phones. Run their missions at **390 × 844**
(`resize_window` with `width: 390, height: 844`), then repeat the most
important one at desktop width. Staff office roles run at desktop width
(1440 × 900) and repeat one mission at phone width. Always reset with
`resize_window { preset: "desktop" }` at the end.

**Stuck?** Give it a real try (about as long as the persona would), then
note it as a finding, take the shortest way past it, and keep going. A
blocked mission is still a result.

---

## 6. The result file

Write one result file per run, starting it before mission 1 and filling it in
as you go (so a crashed run still leaves something):

```
.claude/playbooks/results/<role>-run-YYYY-MM-DD-result.md
```

`<role>` is the playbook's file name without `.md` (`gkk-leader`,
`public-visitor`, …), and the date is today's. A second run of the same role
on the same day adds `-2`, `-3`: `gkk-leader-run-2026-11-12-2-result.md`.

Copy the layout from `_result-template.md`. It has:

- **Run header**: date, role, persona, account (email only), app URL and
  port, database (must say demo), browser and widths, app version (shown in
  the admin sidebar, or `client/package.json` for public-only roles), run tag.
- **Summary**: a few sentences a busy parish coordinator would read: could
  this person do their job, and the top three things to fix.
- **Mission results**: one row per mission: `PASS`, `PASS WITH ISSUES`,
  `FAIL`, `BLOCKED` or `SKIPPED`, time taken, and finding IDs.
- **Findings**: each with an ID (`<CODE>-<n>`, e.g. `GL-3`), severity, type,
  where, steps, expected vs actual, evidence, and a suggestion.
- **Boundary checks**: what this role must not see or do, and what happened.
- **Cleanup**: what was created and whether it was removed.

**Severity**

| | Meaning |
|---|---|
| **P0** | Data leak, someone sees or changes what their role must not, data lost or corrupted. Stop and tell the user at once. |
| **P1** | The persona cannot finish a core task, or a wrong result looks right. |
| **P2** | The task can be done but with a workaround, real confusion or a lot of wasted time. |
| **P3** | Polish: wording, layout, small inconsistency. |

**Type**: `Bug` (it does the wrong thing), `Gap` (it can't do something the
persona needs), `Friction` (it works but is hard or slow), `Copy` (wording,
translation, jargon), `Mobile`, `A11y` (keyboard, contrast, screen-reader
labels, tap target size), `Performance` (more than ~3 s with no feedback),
`Permission` (a role boundary is wrong, either way), `Suggestion` (an
improvement idea, not a fault).

**Suggestions are welcome and expected.** For each one, say what the persona
was trying to do, what would have helped, and how much it matters. After the
run you may search the code to add a `file:line` pointer to a finding; mark
it "pointer added after the run".

Before writing a new finding, skim the previous result files for this role in
`results/` and say "seen before in <file>" when it repeats, so recurring
problems stand out.

---

## 7. Cleanup

At the end of each run:

1. Delete or trash every record tagged with the run tag that the role is
   allowed to delete. Roles that can't delete (read only, clergy, GKK
   leader for some records) list their records in the result file under
   **Cleanup → left for staff admin**, with the tag, so a full-access run or
   the user can remove them.
2. Withdraw or mark done any test requests you submitted, if the role can.
3. Sign out. Reset the viewport (`resize_window { preset: "desktop" }`).
4. Leave the dev server running only if the user is still working with you;
   otherwise `preview_stop` it.

The result file and nothing else goes into `results/`. Screenshots stay in
the session unless the user asks for them.

---

## 8. Commit

When the user's session rules say to commit after a task, commit the result
file only (it's under `.claude/`, which is git-excluded here, so it needs
`git add -f`). Never push.
