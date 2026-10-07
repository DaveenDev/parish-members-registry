# Database backups (Cloudflare R2)

The free Supabase plan keeps no backups, and the registry holds parishioners'
personal data. Every Sunday, [`.github/workflows/backup.yml`](../.github/workflows/backup.yml)
dumps the whole database (roles, schema, data), encrypts it with a passphrase
only you hold, checks that it opens again, and stores it in a private
Cloudflare R2 bucket. The newest 26 backups (about half a year) are kept; older
ones are deleted. A backup is about a megabyte, far inside R2's free 10 GB.

Until it's set up, each Sunday's run fails and GitHub emails the repository
owner. The files people attach to a GKK (Parish Config → Parish GKK →
Documents) live in Supabase Storage, not the database, and aren't in the
backup; website photos are already in their own R2 bucket.

## 1. A private bucket and a token for it

1. Cloudflare dashboard → **R2 Object Storage** → **Create bucket**, e.g.
   `parish-backups`. Leave **Public access** off (no custom domain, no r2.dev
   address).
2. **R2 Object Storage** → **Manage API tokens** → **Create API token**:
   - Permissions: **Object Read & Write**
   - Specify bucket: **only** `parish-backups`
   - Create, then copy the **Access Key ID** and **Secret Access Key** (shown
     once).
3. Note the **Account ID** (R2 overview page, right-hand side).

Use a new token, not the photo storage one: this one can reach only the
backups, and the photo one only the photos.

## 2. The passphrase

Make a long passphrase (e.g. five or six random words) and keep it somewhere
safe **offline**, such as written down in the parish office safe. Without it
no backup can ever be opened; with it, anyone holding a backup file can read
the registry.

## 3. Repository secrets

GitHub → the repository → **Settings → Secrets and variables → Actions → New
repository secret**, one for each:

| Secret | Value |
|---|---|
| `SUPABASE_DB_URL` | Supabase → **Connect** → *Session pooler* connection string, with the database password filled in |
| `BACKUP_PASSPHRASE` | the passphrase from step 2 |
| `R2_ACCOUNT_ID` | the Account ID |
| `R2_ACCESS_KEY_ID` | the token's Access Key ID |
| `R2_SECRET_ACCESS_KEY` | the token's Secret Access Key |
| `R2_BACKUP_BUCKET` | the bucket name, e.g. `parish-backups` |

Then **Actions → Encrypted database backup → Run workflow** to make the first
backup now, and check that `database/parish-backup-<date>.tar.gz.gpg` appears
in the bucket.

## Restoring

1. Cloudflare → R2 → `parish-backups` → `database/` → download the backup.
2. Decrypt and unpack it (asks for the passphrase):

   ```bash
   gpg --decrypt parish-backup-YYYY-MM-DD.tar.gz.gpg | tar -xz
   ```

3. Load the three files, in this order, into a new Supabase project:

   ```bash
   psql "<new project's connection string>" -f roles.sql
   psql "<new project's connection string>" -f schema.sql
   psql "<new project's connection string>" -f data.sql
   ```

4. Point the website at the new project (`client/.env.production` and the
   Vercel environment variables) and redeploy the Edge Functions.
