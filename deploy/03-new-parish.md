# 3. Setting the site up for another parish

The code is written for Our Lady of Guadalupe Quasi-Parish (OLGQP), Mua-an.
A few addresses and names are built into it. For another parish: copy the
repository, change those, then set up the services with
[01-production.md](01-production.md) and [02-staging.md](02-staging.md).

## Step 1. A copy of the repository, and the parish's own accounts

- Make a **new GitHub repository** for the parish and push a copy of this
  code to it. Don't share one repository between parishes: each has its own
  `client/.env.production`, workflows, backup secrets and migration history.
- New Supabase, Vercel and Cloudflare accounts, ideally under the **parish's
  own Gmail**, with you added as a member. The free Supabase plan's 2 projects
  are taken by the live and training sites of one parish, and the parish
  should own its parishioners' data.

## Step 2. Change what's built into the code

Do this in the new repository before the first deploy. Steps marked
*after 01* need values you only get while following 01.

| What | File | Change to |
|---|---|---|
| Live database (*after 01 step 2*) | [`client/src/lib/database.js`](../client/src/lib/database.js) `LIVE_PROJECT_ID` | the new live project ref. Every other project shows the training banner |
| Live database (*after 01 step 7*) | [`client/.env.production`](../client/.env.production) | the new live `VITE_SUPABASE_URL` and anon key (keep-alive reads them) |
| Live photo bucket (*after 01 step 8*) | [`client/vercel.ts`](../client/vercel.ts) `LIVE_MEDIA_ORIGIN` | the new live bucket's r2.dev address (used when `MEDIA_ORIGIN` isn't set) |
| Default website address | [`client/src/lib/census.js`](../client/src/lib/census.js) `DEFAULT_SITE_URL` | the new live `<site>` |
| Page title, description, share image | [`client/index.html`](../client/index.html) | the parish's name and `<site>/icons/icon-512.png` |
| Logo and icons | [`client/public/`](../client/public/): `olgqp-logo.svg`, `favicon.svg`, `icons/`, `admin.webmanifest` | the parish's logo (the uploaded logo in Parish Config replaces it on most pages) |
| Supabase CLI settings | [`supabase/config.toml`](../supabase/config.toml): the comments at the top, `site_url`, `additional_redirect_urls` | the new project ref and `<site>` |
| Starting GKKs, ministries, organizations | [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) (the seed inserts) | the parish's lists. Or leave them, and change them in Parish Config after setup |
| Sample families | [`scripts/demo-data.mjs`](../scripts/demo-data.mjs) | optional: local names and barangays |
| Example addresses in hints | [`client/src/pages/admin/ParishConfig.jsx`](../client/src/pages/admin/ParishConfig.jsx) | the new `<site>` |
| GitHub migrations script | root [`package.json`](../package.json) `db:mark-applied` | not needed for a new project (`db push` records history); leave or delete |

Then find anything left over:

```bash
git grep -n -i -E "guadalupe|olgqp|muaan|rmlkowkbonbrtaqocsvo|pub-25d83e"
```

What's left in `docs/`, `project/` and `client/test/` can stay. Text
inside the pages (e.g. "Our Lady of Guadalupe" in printed sheets, the
registration and census pages) mostly comes from Parish Config, but check
what the grep finds under `client/src/`.

Run the tests and fix the ones that expect the old addresses:

```bash
npm test
```

## Step 3. Set up the services

1. [01-production.md](01-production.md), all steps. In step 9 enter the
   parish's details in Parish Config: name, logo, GKKs, ministries,
   organizations, Mass schedule, office contact.
2. [02-staging.md](02-staging.md), if the parish wants a training site.
3. Fill in the "what exists" table in [README.md](README.md) for this parish,
   in **its** repository.

## Step 4. Hand over

- The parish's staff admin gets their own staff admin account (Settings →
  Staff); they make every other account.
- The backup passphrase goes to the parish, written down, kept offline.
- Show them [docs/beta-testing/](../docs/beta-testing/README.md) for checking a
  new version, and the README for the census.
