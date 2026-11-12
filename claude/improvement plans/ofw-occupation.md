# Improvement plan: OFW and occupation

> **Status:** proposed 2026-11-12, not started. Dave answered the open
> questions the same day (folded into the decisions below). One of them
> also changes existing behavior: **GKK leaders will see blood types**
> (Step 0, its own migration).
> **Goal:** a parish that wants it can record which members are **OFWs**
> (Overseas Filipino Workers), where and since when, and each member's
> **occupation** in a form that can be counted. A household with a member
> abroad is flagged **OFW household** by itself, and the secretary and GKK
> leaders can list, filter and report on them (pastoral visits to families
> left behind, the census, the parish's picture of its people).
> **Every parish:** always available, no Parish Config setting (decided).
> **Migrations:** `0120_member_ofw.sql` (OFW and occupation) and
> `0121_leader_blood_types.sql` (Step 0). 0118 is still the latest on
> `origin/main` (checked 2026-11-12) and the audit log plan has reserved
> 0119; take the next free numbers at build time (check `origin/main`
> first, other sessions add migrations). Step 0 doesn't depend on the OFW
> work and can ship first, under the lower number.
> **Edge Functions:** none changed, nothing to redeploy.

## What already exists

- **Occupation is already a member field**: `members.occupation text`
  (0001), free text, asked everywhere as "Trabaho" / "Occupation":
  - public registration and the census portal's new members:
    `MemberFieldsGrid` in `components/MemberFields.jsx`;
  - staff New Household: `components/NewHouseholdDrawer.jsx` (line ~528);
  - the member window: `components/MemberDetailModal.jsx` (line ~255);
  - shown in `HouseholdViewDrawer.jsx`, exported in the members CSV
    (`MEMBER_CSV_COLUMNS` in `api.js`), labelled in the activity log
    (`lib/activity.js`) and in census update reviews (`lib/census.js`).
  - The census portal lets families add it for **new** members (0090,
    `portal_new_member_details`) but **not change it for existing ones**:
    `portal_member_fields` / `portal_clean_member_fields` (0054) carry only
    names, relationship, sex, birthday, civil status, contact and family.
- **But it can't be reported on.** Free text gives "Farmer", "farming",
  "Mag-uuma", "nag-uma" as four answers. No report or filter uses it.
- **Nothing about OFWs** anywhere in the code or the migrations.

So this plan adds OFW details, makes occupation countable, and puts both in
the forms, lists, reports and census.

## Decisions

### What to record for each member

Columns on `members` (not a separate table, see Privacy below for why):

| Column | Type | Meaning |
| --- | --- | --- |
| `occupation` | text (exists) | As now: their own words, e.g. "Nurse at Davao Doctors". Kept free text. |
| `occupation_group` | text, null | **New.** One of a short fixed list (below), so it can be counted. |
| `ofw_status` | text, null | **New.** `null` = not an OFW (or not asked); `'Abroad'` = **abroad now**; `'Returned'` = **former OFW, back home** (decided: former OFWs are recorded). |
| `ofw_country` | text, null | **New.** Where they work now, or for a former OFW where they last worked. A list of the common destinations plus "Other" with a typed name. |
| `ofw_since` | smallint, null | **New.** Year the **current contract** started (decided). For a former OFW: the year their last contract started, kept from when they were abroad, so "Qatar, 2019–2023" reads as the last stint. |
| `ofw_returned` | smallint, null | **New.** Year they came home, for `'Returned'` only. |
| `ofw_updated_at` | date, null | **New.** When the OFW answer was last given (set by the forms and the census), so a list can show "as of the 2026 census". |

- **"Kind of work" abroad is their occupation.** An OFW's job abroad *is*
  their occupation, so it goes in `occupation_group` / `occupation`, not a
  second field. The group list has the usual OFW kinds of work in it
  (seafarer, household service worker, caregiver), so "OFWs by kind of work"
  is the occupation breakdown filtered to OFWs.
- **Sea-based or land-based** comes from the group: "Seafarer" is sea-based,
  the rest land-based. No extra field.
- **An OFW abroad stays a current member** of the household. They are not
  "Moved away" (the membership status, which drops them from the counts).
  Say so next to the question, since staff may reach for "Moved away".
- **Checks** (in the migration): `ofw_status in ('Abroad','Returned')`;
  `ofw_country` and `occupation_group` up to 60 characters; years between
  1950 and next year; `ofw_returned >= ofw_since` when both are set;
  `ofw_returned` only with `'Returned'`. When `ofw_status` is cleared, the
  forms clear the other OFW fields too.
- **Contracts change, so the answer moves with them:**
  - a new contract while still abroad → `ofw_since` becomes its start year
    (the census asks each year, and shows last year's answer to confirm);
  - coming home → `'Returned'`, `ofw_returned` set, `ofw_since` and the
    country kept as the last stint;
  - leaving again → back to `'Abroad'`, new country and `ofw_since`,
    `ofw_returned` cleared. The activity log keeps the earlier stints (every
    change is logged with old and new values), so no history table is
    needed.

### Occupation groups (the fixed list)

Short, in words a family uses, adapted from the PSA's occupation groups
but not a census code. Kept in `constants.js` (`OCCUPATION_GROUPS`) with
Bisaya labels in `lib/bisaya.js` (`OCCUPATION_GROUP_LABELS`):

Farming or fishing (Pagpanguma o pagpangisda) · Business or vendor (Negosyo
o tindera) · Driver or transport (Drayber o transportasyon) · Construction or
skilled trade (Konstruksyon o skilled trade) · Factory or labourer (Pabrika o
trabahante) · Office or sales staff (Opisina o sales) · Teacher (Magtutudlo)
· Health worker (Health worker) · Government, police or military (Gobyerno,
pulis o militar) · Seafarer (Seaman) · Household service or caregiver
(Katabang sa balay o caregiver) · Professional (doctor, engineer, lawyer…)
· Student (Estudyante) · Homemaker (Naa sa balay) · Retired (Retirado) ·
Looking for work (Nangita og trabaho) · Other (Uban pa).

The Bisaya wording is a first draft: **Dave checks it himself** before
release (decided). Same for the OFW question's wording in Phase 2.

- **Old free-text answers aren't converted** by the migration (guessing
  "nag-uma" → Farming would be wrong often enough to mislead a report).
  Instead, phase 4 adds a **"Sort occupations"** tool for the secretary: the
  distinct free-text answers with how many members gave each, and a group to
  pick for all of them at once. A suggestion from simple keywords is shown,
  never applied without a click.
- In reports, a member with text but no group counts as **"Not sorted
  yet"**, so the secretary sees how much is left.

### The household flag (derived, never typed)

- **OFW household** = the household has at least one **current** member
  (`member_is_current(membership_status)`) with `ofw_status = 'Abroad'`.
  **Only members abroad now count** (decided with Dave's answer to include
  former OFWs): a household whose only OFW has come home is no longer an
  OFW household, and loses the badge the day the answer changes.
- **Former OFW household** = none abroad, at least one `'Returned'`. Shown
  in reports, the filter and the household panel's member lines ("Former
  OFW, Qatar 2019–2023"), but not as a badge (it's not what parishes mean
  by "OFW household"). A household with one member abroad and one back home
  is an OFW household, and counts once.
