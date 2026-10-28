# Parish Members Registry & Website

A parish membership registry and website in one: parishioners register their household online, and parish staff manage households, members, sacraments, ministries, organizations, the census and the parish website from an admin panel.

Built with **React + Tailwind CSS**, talking straight to **Supabase** (Postgres + Auth). There is no separate backend server: Row Level Security policies and Postgres functions in `supabase/migrations/` decide who can read and write what.

## What it does

**For parishioners**
- Register the household online, with a reference number to keep, and check a registration or request by that number.
- Update their record during the parish census from a phone, with the code on their census form.
- Send requests from home: certificates, joining OCIA, the Anointing of the Sick, blood donor calls and prayer requests.
- Find the Mass and confession schedule, announcements, the bulletin, the events calendar, sacrament guides, each GKK's page, downloads and the church calendar, in Bisaya and easy to use on a phone.

**For the parish office**
- Every household and member in one searchable registry: sacraments, ministries, organizations, GKK and contact details, with possible duplicates flagged.
- New registrations wait in a queue to be verified. Requests (certificates, sacraments, prayers, blood calls) and census updates have their own queues, with a live bell and phone notifications.
- Reports, printable household sheets and CSV exports.
- The parish census: start one whenever the parish decides, print pre-filled forms by GKK, record answers or let families answer online, and compare results with the census before.
- The parish website's content (Mass schedule, sacrament guides, announcements, bulletin, events, downloads, office details), kept as drafts until staff publish.
- Organization charts drawn on a canvas and published to the website.
- Deleted records stay in a Trash for 30 days, and an activity log shows who changed what.

**For GKK leaders**
- Their own GKK's households and members, the census for their GKK, and their GKK's page, history, documents and officers, without seeing the rest of the parish.

**Staff access levels** (set under Settings → Staff; the database enforces them)

| Access | Can see | Can change |
|---|---|---|
| Full access | Everything | Everything (the only level that can delete, restore from the Trash, run the census and edit settings) |
| Read only | Every page except the Trash | Nothing |
| GKK leader | The households and members of one GKK | Those households and members, but can't delete them |
| Website & requests | The registry (to match certificate requests), the Parish Website and Requests | The Parish Website and Requests |
| Clergy | The registry, sacraments, census, reports and Requests; no blood types, exports, website, activity log or Trash | Sacrament verifications and Requests |

Staff admins always have full access.

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18, React Router, Tailwind CSS, Vite |
| Backend | Supabase: Postgres, Row Level Security, Auth, Postgres functions, three Edge Functions |
| Hosting | Vercel (the website) and Supabase (the database), on their free plans |
| Photos and backups | Cloudflare R2 |

## Project structure

```
client/                React + Tailwind frontend (Vite), with its own package.json
supabase/migrations/   Schema, RLS policies and Postgres functions, in order
supabase/functions/    Edge Functions: manage-staff (staff accounts), media-upload
                       (photos on R2) and notify-staff (phone notifications)
.github/workflows/     keep-alive.yml, backup.yml and checks.yml (see below)
docs/                  Setup notes: backups, email, photo storage, notifications
```

## Setting it up

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Link this folder to it and run every migration:
   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
3. Create the first staff admin: **Authentication → Users → Add user**, then, with that user's UUID, run this in the SQL editor:
   ```sql
   insert into profiles (id, name, role, is_admin, access)
   values ('<paste-uuid-here>', 'Full Name', 'Parish Secretary', true, 'full')
   on conflict (id) do update set name = excluded.name, role = excluded.role, is_admin = true, access = 'full';
   ```
   Staff admins then add everyone else from **Settings → Staff**.
4. **Authentication → Providers → Email → turn off "Allow new users to sign up."**
5. Deploy the Edge Functions to the parish's project (`ixfzajjtzuwelkjnssjt`). The scripts name the project, so they deploy there whichever project the CLI is linked to:

   | Function | What it does | Command |
   |---|---|---|
   | `manage-staff` | Staff accounts (Settings → Staff) | `npm run deploy:manage-staff` |
   | `media-upload` | Photos on Cloudflare R2 | `npm run deploy:media-upload` |
   | `notify-staff` | Phone notifications for staff | `npm run deploy:notify-staff` |
   | all three | | `npm run deploy:functions` |

   The long form is `npx supabase functions deploy <name> --project-ref ixfzajjtzuwelkjnssjt --use-api`, with `--no-verify-jwt` added for `notify-staff`: the database calls it and it checks staff logins itself.

   **Redeploy a function whenever its code under `supabase/functions/` changes**, and after a migration that says to.

### 2. The code

