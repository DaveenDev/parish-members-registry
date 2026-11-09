# PRO 08: Release tracks — how Free and PRO parishes get updates

> **Status:** proposed 2026-11-05, not started.
> **Needs:** [00-pro-foundation.md](00-pro-foundation.md). Build the release
> command (below) together with the foundation, before the first PRO parish.
> Tracking file: `docs/parish-tracker.xlsx` (gitignored).

## Context

Today every parish has its own GitHub repository, Vercel project, Supabase
project and Cloudflare R2 bucket, and you update them all from your computer
(`deploy/04-releases.md`): `npm run release:db`, `npm run release:functions`,
then a cherry-pick into each parish's copy (`deploy/03-new-parish.md` step 5).
Pushing the free `main` also rebuilds Mua-an's live site and the demo site
directly.

With PRO, parishes get different code and different update speeds, and every
managed parish costs you about 20–30 minutes per release. This plan sets out
who gets what, and how.

## The two repositories

```
 Free repo (public, MIT)                     PRO repo (private)
 DaveenDev/parish-members-registry           DaveenDev/parish-registry-pro
 ├─ client/               the free app ─pull─▶├─ every free file (never edited here)
 ├─ client/src/pro/       empty slot          ├─ client/src/pro/<module>/  PRO pages
 ├─ supabase/migrations/  0001 to 0118…       ├─ client/src/pro/core/      shared PRO code
 ├─ supabase/functions/   the 3 free ones     ├─ pro/supabase/migrations/  P0001, P0002…
 ├─ scripts/              release tools       ├─ pro/supabase/functions/   send-sms…
 └─ README, docs/, releases/                  ├─ pro/scripts/              release-parish, release-pro, pro-sync
                                              ├─ pro/hub/                  your SMS relay
                                              └─ parishes.json             (gitignored, the only copy)
```

- **The free repo stays public.** Making it private wouldn't take back what's
  already MIT; it would break the releases page (GitHub Pages on a private
  repo needs a paid plan), hide your portfolio and break the README's
  promise. Self-hosting parishes cost you nothing.
- **The PRO repo pulls from the free one and can never push to it**
  (`git remote set-url --push upstream DISABLED`, foundation §1).
- **Every parish copy you manage is private**, free ones included.
- `client/src/pro/` works like a plugins folder: empty in the free app; a PRO
  parish's copy gets only the module folders it paid for, and the app picks
  them up by itself.

## The tracks

| Track | Who | How updates reach them | Price |
|---|---|---|---|
| **Free self-managed** | Copied the public repo themselves | The releases page / GitHub Watch → Releases; they follow `03-new-parish.md` step 5. You never touch them. | ₱0 |
| **Free managed** | Paid the ₱5,000 setup | You push free updates in a **batch every 3 months**; urgent and security fixes anytime | Setup includes 1 year; then ₱3,000/year, or a handover |
| **PRO** | Bought the license | You push **every release**, a day or two after Mua-an, plus its modules | License includes 1 year; then ₱6,000/year |
| **Frozen** | A PRO or managed parish whose renewal lapsed | Nothing until it renews; then one release catches it up | — |
| **Demo** | Your demo sites | First, every release | — |

The track is recorded in `parishes.json` and in the tracker.

### Lapsed renewals

- **PRO lapses → Frozen, whole parish.** Free and PRO parts stay where they
  are, everything keeps working, nothing is removed. Don't update the free
  part alone under old PRO code: that's the mix most likely to break.
  Renewing catches everything up in one release (the scripts run whatever a
  database missed).
- **Free managed lapses → handover or Frozen.** Handover: take it out of
  `parishes.json`, send them the self-update guide, and ask them to change
  their database password and delete your access token. It becomes Free
  self-managed.
- A security fix to a frozen parish is your call (`--force`).

## How updates flow