- Worked out in `households_with_count` (last defined in 0057), the view
  every household list reads, as two new columns:
  `ofw_abroad_count int` and `ofw_returned_count int` (subqueries like
  `member_count` already is). No stored column and no trigger, so it can
  never disagree with the members. The registry is a few thousand
  households, so a subquery per row is fine; add a partial index
  `members (household_id) where ofw_status is not null` to keep it cheap.
- `members_with_household` (last defined in 0062) gets the member's own
  columns plus `household_ofw boolean` (any current member abroad), for the
  members list filter "in an OFW household".

### Always on, no Parish Config setting (decided)

- **No switch.** Dave: "there's no switch, it should be always available".
  The OFW questions, badge, filters, columns, reports and census counts are
  there for every parish, as occupation already is. No
  `parish_settings` column, no Parish Config card, no public function to
  read a setting.
- **The questions stay optional.** A family that has no OFW answers "Dili"
  (the default), and a parish that doesn't use it simply sees empty OFW
  reports and no badges. Nothing is required, so nothing blocks a form.
- **The occupation group** is likewise for every parish (the group picker
  and the "By occupation" report).

### Privacy

OFW status is more sensitive than it looks: a list of "households with a
member abroad" is a list of households that receive remittances, and of
children with a parent away. It must never leave the registry.

