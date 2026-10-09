# Playbook 8 — Parish census

The yearly (or every-two-years) re-check of every member. Staff start a
census, print a pre-filled form per household, and type in what the family
wrote back. Each **member** gets a status — Active, Inactive, Moved away,
Deceased or Left the Church — because one household can have both active and
inactive members. Mistakes here change who the parish counts as an active
Catholic, so the "nothing changes until you save" and "closing changes nothing"
checks matter.

- **URLs:** `/admin/census` (staff), `/census` (family portal)
- **Sign-in needed:** yes for staff; families use a reference number + code
- **Time:** 55 minutes
- **Prerequisite:** sample data loaded, the `0007_census.sql` and
  `0008_census_portal.sql` migrations run, and no census started yet. A printer
  or "Save as PDF" for CE-03. A phone (or a narrow browser window) for the
  portal cases.

---

## Starting and closing

### CE-01 — Start a census
**Steps**
1. Open **Census**. Note the "No census yet" state.
2. Click **Start a new census**, keep the suggested name (e.g. "2026 Census")
   and today's date, and click **Start census**.

**Expected**
- The census appears as **Open**, with 0% of members confirmed and every
  household "Not started".
- No member's details or status changed (spot-check one on the Members page).
- **Start a new census** is no longer offered while this one is open.

### CE-02 — Schedule reminder
**Steps**
1. Change **Schedule** to "Every 2 years". Reload the page.

**Expected**
- The choice is kept after reloading.
- Once the census is closed (CE-08), the bar shows "Next census due around …"
  two years after the start date.

---

## Paper forms

### CE-03 — Print the forms for one GKK
**Steps**
1. Choose **GKK San Isidro** in the GKK filter.
2. Click **Print forms for GKK San Isidro** and print or save as PDF.

**Expected**
- One page per household in that GKK, and no households from other GKKs.
- Each page shows the parish name, the census name, the household's reference
  number, address and contact as on file, every current member with their
  sacraments, an A/P/W grid per member, the status choices, blank rows for new
  members, and signature lines.
- A child aged 8 or under has "Bata pa … Aktibo, dili na kinahanglan tubagon"
  across the A/P/W columns instead of the grid, as on the portal. The status
  choices are still there, for a child who moved away.
- The rest of the admin panel is not printed.
- **Print form** on a single row prints just that household.

---

## Recording answers

### CE-04 — Suggested status
**Steps**
1. Click **Record census** on the Dela Cruz Family.
2. For the first member, mark Mass **W** and Devotions **W**.
3. For the second member, mark Mass **A**.
4. For the third member, mark only Mass **P**.

**Expected**
- The first member's status changes to **Inactive** by itself, the second to
  **Active**, and the third stays "Not confirmed yet" ("No suggestion").
