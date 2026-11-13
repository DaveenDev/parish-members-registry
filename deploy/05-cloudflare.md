# 05. Host the website on Cloudflare Workers (free)

The website can run on a free Cloudflare Worker at
`https://<name>.<account>.workers.dev`, in place of Vercel. The Worker serves
the site, passes `/media/*` through to the photo bucket (so providers that
block r2.dev still show photos), makes the `sitemap.xml` and the Messenger
link previews, and sends the security headers. Nothing in Supabase changes
except the addresses below.

The Worker's code is in [`client/worker/`](../client/worker/) and its settings
in [`client/wrangler.jsonc`](../client/wrangler.jsonc).

## 1. Settings in the code

In `client/wrangler.jsonc`:

- `name`: the Worker's name. It becomes the first part of the address.
- `MEDIA_ORIGIN`: the photo bucket's r2.dev address (the same one `vercel.json`
  uses for its `/media` rule).

The database address and anon key come from `client/.env.production` at build
time; nothing else needs setting in Cloudflare.

## 2. Connect the repository

Cloudflare dashboard → **Workers & Pages → Create → Import a repository**
(GitHub) → pick the repository, then:

| Setting | Value |
|---|---|
| Project name | the same as `name` in `wrangler.jsonc` |
| Production branch | `main` |
| Root directory | `client` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |

Save and deploy. Pushing to `main` redeploys. The address is shown on the
Worker's page, **Settings → Domains & Routes** (`workers.dev`).

To try it on your computer first: `cd client`, then `npm run cf:dev`.

## 3. Point everything at the new address

Use the address from step 2 (`https://<name>.<account>.workers.dev`, no
trailing slash).

1. **Supabase → Authentication → URL Configuration:** set **Site URL** to the
   address and add `<address>/**` to **Redirect URLs** (keep
   `http://localhost:5173/**`).
2. **R2 bucket → Settings → CORS policy:** put the address in
   `AllowedOrigins` (photo uploads are sent from the browser).
3. **Admin → Parish Config → Photo storage → Public URL:** `<address>/media`,
   then save. Saving rewrites the old address in articles, events, GKKs and
   the history pages.
4. **The photos Parish Config doesn't rewrite.** Run this once in the
   Supabase SQL editor, with `<old>` the previous Public URL (for example
   `https://<site>.vercel.app/media`) and `<new>` the new one
   (`https://<name>.<account>.workers.dev/media`), both without a trailing
   slash:

   ```sql
   do $$
   declare o text := '<old>/'; n text := '<new>/';
   begin
     update parish_settings set hero_image = replace(hero_image, o, n), logo = replace(logo, o, n);
     update org_nodes       set photo_url  = replace(photo_url,  o, n) where position(o in coalesce(photo_url, '')) > 0;
     update org_gkk_holders set photo_url  = replace(photo_url,  o, n) where position(o in coalesce(photo_url, '')) > 0;
   end $$;
   ```

5. **The code:** the `Sitemap:` line in `client/public/robots.txt`,
   `DEFAULT_SITE_URL` in `client/src/lib/census.js` and `site_url` in
   `supabase/config.toml`. Commit and push.

## 4. Check it

- `/` and a deep link such as `/pahibalo` open the site.
- `/media/<a photo's file name>` shows a photo from the bucket.
- `/sitemap.xml` lists the new address; `/robots.txt` has its `Sitemap:` line.
- A staff login and a password-reset email come back to the new address.
- Paste a page's link into Messenger: the preview shows its title and photo.

## 5. Retire Vercel

When the Worker works, delete the Vercel project (Settings → General → Delete
Project), or disconnect it from the repository, so two sites don't keep
building.

## Keeping a demo or test copy out of search engines

Add `"NOINDEX": "1"` to `vars` in `wrangler.jsonc` (the line is there,
commented out). Every page is then sent with `X-Robots-Tag: noindex`.
