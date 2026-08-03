# Playbook 6 — Dashboard, reports & exports

Numbers the parish will read out at a meeting, and files that will be opened in
Excel. Wrong figures here are worse than a broken button, because nobody notices
until the meeting.

- **URLs:** `/admin` (Dashboard), `/admin/reports`, `/admin/exports`
- **Sign-in needed:** yes
- **Time:** 25 minutes
- **Prerequisite:** sample data loaded. Reference figures: **6 households,
  16 members, 3 verified, 3 pending**; Baptism 16, First Communion 14,
  Confirmation 10, Matrimony 8. See [test data](test-data.md).
- **You will need:** a spreadsheet application to open the CSVs

---

## Dashboard

### DB-01 — The headline numbers are right
**Steps**
1. Open the Dashboard.
2. Compare each figure with the reference above and with the counts on the
   Households and Members pages.

**Expected**
- Households 6, Members 16, Verified 3, Pending 3, GKKs 4.
- Verified + Pending equals the household total.
- The household card's note reads *3 verified · 3 pending*.
- Every figure agrees with the corresponding list page. A dashboard that
  disagrees with the list is **S2**.

### DB-02 — Charts render and are labelled
**Steps**
1. Look at the registration trend, age distribution, GKK breakdown, ministry
   breakdown and sacrament figures.

**Expected**
- Every chart has a title and readable labels.
- No bar overflows its container; no label overlaps another.
- Bars with a value of zero are still visible as an empty slot rather than
  vanishing without explanation.
- The six-month trend ends with the current month.

### DB-03 — Age distribution is sensible
**Steps**
1. Add up the age buckets.

**Expected**
- The buckets cover 0–9, 10–19, 20–34, 35–49, 50–64 and 65+.
- The total across buckets equals the number of members with a date of birth.
- No member is counted in two buckets.

### DB-04 — GKK and ministry breakdowns
**Steps**
1. Compare the GKK breakdown against the Households page filtered by each GKK.
2. Compare a ministry's figure against its roster (playbook 5, GR-01).

**Expected**
- Each GKK's figure matches the number of households the filter finds.
- Ministry figures match the rosters, and organizations are counted alongside
  ministries here.

### DB-05 — The dashboard updates
**Steps**
1. Mark a pending household as verified (playbook 3, HH-10).
2. Return to the Dashboard.

**Expected**
- Verified is up one, Pending down one, total unchanged.

### DB-06 — An empty register
**Steps**
1. Only if you have a database you can wipe: `npm run db:reset -- --yes`, then
   open the Dashboard.

**Expected**
- Zeros and empty charts, with an explanation of how to add data — not a crash,
  not "NaN", not a division-by-zero artefact like `Infinity%`.
- Reload the sample data afterwards: `npm run db:demo`.

---

## Reports

### RP-01 — The report screen
**Steps**
1. Open **Reports**.

**Expected**
- Summary panels: registration status by GKK, sacramental completion, ministry
  and organization participation, and a blood-type directory.
- A report builder below them.

### RP-02 — Registration status by GKK
**Steps**
1. Read the per-GKK verified/pending figures.

**Expected**
- They match the Households page filtered by each GKK and status.
- The bars are proportional — a GKK where every household is verified shows a
  full verified bar.

### RP-03 — Sacramental completion
**Steps**
1. Read the four figures.

**Expected**
- Baptism 16, First Communion 14, Confirmation 10, Matrimony 8 on sample data.
- Each shows how many members are still missing it, and the recorded plus
  missing figures add up to 16.

### RP-04 — Blood-type directory
**Steps**
1. Open the blood-type directory and filter to a specific type, then to
   *All blood types*.

**Expected**
- Only members with a recorded blood type are listed; members with none are
  excluded rather than shown under a blank type.
- Each row shows name, blood type, age, GKK, household and contact.
- Filtering to one type shows only that type.
- The count of unknowns is reported somewhere rather than silently dropped.

### RP-05 — Building a member report
**Steps**
1. In the report builder choose source **Members**, type **By GKK**, GKK
   **All**. Generate.
2. Then narrow it to one GKK and regenerate.

**Expected**
- A titled table appears with columns Name, Household, GKK, Age, Relationship,
  Contact.
- The row count is stated and matches the rows shown.
- All GKKs gives 16 rows; one GKK gives the members of that GKK only.
- Missing values show as `—`, not blank cells or "undefined".

### RP-06 — Member report by sacrament
**Steps**
1. Source **Members**, type **By Sacrament**, sacrament **Confirmation**.
   Generate.

**Expected**
- 10 rows on sample data.
- Spot-check two of them on the Members page — they really do have confirmation.

### RP-07 — Member report by ministry or organization
**Steps**
1. Source **Members**, type **By Ministry / Organization**, group **Choir**.
2. Then a group nobody belongs to.

