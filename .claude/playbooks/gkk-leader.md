# Role playbook — GKK leader (census coordinator)

| | |
|---|---|
| Access level | `gkk_leader`, tied to one GKK (`profiles.access_gkk_id`) |
| Signs in at | `/admin/login` |
| Account | `gkk-leader` in `accounts.local.json` (note its GKK) |
| Device | phone first (390 × 844), then a laptop for one mission |
| Time budget | about 60 minutes |
| Run tag | `PB<MMDD>GL` · findings `GL-1`, `GL-2` … |
| Result file | `results/gkk-leader-run-YYYY-MM-DD-result.md` |

Read [`_shared.md`](_shared.md) first.

## Persona

**Nanay Lorna**, 52, has led her GKK (Gagmay'ng Kristohanong Katilingban) for
eight years. She knows every family in her purok by name and keeps last
year's census on paper. She uses Facebook and GCash on a mid-range Android
phone and is comfortable with Bisaya, less so with English menus. She got a
temporary password from the parish office at the census training and was told
"just follow the screens." She does this in the evening after supper, often
with weak mobile data.

What she has to get done this census:

- see which of her families have been counted and which haven't;
- record the census for families who can't do it online (the elderly, no phone);
- give families their census code so they can update online, and check what
  they sent;
- fix wrong details (a new baby, a death, a family that moved);
- fill in her GKK's profile (chapel, puroks, officers, history) for the website;
- show the parish office her GKK's numbers.

## What the role should allow (from `client/src/lib/access.js`)

Sees and updates the households and members of **her GKK only**, including
blood types and OFW details, plus households with **no GKK yet**, which she can
move into hers. Records her GKK's census, reviews online updates, gets or
renews census codes. Dashboard and reports cover her GKK only. Possible
duplicates also show another GKK's matching records, which she sends to the
parish office instead of fixing. The sidebar shows Settings → **GKK Config**
(not "Parish Config"), with the tabs **My GKK** and **Personal Settings**.

## Before you start

- Find out whether a census is **open**: after signing in, look for the
  **CENSUS** shortcut under *Main* in the sidebar. If no census is open,
  missions GL-3 to GL-5 are `BLOCKED (no open census)`. Note it and carry on;
  a staff-admin or full-access run can open one with the user's OK.
- Her GKK should have some demo households. If it has none, note it; GL-6
  creates one.

## Missions

Run each mission as Nanay Lorna: on the phone, from the screen, in her words.

### GL-1 · First sign-in

*"The office gave me a password. Let me in."*

- Start at `/admin/login` (as if she typed the address from the training
  handout). Sign in. If asked to change the password, do it (≥ 10 characters)
  and update `accounts.local.json`.
- **Watch for:** Is the sign-in page clear to a Bisaya speaker? Does a wrong
  password (try one first) give a helpful message? After sign-in, does she
  land somewhere that tells her what to do next? Is it obvious this is *her
  GKK's* view (GKK name visible)?
- **Done when** she is on the dashboard and can say which GKK she is looking at.

### GL-2 · "How is my GKK doing?"

*"How many families do I have, and how many are done?"*

- From the dashboard, find her household count, members, and census progress.
- Open the mobile menu and look at everything in it. Note which pages she has.
- **Watch for:** numbers that don't match each other between Dashboard,
  Households and Census; numbers from other GKKs; charts unreadable at 390 px;
  jargon ("cycle", "snapshot", "verification queue").
- **Done when** she can say "X of Y households are counted."

### GL-3 · Record the census for an elderly family (in person)

*"Lolo Ben has no phone. I'm at his house; let me answer for him."*

- Pick a demo household in her GKK, or the tagged one from GL-6. Use the
  Census page to record their answers: confirm each member, mark anyone moved
  or deceased, update activeness (A / P / W).
- Try the realistic interruptions: press Back halfway; lose connection
  (reload); come back to the same household.
- **Watch for:** Can she find the household quickly (search by surname,
  by purok)? Is it clear what each answer means? Does progress save between
  members? Is the "done" state obvious? Do the counts in GL-2 change?
- **Done when** the household shows as answered and the GL-2 numbers move.

### GL-4 · Give a family their census code

*"The Santos family wants to do it on their phone. What do I give them?"*

- Get (or renew) the census access code for one household in her GKK. Find
  how she would hand it over (print slip, copy, show on screen). Press Escape
  on any print dialog.
- Write the reference number and code into `accounts.local.json` under
  `census-family` so the census-family playbook can use them.
- **Watch for:** Is it clear that renewing a code stops the old one? Can she
  tell which families already have a code? Is the code easy to read aloud
  (no 0/O, 1/l confusion)?
- **Done when** she has a reference number and code to give the family.

### GL-5 · Review an online update

*"A family sent changes online. Do I accept them?"*

- Open **Census → Online updates**. If one is waiting for her GKK (a
  census-family run makes one), open it, compare, and accept or send back. If
  none, note `SKIPPED (nothing waiting)` and check only the empty state.
- **Watch for:** Is it clear what changed (before / after)? Can she accept
  part and question part? Does the family find out? Does the badge count drop?

### GL-6 · A new family moved into the purok

*"The Reyes family just moved here. Add them."*

- Add a new household in her GKK with three members (tag the surname, e.g.
  `Reyes PB1112GL`): a parent, a teenager, a child under 7. Give one member a
  blood type and one an OFW detail (working abroad).
- Then find a household with **no GKK** (if any) and move it into hers. If
  none exists, note it.
- **Watch for:** Does the form default to her GKK? Can she even pick another
  GKK (she shouldn't)? Required fields she wouldn't know (exact baptism
  date)? Does the new household show up on Households, Members and the
  Census list?

### GL-7 · Fix a member

*"Junior got married and moved to Cebu. And Lola Ising passed away last month."*

- In a tagged household, mark one member as moved away and one as deceased
  (with the date). Correct a misspelled first name.
- **Watch for:** Are "moved" and "deceased" easy to find, and are they
  reversible if she taps the wrong one? Does the member disappear from counts
  where expected but stay in history?

### GL-8 · A possible duplicate

*"The app says two people might be the same."*

- Open the possible duplicates (Members page tab, or the badge). If a pair
  involves another GKK, see what she can do (send to the parish office). If a
  pair is entirely in her GKK, look but **only resolve tagged records**.
- **Watch for:** Can she understand why the two match? Does she see only the
  minimum about the other GKK's person? Is "send to the office" clear, and
  does she get feedback that it was sent?

### GL-9 · Fill in the GKK profile (laptop)

*"The office asked me to put our chapel and officers on the website."*

- Switch to desktop width. Open **GKK Config → My GKK** and go through the
  views: Details, Leaders & Structure, History, Documents, Last year's list.
  Fill in or edit one detail (meeting place, bible-sharing schedule) and
  save; put the run tag at the end of the text so it can be reverted.
- Open the public site page for her GKK (`/komunidad/gkk/<name>`, by clicking
  through Komunidad, not by typing) and see whether the change shows, or why
  not (review by the office).
- **Watch for:** Is it clear what goes public and what stays private
  (Documents must stay private)? Upload limits explained? Unsaved changes
  warning?
- Afterwards, put the original text back.

### GL-10 · Last year's list

*"I typed last year's families into a CSV. Can I upload it?"*

- On Last year's list, see how a list is added (typed or CSV). Don't upload a
  real file; check that the instructions match the training checklist
  (`docs/census-coordinator-pre-training-checklist.md`: one family per line,
  `Name, Purok, note`). If adding one row by hand is possible, add a tagged
  row and remove it.
- **Watch for:** the CSV format explained on screen; what happens to families
  marked moved or deceased.

### GL-11 · Report for the parish office

*"Fr. wants my GKK's numbers for Sunday."*

- Open Reports, find her GKK's figures, and try to get them to the office
  (print preview → Escape, or whatever the screen offers).
- **Watch for:** Does the report say which GKK and which date? Does any
  number include other GKKs? Can she get it out without Exports (which she
  doesn't have)?

### GL-12 · Phone notifications and personal settings

- Open **Settings → Notifications** and **GKK Config → Personal Settings**.
  See what she'd be notified about; don't actually enable push if the browser
  asks for permission (dismiss it). Change her display name and change it
  back.
- **Watch for:** Is it explained that iPhone needs "Add to Home Screen"? Does
  the password change say what the rules are before she fails them?

## Boundary checks (she must not)

Record each in the result file's Boundary checks table. A leak is P0.

| Check | How a real person gets there | Expected |
|---|---|---|
| Another GKK's households | Households search for a surname known in another GKK; change the GKK filter if offered | not listed; no rows in the network response |
| Another GKK's census | Census → Results by GKK | only her GKK, or others without names |
| Requests queues | type `/admin/requests` (a colleague sent the link) | refused or not found, no request data |
| Parish Website | `/admin/website` | refused |
| Exports | `/admin/exports` | refused |
| Staff accounts | `/admin/settings/staff` | refused, no list |
| Activity log, Trash | `/admin/settings/activity`, `/admin/settings/trash` | refused |
| Ministry / organization rosters | `/admin/ministries`, `/admin/organizations` | not in her menu; check what the URL does |
| Parish Config tabs | `/admin/settings?tab=config` | only My GKK and Personal Settings |
| Delete a household | look for a Delete button on a tagged household | absent (deleting is full access only) |

For each typed address, also check `read_network_requests`: a refused page
that still downloaded the data is P0.

## Ten minutes of free exploring

Put the list away and do what Nanay Lorna would do on a quiet evening: look
around, tap what's interesting, try the search with half a name, look at her
own family's record, try the dark theme, check the page with the phone turned
sideways (844 × 390). Note anything that surprised, pleased or confused her.

## Cleanup

- Revert GL-9 profile text. Remove the tagged Last year's list row.
- She can't delete households: list the tagged `Reyes PB<MMDD>GL` household
  under **Left for staff admin** (a full-access run trashes it).
- Keep the GL-4 code in `accounts.local.json` if a census-family run comes next.
- Sign out; reset the viewport.
