# PRO 01: Sacramental Registers & Certificates

> **Status:** proposed 2026-11-05, not started.
> **Module key:** `registers`. **Needs:** [00-pro-foundation.md](00-pro-foundation.md).
> **Migration:** `pro/supabase/migrations/P0002_registers.sql` (next free PRO number at build time).
> The flagship: this module alone should justify the PRO price.

## Context

What the free app has today:

- Members carry **self-reported** sacraments: `members.has_baptism`,
  `baptism_date`, `baptism_church`, the same for communion, confirmation
  (`conf_name`, `conf_sponsor`) and matrimony (`mat_type`) (0001).
- Staff **verify** a claim against proof, one of the sources being "Parish
  register entry" (`sacrament_verifications`, 0005 and 0043;
  `components/SacramentVerifyDialog.jsx`).
- **Certificate requests** (0012, `components/requests/CertificatesTab.jsx`):
  `certificate_requests` with `cert_type` baptism / confirmation / matrimony,
  the person's and parents' names, status Received → Being prepared → Ready
  for pick-up → Released, `member_id`, `fee` (text), `or_number`,
  `released_to`, `public_note`. 0107 added the pick-up choice and the office's
  fee note.

What's missing: the **register itself**. The secretary still searches the
paper Libro for the entry and types the certificate in Word. This module puts
the registers in the app and prints the certificate from the entry, closing
the loop the Requests queue already starts.

## Decisions (defaults to confirm)

- **The paper book stays the official record.** Each digital entry mirrors
  one line of a book: register, **Book No., Page No., Entry No.** The
  certificate cites them.
- **Four registers:** Baptism, Confirmation, Marriage, Burial (Death).
  First Communion is left out of v1 (most parishes keep no canonical book of
  it); see Open questions.
- **An entry may or may not be a current member.** Many people baptized here
  have moved away. `member_id` is an optional link.
- **Annotations (marginal notes).** Canon 535 §2 has confirmation, marriage
  and similar notes written in the baptismal register. They're their own
  rows, dated, with who added them; a Marriage or Confirmation entry for the
  same person offers to add the note on the Baptism entry.
- **Entries are never edited silently.** Every change is in the activity log
  (`pro_log_activity()`); deleting needs a reason and goes to the module's
  Deleted filter (foundation §5). A correction of a book entry is an
  annotation of kind `correction`, not an overwrite of the original text.
