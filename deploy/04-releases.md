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

1. **Commit on `main`**, the migration with the code that uses it. Don't
   push yet. The scripts only send migrations and functions committed on
   `main`, so another session's unfinished file in the folder stops them.
2. **See what each parish still needs:**

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

5. **Push `main`**: both the live and demo websites rebuild. If GitHub has
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
| A migration fails on one parish | The ones before it have run there; the failed one isn't recorded. It's usually data that parish has and the demo hasn't. Don't edit the file if it ran elsewhere: fix that parish's data in its SQL Editor, or add a new migration that copes with it, then run the release again |
| The website broke after a release | Look at the database first: `npm run release:db -- status <parish>`. To go back, restore that parish's backup ([docs/backups.md](../docs/backups.md)) |
