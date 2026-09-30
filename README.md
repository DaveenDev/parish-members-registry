# Parish Members Online Registry

A full-stack parish membership registry: a public household registration wizard for parishioners, and an admin panel for parish staff to manage households, members, sacraments, ministries, organizations, and reports.

Built with **React + Tailwind CSS**, talking directly to **Supabase** (Postgres + Auth) — no separate backend server. Row Level Security policies and Postgres functions (in `supabase/migrations/`) enforce who can read/write what.

## Features

**Public registration portal**
- Landing page and a 5-step household registration wizard (household info → members → sacraments → engagement → review)
- Client-side validation, review-before-submit, printable confirmation with a reference number

**Admin panel**
- Staff sign-in (Supabase Auth)
- Dashboard with registration trends, age distribution, GKK and ministry breakdowns, sacrament stats
- Households: search, filter, expand members, verify/unverify, add new households on a family's behalf, print
- Members: sortable/filterable directory with a full editable detail view (personal info, sacraments, ministries, organizations)
- Sacraments overview table with per-sacrament filters
- Ministry & organization directories with per-group rosters
- Reports: registration status by GKK, sacramental completion, ministry/org participation, blood type directory, and an ad-hoc report builder
- CSV exports for members, households, and blood type directory
- Parish configuration: profile details, GKK list, ministries, and organizations management

## Tech stack

| Layer    | Tech |
|----------|------|
| Frontend | React 18, React Router, Tailwind CSS, Vite |
| Backend  | Supabase (Postgres, Row Level Security, Auth, Postgres functions) |
| Hosting  | Vercel (frontend) + Supabase (database), both free-tier |

## Project structure

```
supabase/migrations/  Schema, RLS policies, and Postgres functions (ref numbers,
                       rename/delete-guard, public registration RPC)
scripts/               Local demo/reset seeding against a Supabase project
client/                React + Tailwind frontend (Vite), with its own package.json
docs/                  Testing guide and browser beta-testing playbooks
project/               Original Claude Design source files this app was built from
```

## Getting started

### 1. Create a Supabase project

Follow [`guadalupe-registry-deployment-guide.md`](guadalupe-registry-deployment-guide.md) Part 1, or in short:

1. Create a project at [supabase.com](https://supabase.com).
2. Open the SQL editor and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) — this creates every table, view, RLS policy, and function, and seeds the default GKKs/ministries/organizations. Then run each later migration in order ([`0002_head_first_registration.sql`](supabase/migrations/0002_head_first_registration.sql) adds the Household Head fields, the participation survey, and the public GKK list). Existing projects only need the migrations they haven't run yet.
3. Create your first admin: **Authentication → Users → Add user**, then run the `insert into profiles (...)` statement at the bottom of the migration file with that user's UUID.
4. **Authentication → Providers → Email → turn off "Allow new users to sign up."**
5. Copy your **Project URL** and **anon/publishable key** from **Project Settings → API**.

### 2. Install dependencies

```bash
npm run install:all
```

### 3. Configure the client

```bash
cd client
cp .env.example .env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
cd ..
```

### 4. Run the app

```bash
npm run dev
```

- Registration portal: `http://localhost:5173/`
- Admin panel: `http://localhost:5173/admin/login` (sign in with the admin account from step 1)

### 5. Sample data (optional)

`scripts/supabase-seed.mjs` inserts/clears demo households directly against your Supabase project using the **service-role key** — keep it out of the client and out of Vercel's env vars. Set it in a root, gitignored `.env` (see `.env.example`):

```bash
npm run db:demo    # insert six fictional sample households
npm run db:reset   # delete every household (and, via cascade, every member)
```

## Available scripts

Run from the project root:

| Command | Description |
|---|---|
| `npm run install:all` | Install root and `client/` dependencies |
| `npm run dev` | Run the Vite client with hot reload |
| `npm run build` | Production build of the client |
| `npm run db:demo` | Load sample households and members (see above) |
| `npm run db:reset` | Delete all households and members |
| `npm test` | Run the client test suite |
| `npm run test:watch` | Client tests, watch mode |

Sample records are fictional and live in
[`scripts/demo-data.mjs`](scripts/demo-data.mjs) — edit that file to tailor them
to your parish.

## Deploying

See [`guadalupe-registry-deployment-guide.md`](guadalupe-registry-deployment-guide.md) for the full Vercel + Supabase walkthrough. In short: push to GitHub, import the repo into Vercel with **Root Directory set to `client`**, add `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` as Vercel env vars, and deploy — `client/vercel.json` handles the SPA routing rewrite.

## Testing

Two halves, both needed before a release.

**Automated** — Node's built-in test runner, no framework to install:

```bash
npm test
```

Covers pure browser-side logic (CSV building, shared constants/helpers). The
RLS policies and Postgres functions in `supabase/migrations/0001_init.sql` are
the source of truth for server-side behavior and aren't covered by this suite —
verify them against a real Supabase project (see [`docs/testing.md`](docs/testing.md)).

**Manual** — scripted browser walkthroughs for beta testers, covering the public
registration wizard, the admin panel, reports and exports, plus responsive,
keyboard, printing and data-protection checks:
[`docs/beta-testing/`](docs/beta-testing/README.md). Each check has an ID so bug
reports can point at exactly what failed, and there are templates for bug
reports and for the round's run log.

> Note: both testing docs still describe the retired Express/PostgreSQL setup
> in places (e.g. `TEST_DATABASE_URL`, `db:setup`) — treat those specific
> mentions as stale pending a follow-up pass.

## License

MIT

## Credit

Built by [DaveenDev](https://github.com/DaveenDev).
