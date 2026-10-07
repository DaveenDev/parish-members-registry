# Deploying the parish registry

How to set up the parish site from nothing, on free plans, as two copies:

| | Live site (production) | Training site (staging) |
|---|---|---|
| Who uses it | The parish: families, staff, GKK leaders | You and trainees: practice, testing new versions |
| Data | The real registry | Practice data only |
| Banner | None | Purple "Training site" strip on every page |
| Guide | [01-production.md](01-production.md) | [02-staging.md](02-staging.md) |

Setting the site up for **another parish**: start with
[03-new-parish.md](03-new-parish.md). It lists what to change in the code
first, then sends you through 01 and 02.

Set up the live site first. The training site is a second copy of the same
setup with a few settings changed, and 02 only lists those changes.

## The pieces

```
Browser ──► Vercel (the website, built from client/)
   │           └─ /media/<photo> ──► Cloudflare R2 photo bucket (public r2.dev address)
   │
   └──────► Supabase (database, staff logins, Edge Functions)
                └─ sends password-reset emails through the parish Gmail

GitHub Actions ──► keeps the live Supabase project awake (every 3 days)
               └─► weekly encrypted database backup ──► Cloudflare R2 backup bucket (private)
```

| Service | What it holds | Free plan limit that matters |
|---|---|---|
| **GitHub** | The code; runs the keep-alive and backup workflows | Scheduled workflows stop after 60 days without commits (GitHub emails first) |
| **Supabase** | Database, staff logins, Edge Functions (`manage-staff`, `media-upload`, `notify-staff`), GKK documents | 2 active projects per organization; a project pauses after 7 days without activity |
| **Vercel** | The website, one project per site, both built from `client/` | Hobby plan: non-commercial use |
| **Cloudflare R2** | Website photos (public bucket) and database backups (private bucket) | 10 GB storage |
| **Gmail** (the parish's) | Sends "Forgot password?" emails through Supabase | About 500 emails a day |

One Supabase account fits exactly one live and one training project (the
2-project limit). A second parish needs its own accounts.

## Settings reference

What each site needs and where it goes. **Never** put the Supabase
`service_role` key, database password or R2 secret keys in Vercel, in
`client/`, or in git.

### Vercel → project → Settings → Environment Variables

| Name | Value | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` | Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | the anon / publishable key | Same page. Safe in the browser: the database's row level security decides what it can do |
Make both the **Config** type (plain, visible), not Secret: they're built into
the page every visitor downloads, so they aren't secret. Changing either takes
effect only after a **redeploy**.

Without `VITE_SUPABASE_*`, a build uses [`client/.env.production`](../client/.env.production),
which holds the **live** project. That's why the training site must set them.

### Which photo bucket `/media` uses: `client/vercel.json`

Not an environment variable: [`client/vercel.json`](../client/vercel.json)
picks the bucket by the site's address. The `/media` rule with
`"has": [{ "type": "host", "value": { "pre": "olgqp-training" } }]` sends
addresses starting with `olgqp-training` to the testing bucket; the next
`/media` rule sends every other address to the live bucket. Changing a bucket
means editing its `https://pub-….r2.dev` address there and pushing.

### Supabase (per project, in the dashboard)

| Where | What |
|---|---|
| Authentication → Sign In / Providers | "Allow new users to sign up" **off** |
| Authentication → URL Configuration | Site URL = the site's address; Redirect URLs = `https://<site>/**` and `http://localhost:5173/**` |
| Authentication → Emails → SMTP Settings | Parish Gmail (see [docs/email-setup.md](../docs/email-setup.md)) |
| Edge Functions | `manage-staff`, `media-upload`, `notify-staff` (deployed from this repo; no secrets needed) |

### In the admin panel (Parish Config, as a staff admin)

| Section | What |
|---|---|
| Parish profile → Public website address | The site's own address. Printed census QR codes point here |
| Photo storage (Cloudflare R2) | Account ID, bucket, Access Key ID, Secret Access Key, Public URL = `https://<site>/media` |
| Platform Integrations → Email | Parish Gmail address and sender name |

### GitHub → repository → Settings → Secrets and variables → Actions

For the live site's weekly backup only ([docs/backups.md](../docs/backups.md)):
`SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BACKUP_BUCKET`.

### Your computer (gitignored files)

| File | Holds | Used by |
|---|---|---|
| `client/.env.local` | `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` of the **training** project | `npm run dev` |
| `.env` (repo root) | `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` of the **training** project | `npm run db:demo`, `db:reset`, `db:wipe-test` |

Point both at the training project, so local work never touches real data.

## Our parish (OLGQP): what exists

Addresses and project IDs only. Passwords and keys belong in a password
manager, not here. Fill in the blanks the next time you're in each dashboard.

| | Live | Training |
|---|---|---|
| Website | https://guadalupe-muaan.vercel.app | https://olgqp-training.vercel.app |
| Vercel project / account | guadalupe-muaan, parish Hobby account | olgqp-training, account: ____ |
| Supabase project ref | `rmlkowkbonbrtaqocsvo` | `____` |
| Supabase account | ____ | ____ |
| R2 photo bucket | `pub-25d83e20c5f14fc0b2f81d3476651579.r2.dev` (account ____) | testing bucket on a separate Cloudflare account: `pub-93600e56fb724c9c8fdf449acb86fcf7.r2.dev` |
| R2 backup bucket | ____ (e.g. `parish-backups`) | none |
| Sends email from | ____@gmail.com | ____ |

## When something goes wrong

| Symptom | Look at |
|---|---|
| Training site shows **no** purple banner | It's connected to the live database. Fix its `VITE_SUPABASE_*` in Vercel and redeploy now |
| Photos broken / "Public URL didn't find the test file" | The `/media` rule for that site's address in `client/vercel.json` ([docs/media-storage.md](../docs/media-storage.md)) |
| Vercel build: "`vercel.ts` schema validation failed" | There must be no `client/vercel.ts`; `client/vercel.json` is the config |
| Photo upload fails in the browser | The bucket's CORS policy must list the site's address |
| Reset email link opens the home page | Supabase → Authentication → URL Configuration |
| "Only parish staff…" / a new login sees nothing | New logins have no access until a staff admin sets it in Settings → Staff |
| Site is down, Supabase says "paused" | Supabase dashboard → the project → Restore. Check the keep-alive workflow |
| A backup run failed | [docs/backups.md](../docs/backups.md) → "If a backup run fails" |
