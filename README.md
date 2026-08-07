# Parish Members Online Registry

A full-stack parish membership registry: a public household registration wizard for parishioners, and an admin panel for parish staff to manage households, members, sacraments, ministries, organizations, and reports.

Built with **React + Tailwind CSS** on the frontend and **Express + PostgreSQL** on the backend.

## Features

**Public registration portal**
- Landing page and a 5-step household registration wizard (household info → members → sacraments → engagement → review)
- Client-side validation, review-before-submit, printable confirmation with a reference number

**Admin panel**
- Staff sign-in (JWT-based auth), with forgotten-password recovery by email
- Parish-configurable email sending, so reset links come from the parish's own address
- Dashboard with registration trends, age distribution, GKK and ministry breakdowns, sacrament stats
- Households: search, filter, expand members, verify/unverify, add new households on a family's behalf, print
- Members: sortable/filterable directory with a full editable detail view (personal info, sacraments, ministries, organizations)
- Sacraments overview table with per-sacrament filters
- Ministry & organization directories with per-group rosters
- Reports: registration status by GKK, sacramental completion, ministry/org participation, blood type directory, and an ad-hoc report builder
- CSV exports for members, households, and blood type directory
- Parish configuration: profile details, email sending, GKK list, ministries, and organizations management

## Tech stack

| Layer    | Tech |
|----------|------|
| Frontend | React 18, React Router, Tailwind CSS, Vite |
| Backend  | Node.js, Express, PostgreSQL (`pg`), JWT auth, bcrypt |

## Project structure

```
package.json   Root scripts — runs the API server and orchestrates the client dev server
server/        Express API + PostgreSQL schema, with its tests in server/test/
client/        React + Tailwind frontend (Vite), with its own package.json
docs/          Deployment guide, testing guide, browser beta-testing playbooks
project/       Original Claude Design source files this app was built from
```

## Getting started

### 1. Install dependencies

Installs both the backend (root) and frontend (`client/`) dependencies:

```bash
npm run install:all
```

### 2. Database

Create a PostgreSQL database, then copy the server env file and fill in your connection string and a random `JWT_SECRET`:

```bash
cd server
cp .env.example .env
cd ..
```

Run the schema + seed script (creates tables, default GKKs/ministries/organizations, and a demo admin account):

```bash
npm run db:setup
```

This leaves you with an **empty register** — no households or members. That is
the right starting point for a real parish.

### 2a. Sample data (optional)

To explore the admin panel with something to look at, load six fictional
households (16 members, spread across every GKK, sacrament, ministry and age
bracket so the dashboard charts are populated):

```bash
npm run db:demo
```

It refuses to run if the register already has records, so it can never mix
sample data into real entries. To clear the register and start fresh:

```bash
npm run db:reset -- --yes
```

`db:reset` deletes households and members but keeps your staff accounts, parish
profile, and pick-lists. See [Managing data](#managing-data) for the full set of
options.

### 3. Run the app

```bash
npm run dev
```

This starts the API server (`http://localhost:4000`) and the Vite dev server (`http://localhost:5173`) together, with `/api` proxied from the client to the server.

- Registration portal: `http://localhost:5173/`
- Admin panel: `http://localhost:5173/admin/login`

Demo admin credentials are seeded from `server/.env` (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`), defaulting to `admin@parishregistry.org` / `ParishAdmin123!`.

## Available scripts

Run from the project root:

| Command | Description |
|---|---|
| `npm run install:all` | Install root (server) and `client/` dependencies |
| `npm run db:setup` | Create schema tables and seed default GKKs/ministries/organizations + a demo admin |
| `npm run db:demo` | Load sample households and members so the admin panel has data to show |
| `npm run db:reset -- --yes` | Delete all households and members, keeping staff accounts and pick-lists |
| `npm run dev` | Run the API server and the Vite client together, with hot reload |
| `npm run dev:server` | Run only the API server (`--watch` mode) |
| `npm run dev:client` | Run only the Vite dev server |
| `npm run build` | Production build of the client |
| `npm start` | Run the API server (production) |
| `npm test` | Run the whole test suite |
| `npm run test:unit` | Pure-function tests only — no database needed |
| `npm run test:api` | HTTP + database tests only |

## Managing data

You can switch between sample data and a clean register at any time.

| Goal | Command |
|---|---|
| Load sample households to explore the app | `npm run db:demo` |
| Replace whatever is there with a fresh sample set | `npm run db:demo -- --replace --yes` |
| Empty the register, keeping staff and pick-lists | `npm run db:reset -- --yes` |
| Reset everything to a just-installed state | `npm run db:reset -- --all --yes` |

Notes:

- **Nothing destructive runs without `--yes`.** Without it, each command prints
  what it *would* delete, along with the current record counts, and exits
  without touching anything.
- **`db:demo` will not append to a non-empty register.** It stops and points you
  at `--replace` or `db:reset`, so sample records cannot end up mixed in with
  real parishioner entries.
- **`db:reset` keeps your staff accounts, parish profile, and GKK/ministry/
  organization lists** — only households and members are removed. Add `--all` to
  wipe those too and restore the stock defaults, which also recreates the seed
  admin account from `server/.env`.
- **Production is guarded.** When `NODE_ENV=production`, both commands refuse
  outright and require an explicit `--i-know-this-is-production` on top of
  `--yes`.

Sample records are fictional and live in
[`server/src/db/demo-data.js`](server/src/db/demo-data.js) — edit that file to
tailor them to your parish.

## Deploying

To put this online on free plans — Supabase for PostgreSQL, Render for the API,
Vercel for the client — follow [`docs/deployment.md`](docs/deployment.md). It
covers the environment variables each host needs, the Supabase connection
string that actually works from Render, and the free-tier limits (cold starts,
project pausing, no backups) worth knowing before a parish depends on it.

`render.yaml` and `vercel.json` in the repo root pre-configure the API service
and the client build.

Password reset emails need a sending service configured under **Parish Config →
Email sending** — the deployment guide walks through it. Free hosting blocks
outbound SMTP, so a Gmail app password will not work; the parish's Gmail address
is used as a verified sender instead.

## Testing

Two halves, both needed before a release.

**Automated** — Node's built-in test runner, no framework to install:

```bash
npm test
```

Unit tests for the validation, paging, reference-number, CSV and auth helpers
run anywhere. The API suites drive the real Express app against a PostgreSQL
database and skip themselves unless `TEST_DATABASE_URL` points at a database
whose name contains `test`:

```bash
createdb parish_registry_test
DATABASE_URL=postgres://…/parish_registry_test npm run db:setup
TEST_DATABASE_URL=postgres://…/parish_registry_test npm test
```

Full details, layout and conventions: [`docs/testing.md`](docs/testing.md).

**Manual** — scripted browser walkthroughs for beta testers, covering the public
registration wizard, the admin panel, reports and exports, plus responsive,
keyboard, printing and data-protection checks:
[`docs/beta-testing/`](docs/beta-testing/README.md). Each check has an ID so bug
reports can point at exactly what failed, and there are templates for bug
reports and for the round's run log.

## License

MIT

## Credit

Built by [DaveenDev](https://github.com/DaveenDev).
