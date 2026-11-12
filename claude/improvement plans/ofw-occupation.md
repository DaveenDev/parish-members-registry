# Improvement plan: OFW and occupation

> **Status:** proposed 2026-11-12, not started.
> **Goal:** a parish that wants it can record which members are **OFWs**
> (Overseas Filipino Workers), where and since when, and each member's
> **occupation** in a form that can be counted. A household with a member
> abroad is flagged **OFW household** by itself, and the secretary and GKK
> leaders can list, filter and report on them (pastoral visits to families
> left behind, the census, the parish's picture of its people).
> **Per parish:** off until the parish turns it on in Parish Config.
> **Migration:** `0120_member_ofw.sql`. 0118 is the latest today and the
> audit log plan has reserved 0119; take the next free number at build time
> (check `origin/main` first, other sessions add migrations).
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

## Decisions (defaults to confirm)

### What to record for each member

Columns on `members` (not a separate table, see Privacy below for why):

| Column | Type | Meaning |
| --- | --- | --- |
| `occupation` | text (exists) | As now: their own words, e.g. "Nurse at Davao Doctors". Kept free text. |
| `occupation_group` | text, null | **New.** One of a short fixed list (below), so it can be counted. |
| `ofw_status` | text, null | **New.** `null` = not an OFW (or not asked); `'Abroad'` = working abroad now; `'Returned'` = a former OFW, back home. |
| `ofw_country` | text, null | **New.** Where they work (or worked). A list of the common destinations plus "Other" with a typed name. |
| `ofw_since` | smallint, null | **New.** Year they first left (or the year of the current contract; "since when" is what parishes ask). |
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

The Bisaya wording is a first draft: have someone from the parish read it
before release, as for the other public labels.

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
- **Former OFW household** = none abroad, at least one `'Returned'`. Shown
  in reports and the filter, but not as a badge (it's not what parishes
  mean by "OFW household").
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

### Per-parish setting

- `parish_settings.record_ofw boolean not null default false`. **Off by
  default**, including for parishes already running: nothing changes for a
  parish until it turns it on.
- **Where:** Settings → Parish Config tab (`ProfileTab` in
  `pages/admin/ParishConfig.jsx`), a card **"OFW members"** with one
  switch, a sentence on what it adds, and a link to the Data Privacy note.
  Full access only (the Parish Config tab already is).
- **What it switches:** the OFW questions in all four forms, the OFW badge,
  filters and columns, the OFW reports and the census OFW counts.
  Turning it **off hides, never deletes**: the data stays, and comes back
  when it's turned on again. Say so on the card.
- **The occupation group is not behind the switch.** Occupation is already
  asked everywhere; the group just makes it countable. Every parish gets the
  group picker and the "By occupation" report.
- **The public forms read it** through a small
  `public_parish_record_ofw()` (security definer, returns a boolean), as the
  home page reads `public_parish_hero_symbol()` (0117). Staff pages read it
  from the parish settings they already load (`layout.parish`).
- Server side, the registration and portal functions **ignore OFW fields
  when the setting is off**, so an old cached form can't write them.

### Privacy

OFW status is more sensitive than it looks: a list of "households with a
member abroad" is a list of households that receive remittances, and of
children with a parent away. It must never leave the registry.

- **Who sees it in the registry:** everyone who sees the member already
  (Full, Read only, Clergy, GKK leaders for their own GKK, Website &
  requests as today for the registry). GKK leaders are the ones who visit
  the families left behind, which is the main reason parishes want this,
  so they need it. That is why it's columns on `members` and not a separate
  table with its own rules like blood types (0050, 0062): the existing RLS
  already limits each account to the members it may see.
  - **Open question** below: whether Website & requests accounts should be
    kept from it (they don't visit families). If so, the same way blood
    types are kept from GKK leaders: the view returns null for them.
- **Census Coordinators (GKK leaders)** see and edit OFW details for their
  own GKK's members, filter their lists by it, and get the OFW reports for
  their GKK only (reports already scope a leader to their GKK through
  `leaderGkk(user)`). They don't see other GKKs' OFW numbers, not even
  totals, as for every other report.
- **Public website: none of it.** No OFW or occupation numbers on the
  website, the Komunidad census page (`public_census_result`, 0114) or the
  public stats (`public_parish_stats`). If a parish later asks for it, at
  most one parish-wide number ("N households have a member working
  abroad"), with the existing rule that a count under 5 isn't shown, and
  never by GKK or by country (a country with two OFWs in a small GKK names
  them). Left out of this plan.
- **Printouts and exports:** the members CSV gets the new columns (as it
  has occupation and blood type already); printed GKK lists
  (`PrintSheet.jsx`) do **not** print OFW details unless the person ticks
  "Include OFW details" (default off), so a list left on a table at a
  meeting doesn't carry them.
- **Data Privacy notice:** add "if a member works abroad (OFW): the
  country and since when" to what is collected, in the registration form
  (`RegistrationApp.jsx`), the census portal (`CensusPortal.jsx`), the
  paper census form (`CensusPrintSheet.jsx`) and the note in Parish Config.
  Only when the setting is on.
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
  low, which is wrong and unkind. Default: an OFW abroad is shown as
  **"Abroad"** instead of a practice level, and left out of the GKK's
  practice percentages, as "Not assessed" is. (Open question: some parishes
  may prefer to rate them on what the family reports.)
- The census asks the OFW question again each year, because it changes
  (people leave and come home). The answer updates `ofw_updated_at`.

## Phase 1: the database (migration 0120)

`0120_member_ofw.sql`, safe to re-run, refuses to run before 0118 (the
`do $$ … raise exception` guard every recent migration has):

- `alter table members add column if not exists` the six new columns, the
  check constraints, the partial index.
- `alter table parish_settings add column if not exists record_ofw boolean
  not null default false`; `public_parish_record_ofw()`.
- **Views:** `households_with_count` (+ `ofw_abroad_count`,
  `ofw_returned_count`) and `members_with_household` (+ the member columns,
  `household_ofw`). Recreate them from their latest text (0057, 0062) with
  the columns added at the end, so `h.*` and existing selects keep working.
- **Registration and New Household:** `submit_registration_base`,
  `submit_family_registration_base` and `create_household_base` (last
  defined in 0062) insert the new columns from the payload
  (`nullif(trim(mem->>'occupation_group'), '')`, etc.), with the OFW ones
  only when `record_ofw` is on. Check 0099 (registration rate limit) still
  wraps them unchanged.
- **Census portal:** `portal_member_fields` and `portal_clean_member_fields`
  (0054) carry `occupation`, `occupation_group` and, when on, the OFW
  fields, so families can update them for existing members;
  `portal_new_member_details`, `portal_submit` and
  `census_approve_submission` (last defined in 0090) pass them through and
  apply them on approval. Validation as in the table above; a bad value
  falls back to what's there, as the other portal fields do.
- **Merges:** the member merge in 0081 (`coalesce(nullif(trim(k.occupation),
  ''), o.occupation)`) gets the same line for each new column.
- **Trash and restore:** check `trash_snapshot` / `restore_deleted` (0062)
  restore every column from the snapshot (they work from `to_jsonb(row)`;
  confirm no column list needs the new ones).
- **Reports' numbers:** `admin_report_stats()` (last defined in 0093) adds
  `ofw` = `{ households_abroad, members_abroad, members_returned,
  by_gkk: [{ gkk, households, members }], by_country: [{ country, members
  }] }`, only when `record_ofw` is on, scoped for a GKK leader as the rest
  of that function is. And `occupation_groups: [{ group, members }]` always.
- **Census snapshot:** the census close that writes `census_results`
  (0082) also stores the OFW household and member counts per GKK, so a past
  census's OFW numbers stay as they were.
- **Practice:** `member_practice` (last defined in 0077) returns `level = 'Abroad'`
  for a current member with `ofw_status = 'Abroad'` when the setting is on,
  and the GKK practice summaries skip them.

## Phase 2: the forms

Shared: `OCCUPATION_GROUPS`, `OFW_STATUSES`, `OFW_COUNTRIES` (Saudi Arabia,
United Arab Emirates, Qatar, Kuwait, Hong Kong, Singapore, Taiwan, Japan,
South Korea, Malaysia, United States, Canada, Italy, United Kingdom,
Australia, At sea (seafarer), Other) in `constants.js`; `blankMember()`
(`constants.js` ~line 105) gets the new fields. One component,
`OfwFields` in `components/MemberFields.jsx`, used by all four forms, so the
question reads the same everywhere:

- **"Trabaho"** stays the text box; beside it a **"Klase sa trabaho"**
  select (the groups), optional. Hidden for children under 15
  (`askedForAge`, `lib/household.js`), who get "Student" by default only if
  the family picks it.
- **"Nagtrabaho ba siya sa gawas sa nasud (OFW)?"** Dili / Oo, naa pa sa
  gawas sa nasud karon / Kaniadto, nakauli na. Only for members 18 and over,
  only when `record_ofw` is on.
  - Abroad: **"Asa nga nasud?"** (list, with Other → text) and **"Sukad
    kanus-a? (tuig)"**.
  - Returned: the country, **"Sukad kanus-a"**, **"Kanus-a nakauli? (tuig)"**.
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
   (OFW)?", "Country", "Since (year)", "Came home (year)").
4. **The member window** (`components/MemberDetailModal.jsx`): the same, in
   the details section, and on its save payload (~line 148). Read-only for
   Read only and Clergy, as the other fields.
5. **Paper census form** (`components/CensusPrintSheet.jsx`): a line per
   member, "OFW? ☐ Dili ☐ Naa sa gawas ☐ Nakauli · Nasud: ____ · Sukad: ____",
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
- All OFW filters, badges and columns are hidden when `record_ofw` is off.

## Phase 4: reports

In `pages/admin/Reports.jsx` (`REPORTS`), with the row builders in
`lib/reports.js` (pure, unit tested, as `breakdownRows` and
`familiesByGkkRows` are):

- **Members → "By occupation"** (every parish): members 15+ by occupation
  group, with "Not sorted yet" and "Not given"; GKK control. Built on
  `breakdownRows(members, 'occupation_group', …)`.
- **New source "OFW"** (`need`: the setting, not an access area; shown
  only when `record_ofw` is on):
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
  the columns, checks, index, the setting, the views' new columns, and that
  every function rewritten keeps its 0062/0090 guards.
- `census.test.js`: the portal payload and the review diff include the new
  fields for existing members (it already checks `occupation` for new ones,
  line ~208).
- On demo, after the migration:
  - setting off: none of the OFW questions, badges, filters or reports
    show, and a registration payload with OFW keys stores nothing;
  - setting on: register a family online with one member abroad → the
    household shows the OFW badge, the activity log has the member's insert
    with the OFW fields as "Families and website forms";
  - change it in the member window → an update entry with old and new and
    the staff name;
  - census portal: mark them "Nakauli na" → the reviewer sees the change,
    approval clears the badge, the household moves to "Former OFW";
  - a GKK leader sees and filters their GKK's OFW households and gets only
    their GKK's row in the OFW reports; Clergy and Read only see but can't
    edit;
  - `public_census_result()` and `public_parish_stats()` output is
    unchanged (no OFW key).
- Browser: the four forms on a phone (the OFW block shouldn't make the
  members step much longer when the answer is "Dili"), the badge and
  filters in light and dark.

## Release

A minor release (new feature, one migration, no function), with a note on
the releases page (`npm run releases:new`): "Parishes can now record OFW
members (Parish Config → OFW members, off by default) and every parish can
group occupations for reports." Run the migration on demo first, then each
parish: `npm run release:db -- demo`, then `npm run release:db -- all`.
Turn the setting on in demo for the training session; leave it off
elsewhere until a parish asks.

## Order of work

1. Phase 1 migration (columns, setting, views, functions, report stats).
   *(medium: several functions are rewritten from their latest text)*
2. Phase 2 forms, starting with `OfwFields` and the member window, then
   New Household, registration, census portal, paper form. *(medium)*
3. Phase 3 lists and filters. *(small)*
4. Phase 4 reports and the Sort occupations tool. *(medium)*

If the audit log plan (0119) is built first, nothing here conflicts: the
new member columns are logged by the same trigger, and its GKK stamp
covers them.

## Open questions

- **Website & requests accounts:** may they see OFW details (they see the
  registry today), or should the view hide them as blood types are hidden
  from GKK leaders?
- **Practice score for OFWs abroad:** show "Abroad" and leave them out
  (default), or rate them from what the family reports?
- **Former OFWs:** worth recording at all, or only "abroad now"? Recording
  them helps reintegration programs but is more to ask.
- **"Since when":** the year they first left, or the start of the current
  contract? Families answer the first more reliably (default).
- **Occupation for children:** hide the group under 15 (default), or ask
  everyone and let "Student" fill most?
- **Printed lists:** off by default for OFW details (default), or never
  printable?
- **Bisaya labels:** who in the parish checks the wording before release?
