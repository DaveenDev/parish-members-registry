# Role playbook — Staff admin (manages staff accounts)

| | |
|---|---|
| Access level | `full` with `is_admin = true` |
| Signs in at | `/admin/login` |
| Account | Always the `staff-admin` entry in `accounts.local.json` (`staffadmin@gmail.com`, Full access, staff admin). Read the password from that file only; never copy it into this playbook, a result file or chat. If the sign-in fails, ask the user. |
| Device | office desktop (1440 × 900) |
| Time budget | about 50 minutes (SA-0 alone: 10–15) |
| Run tag | `PB<MMDD>SA` · findings `SA-1`, `SA-2` … |
| Result file | `results/staff-admin-run-YYYY-MM-DD-result.md` |

Read [`_shared.md`](_shared.md) first. Everything a full-access account can
do, this account can too; this playbook covers only what is **extra** (the
full-access playbook covers the rest).

## Persona

**Sir Arnel Lim**, 47, a retired bank supervisor
who volunteers as the parish office manager. He sets up the accounts for the
secretary, the website volunteer, the priests and about twenty GKK leaders,
one per GKK, before the census training. Careful, methodical, a bit worried
about "who can see what." He'll do the GKK leaders in one sitting.

## What the role should allow

Settings → **Staff**: add, reset, disable, enable, delete staff accounts and
set their access (the `manage-staff` Edge Function), the bulk "add GKK
leaders" sheet and the GKK coverage view, plus the **Platform Integrations**
tab in Parish Config.

## Missions

### SA-0 · Set up the playbook accounts (run first, once)

Create each missing account in `accounts.local.json` on the **demo** site:

| Key | Email | Access | Notes |
|---|---|---|---|
| full-access | `pb.full@example.test` | Full access | not a staff admin |
| read-only | `pb.readonly@example.test` | Read only | |
| gkk-leader | `pb.leader@example.test` | GKK leader | pick a demo GKK with households; write its name in the file |
| website-staff | `pb.website@example.test` | Website & requests | |
| clergy | `pb.clergy@example.test` | Clergy | |

- For each: Settings → Staff → **Add staff**, fill in, save, and copy the
  temporary password from the dialog **straight into `accounts.local.json`**
  (never into the result file or chat).
- **No-access account:** the Staff page can't make one (every account it
  makes gets an access level). Ask the user to add `pb.noaccess@example.test`
  in the demo project's Supabase dashboard (Authentication → Add user); it
  then shows on the Staff page as *Waiting for access*. Or mark the no-access
  playbook `BLOCKED`.
- Even SA-0 is a test: note anything clumsy (it's what Arnel does twenty
  times).

### SA-1 · Twenty GKK leaders in one sitting

- Open the bulk add-leaders sheet. Fill two rows with tagged throwaway
  leaders (`Leader A PB<MMDD>SA`, `pb.leader-a.<MMDD>@example.test`, and one
  more). Leave one row half-filled and one with a bad email to see the
  errors. Save.
- Look at the GKK coverage: which GKKs now have a coordinator?
- **Watch for:** temporary passwords: how does he hand twenty of them out
  (copy all, print)? Errors point at the row; the half-filled row is not
  silently skipped.

### SA-2 · Find, filter, sort

- Use the filter chips (GKK leaders, Never signed in, Disabled …), search by
  GKK name, sort by last sign-in. Download the staff CSV (ask the user before
  saving it).
- **Watch for:** counts on the chips match the list; the CSV has no passwords.

### SA-3 · A leader forgot the password

- Reset the password of throwaway leader A. Sign in as them in a second tab
  (or after signing out) with the new temporary password; it should ask for
  a new password. Sign out and back in as the admin.
- **Watch for:** does the old password stop working? Is "Forgot password?"
  on the sign-in page an alternative, and does the Staff page say so?

### SA-4 · Someone leaves

- Disable throwaway leader A. Try to sign in as them: refused with a clear
  message? Re-enable, then delete throwaway leader B.
- **Watch for:** does disabling warn that their GKK becomes uncovered? Does
  delete say what happens to their activity history? Confirmation dialogs
  name the person.

### SA-5 · Change someone's access

- Change throwaway leader A from GKK leader to Read only and back to GKK
  leader for another GKK. Sign in as A and check what they see now.
- **Watch for:** does a change take effect for an already-signed-in user,
  or only after sign-out? Is that explained?

### SA-6 · Make another admin, then undo it

- Tick "Staff admin" on throwaway leader A (it should force Full access),
  save, then untick and restore GKK leader. Try to remove the admin flag from
  **his own** account: what stops him?
- **Watch for:** a warning before un-admining yourself; you can't end up with
  no staff admin.

### SA-7 · Platform Integrations

- Open Parish Config → Platform Integrations. Read only: **don't change any
  setting**. Note whether each integration says what it's for and whether
  it's working.

### SA-8 · Demo account rules

- If a Demo access account exists, open it on the Staff page. Check that it
  can't be made a staff admin and that the reset-password flow says only a
  staff admin can change its password.

## Boundary checks

| Check | Expected |
|---|---|
| A non-admin (full-access run) on `/admin/settings/staff` | refused (cross-check that run's result) |
| Self-demotion leaving zero admins | refused |
| Temporary password shown again later | no, only once |
| Staff list exposes passwords anywhere (page, CSV, network) | never |

## Cleanup

Delete both throwaway leaders (A, B). Keep the SA-0 playbook accounts. Sign
out.