```
                         Free repo (public)
                          │                │
          releases page   │                │  git pull upstream main
                          ▼                ▼
   Self-managed parishes             Your computer
   (update themselves)               PRO repo folder + parishes.json
                                           │
                                           │  release-parish <name | pro | free>
                            ┌──────────────┴───────────────┐
                            ▼                              ▼
                 Free parish (managed)               PRO parish
                 every 3 months                      every release
                 GitHub copy: free code              GitHub copy: free code + its modules
                 Supabase: free tables, functions    Supabase: free + PRO tables, functions
                 Vercel: rebuilds on push            Vercel: rebuilds on push
                 Cloudflare R2: no change            Cloudflare R2: no change
```

## Decisions

### 1. Mua-an gets its own copy, like SJMV

Today pushing the free `main` rebuilds Mua-an's live site. A PRO parish's
site has to build from code with its modules, which can't be in the public
repo. So Mua-an moves to its own private repository (`03-new-parish.md`
step 1, fresh history, its own Vercel project or the existing one re-pointed),
before it gets PRO. After that, pushing the free `main` rebuilds only the
free demo site.

### 2. You release from the PRO repo folder

It has every free file plus `pro/`. Move `parishes.json` there and keep only
that one copy (it's gitignored in both repos). The free repo folder is only
for building free features.

### 3. `parishes.json` records the track

```json
{
  "name": "sjmv",
  "label": "SJMV Parish",
  "projectRef": "…",
  "dbUrl": "…",
  "track": "free-managed",
  "updatesUntil": "2027-03-01",
  "worktree": "../registry-sjmv",
  "pro": null
}
```

A PRO parish has `"track": "pro"` and the `pro` block from foundation §6
(`modules`, `licensedOn`). Allowed tracks: `demo`,
`free-managed`, `pro`, `frozen`. Self-managed parishes aren't in the file.

### 4. One command: `release-parish.mjs`

`node pro/scripts/release-parish.mjs <name | demo | pro | free | status>`, in
the private repo, calling the free scripts that already exist:

1. Refuses unless the folder is on `main` with nothing uncommitted (as
   `release-db.mjs` does), and refuses a parish whose `updatesUntil` has
   passed or whose track is `frozen`, unless `--force`.
2. **Backup:** starts the parish's backup workflow
   (`gh workflow run backup.yml -R <owner/repo>`) and waits for it
   (`gh run watch`), or asks "did the backup run?" if `gh` can't reach it.
3. Free migrations (`release-db.mjs <name>`), then, for PRO, PRO migrations
   (`release-pro.mjs`, foundation §3).
4. Free functions (`release-functions.mjs <name>`), then PRO functions.
5. Website: in the parish's worktree, cherry-pick the free commits since its
   tag, reset the author to the parish (the Vercel Hobby rule), run
   `pro-sync.mjs` for a PRO parish, move the tag, push. Vercel rebuilds.
6. Writes a line you copy into the tracker's **Releases** tab (date, parish,
   free version, last migration, PRO version, functions, backup, pushed).

Same safety as today: it shows what will run, waits for you to type the
parish's name, and stops at the first problem; the parishes after it aren't
touched. `status` lists every parish with its track, versions, last backup
and `updatesUntil`.

### 5. The version shows in the app

The admin footer (and Settings → About) shows `v1.2.0` for a free parish and
`v1.2.0 · PRO 1.0.0` for a PRO one, read from the build. When a secretary
calls, the first question is answered on screen.

### 6. Release notes in two places

- Free notes: the public releases page, as now (`releases/notes/`).
- PRO notes: `pro/releases/notes/`, built only into PRO copies as a
  **What's new** panel in the admin after an update. Never on the public page.

### 7. Nothing changes for Vercel and Cloudflare

Vercel rebuilds when the parish's GitHub copy changes. R2 holds photos, and
its settings live in Parish Config. You log into those accounts only for a
**major** version (a new secret, a new setting), as the release rules
already say.

## The release order

