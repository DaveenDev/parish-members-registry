# PRO 07 (add-on): Diocese Dashboard

> **Status:** proposed 2026-11-05, not started. Build only when a diocese (or
> a vicariate) asks and pays a deposit.
> **Module key:** `diocese`. **Needs:** [00-pro-foundation.md](00-pro-foundation.md).
> **Parish migration:** `pro/supabase/migrations/P0008_diocese_summary.sql` (next free PRO number at build time).
> **Diocese project:** `pro/diocese/` (a separate Supabase project and site).
> Sold to the diocese, not to parishes (starting idea ₱25,000 setup + ₱2,000
> per parish connected). Parishes on the Free version can be connected too:
> the diocese pays.

## Context

- Every parish has its own Supabase project. There's no shared database, by
  design: each parish owns its data.
- A diocese office (the chancery, a vicar forane) wants the picture across
  parishes: families and members, sacraments, census results, how many still
  need baptism, confirmation or a church wedding. Today it asks each parish
  for a typed report.
- The free app already publishes **numbers only, with small groups left
  out** in two places: the home page's sacrament strip (0106, "nothing under
  5") and the public census results (0109, 0114). This module follows the
  same rule.

## Decisions (defaults to confirm)

- **The diocese gets totals, never people.** No names, addresses, phone
  numbers, birthdays or blood types leave a parish. Any number under 5 is
  sent as "under 5", the way 0114 does.
- **Each parish opts in.** The parish priest agrees in writing; a staff
  admin turns it on in Settings → PRO → Diocese, and can turn it off (the
  diocese then keeps only what it already received).
- **The diocese owns its project:** a Supabase project and a Vercel site
  under the diocese's own Gmail, set up by you, like a parish.
- **Pull, nightly.** The diocese project asks each parish once a night for
  its summary and keeps one snapshot per parish per day. Parishes never write
  into the diocese project.
- **What's in a summary (v1):**
  - households and members (registered, verified), by sex and age band;
  - members by GKK count only (number of GKKs, households per GKK as a
    spread, not GKK names, unless the parish allows names);
  - sacraments received per year (from the registers when 01 is on, else
    from members' records);
  - candidates: not yet baptized, no First Communion, not confirmed (old
    enough for each, as 0070 counts them), couples who could marry in church;
  - the latest census: households that took part vs the census before,
    practicing status spread (0017, 0084);
  - ministries and organizations: count and members in them;
  - requests per month: certificates, OCIA, Anointing, blood calls;
  - PRO modules on, if any (e.g. certificates issued per month from 01).
- **Diocese staff accounts** see every parish (bishop's office) or only their
  vicariate (vicar forane).

## Parish side: `P0008_diocese_summary.sql`

```sql
create extension if not exists pgcrypto with schema extensions;  -- digest()

create table if not exists diocese_link (
  id          smallint primary key default 1 check (id = 1),
  enabled     boolean not null default false,
  diocese     text,                         -- 'Diocese of …'
  key_hash    text,                         -- sha-256 of the diocese's key for this parish
  show_gkk_names boolean not null default false,
  enabled_by  uuid references auth.users(id) on delete set null,
  enabled_at  timestamptz,
  last_pulled_at timestamptz
);

-- The diocese's nightly call. Reached through the parish's public API with
-- its anon key (already public in client/.env.production) plus the header
-- x-diocese-key, checked against key_hash. Returns totals only.
create or replace function public.diocese_summary() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
begin
  perform public_request_guard('pro_diocese', 10, 50);
  if not exists (select 1 from diocese_link
                 where enabled and key_hash = encode(extensions.digest(coalesce(headers->>'x-diocese-key', ''), 'sha256'), 'hex')) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update diocese_link set last_pulled_at = now() where id = 1;
  return jsonb_build_object(
    'version', 1,
    'as_of', now()
    -- … the totals listed above, each through a helper that turns
    --     anything under 5 into the string 'under 5'
  );
end;
$$;
grant execute on function public.diocese_summary() to anon;
```

(The sketch shows the shape only.) Reuse the free counting functions where they exist
(the dashboard and report totals from 0010 and 0070, the census snapshot from
0082) instead of counting again, and call them read-only.

Admin: **Settings → PRO → Diocese** (staff admins): on/off, the diocese's
name, "show GKK names", a preview of exactly what the diocese will see, and
when it was last pulled. Turning it on asks the staff admin to paste the key
the diocese gave them.

## Diocese project: `pro/diocese/`

```sql
create table vicariates (
  id    serial primary key,
  name  text not null unique
);

create table diocese_parishes (
  id            serial primary key,
  name          text not null unique,
  vicariate_id  integer references vicariates(id),
  supabase_url  text not null,
  anon_key      text not null,              -- public anyway
  link_key      text not null,              -- secret: kept as a column only the pull function reads
  active        boolean not null default true,
  last_ok_at    timestamptz,
  last_error    text
);

create table diocese_snapshots (
  parish_id  integer not null references diocese_parishes(id),
  taken_on   date not null,
  data       jsonb not null,
  primary key (parish_id, taken_on)
);

create table diocese_staff (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  name         text not null,
  vicariate_id integer references vicariates(id)   -- null = the whole diocese
);
```

- `pull-parishes` Edge Function, run nightly by `pg_cron` + `pg_net`: calls
  each active parish's `diocese_summary` with its key, saves the day's
  snapshot, records errors. Keeps snapshots: daily for 90 days, then the
  1st of each month.
- RLS: diocese staff see their vicariate's parishes (or all).
- Site (a small React + Tailwind app in `pro/diocese/client/`, reusing the
  free app's chart components where they fit): diocese totals, a table of
  parishes side by side, one parish's page with its trend, vicariate
  filter, print and CSV export. A parish that hasn't answered for 3 nights
  shows a warning.
- Keep-alive workflow, as the parishes have.

## Steps

1. Meet the diocese office: which numbers they ask parishes for now, and in
   what form. Match v1's summary to that list.
2. `P0008_diocese_summary.sql` with the small-number rule; the preview in
   Settings → PRO → Diocese. Test on demo.
3. Diocese project: tables, `pull-parishes`, RLS.
4. Diocese site: totals, parishes table, parish page, vicariate filter.
5. Connect Mua-an (with its parish priest's agreement) and the demo site.
6. Setup guide in `pro/docs/diocese.md` (adding a parish, replacing a key).

## Testing

Playbook IDs `PRO-DIO-*`:

- DIO-01 With the link off, `diocese_summary` refuses every call.
- DIO-02 A wrong key is refused; too many calls are rate-limited.
- DIO-03 A GKK with 3 households shows "under 5"; no field anywhere in the
  summary is a name, phone, address or date of birth (check the JSON keys
  against a list).
- DIO-04 The preview in Settings shows exactly what the pull receives.
- DIO-05 A vicar forane sees only his vicariate's parishes.
- DIO-06 A parish offline for 3 nights shows the warning; its last
  snapshot stays.
- DIO-07 Turning the link off: the next pull fails, the diocese keeps old
  snapshots.

## Open questions

- Does the diocese want GKK (BEC) level numbers by name?
- Which vicariates, and which parishes first?
- Does the diocese already use another system its numbers must match?
