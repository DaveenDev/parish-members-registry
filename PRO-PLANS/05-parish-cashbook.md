# PRO 05: Parish Cashbook

> **Status:** proposed 2026-11-05, not started.
> **Module key:** `cashbook`. **Needs:** [00-pro-foundation.md](00-pro-foundation.md).
> **Migration:** `pro/supabase/migrations/P0006_cashbook.sql` (next free PRO number at build time).

## Context

- The free app records money in only one place, as text:
  `certificate_requests.fee` ("₱150") and `or_number` (0012). There are no
  totals anywhere.
- Parishes keep collections, offerings, fees and expenses in a notebook or a
  spreadsheet, and type a monthly report for the parish priest, the Parish
  Finance Council (canon 537) and the diocese.
- The PRO modules make money lines of their own: certificate fees (01), Mass
  offerings (02), booking fees (04), niche payments (06).

## Decisions (defaults to confirm)

- **A cashbook, not accounting software.** Money in and money out, by
  category, fund and cash account, with monthly reports. No chart of
  accounts, no double entry, no payroll, no tax returns.
- **Receipts:** the cashbook records the OR number from the parish's own
  receipt booklet. It doesn't replace BIR-registered receipts; ask the
  diocese's accountant what the parish must issue.
- **Categories** (editable), for example:
  - In: Sunday collection, Second collection (with its purpose), Mass
    offerings, Certificate fees, Baptism, Wedding, Funeral, Blessing, Hall
    use, Donations, Fund-raising, Other.
  - Out: Utilities, Honoraria and salaries, Supplies, Repairs and
    maintenance, Liturgical needs, Charity, Remittance to the diocese, Other.
- **Funds:** Parish fund, Building fund, other restricted funds, and **To
  remit** for collections that belong to the diocese or another cause (a
  special second collection). Money in "To remit" shows as owed until a
  "Remittance" line takes it out.