1. **Free:** commit on the free `main`. Free demo: database, then functions.
   Push `main`: the free demo rebuilds and the releases page goes out
   (self-managed parishes hear about it).
2. **PRO repo:** `git pull upstream main`, add any PRO changes, commit.
   PRO demo: `release-parish demo`, then check it.
3. **Mua-an** (the pilot): `release-parish muaan`.
4. **Other PRO parishes**, a day or two later: `release-parish pro`.
5. **Free managed parishes**, at the 3-month batch: `release-parish free`.
   Write the date in the tracker (Summary → Last free-managed batch).

## Upgrading a parish from Free to PRO

Same GitHub copy, same Supabase, Vercel and Cloudflare accounts, same data.
Nothing is set up again.

1. Agreement signed (in the parish's name) and paid.
2. Make its GitHub copy private, before any PRO code goes in.
3. `parishes.json`: `"track": "pro"`, its modules, `licensedOn`,
   `updatesUntil`.
4. `release-parish <name>`: backup, catches up the free part (up to 3 months
   of missed migrations), adds the PRO core and its modules' migrations
   (new tables only; no household, member or census record is touched),
   PRO functions, syncs its module folders, pushes.
5. With the parish: module settings (certificate templates, intentions,
   staff access in Settings → PRO), SMS hub token and first credits if they
   bought SMS, a short walkthrough.

From then on it's a PRO parish: every release, a day or two after Mua-an.
The tracker's **PRO upgrade checklist** tab has these steps.

## Security and housekeeping

- **`parishes.json` holds every managed parish's database password and deploy
  token** on one laptop. Turn on drive encryption: BitLocker (Windows Pro)
  or Device encryption (Windows Home).
- **The setup and PRO agreements say the parish can withdraw your access
  anytime** (change the database password, delete your token), and you do it
  yourself when a parish leaves.
- **Removing old database columns or functions now waits longer.** With
  3-month batches, frozen and self-managed parishes, a removal waits until a
  **major** version, announced in its release notes.
- **The tracker** (`docs/parish-tracker.xlsx`, gitignored): every parish's
  track, dates, versions and repo, the release log, payments, and the setup
  and upgrade checklists. No passwords or tokens in it.

## Steps

1. Free repo: the extension point (foundation "Free repo changes").
2. Mua-an's own private copy; re-point or recreate its Vercel project; check
   the site, then stop the live site building from the public repo.
3. Make SJMV's copy private (check first).
4. PRO repo: `release-parish.mjs` with `status`, the backup step through
   `gh`, and the Releases-line output. Move `parishes.json` into it and add
   `track` to every parish.
5. Version in the admin footer (free repo, generic) and the PRO version from
   the PRO build.
6. PRO release notes and the What's new panel.
7. `deploy/04-releases.md` in the free repo: a short note that managed
   parishes are released from the PRO repo by the author, and that
   self-managed parishes follow the releases page as before.

## Testing

- REL-01 `release-parish status` lists demo, muaan, sjmv with their tracks,
  versions and `updatesUntil`.
- REL-02 `release-parish free` skips PRO parishes; `release-parish pro` skips
  free ones.
- REL-03 A parish past `updatesUntil` is refused without `--force`; a
  `frozen` one too.
- REL-04 A free managed parish 3 releases behind gets every missed
  migration, in order, in one run.
- REL-05 Upgrading a free test parish to PRO on the demo project: its
  households and members are unchanged, the PRO pages appear, and a later
  free release still runs clean.
- REL-06 After Mua-an's move, pushing the free `main` rebuilds only the free
  demo.
- REL-07 The admin footer shows the right versions on the free demo, the PRO
  demo and Mua-an.

## Open questions

- Is ₱3,000/year right for free managed updates after the first year?
- Every 3 months for free managed, or twice a year?
- Does `gh` on your computer have access to every parish's repository (to
  start backups)? If not, add your account as a collaborator, or keep the
  "did the backup run?" question.
