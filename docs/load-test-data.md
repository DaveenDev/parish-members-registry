# Load-test data: seed, remove and reseed 500 households

To see how the admin panel and the public website behave with a full parish,
[`supabase/seed/load-test.sql`](../supabase/seed/load-test.sql) adds 500
households and the records that go with them. A second script,
[`supabase/seed/load-test-clean.sql`](../supabase/seed/load-test-clean.sql),
removes exactly that test data and nothing real.

There is only one Supabase project, the live one, so the test data goes into
the same database as the real records. Every test record is marked so it can
be told apart and removed in one step.

## What gets added

| | About |
|---|---|
| Households | 500, spread evenly over every GKK, registered over the past two years (about 65% Verified) |
| Members | 2,000: a head, often a spouse, children, sometimes a parent or grandchild, with sacraments, blood types, tribes, ministries, organizations and a few GKK roles and parish positions |
| Sacrament verifications | 1,100, "verified" by *Seed data* |
| Census | 800 answers and about 50 online updates waiting for review, in the census that is open (skipped if none is open) |
| Requests | 150 certificate, 40 OCIA / Anointing, 30 blood requests (with donors contacted) |
| Blood donors | 80 |
| Website | 60 announcements, 30 articles, a bulletin for each of the past 52 Sundays (weeks that already have one are skipped), 40 events |

Not touched: settings (parish, photo storage, email, notifications), staff
accounts, the activity log and trash, the rate-limit log, census access
codes, and the GKK, ministry, organization and parish position lists. The
seed uses whatever is in those lists.

## How test records are marked

| Records | Marker |
|---|---|
| Households | reference number `SEED-0001` to `SEED-0500` |
| Members, sacrament verifications, census answers and updates | belong to a `SEED-` household (removed with it) |
| Certificate, sacrament and blood requests | reference number starting `SEED-` |
| Blood donors | notes *Load-test seed* |
| Announcements, articles, bulletins, events | title starting **[Test]** |

## What to expect while it's in

- **Staff** see the test households, members and requests in every list, the
  Dashboard and Reports, and the online updates in the Census review queue.
  A GKK leader sees the test households of their GKK.
- **The public website** shows the **[Test]** announcements, articles,
  bulletins and events, and its totals and census progress include the test
  households. No test announcement is marked urgent, so no banner appears on
  the home page.
- **Nobody is notified.** Staff notifications only fire for submissions from
  the public website, and the seed doesn't come from there.
- **The activity log stays clean.** The seed and the cleanup switch it off
  while they run.

Remove the test data when testing is done, especially before showing the
site to parishioners.

## One-time setup

The commands use the Supabase CLI through `npx`, so nothing needs installing
beyond Node. On the computer you run them from:

```bash
npx supabase login
```

```bash
npx supabase link --project-ref cyfjuyigybnfukgtsskl
```

`login` opens the browser to sign in to Supabase. `link` points this folder
at the parish project (the ref is the part of the Supabase URL before
`.supabase.co`). Both are remembered, so this is needed once per computer.

## Seed

```bash
npm run db:seed-load
```

It takes about 20 seconds and prints what it added, along these lines:

```
households 500 · members 1966 · verifications 1127 · census_answers 813 ·
census_submissions 52 · certificate_requests 150 · sacrament_requests 40 ·
blood_requests 30 · blood_donors 80 · announcements 60 · articles 30 ·
bulletins 52 · events 40
```

Everything runs in one transaction: if anything fails, nothing is kept. The
seed refuses to run while test data is already in the database (see
Reseed).

## Remove

```bash
npm run db:clean-load
```

It prints what's left, which should be all zeros except
`households_now`, the number of real households:

```
households_left 0 · requests_left 0 · donors_left 0 · website_items_left 0 · households_now 4
```

Only marked records are deleted. Donors and requests go first, because they
can point at a test member; then the test households, which take their
members, sacrament verifications and census rows with them.

## Reseed

To start over with fresh test data (for example after changing the seed, or
after a lot of test edits), remove it and seed again:

```bash
npm run db:clean-load
```

```bash
npm run db:seed-load
```

The seed always makes the same names and families (it uses a fixed random
seed), but dates are counted back from the day it runs, so registrations,
announcements and events move with the calendar. Households are spread over
the GKKs in the list at the time, so adding or renaming GKKs changes which
GKK each test household lands in.

Running the seed without removing first stops with:

```
Load-test seed is already in the database. Run the cleanup (npm run db:clean-load) first.
```

## Changing the seed

- **More or fewer households:** change `for i in 1..500` near the top of
  `load-test.sql` and the count in its `Seeded 500 households` notice (and
  the `lpad(i::text, 4, '0')` width if going past 9,999).
- **Other volumes:** each request type, donors and the website items have
  their own `generate_series(1, N)`.

Before running a changed seed for real, try it without keeping anything: in a
copy of the file, change the final `commit;` to `rollback;` and run the copy
with `npx supabase db query --linked -f <copy>`. Errors show up the same way,
and nothing is saved.

## Troubleshooting

| Message | What to do |
|---|---|
| `Cannot find project ref. Have you run supabase link?` | Run the `npx supabase link …` step above. |
| `Load-test seed is already in the database …` | Run `npm run db:clean-load` first. |
| `Add at least one GKK before seeding.` | Add GKKs in Parish Config → Parish GKK first. |
| Asked to log in, or an access error | Run `npx supabase login` with an account that belongs to the parish's Supabase organization. |

## Load-speed baseline

Database time with the test data in (504 households, about 2,000 members),
measured on 3 October 2026 as a full-access account. This is the database
alone; the browser adds network and rendering time on top.

| Screen | Database time |
|---|---|
| Households list | 0.19 s |
| Member search | 0.09 s |
| Members list | 1.3 s |
| Sidebar counts (loaded on every admin page) | 1.8 s |
| Reports | 2.1 s |
| Dashboard | 4.3 s |
