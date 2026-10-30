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
which has no backups. Then check it connects:

```bash
npm run release:db -- status <name>
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

1. **Commit on `main`**, the migration with the code that uses it. Don't
   push yet. The script only sends migrations committed on `main`, so
   another session's unfinished file in the folder stops it.
2. **See what each database still needs:**

   ```bash
   npm run release:db -- status
   ```

3. **Demo site.** Run them there and try the change on demo data
   (`npm run dev`, with `client/.env.local` on the demo project):

   ```bash
   npm run release:db -- demo
   ```

4. **Mua-an.** Run its backup (GitHub → this repository → Actions →
   Encrypted database backup → **Run workflow**) and wait for it to finish.
   Then:

   ```bash
   npm run release:db -- muaan
   ```

   Then push `main`: both the live and demo websites rebuild. A changed Edge
   Function goes to both too: `npm run deploy:demo:<function>`, then
   `npm run deploy:production:<function>`.
5. **SJMV, a day or two later**, once Mua-an has used the change without
   trouble. Its backup (GitHub → `SJMVparish/website` → Actions), then:

   ```bash
   npm run release:db -- sjmv
   ```

   Then carry the code across and push it, as in
   [03-new-parish.md step 5](03-new-parish.md#step-5-keeping-the-copy-up-to-date).
6. **Every later parish**, the same as SJMV.

`npm run release:db -- all` goes through every parish in the file's order,
asking before each one. Doing them one at a time, with the website pushed in
between, keeps each parish's database and website close together.

For each parish the script shows what would run, asks whether the backup
ran, and runs nothing until you type the parish's name. It stops at the
first problem, and the parishes after it aren't touched.

### Edge Functions: from each parish's own folder

A parish's copy of `manage-staff` names that parish's live project
(`LIVE_PROJECT_ID`), so deploy a parish's functions from its own folder, with
its own scripts (03 step 4), never from this one. Run `npx supabase login`
with an account that is a member of that parish's Supabase organization.

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
| `couldn't check` with *could not translate host name* or a timeout | Use the **Session pooler** string, not Direct connection. Or the project is paused: Supabase → the project → Restore |
| *numbered before the last one this database ran* | A migration was committed with a number lower than one already run there (two sessions at once). If it hasn't run anywhere yet, rename it to the next free number and commit |
| *still has migrations to run* | Run them on the demo site first, then go on |
| A migration fails on one parish | The ones before it have run there; the failed one isn't recorded. It's usually data that parish has and the demo hasn't. Don't edit the file if it ran elsewhere: fix that parish's data in its SQL Editor, or add a new migration that copes with it, then run the release again |
| The website broke after a release | Look at the database first: `npm run release:db -- status <parish>`. To go back, restore that parish's backup ([docs/backups.md](../docs/backups.md)) |
