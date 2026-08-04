# Playbook 4 — Members & sacraments

The individual parishioner: finding one person among many, correcting their
record, and checking who still needs which sacrament.

- **URLs:** `/admin/members`, `/admin/sacraments`
- **Sign-in needed:** yes
- **Time:** 35 minutes
- **Prerequisite:** sample data loaded — **16 members** across 6 households.
  Sacrament totals: Baptism 16, First Communion 14, Confirmation 10,
  Matrimony 8. See [test data](test-data.md).

---

## The member directory

### ME-01 — Everyone is listed
**Steps**
1. Open **Members**.

**Expected**
- The count says *16 member(s)* on a freshly loaded sample set.
- Each row identifies the person, their household, and enough detail to tell two
  people with the same surname apart.
- The household status is visible per member.

### ME-02 — Search
**Steps**
1. Search for a first name, e.g. `juan`.
2. Search for a full name, e.g. `maria dela cruz`.
3. Search for a household name, e.g. `reyes`.
4. Search for a contact number.
5. Search for `zzzz`.

**Expected**
- All five behave: first name, full name, household and contact all match.
- Case does not matter.
- Results update shortly after you stop typing.
- No match shows a "no members found" state suggesting you adjust the filters,
  not an error and not an empty white page.

### ME-03 — Filters
**Steps**
Apply each of these in turn, returning to *All* between each:
1. Registration status — Verified, then Pending.
2. Civil status — Single, Married, Widowed, Separated.
3. GKK.
4. Sacrament.
5. Ministry / organization.
6. Age bracket — 0–17, 18–30, 31–59, 60+.
7. Blood type, including **Unknown**.

**Expected**
- Every filter changes the list and the count together.
- Spot-check three results by opening the member and confirming the value really
  matches the filter you set.
- The **Unknown** blood type option finds the members with no blood type
  recorded, and those members do **not** appear under any specific type.
- The ministry filter finds members of *organizations* too — check with
  `Youth Ministry`, which is an organization.
- Ages are correct: nobody in the 0–17 bracket has a birth year that would make
  them older today.

### ME-04 — Combining filters
**Steps**
1. Set GKK **San Isidro** + civil status **Single** + sacrament **Baptism**.
2. Then add a search term that cannot match, e.g. `zzzz`.

**Expected**
- Filters narrow together rather than replacing one another.
- The impossible combination shows the empty state, not stale rows from the
  previous filter.

### ME-05 — Filters that produce nothing do not break the page
**Steps**
1. From an empty result, remove the filters one at a time.

**Expected**
- Rows come back as filters are relaxed.
- No leftover spinner, no stuck "loading" text.

### ME-06 — Sorting
**Steps**
1. Sort by name, then reverse it.
2. Sort by household, then by age, then by status. Reverse each.

**Expected**
- Each sort actually reorders the list, and clicking again reverses it.
- The active sort column and direction are indicated.
- **Age ascending puts the youngest first** — check the first and last rows
  against their birth dates.
- Sorting does not change the total or drop anyone.
- Sorting stays applied when you page forward.

### ME-07 — Paging
**Steps**
1. Set the page size to 5 and walk through all pages.

**Expected**
- 16 members across four pages, with nobody appearing twice and nobody missing.
- The total stays 16 on every page.
- Changing a filter returns you to page 1.

---

## One member's record

### ME-08 — The detail view
**Steps**
1. Open any member.

**Expected**
- Personal details, sacraments, ministries and organizations are all visible.
- The household name and address are shown, so staff know which family this is.
- The age shown matches the date of birth.
- Empty fields are shown as blank or `—`, never as "null" or "undefined".

### ME-09 — Editing personal details
**Steps**
1. Change the occupation, the contact number and the blood type. Save.
2. Reload the page and reopen the member.

**Expected**
- The new values are shown after saving and survive the reload.
- A confirmation message appears on save.
- The member list reflects any changed field it displays.

### ME-10 — Dates do not drift
**Steps**
1. Set a date of birth of `2000-02-29` (a leap day). Save and reopen.
2. Set a baptism date of `1981-08-02`. Save, reopen, and check the members CSV
   export (playbook 6) for the same date.

