# 2. The training site (staging)

A second, complete copy of the site with its own database and photo bucket,
for training staff and GKK leaders and for trying a new version before the
parish sees it. Nothing done there touches the live registry.

It's the same setup as [01-production.md](01-production.md), with different
values. This page lists only the differences; do the steps of 01 in order and
apply these as you go.

> **The one mistake to avoid:** a training site built without its own
> `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in Vercel connects to the
> **live** database (it falls back to `client/.env.production`). Trainees
> would then be changing real parish records. The purple banner is the check:
> no banner on the training site means stop and fix it.

Placeholders: `<staging-ref>` (the training Supabase project ref),
`<staging-site>` (e.g. `https://olgqp-training.vercel.app`),
`<staging-db-url>` (its Session pooler connection string with password).

## Step 1. Accounts

The training site can use the same GitHub repository. For the rest:

- **Supabase**: a second project. The free plan allows 2 per organization,
  so the live and training projects fill it.
- **Vercel**: a second project in any Hobby account.
- **Cloudflare**: a separate bucket. A separate Cloudflare account (as ours
  has) keeps training keys away from live photos.

## Step 2. Supabase project

As 01 step 2, named e.g. `parish-registry-training`, Singapore region.

## Step 3. Database

Don't `supabase link` to the training project: the folder stays linked to
the live one, and switching back and forth is how migrations end up on the
wrong database. Use the connection string instead:

```bash
npx supabase db push --db-url "<staging-db-url>"
```

Check: `npx supabase migration list --db-url "<staging-db-url>"`.

## Step 4. Edge Functions

```bash
npx supabase functions deploy --project-ref <staging-ref> --use-api
```

## Step 5. Auth settings

As 01 step 5, with the training address:

- Sign-ups **off**.
- Site URL `<staging-site>`; Redirect URLs `<staging-site>/**` and
  `http://localhost:5173/**`.

## Step 6. Staff accounts

The first staff admin as in 01 step 6 (in the **training** project's SQL
editor). Then make the trainees' accounts in the training admin panel →
Settings → Staff, e.g. a GKK leader account per GKK for census training.
Use different passwords from the live site.

## Step 7. Vercel project

A **second** Vercel project from the same repository:

1. **Add New → Project** → same repository → Root Directory **`client`**.
2. Environment Variables, for **Production and Preview**, type Config:

   | Name | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | `https://<staging-ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | the **training** project's anon key |

3. Deploy. Settings → Domains: rename to e.g. `olgqp-training`. The name
   matters: `client/vercel.json` sends `/media` to the testing bucket for
   addresses starting with `olgqp-training` (step 8).
4. Production branch `main`, like the live site: every push to `main`
   updates both sites at once. (To try code on the training site before the
   live one, use a `staging` branch here instead and merge it into `main`
   when it's good.)

**Check now:** open `<staging-site>`. The purple **"Training site: practice
data only"** strip must be at the top of every page. No strip means it's
talking to the live database: fix the two `VITE_SUPABASE_*` values and
redeploy before anyone signs in.

## Step 8. Photo storage

As 01 step 8, in the testing bucket:

- R2.dev subdomain **allowed**; copy its `https://pub-….r2.dev` address.
- CORS `AllowedOrigins`: `<staging-site>` and `http://localhost:5173`.
- An API token for **this** bucket only.
- [`client/vercel.json`](../client/vercel.json): the **first** `/media` rule
  (the one with `"has"` … `"pre": "olgqp-training"`) points at this bucket's
  r2.dev address. If the training site has another name, change `"pre"` to
  the start of that name. Commit and push.
- Training admin → Parish Config → Photo storage: the testing account's
  Account ID, bucket and keys; Public URL **`<staging-site>/media`** → Test
  connection → Save.

If Test connection says *"The Public URL didn't find the test file (HTTP
404)"*: the first `/media` rule in `client/vercel.json` has the wrong r2.dev
address, or its `"pre"` doesn't match the start of the training site's
address, so `/media` still shows the live bucket.

## Step 9. Parish details

Parish Config → Parish profile → **Public website address = `<staging-site>`**.
Otherwise census sheets printed during training carry QR codes that send
families to the live site.

The rest (logo, GKKs) can match the live site so training looks real.

## Step 10. Password-reset email (optional)

Only if you want to practise "Forgot password?". The same parish Gmail and App
Password can be used in the training project's SMTP settings; the training
project's own URL Configuration (step 5) makes the link come back to the
training site.

## Steps 11–13

- Notifications: work the same once step 4 is done.
- **Keep-alive: not set up for the training project.** It pauses after 7 days
  without use. Before a training session, open Supabase → the training project
  and press **Restore** if it's paused (takes a few minutes). Or ask for the
  keep-alive workflow to ping it too.
- Backups: none. It holds practice data.
- GitHub integration: leave it off for the training project; migrations go
  there by hand (below).

## Practice data

Root `.env` (gitignored, see [`.env.example`](../.env.example)) with the
**training** project's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
(Project Settings → API), then:

```bash
npm run db:demo
```

Six sample households. `npm run db:reset` deletes every household again. For
a full parish's worth, see [docs/load-test-data.md](../docs/load-test-data.md).
Point `client/.env.local` at the training project too, so `npm run dev` works
on practice data.

## Releasing a change: training first, then live

1. **New migration?** Run it on the training database first:

   ```bash
   npx supabase db push --db-url "<staging-db-url>"
   ```

2. Try the change against training data: `npm run dev` (with
   `client/.env.local` on the training project), or the training Vercel
   project's preview of the branch.
3. Push / merge to `main`. Both sites rebuild; with the GitHub integration
   on, the migration runs on the live database. Without it:
   `npx supabase db push` (the folder is linked to the live project).
4. **Changed an Edge Function?** Deploy it to both:

   ```bash
   npx supabase functions deploy --project-ref <staging-ref> --use-api
   ```

   ```bash
   npx supabase functions deploy --project-ref <ref> --use-api
   ```

## Checklist

- [ ] Purple banner on every page of `<staging-site>`.
- [ ] Training admin signs in; the live site's staff passwords don't work
      there (separate logins).
- [ ] Photo storage Test connection passes with `<staging-site>/media`.
- [ ] Parish Config → Public website address = `<staging-site>`.
- [ ] A test registration on the training site does **not** appear in the
      live admin.
- [ ] [README.md](README.md) "what exists" table filled in.
