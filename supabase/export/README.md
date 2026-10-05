# Moving the database to another Supabase project

| File | What | In git? |
|---|---|---|
| `00_reset_new_project.sql` | Empties the new project's public schema and staff logins. Refuses to run on a database that has members. | Yes |
| `01_schema.sql` | Tables, views, functions, triggers, RLS policies, grants (public schema) | No: a snapshot, regenerate it |
| `02_data.sql` | Every row, including `auth.users` + `auth.identities`, so staff keep their passwords | **No: member data + R2 keys** |
| `03_extras.sql` | auth.users trigger, `gkk-documents` bucket and its policies, morning-digest cron job, realtime | Yes |

Left out on purpose: login sessions and refresh tokens (everyone signs in again),
and `storage.objects` (the files themselves don't move with SQL).

## 1. Make the dump (from the current project)

The live DB is Postgres 17, so you need **pg_dump 17** (the PC has 16 in
`C:\Program Files\PostgreSQL\16`, which refuses). The CLI's `db dump` needs Docker.
Without Docker, take the script from `--dry-run` and run it yourself:

```bash
npx supabase db dump --linked --dry-run > dump_schema.sh
npx supabase db dump --linked --dry-run --data-only -x auth.sessions,auth.refresh_tokens,auth.mfa_amr_claims,auth.audit_log_entries,auth.flow_state,auth.one_time_tokens,storage.objects,storage.buckets,storage.prefixes > dump_data.sh
```

- Each dry run makes a new temporary login, so run its script before you make the next one.
- Delete the CLI's log lines above `#!/usr/bin/env bash`.
- Fix `--quote-all-identifier` to `--quote-all-identifiers`. pg_dump on Windows won't accept the short form.

## 2. Load it into the new project

1. Create the new project. **Use Postgres 17.** Then go to Database → Extensions and turn on **pg_cron** and **pg_net**.
2. Copy its connection string: **Connect → Session pooler** (port 5432).
3. Run (psql 16 is fine for loading):

```bash
psql --single-transaction -v ON_ERROR_STOP=1 -f 00_reset_new_project.sql -f 01_schema.sql -c "SET session_replication_role = replica" -f 02_data.sql -f 03_extras.sql -d "postgresql://postgres.NEWREF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres"
```

In the dashboard SQL editor instead, run the four files one at a time, in order.
`02_data.sql` sets `session_replication_role` itself.

Always start with `00_reset_new_project.sql`. The tables are created with plain
`CREATE TABLE`, so a leftover table stops the import with "already exists". It
won't silently keep an old shape (the cause of an earlier
`column "previous_ref_no" does not exist` error).

`session_replication_role = replica` stops triggers firing while the rows go in.
Without it, staff would get notifications, activity would be logged twice and
reference numbers would be renumbered.

## 3. Everything outside the database

- **Edge Functions:** `npx supabase functions deploy --project-ref NEWREF`.
  `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` are set for you. Copy any other secrets
  from the old project's Edge Functions → Secrets.
- **Auth settings:** Site URL (`https://olgqp-registry.vercel.app`), redirect URLs, SMTP.
  These are dashboard settings, not SQL.
- **GKK documents:** files in the `gkk-documents` bucket need downloading and re-uploading.
  Photos and media are on Cloudflare R2 (`media_storage_settings`), so they don't move.
- **Vercel:** set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the new project, then redeploy.
- **Push notifications:** `notify_config.function_url` corrects itself the first time
  `notify-staff` runs on the new project.
- **This repo:** `npx supabase link --project-ref NEWREF`.
