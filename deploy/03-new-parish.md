# 3. Setting the site up for another parish

The code is written for Our Lady of Guadalupe Quasi-Parish (OLGQP), Mua-an.
The parish's name comes from Parish Config, but a few addresses are built
into the code. For another parish: copy the repository, change those, then
set up the services with
[01-production.md](01-production.md) and [02-demo.md](02-demo.md).

The app is free for any parish, on one condition (see [`LICENSE`](../LICENSE)):
keep the **"Built For Free by DaveenDev"** credit and the `/developer` page it
links to. While changing the parish's details below, leave
[`client/src/components/CreditFooter.jsx`](../client/src/components/CreditFooter.jsx),
the credit in [`client/src/pages/admin/AdminLayout.jsx`](../client/src/pages/admin/AdminLayout.jsx)
and [`client/src/pages/site/Developer.jsx`](../client/src/pages/site/Developer.jsx)
as they are. Rather have it set up for you? See
[Paid setup assistance](../README.md#paid-setup-assistance).

## Step 1. A copy of the repository, and the parish's own accounts

- Make a **new GitHub repository** for the parish and push a copy of this
  code to it. Don't share one repository between parishes: each has its own
  `client/.env.production`, workflows, backup secrets and migration history.
- New Supabase, Vercel and Cloudflare accounts, ideally under the **parish's
  own Gmail**, with you added as a member. The free Supabase plan's 2 projects
  are taken by the live and demo sites of one parish, and the parish
  should own its parishioners' data.

## Step 2. Change what's built into the code

Do this in the new repository before the first deploy. Steps marked
*after 01* need values you only get while following 01.

| What | File | Change to |
|---|---|---|
| Live database (*after 01 step 2*) | [`client/src/lib/database.js`](../client/src/lib/database.js) and [`supabase/functions/manage-staff/handler.js`](../supabase/functions/manage-staff/handler.js) `LIVE_PROJECT_ID` | the new live project ref, in both. Every other project shows the demo banner, and only there may an account get Demo access |
| Live database (*after 01 step 7*) | [`client/.env.production`](../client/.env.production) | the new live `VITE_SUPABASE_URL` and anon key (keep-alive reads them) |
| Photo buckets (*after 01 step 8 / 02 step 8*) | [`client/vercel.json`](../client/vercel.json), the `/media` rules | the rules with `"has"`: keep one, with the demo site's name in `"pre"` and its testing bucket's r2.dev address (or delete them if there's no demo site); the last rule: the live bucket's r2.dev address |
| Demo site kept out of search | [`client/vercel.json`](../client/vercel.json), the `X-Robots-Tag` rules with `"has"` | keep one, with the demo site's name in `"pre"`, as above (or delete them) |
| Search engines (*after 01 step 7*) | [`client/public/robots.txt`](../client/public/robots.txt) `Sitemap:` line (sitemap.xml itself is made from the site's address) | the new live `<site>` |
| New households' town | [`client/src/constants.js`](../client/src/constants.js) `DEFAULT_ADDRESS` | the city or town, province and ZIP most families live in |
| Default website address | [`client/src/lib/census.js`](../client/src/lib/census.js) `DEFAULT_SITE_URL` | the new live `<site>` |
| Logo and icons | [`client/public/`](../client/public/): `olgqp-logo.svg`, `favicon.svg`, `icons/`, `admin.webmanifest` | the parish's logo (the uploaded logo in Parish Config replaces it on most pages) |
| Supabase CLI settings | [`supabase/config.toml`](../supabase/config.toml): the comments at the top, `site_url`, `additional_redirect_urls` | the new project ref and `<site>` |
| Starting GKKs, ministries, organizations | [`supabase/migrations/0001_init.sql`](../supabase/migrations/0001_init.sql) (the seed inserts) | the parish's lists. Or leave them, and change them in Parish Config after setup |
| Sample families | [`scripts/demo-data.mjs`](../scripts/demo-data.mjs) | optional: local names and barangays |
| Example addresses in hints | [`client/src/pages/admin/ParishConfig.jsx`](../client/src/pages/admin/ParishConfig.jsx) | the new `<site>` |
| GitHub migrations script | root [`package.json`](../package.json) `db:mark-applied` | not needed for a new project (`db push` records history); leave or delete |

Then find anything left over:

```bash
git grep -n -i -E "guadalupe|olgqp|muaan|rmlkowkbonbrtaqocsvo|pub-25d83e|pub-93600e"
```

What's left in `docs/`, `project/` and `client/test/` can stay, and so can
the Guadalupe feast in `client/src/data/liturgical-calendar.json` and
`client/src/lib/website.js` and the examples in form hints.

The parish's **name is not in the code**: the website's header, footer and
tab, the search descriptions and link previews, the registration and census
pages, the admin sign-in and every printed sheet show the name saved in
**Parish Config** (until one is saved they say "Parish Members Registry,
Census & Website"). A name ending in "Parish" or "Quasi-Parish" shows that
word on the small line under the name, and a place after a comma joins it
there: "St. Joseph Parish, Makilala" shows as "St. Joseph" over
"Parish · Makilala". The address, map link and pin on the website come
from **Parish Website → Office**; until they're saved the site shows no
address or map.

Run the tests and fix the ones that expect the old addresses:

```bash
npm test
```

## Step 3. Set up the services

1. [01-production.md](01-production.md), all steps. In step 9 enter the
   parish's details in Parish Config: name, logo, GKKs, ministries,
   organizations, Mass schedule, office contact.
2. [02-demo.md](02-demo.md), if the parish wants a demo site.
3. Fill in the "what exists" table in [README.md](README.md) for this parish,
   in **its** repository.

## Step 4. Hand over

- The parish's staff admin gets their own staff admin account (Settings →
  Staff); they make every other account.
- The backup passphrase goes to the parish, written down, kept offline.
- Show them [docs/beta-testing/](../docs/beta-testing/README.md) for checking a
  new version, and the README for the census.
