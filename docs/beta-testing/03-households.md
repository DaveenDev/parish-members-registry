# Playbook 3 — Households

The parish secretary's daily screen: finding a family, checking who is in it,
verifying a registration, correcting a detail, and registering a family who came
to the office in person.

- **URL:** `/admin/households`
- **Sign-in needed:** yes
- **Time:** 30 minutes
- **Prerequisite:** sample data loaded — see [test data](test-data.md).
  Numbers below assume a freshly loaded set: **6 households, 16 members,
  3 verified, 3 pending**.

---

## The directory

### HH-01 — The list matches reality
**Steps**
1. Open **Households**.
2. Count the rows and read the total above the table.

**Expected**
- The count above the table says *6 household(s)* and the table shows 6.
- Each row shows the family name, address, GKK, member count and a status pill.
- Member counts match the [test data table](test-data.md): Dela Cruz 4, Reyes 3,
  Santos 2, Mendoza 2, Tan 3, Bautista 2.
- If you ran playbook 1, the households you registered there are here too, each
  exactly **once**.
- Newest registrations appear first.

### HH-02 — Filter by status
**Steps**
1. Set the status filter to **Verified**, then **Pending**, then **All**.

**Expected**
- Verified shows 3, Pending shows 3, All shows 6.
- The count above the table updates with the filter.
- Every visible row's pill matches the filter you chose.

### HH-03 — Filter by GKK
**Steps**
1. Choose **GKK San Isidro** from the GKK filter.
2. Then choose a GKK with no households.

**Expected**
- San Isidro shows Dela Cruz and Reyes only.
- The dropdown lists the GKKs that exist in Parish Config, not a hard-coded set.
- An empty GKK shows a "no households found" state suggesting you adjust the
  search or filters — not a blank page and not an error.

### HH-04 — Search
**Steps**
1. Type `dela` into the search box.
2. Clear it and search for part of an address, e.g. `Rizal`.
3. Search for a contact number, e.g. `0917`.
4. Search for something that matches nothing, e.g. `zzzz`.

**Expected**
- Search matches family name, street, barangay, city and contact number.
- It is case-insensitive: `DELA`, `dela` and `Dela` give the same result.
- Results update shortly after you stop typing, not on every keystroke.
- No match shows the "no households found" state.
- Clearing the box restores all 6.

### HH-05 — Filters combine, and reset the page
**Steps**
1. Set status **Pending** and GKK **GKK San Lorenzo Ruiz**.
2. Then go to page 2 of an unfiltered list (set page size to 5 first), and
   change a filter.

**Expected**
- Combining filters narrows the list (Bautista Family only, in step 1).
- Changing a filter while on page 2 sends you back to page 1 rather than showing
  an empty page.

### HH-06 — Pagination
**Steps**
1. Set the page size to 5.
2. Move to page 2, then back to page 1.

**Expected**
- Page 1 shows 5 rows, page 2 shows 1, and no household appears on both pages.
- The total stays *6 household(s)* on both pages.
- Controls for the page you are on are disabled or clearly marked.

---

## Looking at a family

### HH-07 — Expanding a household
**Steps**
1. Expand **Dela Cruz Family**.
2. Collapse it, then expand it again.

**Expected**
- Four members appear, each with enough detail to identify them.
- The number of members shown matches the count in the row.
- Collapsing hides them; expanding again shows them without a visible reload.
- Expanding a second household does not collapse the first (or if it does, that
  is consistent for every row — note which behaviour you see).

### HH-08 — Opening a member from a household
**Steps**
1. With Dela Cruz expanded, open one member.

**Expected**
- A detail view opens with that member's information.
- Closing it returns you to the household list with the row still expanded.
- Nothing was changed by simply opening and closing.

### HH-09 — Printing a household sheet
**Steps**
1. Use the print action on **Tan Family** and inspect the print preview.

**Expected**
- The sheet shows the parish name, the family, the address and all three
  members.
- The admin sidebar, filters and buttons are **not** on the printed page.
- Nothing is cut off at the right edge.
- Cancelling the print dialog returns you to the list unchanged.

---

## Changing things

