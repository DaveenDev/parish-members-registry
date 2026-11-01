# 4. Releasing an update to every parish

Each parish has its own copy of the app: its own GitHub repository and
Vercel project (the website) and its own Supabase project (the database),
often on the parish's own accounts. The demo site is one more copy. An
update reaches them one at a time, **demo first**, and in each the
**database goes before the website**: pushing to GitHub rebuilds a site at
once, and a new website on an old database breaks.

The migrations in this repository's `supabase/migrations/` are the only
ones. Every parish runs the same files; each database keeps its own history
of which have run, so a parish that is behind gets every one it missed.

## Once per computer: the parishes file

`npm run release:db` reaches each database by its connection string, so it
works whatever Supabase account the project is on, and never uses
`supabase link`. The connection strings hold the database passwords, so they
live in `parishes.json` in the repository root, which git ignores. Record
each parish, **the demo site first**:

```bash
npm run parish -- add
```

It asks for a short name (what you type in the commands, e.g. `demo`,
`muaan`, `sjmv`), a label, the connection string (Supabase → the project →
**Connect** → *Session pooler*, pasted as it is, with `[YOUR-PASSWORD]` in
it) and the database password, which it doesn't show and fills in for you
(Project Settings → Database resets it). The project ref comes from the
connection string. Answer "n" to the backup question for the demo site,
which has no backups.

Last it asks for an **access token**, for deploying the Edge Functions
(`release:functions`, below). Leave it blank when this computer's own
`npx supabase login` is a member of that project; otherwise follow the
steps below.

### Access token for Edge Functions

The database password doesn't reach the Edge Functions: they go through the
Supabase **account** that owns the project. So each parish needs a
**personal access token** of that account:

- **Not** one of the project's API keys (anon, service_role), and not under
  the project's settings: it belongs to the account.
- **Not read-only.** Read-only is enough for `release:functions -- status`,
  but deploying uploads new code and is refused (403 / Unauthorized). If the
  page offers scopes, give it Edge Functions **read and write**; nothing
  else is needed (migrations use the connection string, not the token).
- One per account: when one account owns several projects (the demo site
  and Mua-an, say), the same token works for all of them.

To make one:

1. Sign in to supabase.com as the account that **owns** the parish's
   project (each parish may be a different account).
2. Open
   [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
   (or the avatar, top right → **Account preferences** → **Access Tokens**).
3. **Generate new token**, named for what it's for (e.g.
   `release-sjmvp`), with the access above. Copy it: it starts with `sbp_`
   and is shown only once.
4. Save it to that parish in `parishes.json` (it isn't shown as you paste):

   ```bash
   npm run parish -- token <name>
   ```

5. Check it reaches the project:

   ```bash
   npm run release:functions -- status <name>
   ```

The token is stored only in `parishes.json` on this computer (git ignores
it, as it does the database passwords) and the scripts mask it in their
output. When a token expires, leaks, or this computer is retired, revoke it
on the same page and repeat the steps with a new one; `npm run parish`
lists which parishes have a token ("deploy token").

### Check each parish connects

After adding a parish, check its database and its functions both answer:

```bash
npm run release:db -- status <name>
npm run release:functions -- status <name>
```

The script won't run a migration on any other parish until the **first** one
in the file has run every migration, so the demo site stays first. Add each
new parish once its database is set up (03 step 4); it goes at the end.
`parishes.example.json` shows the file's shape, to edit by hand.

### A database whose migrations were run by hand

`db push` runs whatever isn't in the database's **migration history**
(`supabase_migrations.schema_migrations`). A migration pasted into the SQL
Editor works, but isn't recorded there. So a database set up or kept up by
hand shows far more "to run" than it really needs (the demo site: all 116),
and the release fails on the first one that can't run twice, often 0001:

```
Applying migration 0001_init.sql...
ERROR: cannot drop columns from view (SQLSTATE 42P16)
```

Nothing is changed when that happens. Don't guess which migrations ran, and
don't mark them all as done: a migration skipped by hand (on both the demo
site and Mua-an, 0089 and 0106–0109 were) would never run. Instead:

