# Improvement plan: GKK-level audit log

> **Status:** proposed 2026-11-05, not started. Decided the same day: GKK
> leaders also see their own GKK's trail (phase 4 is in the build).
> **Goal:** when something goes wrong in a GKK (a household vanished, a
> phone number changed, a member was added twice), the secretary opens one
> screen, picks the GKK, and sees **who added, edited or deleted whom, and
> when**. The GKK's leader sees the same for their own GKK.
> **Migration:** `0119_activity_gkk.sql` (next free number at build time;
> check `origin/main` first, other sessions add migrations).
> **Edge Functions:** none changed, nothing to redeploy.

## Does an audit log already exist?

Yes, and it is a good base: **Settings → Activity log** (`activity_log`,
0014, widened in 0076 and 0102). The plan extends it; it does not add a
second log.

What it already does:

- **Who and when:** every entry has the account (`actor`), its name as it
  was then (`actor_name`) and a time. Entries made by families online have
  no name and show as "Families and website forms".
- **What:** insert, update (each field `[old, new]`), delete, trash and
  restore, written by database triggers, so no screen can forget to log and
  nobody can edit or delete an entry (insert/update/delete are revoked from
  every signed-in role).
- **Covers:** households, members, sacrament verifications, requests, the
  census (online updates approved or rejected, renewed codes, last-year
  lists), GKK documents, the GKK list, website content, parish settings and
  staff accounts. Secrets are never recorded.
- **Where it shows:** the Activity log page, and "History" in the member
  window and the household drawer. The CSV export has it too.
- **Who may read it:** Full access and Read only (`activity` in
  `lib/access.js`, enforced by RLS). GKK leaders and Clergy can't.
- A deleted household or member also sits in the **Trash** for 3 months,
  with a full snapshot, so a deletion can be undone.

## What is missing (why this plan)

1. **No GKK on an entry.** `activity_log` has `household_id` and
   `member_id` but no GKK. The only way to ask "what happened in Meohao?" is
   to join through `households.gkk`, which fails when:
   - the household **moved GKK** since (the entry is then filed under the
     new GKK, and the old GKK never sees it);
   - the household was **deleted** (the join finds nothing; the GKK is only
     inside the Trash snapshot, which is purged after 3 months);
   - the GKK was **renamed** (names are text, kept in step by a cascade, but
     a snapshot in the log would go stale).
2. **The page can't filter by GKK**, or by person. The "Who" filter only
   offers "Staff and the public" and "Families and website forms", although
   `api.listActivity` already accepts an `actor` name. There is no action
   filter (added / changed / deleted) and no date range.
3. **A deletion's last step is silent.** Trashing is logged. But when a
   trashed record is removed for good (`purge_deleted`, or the daily
   `purge_expired_trash` after 3 months), nothing is logged. After 3 months
   the secretary can see *that* "X was deleted by Y", but never that the
   copy is gone.
4. **GKK leaders edit but can't see their own trail.** They write to the
   registry for their GKK, and every edit carries their name, but only the
   secretary can read it.
5. **Some GKK-related writes may not be logged.** To confirm, in the
   coverage audit below: member service history (0071), the GKK structure
   and leaders form (0081), and merges (0075).

## Decisions (defaults to confirm)

- **Snapshot the GKK on each entry, by id.** New columns `gkk_id integer`
  and `gkk_name text`, no foreign key (the log outlives the records, as
  `household_id` already does). Filters use `gkk_id`, so a rename doesn't
  split a GKK's history; the page shows the GKK's current name from `gkks`
  and falls back to `gkk_name` for a GKK that has since been deleted.
- **A move is in both GKKs.** An update that changes `households.gkk`
  stores the new GKK in `gkk_id` and the old in `gkk_from_id`. A GKK's view
  matches either, so the old GKK can see "Household X was moved out by
  Y".
- **Entries with no GKK stay visible**, labelled "Parish-wide" (website,
  settings, requests) or "No GKK yet" (households not yet assigned, which
  GKK leaders may pick up).
- **Who sees what.** Full and Read only see every entry, as today. **GKK
  leaders see only their own GKK's entries**, through a redacting function
  (phase 4), never the table. Clergy and Website & requests see none.
- **Tell leaders they are recorded.** Their My GKK page says that changes to
  their GKK's records are kept with their name and seen by the parish
  office. It's fair to them, and it's the point of the log.
