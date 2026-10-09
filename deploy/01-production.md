# 1. The live site (production)

From nothing to a working parish site. Takes an afternoon. Do the steps in
order: later ones need values from earlier ones. Keep a password manager open
and save each password and key as you create it.

You need on your computer: **Git**, **Node.js 20+**, and this repository
cloned (`npm run install:all` once). The Supabase CLI runs through `npx`, so
there's nothing else to install.

Placeholders used below:

| Placeholder | Example |
|---|---|
| `<ref>` | the Supabase project ref, e.g. `rmlkowkbonbrtaqocsvo` |
| `<site>` | the website address, e.g. `https://guadalupe-muaan.vercel.app` |
| `<db-url>` | Supabase → **Connect** → *Session pooler* connection string (port 5432) with the database password filled in |

## Step 1. Accounts

Create them with the **parish's** Gmail where you can, and add yourself as a
member. Then the parish owns its data even if you're not around.

- GitHub (holds the code). The repository can stay private.
- Supabase: supabase.com, sign in with GitHub.
- Vercel: vercel.com, sign in with GitHub, Hobby plan.
- Cloudflare: dash.cloudflare.com. R2 asks for a card even on the free plan;
  nothing is charged under 10 GB.

## Step 2. Supabase project

1. supabase.com → **New project**.
   - Name: e.g. `parish-registry`
   - Database password: generate a long one and **save it**. It can be reset
     but not recovered.
   - Region: **Southeast Asia (Singapore)**.
2. Wait for it to finish (a couple of minutes). Note the **project ref** (the
   `xxxx` in `https://xxxx.supabase.co`, also in Project Settings → General).

## Step 3. Create the database (all migrations)

From the repository folder:

```bash
npx supabase login
```

```bash
npx supabase link --project-ref <ref>
```

```bash
npx supabase db push
```

`db push` runs every file in `supabase/migrations/` in order (`0001_init.sql`
first) and records them, so the GitHub integration (step 13) knows they've
run. It asks for the database password.

- `0001_init.sql` fills in **our** parish's GKKs, ministries and
  organizations. That's fine for us; for another parish, see
  [03-new-parish.md](03-new-parish.md).
- If a migration stops with an error, the message names the file. Fix the
  cause (often an extension: Database → Extensions → turn on **pg_cron** and
  **pg_net**) and run `npx supabase db push` again; it continues from there.

Check: `npx supabase migration list` shows every number under both LOCAL and
REMOTE.

## Step 4. Edge Functions

```bash
npx supabase functions deploy --project-ref <ref> --use-api
```

For our live project (`rmlkowkbonbrtaqocsvo`) that is `npm run deploy:production`;
one function alone is `npm run deploy:production:manage-staff` (or `deploy:production:media-upload`,
`deploy:production:notify-staff`).

This deploys `manage-staff` (Settings → Staff), `media-upload` (photos) and
`notify-staff` (phone notifications), with the right JWT setting for each from
[`supabase/config.toml`](../supabase/config.toml). No secrets to set:
Supabase gives them their URL and service key itself.

Check: Supabase → **Edge Functions** lists the three. `notify-staff` shows
"Verify JWT: off"; the other two "on".

## Step 5. Auth settings

Supabase dashboard:

1. **Authentication → Sign In / Providers**: turn **off** "Allow new users to
   sign up". Staff accounts are only made by staff admins. Keep Email on.
2. **Authentication → URL Configuration**:
   - Site URL: `<site>`. If you don't know the Vercel address yet, come back
     after step 7.
   - Redirect URLs: add `<site>/**` and `http://localhost:5173/**`.

## Step 6. The first staff admin

1. **Authentication → Users → Add user → Create new user**: your email, a
   strong password, tick **Auto Confirm User**. Copy the new user's **UID**.
2. **SQL Editor**, with the UID pasted in:

   ```sql
   insert into profiles (id, name, role, is_admin, access)
   values ('<uid>', 'Your Name', 'Parish Secretary', true, 'full')
   on conflict (id) do update
     set name = excluded.name, role = excluded.role, is_admin = true, access = 'full';
   ```

   `access = 'full'` matters: since migration 0065 a new login has no access
   until someone gives it some, and you're the first.