Put your project's details in, before the first deploy:

| What | Where |
|---|---|
| Supabase URL and anon key (also read by keep-alive) | `client/.env.production` |
| The live project's ref | `client/src/lib/database.js` and `LIVE_PROJECT_ID` in `supabase/functions/manage-staff/handler.js`. Every other project shows the demo banner |
| Photo bucket's r2.dev address | the `/media` rule in `client/vercel.json` |
| Website address | `Sitemap:` line in `client/public/robots.txt`, `DEFAULT_SITE_URL` in `client/src/lib/census.js`, `site_url` in `supabase/config.toml` |
| New households' town and province | `DEFAULT_ADDRESS` in `client/src/constants.js` |
| Logo and icons | `client/public/` |

The parish's name, logo, GKKs, ministries, organizations, Mass schedule, office address and map are saved in the admin panel under **Parish Config** and **Parish Website**, not in the code.

### 3. Run it locally

```bash
npm run install:all
cd client
cp .env.example .env.local     # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
cd ..
npm run dev
```

- Website and registration: `http://localhost:5173/`
- Admin panel: `http://localhost:5173/admin/login`

### 4. Put the website online

Import the repository into [Vercel](https://vercel.com) with **Root Directory set to `client`**. `client/vercel.json` handles the page routing and the `/media` photo proxy. Pushing to `main` redeploys.

Never put the Supabase `service_role` key, the database password or R2 secret keys in Vercel, in `client/` or in git.

### 5. Optional extras

| Feature | Guide |
|---|---|
| Photos (Blog Articles, events, GKKs) on Cloudflare R2 | [docs/media-storage.md](docs/media-storage.md) |
| "Forgot password?" emails through the parish Gmail | [docs/email-setup.md](docs/email-setup.md) |
| Phone notifications for staff | [docs/notifications.md](docs/notifications.md) |
| Weekly encrypted backups | [docs/backups.md](docs/backups.md) |

## Staying on the free tier: keep-alive and backups

Two GitHub Actions workflows in `.github/workflows/` cover what the free Supabase plan doesn't. A run that can't do its job fails, so GitHub emails the repository owner.

| Workflow | What it does | Setup |
|---|---|---|
| `keep-alive.yml` | Every 3 days, calls one tiny read-only function so the project never hits Supabase's 7-days-idle pause | None: it uses the address and key in `client/.env.production` |
| `backup.yml` | Every Sunday, dumps roles, schema and data, encrypts them with your passphrase (AES-256, `gpg`), stores the file in a private R2 bucket and keeps the newest 26 | Six repository secrets: see [docs/backups.md](docs/backups.md) |

`checks.yml` runs the tests, the linter and a full build on each push and pull request. All three can also be run by hand from the **Actions** tab. GitHub pauses scheduled workflows in a repository with no commits for 60 days; it emails the owner first, and one click re-enables them.

Keep the backup passphrase written down and offline: the backups can't be opened without it.

## Running a parish census

The **Census** page in the admin panel replaces the hand-filled census sheet.

1. **Start a census** (for example "2026 Census"). Only one can be open at a time.
2. **Print the forms** by GKK: one page per household, pre-filled with what the registry has on file.
3. **Record what comes back** from a household's **Record census**, or **let families do it online** at `<your site>/census` with the reference number and access code from their form. Nothing changes in the registry until staff review and approve the update under **Census → Online updates**.
4. **Close the census** when forms stop coming in. Members nobody confirmed show under the *Not confirmed in census* filter on the Members page.

## Available scripts

Run from the project root:

| Command | Description |
|---|---|
| `npm run install:all` | Install root and `client/` dependencies |
| `npm run dev` | Run the Vite client with hot reload |
| `npm run build` | Production build of the client |
| `npm run lint` | ESLint on the client |
| `npm test` | Run the client test suite |
| `npm run test:watch` | Client tests, watch mode |
| `npm run db:migrations` | Show which migrations the linked project has run |
| `npm run deploy:functions` | Deploy all three Edge Functions to the parish's project |
| `npm run deploy:manage-staff`, `deploy:media-upload`, `deploy:notify-staff` | Deploy one Edge Function to the parish's project |

## License and credit

MIT, with one added condition: copies and deployments keep the **"Built For Free by DaveenDev"** credit in the app, linked to the developer page (`/developer`) or to [daveendev.vercel.app](https://daveendev.vercel.app/). See [`LICENSE`](LICENSE). Please leave the credit in the website footer, the registration and census pages, the staff sign-in page and the admin panel as they are.

Built For Free by [DaveenDev](https://daveendev.vercel.app/).