- **Keep one account per person.** The log is only as good as the names in
  it. A shared login (the secretary's laptop, the Demo login) makes "who"
  mean "someone at the office". Say so on the staff accounts page; no code.

## Phase 1: stamp the GKK on every entry (migration 0119)

- `alter table activity_log add column if not exists gkk_id integer,
  add column if not exists gkk_name text, add column if not exists
  gkk_from_id integer;` and `create index ... on activity_log (gkk_id, at
  desc)`, plus one on `gkk_from_id`.
- **`log_activity()`** (households, members, verifications) sets them from
  the row: a household's own `gkk`; a member's or verification's household;
  on a household update that changes `gkk`, also `gkk_from_id`.
- **`trash_household`, `trash_member`, `restore_deleted`** (and
  `restore_trashed_record`) stamp the GKK on their summary entries, from the
  snapshot when restoring.
- **`log_record_activity()` and the 0102 triggers** set it where the record
  has one: `gkk_documents` (`gkk_id`), `gkks` (itself),
  `census_last_year_list` (its GKK), census reviews and renewed codes (the
  household's GKK). Everything else stays null.
- **Look up by name, store by id:** `households.gkk` is a name, so a small
  `activity_gkk_of(name text)` returns `(id, name)` from `gkks`.
- **Backfill** in the same migration, in order, best effort: entries with a
  `household_id` from `households`; those whose household is gone from the
  Trash snapshots in `deleted_records`; the rest from `changes` where it
  holds a `gkk` (an old `households.gkk` update). What can't be found stays
  null and shows as "GKK unknown (before 0119)". The migration says how many.
- Safe to re-run, and a database before it still works: the page falls back
  to today's behavior, as with 0117 and 0118 (`'gkk_id' in row`).

## Phase 2: the secretary's investigation view

On **Settings → Activity log** (`pages/admin/ActivityLog.jsx`,
`api.listActivity`, URL-kept filters via `useUrlState`):

- **GKK filter** (every GKK, "Parish-wide", "No GKK yet"), matching
  `gkk_id` or `gkk_from_id`.
- **Who filter by person:** the staff names that appear in the log, plus
  "Families and website forms". Uses the existing `actor` argument.
- **Action filter:** Added, Changed, Deleted (trash), Restored, and, from
  phase 3, Removed for good.
- **Date range** (from, to), defaulting to the last 30 days with "All time".
- **A GKK chip on each entry**, and, for a move, "Meohao → Quiot".
- **"This GKK at a glance"** above the list when a GKK is picked: changes in
  the last 30 days by person and by action, and the last deletions with a
  link to the Trash to restore them (while inside 3 months). One RPC,
  `activity_gkk_summary(p_gkk_id, p_days)`, so the counts aren't computed
  in the browser from 20-row pages.
- **CSV export** gets the GKK, and respects the filters.
- The same GKK filter on the household drawer's History isn't needed: it
  is already one household.

## Phase 3: close the gaps

- **Log the final removal.** Allow action `'purge'` in the table's check
  constraint; `purge_deleted` and `purge_expired_trash` write one entry per
  record with its name, who removed it (or "Automatic clean-up after 3
  months"), and its GKK. Without this, the log goes quiet exactly when the
  Trash copy disappears.
- **Coverage audit.** List every table staff can write to, and confirm each
  either has a log trigger or is deliberately left out. Expected to find:
  member service history, GKK structure/leaders, merges. Add triggers or
  summary entries (a merge is one entry naming both households and the
  GKKs), and leave a test that fails when a new staff-writable table has
  neither (`client/test/`, reading the migrations as `hero-symbols.test.js`
  does).

## Phase 4: GKK leaders see their own GKK's trail

Why: leaders are accountable for their GKK's records, and the secretary
wouldn't be asked "who changed this?" for every question. Leaders can
already see and edit these households, so the log shows them nothing about
a household they couldn't open, as long as the rules below hold.

- **Access:** new area `gkkActivity` in `lib/access.js` for `full`,
  `read_only` and `gkk_leader`. Update the GKK leader line in
  `ACCESS_LEVELS`, the README's access table and the Data Privacy notice.
- **Through a function, never the table.** `list_gkk_activity(...)`
  (security definer, same filters and paging as the page) returns rows
  where `gkk_id` or `gkk_from_id` is the leader's own GKK id
  (`profiles.access_gkk_id`, 0063; a small `staff_gkk_id()` helper). The RLS
  on `activity_log` stays Full and Read only, so a leader's direct query on
  the table is still refused. For Full and Read only the same function takes
  any `p_gkk_id`, so the page has one code path.
- **What a leader never gets:**
  - **Parish-wide entries:** requests, website, settings, staff accounts,
    the census cycle. Only entries with a GKK, and only theirs.
  - **Households with no GKK yet.** A leader may pick one up, but until it
    is theirs its history isn't. Once moved in, the move is shown ("No GKK →
    Meohao") and what follows.
  - **Blood types:** `blood_type` is dropped from `changes` (0050 keeps
    them from leaders).
  - **What happened to a household after it left their GKK.** The entry that
    moved it out is theirs, but it shows only the move (the `gkk` field,
    from and to), not the other fields changed in the same save; later
    entries on that household belong to its new GKK.
- **What they do get:** who (staff names, including the secretary's: they
  work together), when, what changed with old and new values, and
  deletions and restores. There's no link to the Trash: it stays full
  access, so a leader asks the office to restore something.
- **Where it shows.** A new **Activity** tab in **My GKK** (Settings → My
  GKK, `ParishConfig.jsx`), the same list as the secretary's with the GKK
  filter hidden. "History" in the household and member windows also opens
  for a leader's own households, through the same function.
- **Their own edits in it.** Entries made by the leader are marked "You".

Cost of this choice, accepted: a wider audience for old and new phone
numbers, addresses and census answers. They are the leader's own
households, and the redaction above keeps blood types and other GKKs out.
The redaction is what must be tested hardest (see below).

## Out of scope

- **Logging who looked** at a record (reads). Heavy, and not what "who
  edited, deleted, added" asks.
- **IP addresses and devices.** Not available to database triggers on
  Supabase, and not needed for an office this size.
- **A tamper-proof chain (hashes).** Entries can't be changed through the
  app already; someone with the Supabase dashboard could. Out of reach of
  this plan, covered by who holds the project login.
- **"Revert this change" from the log.** Possible later from the stored old
  values; deletions are already undone from the Trash.
- **Archiving old entries.** Estimated at under 10 MB a year at today's
  volume (my estimate, not measured: check `pg_total_relation_size
  ('activity_log')` on each parish's database first), so keep everything.
  Revisit only if a database nears the free plan's limit.

## Tests and checks

- `client/test/activity-gkk.test.js`: the filters build the right query
  (GKK matches `gkk_id` or `gkk_from_id`; person; action; dates); entries
  show the chip and the move; a database before 0119 falls back.
- Migration text test: the columns, indexes, the `'purge'` action and the
  triggers named above exist.
- SQL checks to run on demo after the migration (the secretary's own
  questions as queries):
  - edit a household as a GKK leader → one entry, that leader's name, that
    GKK;
  - move it to another GKK → shows under both;
  - delete it → "trash" entry carries the GKK, which is still there after
    the household is gone;
  - purge it from the Trash → a "purge" entry.
- **Leader redaction (phase 4), on demo with a real leader account and a
  second GKK's leader.** Each must hold:
  - the leader sees their GKK's entries and none of another GKK's;
  - a direct `select` on `activity_log` is refused, and only
    `list_gkk_activity` answers;
  - a member's `blood_type` change shows the other fields but not the blood
    type;
  - no request, website, settings or staff-account entry appears;
  - a household moved out of their GKK: the move shows, the other fields of
    that save don't, and later edits don't;
  - an unassigned household's edits don't appear until it is moved in;
  - Clergy and Website & requests accounts get nothing;
  - Full and Read only see exactly what they saw before.
  Also a unit test over the function's SQL text in `client/test/`, as for
  the migrations above, so a later migration that rewrites it can't
  silently drop the redaction.
- Browser: the GKK filter, the person filter, the at-a-glance panel, the My
  GKK Activity tab as a leader, in light and dark, on a phone.

## Release

A minor release (new feature, usual migration, no function), with a note on
the releases page (`npm run releases:new`): say that GKK leaders now see
their GKK's trail. Run `0119` on demo first, then each parish:
`npm run release:db -- demo`, then `npm run release:db -- all`.

The migration holds phases 1, 3 and 4's database side, so it should be
tried on demo with a leader account before any parish gets it. Ship phase 4
in the same release only if its redaction checks all pass; otherwise ship
phases 1 to 3, with the leader access switched off, and phase 4 right after.

## Order of work

1. Phase 1 migration, with backfill and the fallback. *(small)*
2. Phase 2 page: filters, chip, at-a-glance panel, export. *(medium)*
3. Phase 3: purge entries and the coverage audit. *(small to medium)*
4. Phase 4: `list_gkk_activity`, the My GKK Activity tab, the access
   rules, then the redaction checks on demo. *(medium)* It needs phase 1's
   GKK stamping and reuses phase 2's list.

## Open questions

- **Unassigned households:** leaders won't see their history until they
  move them in (the default above). Is that right, or should a leader see
  "No GKK yet" entries too, since they can already open those households?
- **Leaders and the secretary's name:** leaders see staff names in their
  GKK's trail. Fine, or show "Parish office" for Full access accounts?
- **Shared logins:** does anyone at the office or in a GKK share an account?
  If so, one per person comes before this plan is worth much.
- **Date range default:** last 30 days, or everything newest first as now?
- **Retention:** keep every entry forever (recommended), or archive after N
  years?
