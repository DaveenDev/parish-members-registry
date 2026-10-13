# 2. The demo site (staging)

A second, complete copy of the site with its own database and photo bucket:
for other parishes to try the app, for training staff and GKK leaders, and
for trying a new version before the parish sees it. Nothing done there
touches the live registry.

It's the same setup as [01-production.md](01-production.md), with different
values. This page lists only the differences; do the steps of 01 in order and
apply these as you go.

> **The one mistake to avoid:** a demo site built without its own
> `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in Vercel connects to the
> **live** database (it falls back to `client/.env.production`). Trainees
> would then be changing real parish records. The purple banner is the check:
> no banner on the demo site means stop and fix it.

Placeholders: `<demo-ref>` (the demo Supabase project ref),
`<demo-site>` (e.g. `https://parish-registry-demo.vercel.app`),
`<demo-db-url>` (its Session pooler connection string with password).

## Step 1. Accounts

The demo site can use the same GitHub repository. For the rest:

- **Supabase**: a second project. The free plan allows 2 per organization,
  so the live and demo projects fill it.
- **Vercel**: a second project in any Hobby account.
- **Cloudflare**: a separate bucket. A separate Cloudflare account (as ours
  has) keeps demo keys away from live photos.

## Step 2. Supabase project

As 01 step 2, named e.g. `parish-registry-demo`, Singapore region.

## Step 3. Database

Don't `supabase link` to the demo project: the folder stays linked to
the live one, and switching back and forth is how migrations end up on the
wrong database. Use the connection string instead:

```bash
npx supabase db push --db-url "<demo-db-url>"
```

Check: `npx supabase migration list --db-url "<demo-db-url>"`.

## Step 4. Edge Functions

```bash
npx supabase functions deploy --project-ref <demo-ref> --use-api
```

For our demo project (`qyoyuukpdjrwfhovtrwd`) that is `npm run deploy:demo`;
one function alone is `npm run deploy:demo:manage-staff` (or
`:media-upload`, `:notify-staff`).

These use the Supabase account the CLI is logged in to (`npx supabase login`).
If that account can't see the demo project (`npx supabase projects list`
doesn't show it), the deploy fails with `unexpected deploy status 403 ... does
not have the necessary privileges`. Either invite that account to the demo
project's organization (Organization settings → Team, role Developer or
higher), or deploy once with the demo account's access token (Account →
Access Tokens) in PowerShell:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "<demo-account-token>"; npm run deploy:demo:manage-staff; Remove-Item Env:SUPABASE_ACCESS_TOKEN
```

## Step 5. Auth settings

As 01 step 5, with the demo address:

- Sign-ups **off**.
- Site URL `<demo-site>`; Redirect URLs `<demo-site>/**` and
  `http://localhost:5173/**`.

## Step 6. Staff accounts

The first staff admin as in 01 step 6 (in the **demo** project's SQL
editor). Then make the trainees' accounts in the demo admin panel →
Settings → Staff, e.g. a GKK leader account per GKK for census training.
Use different passwords from the live site.

## Step 7. Vercel project

A **second** Vercel project from the same repository:

1. **Add New → Project** → same repository → Root Directory **`client`**.
2. Environment Variables, for **Production and Preview**, type Config:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://<demo-ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | the **demo** project's anon key |

3. Deploy. Settings → Domains: rename to e.g. `parish-registry-demo`. The
   name matters: `client/vercel.json` sends `/media` to the testing bucket
   for addresses starting with `parish-registry-demo` (step 8), and tells
   search engines not to list any of its pages (`X-Robots-Tag: noindex`), so
   the sample data never shows up on Google next to the parish's real site.
