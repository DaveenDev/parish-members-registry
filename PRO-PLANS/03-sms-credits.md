# PRO 03: SMS & Credits

> **Status:** proposed 2026-11-05, not started.
> **Module key:** `sms`. **Needs:** [00-pro-foundation.md](00-pro-foundation.md).
> **Migration:** `pro/supabase/migrations/P0004_sms.sql` (next free PRO number at build time).
> **Edge Function (parish):** `pro/supabase/functions/send-sms`.
> **Central project (yours):** `pro/hub/` with the `sms-relay` function.
> Credits are where the original "Free with Credits" idea fits: texts cost
> real money per message.

## Context

- The free app notifies **staff** only: the bell and Web Push through
  `notify-staff` (0034, `supabase/functions/notify-staff/`). It has no way
  to reach **parishioners**.
- It already holds the numbers: members' and households' `contact`,
  `certificate_requests.requester_mobile`, sacrament and blood requests'
  mobiles, and the blood donor list.
- Semaphore (Philippine SMS gateway) lists **₱0.56 per text before VAT**
  (about ₱0.63 with VAT) on its website. Selling at **₱1 per credit** leaves
  room for failed texts and your time.

## Decisions (defaults to confirm)

### Who holds the Semaphore account

Two modes, set per parish:

- **Credits (default):** one Semaphore account, **yours**. The parish buys
  credit packs from you; you top up Semaphore.
- **Own key:** the parish has its own Semaphore account and pays Semaphore
  directly. You charge only for the module. No credit tracking.

**Why credits need a central relay:** the parish owns its Supabase project,
so any secret put there can be read by the parish. Your Semaphore API key
must never go into a parish's project. Instead:

- **Hub** = your own Supabase project (free tier, your Gmail), from
  `pro/hub/`. It holds the Semaphore key as a function secret, and a credit
  balance per parish.
- Each parish gets a **parish token** (random, 32+ bytes). The hub keeps only
  its hash. The parish's `send-sms` function holds the token as its secret
  `SMS_HUB_TOKEN`. If the token leaks, it can only spend that parish's own
  credits, and you can replace it.
- The hub needs the keep-alive workflow too (7-day pause on free plans).

### What a text costs

- **One credit per 160-character part** for plain text. A message with an
  emoji or other non-GSM characters drops to 70 characters a part. Bisaya
  text with "ñ" stays plain. The compose box counts parts as you type and
  shows "N people × M parts = X credits" before sending. Check Semaphore's
  docs for its exact counting and use regular (not priority) messages.
- A send that needs more credits than the balance is refused before any
  text goes out.
- Texts that fail at Semaphore are credited back.

### Who gets texts, and consent

- Audiences: whole parish (**household heads only** by default, so a house
  gets one text), one or more GKKs, a ministry or organization, GKK officers,
  parish staff, or a typed list.
- Always left out: members marked Moved away, Deceased or Left the Church;
  numbers on the opt-out list; duplicates (one text per number).
