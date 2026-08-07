# Deploying to production (free tier)

This walks the app from a local checkout to a live site on **Supabase**
(PostgreSQL) + **Render** (Express API) + **Vercel** (React client), all on
free plans.

Read [What the free tier costs you](#what-the-free-tier-costs-you) before you
promise anyone a launch date — the free tiers have real limits, and one of them
(cold starts) is very visible to parishioners.

---

## The shape of the deployment

```
Parishioner's browser
   │
   ├── https://your-parish.vercel.app        Vercel — static React build
   │        │
   │        └── fetch() ──► https://parish-registry-api.onrender.com/api/…
   │                              │
   │                              ▼
   │                        Render — Express API (npm start)
   │                              │
   │                              ▼
   │                        Supabase — PostgreSQL
```

Three hosts, three sets of environment variables. The client is built once with
the API's URL baked in, so **changing the API URL means rebuilding the client**.

---

## 1. Database — Supabase

1. Create a project at [supabase.com](https://supabase.com). Pick a region near
   your parish. Save the database password it shows you — it appears once.
2. **Project Settings → Database → Connection string → URI.** You will see
   several options. Take the **Session pooler** one:

   ```
   postgresql://postgres.abcdefgh:YOUR-PASSWORD@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```

   > **Do not use the "Direct connection" string.** Supabase's direct host is
   > IPv6-only, and Render's free tier has no IPv6 egress — the API will fail
   > with `ENETUNREACH` and you will lose an hour to it. The pooler host is
   > IPv4. The Transaction pooler (port 6543) also works with this app, but
   > Session mode is the safer default.

3. Replace `YOUR-PASSWORD` in the URI with your actual password, URL-encoding
   any special characters (`@` → `%40`, `#` → `%23`, and so on).

### Create the schema

Run the setup script from your own machine, pointed at Supabase:

```bash
DATABASE_URL='postgresql://postgres.abc:pw@aws-0-eu-west-2.pooler.supabase.com:5432/postgres' \
NODE_ENV=production \
SEED_ADMIN_EMAIL='secretary@yourparish.org' \
SEED_ADMIN_PASSWORD='<a strong password you choose>' \
npm run db:setup
```

`NODE_ENV=production` is what forces you to supply a real admin password —
without it the script would seed `ParishAdmin123!`, which is printed in this
repo's README and therefore public.

The script is idempotent, so it is safe to re-run after a schema change.

> **Do not run `npm run db:demo` against production.** The fictional households
> are for exploring the admin panel locally.

---

## 2. API — Render

### Option A — Blueprint (uses the committed `render.yaml`)

**New → Blueprint → connect this repo.** Render reads `render.yaml` and creates
the service. It will prompt for the three secret values.

### Option B — by hand

**New → Web Service → connect this repo**, then:

| Field | Value |
|---|---|
| Runtime | Node |
| Build command | `npm ci --omit=dev` |
| Start command | `npm start` |
| Health check path | `/api/health` |
| Instance type | Free |

### Environment variables

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `NODE_VERSION` | `22` |
| `DATABASE_URL` | the Supabase **session pooler** URI from step 1 |
| `JWT_SECRET` | a long random string — see below |
| `CORS_ORIGIN` | your Vercel URL, e.g. `https://your-parish.vercel.app` |
| `PUBLIC_APP_URL` | the same Vercel URL — password reset links are built from it |

Generate the secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

The server refuses to start in production if `JWT_SECRET` is missing, shorter
than 32 characters, or still the development default. That is deliberate: the
dev default is in this repo, and anyone with it can mint a valid staff session.

`CORS_ORIGIN` is a chicken-and-egg with step 3 — deploy Render first with it
blank, get the Vercel URL, then come back and set it. **Leaving it blank means
every origin is allowed**, which is fine for an afternoon of testing and not
fine permanently.

Do not set `PORT` or `API_PORT`. Render injects `PORT`, and the server prefers
it over everything else.

Once deployed, check it:

```bash
curl https://parish-registry-api.onrender.com/api/health
# {"ok":true}
curl https://parish-registry-api.onrender.com/api/health/db
# {"ok":true,"db":"up"}
```

If the second one returns `503`, the API is up but cannot reach Supabase —
almost always the direct-vs-pooler connection string, or an unescaped character
in the password.

---

## 3. Client — Vercel

**Add New → Project → import this repo.** The committed `vercel.json` sets the
build command, output directory, and the SPA rewrite, so leave the framework
preset alone and do not set a root directory.

Add one environment variable, for **all** environments:

| Key | Value |
|---|---|
| `VITE_API_BASE` | `https://parish-registry-api.onrender.com` |

Origin only — no trailing `/api`, no trailing slash. The client appends `/api`.

Vite inlines `VITE_*` variables at build time, so **after changing this you must
redeploy**, not just restart. Deployments → ⋯ → Redeploy.

Then go back to Render and set `CORS_ORIGIN` to the Vercel URL you were given.

### Why the rewrite matters

`vercel.json` rewrites every non-asset path to `/index.html`. Without it,
loading `https://your-parish.vercel.app/admin/login` directly returns a 404 —
React Router only works if the host serves the app shell for unknown paths.
Clicking through from the home page would work, which is exactly why this bug
survives casual testing and then breaks every bookmark and shared link.

---

## 4. Email — Brevo

Password reset links are the only email this app sends, and without them a
locked-out secretary needs you and a database connection string.

**Why not Gmail's SMTP directly?** Render's free web services block outbound
traffic to ports 25, 465 and 587, so `smtp.gmail.com` simply times out there.
The Gmail API over HTTPS avoids the block but needs a Google Cloud project, and
its refresh tokens expire every 7 days until Google verifies the app — a
feature used twice a year would be broken almost every time it was needed.

Sending through an HTTPS API sidesteps both problems, and the parish's own
Gmail address is still what recipients see in the From line.

1. Sign up at [brevo.com](https://www.brevo.com) — the free tier sends 300
   emails a day, far beyond what password resets need.
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender.** Enter the
   parish's Gmail address. Brevo emails it a confirmation link; click it. This
   is single-sender verification — it does **not** require owning a domain.
3. **SMTP & API → API Keys → Generate a new API key.** Copy it now; it is shown
   once. (The key is for the HTTP API — you are not using Brevo's SMTP either.)
4. In the admin panel: **Parish Config → Email sending.** Choose Brevo, paste
   the API key, set the sender address to the address you just verified, tick
   **Send password reset emails**, and save.
5. Press **Send test email**. It goes to the address you are signed in as. If
   it arrives, the reset flow works.

The API key is encrypted (AES-256-GCM) before it is stored, and the server
never sends it back to the browser — the settings page only learns whether one
is set. The encryption key is derived from `CREDENTIALS_SECRET`, falling back
to `JWT_SECRET`. **Rotating `JWT_SECRET` therefore makes a stored key
unreadable**, and the settings page will tell you to re-enter it. Set
`CREDENTIALS_SECRET` separately if you would rather the two not be linked.

`PUBLIC_APP_URL` must be right or the emailed links point nowhere. The API
refuses to guess it in production rather than trusting the request's `Origin`
header, which anyone can forge.

If you later buy a domain, Resend is the nicer service and is also supported —
it needs the domain verified, which is why it is not the default.

## 5. Post-deploy checklist

- [ ] `GET /api/health` and `/api/health/db` both return `ok`
- [ ] The registration wizard submits and shows a reference number
- [ ] `/admin/login` loads **when typed directly into the address bar**
- [ ] Sign in with the admin account you seeded, and the dashboard renders
- [ ] **Parish Config → Email sending** is configured and the test email arrives
- [ ] "Forgot password?" on the sign-in page sends a link that actually works —
      test this before you need it
- [ ] Change the admin password from **Parish Config → Change password**. Note
      the seeder never overwrites an existing password, so the account has to be
      created with the password you intend to keep
- [ ] A CSV export downloads
- [ ] `CORS_ORIGIN` is set on Render to exactly your Vercel origin
- [ ] Open the site from a phone — the wizard is the part parishioners use

---

## What the free tier costs you

These are the things that will surprise you after launch.

**Render free web services sleep after 15 minutes of no traffic.** The next
visitor waits **roughly 50 seconds** for the container to boot before anything
renders. For a parish registration page that is opened a few times a day, this
is the single worst part of the free stack. Mitigations:

- Ping `/api/health` every 10 minutes from a free scheduler
  ([cron-job.org](https://cron-job.org), UptimeRobot). One always-on service
  uses ~730 hours/month against Render's 750-hour free allowance, so this fits —
  but only for **one** service.
- Or accept it and put a "loading, please wait" state on the first request.
- Or move the API to a platform that does not sleep (Fly.io's free allowance,
  or Vercel serverless functions — the latter is a real rewrite, since Express
  with a connection pool does not map cleanly onto serverless).

**Supabase pauses free projects after 7 days of inactivity.** A paused project
must be restored by hand from the dashboard. The `/api/health/db` endpoint runs
a real query, so point your uptime pinger at **that** rather than `/api/health`
and both problems are solved by one cron job.

**Free Postgres is 500 MB and gets no automatic backups.** For a parish
register this is plenty of space and a genuine problem for durability. Export
regularly — the admin panel's CSV exports are the low-tech answer, and
`pg_dump` against the pooler URI is the thorough one. Put a monthly reminder in
a calendar; this is real people's sacramental records.

**Rate limiting is per-instance and in memory.** Restarts reset the counters.
Adequate for one small service; it would need Redis if you ever scale out.

**Vercel's free plan is for non-commercial use.** A parish registry is fine.
Read the terms if the parish ever charges for anything.

---

## Things this stack does not give you, that you may still want

Ranked by how much a live parish would actually miss them.

1. **Backups you can restore from.** See above. Nothing else on this list
   matters as much.
2. **A real domain.** `your-parish.vercel.app` is hard to say from a pulpit.
   A domain is ~£10/year and attaches free on Vercel (Settings → Domains).
   Point the API at a subdomain (`api.yourparish.org`) too, so a host change
   later does not mean rebuilding the client.
3. **A second staff account.** Password reset now works, but recovery still
   depends on one person's inbox. Two accounts means a locked-out secretary has
   someone in the office to turn to, rather than waiting on email. There is no
   staff-management UI yet — accounts are created by the seed script.
4. **Error visibility.** Errors go to `console.error` and into Render's log
   tail, which the free plan keeps briefly. Sentry's free tier takes ten minutes
   to wire in and tells you about breakage before a parishioner does.
5. **Data protection posture.** This app stores names, birth dates, addresses,
   and blood types of identifiable people — that is personal data under GDPR
   and equivalents. Before going live you want: a privacy notice on the
   registration page saying what is collected and why, a retention answer, and
   a named person responsible. The technical side is done; the paperwork is not.
6. **A staging environment.** A second Render service and Supabase project on
   the same free plans, deployed from a branch, so schema changes are tried
   somewhere other than the live register.
7. **Automated deploys with a gate.** Both Render and Vercel auto-deploy on push
   to `main` by default. Running `npm test` in CI before that happens is the
   difference between a bad commit being caught and being live.
8. **Schema migrations.** `db:setup` is `CREATE TABLE IF NOT EXISTS` — it
   creates, it does not alter. The first time you need to change a column on a
   table with real rows, you will be writing SQL by hand. A migration tool
   (`node-pg-migrate`, Drizzle) is worth adopting before that day, not during.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| First page load takes ~50s | Render free instance was asleep. Expected. |
| `ENETUNREACH` in Render logs | Using Supabase's direct (IPv6) connection string — switch to the pooler. |
| `self-signed certificate` from Postgres | `PGSSLMODE=disable` set by mistake, or a provider needing a CA bundle. |
| API up, `/api/health/db` returns 503 | Wrong `DATABASE_URL`, unescaped password character, or the Supabase project is paused. |
| Browser console: blocked by CORS | `CORS_ORIGIN` on Render does not exactly match the Vercel origin — scheme and host must match, no trailing slash. |
| Login works, next request is 401 | `JWT_SECRET` changed between deploys, invalidating issued tokens. Expected after a rotation; sign in again. |
| 404 on `/admin/login` typed directly | `vercel.json` rewrite missing or overridden by a dashboard setting. |
| Server exits at boot with a `JWT_SECRET` error | Working as intended — set a real secret. |
| Reset email never arrives | Sender address not verified with Brevo, or the parish Gmail filed it as spam. Check Brevo's Logs tab — it records rejections. |
| Reset link 404s or points at localhost | `PUBLIC_APP_URL` unset or wrong on Render. |
| Settings page says the API key could not be read | `JWT_SECRET` was rotated and `CREDENTIALS_SECRET` is not set. Re-enter the key. |
| Everyone signed out at once | Expected after a password change — sessions issued before it are refused. |