4. Production branch `main`, like the live site: every push to `main`
   updates both sites at once. (To try code on the demo site before the
   live one, use a `staging` branch here instead and merge it into `main`
   when it's good.)

**Check now:** open `<demo-site>`. The purple **"Demo site: sample data
only"** strip must be at the top of every page. No strip means it's
talking to the live database: fix the two `VITE_SUPABASE_*` values and
redeploy before anyone signs in.

### The "Try the demo" login (for other parishes)

A **Try the demo** button on `<demo-site>/admin/login` signs visitors in
with one shared account (0101_demo_access.sql):

1. Demo admin panel → Settings → Staff → **Add staff**: a name like
   "Demo", an email nobody uses (e.g. `demo@parish-registry-demo.test`),
   access **Demo**. The password shown at the end is the shared one: copy
   it. (Demo access is offered only on the demo site; the live site
   refuses it.)
2. Vercel → the demo project → Settings → Environment Variables, for
   Production and Preview:

   | Name | Value |
   |---|---|
   | `VITE_DEMO_EMAIL` | the demo account's email |
   | `VITE_DEMO_PASSWORD` | the password from step 1 |

3. Redeploy (Deployments → ⋯ → Redeploy). The button shows only when both
   are set, and never on the live site.

The demo account works as Full access, but it is never a staff admin (no
Settings → Staff, no Platform Integrations with the storage keys) and
sends no phone notifications. Anyone can read the password from the page,
so keep it to this account. The account can't change its own password or
email, not even through Supabase's API: the database refuses it. Only a
staff admin's **Reset password** under Settings → Staff changes the
password (the Supabase dashboard's is refused too); then put the new one
in `VITE_DEMO_PASSWORD` and redeploy.

## Step 8. Photo storage

As 01 step 8, in the testing bucket:

- R2.dev subdomain **allowed**; copy its `https://pub-….r2.dev` address.
- CORS `AllowedOrigins`: `<demo-site>` and `http://localhost:5173`.
- An API token for **this** bucket only.
- [`client/vercel.json`](../client/vercel.json): the `/media` rules with
  `"has"` … `"pre": "parish-registry-demo"` (and `"olgqp-training"`, the
  demo site's old name) point at this bucket's r2.dev address. If the demo
  site has another name, change `"pre"` to the start of that name. Commit
  and push.
- Demo admin → Parish Config → Photo storage: the testing account's
  Account ID, bucket and keys; Public URL **`<demo-site>/media`** → Test
  connection → Save.

If Test connection says *"The Public URL didn't find the test file (HTTP
404)"*: the first `/media` rule in `client/vercel.json` has the wrong r2.dev
address, or its `"pre"` doesn't match the start of the demo site's
address, so `/media` still shows the live bucket.

## Step 9. Parish details

Parish Config → Parish profile → **Public website address = `<demo-site>`**.
Otherwise census sheets printed during training carry QR codes that send
families to the live site.

The rest (logo, GKKs) can match the live site so training looks real.

## Step 10. Password-reset email (optional)

Only if you want to practise "Forgot password?". The same parish Gmail and App
Password can be used in the demo project's SMTP settings; the demo
project's own URL Configuration (step 5) makes the link come back to the
demo site.

## Steps 11–14

- Notifications: work the same once step 4 is done.
- **Keep-alive: not set up for the demo project.** It pauses after 7 days
  without use. Before a training session, open Supabase → the demo project
  and press **Restore** if it's paused (takes a few minutes). Or ask for the
  keep-alive workflow to ping it too.
- Backups: none. It holds practice data.
- GitHub integration: leave it off for the demo project; migrations go
  there by hand (below).
- Search engines: **skip step 14.** Don't add the demo site to Search
  Console; it's kept out of search on purpose (step 7).

## Practice data

> `npm run db:seed-load` / `db:clean-load` run on our demo project
> (`qyoyuukpdjrwfhovtrwd`), named in `package.json`, even though the folder
> stays linked to the live one (step 3). For another demo project, use
> its SQL Editor as below.

### A full parish's worth (recommended for training)

[`supabase/seed/load-test.sql`](../supabase/seed/load-test.sql): the
parish's 16 GKKs (added if missing), then 500 households and 2,000 members
spread evenly over them, with sacraments, requests, blood donors and website
posts. Every record is marked (old reference number `SEED-…`, **[Test]**
titles) and can be removed in one step; the GKKs stay. Details:
[docs/load-test-data.md](../docs/load-test-data.md).

The 4 starter GKKs from `0001_init.sql` (GKK San Lorenzo Ruiz, San Pedro
Calungsod, San Isidro, Sto. Niño, with no barangay) get no households. Delete
them in the demo admin (Parish Config → Parish GKK) if you don't want them
in the lists.

1. Demo admin: if trainees will practise the census, **start a census
   first** (Census → Start a census). The seed then also adds census answers
   and online updates waiting for review. Without an open census it skips
   those.
2. Supabase dashboard → the **demo** project (check its name at the top
   of the page) → **SQL Editor** → New query.
3. Paste the whole of `supabase/seed/load-test.sql` → **Run**. It takes
   about 20 seconds and lists what it added. It's all or nothing, and
   refuses to run a second time. If it stops with "already in the database"
   (or a run before October 2026 stopped halfway), run the cleanup below
   first, then the seed again.

   The SQL Editor runs each statement as its own transaction and ignores
   `begin; … commit;`, so a script for it that must be all or nothing has to
   be a single `do $$ … $$;` statement, as these are.

To remove it (e.g. before a fresh training round): the same, with
[`supabase/seed/load-test-clean.sql`](../supabase/seed/load-test-clean.sql).
It removes only the marked records. Then the seed can be run again.

From the command line instead (needs the demo database password):

```bash
npx supabase db query --db-url "<demo-db-url>" -f supabase/seed/load-test.sql
```

### A first census with last year's list (after the load test)

[`supabase/seed/first-census-san-roque.sql`](../supabase/seed/first-census-san-roque.sql)
turns GKK Sr. San Roque -Meohao into a GKK's first census in the registry:
last year's paper list of 30 heads, 12 of them registered on the website
since the census opened (7 waiting to be verified, 5 verified), 2 new
families not on the list, and 18 names still to visit. It also includes a
wife who registered in her husband's place ("Choose household") and a name
registered in another GKK. Needs an open census and the load-test data.
It deletes the GKK's other load-test households. Run it the same way as the
load test, or with the Supabase CLI logged in to an account that can see
the demo project:

```bash
npx supabase db query --linked --project-ref qyoyuukpdjrwfhovtrwd -f supabase/seed/first-census-san-roque.sql
```

### Six sample households (quick check)

Root `.env` (gitignored, see [`.env.example`](../.env.example)) with the
**demo** project's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
(Project Settings → API), then:

```bash
npm run db:demo
```

`npm run db:reset` deletes **every** household in that project again, seeded
or not, so check `.env` points at the demo project first.

### Not seeded

Staff and trainee logins (make them in Settings → Staff), parish settings,
photo storage and email settings. The seed uses the ministry and
organization lists already in Parish Config.

### Local development

Point `client/.env.local` at the demo project too, so `npm run dev` works
on practice data and never on the live registry.

## Releasing a change: demo site first, then live

1. **New migration?** Run it on the demo database first:

   ```bash
   npx supabase db push --db-url "<demo-db-url>"
   ```

2. Try the change against demo data: `npm run dev` (with
   `client/.env.local` on the demo project), or the demo Vercel
   project's preview of the branch.
3. Push / merge to `main`. Both sites rebuild; with the GitHub integration
   on, the migration runs on the live database. Without it:
   `npx supabase db push` (the folder is linked to the live project).
4. **Changed an Edge Function?** Deploy it to both:

   ```bash
   npx supabase functions deploy --project-ref <demo-ref> --use-api
   ```

   (our demo project: `npm run deploy:demo`)

   ```bash
   npx supabase functions deploy --project-ref <ref> --use-api
   ```

   (our live project: `npm run deploy:production`)

## Checklist

- [ ] Purple banner on every page of `<demo-site>`.
- [ ] Demo admin signs in; the live site's staff passwords don't work
      there (separate logins).
- [ ] Photo storage Test connection passes with `<demo-site>/media`.
- [ ] **Try the demo** on `<demo-site>/admin/login` signs in; its Personal
      Settings has no Change password, and Settings has no Staff tab.
- [ ] Parish Config → Public website address = `<demo-site>`.
- [ ] A test registration on the demo site does **not** appear in the
      live admin.
- [ ] Kept out of search: browser DevTools → Network → reload
      `<demo-site>` → the page's response headers include
      `x-robots-tag: noindex, nofollow`.
- [ ] [README.md](README.md) "what exists" table filled in.

## Renaming the demo site (olgqp-training → parish-registry-demo)

Ours was called the training site, at `olgqp-training.vercel.app`.
`client/vercel.json` already has its rules for both names, so photos and
"keep out of search" work before and after the rename. Everything below
holds the site's address, so it needs the new one:

1. Vercel → the demo project → Settings: rename the project to
   `parish-registry-demo`, and in Domains add
   `parish-registry-demo.vercel.app`. **Keep `olgqp-training.vercel.app`
   too** (it costs nothing): every photo uploaded so far is saved in the
   database with its full address, `https://olgqp-training.vercel.app/media/…`,
   and stops showing if that address goes.
2. Supabase → the demo project → Authentication → URL Configuration: Site
   URL `https://parish-registry-demo.vercel.app`; Redirect URLs
   `https://parish-registry-demo.vercel.app/**` (keep
   `http://localhost:5173/**`). Otherwise password-reset links go to the old
   address. (Renaming the Supabase project itself, under Project Settings, is
   only a label: its ref `qyoyuukpdjrwfhovtrwd` stays.)
3. Cloudflare → the testing bucket → Settings → CORS policy: add
   `https://parish-registry-demo.vercel.app` to `AllowedOrigins`, or photo
   uploads fail in the browser.
4. Demo admin → Parish Config → Photo storage: Public URL
   `https://parish-registry-demo.vercel.app/media` → Test connection → Save.
   New photos get the new address; the old ones keep theirs (step 1).
5. Demo admin → Parish Config → Parish profile → Public website address:
   the new address (census QR codes and share links use it).
6. Keep the two `"pre": "olgqp-training"` rules in `client/vercel.json` for
   as long as old photos use that address. They can go after a
   `db:clean-load` and a fresh seed, or once those photos are re-uploaded.