- **Who sees it in the registry (decided): everyone who sees the member.**
  Full, Read only, Clergy, Website & requests (as they see the registry
  today) and GKK leaders for their own GKK. Dave: blood types should not be
  hidden from GKK leaders, "and the same with OFW details". So there is no
  OFW-specific hiding for any access level: the fields are columns on
  `members`, and the existing row rules (RLS on `members`, 0050, 0062)
  already limit each account to the members it may see. No separate table,
  no redacting view.
- **Who edits it:** whoever edits the member today, i.e. Full access and GKK
  leaders for their GKK (`editRegistry` in `lib/access.js`). Read only,
  Clergy and Website & requests see it read-only.
- **Census Coordinators (GKK leaders)** see and edit OFW details for their
  own GKK's members, filter their lists by it, print them, and get the OFW
  reports for their GKK only (reports already scope a leader to their GKK
  through `leaderGkk(user)`). They don't see other GKKs' OFW numbers, not
  even totals, as for every other report. Visiting the families left behind
  is the main reason parishes want this.
- **Say who sees it.** Update the access notes in `ACCESS_LEVELS`
  (`lib/access.js`) and the README's access table: OFW details are seen
  with the member, by every level that sees the member.
- **Public website: none of it.** No OFW or occupation numbers on the
  website, the Komunidad census page (`public_census_result`, 0114) or the
  public stats (`public_parish_stats`). If a parish later asks for it, at
  most one parish-wide number ("N households have a member working
  abroad"), with the existing rule that a count under 5 isn't shown, and
  never by GKK or by country (a country with two OFWs in a small GKK names
  them). Left out of this plan.
- **Printouts and exports (decided: printable):** the members CSV gets the
  new columns (as it has occupation and blood type already), and printed
  GKK lists and household sheets (`PrintSheet.jsx`) print the OFW line with
  the member, like the other details. No extra tick box. A short line in the print footer is enough of a reminder:
  "Personal data: keep this list safe" (if the footer doesn't say so
  already).
- **Data Privacy notice:** add "if a member works abroad (OFW): the
  country and since when" to what is collected, in the registration form
  (`RegistrationApp.jsx`), the census portal (`CensusPortal.jsx`), the
  paper census form (`CensusPrintSheet.jsx`) and the note in Parish Config.
- **Activity log:** nothing to build for the log itself. `log_activity()`
  (0062) diffs every column of `members`, so the new columns are logged on
  insert, update and delete, with old and new values and who did it, from
  every form. Add their labels to `FIELD_LABELS` in `lib/activity.js`
  ("Occupation group", "OFW", "OFW country", "OFW since", "OFW returned")
  and show the group and status as words, not codes. The census review
  labels in `lib/census.js` (~line 689) get the same.

### Census and the "Practicing Catholic" status

- A member abroad **can't attend Mass in the parish**. Today the census
  answers and the practice score (0017, `member_practice`) would rate them
  low, which is wrong and unkind. **Decided: leave them out.** An OFW
  abroad is shown as **"Abroad"** instead of a practice level, and left out
  of the GKK's practice percentages and the Activeness report, as "Not
  assessed" is. A former OFW back home is rated like everyone else.
- The census asks the OFW question again each year, because it changes
  (people leave and come home). The answer updates `ofw_updated_at`.

## Step 0: GKK leaders see blood types (migration 0121)

Dave's answer: "blood types should not be hidden to GKK leaders". That
changes what leaders see today, so it is its own small step and its own
migration, separate from the OFW work. It can ship first (then it takes the
lower free number).

**What hides them today:**

- **The table's read rule.** Blood types live in their own table,
  `member_blood_types` (0062, "blood types out of GKK leaders' reach"),
  with the policy `member_blood_types_select`: `staff_access() in ('full',
  'read_only', 'website')`. Writes, `member_blood_types_write`: Full only.
  `members_with_household` (0062) reads the blood type through a subquery
  on that table, so for a leader the column comes back null.
- **Report Stats.** `admin_report_stats()` (body last written in 0062,
  first in 0050; 0093 only adds `set application_name =
  'parish:own_gkk_only'`) returns `'blood' = '{}'` and `'blood_unknown' = 0`
  when `staff_access() = 'gkk_leader'`.
- **The app.** The access area `bloodTypes: ['full', 'read_only',
  'website']` in `client/src/lib/access.js` hides the Blood Types page
  (`adminNav.js`), the field in the member window (`MemberDetailModal.jsx`)
  and New Household (`NewHouseholdDrawer.jsx`), the household panel's blood
  types (`HouseholdViewDrawer.jsx`), the members list column and filter
  (`Members.jsx`), printed lists (`PrintSheet.jsx`), and the Report Stats
  panel and "missing blood type" option (`Reports.jsx`). The `gkk_leader`
  note in `ACCESS_LEVELS` says "(not their blood types)".
- **Online census updates** don't ask blood types, because leaders review
  them and couldn't see them (0090's comment): the census portal passes
  `bloodType={false}` to `MemberFieldsGrid` (`CensusPortal.jsx` ~line 718),
  and `portal_new_member_details` (0090) has no blood type key. The public
  registration form already asks it.