Every other account is made in the admin panel (Settings → Staff), not here.

## Step 7. Vercel project

1. vercel.com → **Add New → Project** → import the GitHub repository.
2. **Root Directory: `client`** (Edit → choose `client`). Vercel then detects
   Vite: build `npm run build`, output `dist`. Leave those.
3. **Environment Variables**, for Production and Preview:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon / publishable key |

   Type **Config**, not Secret (they're in every visitor's page anyway).
4. **Deploy**.
5. Project → **Settings → Domains**: the free address is
   `<project-name>.vercel.app`; edit it to the name you want (e.g.
   `guadalupe-muaan`). That's `<site>`. A custom domain can be added here
   later (then see step 14, "If the site moves to its own domain").
6. Production branch (Settings → Git) is `main`: every push to `main` updates
   the live site.

Back in Supabase, put `<site>` in **Authentication → URL Configuration** if
you skipped it in step 5.

Check: open `<site>`. The home page loads with **no** purple banner, and
`<site>/admin/login` lets you sign in with the account from step 6.

Also update the repository so it knows the live project:
[`client/.env.production`](../client/.env.production) holds the live
`VITE_SUPABASE_URL` and anon key (the keep-alive workflow reads them), and
`LIVE_PROJECT_ID` in [`client/src/lib/database.js`](../client/src/lib/database.js)
is the live ref (any other project gets the training banner). For our parish
both are already right.

## Step 8. Photo storage (Cloudflare R2)

Full details and troubleshooting: [docs/media-storage.md](../docs/media-storage.md).

1. Cloudflare → **R2 Object Storage → Create bucket**, e.g. `parish-media`.
2. Bucket → **Settings → Public access → R2.dev subdomain → Allow**. Copy the
   `https://pub-….r2.dev` address.
3. Bucket → **Settings → CORS policy**:

   ```json
   [
     {
       "AllowedOrigins": ["<site>", "http://localhost:5173"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

4. R2 → **Manage API tokens → Create API token**: Object Read & Write, only
   this bucket. Save the Access Key ID and Secret Access Key (shown once) and
   the **Account ID** (R2 overview page).
5. [`client/vercel.json`](../client/vercel.json): in the **second** `/media`
   rule (the one with no `has`), put the r2.dev address from 2 before
   `/:path*`. Commit and push; the site rebuilds. (For our parish it's
   already there.)
6. Admin panel → **Parish Config → Photo storage**: Account ID, bucket name,
   Access Key ID, Secret Access Key, and Public URL **`<site>/media`**.
   **Test connection** → all three steps pass → **Save**.

Why `/media` and not the r2.dev address: some Philippine internet providers
block r2.dev; Vercel fetches the photos for the visitor instead.

## Step 9. Parish details

Admin panel → **Parish Config**:

- Parish profile: name, logo, photo, and **Public website address** = `<site>`
  (printed census sheets' QR codes point here).
- Parish GKK, ministries, organizations: check the lists.
- Office & Contact, Mass schedule and so on under Parish Website.

## Step 10. Password-reset email (parish Gmail)

Follow [docs/email-setup.md](../docs/email-setup.md): a Gmail App Password,
Supabase → Authentication → Emails → SMTP Settings (`smtp.gmail.com`, port
`465`), then Parish Config → Platform Integrations → Email → **Send test
reset email**.

## Step 11. Staff notifications

Already deployed in step 4. Each staff member turns them on per device under
Settings → Notifications. Check that the 7:00 AM summary is scheduled: SQL
Editor → `select * from cron.job;` lists `staff-morning-digest`. Details:
[docs/notifications.md](../docs/notifications.md).

## Step 12. Keep-alive and backups (GitHub Actions)

- **Keep-alive** ([`.github/workflows/keep-alive.yml`](../.github/workflows/keep-alive.yml))
  pings the live project every 3 days so it never pauses. It reads
  `client/.env.production`, so there's nothing to set. Run it once by hand:
  GitHub → **Actions → Keep Supabase awake → Run workflow**.
- **Backups**: a second, **private** R2 bucket, its own API token, a
  passphrase kept offline, and six repository secrets. Follow
  [docs/backups.md](../docs/backups.md), then **Actions → Encrypted database
  backup → Run workflow** and check the file appears in the bucket.

## Step 13. Migrations from GitHub (optional)

So new migrations run on the live database when they reach `main`:
Supabase → Project Settings → Integrations → **GitHub** → connect the
repository, Supabase directory `supabase`, production branch `main`, "Deploy
to production" **on**.

Because step 3 used `db push`, the migration history is already complete; the
one-time marking in [docs/github-migrations.md](../docs/github-migrations.md)
is only for a project whose migrations were pasted into the SQL editor.

## Step 14. Search engines (Google Search Console)

The website already tells search engines what each page is (title,
description, the parish's address and map pin on Home), keeps them out of
the admin and the census portal, and lists its main pages in
`<site>/sitemap.xml` ([`client/src/lib/seo.js`](../client/src/lib/seo.js),
[`client/public/robots.txt`](../client/public/robots.txt),
[`client/public/sitemap.xml`](../client/public/sitemap.xml)). Google finds a
new site on its own in time; Search Console (free) makes it much sooner and
shows how the site does in search.

1. Sign in at [search.google.com/search-console](https://search.google.com/search-console)
   with the parish Google account.
2. **Add property → URL prefix** → `<site>/` (with the `https://` and the
   final `/`) → **Continue**.
