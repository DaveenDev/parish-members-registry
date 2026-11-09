# PRO 02: Mass Intentions

> **Status:** proposed 2026-11-05, not started.
> **Module key:** `intentions`. **Needs:** [00-pro-foundation.md](00-pro-foundation.md).
> **Migration:** `pro/supabase/migrations/P0003_intentions.sql` (next free PRO number at build time).
> Small build, used every day. Sold with 01 as PRO v1.

## Context

- The free app has the Mass schedule: `mass_schedules` (0011, 0016) with
  `kind` (Regular, Daily, Anticipated, GKK, Special Mass, Confession,
  Adoration, Other), `day_of_week` for weekly Masses, `mass_date` /
  `mass_end_date` for dated ones, and the website's "Misa karong adlawa",
  which already works out which Masses fall on a day.
- Mass intentions are taken at the office counter on paper: names, kind,
  which Mass, the offering. Before Mass someone copies them onto a list for
  the priest or commentator. Totals are added up by hand.

## Decisions (defaults to confirm)

- **An intention belongs to one Mass on one date.** It keeps the Mass's
  `mass_schedule_id`, the date, and a copy of its time and name as they were
  when taken, so a later schedule change doesn't rewrite history.
- **Kinds** (Bisaya label, English):
  Para sa kalag (repose of the soul), Pasalamat (thanksgiving), Adlawng
  natawhan (birthday), Anibersaryo (anniversary), Para sa masakiton (for the
  sick), Espesyal nga intensyon (special intention), Uban pa (other).
  The list is editable in settings.
- **Several names per intention** (`for_names text[]`), shown one per line.
- **Repeats:** "every day for 9 days" (novena) or "every Sunday for N weeks"
  makes one intention per Mass, linked by `series_id`, each cancellable on
  its own.
- **Offering:** an amount (or none), with the OR number. The parish sets a
  suggested offering or "any amount" in settings. Called an **offering**,
  not a fee, everywhere.
- **Statuses:** Pending payment (online, not yet confirmed) → Scheduled →
  Offered, or Cancelled / Moved (to another Mass, keeping the link).
- **Optional cap** per Mass (some parishes limit intentions per Mass): a
  warning when it's reached, staff may still add.
- **Online intentions** from the website, paid at the office or by GCash
  with a reference number; staff confirm the payment before the intention is
  Scheduled.
- **Never shown on the website.** Not even "names prayed for": the list is
  only for the Mass itself.
- **Access (pro_module_defaults):**

  | Access | Level |
  |---|---|
  | Full access, Demo, Website & requests | edit |
  | Clergy | view, plus mark Offered |
  | Read only | view |
  | GKK leader | none |

## Data model: `P0003_intentions.sql`

```sql
create table if not exists intention_kinds (
  key        text primary key,          -- 'kalag', 'pasalamat', …
  label      text not null,             -- 'Para sa kalag'
  sort_order int not null default 0,
  active     boolean not null default true
);

create table if not exists intention_settings (
  id                 smallint primary key default 1 check (id = 1),
  suggested_offering numeric(10, 2),    -- null = any amount
  max_per_mass       int,               -- null = no cap
  online_enabled     boolean not null default false,
  online_cutoff_hrs  int not null default 24,  -- online intentions close this long before a Mass
  gcash_name         text,
  gcash_number       text,
  gcash_qr_path      text,              -- in the PRO public bucket
  office_note        text               -- shown on the online form
);

create table if not exists mass_intentions (
  id               serial primary key,
  ref_no           text unique,          -- MI-2026-0001
  series_id        integer,              -- the first intention of a repeat
  kind             text not null references intention_kinds(key),
  for_names        text[] not null check (cardinality(for_names) between 1 and 20),
  offered_by       text not null,
  mobile           text,
  mass_schedule_id integer references mass_schedules(id) on delete set null,
  mass_date        date not null,
  mass_time        text not null,        -- copy, e.g. '6:00 AM'
  mass_label       text,                 -- copy, e.g. 'Regular Mass', 'GKK Mass – San Isidro'
  offering         numeric(10, 2),
  or_number        text,
  payment_method   text check (payment_method in ('office', 'gcash')),
  gcash_ref        text,
  source           text not null default 'Walk-in' check (source in ('Walk-in', 'Phone', 'Online')),
  status           text not null default 'Scheduled'
                   check (status in ('Pending payment', 'Scheduled', 'Offered', 'Cancelled', 'Moved')),
  moved_to_id      integer references mass_intentions(id) on delete set null,
  notes            text,
  created_by       uuid references auth.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz,
  deleted_by       uuid references auth.users(id) on delete set null,
  delete_reason    text
);
create index if not exists mass_intentions_mass_idx on mass_intentions (mass_date, mass_time) where deleted_at is null;
create index if not exists mass_intentions_status_idx on mass_intentions (status, mass_date);
```

Functions:

