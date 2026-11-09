# PRO 06 (add-on): Columbarium

> **Status:** proposed 2026-11-05, not started. Build only when a parish with
> a columbarium asks and pays a deposit.
> **Module key:** `columbarium`. **Needs:** [00-pro-foundation.md](00-pro-foundation.md).
> **Migration:** `pro/supabase/migrations/P0007_columbarium.sql` (next free PRO number at build time).
> Sold separately from the PRO license (starting idea ₱15,000 one-time).

## Context

- Many parishes run a columbarium: niches sold (or leased) to families,
  often paid in installments, with urns placed over the years. It's records
  plus money, usually kept in a ledger and a printed map of the wall.
- Nothing in the free app covers it. Plan 01 has burial entries, plan 05 the
  cashbook.

## Decisions (defaults to confirm)

- **Layout:** Columbarium → Sections (a wall, a floor, a building) → a grid of
  niches by row and column. Each niche has a code (`A-03-12`: section A,
  row 3, column 12), a type (single, double, family) and how many urns it
  holds.
- **Niche status:** Available, Reserved (held, with an expiry date), Sold,
  Occupied (has urns, room for more), Full, Not for sale.
- **Rights holder:** the person who bought the right to the niche (a
  registered member or a typed name), with contact details. The parish owns
  the niche; the holder has the right to use it. Transfers of the right are
  recorded, never overwritten.
- **Contract:** contract number, date, price, discount, payment terms (full,
  or N monthly installments with due dates), and an optional yearly
  maintenance fee.
- **Payments:** each with date, amount, OR number. A schedule shows what's
  due, paid and overdue. Each payment posts to the cashbook (05) when it's
  on.
- **Interments:** the urn's deceased (name, dates), interment date, who
  placed it, and an optional link to the burial register entry (01).
  Removal (transfer of remains) is recorded too.
- **Certificate of ownership** (right of use) printed from a template, like
  plan 01's certificates.
- **Access:** full access edit; clergy view; others none; a columbarium
  clerk gets a grant (`pro_grants`).

## Data model: `P0007_columbarium.sql`

```sql
create table if not exists niche_sections (
  id        serial primary key,
  code      text not null unique,          -- 'A'
  name      text not null,                 -- 'East wall'
  row_count int not null check (row_count > 0),
  col_count int not null check (col_count > 0),
  sort_order int not null default 0
);

create table if not exists niches (
  id          serial primary key,
  section_id  integer not null references niche_sections(id),
  row_no      int not null,
  col_no      int not null,
  code        text not null unique,        -- 'A-03-12'
  niche_type  text not null default 'single' check (niche_type in ('single', 'double', 'family')),
  capacity    int not null default 1 check (capacity > 0),
  list_price  numeric(12, 2),
  status      text not null default 'Available'
              check (status in ('Available', 'Reserved', 'Sold', 'Occupied', 'Full', 'Not for sale')),
  reserved_until date,
  notes       text,
  unique (section_id, row_no, col_no)
);

create table if not exists niche_contracts (
  id            serial primary key,
  contract_no   text not null unique,      -- COL-2026-0001
  niche_id      integer not null references niches(id),
  holder_name   text not null,
  holder_member_id integer references members(id) on delete set null,
  holder_mobile text,
  holder_address text,
  contract_date date not null,
  price         numeric(12, 2) not null,
  discount      numeric(12, 2) not null default 0,
  terms         text not null default 'full' check (terms in ('full', 'installment')),
  installments  int check (installments between 1 and 120),
  yearly_fee    numeric(10, 2),
  status        text not null default 'Active' check (status in ('Active', 'Transferred', 'Cancelled')),
  transferred_to_id integer references niche_contracts(id),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
-- One active contract per niche.
create unique index if not exists niche_contracts_active_uq on niche_contracts (niche_id) where status = 'Active';

create table if not exists niche_dues (
  id          serial primary key,
  contract_id integer not null references niche_contracts(id) on delete cascade,
  due_date    date not null,
  amount      numeric(12, 2) not null,
  kind        text not null default 'installment' check (kind in ('downpayment', 'installment', 'full', 'yearly_fee'))
);

create table if not exists niche_payments (
  id          serial primary key,
  contract_id integer not null references niche_contracts(id),
  paid_on     date not null,
  amount      numeric(12, 2) not null check (amount > 0),
  or_number   text,
  note        text,
  voided_at   timestamptz,
  void_reason text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists niche_interments (
  id            serial primary key,
  niche_id      integer not null references niches(id),
  deceased_name text not null,
  birth_date    date,
  death_date    date,
  interred_on   date not null,
  removed_on    date,
  removed_note  text,
  register_entry_id integer,                -- plan 01 burial entry (no FK: 01 may be off)
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);
```

Functions: `niche_make_section(code, name, row_count, col_count)` (creates the grid),
`niche_contract_save` (with the due schedule worked out), `niche_pay`
(posts to the cashbook when 05 is on), `niche_void_payment`,
`niche_transfer(contract_id, new holder…)`, `niche_inter`, `niche_remove`,
`niche_status_refresh(niche_id)` (Sold / Occupied / Full from contracts and
urns), `niche_overdue()`.

Triggers: `pro_log_activity()` on every table. A daily `pg_cron` job puts
expired reservations back to Available.

## Admin

`client/src/pro/columbarium/`, sidebar **Parish life → Columbarium**
(`/admin/pro/columbarium`):

- **Map:** each section as a grid, niches coloured by status, the code on
  each. Click a niche for its window. Filter: available only, overdue.
- **Niche window:** status, holder and contract, dues and payments, urns,
  transfers, History; buttons Reserve, Sell, Pay, Inter, Transfer.
- **Contracts:** list, search by holder or deceased; overdue list with
  amounts and contact numbers; printable statement of account per contract.
- **Certificate of ownership** print (template in Parish Config → PRO →
  Columbarium).
- **Reports:** sales and collections per month, outstanding balance, niches
  by status per section.
- Slot `memberPanels`: a member's contracts and the urns of family members.

## Works with other modules

- **05 Cashbook:** every payment posts; voiding reverses.
- **01 Registers:** an interment links to (or starts) a burial entry.
- **04 Bookings:** a funeral booking offers "Inter in the columbarium".
- **03 SMS:** optional due-date reminders to holders.

## Steps

1. Visit the parish's columbarium office: get their current ledger, the
   contract form and the map, and match the fields.
2. `P0007_columbarium.sql`; sections and the map.
3. Contracts, the due schedule, payments.
4. Interments, transfers.
5. Certificate, statements, reports.
6. Links to 01, 04, 05.
7. Playbook, release notes.

## Testing

Playbook IDs `PRO-COL-*`:

- COL-01 Make section A with 5 rows × 20 columns: 100 niches `A-01-01` to
  `A-05-20`, all Available.
- COL-02 Sell `A-03-12` on 12 installments: 12 dues; pay 3; the overdue
  list shows the 4th after its date.
- COL-03 A second active contract on the same niche is refused.
- COL-04 Inter two urns in a double niche: Full; removing one: Occupied.
- COL-05 Transfer the right: the old contract shows Transferred, the new
  holder's contract keeps the payments history readable.
- COL-06 A payment posts to the cashbook (05 on); voiding reverses it.
- COL-07 Reservations past their date go back to Available overnight.

## Open questions

- Sold, or leased for a term (e.g. 25 or 50 years)? If leased, add the end
  date and renewal.
- Is there a yearly maintenance fee?
- Who in the parish runs the columbarium: the office, or a separate clerk?
