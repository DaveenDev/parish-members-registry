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
client/   React + Tailwind frontend (Vite)
server/   Express API + PostgreSQL schema
project/  Original Claude Design source files this app was built from
```

## Getting started

### 1. Database

Create a PostgreSQL database, then copy the server env file and fill in your connection string:

```bash
cd server
cp .env.example .env
```

Run the schema + seed script (creates tables, default GKKs/ministries/organizations, and a demo admin account):

```bash
npm install
npm run db:setup
```

### 2. API server

```bash
npm run dev
```

The API runs on `http://localhost:4000` by default.

### 3. Client

```bash
cd ../client
npm install
npm run dev
```

The app runs on `http://localhost:5173` and proxies `/api` to the server.

- Registration portal: `http://localhost:5173/`
- Admin panel: `http://localhost:5173/admin/login`

Demo admin credentials are seeded from `server/.env` (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`), defaulting to `admin@parishregistry.org` / `ParishAdmin123!`.

## Credit

Built by [DaveenDev](https://github.com/DaveenDev).