**What un-hiding involves:**

- Migration `0121_leader_blood_types.sql` (guard: refuses to run before
  0118):
  - `member_blood_types_select`: also `gkk_leader`, for members the leader
    may see: `or ((select staff_access()) = 'gkk_leader' and exists (select
    1 from members m where m.id = member_blood_types.member_id))`. The
    `members` rules inside the subquery limit it to their GKK (and the
    households with no GKK yet, which they already see, 0093).
  - `member_blood_types_write`: also `gkk_leader` for those same members
    (in both `using` and `with check`), so a leader can record and change a
    blood type when they edit a member, as they edit every other field
    (**decided: yes**). The member window and New Household then show the
    field to them editable; `api.updateMember` already writes it through
    `saveMemberBloodType`. Each change is logged as today (the
    `member_blood_types` trigger, 0062), with the leader's name.
  - **The census portal asks blood types for new members (decided: yes).**
    `portal_new_member_details` gets `'blood_type'`, accepted only when it
    is one of `BLOOD_TYPES` (else dropped, as the other portal fields fall
    back); `census_approve_submission` (and the auto-approve path, 0083)
    writes it to `member_blood_types` for the new member, as the
    registration functions do (0062). Only for **new** members: existing
    members' blood types aren't shown or changed online (the portal doesn't
    show a family their stored details beyond the core fields, and a blood
    type typed by mistake would overwrite a verified one).
    These are the same 0090 functions Phase 1 rewrites for the OFW fields:
    whichever migration runs second starts from the other's text.
  - `admin_report_stats()`: recreate from its 0062 text without the two
    `gkk_leader` cases, so a leader's Report Stats get their GKK's blood
    types (the function already counts only what the caller can read).
    **Re-apply `alter function public.admin_report_stats() set
    application_name = 'parish:own_gkk_only'`** afterwards:
    `create or replace` drops the 0093 setting.
