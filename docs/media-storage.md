# Photo storage (Cloudflare R2) for Blog Articles, event covers and GKK history

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

   **No domain of your own (e.g. free Vercel on `*.vercel.app`)?** Keep the
   r2.dev subdomain enabled and let Vercel pass photos through: the `/media`
   rewrite in [`client/vercel.ts`](../client/vercel.ts) fetches
   `https://<site>/media/<key>` from the bucket's r2.dev address on Vercel's
   servers, which providers don't block. Use
   `https://<your-site>.vercel.app/media` as the Public URL.

   Each Vercel project picks its bucket with the **`MEDIA_ORIGIN`** environment
   variable (Vercel → project → **Settings → Environment Variables**): the
   bucket's r2.dev address, no trailing slash, e.g. `https://pub-xxxxxxxx.r2.dev`.
   Without it, the live site's bucket is used. A training or staging site on
   its own Cloudflare account sets `MEDIA_ORIGIN` to its testing bucket. The
   address is read when the site is built, so **redeploy** after adding or
   changing it.

   **Moving off r2.dev:** connect the custom domain to the bucket (or set up
   the Vercel `/media` rewrite above), run
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

Before saving, press **Test connection**. The media-upload function tries the
settings in the form, without saving them:

1. **Upload to R2:** it writes a tiny file to `_connection-test/` in the bucket.
   This checks the Account ID, the keys, the bucket name and write permission.
2. **Public URL:** it opens that file through the Public URL. This checks that
   the address shows this bucket. With the website's `/media` address, that
   site's `MEDIA_ORIGIN` on Vercel must be this bucket's r2.dev address, and the
   site redeployed since it was set.
3. **Clean up:** it deletes the test file. If it can't, the file is harmless.

Each step shows whether it passed and, if not, what to check. Saving after a
failed test asks you to confirm first.

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

To redeploy to the project this repo is linked to (`npx supabase link`), run
`npm run deploy:media-upload`. It bundles on Supabase's servers, so Docker isn't needed.

Or **Edge Functions → Deploy a new function**, name it `media-upload`, and paste in
[`index.ts`](../supabase/functions/media-upload/index.ts) and
[`handler.js`](../supabase/functions/media-upload/handler.js).

Then run [`0021_article_gallery.sql`](../supabase/migrations/0021_article_gallery.sql)
in the SQL editor (adds each article's gallery and the History / Kasaysayan tag).

## How photos are kept tidy

- Article photos are uploaded under `articles/YYYY/MM/<random>.jpg`, event covers
  (Parish Website → Events, after
  [`0028_event_cover_photo.sql`](../supabase/migrations/0028_event_cover_photo.sql))
  under `events/YYYY/MM/<random>.jpg`: the article or event may not have an ID yet.
- Once it's saved, they're renamed after its ID (after
  [`0029_photo_file_names.sql`](../supabase/migrations/0029_photo_file_names.sql)
  and redeploying the function), so the bucket reads well when you move files by hand:

  | What | File name |
  | --- | --- |
  | Article 101's cover | `articles/article101_cover.jpg` (a replacement: `article101_cover_2.jpg`, …) |
  | Article 101's gallery | `articles/article101_1.jpg`, `article101_2.jpg`, … |
  | Event 55's cover | `events/event55_cover.jpg` (a replacement: `event55_cover_2.jpg`, …) |
  | History page article 3's main or cover photo | `history/history3_cover.jpg` |
  | History page article 3's gallery | `history/history3_1.jpg`, `history3_2.jpg`, … |

  The ID shows as **#101** in the admin lists and on the article page. Numbers
  are never reused (photos are cached for a year, so a reused name would keep
  showing the old photo); after removing photo 3 the next one is 4, not 3, and
  the gallery order on the website is the order set in the editor, not the
  number. Photos saved before 0029 are renamed the next time their article or
  event is saved.
- Removing a photo from an article, replacing the cover, or deleting the article
  deletes the old file from R2. Photos uploaded in an editor that's then
  cancelled are deleted too.
- Event covers work the same way, except that **Duplicate** copies the cover to
  the new event, so a cover is only deleted from R2 once no event uses it.
- GKK history photos (Parish Config → Parish GKK → History, after
  [`0044_gkk_history_documents.sql`](../supabase/migrations/0044_gkk_history_documents.sql)
  and redeploying the function) go under `gkks/YYYY/MM/<random>.jpg` and keep that
  name. They're deleted the same way when taken off a saved history.
- The parish photo on the home page (Parish Config → Logo & photo) goes under
  `parish/YYYY/MM/<random>.jpg`; the old one is deleted when it's replaced or removed.
  Until the function is redeployed with the `parish` folder, the photo is saved
  inline in the database instead, as before.
- The History page (Parish Website → History, after
  [`0068_parish_history.sql`](../supabase/migrations/0068_parish_history.sql)
  and redeploying the function) works like the Blog Articles: photos go under
  `history/YYYY/MM/<random>.jpg`, are renamed as in the table above once saved,
  and are deleted when taken off or when their chapter is deleted.
- The function only deletes files under `articles/`, `events/`, `gkks/`, `org/`, `parish/` and `history/` in this bucket.
- A GKK's land titles and other documents are **not** kept on R2 (anyone with a
  photo's link can open it): they go in the private `gkk-documents` bucket of
  Supabase Storage, which 0044 creates.
- Free tier: 10 GB stored, no download (egress) fees.