- **Certificates come from templates the parish sets once:** heading, logo,
  the signatory (parish priest's name and title), the footer ("Not valid
  without the parish seal"), paper size (Letter, A4 or Long 8.5×13), and
  the wording per register. Dioceses differ, so every line of text is
  editable; the layout is fixed.
- **Every printed certificate is recorded** with a control number per
  register per year (`BAP-2026-0001`, `CON-…`, `MAR-…`, `DEF-…`), the
  purpose (e.g. "for marriage purposes"), copies, fee and OR number.
- **QR check (anti-forgery):** each certificate carries a QR code to
  `/serbisyo/tinuod/<code>`, which shows only: valid or voided, the kind of
  certificate, the name on it, the control number and the date issued.
  Rate-limited with `public_request_guard('pro_cert_check', 30, 2000)`.
- **Access (pro_module_defaults):**

  | Access | Level |
  |---|---|
  | Full access, Demo | edit |
  | Clergy | view, plus add annotations and void a certificate |
  | Website & requests | view and print (they run the certificate queue) |
  | Read only | view |
  | GKK leader | none (registers can hold sensitive remarks) |

## Data model: `P0002_registers.sql`

```sql
create extension if not exists pg_trgm with schema extensions;  -- name search

create table if not exists register_books (
  id         serial primary key,
  register   text not null check (register in ('baptism', 'confirmation', 'marriage', 'burial')),
  book_no    text not null,              -- as written on the spine: '3', 'III', '1998-A'
  year_from  smallint,
  year_to    smallint,
  notes      text,
  unique (register, book_no)
);

create table if not exists register_entries (
  id                 serial primary key,
  register           text not null check (register in ('baptism', 'confirmation', 'marriage', 'burial')),
  book_id            integer not null references register_books(id),
  page_no            text not null,
  entry_no           text not null,
  event_date         date not null,       -- baptized / confirmed / married / buried on
  -- The person (for a marriage, the groom)
  first_name         text not null,
  middle_name        text,
  last_name          text not null,
  sex                text,
  birth_date         date,
  birth_place        text,
  father_name        text,
  mother_name        text,                -- the mother's maiden name, as the books have it
  residence          text,
  -- Marriage: the bride
  spouse_first_name  text,
  spouse_middle_name text,
  spouse_last_name   text,
  spouse_birth_date  date,
  spouse_father_name text,
  spouse_mother_name text,
  spouse_residence   text,
  marriage_license   text,                -- civil license number
  -- Burial
  death_date         date,
  death_place        text,
  burial_place       text,                -- cemetery / columbarium (links to plan 06 later)
  -- Everyone
  minister           text,                -- officiating priest or bishop
  sponsors           text[] not null default '{}',  -- godparents, confirmation sponsor, wedding witnesses
  remarks            text,                -- as written in the book
  extra              jsonb not null default '{}',   -- diocese-specific fields, kept out of the columns
  member_id          integer references members(id) on delete set null,
  spouse_member_id   integer references members(id) on delete set null,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  deleted_by         uuid references auth.users(id) on delete set null,
  delete_reason      text,
  check (register <> 'marriage' or (spouse_first_name is not null and spouse_last_name is not null))
);

-- One line of one page of one book holds one entry.
create unique index if not exists register_entries_line_uq
  on register_entries (book_id, page_no, entry_no) where deleted_at is null;
create index if not exists register_entries_name_trgm
  on register_entries using gin ((lower(first_name || ' ' || coalesce(middle_name, '') || ' ' || last_name)) extensions.gin_trgm_ops);
create index if not exists register_entries_member_idx on register_entries (member_id);

create table if not exists register_annotations (
  id              serial primary key,
  entry_id        integer not null references register_entries(id) on delete cascade,
  kind            text not null check (kind in ('confirmation', 'marriage', 'correction', 'declaration_of_nullity', 'other')),
  note            text not null,
  noted_on        date not null default current_date,
  linked_entry_id integer references register_entries(id) on delete set null,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create table if not exists certificate_templates (
  register        text primary key check (register in ('baptism', 'confirmation', 'marriage', 'burial')),
  title           text not null,        -- 'Baptismal Certificate'
  intro           text,                 -- 'This is to certify that…'
  closing         text,                 -- 'Issued upon request of … for …'
  signatory_name  text,
  signatory_title text default 'Parish Priest',
  footer_note     text default 'Not valid without the parish seal.',
  paper           text not null default 'letter' check (paper in ('letter', 'a4', 'long')),
  updated_at      timestamptz not null default now()
);

create table if not exists certificate_issues (
  id             serial primary key,
  control_no     text not null unique,       -- BAP-2026-0001
  verify_code    text not null unique,       -- random, for the QR check
  entry_id       integer not null references register_entries(id),
  request_id     integer references certificate_requests(id) on delete set null,
  purpose        text,
  copies         smallint not null default 1 check (copies between 1 and 10),
  fee            numeric(10, 2),
  or_number      text,
  signatory_name text,                       -- as printed
  issued_by      uuid references auth.users(id) on delete set null,
  issued_at      timestamptz not null default now(),
  voided_at      timestamptz,
  voided_by      uuid references auth.users(id) on delete set null,
  void_reason    text
);
```

Functions (all `security definer`, each checking `pro_can('registers', …)`):

- `register_search(p_register, p_text, p_from, p_to, p_book_id)`: by name
  (trigram, and "Ma." / "Maria" read alike — reuse the name logic from
  `0095_household_duplicates_smarter.sql` if it's a separate function,
  otherwise copy it into PRO; never change it), by parents' names, date
  range, book and page. Leaves deleted entries out unless asked.
- `register_save_entry(p jsonb)` / `register_delete_entry(p_id, p_reason)` /
  `register_restore_entry(p_id)`.
- `register_annotate(p_entry_id, p_kind, p_note, p_linked_entry_id)`.
- `pro_issue_certificate(p_entry_id, p_request_id, p_purpose, p_copies, p_fee, p_or_number)`:
  makes the control number (per register per year, with an advisory lock as
  in `0022_access_code_race.sql`) and a random `verify_code`; when
  `p_request_id` is set, also moves that request to **Ready for pick-up**,
  fills its `or_number`, its `fee` as text (`₱150.00`) and its `member_id`
  from the entry. Returns the issue for printing.
- `pro_void_certificate(p_issue_id, p_reason)`.
- `pro_certificate_check(p_code)` (anon): the QR page's answer, nothing more.
- `register_link_member(p_entry_id, p_member_id, p_update_member boolean)`:
  links the entry; when asked, fills the member's sacrament fields from it
  (date, church = the parish's name) and records a verification with source
  "Parish register entry" and reference "Book 3, Page 12, No. 45", **through
  the same function `SacramentVerifyDialog.jsx` uses**, so the free rules
  still apply.

Triggers: `pro_log_activity()` on the five tables; `updated_at` on entries;
block `update` of `book_id/page_no/entry_no` once a certificate was issued
from the entry (fix with an annotation instead).

Seed `pro_module_defaults` with the access table above and one
`certificate_templates` row per register with plain English wording.

## Admin

`client/src/pro/registers/`:

- **Registry → Registers** (`/admin/pro/registers`), one tab per register.
  - Search bar on top (name, parents, year, book). Results: name, date,
    Book/Page/No., linked member, number of certificates issued.
  - **New entry**: Book and Page first (the book picked once stays picked for
    the next entry, the entry number counts up), then the person, parents,
    sponsors, minister, remarks. For a marriage, both parties side by side.
    "Save and add the next" for working through a page.
  - Entry window: the entry, its annotations, its certificates (with Void),
    its linked member, History (activity log).
  - **Books** sub-tab: add a book, its years, entries counted per book.
- **Print certificate**: from an entry, or from a certificate request (below).
  Purpose, copies, fee, OR number → `pro_issue_certificate` → a print view
  built like `components/PrintSheet.jsx` (window.print, `@page` size from
  the template), the parish logo and name from `parish_settings`, the QR
  code with the free `components/QrCode.jsx`. "Print again" reprints the same
  control number; a new purpose gets a new one.
- **Parish Config → PRO → Certificates** (`parishConfigTabs` slot): the four
  templates, with a live preview.

Free-app slots this module fills:

- `certificateRequestActions` (CertificatesTab): **Find in register**
  searches with the request's names, parents and dates already filled in,
  then **Print certificate** issues it and moves the request on. A request
  already printed shows its control number.
- `memberPanels` (MemberDetailModal): the member's register entries, with
  "Link an entry".
- `dashboardToday`: certificate requests waiting that have no register
  entry found yet.

## Website

`client/src/pro/registers/site/`:

- `/serbisyo/tinuod/:code` (and `/serbisyo/tinuod` with a box to type the
  code): "Tinuod kini nga sertipiko" / "Gi-void kini nga sertipiko", the kind,
  name, control number, date issued. Nothing else from the entry.

## Reports

Under Reports, through a PRO report builder section:

- Sacraments recorded per year, from the registers (beside the free counts
  from members).
- Certificates issued per month, by register and purpose, fees total.
- Entries per book (how far along each book is in the app).

## Works with other modules

- **05 Cashbook:** an issue with a fee posts a receipt line (category
  "Certificate fees", OR number), and voiding it reverses the line.
- **04 Bookings:** a baptism or wedding marked Done offers "Record in the
  register", prefilled from the booking.
- **06 Columbarium:** a burial entry can point at a niche.

## Steps

1. `P0002_registers.sql` with the tables, functions, defaults and templates.
   Run on demo.
2. Registers page: list, search, new entry, entry window, books.
3. Certificate templates in Parish Config, and the print view with the QR.
4. `pro_issue_certificate`, the certificate-request slot and the void flow.
5. Member link and the verification sync.
6. The `/serbisyo/tinuod` page.
7. Reports.
8. Sample data in `sample-pro.mjs`; a PRO playbook section (below); release
   notes.

## Testing

Playbook IDs `PRO-REG-*`, in `pro/docs/playbook.md`:

- REG-01 Add a book and 20 entries from one page; the entry number counts
  up; a duplicate line (same book, page, entry) is refused.
- REG-02 "Ma. Cristina" finds "Maria Cristina"; a mother's maiden name finds
  the child.
- REG-03 A certificate request for a baptism → Find in register → Print:
  the request becomes Ready for pick-up with the OR number and fee; the
  control number is `BAP-<year>-0001`, the next one `-0002`.
- REG-04 Print on Letter, A4 and Long; nothing cut off; the QR opens the
  check page on a phone and shows only what's listed above.
- REG-05 Void a certificate: the check page says voided; a reprint keeps the
  control number; the cashbook line (if on) is reversed.
- REG-06 Link an entry to a member and update the member: the sacrament
  shows as verified, with the book reference, and the activity log has it.
- REG-07 Access: a GKK leader gets nothing from the API; Website & requests
  can print but not edit; clergy can annotate and void but not edit.
- REG-08 Change the Book/Page of an entry that has a certificate: refused,
  with a message to add a correction annotation.
- REG-09 The check page is rate-limited.

## Open questions

- First Communion: does Mua-an or SJMV keep a book and issue certificates?
  If yes, add `first_communion` to the registers.
- The Diocese of Kidapawan's certificate format: get a sample of each of the
  four certificates from the chancery or a parish office, and set the
  default template wording from it.
- Should Website & requests staff add entries, or only full access?
- Fees: does the parish want a fixed fee per certificate set in the
  template, or typed each time?