- App: add `'gkk_leader'` to `bloodTypes` in `lib/access.js`, and fix the
  comments that say leaders can't (`access.js`, `HouseholdViewDrawer.jsx`,
  `api.js` `updateMember`). The Blood Types page then lists the leader's
  GKK only (its GKK filter already reads `listCounts('gkks')`, which is the
  leader's GKK alone, 0050).
- App, census portal: drop `bloodType={false}` in `CensusPortal.jsx` so
  new members get the same "Tipo sa dugo" question as in registration, add
  it to the portal payload, and show it in the reviewer's
  `CensusSubmissionDrawer.jsx` and the census review labels
  (`lib/census.js` ~line 689). The paper census form
  (`CensusPrintSheet.jsx`) gets a blood type blank for new members too.
- Text: the `gkk_leader` note in `ACCESS_LEVELS` (now "sees and updates
  their GKK's blood types"), the README's access table, and the Data
  Privacy notes in Parish Config and the census portal (blood type is now
  collected there for new members).
- **Clergy are unchanged** (still no blood types, 0087): Dave's answer was
  about GKK leaders.
- **Audit log plan:** its phase 4 drops `blood_type` from what leaders see
  in their GKK's trail. With this step that redaction isn't needed; note it
  in that plan when it's built.
- Tests: `client/test/access.test.js` expects leaders without
  `bloodTypes`; update it. On demo, as a leader: their GKK's blood types
  show in the member window, list, household panel, Blood Types page and
  Report Stats; another GKK's don't; a direct select on
  `member_blood_types` returns only their GKK's rows; they can set and
  change one for their GKK's member (logged with their name) but an insert
  for another GKK's member is refused. Census portal: a new member with a
  blood type → the reviewer sees it, approval (and auto-approval) stores
  it; a value not in the list is dropped. `census.test.js` covers the
  payload and the review label.
- No Edge Function changes.

## Phase 1: the database (migration 0120)

`0120_member_ofw.sql`, safe to re-run, refuses to run before 0118 (the
`do $$ … raise exception` guard every recent migration has):

- `alter table members add column if not exists` the six new columns, the
  check constraints, the partial index. No parish setting (always on).
- **Views:** `households_with_count` (+ `ofw_abroad_count`,
  `ofw_returned_count`) and `members_with_household` (+ the member columns,
  `household_ofw`). Recreate them from their latest text (0057, 0062) with
  the columns added at the end, so `h.*` and existing selects keep working.
- **Registration and New Household:** `submit_registration_base`,
  `submit_family_registration_base` and `create_household_base` (last
  defined in 0062) insert the new columns from the payload
  (`nullif(trim(mem->>'occupation_group'), '')`, etc.). Check 0099 (registration rate limit) still
  wraps them unchanged.
- **Census portal:** `portal_member_fields` and `portal_clean_member_fields`
  (0054) carry `occupation`, `occupation_group` and the OFW fields, so families can update them for existing members;
  `portal_new_member_details`, `portal_submit` and
  `census_approve_submission` (last defined in 0090) pass them through and
  apply them on approval. Validation as in the table above; a bad value
  falls back to what's there, as the other portal fields do.
- **Merges:** the member merge in 0081 (`coalesce(nullif(trim(k.occupation),
  ''), o.occupation)`) gets the same line for each new column.
- **Trash and restore:** check `trash_snapshot` / `restore_deleted` (0062)
  restore every column from the snapshot (they work from `to_jsonb(row)`;
  confirm no column list needs the new ones).
- **Reports' numbers:** `admin_report_stats()` (body last written in 0062;
  0093 adds its `application_name` setting, which must be re-applied after
  `create or replace`) adds `ofw` = `{ households_abroad, members_abroad,
  members_returned, by_gkk: [{ gkk, households, members }], by_country:
  [{ country, members }] }`, scoped for a GKK leader as the rest of that
  function is, and `occupation_groups: [{ group, members }]`. Step 0 also
  rewrites this function: whichever migration runs second starts from the
  other's text.
- **Census snapshot:** the census close that writes `census_results`
  (0082) also stores the OFW household and member counts per GKK, so a past
  census's OFW numbers stay as they were.
- **Practice:** `member_practice` (last defined in 0077) returns `level = 'Abroad'`
  for a current member with `ofw_status = 'Abroad'`, and the GKK practice summaries skip them.

## Phase 2: the forms

Shared: `OCCUPATION_GROUPS`, `OFW_STATUSES`, `OFW_COUNTRIES` (Saudi Arabia,
United Arab Emirates, Qatar, Kuwait, Hong Kong, Singapore, Taiwan, Japan,
South Korea, Malaysia, United States, Canada, Italy, United Kingdom,
Australia, At sea (seafarer), Other) in `constants.js`; `blankMember()`
(`constants.js` ~line 105) gets the new fields. One component,
`OfwFields` in `components/MemberFields.jsx`, used by all four forms, so the
question reads the same everywhere:

- **"Trabaho"** stays the text box; beside it a **"Klase sa trabaho"**
  select (the groups), optional. **Decided: hidden for members under 15**
  (by birthday, as `askedForAge` in `lib/household.js` does for other
  questions); they don't count in the occupation report either (it's
  members 15 and over).
