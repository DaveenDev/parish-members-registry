# Deploying the Our Lady of Guadalupe Registry to Vercel + Supabase

A step-by-step guide to take the Members Registry from your local machine to a live, free-tier deployment. Written for the architecture we settled on: **React frontend on Vercel**, **PostgreSQL + Auth + auto-generated APIs on Supabase**, no separate Express server needed.

This guide assumes you already have the app running locally. Where it matters, notes call out what to change so the same codebase works both locally and in production.

---

## Overview: what goes where

| Piece | Runs on | Cost |
|---|---|---|
| React app (public portal + admin panel) | Vercel | Free |
| PostgreSQL database | Supabase | Free |
| Authentication (admin login) | Supabase Auth | Free |
| Data APIs (registration, queries) | Supabase auto-generated REST/JS client | Free |
| File storage (optional, e.g. member photos) | Supabase Storage | Free (1 GB) |

The flow: a parishioner opens your Vercel URL → the React app talks directly to Supabase over HTTPS → Supabase enforces access rules and reads/writes Postgres.

**One thing to accept up front:** because the browser talks to Supabase directly, your database security lives in **Row Level Security (RLS) policies**, not in a backend you control. This guide treats RLS as mandatory, not optional. Get it right and the free-tier, no-backend design is genuinely safe for a members registry. Skip it and your data is exposed.

---

## Part 0 — Before you start

Have these ready:

1. A **GitHub account**, with your registry code pushed to a repository (Vercel deploys from GitHub).
2. A **Supabase account** (sign up at supabase.com — free, use GitHub login for speed).
3. A **Vercel account** (sign up at vercel.com — free, also use GitHub login).
4. Your local project building cleanly (`npm run build` succeeds with no errors).
5. **Node.js 18+** locally.

A note on the free-tier pause: Supabase free projects pause after 7 days of no activity. For an actively used parish registry this rarely triggers, but if the app will sit idle between busy seasons, know that the first visit after a pause takes ~60 seconds to wake, and someone may need to un-pause it from the dashboard. This is the main reason to revisit a paid tier only if/when the parish depends on it daily.

---

## Part 1 — Set up the Supabase database

### 1.1 Create the project

1. Log in to supabase.com → **New project**.
2. Name it `guadalupe-registry`.
3. Set a strong **database password** — save it in your password manager; you'll rarely type it but you cannot recover it, only reset it.
4. Choose the **Southeast Asia (Singapore)** region — it's the closest to the Philippines and gives the lowest latency.
5. Wait ~2 minutes for provisioning.

### 1.2 Create the schema

Open the **SQL Editor** in the Supabase dashboard and run the schema below. This mirrors the household → members → sacraments structure from the registry design.

```sql
-- Households (the family unit)
create table households (
  id uuid primary key default gen_random_uuid(),
  family_name text not null,
  street text,
  barangay text,
  city text,
  province text,
  zip text,
  parish_zone text,
  contact_number text,
  email text,
  registration_status text default 'Pending', -- Pending | Verified
  created_at timestamptz default now()
);

-- Individual members, each belonging to a household
create table members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  first_name text not null,
  middle_name text,
  last_name text not null,
  relationship text,        -- Head, Spouse, Child, etc.
  sex text,
  date_of_birth date,
  place_of_birth text,
  civil_status text,        -- Single | Married | Widowed | Separated
  contact_number text,
  email text,
  occupation text,
  religion text default 'Roman Catholic',
  created_at timestamptz default now()
);

-- Sacraments received, one row per sacrament per member
create table sacraments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  type text not null,       -- Baptism | First Communion | Confirmation | Matrimony | Penance | Holy Orders
  date_received date,
  parish_church text,
  confirmation_name text,   -- Confirmation only
  sponsor text,             -- Confirmation / Baptism
  marriage_type text,       -- Matrimony only: Catholic | Convalidation
  created_at timestamptz default now()
);

-- Ministry / organization involvement
create table ministries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  ministry_name text not null
);

-- Helpful indexes for admin search/filter
create index idx_members_household on members(household_id);
create index idx_sacraments_member on sacraments(member_id);
create index idx_ministries_member on ministries(member_id);
create index idx_members_lastname on members(last_name);
```

Run it. You should see the four tables under **Table Editor**.

### 1.3 Turn on Row Level Security and write policies

This is the security heart of the whole design. By default, with RLS off, anyone with your public key could read everything — unacceptable for personal records. Turn RLS on for every table, then grant only the exact access each role needs.

The model:
- **Anonymous public visitors** may **insert** a registration (their own household + members + sacraments). They may **not read** anyone's data.
- **Authenticated admins** may do everything (read, update, verify, archive).

Run this in the SQL Editor:

```sql
-- Enable RLS on all tables
alter table households  enable row level security;
alter table members     enable row level security;
alter table sacraments  enable row level security;
alter table ministries  enable row level security;

-- PUBLIC: allow inserts only (self-registration), no reads
create policy "public can register household"
  on households for insert to anon with check (true);
create policy "public can add members"
  on members for insert to anon with check (true);
create policy "public can add sacraments"
  on sacraments for insert to anon with check (true);
create policy "public can add ministries"
  on ministries for insert to anon with check (true);

-- ADMINS (any logged-in user): full access
create policy "admins full access households"
  on households for all to authenticated using (true) with check (true);
create policy "admins full access members"
  on members for all to authenticated using (true) with check (true);
create policy "admins full access sacraments"
  on sacraments for all to authenticated using (true) with check (true);
create policy "admins full access ministries"
  on ministries for all to authenticated using (true) with check (true);
```

**Important nuance:** the above treats *every authenticated user as an admin*. That is only safe if the only accounts that ever exist are admin accounts. Since your registry's public side registers people **without** creating login accounts (it just inserts rows anonymously), this holds — parishioners never get authenticated sessions. Just make sure you **disable public sign-ups** (Part 2.2) so no one can self-provision an admin login.

### 1.4 Create the admin account(s)

1. In the dashboard go to **Authentication → Users → Add user**.
2. Enter the parish admin's email and a strong temporary password.
3. In the SQL editor, give that account a profile and make it a staff admin (after running every migration in `supabase/migrations/`, including `0010_admin_tools.sql`):
   ```sql
   insert into profiles (id, name, role, is_admin)
   values ('<the new user''s UUID>', 'Ma. Assumpta R.', 'Parish Secretary', true);
   ```
4. Deploy the staff-accounts Edge Function so admins can manage everyone else from the admin panel (**Settings → Staff**) instead of this dashboard:
   ```bash
   npx supabase login
   npx supabase functions deploy manage-staff --project-ref <your-project-ref>
   ```
   (Or **Edge Functions → Deploy a new function** in the dashboard, named `manage-staff`, with the two files from `supabase/functions/manage-staff/`.) The function holds the service-role key on Supabase's side; it never reaches the browser.
5. Sign in as the admin and add the other staff from **Settings → Staff**. Each new account gets a temporary password for you to pass on. Keep this list short, and disable accounts when people leave.

### 1.5 Grab your API keys

Go to **Project Settings → API**. Copy two values:
- **Project URL** (e.g. `https://xxxx.supabase.co`)
- **anon public key** (a long token)

The anon key is safe to ship in a frontend — it only grants what your RLS policies allow. **Never** put the `service_role` key in frontend code; it bypasses RLS entirely. If you ever see yourself copying `service_role` into the React app, stop.

---

## Part 2 — Wire the React app to Supabase

### 2.1 Install the client

In your local project:

```bash
npm install @supabase/supabase-js
```

### 2.2 Configure Auth settings

In the Supabase dashboard → **Authentication → Providers / Sign In**:
- Keep **Email** enabled (for admin login).
- **Disable "Enable new user signups"** so the public cannot create accounts. Admins are created manually (Part 1.4). This is what makes the "every authenticated user is admin" model safe.

### 2.3 Add a Supabase client file

Create `src/lib/supabaseClient.js`:

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

> This uses Vite's `import.meta.env` and the `VITE_` prefix. If you're on Create React App instead, use `process.env.REACT_APP_SUPABASE_URL` and name the variables `REACT_APP_...`. Match whichever build tool your project uses.

### 2.4 Use environment variables, never hard-coded keys

Create a `.env.local` file in your project root for local development:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Add `.env.local` to your `.gitignore` so it never gets committed. You'll set the same variables in Vercel later (Part 3.3). This is the one config step that makes the same code run locally and in production without edits.

### 2.5 Example: public registration insert

The registration wizard's final submit inserts the household, then members, then their sacraments. A simplified version:

```javascript
import { supabase } from '../lib/supabaseClient'

async function submitRegistration(form) {
  // 1. Insert household, get its new id back
  const { data: household, error: hErr } = await supabase
    .from('households')
    .insert({
      family_name: form.familyName,
      street: form.street,
      barangay: form.barangay,
      city: form.city,
      province: form.province,
      zip: form.zip,
      parish_zone: form.parishZone,
      contact_number: form.contactNumber,
      email: form.email,
    })
    .select()
    .single()
  if (hErr) throw hErr

  // 2. Insert each member under that household
  for (const m of form.members) {
    const { data: member, error: mErr } = await supabase
      .from('members')
      .insert({ household_id: household.id, ...m.fields })
      .select()
      .single()
    if (mErr) throw mErr

    // 3. Insert that member's sacraments
    if (m.sacraments?.length) {
      const rows = m.sacraments.map(s => ({ member_id: member.id, ...s }))
      const { error: sErr } = await supabase.from('sacraments').insert(rows)
      if (sErr) throw sErr
    }
  }

  return household.id // use as the reference number on the confirmation screen
}
```

