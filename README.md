# Parish Members Online Registry

A full-stack parish membership registry: a public household registration wizard for parishioners, and an admin panel for parish staff to manage households, members, sacraments, ministries, organizations, and reports.

Built with **React + Tailwind CSS** on the frontend and **Express + PostgreSQL** on the backend.

## Features

**Public registration portal**
- Landing page and a 5-step household registration wizard (household info → members → sacraments → engagement → review)
- Client-side validation, review-before-submit, printable confirmation with a reference number

**Admin panel**
- Staff sign-in (JWT-based auth)
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
| Backend  | Node.js, Express, PostgreSQL (`pg`), JWT auth, bcrypt |

## Project structure

```
package.json   Root scripts — runs the API server and orchestrates the client dev server
server/        Express API + PostgreSQL schema
client/        React + Tailwind frontend (Vite), with its own package.json
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
| `npm run dev` | Run the API server and the Vite client together, with hot reload |
| `npm run dev:server` | Run only the API server (`--watch` mode) |
| `npm run dev:client` | Run only the Vite dev server |
| `npm run build` | Production build of the client |
| `npm start` | Run the API server (production) |

## License

MIT

## Credit

Built by [DaveenDev](https://github.com/DaveenDev).