- `intention_masses(p_from date, p_to date)`: the Masses on each day, from
  `mass_schedules`, leaving out Confession, Adoration and Other, each with
  its count of intentions and the cap. Same rules as the website's
  "Misa karong adlawa"; if that logic lives only in the client
  (`lib/site.js` / `lib/today.js`), use the client copy for the admin and
  write the SQL version for the online form.
- `intention_save(p jsonb)` with the repeat options; makes the reference
  number (advisory lock, as 0022).
- `intention_move(p_id, p_mass_schedule_id, p_mass_date)`,
  `intention_mark_offered(p_mass_schedule_id, p_mass_date)` (the whole Mass
  at once), `intention_cancel(p_id, p_reason)`.
- `public_submit_intention(p jsonb)` (anon): `public_request_guard('pro_intention', 5, 300)`,
  `require_mobile`, `payload_text`; only Masses past the cutoff; returns the
  reference number. Adds a `staff_notifications` row:
  `kind = 'intention'`, `area = 'requests'`, `link = '/admin/pro/intentions?id=…'`.
- `public_intention_status(p_ref)` (anon): status and Mass date/time only,
  no names. `public_request_guard('status', 30, 2000)` like the free
  status check.

Storage: a public bucket `pro-public` for the GCash QR image (writes by
`pro_can('intentions', 'edit')` only), the way 0096 set up `downloads`.

Triggers: `pro_log_activity()`, `updated_at`. Seed the kinds and the defaults.

## Admin

`client/src/pro/intentions/`, sidebar **Parish life → Mass Intentions**
(`/admin/pro/intentions`):

- **Today / This week** view: each Mass as a card (time, kind, count, cap),
  its intentions listed by kind. Buttons: **Add**, **Print list**,
  **Mark all offered**.
- **Add intention** (counter use, fast): kind, names (one per line), offered
  by, mobile, Mass (the next Masses listed, today's first), repeat, offering
  (suggested amount filled in), OR number. Enter saves and clears for the
  next person.
- **Print list** per Mass: parish name, date, time, celebrant line left blank
  to write in; intentions grouped by kind, names in large type; total count.
  One page per Mass, `@media print` like `PrintSheet.jsx`.
- **Online** tab: Pending payment ones with the GCash reference, Confirm
  (→ Scheduled) or Cancel with a note the person sees on the status check.
- **Search**: by name, offered by, reference number, date range.
- **Reports**: offerings per day and month, by kind and by Mass; count of
  intentions; CSV export.
- **Settings** (Parish Config → PRO → Mass Intentions): kinds, suggested
  offering, cap, online on/off and cutoff, GCash details and QR.

Slots: `dashboardToday` (today's Masses with counts; online intentions to
confirm); the free notification bell already shows new online ones.

## Website

`client/src/pro/intentions/site/`, only when `online_enabled`:

- `serbisyoButtons` slot: **Intensyon sa Misa** button on Mga Serbisyo.
- `/serbisyo/hangyo/intensyon`: kind, names, the Mass (next Masses after the
  cutoff), offered by, mobile, payment (at the office / GCash with QR and a
  reference number field), the office note. Shows the reference number at
  the end, like the free request forms.
- `checkStatusLookups` slot: a reference number starting `MI-` shows its
  status and Mass.

## Works with other modules

- **05 Cashbook:** each day's offerings post as one receipt line per
  Mass (category "Mass offerings"), and a cancelled paid intention asks
  whether the offering was returned or kept.
- **03 SMS:** optional text to the person when an online intention is
  confirmed.

## Steps

1. `P0003_intentions.sql`; run on demo.
2. `intention_masses` and the This week view.
3. Add intention, repeats, move, cancel, mark offered.
4. Print list.
5. Settings and the reports.
6. Online form, status check, notifications, GCash QR upload.
7. Sample data, playbook, release notes.

## Testing

Playbook IDs `PRO-MI-*`:

- MI-01 Add three intentions to Sunday 6:00 AM; Print list shows them by
  kind on one page; Mark all offered.
- MI-02 A novena makes nine intentions on nine days; cancelling day 4
  leaves the rest.
- MI-03 Change the Sunday Mass time in Parish Website → Mass schedule: old
  intentions keep the time they were taken for.
- MI-04 Cap of 10: the 11th shows the warning and can still be saved.
- MI-05 Online: submit with GCash, see it under Online and in the bell,
  confirm it, check the status by reference number. A Mass inside the cutoff
  can't be picked.
- MI-06 The online form is rate-limited; the status check shows no names.
- MI-07 Access: clergy can mark offered but not add; GKK leaders get nothing.
- MI-08 Reports: the month's total matches the sum of the intentions.

## Open questions

- Does the parish limit intentions per Mass, or have a set offering amount?
- Who prints the list now, and when (the night before, or just before Mass)?
- Are GKK Masses at the chapels included, or only Masses at the church?