### 2.6 Example: admin login and reading data

```javascript
// Login (admin panel)
async function login(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

// Read all households with member counts (only works when logged in, per RLS)
async function getHouseholds() {
  const { data, error } = await supabase
    .from('households')
    .select('*, members(count)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}
```

Because of RLS, the exact same `getHouseholds()` call returns rows for a logged-in admin and returns nothing for an anonymous visitor — the database enforces it, not your UI.

### 2.7 Test locally against the live database

Run `npm run dev`. Your local app is now talking to the real Supabase project. Do a full test:
- Submit a test registration from the public portal → confirm the rows appear in Supabase Table Editor.
- Log in on the admin panel with the account from Part 1.4 → confirm you can see the data.
- Log out → confirm the admin data calls return empty (proves RLS works).

Delete the test rows before going live.

---

## Part 3 — Deploy the frontend to Vercel

### 3.1 Push to GitHub

```bash
git add .
git commit -m "Configure Supabase integration"
git push origin main
```

Confirm `.env.local` is **not** in the repo (check on GitHub). If you accidentally committed it, rotate your keys in Supabase.

### 3.2 Import the project into Vercel

1. Log in to vercel.com → **Add New → Project**.
2. Select your GitHub repository.
3. Vercel auto-detects Vite/React and fills in the build command (`npm run build`) and output directory (`dist` for Vite, `build` for CRA). Leave the defaults unless yours differ.

### 3.3 Add environment variables in Vercel

Before the first deploy, expand **Environment Variables** and add the same two from your `.env.local`:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | your anon key |

(Use the `REACT_APP_` names instead if you're on CRA.) Missing this step is the #1 reason a Vercel build succeeds but the live site can't reach the database.

### 3.4 Deploy

Click **Deploy**. In ~1–2 minutes you get a live URL like `guadalupe-registry.vercel.app`. Every future `git push` to `main` auto-deploys.

### 3.5 Handle client-side routing (avoid 404 on refresh)

Single-page React apps 404 when someone refreshes a deep link like `/admin`. Add a `vercel.json` in your project root to route everything back to the app:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Commit and push. (Skip this only if you use hash routing.)

---

## Part 4 — Go-live checklist

Before handing the URL to the parish, verify:

- [ ] RLS is **enabled** on all four tables (Supabase → Table Editor shows a shield icon).
- [ ] Public sign-ups are **disabled** in Auth settings.
- [ ] A test anonymous visit can register but **cannot** read others' data.
- [ ] Admin login works and shows the full database.
- [ ] The `service_role` key appears **nowhere** in your frontend or GitHub repo.
- [ ] `.env.local` is gitignored; keys live in Vercel's env settings.
- [ ] Test/dummy rows are deleted.
- [ ] The data-privacy consent checkbox is present on the registration form.
- [ ] Refreshing `/admin` doesn't 404 (rewrites in place).

---

## Part 5 — Operating it after launch

**Custom domain (optional):** In Vercel → Project → Domains, add a domain like `olgregistry.org`. Vercel gives you free HTTPS. A `.org` runs ~₱600–1,200/year from a registrar; pointing it at Vercel costs nothing extra (unlike pointing a custom domain at Supabase, which charges $10/mo).

**Backups:** The free Supabase tier has **no automatic backups** — this is its biggest risk for a records system, more than the storage limit. Set up a free scheduled dump: a GitHub Actions workflow can `pg_dump` your database on a schedule and store it (e.g. in the repo or cloud storage). At minimum, periodically use **Database → Backups / export** or run a manual `pg_dump` and keep a copy. Do this from day one.

**Exports for staff:** Your admin panel's CSV export covers day-to-day needs; the point above is about disaster recovery, which is separate.

**Watching the free limits:** For a parish registry you're extremely unlikely to hit the 500 MB database or 5 GB egress caps. The limit you'll meet first is the 7-day inactivity pause. If the parish uses it regularly, you'll never notice it.

**When to consider paying:** Only move to Supabase Pro ($25/mo) if the parish needs guaranteed always-on (no pause), daily automated backups, or the app grows well beyond a single parish. Until then, ₱0/month is the right answer.

---

## Quick reference: the whole flow in one place

1. Create Supabase project (Singapore region) → run schema SQL → enable RLS + policies → create admin users → copy URL + anon key.
2. `npm install @supabase/supabase-js` → add `supabaseClient.js` → put keys in `.env.local` (gitignored) → disable public signups.
3. Test locally against live Supabase → verify RLS by logging out.
4. Push to GitHub → import to Vercel → add env vars → deploy → add `vercel.json` rewrites.
5. Run the go-live checklist → set up backups → hand over the URL.