### HH-10 — Verify and unverify
**Steps**
1. Find a **Pending** household and mark it verified.
2. Then set it back to pending.

**Expected**
- The pill changes immediately and a confirmation message names the household
  and its new status.
- The status filter now finds it under its new status.
- Reloading the page keeps the change — it was really saved.
- The Dashboard's verified/pending counts move by one (check in playbook 6).

### HH-11 — Editing household details
**Steps**
1. Edit a household: change the street, the GKK and the contact number.
2. Save, then reload the page.

**Expected**
- The row shows the new values after saving.
- The values survive the reload.
- Clearing an optional field (e.g. the contact number) saves as empty rather
  than keeping the old value.
- Cancelling an edit discards it — reopen to confirm nothing changed.

### HH-12 — Required fields on edit
**Steps**
1. Edit a household, clear the family name, and try to save.

**Expected**
- Saving is refused with a message naming the missing field.
- The dialog stays open with your other changes intact.

### HH-13 — Adding a member to an existing household
**Steps**
1. Open a household and add a new member with first name, last name,
   relationship, sex and date of birth.

**Expected**
- The member appears in the household immediately.
- The household's member count goes up by one, in the list as well as in the
  expanded view.
- The new member is findable from the **Members** page.

### HH-14 — Deleting a household
**Steps**
1. Register a throwaway household through the public portal (playbook 1) so you
   are not deleting sample data you still need.
2. Delete it from the households list.

**Expected**
- A confirmation dialog appears first, naming the household and stating how many
  member records will go with it.
- Cancelling leaves everything in place.
- Confirming removes the household, the total drops by one, and a confirmation
  message appears.
- **Its members are gone from the Members page too** — no orphaned people left
  behind. Check this explicitly; it is the most damaging thing that can go wrong
  here.

---

## Registering a family on their behalf

### HH-15 — The New Household form
**Steps**
1. Click **New Household**.

**Expected**
- A form for staff to enter a family who came to the office.
- The same required fields as the public wizard: family name, street, barangay,
  city, province, ZIP, and at least one member.
- Staff can set the status directly rather than everything starting as Pending.

### HH-16 — Creating a household as staff
**Steps**
1. Fill in the form with a distinctive family name — use `Bautista, Jr. Family`
   so you also test a comma.
2. Add two members, one with sacraments ticked.
3. Save.

**Expected**
- The household appears in the list with both members.
- It has a reference number in the `OLG-YYYY-XXXXXX` form.
- The comma in the name displays correctly everywhere — the list, the expanded
  view, the print sheet.
- The sacrament ticks are visible on the member's detail view.

### HH-17 — Validation on the staff form
**Steps**
1. Try to save with no members.
2. Try to save with a member who has a first name but no last name.

**Expected**
- Each is refused with a clear message about what is missing.
- Nothing partial is created — the household count does not go up after a
  refused save. Reload and check.

### HH-18 — Awkward but real values
**Steps**
1. Create a household with the family name `O'Brien Family`, a barangay
   containing `ñ` (`Sto. Niño`), and a ZIP of `09400`.
2. Create a member whose last name is `<b>Test</b>`.

**Expected**
- The apostrophe and `ñ` are stored and displayed exactly as typed, everywhere
  they appear.
- The leading zero on the ZIP is kept.
- `<b>Test</b>` displays as that literal text — **never** as bold text. If it
  renders as bold, stop and file it as **S1**.

---

## Sign-off

| ID | Check | Result |
|---|---|---|
| HH-01 | Directory totals | |
| HH-02 | Status filter | |
| HH-03 | GKK filter | |
| HH-04 | Search | |
| HH-05 | Combined filters | |
| HH-06 | Pagination | |
| HH-07 | Expand household | |
| HH-08 | Open a member | |
| HH-09 | Print sheet | |
| HH-10 | Verify / unverify | |
| HH-11 | Edit details | |
| HH-12 | Edit validation | |
| HH-13 | Add a member | |
| HH-14 | Delete cascades | |
| HH-15 | New Household form | |
| HH-16 | Create as staff | |
| HH-17 | Staff form validation | |
| HH-18 | Special characters | |

Browser / version: ____________  Device / width: ____________  Tester: ____________
