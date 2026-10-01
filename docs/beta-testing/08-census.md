# Playbook 8 — Parish census

The yearly (or every-two-years) re-check of every member. Staff start a
census, print a pre-filled form per household, and type in what the family
wrote back. Each **member** gets a status — Active, Inactive, Moved away,
Deceased or Left the Church — because one household can have both active and
inactive members. Mistakes here change who the parish counts as an active
Catholic, so the "nothing changes until you save" and "closing changes nothing"
checks matter.

- **URL:** `/admin/census`
- **Sign-in needed:** yes
- **Time:** 35 minutes
- **Prerequisite:** sample data loaded, the `0007_census.sql` migration run, and
  no census started yet. A printer or "Save as PDF" for CE-03.

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
- **Reopen** brings it back to Open.

### CE-09 — Results by GKK
**Steps**
1. Open **Results by GKK**, then click **Export CSV**.

**Expected**
- One row per GKK plus "All GKKs", with counts per status, "Not confirmed",
  the total, and the share confirmed. The numbers match the tiles.
- The CSV has the same rows and columns.

### CE-10 — Dashboard
**Steps**
1. Open **Dashboard**.

**Expected**
- **Active Catholics** shows the number of members marked Active, with the
  inactive and "not yet assessed" counts underneath.
- **Members** no longer counts members marked Moved away or Deceased.