**Expected**
- Each date reads back **exactly** as entered — not a day earlier or later.
- This is worth checking on a device whose timezone is not UTC; if you can, set
  your device to a timezone well ahead of or behind UTC and repeat.

### ME-11 — Editing sacraments
**Steps**
1. On a member with no Confirmation, tick Confirmation and fill in date, church,
   confirmation name and sponsor. Save.
2. Reopen and untick it. Save.

**Expected**
- The extra fields appear only when the sacrament is ticked.
- The record saves and reads back correctly.
- Unticking removes the member from the Confirmation filter on the member list
  and from the Confirmation count on the Sacraments page.

### ME-12 — Ministries and organizations
**Steps**
1. Add the member to one ministry and one organization. Save.
2. Remove one of them. Save.

**Expected**
- Only groups that exist in Parish Config can be chosen — no free typing that
  creates a group nobody manages.
- The member appears in that group's roster (playbook 5) after saving.
- Removing takes them off the roster.
- The group's member count changes to match.

### ME-13 — Clearing a field
**Steps**
1. Clear the occupation entirely and save.

**Expected**
- The field is genuinely empty afterwards, not reverted to the old value.

### ME-14 — Cancelling an edit
**Steps**
1. Change three fields and close the detail view without saving.
2. Reopen the member.

**Expected**
- None of the three changes were kept.
- If the app warns about unsaved changes, the warning is accurate; if it does
  not warn, note it as **S3** — a secretary will lose work otherwise.

### ME-15 — Deleting a member
**Steps**
1. Add a throwaway member to a household (playbook 3, HH-13) and delete them.

**Expected**
- A confirmation is required first.
- The member disappears from the directory and from their household.
- **The household itself still exists**, with its count reduced by one. If
  deleting one person removed the whole family, stop and file **S1**.

---

## The Sacraments page

### SA-01 — The overview
**Steps**
1. Open **Sacraments**.

**Expected**
- One row per member with a clear indication of which of the four sacraments
  each has.
- Totals match the sample data: Baptism 16, First Communion 14, Confirmation 10,
  Matrimony 8.

### SA-02 — Per-sacrament filters
**Steps**
1. Set the Baptism filter to **Yes**, then **No**, then back to **All**.
2. Repeat for First Communion, Confirmation and Matrimony.

**Expected**
- **Yes** shows exactly the members who have it; **No** shows exactly those who
  do not; the two add up to the total shown for *All*.
- With the sample data, Confirmation *No* shows 6 members and Matrimony *No*
  shows 8.

### SA-03 — Combining sacrament filters
**Steps**
1. Set First Communion **Yes** and Confirmation **No** — the practical question
   "who is due for confirmation?"

**Expected**
- The list contains only members matching both conditions.
- Every listed member, when opened, really has communion and really lacks
  confirmation.
- This is the query the parish will actually run — if it is wrong, it is **S2**.

### SA-04 — Changes here show up elsewhere
**Steps**
1. Note a member from the Confirmation *No* list.
2. Open them and record a confirmation (ME-11).
3. Return to the Sacraments page.

**Expected**
- They have moved to the *Yes* list.
- The Confirmation total went up by one.
- The Reports page's sacramental completion figure moved too (playbook 6).

---

## Sign-off

| ID | Check | Result |
|---|---|---|
| ME-01 | Directory totals | |
| ME-02 | Search | |
| ME-03 | Every filter | |
| ME-04 | Combined filters | |
| ME-05 | Empty results recover | |
| ME-06 | Sorting, incl. age order | |
| ME-07 | Paging | |
| ME-08 | Detail view | |
| ME-09 | Edit personal details | |
| ME-10 | Dates do not drift | |
| ME-11 | Edit sacraments | |
| ME-12 | Ministries & organizations | |
| ME-13 | Clearing a field | |
| ME-14 | Cancelling an edit | |
| ME-15 | Delete a member only | |
| SA-01 | Sacrament overview | |
| SA-02 | Per-sacrament filters | |
| SA-03 | Combined sacrament filters | |
| SA-04 | Changes propagate | |

Browser / version: ____________  Device / width: ____________  Tester: ____________