- **"Nagtrabaho ba siya sa gawas sa nasud (OFW)?"** Dili / Oo, naa pa sa
  gawas sa nasud karon (abroad now) / Kaniadto, nakauli na (former OFW).
  Only for members 18 and over.
  - Abroad: **"Asa nga nasud?"** (list, with Other → text) and
    **"Kanus-a nagsugod ang karon nga kontrata? (tuig)"** (start of the
    current contract).
  - Former OFW: **"Asa nga nasud ang katapusan?"**, **"Kanus-a nagsugod ang
    katapusan nga kontrata? (tuig)"**, **"Kanus-a nakauli? (tuig)"**.
  - A line under it: "Ang OFW nga naa sa gawas sa nasud kabahin gihapon sa
    pamilya." (an OFW abroad is still part of the family).

Where it goes:

1. **Public registration** ("Irehistro ang Inyong Pamilya",
   `pages/RegistrationApp.jsx`, through `MemberFieldsGrid`): the members
   step, under occupation. The review step lists it. The payload gets the
   new keys.
2. **Census portal** (`/census`, `pages/CensusPortal.jsx` and
   `components/MemberCensusCards.jsx`): for **each existing member**, the
   card shows the current occupation and OFW answer with "Change" (new:
   today they can't change occupation), and new members get the same
   fields. The submission drawer (`CensusSubmissionDrawer.jsx`) shows the
   changes as old → new for the reviewer, as for other fields.
3. **Staff New Household** (`components/NewHouseholdDrawer.jsx`): English
   labels, as the rest of that drawer ("Occupation group", "Works abroad
   (OFW)?" with "Abroad now" / "Former OFW (back home)", "Country",
   "Current contract since (year)" or "Last contract from (year)", "Came
   home (year)").
4. **The member window** (`components/MemberDetailModal.jsx`): the same, in
   the details section, and on its save payload (~line 148). Read-only for
   Read only, Clergy and Website & requests, as the other fields.
5. **Paper census form** (`components/CensusPrintSheet.jsx`): a line per
   member, "OFW? ☐ Dili ☐ Naa sa gawas karon ☐ Nakauli na · Nasud: ____ ·
   Kontrata sukad: ____ · Nakauli: ____",
   and the occupation group as tick boxes would be too long: a blank for
   the occupation, sorted later with the Sort occupations tool.

## Phase 3: lists, filters and search

- **Households list** (`pages/admin/Households.jsx`): an **OFW** badge
  (small, with a plane or globe icon and the count when 2+: "OFW ×2") next
  to the household name in the row and the card view. Filter
  **"OFW: Any / Has a member abroad / Former OFW / No OFW"**, kept in the
  address bar with the others (`useUrlState`, `URL_ALLOWED`), applied in
  `api.listHouseholds` on `ofw_abroad_count` / `ofw_returned_count`. The
  household CSV (`HOUSEHOLD_CSV_COLUMNS`) gets "OFW members abroad".
- **Household panel** (`components/HouseholdViewDrawer.jsx`): the badge in
  the header, and per member "OFW · Saudi Arabia since 2019" or "Former OFW
  (Qatar, 2015–2022)" under the occupation (~line 214).
- **Members list** (`pages/admin/Members.jsx`): under "More filters",
  **"OFW: Any / Abroad now / Former OFW / In an OFW household"** and
  **"Occupation: Any / each group / Not sorted yet"**, added to
  `DEFAULT_FILTERS` and `URL_ALLOWED`, applied in `applyMemberFilters`
  (`api.js`). The search box also matches `occupation` and `ofw_country`
  (today it searches name, household and contact). The members CSV
  (`MEMBER_CSV_COLUMNS`) gets "Occupation group", "OFW", "OFW country",
  "OFW since", "OFW returned".
- **Dashboard:** no new tile in this plan (the dashboard is already full);
  the OFW household count shows on Report Stats.

## Phase 4: reports

In `pages/admin/Reports.jsx` (`REPORTS`), with the row builders in
`lib/reports.js` (pure, unit tested, as `breakdownRows` and
`familiesByGkkRows` are):

- **Members → "By occupation"** (every parish): members 15+ by occupation
  group, with "Not sorted yet" and "Not given"; GKK control. Built on
  `breakdownRows(members, 'occupation_group', …)`.
- **New source "OFW"** (for everyone who has Reports, like the Members
  source):
  - **"OFW households by GKK"**: per GKK, households, OFW households, the
    share, OFW members abroad. The GKK leader sees their GKK's row.
  - **"OFW members by country"**: countries, members abroad, then
    returned.
  - **"OFWs by kind of work"**: occupation groups of OFWs abroad, land- or
    sea-based.
  - **"Families with a parent abroad"**: households where a Head, Spouse,
    Father or Mother is abroad and there are children under 18, with the
    children's count. The pastoral list GKK leaders asked for; names shown
    to staff only, as the other Generate Report lists.
  - **"Returned OFWs"**: members back home, with when; for livelihood or
    reintegration programs.
  - **"OFW details to check"**: abroad with no country, or "since" over 15
    years ago and no census answer in the last 2 years (likely back home).
- **Report Stats tab:** a panel **"OFW households"** (households with a
  member abroad, members abroad, top 5 countries, per GKK) and **"Occupation
  groups"**, from the new `admin_report_stats()` keys; in the printable and
  CSV versions too (`statsSections`).
- **Census:** **"Results by GKK"** gets an OFW households column, from the
  `census_results` snapshot for closed censuses; **"Compared with the census
  before"** gets the change in OFW households. Members abroad are counted
  as "Abroad" in the census results, not as not confirmed.
- **Data quality → "Members with missing details":** "Occupation group"
  becomes one of the missing fields (`MISSING_FIELDS`), and "Sort
  occupations" (the tool from Decisions) opens from that report and from
  Report Stats' occupation panel. Full access and GKK leaders (their GKK).

## Out of scope

- **Anything on the public website** (see Privacy). Revisit only on a
  parish's request, with totals only.
- **OWWA / POEA numbers, employer, salary, remittances, contract end
  dates.** Not the parish's business, and a risk to hold.
- **A full job history** (each contract and country). One current or last
  stint is enough for pastoral use.
- **Messages to OFWs abroad** (email or SMS through `notify-staff`). The
  contact field is already there; a separate plan if wanted.
- **Converting old occupation text automatically** (see Decisions).

## Tests and checks

- `client/test/ofw.test.js`: the report row builders (by GKK, by country,
  by kind of work, families with a parent abroad, by occupation with "Not
  sorted yet"); the household flag counts only **current** members
  **abroad**; the forms' payload clears the OFW fields when the answer is
  "Dili"; `blankMember()` has the new keys.
- Migration text test (reading the file, as `hero-symbols.test.js` does):
  the columns, checks, index, the views' new columns, and that
  every function rewritten keeps its 0062/0090 guards.
- `census.test.js`: the portal payload and the review diff include the new
  fields for existing members (it already checks `occupation` for new ones,
  line ~208).
- On demo, after the migration:
  - register a family online with one member abroad → the
    household shows the OFW badge, the activity log has the member's insert
    with the OFW fields as "Families and website forms";
  - change it in the member window → an update entry with old and new and
    the staff name;
  - census portal: mark them "Nakauli na" → the reviewer sees the change,
    approval clears the badge, the household moves to "Former OFW";
  - a GKK leader sees, edits, filters and prints their GKK's OFW
    households and gets only their GKK's row in the OFW reports; Read only,
    Clergy and Website & requests see but can't edit;
  - a household whose only OFW comes home loses the badge and shows under
    "Former OFW"; one with a member abroad and one back home counts once,
    as an OFW household;
  - an OFW abroad shows "Abroad" in the members list and is left out of
    the GKK's practice percentages;
  - `public_census_result()` and `public_parish_stats()` output is
    unchanged (no OFW key).
- Browser: the four forms on a phone (the OFW block shouldn't make the
  members step much longer when the answer is "Dili"), the badge and
  filters in light and dark.

## Release

Two minor releases, or one if both are ready together, each with a note on
the releases page (`npm run releases:new`). No Edge Function changes, so
nothing to redeploy. Migrations in order, demo first:

1. `0121_leader_blood_types.sql` (Step 0; it takes the lower free number
   if it ships first). Note: "Census Coordinators (GKK leaders) now see
   their GKK's blood types."
2. `0120_member_ofw.sql`. Note: "Every parish can now record OFW members
   (abroad now or back home), see OFW households in the lists and reports,
   and group occupations for reports."

Each on demo first (`npm run release:db -- demo`), then every parish
(`npm run release:db -- all`). Before the OFW release, Dave checks the
Bisaya labels.

## Order of work

0. Step 0: leaders see blood types (migration, `access.js`, texts, the
   access test). *(small; independent, can go first)*
1. Phase 1 migration (columns, views, functions, report stats).
   *(medium: several functions are rewritten from their latest text)*
2. Phase 2 forms, starting with `OfwFields` and the member window, then
   New Household, registration, census portal, paper form. *(medium)*
3. Phase 3 lists and filters. *(small)*
4. Phase 4 reports and the Sort occupations tool. *(medium)*

If the audit log plan (0119) is built first, nothing here conflicts: the
new member columns are logged by the same trigger, and its GKK stamp
covers them.

## Decided (2026-11-12, Dave)

- Always available to every parish; no Parish Config switch.
- Website & requests and GKK leaders see OFW details; no hiding by access
  level (Privacy). GKK leaders also see blood types (Step 0).
- OFWs abroad are left out of the practice score (Census section).
- Former OFWs are recorded; the household flag counts only those abroad
  now (Household flag).
- "Since when" is the start of the current contract (the member table).
- The occupation group is hidden for members under 15 (Phase 2).
- OFW details are printable (Privacy).
- Dave checks the Bisaya labels before release.
- GKK leaders can also set and change their GKK's blood types (Step 0).
- The census portal asks blood types for new members (Step 0).

## Open questions

None left. New questions found while building go here.