- **Data Privacy Act (RA 10173):** check that the registration consent text
  covers texts from the parish. If it doesn't, change the wording in the free
  app and, until then, text only those who registered after the change, or
  staff tick consent per household. Every broadcast ends with the parish's
  name; an opt-out is recorded by staff when someone asks (Semaphore texts
  are one-way, so "reply STOP" isn't available).

### Automatic texts (each off by default, turned on in settings)

| Trigger | Text (editable) |
|---|---|
| Certificate request → Ready for pick-up (free table, PRO trigger) | "Andam na ang imong sertipiko (CR-…). Kuhaa sa opisina…" |
| Online Mass intention confirmed (plan 02) | "Nadawat ang imong intensyon (MI-…) para sa Misa sa …" |
| Booking confirmed / reminder the day before (plan 04) | "Nakumpirma ang imong schedule …" |
| Blood request: text compatible donors past their rest period | The request's blood type and how to reach the office, never the patient's name |
| Birthdays (daily, 8:00 AM Manila) | A greeting from the parish |

### Access (pro_module_defaults)

| Access | Level |
|---|---|
| Full access, Demo | edit (send broadcasts, settings) |
| Website & requests | view, and the automatic texts their queues trigger |
| Read only, Clergy | view history |
| GKK leader | none in v1 (see Open questions) |

## Data model

### Parish: `P0004_sms.sql`

```sql
create table if not exists sms_settings (
  id              smallint primary key default 1 check (id = 1),
  mode            text not null default 'credits' check (mode in ('credits', 'own_key')),
  sender_name     text,                   -- approved Semaphore sender name, else Semaphore's default
  signature       text,                   -- added at the end, e.g. '- OLG Mua-an'
  auto_certificate boolean not null default false,
  auto_intention   boolean not null default false,
  auto_booking     boolean not null default false,
  auto_birthday    boolean not null default false,
  templates        jsonb not null default '{}'   -- the automatic texts' wording
);

create table if not exists sms_messages (
  id            bigserial primary key,
  kind          text not null default 'broadcast'
                check (kind in ('broadcast', 'certificate', 'intention', 'booking', 'blood', 'birthday', 'test')),
  body          text not null,
  audience      jsonb not null,           -- what was picked: {"gkks": [...], "heads_only": true}
  recipients    int not null default 0,
  parts         int not null,
  credits_used  int not null default 0,
  credits_back  int not null default 0,
  status        text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'partly_failed', 'failed', 'refused')),
  error         text,
  sent_by       uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists sms_recipients (
  message_id   bigint not null references sms_messages(id) on delete cascade,
  phone        text not null,               -- 09XXXXXXXXX
  member_id    integer references members(id) on delete set null,
  status       text not null default 'queued',
  provider_id  text,                        -- Semaphore's message id
  primary key (message_id, phone)
);

create table if not exists sms_opt_out (
  phone      text primary key,
  reason     text,
  added_by   uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
```

Functions:

- `sms_audience_preview(p_audience jsonb)`: count and a sample of names,
  after every exclusion. Never returns numbers to Website & requests or
  Read only accounts.
- `sms_queue(p_kind, p_body, p_audience)`: resolves numbers (normalized to
  `09XXXXXXXXX`, invalid ones left out), writes the message and its
  recipients, then calls `send-sms` through `pg_net`, the way 0034 calls
  `notify-staff`.
- Triggers for the automatic texts. The certificate one is an `after update`
  trigger on the free `certificate_requests` table, **added by PRO, in its
  own function**; it doesn't change any free trigger.
- `pg_cron` job `pro-sms-birthdays` at `0 0 * * *` (00:00 UTC = 8:00 AM
  Manila) when `auto_birthday` is on.

### Edge Function `send-sms` (parish project)

- Called by the database (with a shared secret header, like `notify-staff`)
  or by staff (JWT; checks `pro_can('sms', 'edit')`).
- Mode `credits`: sends the batch to the hub's `sms-relay` with
  `SMS_HUB_TOKEN`. Mode `own_key`: calls Semaphore directly with the
  parish's `SEMAPHORE_API_KEY` secret.
- Batches of up to 1,000 numbers per call (check Semaphore's current
  limit). Records each recipient's status and Semaphore id.
- `handler.js` with its dependencies passed in, so it can be unit tested
  under Node (same pattern as `notify-staff/handler.js`).

### Hub: `pro/hub/`

```sql
create table hub_parishes (
  id          serial primary key,
  name        text unique not null,      -- matches parishes.json
  label       text not null,
  token_hash  text not null,             -- sha-256 of the parish token
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table hub_ledger (                -- the balance is the sum of delta
  id          bigserial primary key,
  parish_id   integer not null references hub_parishes(id),
  delta       integer not null,          -- + purchase / refund, - texts sent
  reason      text not null check (reason in ('purchase', 'send', 'failed_refund', 'adjustment')),
  ref         text,                      -- OR number of a purchase, or the parish's message id
  note        text,
  created_at  timestamptz not null default now()
);
```

- `sms-relay` function: checks the token hash, locks the parish's balance,
  refuses if short, sends through Semaphore, writes one `send` line, and a
  `failed_refund` line for texts that fail. Returns per-number results and
  the new balance.
- `sms-balance` function: the parish's balance and last 50 ledger lines, for
  the parish's admin page.
- `node pro/hub/scripts/credits.mjs add <parish> <credits> <or-number>` for
  recording a purchase; `token <parish>` to make or replace a parish token
  (prints it once).
- No parishioner data is kept at the hub: only counts and message ids.

## Admin

`client/src/pro/sms/`, sidebar **Parish life → Texts (SMS)**
(`/admin/pro/sms`):

- **Compose:** audience picker with the live count, message box with the
  parts counter, credits needed vs balance, **Send test to me**, **Send**.
  A confirmation shows the count and the credits once more.
- **History:** each message, its audience, counts sent/failed, credits used.
  Opens to the recipients' statuses (names shown to edit-level accounts).
- **Credits:** balance, ledger from the hub, and how to buy more (your
  contact and the packs).
- **Opt-outs:** add or remove a number, with a reason.
- **Settings** (Parish Config → PRO → SMS): mode, sender name, signature,
  each automatic text on/off with its wording.
- Slot `dashboardToday`: "Credits low" when under 100.

## Works with other modules

- **02 Intentions** and **04 Bookings** call `sms_queue` with their kinds.
- **Blood requests (free):** a PRO button in the blood request window (the
  `bloodRequestActions` slot from the foundation) texts the compatible donors
  the free page already lists.

## Steps

1. Hub project: tables, `sms-relay`, `sms-balance`, `credits.mjs`, a
   keep-alive. Test with your own number.
2. `P0004_sms.sql`, `send-sms` with unit tests; run on demo with a small
   test credit.
3. Compose, preview, history, credits pages.
4. Opt-outs and the consent check.
5. Automatic texts one by one: certificate ready first.
6. Birthday job.
7. Sender name: apply with Semaphore for one name per parish (it takes time;
   start early).
8. Playbook, release notes, `pro/docs/sms.md` (buying credits, replacing a
   token).

## Testing

Playbook IDs `PRO-SMS-*`:

- SMS-01 A 170-character message counts 2 parts; with an emoji, 3.
- SMS-02 Audience "GKK San Isidro, heads only" counts one per household,
  without moved away / deceased / opted out, and one per number.
- SMS-03 Balance 10, send to 12 people: refused before anything goes out.
- SMS-04 A wrong number fails and its credit comes back in the ledger.
- SMS-05 A wrong or replaced parish token is refused at the hub.
- SMS-06 Certificate request set to Ready for pick-up with auto texts on:
  one text, recorded in History.
- SMS-07 Website & requests can't open Compose or see numbers in History.
- SMS-08 Own-key mode never calls the hub.

## Open questions

- Should GKK leaders text their own GKK (from the parish's credits)?
- Does the registration consent wording already cover texts from the parish?
- Which sender name (e.g. `OLGMUAAN`)? Check Semaphore's rules and
  waiting time.
- Credit packs: ₱500 / ₱1,000 only, or a bigger one for dioceses?