- **Cash accounts:** Cash on hand, Bank, GCash (editable). A transfer
  between them (depositing Sunday's collection) is one line, in neither in
  nor out.
- **Collection counting:** a count sheet per Mass collection: notes and
  coins by denomination, total, **two counters' names** (the usual control),
  then "Post to cashbook".
- **Lines from other modules post automatically**, each with a link back to
  where it came from; editing or voiding the source changes or reverses the
  line. Mass offerings post as one line per Mass per day, not per intention.
- **Months close.** After the month's report is printed, full access closes
  the month: no line in it can be added, changed or deleted. Reopening needs
  a reason and is logged.
- **Access: money is private by default.**

  | Access | Level |
  |---|---|
  | Full access, Demo | edit |
  | Clergy | view (the parish priest sees everything) |
  | Website & requests, Read only, GKK leader | none |
  | A treasurer or bookkeeper account | given by a staff admin through `pro_grants` (view or edit), on top of any free access level |

## Data model: `P0006_cashbook.sql`

```sql
create table if not exists cash_categories (
  id         serial primary key,
  direction  text not null check (direction in ('in', 'out')),
  name       text not null,
  default_fund_id integer,                  -- set after cash_funds exists
  source_key text unique,                   -- 'certificate', 'intention', 'booking:wedding', … for automatic lines
  active     boolean not null default true,
  sort_order int not null default 0,
  unique (direction, name)
);

create table if not exists cash_funds (
  id        serial primary key,
  name      text not null unique,           -- 'Parish fund', 'Building fund', 'To remit'
  to_remit  boolean not null default false,
  active    boolean not null default true
);

create table if not exists cash_accounts (
  id        serial primary key,
  name      text not null unique,           -- 'Cash on hand', 'Bank', 'GCash'
  opening_balance numeric(12, 2) not null default 0,
  opening_on date not null default current_date,
  active    boolean not null default true
);

create table if not exists cash_entries (
  id            bigserial primary key,
  entry_date    date not null,
  kind          text not null check (kind in ('in', 'out', 'transfer')),
  amount        numeric(12, 2) not null check (amount > 0),
  category_id   integer references cash_categories(id),
  fund_id       integer references cash_funds(id),
  account_id    integer not null references cash_accounts(id),
  to_account_id integer references cash_accounts(id),       -- transfers only
  description   text,
  payee_payer   text,
  or_number     text,
  source        text,                       -- 'certificate_issue', 'mass_intention_day', 'booking', 'collection_count', 'niche_payment'
  source_id     text,
  reverses_id   bigint references cash_entries(id),        -- a reversal points at the line it cancels
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check ((kind = 'transfer') = (to_account_id is not null)),
  check (kind = 'transfer' or category_id is not null)
);
create index if not exists cash_entries_date_idx on cash_entries (entry_date);
create unique index if not exists cash_entries_source_uq on cash_entries (source, source_id) where source is not null and reverses_id is null;

create table if not exists collection_counts (
  id            serial primary key,
  mass_date     date not null,
  mass_schedule_id integer references mass_schedules(id) on delete set null,
  mass_time     text,
  category_id   integer not null references cash_categories(id),   -- Sunday collection / a second collection
  purpose       text,
  counts        jsonb not null,             -- {"1000": 2, "500": 5, …, "coins": 245.50}
  total         numeric(12, 2) not null,
  counted_by    text[] not null check (cardinality(counted_by) >= 2),
  entry_id      bigint references cash_entries(id),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists cash_periods (
  month      date primary key check (extract(day from month) = 1),
  closed_at  timestamptz,
  closed_by  uuid references auth.users(id) on delete set null,
  reopened_reason text
);
```

Functions and triggers:

- `cash_guard()` trigger on `cash_entries`: refuses any change in a closed
  month (message: "Sirado na ang bulan nga … Ablihi una sa Cashbook →
  Months."), and any change by an account without `pro_can('cashbook', 'edit')`.
  Lines that came from another module can only be changed through that
  module (direct edits refused).
- `cash_post(p_source, p_source_id, p jsonb)` and `cash_reverse(p_source, p_source_id)`:
  what the other modules call. Each module checks `pro_module_on('cashbook')`
  first and does nothing when it's off. When the source's date falls in a
  closed month, the line (or its reversal) goes on the first day of the next
  open month, with a note naming the original date, so a closed month never
  changes.
- `cash_post_count(p_count_id)`.
- `cash_close_month(p_month)`, `cash_reopen_month(p_month, p_reason)`.
- `cash_report(p_from, p_to)`: totals by category, by fund, by account;
  opening and closing balances per account; "to remit" owed.
- A nightly `pg_cron` job posts the previous day's Mass offerings
  (plan 02), one line per Mass, if not already posted.

Triggers: `pro_log_activity()` on every table. Seed the categories, funds and
accounts above.

## Admin

`client/src/pro/cashbook/`, sidebar **Data → Cashbook**
(`/admin/pro/cashbook`), shown only to accounts with `proCan('cashbook')`:

- **Day book:** lines by date with running balances per account; **Add
  in**, **Add out**, **Transfer**; filters by month, category, fund,
  account; automatic lines marked with where they came from.
- **Collections:** the count sheet (denomination grid that adds up as you
  type, two counters), printable for signing, then Post.
- **Monthly report:** receipts and disbursements by category, fund balances,
  account balances, to remit; printable for the Finance Council and the
  diocese; CSV export. A year view with the 12 months side by side.
- **Months:** close / reopen.
- **Settings** (Parish Config → PRO → Cashbook): categories, funds,
  accounts and opening balances.
- **Settings → PRO** (foundation): the staff admin grants Cashbook view or
  edit to a treasurer's account.

## Works with other modules

| From | Line |
|---|---|
| 01 Certificate issued with a fee | In, "Certificate fees", OR number |
| 02 Mass offerings, per Mass per day | In, "Mass offerings" |
| 04 Booking fee with an OR number | In, category of the booking's kind |
| 06 Niche payment | In, "Columbarium" |
| Collection count | In, the count's category |

## Steps

1. `P0006_cashbook.sql`; run on demo.
2. Settings: categories, funds, accounts.
3. Day book with add, transfer, the guard.
4. Collection count sheet and posting.
5. Monthly report and print; month close.
6. Automatic lines from 01, 02, 04 (each behind `pro_module_on('cashbook')`).
7. Grants in Settings → PRO.
8. Sample data, playbook, release notes.

## Testing

Playbook IDs `PRO-CB-*`:

- CB-01 Add in, add out, transfer Cash → Bank: balances add up; the
  transfer is in neither total.
- CB-02 Count sheet: 2×₱1,000 + 5×₱500 + ₱245.50 coins = ₱4,745.50; one
  counter only is refused; Post makes one line.
- CB-03 A special second collection in "To remit" shows as owed until the
  remittance line.
- CB-04 Close October: no line in October can be added or changed, even by
  an automatic post (it goes to the first open day, with a note);
  reopening asks for a reason and shows in the Activity log.
- CB-05 Issue and void a certificate with a fee (01 on): the line and its
  reversal appear; the month's total is unchanged.
- CB-06 Access: Website & requests and Read only see no Cashbook page and
  get nothing from the API; a Read only account with an edit grant can add
  lines.
- CB-07 The monthly report's totals match the day book's.

## Open questions

- Does the parish's monthly report to the diocese have a set form? Get a
  copy and match the report's layout to it.
- Who counts and keeps the collection now, and who should have edit rights?
- Opening balances: from which month does the parish want to start?
