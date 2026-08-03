# Browser beta testing playbooks

Scripted walkthroughs for testing the Parish Members Registry in a real browser,
written for people who are not developers. Each playbook covers one area of the
app, gives you exact steps, and tells you what should happen.

You do not need to know how the app is built. You need a browser, an account,
and a willingness to write down anything that looks wrong.

| # | Playbook | Who it is for | Time |
|---|---|---|---|
| 1 | [Public registration](01-public-registration.md) | Anyone — this is the parishioner's view | 30–40 min |
| 2 | [Admin access & navigation](02-admin-access.md) | Parish staff | 20 min |
| 3 | [Households](03-households.md) | Parish secretary | 30 min |
| 4 | [Members & sacraments](04-members-sacraments.md) | Parish secretary | 35 min |
| 5 | [Ministries, organizations & parish config](05-config.md) | Parish coordinator | 30 min |
| 6 | [Reports & exports](06-reports-exports.md) | Anyone producing parish reports | 25 min |
| 7 | [Cross-cutting checks](07-cross-cutting.md) | One tester per device/browser | 40 min |

Supporting material:

- [Bug report template](bug-report-template.md) — copy this for every issue
- [Run log template](run-log-template.md) — the record of one testing round
- [Test data reference](test-data.md) — the sample records and what they cover

---

## Before you start

### 1. Get a test environment

**Never run beta testing against the live parish register.** Everything in these
playbooks creates, edits and deletes records.

Ask whoever set up the app for the beta URL and a staff login. If you are running
it yourself:

```bash
npm run install:all
npm run db:setup      # schema + pick-lists + a first staff account
npm run db:demo       # six sample households so the screens have content
npm run dev
```

- Registration portal — <http://localhost:5173/>
- Admin panel — <http://localhost:5173/admin/login>

Default staff sign-in is `admin@parishregistry.org` / `ParishAdmin123!` unless
`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` were changed in `server/.env`.

### 2. Reset between rounds

```bash
npm run db:reset -- --yes     # empties households and members, keeps staff and pick-lists
npm run db:demo               # reload the sample records
```

Run this before a full pass so counts in the playbooks match what you see.

### 3. Pick your browser and viewport

Each round should cover, between all testers:

| Browser | Version | Platform |
|---|---|---|
| Chrome | current + previous | Windows / Android |
| Edge | current | Windows |
| Firefox | current | Windows / macOS |
| Safari | current | macOS |
| Safari | current | iOS (iPhone) |
| Chrome | current | Android phone |

And these widths (use your browser's device toolbar, or a real device):

| Width | Stands for | Why it matters |
|---|---|---|
| 360 px | Budget Android phone | Most parishioners register on one of these |
| 390 px | iPhone | Most common phone size |
| 768 px | Tablet / small laptop | The admin sidebar is still a drawer here |
| 1024 px | Laptop | The admin sidebar appears at this width |
| 1440 px | Desktop | Parish office monitor |

Note in the run log which combination you used. A bug that only appears on
Safari at 390 px is still a bug, but nobody can reproduce it if you do not say so.

---

## How to run a playbook

Each check has an ID (`PR-04`, `HH-11`, …), steps, and an expected result.

1. Work through the checks **in order** — later ones often depend on earlier ones.
2. After each check, mark it **Pass**, **Fail** or **N/A** in the run log.
3. On a failure, keep going. Do not stop the whole playbook for one broken check
   unless it blocks everything after it (say so in the log if it does).
4. File one bug report per distinct problem, using the ID in the title:
   `[HH-11] Deleting a household leaves its members in the directory`.

### What counts as a bug

File it if any of these are true:

- What happened does not match the **Expected** text.
- Something is unreadable, cut off, overlapping, or impossible to tap on your device.
- An error message is technical, blames you, or tells you nothing useful.
- You lost data you had typed.
- Something took more than ~5 seconds with no spinner or feedback.
- You could not tell whether an action worked.

Also file it if the app worked but the wording is wrong for a parish — wrong
term, wrong tone, wrong language. Those matter here.

### Severity

| Level | Meaning | Example |
|---|---|---|
| **S1 Blocker** | The task cannot be completed at all | Registration cannot be submitted |
| **S2 Major** | Wrong data, or a workaround is needed | A verified household shows as pending |
| **S3 Minor** | Annoying but the task completes | Search needs two tries to update |
| **S4 Cosmetic** | Looks wrong, works fine | A heading wraps awkwardly at 360 px |

Data loss, wrong data shown to staff, and anything that exposes one family's
details to the public portal are **always S1 or S2** regardless of how small the
trigger looks.

---

## Exit criteria for a beta round

A round is complete when:

- Every playbook has been run once on desktop and once on a phone.
- Playbooks 1 and 2 have been run on every browser in the matrix — those are
  the two paths every user hits.
- No open S1 bugs.
- No open S2 bugs, or each has a written decision to ship with it.
- The run log is filled in and attached to the round's ticket or issue.

## A note on automated tests

These playbooks cover what a person sees in a browser. The API and the
calculation logic behind it are covered by the automated suite — run
`npm test` before a beta round so testers are not chasing something already
caught by a failing test. See [`docs/testing.md`](../testing.md).