1. **Check** which of the missing ones are in fact there. It's read-only:
   for each migration it looks for the tables, columns, views and functions
   that migration adds:

   ```bash
   npm run release:db -- check <name>
   ```

   Each is *there*, *NOT there*, *PARTLY there* (with what's missing), or
   *can't tell* (it only changes what an earlier one added). It ends with
   the last migration that is there with nothing missing before it.

2. **Record those as applied**, without running them. It checks again,
   refuses if any of them isn't fully there, lists them and asks you to type
   the parish's name:

   ```bash
   npm run release:db -- mark <name> <version>
   ```

   e.g. `npm run release:db -- mark demo 0088`. A range records only those:
   `npm run release:db -- mark demo 0094-0111` marks the ones still to run
   from 0094 to 0111. It warns if any still to run come before the range,
   since that leaves a gap (see below).

3. **Run the rest** as a normal release (`npm run release:db -- <name>`).
   It runs every migration after that one, including any that were also run
   by hand: from 0089 on they're all written to be safe to run again, so
   those just repeat harmlessly while the skipped ones finally run.

Mark only up to the **first** gap, as `check` suggests, never past it. A
history with a gap in the middle makes `db push` refuse ("numbered before the
last one this database ran"). Once a parish's history is complete, keep its
migrations going through `release:db` only, so it stays complete.

### Which project this folder is linked to

`npm run db:migrations` and a plain `npx supabase db push` use the project
this folder is linked to, which is each computer's own (git ignores
`supabase/.temp/`). See the parishes and which one is linked:

```bash
npm run parish
```

Link to one by its name, with the password from `parishes.json`:

```bash
npm run parish -- link muaan
```

Keep it linked to the live parish you work on most (Mua-an). It needs
`npx supabase login` with an account in that project's Supabase
organization. Releases don't depend on it.

## Rules for a migration

1. **Nothing parish-specific.** No GKK names, project refs, site addresses
   or bucket links: those belong in Parish Config. A migration that fills in
   data works it out from what that parish's database already holds.
2. **Add, don't break.** Add tables, columns and functions; change functions
   with `create or replace`. Don't rename or drop anything the website still
   uses. Removing it waits for a later release, once every parish runs the
   website that no longer needs it, because a parish's website can be a day
   or two behind its database.
3. **Never edit a migration once it has run anywhere**, the demo included.
   Fix it with a new one.
4. **The next free number**, as in
   [docs/github-migrations.md](../docs/github-migrations.md). With several
   sessions working at once, check the folder just before committing.

## Each release, in order

For each parish the order is always: **database, then Edge Functions,
then website**. The names below (`demo`, `muaan`, `sjmv`) are examples: use
the ones in your `parishes.json` (`npm run parish` lists them).

1. **Commit on `main`**, the migration with the code that uses it, and the
   release notes ([below](#release-notes-the-releases-page)). Don't push
   yet. The scripts only send migrations and functions committed on `main`,
   so another session's unfinished file in the folder stops them.
2. **See what each parish still needs** (far more than this release's new
   ones means its history is missing hand-run migrations: fix that first, as
   in [A database whose migrations were run by hand](#a-database-whose-migrations-were-run-by-hand)):

   ```bash
   npm run release:db -- status
   ```

   ```bash
   npm run release:functions -- status
   ```

   The first lists the migrations each database hasn't run. The second
   lists each project's functions; if one fails with 403, fix its token
   ([above](#access-token-for-edge-functions)) before going on.
3. **Demo site.** Its migrations, then its functions (only when
   `supabase/functions/` changed; deploying them again does no harm):

   ```bash
   npm run release:db -- demo
   ```

   ```bash
   npm run release:functions -- demo
   ```

   Then try the change on demo data (`npm run dev`, with
   `client/.env.local` on the demo project).
4. **Mua-an.** Run its backup (GitHub → this repository → Actions →
   Encrypted database backup → **Run workflow**) and wait for it to finish.
   Then:

   ```bash
   npm run release:db -- muaan
   ```

   ```bash
   npm run release:functions -- muaan
   ```

5. **Push `main`**: both the live and demo websites rebuild, and the
   releases page and its GitHub Release go out, so other parishes hear of
   it. If GitHub has
   commits this folder doesn't (another session or computer pushed),
   bring them in first:

   ```bash
   git pull --no-rebase
   ```

   ```bash
   git push
   ```

6. **SJMV, a day or two later**, once Mua-an has used the change without
   trouble. Its backup (GitHub → `SJMVparish/website` → Actions), then:

   ```bash
   npm run release:db -- sjmv
   ```

   ```bash
   npm run release:functions -- sjmv
   ```

   Then carry the code across and push it, as in
   [03-new-parish.md step 5](03-new-parish.md#step-5-keeping-the-copy-up-to-date).
7. **Every later parish**, the same as SJMV.

`npm run release:db -- all` goes through every parish in the file's order,
asking before each one. Doing them one at a time, with the website pushed in
between, keeps each parish's database and website close together.

For each parish the script shows what would run, asks whether the backup
ran, and runs nothing until you type the parish's name. It stops at the
first problem, and the parishes after it aren't touched.

### Edge Functions: `npm run release:functions`

The functions are the same for every parish (`manage-staff` names the demo
project, the only one allowing Demo access, not a parish), so they all go
from this folder, to each project in `parishes.json`, with its access token:

```bash
npm run release:functions -- status          # what each project has deployed
npm run release:functions -- demo            # all of them, to one parish
npm run release:functions -- muaan media-upload   # just one function
```

Like `release:db`, it only sends what is committed on `main`, asks you to
type the parish's name, and for any parish after the first asks whether
they were tried on the demo site. `notify-staff` gets `--no-verify-jwt`
from `supabase/config.toml`. Deploy a changed function to a parish right
after its migrations, before pushing its website. The `deploy:demo:*` and
`deploy:production:*` scripts still work for the demo site and Mua-an with
this computer's login.

## Release notes: the releases page

Parishes and developers who copied the repository follow its updates on the
releases page, **https://daveendev.github.io/parish-members-registry/**,
with an Atom feed (`feed.xml`) for feed readers. Each version is also a
GitHub Release, so **Watch → Custom → Releases** on the repository emails
them. Version 1.0.0 lists everything the registry does; each later one lists
only what changed.

Each release has one file, `releases/notes/<version>.md`. Write it when the
change is ready, before pushing:

1. **Choose the version**, from the last one on the page:
   - **patch** (1.0.**1**): fixes only;
   - **minor** (1.**1**.0): new features or changes, updated with the usual
     migrations, functions and code;
   - **major** (**2**.0.0): something a parish must do by hand beyond that
     (a new account or secret, a setting to change, a step in 03). Say what,
     at the top of the notes.

   Several commits can go in one release: write it when you push them.
2. **Start the notes**:

   ```bash
   npm run releases:new -- 1.1.0
   ```

   It fills in the date, the last migration, the Edge Functions changed since
   the last release, and the commits since then (in a comment, to work
   from).
3. **Write them** for the parish office and for whoever updates a copy:
   the title and one-sentence summary, then what's new, changed or fixed,
   in plain words. Replace every `<…>`; the build refuses to run with one
   left. Keep the header's `migrations` and `functions` right: the page
   tells each parish what to run from them.
4. **Check how it looks**:

   ```bash
   npm run releases:build
   ```

   then open `releases/_site/index.html` in a browser.
5. **Commit it** with the release and push `main`. The *Releases page*
   workflow (`.github/workflows/releases-site.yml`) publishes the page and
   makes the GitHub Release with its `v1.1.0` tag. A release already made
   isn't changed, so fix a mistake with the next one.

The workflow only runs in this repository (`DaveenDev/parish-members-registry`):
a parish's copy skips it. Once, in this repository: **Settings → Pages →
Build and deployment → Source: GitHub Actions**.

## Supabase's GitHub integration: leave it off

With it on, a project runs new migrations when its repository's `main`
changes, at the same moment Vercel rebuilds the website, so the database
can't go first, and each parish would need its own repository connected.
For every project: Project Settings → Integrations → GitHub → "Deploy to
production" **off**. The release script does the same job, in order.

## When something goes wrong

| Message | What to do |
|---|---|
| `couldn't check` with *password authentication failed* | The password in that `dbUrl` is wrong, or not percent-encoded |
| `release:functions` with *status 403* or *necessary privileges* | The access token (or, with none, this computer's `npx supabase login`) is for an account that isn't a member of that project. `npm run parish -- token <name>` with a token made while signed in as the account that owns it |
| `release:functions` with *Unauthorized* | The token was deleted or expired: make a new one and set it with `npm run parish -- token <name>` |
| `couldn't check` with *could not translate host name* or a timeout | Use the **Session pooler** string, not Direct connection. Or the project is paused: Supabase → the project → Restore |
| *numbered before the last one this database ran* | A migration was committed with a number lower than one already run there (two sessions at once). If it hasn't run anywhere yet, rename it to the next free number and commit |
| *still has migrations to run* | Run them on the demo site first, then go on |
| *Applying migration 0001_init.sql* (or another old one) then an error like *cannot drop columns from view* or *already exists* | Its migrations were run by hand, so its history is missing them: see [A database whose migrations were run by hand](#a-database-whose-migrations-were-run-by-hand) |
| A migration fails on one parish | The ones before it have run there; the failed one isn't recorded. It's usually data that parish has and the demo hasn't. Don't edit the file if it ran elsewhere: fix that parish's data in its SQL Editor, or add a new migration that copes with it, then run the release again |
| The website broke after a release | Look at the database first: `npm run release:db -- status <parish>`. To go back, restore that parish's backup ([docs/backups.md](../docs/backups.md)) |
