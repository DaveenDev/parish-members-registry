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

## Step 1. A fresh repository, and the parish's own accounts

- Make a **new, empty GitHub repository** for the parish (leave README,
  licence and .gitignore unticked). Don't share one repository between
  parishes: each has its own `client/.env.production`, workflows, backup
  secrets and migration history.
- **Start it with a fresh history.** A plain `git push` sends every commit of
  this repository, hundreds of them, with the first parish's name and project
  refs in them. Instead, from a clean checkout of `main`, make a branch with
  no history (it keeps all the files, staged):

  ```bash
  git checkout --orphan parish-fresh
  ```

  Do steps 2 and 3 on that branch, then make one commit and push it to the
  parish's repository as its `main`:

  ```bash
  git add -A
  git -c user.name="<Parish name>" -c user.email="<parish GitHub email>" commit -m "Initial commit"
  git remote add parish https://github.com/<owner>/<repository>.git
  git push parish parish-fresh:main
  ```

  The `-c` settings make the **parish** the commit's author, for that one
  command only. Vercel's free Hobby plan builds a private repository only
  from commits its owner wrote: it matches the commit's author email to a
  GitHub account, and a commit authored by you stops with "the commit author
  doesn't have permission to create deployments". Use an email the parish's
  GitHub account has verified, or its noreply address (GitHub → Settings →
  Emails). Don't set it with plain `git config`: that changes the author of
  every commit in the folder, `main` included. Step 5 covers later pushes.

  If the whole history went up by mistake, undo it by deleting the repository
  in GitHub (Settings → Danger Zone), recreating it empty and pushing again.
  A force-push is not enough: the old commits stay reachable by their SHA for
  a while.
- New Supabase, Vercel and Cloudflare accounts, ideally under the **parish's
  own Gmail**, with you added as a member (Vercel's Hobby plan has no members:
  sign in to it as the parish). The free Supabase plan's 2 projects
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
| Parish fiesta (optional) | [`client/src/data/liturgical-calendar.json`](../client/src/data/liturgical-calendar.json) | give the patron's day a `"patron"`: a word from the parish name, like `"Guadalupe"` on 12-12 (add the day if it isn't there). See below |
| Edge Function deploy scripts | root [`package.json`](../package.json) `deploy:production*` and `deploy:demo*` | in the copy, one set only (`deploy:functions`, `deploy:manage-staff`, `deploy:media-upload`, `deploy:notify-staff`), each with `--project-ref <the new live project>` so they can't deploy to another parish's project. See step 4 |
| Scripts of this parish's demo and tests | root [`package.json`](../package.json) `db:*` scripts | delete them: `db:mark-applied` isn't needed for a new project (`db push` records history), and `db:seed-load`, `db:clean-load` and `db:fix-load-status` name this parish's demo project |
| Tests that name the live project | [`client/test/staff-handler.test.js`](../client/test/staff-handler.test.js) | the live project ref in the two "refused on the live project" tests, to match `LIVE_PROJECT_ID` |

Then find anything left over:

```bash
git grep -n -i -E "guadalupe|olgqp|muaan|rmlkowkbonbrtaqocsvo|pub-25d83e|pub-93600e"
```

What's left in `docs/`, `project/` and `client/test/` can stay, and so can
the Guadalupe feast in `client/src/data/liturgical-calendar.json`.

The **parish fiesta** follows the name too. On the website's Church
calendar, the day whose `"patron"` word is in the name becomes the
"Fiesta sa Parokya" (a solemnity, starred); in Parish Website → Mass
Schedule the "Patronal Fiesta – St. Joseph" preset takes the name's big
line, and that day's date when the calendar has one. With no matching
day, the calendar shows no fiesta and the preset leaves the date to staff.

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

## Step 3. Clear out what the new parish doesn't need

Still on the fresh branch, before the one commit. The files stay in this
repository's `main`; the copy just doesn't need them.

Take out of git, and keep out of the parish's repository:

- Claude's own files: `.claude/`, `CLAUDE.md`, `.agents/`, `skills-lock.json`
  (`git rm -r --cached` keeps a copy on disk; add them to `.git/info/exclude`
  so they never come back).
- This parish's working papers: `Todo.txt`, `project/` (the Claude Design
  source files), `deploy/` (the guides stay here, in the original
  repository, and you follow them from here), and in `docs/` the
  presentations, the domain proposal, the first parish's deployment guide,
  `beta-testing/`, `testing.md`, `load-test-data.md`, `github-migrations.md`
  and `design-prompt-public-site.md`.