3. Verify with **HTML tag**: copy the `<meta name="google-site-verification" …>`
   line it gives, paste it into [`client/index.html`](../client/index.html)
   inside `<head>` (under the other `<meta>` lines), commit and push to
   `main`, wait for Vercel to deploy, then press **Verify**. Leave the tag in
   for good: removing it un-verifies the site.
4. **Sitemaps** (left menu) → enter `sitemap.xml` → **Submit**. Its status
   should become "Success" within a day.
5. Optional: **URL inspection** → paste `<site>/` → **Request indexing**, so
   Home is indexed first.

Results take a few days to a few weeks to appear. Search Console's
**Performance** page then shows what people searched for to find the parish.

Also worth doing, outside the website: claim the church on **Google Business
Profile** ([business.google.com](https://business.google.com)) with the same
address and the website `<site>`, so it shows on Google Maps with Mass times
and the link.

### If the site moves to its own domain

1. Add the domain in Vercel (step 7, Settings → Domains) and make it the
   primary one; Vercel then sends the `vercel.app` address to it.
2. Change the address in [`client/public/robots.txt`](../client/public/robots.txt)
   (the `Sitemap:` line) and in every `<loc>` of
   [`client/public/sitemap.xml`](../client/public/sitemap.xml), the share
   image in [`client/index.html`](../client/index.html) (`og:image`), and
   `DEFAULT_SITE_URL` in [`client/src/lib/census.js`](../client/src/lib/census.js).
   Commit and push.
3. Parish Config → **Public website address**: the new domain (census forms
   print it). Supabase → Authentication → URL Configuration: add it too.
4. In Search Console add the new domain as another property (steps 2–4
   above), then on the **old** property use **Settings → Change of address**
   to point it at the new one, so the old address's place in search carries
   over.

## Go-live checklist

- [ ] `<site>` loads, no purple banner; `<site>/admin/login` signs in.
- [ ] Sign-ups are off (step 5).
- [ ] Register a test household from the website, see it in the admin, then
      delete it (and empty it from the Trash).
- [ ] Photo storage **Test connection** passes, and a photo added to a Blog
      Article shows on the website.
- [ ] **Forgot password?** email arrives and its link opens "Choose a new
      password".
- [ ] A notification reaches a phone (Settings → Notifications → Send a test).
- [ ] Keep-alive and backup workflows both have a green run.
- [ ] Search Console verified and `sitemap.xml` submitted (step 14);
      `<site>/robots.txt` and `<site>/sitemap.xml` open in the browser.
- [ ] The backup passphrase is written down somewhere offline.
- [ ] The `service_role` key, database password and R2 secrets are in a
      password manager and nowhere in git or Vercel.
- [ ] [README.md](README.md) "what exists" table filled in.
