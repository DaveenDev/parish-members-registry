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
2. Bucket → **Settings → Public access**: either connect a **custom domain**
   (e.g. `media.yourparish.org`, recommended) or enable the **r2.dev subdomain**.
   Note the public URL; it's `R2_PUBLIC_BASE_URL` below (no trailing slash).
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

## 3. Give them to the Edge Function

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
