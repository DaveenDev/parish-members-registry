# Photo storage (Cloudflare R2) for Blog Articles

Blog Article photos (Admin → Parish Website → Blog Articles) are stored in a
Cloudflare R2 bucket, not in the database. The admin never sees the R2 keys:
the `media-upload` Edge Function checks that the signed-in staff member may
edit the website, then hands the browser a 10-minute signed link to upload
one photo straight to R2. Photos are shrunk in the browser first (max 2000 px
wide, JPEG), so a phone photo is usually a few hundred KB.

Until this is set up, articles can still be written and published without
photos; picking a photo shows "Photo uploads aren't set up yet".

## 1. Create the bucket

1. Cloudflare dashboard → **R2 Object Storage** → **Create bucket**, e.g. `parish-media`.
2. Bucket → **Settings → Public access**: connect a **custom domain**
   (e.g. `media.yourparish.org`; the domain's DNS must be on Cloudflare).
   Note the public URL; it's `R2_PUBLIC_BASE_URL` below (no trailing slash).

   Avoid the **r2.dev subdomain** (`https://pub-….r2.dev`) for the live site:
   it's meant for testing, and some internet providers (several in the
   Philippines among them) block r2.dev outright, so visitors on them see
   broken photos even though the files are in the bucket.

   **Moving off r2.dev:** connect the custom domain to the bucket, run
   [`0027_media_base_url_move.sql`](../supabase/migrations/0027_media_base_url_move.sql),
   then put the new address in **Parish Config → Photo storage → Public URL** and
   save. The photos stay in the bucket; every article link that starts with
   the old address is rewritten to the new one.
3. Bucket → **Settings → CORS policy**, so browsers may upload:

   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:5173", "https://your-production-site.example"],
       "AllowedMethods": ["PUT"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Add every address the admin is opened from (each dev port too).

## 2. Create an API token

R2 → **Manage R2 API Tokens** → **Create API token**: permission **Object Read & Write**,
limited to this bucket. Copy the **Access Key ID** and **Secret Access Key** (shown once)
and your **Account ID** (R2 overview page).

## 3. Enter them under Parish Config

Run [`0025_media_storage_settings.sql`](../supabase/migrations/0025_media_storage_settings.sql)
in the SQL editor, then sign in as a **staff admin** and open
**Parish Config → Photo storage (Cloudflare R2)**. Fill in the Account ID, bucket
name, Access Key ID, Secret Access Key and public URL, and save. Changes apply
to the next upload; no redeploy needed.

The settings live in a table no browser can read (only the Edge Function, with
the service role key). The secret key is write-only: after saving, the form only
shows that one is saved; leave it blank to keep it, or type a new one to replace it.

### Or: Edge Function secrets

When the Parish Config settings aren't complete, the function uses its own secrets:

```bash
npx supabase secrets set --project-ref <your-project-ref> R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=parish-media R2_PUBLIC_BASE_URL=https://media.yourparish.org
```

Or in the Supabase dashboard: **Edge Functions → Secrets**. Never put these in
`client/` or commit them.

## 4. Deploy the function and run the migration

```bash
npx supabase functions deploy media-upload --project-ref <your-project-ref>
```

Or **Edge Functions → Deploy a new function**, name it `media-upload`, and paste in
[`index.ts`](../supabase/functions/media-upload/index.ts) and
[`handler.js`](../supabase/functions/media-upload/handler.js).

Then run [`0021_article_gallery.sql`](../supabase/migrations/0021_article_gallery.sql)
in the SQL editor (adds each article's gallery and the History / Kasaysayan tag).

## How photos are kept tidy

- Photos land under `articles/YYYY/MM/<random>.jpg`.
- Removing a photo from an article, replacing the cover, or deleting the article
  deletes the old file from R2. Photos uploaded in an editor that's then
  cancelled are deleted too.
- The function only deletes files under `articles/` in this bucket.
- Free tier: 10 GB stored, no download (egress) fees.