- After you pick a status yourself, changing the answers no longer changes it.
- A child aged 8 or under with no answer yet already shows **Active** ("Young
  child … Active, with no questions to answer"). Opening and closing the panel
  without touching anything doesn't ask to discard; **Save census** confirms
  the child with the others.

### CE-05 — Save a mixed household
**Steps**
1. Continuing CE-04, set the third member to **Moved away** with the note
   "Working in Davao". Leave the fourth member as "Not confirmed yet".
2. Click **Save census**.

**Expected**
- The household shows "3 of 4" and **Partly confirmed**.
- The tiles count 1 active, 1 inactive and 1 moved.
- Reopening the household shows the three members as **Confirmed**, with your
  name and today's date.
- On **Members**, the moved member is hidden by default and appears again with
  "Everyone (incl. moved / deceased)". The other two show their status badge.
- The moved member's member window lists the census answer under
  **Parish census**.

### CE-06 — Nothing changes until you save
**Steps**
1. Open another household, mark a few answers, and click **Close**.

**Expected**
- You are asked whether to discard the answers, and after discarding nothing
  was saved. The household is still "Not started".

### CE-07 — Clear an answer entered by mistake
**Steps**
1. Reopen the Dela Cruz Family and click **Clear answer** on the moved member.

**Expected**
- After confirming, that member is "Not confirmed yet" again, the household
  shows "2 of 4", and the member is back in the default Members list.

---

## Closing and results

### CE-08 — Close the census
**Steps**
1. Click **Close census** and confirm.

**Expected**
- The census shows **Closed**. Buttons say **View** instead of **Record census**,
  and the household panel is read-only with a note to reopen.
- No member's status or details changed by closing.
- On **Members**, the "Not confirmed in census" filter lists every current member
  nobody confirmed.
- **Reopen** first asks, saying the results kept at closing are let go, then
  brings it back to Open.
- **Analysis Report →** beside the closed census opens Reports → Analysis
  Report on that census.

### CE-09 — Results by GKK
**Steps**
1. Open **Results by GKK**, then click **Export CSV**.

**Expected**
- One row per GKK plus "All GKKs", with counts per status, "Not confirmed",
  the total, and the share confirmed. The numbers match the tiles.
- The CSV has the same rows and columns.

### CE-10 — A closed census keeps its results
**Steps**
1. With the census closed (CE-08), note the numbers on **Results by GKK**.
2. Add a new household with members in one GKK, and move another household to a
   different GKK.
3. Go back to **Results by GKK** for the closed census.

**Expected**
- A grey note says these are the results as they stood when it closed.
- The numbers are the same as in step 1: the new household doesn't show as
  "not started", and the moved household's answers stay with its old GKK.
- After **Reopen**, the note is gone and the numbers follow the registry again.

### CE-11 — The second census is measured against the first
**Steps**
1. With the first census closed, click **Start a census**.
2. Open **Results by GKK** for the new census.

**Expected**
- The start form says the new census is measured against the first one.
- The table is "Households that answered the census, by GKK", with "Last census"
  (households that answered the first census) and "Answered", even with last
  year's list switched on.
- A family whose online update is still waiting in **Online updates** is not
  counted as answered until it's approved.

### CE-12 — Dashboard
**Steps**
1. Open **Dashboard**.

**Expected**
- **Active Catholics** shows the number of members marked Active, with the
  inactive and "not yet assessed" counts underneath.
- **Members** no longer counts members marked Moved away or Deceased.

---

## Family portal

Run these while a census is **open** (reopen it after CE-08). Use a private
window or a second browser for the family, so it is not signed in as staff.

### CE-13 — The portal is only offered during a census
**Steps**
1. With no census open, open the registration home page, then `/census`.
2. Open a census and reload both.

**Expected**
- With no census open: no update button on the home page, and `/census` says
  there is no open census.
- With a census open: the home page shows "Narehistro na? I-update ang inyong
  rekord (… Census)", and `/census` asks for a reference number and code.

### CE-14 — The printed form carries the online code
**Steps**
1. Print the forms for GKK San Isidro (CE-03), then print them again.

**Expected**
- Each page has a box with the portal address, the household's reference
  number and an 8-character code (XXXX-XXXX).
- Printing again shows the **same** codes.
- **Record census** on that household shows the same code as "Online code".

### CE-15 — Signing in
**Steps**
1. On `/census`, enter a household's reference number with a wrong code.
2. Enter a reference number that doesn't exist.
3. Enter the right code in lower case, with or without the dash.
4. In a separate test, enter a wrong code five times, then the right one.

**Expected**
- Steps 1 and 2 show the same message: the reference number or code is wrong.
  The page must not reveal which one is wrong.
- Step 3 opens the household's form, showing only that household.
- Step 4: the right code is refused for 15 minutes ("Daghan na kaayong sayop…").

### CE-16 — A family sends an update
**Steps**
1. Sign in as the Dela Cruz Family. Change the contact number, mark the first
   member's Mass as **Wala** and the second member's Mass as **Aktibo**.
2. Add a new member (a newborn): name, relationship, sex, birth date, status
   Aktibo.
3. Write a message, and try to send without ticking the consent box. Then tick
   it and send.
4. Choose **Usba pag-usab**.

**Expected**
- The first member's status follows the answers (Dili aktibo / Aktibo) until
  the family picks one.
- Sending without consent is stopped with a message in Bisaya.
- After sending: the thank-you page. On the staff side, **nothing** in Members or
  Households has changed yet.
- **Usba pag-usab** reopens the form with what was sent and a note that an
  update is waiting for review. Sending again replaces the earlier one (staff
  still see only one).

### CE-17 — Staff review and approve
**Steps**
1. As staff, open **Census**. Look at the Dela Cruz row, then open
   **Online updates**.
2. Click **Review**. Before approving, edit the household's email on the
   Households page.
3. Approve.

**Expected**
- The row shows "Online update waiting", and the tab shows "Online updates (1)".
- The review lists only what changed (old value struck through, new value
  bold), each member's census answers, the new member and the message. A
  member whose answers suggest a different status from the one chosen is
  flagged.
- After approving: the contact number changed, the email you edited in step 2
  was **not** overwritten, the newborn is in the household, and the answered
  members show **Confirmed** with source "Portal".
- Under **Approved**, the update shows who approved it.

### CE-18 — What's approved at once, and what waits
**Steps**
1. As another family, change nothing but the census answers (statuses Aktibo
   or Dili aktibo, and the activity questions), and send.
2. As a third family, change nothing but mark one member **Namatay**, and send.

**Expected**
- Step 1: the thank-you page says the census is recorded. On the staff side the
  answers are already **Confirmed** (source "Portal"), and the update is under
  **Approved** "by the system".
- Step 2: the thank-you page says staff will check it. Nothing changed in the
  registry yet; the update waits under **Online updates**, its row says
  "1 marked moved / deceased / left", and the review panel says approving takes
  that member off the household's current members.

### CE-19 — Answers aren't lost by accident
**Steps**
1. On a family's form, answer a few questions, then press the browser's back
   button or reload.
2. Mark an adult **Aktibo** without answering any activity question, and send.

**Expected**
- Step 1: the browser asks before leaving. **Gawas** and **Kanselahon** ask too.
- Step 2: an amber note says that member has no answers yet and to send again
  to send anyway. Sending again goes through.

### CE-20 — Reject, and a new code
**Steps**
1. Send another update as a different family, then **Reject…** it with a reason.
2. In that household's census panel, click **New code**, then try the old code
   on `/census`.

**Expected**
- The rejected update is listed under **Rejected** with the reason, and nothing
  in the registry changed.
- The old code no longer works. The new one does.

### CE-21 — Closing the census closes the portal
**Steps**
1. Close the census, then try to sign in on `/census`.

**Expected**
- The portal says there is no open census, and the home page button is gone.
