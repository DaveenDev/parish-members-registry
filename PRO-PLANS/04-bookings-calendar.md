# PRO 04: Bookings & Calendar

> **Status:** proposed 2026-11-05, not started.
> **Module key:** `bookings`. **Needs:** [00-pro-foundation.md](00-pro-foundation.md).
> **Migration:** `pro/supabase/migrations/P0005_bookings.sql` (next free PRO number at build time).

## Context

- The free app has the **sacrament guides** (steps, documents, fees) on the
  website (0011, `components/website/SacramentGuidesTab.jsx`), the **events
  calendar** (0011, `components/site/Kalendaryo.jsx`), the **Mass schedule**
  (0016) and **sacrament requests** for OCIA and the Anointing of the Sick
  (0032, `components/requests/SacramentsTab.jsx`).
- Baptisms, weddings, funeral Masses, blessings and use of the hall are
  still booked in a notebook. Clashes are found late, and wedding
  requirements are tracked on paper.

## Decisions (defaults to confirm)

- **Kinds:** Baptism, Wedding, Funeral Mass, Blessing (house, vehicle,
  business), Hall / venue use, Other. Each kind has its own form fields,
  checklist and fee, set in settings.
- **Resources:** what can be booked: the Church, the Parish hall, GKK
  chapels, a priest's time. Each booking uses one or more resources.
- **Baptism uses slots:** staff open dates (e.g. every 2nd and 4th Sunday,
  10:00 AM, up to 15 children), with the pre-baptismal seminar date for the
  parents and godparents. Families pick a slot.
- **Weddings use a date and time** checked against everything else in the
  church that day, Masses included.
- **Clashes:** the same resource at overlapping times is refused, unless
  full access overrides with a reason. The church is also busy during every
  Mass on the schedule.
- **Checklists:** each booking gets the checklist of its kind, ticked with
  who and when. Default items for a wedding: canonical interview, pre-Cana
  seminar, baptismal and confirmation certificates (recently issued, for
  marriage purposes), CENOMAR, marriage license, banns published. The parish
  edits the list; it can be filled from that sacrament guide's documents.
- **Banns:** a wedding produces the banns text for the next three Sundays,
  ready to copy into the bulletin or post as an announcement **only when the
  couple agreed** (a tick on the booking).
- **Statuses:** Requested → Confirmed → Done, or Cancelled. A Done baptism
  or wedding offers "Record in the register" (plan 01).
- **Online booking requests** (optional): families request a baptism slot or
  ask about a wedding date from the website; staff confirm. Nothing about a
  booking is shown publicly except the open baptism dates and how many places
  are left.
- **Access (pro_module_defaults):**

  | Access | Level |
  |---|---|
  | Full access, Demo, Website & requests | edit |
  | Clergy | edit (priests confirm weddings and funerals) |
  | Read only | view |
  | GKK leader | none |

## Data model: `P0005_bookings.sql`

```sql
create table if not exists booking_resources (
  id         serial primary key,
  name       text not null unique,         -- 'Church', 'Parish hall', 'GKK San Isidro chapel'
  kind       text not null default 'place' check (kind in ('place', 'person')),
  busy_during_masses boolean not null default false,  -- true for the church
  active     boolean not null default true
);

create table if not exists booking_kinds (
  key        text primary key,             -- 'baptism', 'wedding', 'funeral', 'blessing', 'hall', 'other'
  label      text not null,
  uses_slots boolean not null default false,
  default_minutes int not null default 60,
  default_resource_id integer references booking_resources(id) on delete set null,
  fee        numeric(10, 2),               -- suggested offering / fee
  online     boolean not null default false,
  fields     jsonb not null default '[]'   -- extra form fields for this kind
);

create table if not exists booking_checklist_items (
  id        serial primary key,
  kind      text not null references booking_kinds(key) on delete cascade,
  item      text not null,
  sort_order int not null default 0
);

create table if not exists booking_slots (
  id          serial primary key,
  kind        text not null references booking_kinds(key),
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  resource_id integer not null references booking_resources(id),
  capacity    int not null check (capacity > 0),
  seminar_at  timestamptz,                 -- pre-baptismal seminar
  note        text,
  open        boolean not null default true
);

create table if not exists bookings (
  id            serial primary key,
  ref_no        text unique,                -- BK-2026-0001
  kind          text not null references booking_kinds(key),
  slot_id       integer references booking_slots(id) on delete set null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  status        text not null default 'Requested' check (status in ('Requested', 'Confirmed', 'Done', 'Cancelled')),
  contact_name  text not null,
  contact_mobile text,
  details       jsonb not null default '{}', -- the kind's extra fields
  banns_consent boolean not null default false,
  fee           numeric(10, 2),
  or_number     text,
  source        text not null default 'Walk-in' check (source in ('Walk-in', 'Phone', 'Online')),
  override_reason text,                     -- when a clash was overridden
  register_entry_id integer,                -- set by plan 01 when recorded (no FK: 01 may be off)
  notes         text,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  deleted_by    uuid references auth.users(id) on delete set null,
  delete_reason text,
  check (ends_at > starts_at)
);

create table if not exists booking_resource_uses (
  booking_id  integer not null references bookings(id) on delete cascade,
  resource_id integer not null references booking_resources(id),
  primary key (booking_id, resource_id)
);

create table if not exists booking_people (
  id         serial primary key,
  booking_id integer not null references bookings(id) on delete cascade,
  role       text not null check (role in ('child', 'father', 'mother', 'godparent', 'groom', 'bride', 'witness', 'deceased', 'other')),
  full_name  text not null,
  birth_date date,
  member_id  integer references members(id) on delete set null,
  attended_seminar boolean not null default false
);

create table if not exists booking_checks (
  booking_id integer not null references bookings(id) on delete cascade,
  item       text not null,
  done_at    timestamptz,
  done_by    uuid references auth.users(id) on delete set null,
  note       text,
  primary key (booking_id, item)
);
```

