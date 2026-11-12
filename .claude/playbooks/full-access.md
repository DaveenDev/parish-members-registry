# Role playbook — Full access (parish secretary)

| | |
|---|---|
| Access level | `full`, **not** a staff admin (`is_admin = false`) |
| Signs in at | `/admin/login` |
| Account | `full-access` in `accounts.local.json` |
| Device | office desktop (1440 × 900); one mission at phone width |
| Time budget | about 75 minutes |
| Run tag | `PB<MMDD>FA` · findings `FA-1`, `FA-2` … |
| Result file | `results/full-access-run-YYYY-MM-DD-result.md` |

Read [`_shared.md`](_shared.md) first. If the browser tool or dev
database are not set up yet, do §0 there (`npm run db:dev:up && npm run db:dev:seed`).

## Persona

**Ms. Marites Ocampo**, 38, the parish secretary for six years. She used to
keep the registry in Excel and a big logbook. She is fast with a keyboard,
does five things at once (walk-ins, phone calls, the priest asking for a
list), and gets annoyed by extra clicks. Monday is the busy day: weekend
registrations to verify, certificate requests, and the GKK leaders calling
about the census.

## What the role should allow

Everything in the admin panel **except** the staff-admin items: Settings →
Staff and the Platform Integrations tab of Parish Config. That includes
deleting records, managing lists (ministries, organizations, GKKs), the
census schedule (start / close / reopen), exports, the activity log and
trash.

## Missions

### FA-1 · Monday morning

*"What needs me today?"*

- Sign in. From the dashboard and the sidebar badges alone, list what is
  waiting: households to verify, duplicates, sacrament claims, census
  updates, requests.
- **Watch for:** do the badge numbers match what each page shows? Can she
  get from a number to the list behind it in one click? Anything that needs
  her but has no badge?

### FA-2 · Verify the weekend registrations

- Open Households, filter to awaiting verification, open a tagged one (from
  a registering-family run, `Villanueva PB…RF`, or create one in FA-3 first).
  Check details, fix one typo, verify it.
- **Watch for:** the information she needs to verify (who registered, when,
  what's missing) on one screen; verify is reversible; the badge drops; the
  family's status check (`/serbisyo/susiha`) now says verified.

### FA-3 · A walk-in family

*"Sir, I don't have a smartphone, can you register us?"*

- Create a new household for a walk-in family (`Bautista PB<MMDD>FA`, four
  members) as fast as she can, using the keyboard as much as possible (Tab,
  Enter). Time it.
- Then print the household sheet (Escape on the dialog).
- **Watch for:** keyboard flow (focus order, Enter submits, no mouse-only
  controls); defaults that save typing; does it warn if the family already
  exists?

### FA-4 · Find a person fast

*"Father is on the phone: is Maria Clara Reyes confirmed?"*

- Use the search (and the command palette if there is one, e.g. Ctrl+K) to
  find a member by part of a name and read their sacraments. Try a
  misspelling, a name with ñ, and a nickname.
- **Watch for:** search speed and tolerance; the answer visible without
  opening three panels.

### FA-5 · Sacrament verification

- Open Sacraments, find a claim waiting to be verified on a tagged member,
  verify it (with the book/page reference if asked), then take it back.
- **Watch for:** what "verify" records (who, when, register book details);
  undo; the member detail shows it.

### FA-6 · Duplicates

- Open possible duplicates (members and households). Merge or dismiss
  **only pairs where both records are tagged** (make a tagged pair: add
  `Bautista PB…FA` again with the same head and birthday). Look at untagged
  pairs without acting.
- **Watch for:** is it clear which record wins and what's kept from the
  other? Is a merge undoable (trash, activity log)?

### FA-7 · Census office work

- Open Census. Look at progress by GKK, the online updates queue, and get a
  census code for a tagged household. **Don't start, close or reopen a
  census** on the shared demo site unless the user agrees in chat; if they
  do, open a census, note the steps, and close it again at the end.
- **Watch for:** progress numbers agree with the GKK leaders' view
  (gkk-leader run); "Results by GKK" opens one GKK as its leader sees it.

### FA-8 · Rosters and organization structure

- Add a tagged member of `Bautista PB…FA` to a ministry and an organization.
  Look at the ministry roster and the Organization Structure page.
  Add a tagged ministry in Settings → Ministries & organizations, rename it,
  delete it.
- **Watch for:** rename carries members; deleting an in-use group is
  refused or warned; roster printable.

### FA-9 · Reports for the council

- Generate the report the council would ask for: households and members per
  GKK, sacraments by age, OFW households, activeness. Print preview (Escape).
- **Watch for:** totals that disagree with the dashboard; a report with no
  date or no title; charts that don't print.

### FA-10 · Exports

- Open Exports and look at what can be downloaded. **Ask the user before the
  first download** (name the file); if they agree, download one CSV and
  check it opens and has sensible columns (no internal ids, dates readable).
- **Watch for:** what each export contains is described before downloading;
  privacy warning for whole-registry files.

### FA-11 · Trash and activity log

- Delete the tagged walk-in household from FA-3. Find it in Trash, restore
  it, delete it again. Find all three actions in the Activity log with her
  name.
- **Watch for:** delete asks for confirmation and says what goes with it
  (members); restore brings members back; the activity log names her, not
  "unknown".

### FA-12 · Phone check

- At 390 × 844, repeat FA-4 (find a person) and verify one household.
- **Watch for:** tables that scroll sideways without a hint; buttons under
  the fold; the drawer menu.

## Boundary checks

| Check | How | Expected |
|---|---|---|
| Staff accounts | sidebar, then type `/admin/settings/staff` | not in the menu; page says staff admins only; no `manage-staff` call returns a list |
| Platform Integrations | `/admin/settings?tab=integrations` | tab absent |
| Make herself admin | Personal Settings | no such option |

## Ten minutes of free exploring

As Marites on a quiet Friday afternoon: the things she'd poke at to see if
the app can replace her Excel file. Is there something she did in Excel that
she can't do here? That's the most valuable finding of the run.

## Cleanup

Trash every `PB<MMDD>FA` record, plus tagged records other runs left for
staff (see their result files' **Left for staff admin**), and say which in
this result file. Close any census she opened. Sign out.
