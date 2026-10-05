# Running migrations from GitHub

Supabase's GitHub integration can run new files in `supabase/migrations`
when a pull request merges into `main`, instead of pasting each one into the
SQL editor. It keeps track of what has run in its own migration history.
Every migration up to 0057 was run by hand, so that history starts empty:
mark them as already run once, before turning the integration on, or it
would try to run every migration again from `0001_init.sql` on the live
database.

You need the Supabase CLI (`npx supabase`, as for the other `npm run db:*`
scripts) and the database password (Supabase dashboard → Project Settings →
Database).

## One-time setup

1. **Keep "Deploy to production" off for now.** Supabase dashboard → Project
   Settings → Integrations → GitHub. If it's on, turn it off until step 5.

2. **Link the CLI to the live project** (once per computer):

   ```bash
   npx supabase login
   npx supabase link --project-ref rmlkowkbonbrtaqocsvo
   ```

   If `link` lists settings in `supabase/config.toml` that differ from the
   live project (Site URL, redirect URLs, sign-ups, email limits and so on),
   change `config.toml` to match the live values. The integration may apply
   that file to the project too, so it must not change anything there.

3. **Check the history is empty:**

   ```bash
   npm run db:migrations
   ```

   The REMOTE column should be blank for every row. If it isn't, stop and ask:
   someone has used `supabase db push` before.

4. **Mark 0001 to 0057 as already run.** This only writes the history; it
   runs none of them:

   ```bash
   npm run db:mark-applied
   ```

   Run `npm run db:migrations` again: 0001 to 0057 now show in both columns,
   and 00571 (Organization Structure, once `0057_org_chart.sql`) and 0058
   only under LOCAL, waiting to run.

   Mark either of those you already ran in the SQL editor too, for example
   both: `npx supabase migration repair --linked --status applied 00571 0058`.

5. **Turn the integration on:** Project Settings → Integrations → GitHub →
   Supabase directory `supabase`, production branch `main`, "Deploy to
   production" on. The next merge into `main` runs 0058 (and any later
   migration). `npx supabase db push` does the same from your computer.

## From now on

- Name a new migration with the next number: `0059_what_it_does.sql`.
  Two files with the same number stop the deploy (that's why 0019, 0020,
  0040 and 0057's second files are now `00191_…`, `00201_…`, `00401_…` and
  `00571_…`).
- Don't change a migration once it has run: add a new one.
- Don't run migrations in the SQL editor any more. If you have to, mark it
  afterwards with `npx supabase migration repair --linked --status applied <number>`,
  or the integration runs it a second time.
- `npm run db:migrations` shows what has run and what hasn't.