**Expected**
- Choir's rows match its roster.
- An empty group produces a clear "no records match this scope" message and a
  row count of zero — not an error.

### RP-08 — Household report and date range
**Steps**
1. Source **Households**, type **By Status**. Generate.
2. Set *Registered from* to today and regenerate.
3. Set *Registered from* to a date before the sample data was loaded, and
   *Registered to* to today.

**Expected**
- Columns Household, GKK, Grouping, Status, Registered.
- The date filters actually narrow the result.
- A range that excludes everything gives an empty result with a message.
- A *from* date later than the *to* date gives an empty result rather than an
  error.

### RP-09 — Report changes when the data changes
**Steps**
1. Generate a report by sacrament.
2. Record a new sacrament for a member (playbook 4, ME-11).
3. Regenerate the same report.

**Expected**
- The figure moves by one; the report is not showing something cached.

---

## Exports

### EX-01 — The exports screen
**Steps**
1. Open **Exports**.

**Expected**
- Downloads for members, households and the blood-type directory, each with a
  sentence explaining what it contains.

### EX-02 — Members CSV
**Steps**
1. Download the members CSV and open it in a spreadsheet.

**Expected**
- The file downloads with a sensible filename (`members.csv`) rather than
  opening as a page of text in the browser.
- One header row plus 16 data rows.
- Columns include name parts, household, relationship, sex, date of birth, age,
  civil status, contact, email, occupation, blood type, GKK, the four
  sacraments as Yes/No, ministries and organizations.
- Dates read exactly as they do in the app — no day shift.
- Ministries and organizations are readable when a member belongs to several.
- Accented characters (`Niño`) display correctly. If they arrive as `NiÃ±o`,
  file it as **S2** and say which spreadsheet application you used.

### EX-03 — Commas and quotes survive
**Steps**
1. Make sure `Bautista, Jr. Family` exists (playbook 3, HH-16).
2. Download the households CSV and open it.

**Expected**
- The comma stays inside one cell — the row is not split across columns.
- The column count is the same on every row.
- A value containing a quotation mark comes through as typed.

### EX-04 — Households CSV
**Steps**
1. Open the households CSV.

**Expected**
- 6 data rows on sample data.
- Columns include the address parts, GKK, grouping, contact, member count,
  status, reference number and registration date.
- Member counts match the Households page.
- Reference numbers match the ones the app shows.

### EX-05 — Blood-type CSV
**Steps**
1. Open the blood-type CSV.

**Expected**
- Only members with a recorded blood type — fewer rows than the members export.
- Columns: name, blood type, age, GKK, household, contact.

### EX-06 — Exporting a built report
**Steps**
1. Generate a report in the report builder and export it.

**Expected**
- The file is named after the report, e.g. `members-by-gkk.csv`.
- Its contents match the table on screen — same columns, same rows, same order.

### EX-07 — Exports respect sign-in
**Steps**
1. Copy an export link, sign out, and open it in a new tab.

**Expected**
- No file downloads and no parish data is returned. If a CSV of every
  parishioner downloads while signed out, stop and file **S1**.

### EX-08 — Exporting an empty register
**Steps**
1. Only if you can wipe the database: reset it and download the members CSV.

**Expected**
- A file with just the header row, or a clear "nothing to export" message.
- Not a broken download and not an error page.
- Reload the sample data afterwards.

### EX-09 — Formula-looking values
**Steps**
1. Create a member whose occupation is `=SUM(A1,A2)` and export the members CSV.
2. Open it in your spreadsheet application.

**Expected**
- The cell shows the text as typed.
- Note in the run log whether your spreadsheet tried to evaluate it as a
  formula — that is worth a decision even though it comes from the spreadsheet
  rather than the app.

---

## Sign-off

| ID | Check | Result |
|---|---|---|
| DB-01 | Dashboard figures | |
| DB-02 | Charts render | |
| DB-03 | Age buckets | |
| DB-04 | GKK & ministry breakdowns | |
| DB-05 | Dashboard updates | |
| DB-06 | Empty register | |
| RP-01 | Reports screen | |
| RP-02 | Status by GKK | |
| RP-03 | Sacramental completion | |
| RP-04 | Blood-type directory | |
| RP-05 | Member report by GKK | |
| RP-06 | Member report by sacrament | |
| RP-07 | Member report by group | |
| RP-08 | Household report & dates | |
| RP-09 | Reports reflect changes | |
| EX-01 | Exports screen | |
| EX-02 | Members CSV | |
| EX-03 | Commas and quotes | |
| EX-04 | Households CSV | |
| EX-05 | Blood-type CSV | |
| EX-06 | Generated report CSV | |
| EX-07 | Exports need sign-in | |
| EX-08 | Empty export | |
| EX-09 | Formula-looking values | |

Browser / version: ____________  Spreadsheet app: ____________  Tester: ____________