- Demo and sample data: `scripts/`, `supabase/seed/`, the root
  `.env.example` (only the seed script reads it).
- Database moves of the first parish: `supabase/export/`, and
  `supabase/.temp/` (it links the folder to that parish's Supabase project,
  so `db push` or a deploy would hit the wrong database).

Keep four files in `docs/`, because the app's messages point to them:
`backups.md`, `email-setup.md`, `media-storage.md` and `notifications.md`
(change the parish name and site address in the examples).

Then **rewrite the README** for the new parish: what the app does, how to set
it up, the deploy commands of step 4, and the licence and credit. Leave out
the first parish's website and demo links, its migration-by-migration list
(use `npx supabase db push`) and the paid-setup offer.

Run `npm test` and the leftover search of step 2 once more. Nothing should
name another parish's project.

## Step 4. Set up the services

1. [01-production.md](01-production.md), all steps. In step 9 enter the
   parish's details in Parish Config: name, logo, GKKs, ministries,
   organizations, Mass schedule, office contact. Run the migrations with
   `npx supabase link --project-ref <the new live project>` and
   `npx supabase db push`.
2. [02-demo.md](02-demo.md), if the parish wants a demo site.
3. **Deploy the three Edge Functions** to the new live project. The scripts
   of step 2 name the project, so they deploy there whichever project the CLI
   is linked to (run `npx supabase login` once first):

   | Function | Command |
   | --- | --- |
   | `manage-staff` (staff accounts) | `npm run deploy:manage-staff` |
   | `media-upload` (photos on R2) | `npm run deploy:media-upload` |
   | `notify-staff` (phone notifications) | `npm run deploy:notify-staff` |
   | all of them | `npm run deploy:functions` |

   The long form is
   `npx supabase functions deploy <name> --project-ref <ref> --use-api`;
   `notify-staff` also needs `--no-verify-jwt`, because the database calls it
   without a login. Redeploy a function whenever its code changes.
4. Fill in the "what exists" table in [README.md](README.md) for this parish,
   in **its** repository (or its own README, if you wrote one).

## Step 5. Keeping the copy up to date

The copy and this repository have unrelated histories, so Git won't merge
them. Carry new commits across with `git cherry-pick`, which applies only a
commit's own changes. Mark the last commit already copied with a tag, and work
in a separate folder so this repository's folder stays on `main`:

```bash
git tag parish-synced main
git worktree add ../registry-parish parish-fresh
```

Make the parish the author of what you commit in that folder only (see the
Hobby plan note in step 1), leaving this folder's `main` as you:

```bash
cd ../registry-parish
git config extensions.worktreeConfig true
git config --worktree user.name "<Parish name>"
git config --worktree user.email "<parish GitHub email>"
```

For each round of changes, after committing on `main`:

```bash
cd ../registry-parish
git cherry-pick parish-synced..main
git commit --amend --no-edit --reset-author
git tag -f parish-synced main
git push parish parish-fresh:main
```

- A cherry-pick keeps the original author, you, and Vercel looks at the
  newest commit of the push. The `--amend --reset-author` line makes the
  parish the author of that newest one, so the deploy isn't blocked. Skip
  it when every commit of the round was skipped: the newest commit is then
  one already pushed, and amending it would need a force-push. To deploy
  without new changes, push an empty commit instead:
  `git commit --allow-empty -m "Trigger deploy"`.

- A commit that only edits files the copy removed (the README, `docs/`,
  `deploy/`) stops with a modify/delete conflict. Drop the file with
  `git rm <path>` and `git cherry-pick --continue`, or skip the commit with
  `git cherry-pick --skip`.
- Files the copy changed for its parish (`database.js`, `vercel.json`,
  `.env.production`, `package.json`) can conflict. Keep the parish's values
  and take the rest.
- Pushing doesn't run anything on Supabase. A new migration still needs
  `npx supabase db push`, and a change under `supabase/functions/` needs the
  matching deploy command of step 4, both against the parish's project.

## Step 6. Hand over

- The parish's staff admin gets their own staff admin account (Settings →
  Staff); they make every other account.
- The backup passphrase goes to the parish, written down, kept offline.
- Show them [docs/beta-testing/](../docs/beta-testing/README.md) in this
  repository for checking a new version, and the README for the census.