Functions:

- `booking_clashes(p_starts_at, p_ends_at, p_resource_ids, p_except_id)`:
  other bookings on those resources, plus Masses from `mass_schedules` for
  resources with `busy_during_masses`, in Manila time.
- `booking_save(p jsonb)`: refuses on a clash unless full access gives an
  override reason; refuses a slot that's full; makes the reference number
  (advisory lock, as 0022); copies the kind's checklist.
- `booking_set_status`, `booking_check(p_booking_id, p_item, p_done, p_note)`.
- `booking_banns_text(p_booking_id)`: the three Sundays' dates and the text.
- `public_open_slots(p_kind)` (anon): open slots with places left, nothing
  about who booked.
- `public_request_booking(p jsonb)` (anon): `public_request_guard('pro_booking', 3, 200)`;
  a baptism into an open slot, or a wedding inquiry with a preferred date;
  adds a `staff_notifications` row (`kind = 'booking'`, `area = 'requests'`).
- `public_booking_status(p_ref)` (anon): status and date only.

Triggers: `pro_log_activity()`, `updated_at`. Seed the kinds, the Church and
Parish hall resources and the default wedding and baptism checklists.

## Admin

`client/src/pro/bookings/`, sidebar **Parish life → Bookings**
(`/admin/pro/bookings`):

- **Calendar** (month and week): bookings coloured by kind, Masses from the
  schedule in grey, the free events in their own colour. Built like the
  site's `Kalendaryo.jsx` (no new calendar package). Click a free time to
  book it.
- **List**: upcoming, by status and kind; the checklist progress on each row
  (e.g. 4/7).
- **Booking window**: details, people (pick registered members or type
  names), resources, checklist, fee and OR number, banns (with consent),
  status buttons, History.
- **Baptism slots** tab: open dates in bulk ("every 2nd and 4th Sunday for 6
  months"), each slot's list of children with seminar attendance ticks, and a
  printable list for the day.
- **Settings** (Parish Config → PRO → Bookings): kinds, fees, fields,
  checklists, resources, which kinds take online requests.
- Slot `dashboardToday`: today's and tomorrow's bookings; online requests
  to confirm; weddings within 30 days with checklist items still open.

## Website

`client/src/pro/bookings/site/`:

- `serbisyoButtons` slot: **Pagpa-schedule** (book a baptism / ask about a
  wedding date), only for kinds marked online.
- `/serbisyo/hangyo/schedule`: open baptism dates with places left, the
  form, and the sacrament guide's requirements shown beside it (read from the
  free sacrament guides).
- `checkStatusLookups` slot: `BK-` reference numbers.

## Works with other modules

- **01 Registers:** "Record in the register" on a Done baptism or wedding,
  prefilled (child or couple, parents, godparents or witnesses, minister,
  date).
- **05 Cashbook:** a booking's fee with an OR number posts a receipt line
  (category by kind).
- **03 SMS:** confirmation text, and a reminder the day before.
- **06 Columbarium:** a funeral booking can lead to an interment.

## Steps

1. `P0005_bookings.sql`; run on demo.
2. Resources, kinds and checklists in settings.
3. Booking window with the clash check.
4. Calendar view (month, week) with Masses and events.
5. Baptism slots and the day's printable list.
6. Banns text.
7. Online requests, status check, notifications.
8. Sample data, playbook, release notes.

## Testing

Playbook IDs `PRO-BK-*`:

- BK-01 A wedding at the church on Sunday 6:00 AM clashes with the Mass;
  full access can override with a reason, Website & requests can't.
- BK-02 Two hall bookings 2–4 PM and 3–5 PM: the second is refused.
- BK-03 A slot of 15 refuses the 16th child, online and in the admin.
- BK-04 Wedding checklist: tick items, see 5/7 on the list; the Dashboard
  warns 30 days before with items open.
- BK-05 Banns: three correct Sunday dates; nothing goes to the website
  without the consent tick.
- BK-06 A Done baptism → Record in the register (01 on) prefills the entry;
  with 01 off, the button isn't there.
- BK-07 Online request: reference number, the bell, Confirm, status check
  shows no names.
- BK-08 Times are right in Manila time on a phone set to another zone.

## Open questions

- Which kinds does the parish want online first? (Baptism slots are the
  safest to start with.)
- Are GKK chapels booked through the parish office, or by the GKK?
- Fixed fees per kind, or an offering typed each time?
