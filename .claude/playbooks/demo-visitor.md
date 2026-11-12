# Role playbook — Demo visitor (another parish trying the app)

| | |
|---|---|
| Access level | `demo` (signs in as Full access on the demo site, never a staff admin) |
| Signs in at | `/admin/login` → **Login to Demo Site** |
| Account | the shared demo login (`VITE_DEMO_EMAIL` / `VITE_DEMO_PASSWORD` in `client/.env.local`) |
| Device | desktop (1440 × 900); one look at phone width |
| Time budget | about 35 minutes |
| Run tag | `PB<MMDD>DV` · findings `DV-1`, `DV-2` … |
| Result file | `results/demo-visitor-run-YYYY-MM-DD-result.md` |

Read [`_shared.md`](_shared.md) first. If the browser tool or dev
database are not set up yet, do §0 there (`npm run db:dev:up && npm run db:dev:seed`). This role needs the Demo access rule, which only applies on the real demo project, so run it against the shared demo site, not the dev database. If the **Login to Demo Site** button
isn't on `/admin/login`, the local app has no demo login configured: mark
the run `BLOCKED (no demo login in client/.env.local)` and ask the user,
or test the same page on the demo site's own address if the user names it.

## Persona

**Ms. Cecille Tan**, 45, parish secretary from another parish in the diocese.
Her parish priest heard about this app at a clergy meeting and asked her to
"try it and tell me if we should use it." She has 30 minutes, no training,
and is comparing it with "just using Google Sheets." She is deciding whether
to recommend it, and whether the PRO version is worth asking the council for.

## What the role should allow

Everything Full access does, on sample data, with the purple Demo banner
always visible. Never a staff admin (no Staff accounts or Platform
Integrations). Can't change the shared demo password.

## Missions

### DV-1 · From "what is this?" to signed in

- Start at `/` (the demo parish website). Without help, find how to get into
  the admin side and sign in with **Login to Demo Site**.
- **Watch for:** is it clear this is a demo of an app other parishes can use
  (not a real parish)? Does the banner explain that nothing here is real?

### DV-2 · The ten-minute tour

- Without a script: dashboard, households, members, census, reports. What
  does the app do well? What would her parish need that's missing?
- **Watch for:** sample data realistic enough to judge; empty or broken
  areas that make the demo look unfinished.

### DV-3 · Try the core job

- Register a family as staff (tagged `Tan PB<MMDD>DV`), find them again, run a
  report including them, delete them.

### DV-4 · Is PRO worth it?

- Find the PRO modules page and the PRO tip cards. Understand what's free and
  what's paid and how to ask.
- **Watch for:** clear prices / next step or a contact; PRO notes not getting
  in the way of the free features.

### DV-5 · "How would we set this up?"

- Look for setup help: is there a setup checklist, a way to see what she'd
  need (Supabase, hosting), or a contact for the developer (the Developer
  page on the public site)?

### DV-6 · What she must not do

- Try Settings → Staff and Platform Integrations; try to change the
  password in My Account / Personal Settings.
- **Expected:** staff and integrations unavailable; password change refused
  with a message that makes sense to a demo user.

### DV-7 · Phone look

- At 390 × 844, open the dashboard and one household. Would her GKK leaders
  manage on phones?

## Boundary checks

| Check | Expected |
|---|---|
| Demo banner on every admin page | always |
| Staff page, Platform Integrations | refused / absent |
| Change the shared password | refused |
| Anything indicating live data (`rmlkowkbonbrtaqocsvo` in network) | never |

## Cleanup

Delete the tagged family. Sign out.

## Extra for this role

End the result file with a short **"Would I recommend it?"** paragraph in
Cecille's voice: the honest pitch, the honest objections. It's the most
useful thing for promoting the app.
